// ---------------------------------------------------------------------------
// Bootstrap, router a tab e delega degli eventi.
// ---------------------------------------------------------------------------
import * as store from "./store.js";
import { prefs } from "./prefs.js";
import { esc, initials, colorOf, toast, drawSheet, closeSheet, sheet, captureSheetInputs, shareRoom, drawPage, closePage, page } from "./ui.js";
import { liveView } from "./views/live.js";
import { leaderboardView } from "./views/leaderboard.js";
import { historyView } from "./views/history.js";
import { setupView } from "./views/setup.js";
import { DEFAULTS } from "./config.js";
import { icon, wordmark } from "./icons.js";
import { applyTheme, watchSystemTheme } from "./theme.js";

const VIEWS = {
  partita:    { title: "Partita",    ico: "cards",   view: liveView },
  classifica: { title: "Classifica", ico: "crown",   view: leaderboardView },
  storico:    { title: "Storico",    ico: "history", view: historyView },
  setup:      { title: "Setup",      ico: "sliders", view: setupView }
};
const ORDER = ["partita", "classifica", "storico", "setup"];

let route = "partita";

function ctx() {
  const room = store.getRoom();
  return {
    room,
    status: store.getStatus(),
    me: prefs.get("me"),
    isScorekeeper: store.isScorekeeper()
  };
}

// --- chrome (topbar + tabbar) ------------------------------------------------
function renderTopbar(c) {
  const { room, status, me } = c;
  const meName = me && room.players[me] ? room.players[me].name : null;
  const dot = status.mode === "firebase" ? (status.online ? "on" : "off") : "local";
  const live = room.live && room.live.status === "playing";
  return `
    <div class="brand">
      ${wordmark("brand-mark")}
      <div class="brand-txt">
        <div class="room-name">${esc(room.meta.name || DEFAULTS.roomName)}</div>
        <div class="room-sub"><i class="dot-status ${dot}"></i>${status.mode === "firebase" ? (status.online ? "in diretta" : "riconnessione…") : "solo locale"}${live ? " · partita in corso" : ""}</div>
      </div>
    </div>
    <div class="top-actions">
      <button class="top-btn" data-action="share-top" aria-label="Condividi la stanza">${icon("link")}</button>
      <button class="me-btn" data-action="go-setup" aria-label="Chi sono">
      ${meName
        ? `<span class="avatar sm" style="background:${colorOf(meName)}">${initials(meName)}</span>`
        : `<span class="avatar sm ghost">${icon("user", "tiny")}</span>`}
      </button>
    </div>`;
}

function renderTabbar(c) {
  const badge = c.room.live && c.room.live.status === "playing";
  return ORDER.map((key) => `
    <a class="tab ${route === key ? "on" : ""}" href="#${key}">
      <span class="tab-ico">${icon(VIEWS[key].ico)}${key === "partita" && badge ? '<i class="live-dot"></i>' : ""}</span>
      <span class="tab-lbl">${VIEWS[key].title}</span>
    </a>`).join("");
}

// --- render ------------------------------------------------------------------
let scheduled = false;
export function render() {
  if (scheduled) return;
  scheduled = true;
  const draw = () => {
    scheduled = false;
    const c = ctx();
    const top = document.getElementById("topbar");
    const main = document.getElementById("view");
    const tabs = document.getElementById("tabbar");
    if (!top || !main || !tabs) return;
    top.innerHTML = renderTopbar(c);
    tabs.innerHTML = renderTabbar(c);
    main.className = "view-" + route;
    main.innerHTML = VIEWS[route].view.render(c);
  };
  // requestAnimationFrame non scatta se la pagina e' nascosta: fallback su timeout
  if (document.hidden) setTimeout(draw, 0);
  else requestAnimationFrame(draw);
}

// --- delega eventi -----------------------------------------------------------
function lookup(kind, name) {
  const current = VIEWS[route].view[kind];
  if (current && current[name]) return current[name];
  for (const key of ORDER) {
    const map = VIEWS[key].view[kind];
    if (map && map[name]) return map[name];
  }
  return null;
}

async function run(fn, el, ev) {
  let result;
  try {
    result = fn(ctx(), el, ev);
  } catch (err) {
    console.error(err);
    toast(err.message || "Errore", "warn");
    return;
  }
  if (result && typeof result.then === "function") {
    render();
    try { result = await result; } catch (err) {
      console.error(err);
      toast(err.message || "Errore", "warn");
      return;
    }
  }
  if (result === "sheet") drawSheet();
  else if (result === "page") drawPage();
  else if (result === "sheet-quiet") { /* niente redraw: preserva il focus */ }
  else { render(); if (sheet.state) drawSheet(); if (page.state) drawPage(); }
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const name = el.dataset.action;

  if (name === "sheet-close") { ev.preventDefault(); closeSheet(); return; }
  if (name === "go-setup") { ev.preventDefault(); location.hash = "#setup"; return; }
  if (name === "share-top") { ev.preventDefault(); shareRoom(); return; }
  if (name === "page-close") { ev.preventDefault(); closePage(); return; }

  const fn = lookup("actions", name);
  if (!fn) return;
  ev.preventDefault();
  run(fn, el, ev);
});

document.addEventListener("change", (ev) => {
  const el = ev.target.closest("[data-change]");
  if (!el) return;
  const fn = lookup("changes", el.dataset.change);
  if (fn) run(fn, el, ev);
});

document.addEventListener("input", (ev) => {
  const el = ev.target.closest("[data-change]");
  if (!el || el.tagName === "SELECT" || el.type === "file") return;
  // input "live" solo per la calcolatrice manuale: aggiorna l'anteprima senza redraw
  if (el.dataset.change === "calc-manual") {
    const fn = lookup("changes", "calc-manual");
    if (fn) fn(ctx(), el, ev);
  }
});

document.addEventListener("submit", (ev) => {
  const form = ev.target.closest("[data-submit]");
  if (!form) return;
  ev.preventDefault();
  const name = form.dataset.submit;
  if (name === "add-player") {
    const input = form.querySelector('input[name="name"]');
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    store.addPlayer(value).then(() => { toast(value + " aggiunto"); render(); });
  }
});

window.addEventListener("hashchange", () => {
  const key = location.hash.replace("#", "");
  route = VIEWS[key] ? key : "partita";
  closeSheet();
  closePage();
  render();
  window.scrollTo({ top: 0 });
});

// --- avvio -------------------------------------------------------------------
async function boot() {
  const params = new URLSearchParams(location.search);
  const roomId = params.get("room") || prefs.get("roomId") || DEFAULTS.roomId;

  applyTheme();
  watchSystemTheme();

  const key = location.hash.replace("#", "");
  route = VIEWS[key] ? key : "partita";

  store.subscribe(render);
  render();

  await store.init(roomId);
  render();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
