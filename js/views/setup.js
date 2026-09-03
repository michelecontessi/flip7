// ---------------------------------------------------------------------------
// Vista "Setup": giocatori, stanza, segnapunti, backup, stato connessione.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, toast, askText, askConfirm, askChoice, fmtDate, shareRoom, roomUrl, openSheet, closeSheet, sheet } from "../ui.js";
import { isFirebaseConfigured } from "../config.js";
import { icon } from "../icons.js";
import { applyTheme } from "../theme.js";
import { avatar, avatarHtml, playerAvatar, loadPhoto, centerCrop, cropToAvatarImage, openAvatarCropper, symbolSvg, AVATAR_SYMBOLS, AVATAR_COLORS } from "../avatar.js";

const localState = { showArchived: false };

export const setupView = {
  render(ctx) {
    const { room, status, me } = ctx;
    const players = Object.entries(room.players || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));
    const isOwner = store.isOwner();
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
              ${isOwner || id === me
                ? `<button class="ava-btn" data-action="avatar-edit" data-id="${id}" aria-label="Cambia l'avatar di ${esc(p.name)}">${avatar(id, p.name, "sm")}<i class="ava-pen">${icon("pencil")}</i></button>`
                : avatar(id, p.name, "sm")}
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

      ${me && room.players[me] ? `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Il tuo avatar</span></div>
        <div class="ava-row">
          ${avatar(me, room.players[me].name, "lg")}
          <div class="ava-row-txt"><b>${esc(room.players[me].name)}</b><small class="muted">${playerAvatar(me) ? "avatar personalizzato" : "iniziali sul colore del nome"}</small></div>
          <button class="btn small" data-action="avatar-edit" data-id="${me}">${icon("pencil", "tiny")} Cambia</button>
        </div>
        <p class="muted small">Un personaggio disegnato su un colore a scelta, oppure una tua foto: lo vedono tutti in classifica, nello storico e al tavolo online.</p>
      </section>` : ""}

      <section class="card">
        <div class="card-head">${icon("eye")}<span class="card-title">Aspetto</span></div>
        <label class="field inline">
          <span>Tema</span>
          <select data-change="theme" class="w-auto">
            <option value="auto" ${prefs.get("theme", "auto") === "auto" ? "selected" : ""}>Come il telefono</option>
            <option value="light" ${prefs.get("theme") === "light" ? "selected" : ""}>Chiaro</option>
            <option value="dark" ${prefs.get("theme") === "dark" ? "selected" : ""}>Scuro</option>
          </select>
        </label>
      </section>

      ${isOwner ? `
      <section class="card">
        <div class="card-head">${icon("sliders")}<span class="card-title">Stanza</span></div>
        <p class="muted small">Questa è la tua stanza fissa: si crea una volta sola e
          l'app si riapre sempre qui. I colleghi entrano con il tuo link, non devono
          creare niente. Questi dettagli li vedi solo tu.</p>
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
        <div class="btn-row">
          <button class="btn ghost" data-action="copy-link">${icon("link", "tiny")} Condividi stanza</button>
          <button class="btn ghost" data-action="switch-room">${icon("refresh", "tiny")} Cambia stanza</button>
        </div>
        ${status.error ? `<p class="err small">${esc(status.error)}</p>` : ""}
        ${!isFirebaseConfigured ? `<p class="warn-note small">Firebase non è configurato: i dati restano su questo dispositivo. Vedi <b>README.md</b> per attivare la sincronia live.</p>` : ""}
      </section>` : ""}

      ${status.mode === "firebase" && status.user ? `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Account</span></div>
        <div class="kv"><span>Accesso come</span><b>${esc(status.user.name)}</b></div>
        ${status.user.email ? `<div class="kv"><span>Email</span><span class="mono">${esc(status.user.email)}</span></div>` : ""}
        ${me && room.players[me] ? `<div class="kv"><span>Giochi come</span><b>${esc(room.players[me].name)}</b></div>` : ""}
        <button class="btn ghost small" data-action="google-signout">Esci dall'account</button>
      </section>` : ""}

      ${status.mode === "firebase" && isOwner ? `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Membri</span>
          <span class="count-pill ml-auto">${Object.keys(room.members || {}).length}</span></div>
        <p class="muted small">Solo i dispositivi approvati possono vedere la stanza e
          scrivere. Le richieste di chi apre il tuo link compaiono qui.</p>
        ${Object.entries(room.requests || {}).length ? `
          <div class="req-list">
            ${Object.entries(room.requests).map(([uid, r]) => `
              <div class="req-row">
                ${avatar(r.playerId, r.name, "sm")}
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
              ${avatar(boundId, m.name, "sm")}
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

      ${isOwner ? `
      <section class="card">
        <div class="card-head">${icon("download")}<span class="card-title">Backup</span></div>
        <p class="muted small">Scarica un file con giocatori e storico, o ricaricalo altrove.</p>
        <div class="btn-row">
          <button class="btn ghost" data-action="export-json">${icon("download", "tiny")} Esporta</button>
          <label class="btn ghost file">${icon("upload", "tiny")} Importa<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
        </div>
        <p class="muted small">Ultimo aggiornamento stanza: ${fmtDate(room.meta.createdAt)}</p>
      </section>` : ""}

      <p class="foot-note">Flip 7 Scoreboard · nessun costo, nessun dominio: gira su GitHub Pages + Firebase (piani gratuiti).</p>`;
  },

  actions: {
    "toggle-archived"() { localState.showArchived = !localState.showArchived; },

    // --- avatar: ognuno cambia il proprio, il proprietario quello di tutti ---
    "avatar-edit"(ctx, el) {
      const id = el.dataset.id;
      const p = (ctx.room.players || {})[id];
      if (!p) return;
      if (!(store.isOwner() || ctx.me === id)) return toast("Puoi cambiare solo il tuo avatar", "warn");
      openSheet({ type: "avatar", playerId: id, name: p.name, draft: playerAvatar(id), photo: null }, renderAvatarSheet);
    },
    "ava-sym"(ctx, el) {
      const s = sheet.state;
      s.draft = { sym: el.dataset.s, bg: (s.draft && s.draft.bg) || AVATAR_COLORS[0] };
      return "sheet";
    },
    "ava-color"(ctx, el) {
      const s = sheet.state;
      s.draft = { sym: (s.draft && s.draft.sym) || Object.keys(AVATAR_SYMBOLS)[0], bg: el.dataset.c };
      return "sheet";
    },
    "ava-reset"() { sheet.state.draft = null; sheet.state.photo = null; return "sheet"; },
    // ricentrare la foto gia' caricata: si riparte dall'originale, non dal francobollo
    async "ava-recenter"() {
      const s = sheet.state;
      if (!s.photo) return toast("Ricarica la foto per ricentrarla", "warn");
      const crop = await openAvatarCropper(s.photo.src, s.photo.crop);
      if (!crop || sheet.state !== s) return "sheet";
      s.photo.crop = crop;
      try { s.draft = { image: cropToAvatarImage(s.photo.src, crop) }; }
      catch (e) { toast(e.message || "Foto non leggibile", "warn"); }
      return "sheet";
    },
    async "ava-save"() {
      const s = sheet.state;
      try { await store.setPlayerAvatar(s.playerId, s.draft); }
      catch { return toast("Il database non accetta la modifica: puoi cambiare solo il tuo avatar", "warn"); }
      closeSheet();
      toast(s.draft ? "Avatar aggiornato" : "Tornate le iniziali");
    },

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
    async "ava-file"(ctx, el) {
      const file = el.files && el.files[0];
      el.value = "";
      const s = sheet.state;
      if (!file || !s) return;
      try {
        const src = await loadPhoto(file);
        const crop = await openAvatarCropper(src, centerCrop());
        if (!crop || sheet.state !== s) return "sheet";
        s.photo = { src, crop };
        s.draft = { image: cropToAvatarImage(src, crop) };
      } catch (e) { toast(e.message || "Foto non leggibile", "warn"); }
      return "sheet";
    },
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

// --- sheet: configuratore avatar --------------------------------------------
function renderAvatarSheet(s) {
  const a = s.draft;
  const sym = a && a.sym ? a.sym : null;
  const bg = (a && a.bg) || AVATAR_COLORS[0];
  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">Avatar di ${esc(s.name)}</div>
        <div class="sheet-sub">Un personaggio su un colore, oppure una foto</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <div class="ava-preview">
      ${avatarHtml(a, s.name, "xl")}
      <span class="ava-preview-name">${esc(s.name)}</span>
    </div>

    <div class="calc-section">
      <div class="calc-label"><span>Personaggio</span>${sym ? `<span>${esc(AVATAR_SYMBOLS[sym].name)}</span>` : ""}</div>
      <div class="ava-grid">
        ${Object.entries(AVATAR_SYMBOLS).map(([key, def]) => `<button class="ava-pick ${sym === key ? "on" : ""}" data-action="ava-sym" data-s="${key}" ${sym === key ? `style="background:${bg}"` : ""} aria-label="${esc(def.name)}" title="${esc(def.name)}">${symbolSvg(key)}</button>`).join("")}
      </div>
    </div>

    <div class="calc-section">
      <div class="calc-label"><span>Colore</span></div>
      <div class="ava-colors">
        ${AVATAR_COLORS.map((c) => `<button class="ava-color ${sym && bg === c ? "on" : ""}" data-action="ava-color" data-c="${c}" style="background:${c}" aria-label="Colore ${c}"></button>`).join("")}
      </div>
    </div>

    <div class="calc-section">
      <div class="calc-label"><span>Oppure una foto</span></div>
      <div class="ava-photo-row">
        <label class="btn ghost file">${icon("upload", "tiny")} ${a && a.image ? "Cambia foto" : "Carica una foto"}<input type="file" accept="image/*" data-change="ava-file" hidden></label>
        ${s.photo ? `<button class="btn ghost" data-action="ava-recenter">${icon("target", "tiny")} Ricentra</button>` : ""}
      </div>
      <p class="muted small">${s.photo
        ? "Puoi ricentrarla quante volte vuoi finché questo pannello resta aperto."
        : "La ritagli tu prima di salvarla, poi resta un francobollo: la vedono solo i membri della stanza."}</p>
    </div>

    <div class="sheet-actions">
      <button class="btn ghost" data-action="ava-reset" ${a ? "" : "disabled"}>Iniziali</button>
      <button class="btn primary" data-action="ava-save">${icon("check", "tiny")} Salva</button>
    </div>`;
}
