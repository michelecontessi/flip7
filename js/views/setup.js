// ---------------------------------------------------------------------------
// Vista "Setup": giocatori, stanza, segnapunti, backup, stato connessione.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, initials, colorOf, toast, askText, askConfirm, askChoice, fmtDate, shareRoom, roomUrl } from "../ui.js";
import { isFirebaseConfigured } from "../config.js";
import { icon } from "../icons.js";
import { applyTheme } from "../theme.js";

const localState = { showArchived: false };

export const setupView = {
  render(ctx) {
    const { room, status, me } = ctx;
    const players = Object.entries(room.players || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));
    const isOwner = status.mode !== "firebase" || Boolean(prefs.get("owner"));
    const visible = players.filter(([, p]) => localState.showArchived || !p.archived);
    const sk = room.control;

    const modeBadge = status.mode === "firebase"
      ? `<span class="badge ${status.online ? "ok" : "warn"}">${status.online ? "Online — sincronizzato" : "Riconnessione…"}</span>`
      : `<span class="badge warn">Modalità locale — solo questo dispositivo</span>`;

    return `
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
              ${isOwner ? `
              <button class="icon-btn" data-action="rename-player" data-id="${id}" aria-label="Rinomina">${icon("pencil")}</button>
              <button class="icon-btn" data-action="archive-player" data-id="${id}" aria-label="${p.archived ? "Riattiva" : "Archivia"}">${icon(p.archived ? "restore" : "archive")}</button>` : ""}
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
        <p class="muted small">Questa è la tua stanza fissa: si crea una volta sola e
          l'app si riapre sempre qui. I colleghi entrano con il tuo link, non devono
          creare niente.</p>
        <div class="kv"><span>Stato</span>${modeBadge}</div>
        <div class="kv"><span>Codice stanza</span><b class="mono">${esc(store.getRoomId())}</b></div>
        <div class="kv"><span>ID di questo dispositivo</span>
          <button class="link mono small" data-action="copy-uid" title="Copia">${esc(status.uid)}</button></div>
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

      ${status.mode === "firebase" && status.user ? `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Account</span></div>
        <div class="kv"><span>Accesso come</span><b>${esc(status.user.name)}</b></div>
        ${status.user.email ? `<div class="kv"><span>Email</span><span class="mono">${esc(status.user.email)}</span></div>` : ""}
        ${me && room.players[me] ? `<div class="kv"><span>Giochi come</span><b>${esc(room.players[me].name)}</b></div>` : ""}
        <button class="btn ghost small" data-action="google-signout">Esci dall'account</button>
      </section>` : ""}

      ${status.mode === "firebase" ? `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Membri</span>
          <span class="count-pill ml-auto">${Object.keys(room.members || {}).length}</span></div>
        <p class="muted small">Solo i dispositivi approvati possono vedere la stanza e
          scrivere. Le richieste di chi apre il tuo link compaiono qui.</p>
        ${Object.entries(room.requests || {}).length ? `
          <div class="req-list">
            ${Object.entries(room.requests).map(([uid, r]) => `
              <div class="req-row">
                <span class="avatar sm" style="background:${colorOf(r.name)}">${initials(r.name)}</span>
                <span class="pname">${esc(r.name || "Sconosciuto")}
                  <small class="req-sub">${r.email ? `<span class="mono">${esc(r.email)}</span> · ` : ""}${r.playerId && room.players[r.playerId] ? `entra come ${esc(room.players[r.playerId].name)}` : "vuole entrare"}</small></span>
                <button class="btn small primary" data-action="member-approve" data-id="${uid}">Approva</button>
                <button class="icon-btn danger" data-action="member-reject" data-id="${uid}" aria-label="Rifiuta">${icon("close")}</button>
              </div>`).join("")}
          </div>` : ""}
        <ul class="plist">
          ${Object.entries(room.members || {}).map(([uid, m]) => {
            const boundId = (room.bindings || {})[uid];
            const bound = boundId && room.players[boundId] ? room.players[boundId].name : null;
            return `
            <li>
              <span class="avatar sm" style="background:${colorOf(m.name)}">${initials(m.name)}</span>
              <span class="pname">${esc(m.name || "Membro")}${uid === status.uid ? '<span class="tag">tu</span>' : ""}
                <small class="req-sub">${m.email ? `<span class="mono">${esc(m.email)}</span> · ` : ""}${bound ? `gioca come ${esc(bound)}` : "nessun giocatore collegato"}</small></span>
              <button class="icon-btn" data-action="member-bind" data-id="${uid}" aria-label="Collega giocatore">${icon("pencil")}</button>
              ${uid === status.uid ? "" : `<button class="icon-btn danger" data-action="member-revoke" data-id="${uid}" aria-label="Revoca">${icon("close")}</button>`}
            </li>`;
          }).join("") || `<li class="muted small">Ancora nessun membro registrato.</li>`}
        </ul>
        <p class="muted small">Il collegamento account → giocatore lo scegli tu:
          ogni persona resterà per sempre il suo giocatore, su qualsiasi dispositivo.</p>
      </section>` : ""}

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
    "toggle-archived"() { localState.showArchived = !localState.showArchived; },

    async "rename-player"(ctx, el) {
      const id = el.dataset.id;
      const cur = (ctx.room.players[id] || {}).name || "";
      const name = await askText("Rinomina giocatore", { value: cur });
      if (!name || name === cur) return;
      try { await store.renamePlayer(id, name); }
      catch { toast("Solo il proprietario può modificare i giocatori", "warn"); }
    },
    async "archive-player"(ctx, el) {
      const id = el.dataset.id;
      try { await store.setPlayerArchived(id, !(ctx.room.players[id] || {}).archived); }
      catch { toast("Solo il proprietario può archiviare i giocatori", "warn"); }
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

    async "google-signout"(ctx) {
      const ok = await askConfirm("Uscire dall'account?", { message: "Per rientrare dovrai rifare l'accesso con Google.", confirmLabel: "Esci" });
      if (ok) await store.signOutUser();
    },

    async "copy-uid"(ctx) {
      try {
        await navigator.clipboard.writeText(ctx.status.uid);
        toast("ID copiato: incollalo nelle regole del database");
      } catch {
        await askText("ID di questo dispositivo", { value: ctx.status.uid, confirmLabel: "Chiudi" });
      }
    },
    async "member-approve"(ctx, el) {
      try {
        await store.approveRequest(el.dataset.id);
        toast("Approvato: ora vede la stanza");
      } catch { toast("Solo il proprietario può approvare", "warn"); }
    },
    async "member-reject"(ctx, el) {
      try { await store.rejectRequest(el.dataset.id); }
      catch { toast("Solo il proprietario può farlo", "warn"); }
    },
    async "member-bind"(ctx, el) {
      const uid = el.dataset.id;
      const roster = Object.entries(ctx.room.players || {}).filter(([, p]) => !p.archived)
        .map(([id, p]) => ({ id, label: p.name }));
      if (!roster.length) return toast("Prima aggiungi i giocatori", "warn");
      const pick = await askChoice(`Chi è ${((ctx.room.members || {})[uid] || {}).name || "questo account"}?`, roster);
      if (!pick) return;
      try { await store.bindMember(uid, pick); toast("Collegamento aggiornato"); }
      catch { toast("Solo il proprietario può cambiarlo", "warn"); }
    },
    async "member-revoke"(ctx, el) {
      const name = ((ctx.room.members || {})[el.dataset.id] || {}).name || "questo dispositivo";
      const ok = await askConfirm(`Revocare l'accesso a ${name}?`, { message: "Non vedrà più la stanza finché non lo riapprovi.", confirmLabel: "Revoca", danger: true });
      if (!ok) return;
      try { await store.revokeMember(el.dataset.id); toast("Accesso revocato"); }
      catch { toast("Solo il proprietario può farlo", "warn"); }
    },

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
