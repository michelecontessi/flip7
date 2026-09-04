// ---------------------------------------------------------------------------
// Vista "Setup". Due facce:
//   - per chi gestisce la stanza (proprietario): la stanza, i partecipanti
//     (giocatori, richieste e account in un elenco solo) e le cose avanzate;
//   - per tutti gli altri: solo il proprio profilo, l'aspetto e l'account.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, toast, askText, askConfirm, askChoice, fmtDate, shareRoom, openSheet, closeSheet, sheet } from "../ui.js";
import { isFirebaseConfigured } from "../config.js";
import { icon } from "../icons.js";
import { applyTheme } from "../theme.js";
import { avatar, avatarHtml, playerAvatar, loadPhoto, centerCrop, cropToAvatarImage, openAvatarCropper, symbolSvg, AVATAR_SYMBOLS, AVATAR_COLORS } from "../avatar.js";
import { roomsActions, roomsSubmits } from "./rooms.js";

const localState = { showArchived: false, showAdvanced: false };

/** uid dell'account collegato a ogni giocatore (pid -> uid). */
function accountsByPlayer(room) {
  const out = {};
  for (const [uid, pid] of Object.entries(room.bindings || {})) if (pid && !out[pid]) out[pid] = uid;
  return out;
}
const memberLabel = (m) => (m && (m.email || m.name)) || "account";

