// ---------------------------------------------------------------------------
// Vista "Setup": giocatori, stanza, segnapunti, backup, stato connessione.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, initials, colorOf, toast, askText, askConfirm, fmtDate, shareRoom, roomUrl } from "../ui.js";
import { isFirebaseConfigured } from "../config.js";
import { icon } from "../icons.js";
import { applyTheme } from "../theme.js";

const localState = { showArchived: false };

export const setupView = {
  render(ctx) {
    const { room, status, me } = ctx;
    const players = Object.entries(room.players || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));
    const visible = players.filter(([, p]) => localState.showArchived || !p.archived);
    const sk = room.control;

    const modeBadge = status.mode === "firebase"
      ? `<span class="badge ${status.online ? "ok" : "warn"}">${status.online ? "Online — sincronizzato" : "Riconnessione…"}</span>`
      : `<span class="badge warn">Modalità locale — solo questo dispositivo</span>`;

    return `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Io sono</span></div>
        <div class="chips">
          ${players.filter(([, p]) => !p.archived).map(([id, p]) => `
            <button class="chip ${me === id ? "on" : ""}" data-action="set-me" data-id="${id}">
              <span class="avatar xs" style="background:${colorOf(p.name)}">${initials(p.name)}</span>${esc(p.name)}
            </button>`).join("") || `<span class="muted small">Aggiungi prima un giocatore</span>`}
          ${me ? `<button class="chip" data-action="clear-me">${icon("close", "tiny")} nessuno</button>` : ""}
        </div>
      </section>

      <section class="card">
        <div class="card-head">${icon("cards")}<span class="card-title">Giocatori</span>
          <span class="count-pill ml-auto">${visible.length}</span></div>
        <form class="add-row" data-submit="add-player">
          <input name="name" placeholder="Nome giocatore" autocomplete="off" maxlength="24">
          <button class="btn primary" type="submit">${icon("plus", "tiny")}</button>
        </form>
        <ul class="plist">
          ${visible.map(([id, p]) => `
            <li class="${p.archived ? "arch" : ""}">
              <span class="avatar sm" style="background:${colorOf(p.name)}">${initials(p.name)}</span>
              <span class="pname">${esc(p.name)}${p.archived ? '<span class="tag">archiviato</span>' : ""}</span>
              <button class="icon-btn" data-action="rename-player" data-id="${id}" aria-label="Rinomina">${icon("pencil")}</button>
              <button class="icon-btn" data-action="archive-player" data-id="${id}" aria-label="${p.archived ? "Riattiva" : "Archivia"}">${icon(p.archived ? "restore" : "archive")}</button>
            </li>`).join("") || `<li class="muted">Nessun giocatore</li>`}
        </ul>
        <button class="btn ghost small" data-action="toggle-archived">${localState.showArchived ? "Nascondi archiviati" : "Mostra archiviati"}</button>
        <p class="muted small">Chi smette di giocare si archivia: sparisce dalle liste dei nuovi tavoli ma resta in classifica con il suo storico.</p>
      </section>

      <section class="card">
        <div class="card-head">${icon("pen")}<span class="card-title">Segnapunti</span></div>
        <p class="muted small">Solo il segnapunti può inserire i punti. Gli altri vedono il tabellone in diretta.</p>
        ${store.isScorekeeper()
          ? `<div class="sk-state you">${icon("check", "tiny")} Sei tu</div><button class="btn ghost" data-action="sk-release">Lascia il ruolo</button>`
          : sk && sk.uid
            ? `<div class="sk-state">${esc(sk.name)}</div><button class="btn ghost" data-action="sk-claim">Prendi il controllo</button>`
            : `<div class="sk-state none">Nessuno</div><button class="btn primary" data-action="sk-claim">Diventa segnapunti</button>`}
      </section>

      <section class="card">
        <div class="card-head">${icon("sliders")}<span class="card-title">Stanza</span></div>
        <div class="kv"><span>Stato</span>${modeBadge}</div>
        <div class="kv"><span>Codice stanza</span><b>${esc(store.getRoomId())}</b></div>
        <div class="field-row">
          <label class="field">
            <span>Nome stanza</span>
            <input value="${esc(room.meta.name || "")}" data-change="room-name">
          </label>
          <label class="field">
            <span>Obiettivo punti</span>
            <input type="number" min="10" step="10" inputmode="numeric" value="${room.meta.targetScore || 200}" data-change="room-target">
          </label>
        </div>
        <label class="field inline">
          <span>Aspetto</span>
          <select data-change="theme" class="w-auto">
            <option value="auto" ${prefs.get("theme", "auto") === "auto" ? "selected" : ""}>Come il telefono</option>
            <option value="light" ${prefs.get("theme") === "light" ? "selected" : ""}>Chiaro</option>
            <option value="dark" ${prefs.get("theme") === "dark" ? "selected" : ""}>Scuro</option>
          </select>
        </label>
        <div class="btn-row">
          <button class="btn ghost" data-action="copy-link">${icon("link", "tiny")} Condividi stanza</button>
          <button class="btn ghost" data-action="switch-room">${icon("refresh", "tiny")} Cambia stanza</button>
        </div>
        ${status.error ? `<p class="err small">${esc(status.error)}</p>` : ""}
        ${!isFirebaseConfigured ? `<p class="warn-note small">Firebase non è configurato: i dati restano su questo dispositivo. Vedi <b>README.md</b> per attivare la sincronia live.</p>` : ""}
      </section>

      <section class="card">
        <div class="card-head">${icon("download")}<span class="card-title">Backup</span></div>
        <p class="muted small">Scarica un file con giocatori e storico, o ricaricalo altrove.</p>
        <div class="btn-row">
          <button class="btn ghost" data-action="export-json">${icon("download", "tiny")} Esporta</button>
          <label class="btn ghost file">${icon("upload", "tiny")} Importa<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
        </div>
        <p class="muted small">Ultimo aggiornamento stanza: ${fmtDate(room.meta.createdAt)}</p>
      </section>

      <p class="foot-note">Flip 7 Scoreboard · nessun costo, nessun dominio: gira su GitHub Pages + Firebase (piani gratuiti).</p>`;
  },

  actions: {
    "set-me"(ctx, el) { prefs.set("me", el.dataset.id); toast("Impostato"); },
    "clear-me"() { prefs.set("me", null); },
    "toggle-archived"() { localState.showArchived = !localState.showArchived; },

    async "rename-player"(ctx, el) {
      const id = el.dataset.id;
      const cur = (ctx.room.players[id] || {}).name || "";
      const name = await askText("Rinomina giocatore", { value: cur });
      if (name && name !== cur) await store.renamePlayer(id, name);
    },
    "archive-player"(ctx, el) {
      const id = el.dataset.id;
      return store.setPlayerArchived(id, !(ctx.room.players[id] || {}).archived);
    },

    async "sk-claim"(ctx) {
      const cur = ctx.room.control;
      if (cur && cur.uid) {
        const ok = await askConfirm("Prendere il controllo?", { message: `Ora il segnapunti è ${cur.name}.`, confirmLabel: "Prendi" });
        if (!ok) return;
      }
      const mine = ctx.me && ctx.room.players[ctx.me] ? ctx.room.players[ctx.me].name : null;
      const name = mine || await askText("Come ti chiami?", { value: "Segnapunti", confirmLabel: "Inizia" });
      if (!name) return;
      await store.claimScorekeeper(name);
      toast("Sei il segnapunti");
    },
    "sk-release"() { return store.releaseScorekeeper(); },

    "copy-link"() { return shareRoom(); },
    async "switch-room"() {
      const id = await askText("Codice stanza", { value: store.getRoomId(), message: "Chi usa lo stesso codice vede la stessa partita.", confirmLabel: "Entra" });
      if (id) store.switchRoom(id);
    },

    "export-json"() {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flip7-${store.getRoomId()}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast("Backup scaricato");
    }
  },

  changes: {
    "theme"(ctx, el) { prefs.set("theme", el.value); applyTheme(); },
    "room-name"(ctx, el) { return store.setRoomName(el.value); },
    "room-target"(ctx, el) { return store.setTargetScore(el.value); },
    async "import-json"(ctx, el) {
      const file = el.files && el.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = await store.importJSON(text, { merge: true });
        toast(`Importati ${res.players} giocatori e ${res.games} partite`);
      } catch (e) {
        toast("File non valido: " + e.message, "warn");
      }
      el.value = "";
    }
  }
};
