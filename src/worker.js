const SESSION_COOKIE = "delta_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Web Crypto currently caps PBKDF2 at 100,000 iterations.
const PBKDF2_ITERATIONS = 100_000;

const SUITS = ["hearts", "diamonds", "spades", "clubs"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const VALID_CARDS = new Set([
  ...SUITS.flatMap((suit) => RANKS.map((rank) => `${suit}-${rank}`)),
  "joker-black",
  "joker-red",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      if (request.method !== "GET" && !sameOrigin(request, url)) {
        return json({ error: "请求来源无效" }, 403);
      }

      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        return register(request, env, url);
      }
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return login(request, env, url);
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return logout(request, env, url);
      }
      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return currentUser(request, env);
      }
      if (url.pathname === "/api/config" && request.method === "GET") {
        if (!env.TURNSTILE_SITE_KEY) return json({ error: "验证服务未配置" }, 503);
        return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
      }
      if (url.pathname === "/api/collection" && request.method === "GET") {
        return getCollection(request, env);
      }
      if (url.pathname === "/api/collection" && request.method === "PUT") {
        return putCollection(request, env);
      }
      return json({ error: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "服务器暂时不可用" }, 500);
    }
  },
};

async function register(request, env, url) {
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = validatePassword(body.password);
  if (!username.ok) return json({ error: username.error }, 400);
  if (!password.ok) return json({ error: password.error }, 400);
  if (!await allowRequest(env.REGISTER_RATE_LIMITER, `register:${clientIp(request)}`)) {
    return rateLimited("注册操作过于频繁，请一分钟后再试");
  }
  if (!await verifyTurnstile(request, env, body.turnstileToken, url)) {
    return json({ error: "人机验证失败，请重试" }, 400);
  }

  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username.value).first();
  if (exists) return json({ error: "用户名已被使用" }, 409);

  const id = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await hashPassword(password.value, salt);
  const now = Date.now();

  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, username.value, passwordHash, salt, now),
      env.DB.prepare("INSERT INTO collections (user_id, owned_json, updated_at) VALUES (?, '[]', ?)")
        .bind(id, now),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: "用户名已被使用" }, 409);
    throw error;
  }

  return createSession(env, url, { id, username: username.value }, 201);
}

async function login(request, env, url) {
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  if (!username.ok || typeof body.password !== "string") {
    return json({ error: "用户名或密码错误" }, 401);
  }
  if (!await allowRequest(env.LOGIN_RATE_LIMITER, `login:${clientIp(request)}`)) {
    return rateLimited("登录操作过于频繁，请一分钟后再试");
  }
  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt FROM users WHERE username = ?",
  ).bind(username.value).first();
  if (!user) return json({ error: "用户名或密码错误" }, 401);

  const candidate = await hashPassword(body.password, user.password_salt);
  if (!timingSafeEqual(candidate, user.password_hash)) {
    return json({ error: "用户名或密码错误" }, 401);
  }
  return createSession(env, url, user);
}

async function logout(request, env, url) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function currentUser(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ authenticated: false }, 401);
  return json({ authenticated: true, user: { id: user.id, username: user.username } });
}

async function getCollection(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: "请先登录" }, 401);
  const row = await env.DB.prepare("SELECT owned_json, updated_at FROM collections WHERE user_id = ?")
    .bind(user.id).first();
  return json({
    owned: sanitizeCards(parseOwned(row?.owned_json)),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
  });
}

async function putCollection(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: "请先登录" }, 401);
  if (!await allowRequest(env.COLLECTION_WRITE_RATE_LIMITER, `collection:${user.id}`)) {
    return rateLimited("保存过于频繁，请稍后再试");
  }
  const body = await readJson(request);
  if (!Array.isArray(body.owned) || !body.owned.every((card) => typeof card === "string")) {
    return json({ error: "收藏数据格式错误" }, 400);
  }
  const owned = sanitizeCards(body.owned);
  if (owned.length !== new Set(body.owned).size || body.owned.some((card) => !VALID_CARDS.has(card))) {
    return json({ error: "收藏中包含未知牌面" }, 400);
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO collections (user_id, owned_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET owned_json = excluded.owned_json, updated_at = excluded.updated_at`,
  ).bind(user.id, JSON.stringify(owned), now).run();
  return json({ owned, updatedAt: new Date(now).toISOString() });
}

async function createSession(env, url, user, status = 200) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, user.id, now, now + SESSION_SECONDS * 1000).run();
  return json(
    { authenticated: true, user: { id: user.id, username: user.username } },
    status,
    { "Set-Cookie": sessionCookie(token, url) },
  );
}

async function authenticate(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT users.id, users.username
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  ).bind(await sha256(token), Date.now()).first();
}

function normalizeUsername(value) {
  if (typeof value !== "string") return { ok: false, error: "请输入用户名" };
  const username = value.trim();
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
    return { ok: false, error: "用户名需为 3–24 位文字、数字、下划线或短横线" };
  }
  return { ok: true, value: username };
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    return { ok: false, error: "密码长度需为 8–128 位" };
  }
  return { ok: true, value };
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: decodeBase64Url(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return encodeBase64Url(new Uint8Array(bits));
}

async function sha256(value) {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encode(value))));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function randomToken(bytes) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return encodeBase64Url(value);
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encode(value) {
  return new TextEncoder().encode(value);
}

function parseOwned(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeCards(cards) {
  return [...new Set(cards.filter((card) => VALID_CARDS.has(card)))].sort();
}

async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) throw new ApiError("请求格式错误", 415);
  const text = await request.text();
  if (text.length > 64 * 1024) throw new ApiError("请求内容过大", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("JSON 格式错误", 400);
  }
}

function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

async function allowRequest(limiter, key) {
  if (!limiter) return true;
  const result = await limiter.limit({ key });
  return result.success;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function rateLimited(message) {
  return json({ error: message }, 429, { "Retry-After": "60" });
}

async function verifyTurnstile(request, env, token, url) {
  if (!env.TURNSTILE_SECRET_KEY || typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  form.set("remoteip", clientIp(request));
  form.set("idempotency_key", crypto.randomUUID());

  let response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const result = await response.json();
  if (!result.success) return false;

  const isTestKey = env.TURNSTILE_SECRET_KEY.startsWith("1x00000000000000000000");
  if (!isTestKey && result.hostname !== url.hostname) return false;
  if (result.action && result.action !== "auth") return false;
  return true;
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function sessionCookie(token, url) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${url.protocol === "https:" ? "; Secure" : ""}`;
}

function clearSessionCookie(url) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`;
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
