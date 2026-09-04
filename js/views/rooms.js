// ---------------------------------------------------------------------------
// Le stanze: il foglio "Le tue stanze" per passare da una all'altra (per
// tutti) e la maschera "Nuova stanza" del proprietario: un nome, i
// partecipanti, e via. Ogni stanza e' un mondo a parte: giocatori,
// classifica, storico e tavoli online restano separati.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, toast, askText, askConfirm, openSheet, closeSheet, openPage, closePage, page, capturePageInputs } from "../ui.js";
import { icon } from "../icons.js";
import { avatarHtml, parseAvatar } from "../avatar.js";

// --- foglio: le tue stanze ----------------------------------------------------
export function openRoomsSheet() {
  openSheet({ type: "rooms" }, renderRoomsSheet);
}

function renderRoomsSheet() {
  const rooms = store.knownRooms();
  const owner = store.isOwner();
  const label = (r) => {
    if (r.current) return "sei qui";
    if (owner && r.requests) return `${r.requests} ${r.requests === 1 ? "richiesta in attesa" : "richieste in attesa"}`;
    return "tocca per entrare";
  };
  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">Le tue stanze</div>
        <div class="sheet-sub">Ogni stanza ha giocatori, classifica, storico e tavoli tutti suoi</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>
    <div class="room-list">
      ${rooms.map((r) => `
        <div class="room-row ${r.current ? "on" : ""}">
          <button class="room-go" data-action="room-go" data-id="${esc(r.id)}" ${r.current ? "disabled" : ""}>
            <span class="room-ico">${icon("door")}</span>
            <span class="room-txt"><b>${esc(r.name)}</b><small>${label(r)}</small></span>
            ${owner && r.requests && !r.current ? `<span class="room-badge">${r.requests}</span>` : ""}
          </button>
          ${r.current ? "" : `<button class="icon-btn" data-action="room-forget" data-id="${esc(r.id)}" data-name="${esc(r.name)}" aria-label="Togli dall'elenco">${icon("close")}</button>`}
        </div>`).join("") || `<p class="muted small">Nessuna stanza ancora.</p>`}
    </div>
    <div class="sheet-actions col">
      ${owner ? `<button class="btn primary" data-action="room-new">${icon("plus", "tiny")} Nuova stanza</button>` : ""}
      <button class="btn ghost" data-action="room-code">Ho un codice stanza</button>
    </div>`;
}

// --- pagina: nuova stanza ------------------------------------------------------
export function openNewRoomPage() {
  const people = store.getStatus().mode === "firebase" ? store.knownPeople() : [];
  openPage({ type: "room-new", name: "", players: [], invites: new Set(), target: 200, people }, renderNewRoomPage);
}

function renderNewRoomPage(s) {
  const invited = s.people.filter((p) => s.invites.has(p.uid)).length;
  return `
    <div class="page-top">
      <button class="nav-btn" data-action="page-close" aria-label="Indietro">${icon("arrowLeft")}</button>
      <span class="page-title">Nuova stanza</span>
    </div>

    <div class="page-body">
      <section class="card">
        <div class="card-head">${icon("door")}<span class="card-title">Come si chiama?</span></div>
        <input placeholder="es. Amici del giovedì" maxlength="40" autocomplete="off" value="${esc(s.name)}" data-bind="name">
        <p class="muted small">Una stanza per ogni gruppo: giocatori, classifica, storico e tavoli
          restano separati, e chi entra lo decidi tu.</p>
      </section>

      <section class="card">
        <div class="card-head">${icon("users")}<span class="card-title">Partecipanti</span>
          <span class="count-pill ml-auto">${s.players.length + invited}</span></div>
        <form class="add-row" data-submit="room-add-name">
          <input name="name" placeholder="Nome giocatore" autocomplete="off" maxlength="24" enterkeyhint="done">
          <button class="btn primary" type="submit" aria-label="Aggiungi">${icon("plus", "tiny")}</button>
        </form>
        ${s.players.length ? `
        <div class="chips">
          ${s.players.map((n, i) => `<span class="chip">${esc(n)}<button type="button" class="chip-x" data-action="room-del-name" data-i="${i}" aria-label="Togli ${esc(n)}">${icon("close", "tiny")}</button></span>`).join("")}
        </div>` : ""}
        ${s.people.length ? `
        <div class="calc-label"><span>Già nell'app</span><span>chi spunti entra senza chiedere</span></div>
        <ul class="plist">
          ${s.people.map((p) => `
            <li>
              <button class="pick-row ${s.invites.has(p.uid) ? "on" : ""}" data-action="room-toggle-invite" data-uid="${esc(p.uid)}">
                ${avatarHtml(parseAvatar(p.avatar), p.playerName || p.name, "sm")}
                <span class="pname">${esc(p.playerName || p.name)}
                  <small class="req-sub">${esc(p.email || p.name)} · ${esc(p.rooms.join(", "))}</small></span>
                <span class="pick-check">${icon("check", "tiny")}</span>
              </button>
            </li>`).join("")}
        </ul>` : ""}
        <p class="muted small">Chi non è qui entra con il link della stanza: chiede, e tu approvi.
          I nomi si possono aggiungere anche dopo, da Setup.</p>
      </section>

      <section class="card">
        <label class="field inline">
          <span>Obiettivo punti</span>
          <input type="number" min="10" step="10" inputmode="numeric" value="${esc(s.target)}" data-bind="target">
        </label>
      </section>

      <button class="btn primary big" data-action="room-create">${icon("check", "tiny")} Crea la stanza</button>
    </div>`;
}

function focusNameField() {
  requestAnimationFrame(() => {
    const el = document.querySelector('#page-root input[name="name"]');
    if (el) el.focus();
  });
}

// --- azioni (le importa la vista Setup, cosi' rispondono da qualsiasi tab) -----
export const roomsActions = {
  "rooms-menu"() { openRoomsSheet(); },
  "room-go"(ctx, el) { store.switchRoom(el.dataset.id); },
  async "room-forget"(ctx, el) {
    const ok = await askConfirm(`Togliere «${el.dataset.name}» dall'elenco?`, {
      message: "La stanza resta dov'è con tutti i suoi dati: per tornarci servirà di nuovo il link o il codice.",
      confirmLabel: "Togli"
    });
    if (ok) store.forgetRoom(el.dataset.id);
    return "sheet";
  },
  async "room-code"() {
    closeSheet();
    const code = await askText("Codice stanza", { placeholder: "es. ufficio-k7m2x9qp", message: "Lo trovi nel link che ti hanno mandato, dopo ?room=", confirmLabel: "Entra" });
    if (code) store.switchRoom(code);
  },
  "room-new"() {
    closeSheet();
    openNewRoomPage();
    return "page";
  },
  "room-del-name"(ctx, el) {
    capturePageInputs();
    page.state.players.splice(Number(el.dataset.i), 1);
    return "page";
  },
  "room-toggle-invite"(ctx, el) {
    capturePageInputs();
    const s = page.state;
    const uid = el.dataset.uid;
    if (s.invites.has(uid)) s.invites.delete(uid);
    else s.invites.add(uid);
    return "page";
  },
  "room-create"() {
    capturePageInputs();
    const s = page.state;
    const name = String(s.name || "").trim();
    if (!name) { toast("Dai un nome alla stanza", "warn"); return "page"; }
    const invites = s.people.filter((p) => s.invites.has(p.uid));
    closePage();
    store.createRoom({ name, players: s.players, invites, targetScore: Number(s.target) || 200 });
  }
};

export const roomsSubmits = {
  "room-add-name"(ctx, form) {
    capturePageInputs();
    const input = form.querySelector('input[name="name"]');
    const value = input.value.trim();
    if (!value) return "page";
    const s = page.state;
    if (!s.players.some((n) => n.toLowerCase() === value.toLowerCase())) s.players.push(value);
    input.value = "";
    focusNameField();
    return "page";
  }
};
