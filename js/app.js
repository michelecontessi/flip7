// ---------------------------------------------------------------------------
// Bootstrap, router a tab e delega degli eventi.
// ---------------------------------------------------------------------------
import * as store from "./store.js";
import { prefs } from "./prefs.js";
import { esc, initials, colorOf, toast, drawSheet, closeSheet, sheet, captureSheetInputs, shareRoom, roomUrl, drawPage, closePage, page, askText } from "./ui.js";
import { liveView } from "./views/live.js";
import { leaderboardView } from "./views/leaderboard.js";
import { historyView } from "./views/history.js";
import { setupView } from "./views/setup.js";
import { tableView } from "./views/table.js";
import { DEFAULTS } from "./config.js";
import { icon, wordmark, fanArt, googleG } from "./icons.js";
import { applyTheme, watchSystemTheme } from "./theme.js";

const VIEWS = {
  partita:    { title: "Partita",    ico: "cards",   view: liveView },
  tavolo:     { title: "Tavolo",     ico: "cardFan", view: tableView },
  classifica: { title: "Classifica", ico: "crown",   view: leaderboardView },
  storico:    { title: "Storico",    ico: "history", view: historyView },
  setup:      { title: "Setup",      ico: "sliders", view: setupView }
};
const ORDER = ["partita", "tavolo", "classifica", "storico", "setup"];

let route = "partita";

function ctx() {
  const room = store.getRoom();
  const status = store.getStatus();
  const bound = (room.bindings || {})[status.uid];
  return {
    room,
    status,
    // il giocatore "mio": il collegamento fisso account -> giocatore vince
    // sulla scelta locale (che resta come ripiego in modalita' locale)
    me: (bound && room.players[bound]) ? bound : prefs.get("me"),
    isScorekeeper: store.isScorekeeper()
  };
}

// --- chrome (topbar + tabbar) ------------------------------------------------
function renderTopbar(c) {
  const { room, status, me } = c;
  if (status.mode === "none") {
    return `<div class="brand">${wordmark("brand-mark")}</div>`;
  }
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
      <span class="tab-ico">${icon(VIEWS[key].ico)}${(key === "partita" && badge) || (key === "tavolo" && c.room.game && c.room.game.status === "playing") ? '<i class="live-dot"></i>' : ""}</span>
      <span class="tab-lbl">${VIEWS[key].title}</span>
    </a>`).join("");
}

// --- schermate di ingresso ---------------------------------------------------
// Benvenuto: nessuna stanza ancora. La stanza si crea UNA volta sola: il codice
// resta salvato sul dispositivo e nel link che condividi, per sempre.
function renderWelcome() {
  return `
    <section class="gate">
      ${fanArt()}
      ${wordmark("gate-mark")}
      <h1 class="gate-title">Segnapunti da ufficio</h1>
      <p class="gate-sub">La stanza si crea <b>una volta sola</b>: da lì in poi l'app
        si apre sempre lì, e i colleghi entrano con il tuo link.</p>

      <div class="card gate-card">
        <h2 class="section-title">Prima volta qui?</h2>
        <p class="muted small">Crea la stanza del tuo gruppo. Il codice è segreto e
          generato a caso: gira solo nel link che manderai tu.</p>
        <button class="btn primary big" data-action="create-room">Crea la stanza</button>
      </div>

      <div class="card gate-card">
        <h2 class="section-title">Ti hanno mandato un link?</h2>
        <p class="muted small">Aprilo e basta: entri direttamente nella stanza giusta.
          Se hai solo il codice, inseriscilo qui.</p>
        <button class="btn" data-action="join-room">Ho un codice stanza</button>
      </div>
    </section>`;
}

// Login con Google: identita' stabile (sopravvive a cambio telefono e rete).
function renderSignin() {
  return `
    <section class="gate">
      ${fanArt()}
      ${wordmark("gate-mark")}
      <h1 class="gate-title">Ciao! Chi sei?</h1>
      <p class="gate-sub">Qui dentro ci sono punteggi, classifiche e il tavolo online
        del gruppo: entra solo chi viene approvato. Accedi e chiedi di entrare.</p>
      <div class="card gate-card center">
        <button class="gbtn" data-action="google-signin">${googleG()} Continua con Google</button>
        <p class="hint">Un tocco, nessuna password: l'accesso ti segue anche se
          cambi telefono o rete.</p>
      </div>
    </section>`;
}

// Stanza protetta: questo dispositivo non e' (ancora) fra i membri.
function renderAccessGate(c) {
  const pendingName = prefs.get("requestName");
  return `
    <section class="gate">
      ${wordmark("gate-mark")}
      ${c.status.access === "pending" ? `
        <div class="card gate-card center">
          <div class="empty-ico">${icon("user")}</div>
          <h2 class="section-title">Richiesta inviata${pendingName ? ` a nome di ${esc(pendingName)}` : ""}</h2>
          <p class="muted small">Chi gestisce la stanza deve approvarti (lo fa dal suo
            telefono, in Setup → Membri). Appena lo fa, questa pagina si sblocca da sola.</p>
        </div>` : `
        <div class="card gate-card center">
          <div class="empty-ico">${icon("user")}</div>
          <h2 class="section-title">Stanza protetta</h2>
          <p class="muted small">Questa stanza fa entrare solo le persone approvate.
            Presentati: chi la gestisce vedrà la tua richiesta.</p>
          <button class="btn primary big" data-action="request-access">Chiedi di entrare</button>
        </div>`}
      <button class="ghost-btn" data-action="gate-switch">Non è la stanza giusta? Cambia stanza</button>
    </section>`;
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

    // schermate di ingresso: niente tab, solo il contenuto
    const gated = c.status.mode === "none"
      || (c.status.mode === "firebase" && c.status.ready && c.status.access !== "ok" && c.status.access !== "checking");
    if (gated) {
      top.innerHTML = renderTopbar(c);
      tabs.innerHTML = "";
      tabs.style.display = "none";
      main.className = "view-gate";
      main.innerHTML = c.status.mode === "none" ? renderWelcome()
        : c.status.access === "signin" ? renderSignin()
        : renderAccessGate(c);
      return;
    }
    tabs.style.display = "";
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
  if (result === "sheet") {
    if (sheet.patch) sheet.patch(sheet.state);
    else drawSheet();
  }
  else if (result === "sheet-full") drawSheet();
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
  if (name === "create-room") {
    ev.preventDefault();
    askText("Come si chiama il gruppo?", { value: "Ufficio", message: "Diventa il nome della stanza. Il codice segreto lo genero io.", confirmLabel: "Crea" })
      .then((name) => { if (name) store.createRoom(name); });
    return;
  }
  if (name === "join-room" || name === "gate-switch") {
    ev.preventDefault();
    askText("Codice stanza", { placeholder: "es. ufficio-k7m2x9qp", message: "Lo trovi nel link che ti hanno mandato, dopo ?room=", confirmLabel: "Entra" })
      .then((code) => { if (code) store.switchRoom(code); });
    return;
  }
  if (name === "google-signin") { ev.preventDefault(); store.signIn().then(() => render()); return; }
  if (name === "request-access") {
    ev.preventDefault();
    askText("Come ti chiami?", { placeholder: "Nome e cognome", message: "Chi gestisce la stanza vedrà questo nome nella richiesta.", confirmLabel: "Invia richiesta" })
      .then((name) => { if (name) store.requestAccess(name).then(() => render()); });
    return;
  }
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