export const setupView = {
  render(ctx) {
    return store.isOwner() ? renderOwner(ctx) : renderMember(ctx);
  },

  actions: {
    ...roomsActions,
    "toggle-archived"() { localState.showArchived = !localState.showArchived; },
    "toggle-advanced"() { localState.showAdvanced = !localState.showAdvanced; },

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

    // --- la stanza ---
    async "room-rename"(ctx) {
      const cur = ctx.room.meta.name || "";
      const name = await askText("Nome della stanza", { value: cur, maxlength: 40 });
      if (!name || name === cur) return;
      try { await store.setRoomName(name); }
      catch { toast("Solo il proprietario può rinominare la stanza", "warn"); }
    },
    "copy-link"() { return shareRoom(); },

    // --- partecipanti: un menu per riga, invece di una fila di bottoni ---
    async "player-menu"(ctx, el) {
      const id = el.dataset.id;
      const p = (ctx.room.players || {})[id];
      if (!p) return;
      const uid = accountsByPlayer(ctx.room)[id];
      const member = uid ? (ctx.room.members || {})[uid] : null;
      const unbound = Object.entries(ctx.room.members || {}).filter(([u]) => !(ctx.room.bindings || {})[u] && u !== ctx.status.uid);
      const choices = [
        { id: "rename", label: "Rinomina" },
        { id: "archive", label: p.archived ? "Riattiva" : "Archivia" }
      ];
      if (member) choices.push({ id: "revoke", label: `Togli l'accesso a ${memberLabel(member)}` });
      else if (unbound.length) choices.push({ id: "bind", label: "Collega a un account…" });
      const pick = await askChoice(p.name, choices);
      if (!pick) return;
      try {
        if (pick === "rename") {
          const name = await askText("Rinomina giocatore", { value: p.name });
          if (name && name !== p.name) await store.renamePlayer(id, name);
        } else if (pick === "archive") {
          await store.setPlayerArchived(id, !p.archived);
        } else if (pick === "revoke") {
          const ok = await askConfirm(`Togliere l'accesso a ${p.name}?`, { message: "Non vedrà più questa stanza finché non lo riapprovi. Il giocatore e il suo storico restano.", confirmLabel: "Togli", danger: true });
          if (ok) { await store.revokeMember(uid); toast("Accesso tolto"); }
        } else if (pick === "bind") {
          const who = await askChoice(`Chi è ${p.name}?`, unbound.map(([u, m]) => ({ id: u, label: memberLabel(m) })));
          if (who) { await store.bindMember(who, id); toast("Collegamento fatto"); }
        }
      } catch { toast("Solo il proprietario può farlo", "warn"); }
    },
    async "member-menu"(ctx, el) {
      const uid = el.dataset.id;
      const m = (ctx.room.members || {})[uid];
      if (!m) return;
      const bound = new Set(Object.values(ctx.room.bindings || {}));
      const roster = Object.entries(ctx.room.players || {}).filter(([id, p]) => !p.archived && !bound.has(id))
        .map(([id, p]) => ({ id, label: p.name }));
      const pick = await askChoice(memberLabel(m), [
        { id: "bind", label: "Collega a un giocatore…" },
        { id: "revoke", label: "Revoca l'accesso" }
      ]);
      if (!pick) return;
      try {
        if (pick === "bind") {
          if (!roster.length) return toast("Prima aggiungi un giocatore libero", "warn");
          const pid = await askChoice(`Chi è ${m.name || memberLabel(m)}?`, roster);
          if (pid) { await store.bindMember(uid, pid); toast("Collegamento fatto"); }
        } else {
          const ok = await askConfirm(`Revocare l'accesso a ${memberLabel(m)}?`, { message: "Non vedrà più questa stanza finché non lo riapprovi.", confirmLabel: "Revoca", danger: true });
          if (ok) { await store.revokeMember(uid); toast("Accesso revocato"); }
        }
      } catch { toast("Solo il proprietario può farlo", "warn"); }
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
    // qualcuno che e' gia' in un'altra mia stanza entra qui senza passare dal link
    async "member-invite"(ctx) {
      const here = ctx.room.members || {};
      const people = store.knownPeople().filter((p) => !here[p.uid]);
      if (!people.length) return toast("Tutte le persone che conosci sono già qui", "warn");
      const uid = await askChoice("Chi vuoi far entrare?", people.map((p) => ({ id: p.uid, label: `${p.playerName || p.name}${p.email ? ` · ${p.email}` : ""}` })), { message: "Entra subito, con il suo giocatore già collegato: la stanza gli compare nell'elenco." });
      if (!uid) return;
      const person = people.find((p) => p.uid === uid);
      try { await store.inviteMember(person); toast(`${person.playerName || person.name} è dentro`); }
      catch (e) { toast(e.message || "Solo il proprietario può farlo", "warn"); }
    },

    // --- avanzate ---
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

    async "google-signout"() {
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

  submits: {
    ...roomsSubmits,
    async "add-player"(ctx, form) {
      const input = form.querySelector('input[name="name"]');
      const value = input.value.trim();
      if (!value) return "sheet-quiet";
      input.value = "";
      try { await store.addPlayer(value); toast(value + " aggiunto"); }
      catch { toast("Il database non ha accettato il nuovo giocatore", "warn"); }
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

// ---------------------------------------------------------------------------
// Pezzi comuni
// ---------------------------------------------------------------------------
function profileCard(room, me, { owner }) {
  if (!(me && room.players[me])) {
    return `
      <section class="card">
        <div class="card-head">${icon("user")}<span class="card-title">Il tuo profilo</span></div>
        <p class="muted small">Non hai ancora scelto chi sei: vai su <b>Partita</b> e tocca il tuo nome.
          ${owner ? "" : "Da quel momento il tuo account resta collegato a quel giocatore."}</p>
      </section>`;
  }
  return `
    <section class="card">
      <div class="card-head">${icon("user")}<span class="card-title">Il tuo profilo</span></div>
      <div class="ava-row">
        ${avatar(me, room.players[me].name, "lg")}
        <div class="ava-row-txt"><b>${esc(room.players[me].name)}</b><small class="muted">${playerAvatar(me) ? "avatar personalizzato" : "iniziali sul colore del nome"}</small></div>
        <button class="btn small" data-action="avatar-edit" data-id="${me}">${icon("pencil", "tiny")} Cambia</button>
      </div>
      <p class="muted small">Un personaggio disegnato su un colore a scelta, oppure una tua foto: lo vedono tutti in classifica, nello storico e al tavolo online.</p>
    </section>`;
}

function themeCard() {
  return `
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
    </section>`;
}

function accountCard(room, status, me) {
  if (!(status.mode === "firebase" && status.user)) return "";
  return `
    <section class="card">
      <div class="card-head">${icon("user")}<span class="card-title">Account</span></div>
      <div class="kv"><span>Accesso come</span><b>${esc(status.user.name)}</b></div>
      ${status.user.email ? `<div class="kv"><span>Email</span><span class="mono">${esc(status.user.email)}</span></div>` : ""}
      ${me && room.players[me] ? `<div class="kv"><span>Giochi come</span><b>${esc(room.players[me].name)}</b></div>` : ""}
      <button class="btn ghost small" data-action="google-signout">Esci dall'account</button>
    </section>`;
}

const footNote = `<p class="foot-note">Flip 7 Scoreboard · nessun costo, nessun dominio: gira su GitHub Pages + Firebase (piani gratuiti).</p>`;

// ---------------------------------------------------------------------------
// Chi non gestisce la stanza: il suo profilo e basta
// ---------------------------------------------------------------------------
function renderMember(ctx) {
  const { room, status, me } = ctx;
  return profileCard(room, me, { owner: false }) + themeCard() + accountCard(room, status, me) + footNote;
}

// ---------------------------------------------------------------------------
// Il proprietario: la stanza, i partecipanti, il resto sotto "Avanzate"
// ---------------------------------------------------------------------------
function renderOwner(ctx) {
  const { room, status, me } = ctx;
  const players = Object.entries(room.players || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));
  const archivedCount = players.filter(([, p]) => p.archived).length;
  const visible = players.filter(([, p]) => localState.showArchived || !p.archived);
  const byPlayer = accountsByPlayer(room);
  const members = room.members || {};
  const online = status.mode === "firebase";
  // account approvati ma non ancora legati a un giocatore (il proprietario escluso: e' lui)
  const loose = Object.entries(members).filter(([uid]) => !(room.bindings || {})[uid] && uid !== status.uid);
  const requests = Object.entries(room.requests || {});
  const canInvite = online && store.knownPeople().some((p) => !members[p.uid]);

  return `
    <section class="card">
      <div class="card-head">${icon("door")}<span class="card-title">${esc(room.meta.name || "Stanza")}</span>
        <button class="icon-btn ml-auto" data-action="room-rename" aria-label="Rinomina la stanza">${icon("pencil")}</button></div>
      <p class="muted small">Qui entra solo chi approvi tu. Ogni altra stanza ha giocatori, classifica,
        storico e tavoli online tutti suoi: niente si mescola.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="copy-link">${icon("link", "tiny")} Condividi</button>
        <button class="btn ghost" data-action="rooms-menu">${icon("door", "tiny")} Le tue stanze</button>
      </div>
      ${status.error ? `<p class="err small">${esc(status.error)}</p>` : ""}
    </section>

    <section class="card">
      <div class="card-head">${icon("users")}<span class="card-title">Partecipanti</span>
        <span class="count-pill ml-auto">${visible.length}</span></div>
      ${requests.length ? `
        <div class="req-list">
          ${requests.map(([uid, r]) => `
            <div class="req-row">
              ${avatar(r.playerId, r.name, "sm")}
              <span class="pname">${esc(r.name || "Sconosciuto")}
                <small class="req-sub">${r.email ? `<span class="mono">${esc(r.email)}</span> · ` : ""}${r.playerId && room.players[r.playerId] ? `entra come ${esc(room.players[r.playerId].name)}` : "vuole entrare"}</small></span>
              <button class="btn small primary" data-action="member-approve" data-id="${uid}">Approva</button>
              <button class="icon-btn danger" data-action="member-reject" data-id="${uid}" aria-label="Rifiuta">${icon("close")}</button>
            </div>`).join("")}
        </div>` : ""}
      <form class="add-row" data-submit="add-player">
        <input name="name" placeholder="Nome giocatore" autocomplete="off" maxlength="24" enterkeyhint="done">
        <button class="btn primary" type="submit" aria-label="Aggiungi">${icon("plus", "tiny")}</button>
      </form>
      <ul class="plist">
        ${visible.map(([id, p]) => {
          const uid = byPlayer[id];
          const m = uid ? members[uid] : null;
          const sub = m ? `entra con <span class="mono">${esc(memberLabel(m))}</span>${uid === status.uid ? " (tu)" : ""}`
            : online ? "nessun account collegato" : "";
          return `
          <li class="${p.archived ? "arch" : ""}">
            <button class="ava-btn" data-action="avatar-edit" data-id="${id}" aria-label="Cambia l'avatar di ${esc(p.name)}">${avatar(id, p.name, "sm")}<i class="ava-pen">${icon("pencil")}</i></button>
            <span class="pname">${esc(p.name)}${p.archived ? '<span class="tag">archiviato</span>' : ""}
              ${sub ? `<small class="req-sub">${sub}</small>` : ""}</span>
            <button class="icon-btn" data-action="player-menu" data-id="${id}" aria-label="Opzioni per ${esc(p.name)}">${icon("dots")}</button>
          </li>`;
        }).join("") || `<li class="muted small">Nessun partecipante: aggiungi i nomi qui sopra.</li>`}
        ${loose.map(([uid, m]) => `
          <li>
            ${avatarHtml(null, m.name || "?", "sm")}
            <span class="pname">${esc(m.name || "Membro")}
              <small class="req-sub">${m.email ? `<span class="mono">${esc(m.email)}</span> · ` : ""}approvato, ma non è ancora nessuno dei giocatori</small></span>
            <button class="icon-btn" data-action="member-menu" data-id="${uid}" aria-label="Opzioni">${icon("dots")}</button>
          </li>`).join("")}
      </ul>
      <div class="btn-row">
        ${canInvite ? `<button class="btn ghost small" data-action="member-invite">${icon("plus", "tiny")} Da un'altra stanza</button>` : ""}
        ${archivedCount ? `<button class="btn ghost small" data-action="toggle-archived">${localState.showArchived ? "Nascondi archiviati" : `Mostra archiviati (${archivedCount})`}</button>` : ""}
      </div>
      <p class="muted small">${online
        ? "Chi apre il tuo link chiede di entrare e sceglie chi è: la richiesta compare qui e la approvi tu. Chi smette di giocare si archivia dal menu della riga: resta in classifica col suo storico."
        : "Chi smette di giocare si archivia dal menu della riga: sparisce dalle liste dei nuovi tavoli ma resta in classifica col suo storico."}</p>
    </section>

    ${profileCard(room, me, { owner: true })}
    ${themeCard()}
    ${accountCard(room, status, me)}
    ${advancedCard(room, status)}
    ${footNote}`;
}

function advancedCard(room, status) {
  const open = localState.showAdvanced;
  const sk = room.control;
  const modeBadge = status.mode === "firebase"
    ? `<span class="badge ${status.online ? "ok" : "warn"}">${status.online ? "Online — sincronizzato" : "Riconnessione…"}</span>`
    : `<span class="badge warn">Modalità locale — solo questo dispositivo</span>`;
  return `
    <section class="card">
      <button class="card-head as-button" data-action="toggle-advanced" aria-expanded="${open}">
        ${icon("sliders")}<span class="card-title">Avanzate</span>
        <span class="chev ml-auto ${open ? "open" : ""}">${icon("chevron")}</span>
      </button>
      ${!open ? `<p class="muted small">Segnapunti, obiettivo punti, codice stanza, backup.</p>` : `
      <div class="kv"><span>Segnapunti</span>
        ${store.isScorekeeper()
          ? `<span class="sk-inline you">${icon("check", "tiny")} Sei tu <button class="btn ghost small" data-action="sk-release">Lascia</button></span>`
          : sk && sk.uid
            ? `<span class="sk-inline">${esc(sk.name)} <button class="btn ghost small" data-action="sk-claim">Prendi</button></span>`
            : `<span class="sk-inline none">Nessuno <button class="btn small" data-action="sk-claim">Diventa segnapunti</button></span>`}
      </div>
      <label class="field inline">
        <span>Obiettivo punti</span>
        <input type="number" min="10" step="10" inputmode="numeric" value="${room.meta.targetScore || 200}" data-change="room-target">
      </label>
      <div class="kv"><span>Stato</span>${modeBadge}</div>
      <div class="kv"><span>Codice stanza</span><b class="mono">${esc(store.getRoomId())}</b></div>
      <div class="kv"><span>ID di questo dispositivo</span>
        <button class="link mono small" data-action="copy-uid" title="Copia">${esc(status.uid)}</button></div>
      <div class="kv"><span>Stanza creata il</span><span>${fmtDate(room.meta.createdAt)}</span></div>
      <div class="btn-row">
        <button class="btn ghost" data-action="export-json">${icon("download", "tiny")} Esporta backup</button>
        <label class="btn ghost file">${icon("upload", "tiny")} Importa<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
        <button class="btn ghost" data-action="room-code">${icon("refresh", "tiny")} Entra con un codice</button>
      </div>
      ${!isFirebaseConfigured ? `<p class="warn-note small">Firebase non è configurato: i dati restano su questo dispositivo. Vedi <b>README.md</b> per attivare la sincronia live.</p>` : ""}`}
    </section>`;
}

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
