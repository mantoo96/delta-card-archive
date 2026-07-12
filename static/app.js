const SUITS = [
  { id: "hearts", name: "红桃", symbol: "♥", red: true },
  { id: "diamonds", name: "方片", symbol: "♦", red: true },
  { id: "spades", name: "黑桃", symbol: "♠", red: false },
  { id: "clubs", name: "梅花", symbol: "♣", red: false },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const JOKERS = [
  { id: "joker-black", name: "小王", display: "BLACK JOKER", red: false },
  { id: "joker-red", name: "大王", display: "RED JOKER", red: true },
];
const TOTAL = 54;

const state = {
  user: null,
  authMode: "login",
  owned: new Set(),
  filter: "all",
  search: "",
  sort: localStorage.getItem("card-sort") || "rank",
  saving: false,
  saveQueued: false,
};

const elements = {
  collection: document.querySelector("#collection"),
  emptyState: document.querySelector("#emptyState"),
  ownedCount: document.querySelector("#ownedCount"),
  progressBar: document.querySelector("#progressBar"),
  progressPercent: document.querySelector("#progressPercent"),
  missingText: document.querySelector("#missingText"),
  missingTabCount: document.querySelector("#missingTabCount"),
  ownedTabCount: document.querySelector("#ownedTabCount"),
  filterTabs: document.querySelector("#filterTabs"),
  searchInput: document.querySelector("#searchInput"),
  saveState: document.querySelector("#saveState"),
  toast: document.querySelector("#toast"),
  menuButton: document.querySelector("#menuButton"),
  dataMenu: document.querySelector("#dataMenu"),
  importInput: document.querySelector("#importInput"),
  sortSelect: document.querySelector("#sortSelect"),
  authScreen: document.querySelector("#authScreen"),
  authForm: document.querySelector("#authForm"),
  authUsername: document.querySelector("#authUsername"),
  authPassword: document.querySelector("#authPassword"),
  authError: document.querySelector("#authError"),
  authSubmit: document.querySelector("#authSubmit"),
  accountButton: document.querySelector("#accountButton"),
  accountName: document.querySelector("#accountName"),
};

function cardId(suit, rank) {
  return `${suit}-${rank}`;
}

function cardMatches(id, searchable) {
  const owned = state.owned.has(id);
  if (state.filter === "owned" && !owned) return false;
  if (state.filter === "missing" && owned) return false;
  if (!state.search) return true;
  const normalize = (value) => value.toLowerCase().replace(/\s+/g, "");
  return normalize(searchable).includes(normalize(state.search));
}

function cardButton({ id, rank, symbol, name, red = false, joker = false, display = "" }) {
  const owned = state.owned.has(id);
  const searchable = `${name}${rank || ""}${symbol || ""}${display} joker 王`;
  if (!cardMatches(id, searchable)) return "";

  const label = joker ? name : `${name}${rank}`;
  return `
    <button class="playing-card ${red ? "red" : ""} ${owned ? "owned" : ""} ${joker ? "joker" : ""}"
      type="button" data-card-id="${id}" aria-pressed="${owned}" aria-label="${label}，${owned ? "已拥有" : "未拥有"}">
      ${joker ? "" : `<span class="corner">${rank}<span>${symbol}</span></span>`}
      <span class="owned-check">✓</span>
      <span class="center">${joker ? display : symbol}</span>
      <span class="card-label">${owned ? "ARCHIVED / 已拥有" : "MISSING / 未拥有"}</span>
    </button>`;
}

function renderSuitSorted() {
  let visible = 0;
  const sections = SUITS.map((suit) => {
    const cards = RANKS.map((rank) => {
      const markup = cardButton({
        id: cardId(suit.id, rank), rank, symbol: suit.symbol, name: suit.name, red: suit.red,
      });
      if (markup) visible += 1;
      return markup;
    }).join("");
    if (!cards) return "";
    const suitOwned = RANKS.filter((rank) => state.owned.has(cardId(suit.id, rank))).length;
    return `
      <section class="suit-section">
        <div class="suit-heading ${suit.red ? "red" : ""}">
          <span class="suit-symbol">${suit.symbol}</span><h2>${suit.name}</h2>
          <span class="line"></span><small>${suitOwned}/13</small>
        </div>
        <div class="card-grid">${cards}</div>
      </section>`;
  });

  const jokerCards = JOKERS.map((joker) => {
    const markup = cardButton({ ...joker, joker: true });
    if (markup) visible += 1;
    return markup;
  }).join("");
  if (jokerCards) {
    const jokerOwned = JOKERS.filter((joker) => state.owned.has(joker.id)).length;
    sections.push(`
      <section class="suit-section">
        <div class="suit-heading">
          <span class="suit-symbol">★</span><h2>王牌</h2>
          <span class="line"></span><small>${jokerOwned}/2</small>
        </div>
        <div class="card-grid jokers">${jokerCards}</div>
      </section>`);
  }

  return { markup: sections.join(""), visible };
}

function renderRankSorted() {
  let visible = 0;
  const sections = RANKS.map((rank) => {
    const cards = SUITS.map((suit) => {
      const markup = cardButton({
        id: cardId(suit.id, rank), rank, symbol: suit.symbol, name: suit.name, red: suit.red,
      });
      if (markup) visible += 1;
      return markup;
    }).join("");
    if (!cards) return "";
    const rankOwned = SUITS.filter((suit) => state.owned.has(cardId(suit.id, rank))).length;
    return `
      <section class="rank-section">
        <div class="rank-heading">
          <strong>${rank}</strong><span class="line"></span><small>${rankOwned}/4</small>
        </div>
        <div class="card-grid rank-cards">${cards}</div>
      </section>`;
  });

  const jokerCards = JOKERS.map((joker) => {
    const markup = cardButton({ ...joker, joker: true });
    if (markup) visible += 1;
    return markup;
  }).join("");
  if (jokerCards) {
    const jokerOwned = JOKERS.filter((joker) => state.owned.has(joker.id)).length;
    sections.push(`
      <section class="rank-section">
        <div class="rank-heading">
          <strong>JOKER</strong><span class="line"></span><small>${jokerOwned}/2</small>
        </div>
        <div class="card-grid jokers">${jokerCards}</div>
      </section>`);
  }
  return { markup: sections.join(""), visible };
}

function render() {
  const result = state.sort === "rank" ? renderRankSorted() : renderSuitSorted();
  elements.collection.innerHTML = result.markup;
  const visible = result.visible;
  elements.emptyState.hidden = visible !== 0;
  renderProgress();
}

function renderProgress() {
  const owned = state.owned.size;
  const missing = TOTAL - owned;
  const percent = Math.round((owned / TOTAL) * 100);
  elements.ownedCount.textContent = owned;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressPercent.textContent = owned === TOTAL ? "收藏完成" : `${percent}% 已归档`;
  elements.missingText.textContent = missing ? `还差 ${missing} 张` : "全部集齐";
  elements.ownedTabCount.textContent = owned;
  elements.missingTabCount.textContent = missing;
}

function setConnection(status, text) {
  elements.saveState.className = `save-state ${status}`;
  elements.saveState.querySelector("span:last-child").textContent = text;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

async function loadCollection() {
  try {
    const response = await fetch("/api/collection", { cache: "no-store" });
    if (response.status === 401) return showAuth();
    if (!response.ok) throw new Error("load failed");
    const data = await response.json();
    state.owned = new Set(data.owned || []);
    setConnection("online", "已连接 · 自动保存");
    render();
  } catch (error) {
    setConnection("error", "连接失败");
    showToast("无法连接收藏服务器");
  }
}

function showAuth(message = "") {
  document.body.classList.add("auth-open");
  elements.authScreen.hidden = false;
  elements.authError.textContent = message;
  elements.authPassword.value = "";
  setTimeout(() => elements.authUsername.focus(), 0);
}

function hideAuth(user) {
  state.user = user;
  elements.accountName.textContent = user.username;
  elements.authScreen.hidden = true;
  document.body.classList.remove("auth-open");
}

async function bootstrap() {
  document.body.classList.add("auth-open");
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return showAuth();
    const data = await response.json();
    hideAuth(data.user);
    await loadCollection();
  } catch (error) {
    showAuth("无法连接服务器，请稍后重试");
  }
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    document.querySelectorAll("[data-auth-mode]").forEach((item) => item.classList.toggle("active", item === button));
    elements.authSubmit.textContent = state.authMode === "register" ? "创建账号" : "进入牌盒";
    elements.authPassword.autocomplete = state.authMode === "register" ? "new-password" : "current-password";
    elements.authError.textContent = "";
  });
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.authSubmit.disabled = true;
  elements.authError.textContent = "";
  try {
    const response = await fetch(`/api/auth/${state.authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: elements.authUsername.value, password: elements.authPassword.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失败");
    hideAuth(data.user);
    state.owned.clear();
    render();
    await loadCollection();
    showToast(state.authMode === "register" ? "账号创建成功" : "登录成功");
  } catch (error) {
    elements.authError.textContent = error.message;
  } finally {
    elements.authSubmit.disabled = false;
  }
});

elements.accountButton.addEventListener("click", async () => {
  if (!confirm(`确定退出账号 ${state.user?.username || ""} 吗？`)) return;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    state.user = null;
    state.owned.clear();
    render();
    showAuth();
  }
});

async function saveCollection() {
  if (state.saving) {
    state.saveQueued = true;
    return;
  }
  state.saving = true;
  state.saveQueued = false;
  setConnection("", "正在保存…");
  try {
    const response = await fetch("/api/collection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owned: [...state.owned] }),
    });
    if (!response.ok) throw new Error("save failed");
    setConnection("online", "已保存");
    setTimeout(() => setConnection("online", "已连接 · 自动保存"), 1000);
  } catch (error) {
    setConnection("error", "保存失败");
    showToast("保存失败，请检查服务器");
  } finally {
    state.saving = false;
    if (state.saveQueued) saveCollection();
  }
}

elements.collection.addEventListener("click", (event) => {
  const button = event.target.closest("[data-card-id]");
  if (!button) return;
  const id = button.dataset.cardId;
  if (state.owned.has(id)) {
    state.owned.delete(id);
    showToast("已移出收藏");
  } else {
    state.owned.add(id);
    showToast("已标记为拥有");
  }
  render();
  saveCollection();
});

elements.filterTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  elements.filterTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  render();
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  render();
});

elements.sortSelect.value = state.sort;
elements.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  localStorage.setItem("card-sort", state.sort);
  render();
  showToast(state.sort === "rank" ? "已按点数排序" : "已按花色排序");
});

elements.menuButton.addEventListener("click", () => {
  const willOpen = elements.dataMenu.hidden;
  elements.dataMenu.hidden = !willOpen;
  elements.menuButton.setAttribute("aria-expanded", String(willOpen));
});

document.addEventListener("click", (event) => {
  if (!elements.dataMenu.hidden && !event.target.closest(".controls")) {
    elements.dataMenu.hidden = true;
    elements.menuButton.setAttribute("aria-expanded", "false");
  }
});

document.querySelector("#markAllButton").addEventListener("click", () => {
  if (!confirm("确定要将 54 张牌全部标记为已拥有吗？")) return;
  state.owned = new Set([
    ...SUITS.flatMap((suit) => RANKS.map((rank) => cardId(suit.id, rank))),
    ...JOKERS.map((joker) => joker.id),
  ]);
  elements.dataMenu.hidden = true;
  render();
  saveCollection();
  showToast("已全部标记");
});

document.querySelector("#resetButton").addEventListener("click", () => {
  if (!confirm("确定清空全部收藏记录吗？此操作无法撤销。")) return;
  state.owned.clear();
  elements.dataMenu.hidden = true;
  render();
  saveCollection();
  showToast("记录已清空");
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), owned: [...state.owned] }, null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  link.download = `delta-card-collection-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  elements.dataMenu.hidden = true;
  showToast("收藏数据已导出");
});

document.querySelector("#importButton").addEventListener("click", () => elements.importInput.click());
elements.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.owned)) throw new Error("invalid format");
    state.owned = new Set(data.owned);
    render();
    await saveCollection();
    showToast("收藏数据已导入");
  } catch (error) {
    showToast("导入失败：文件格式不正确");
  } finally {
    event.target.value = "";
    elements.dataMenu.hidden = true;
  }
});

bootstrap();
