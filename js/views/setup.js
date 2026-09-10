// ---------------------------------------------------------------------------
// Vista "Setup": la vede solo chi gestisce la stanza (proprietario). Dentro
// ci sono le cose della STANZA: il nome, il link e l'obiettivo, i
// partecipanti (giocatori, richieste e account in un elenco solo), il backup
// e le cose avanzate. Le cose di ognuno (avatar e colore, avvisi, tema,
// account) stanno nel profilo, che si apre toccando la propria faccia in
// alto a destra: vedi views/profile.js.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, toast, askText, askConfirm, askChoice, fmtDate, shareRoom } from "../ui.js";
import { isFirebaseConfigured } from "../config.js";
import { icon } from "../icons.js";
import { avatar, avatarHtml } from "../avatar.js";
import { roomsActions, roomsSubmits } from "./rooms.js";
import { footNote } from "./profile.js";

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
    // chi non gestisce la stanza qui non arriva (la tab non c'e'); se ci
    // capita da un vecchio link, lo si manda alle sue impostazioni
    if (!store.isOwner()) {
      return `
        <section class="card empty-state">
          <div class="empty-ico">${icon("sliders")}</div>
          <h2 class="empty-title">Il Setup è di chi gestisce la stanza</h2>
          <p class="muted">Il tuo avatar, il colore, gli avvisi e il tema li trovi toccando la tua faccia in alto a destra.</p>
          <button class="btn primary" data-action="open-profile">${icon("user", "tiny")} Il tuo profilo</button>
        </section>`;
    }
    return renderOwner(ctx);
  },

  actions: {
    ...roomsActions,
    "toggle-archived"() { localState.showArchived = !localState.showArchived; },
    "toggle-advanced"() { localState.showAdvanced = !localState.showAdvanced; },

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

    async "copy-uid"(ctx) {
      try {
        await navigator.clipboard.writeText(ctx.status.uid);
        toast("ID copiato: incollalo nelle regole del database");
      } catch {
        await askText("ID di questo dispositivo", { value: ctx.status.uid, confirmLabel: "Chiudi" });
      }
    },

    // --- backup ---
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
// La stanza, i partecipanti, il backup; il resto sotto "Avanzate"
// ---------------------------------------------------------------------------
function renderOwner(ctx) {
  const { room, status } = ctx;
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
  const modeBadge = online
    ? `<span class="badge ${status.online ? "ok" : "warn"}">${status.online ? "Online — sincronizzata" : "Riconnessione…"}</span>`
    : `<span class="badge warn">Solo su questo dispositivo</span>`;

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
      <label class="field inline">
        <span>Obiettivo punti</span>
        <input type="number" min="10" step="10" inputmode="numeric" value="${room.meta.targetScore || 200}" data-change="room-target">
      </label>
      <div class="kv"><span>Stato</span>${modeBadge}</div>
      <div class="kv"><span>Codice stanza</span><b class="mono">${esc(store.getRoomId())}</b></div>
      <div class="kv"><span>Creata il</span><span>${fmtDate(room.meta.createdAt)}</span></div>
      <div class="kv"><span>In archivio</span><span>${gamesTxt(Object.keys(room.history || {}).length)} · ${players.length === 1 ? "1 giocatore" : `${players.length} giocatori`}</span></div>
      ${status.error ? `<p class="err small">${esc(status.error)}</p>` : ""}
      ${store.canRetryOnline() ? `<button class="btn ghost" data-action="retry-online">${icon("refresh", "tiny")} Riprova il collegamento</button>` : ""}
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
        : "Chi smette di giocare si archivia dal menu della riga: sparisce dalle liste dei nuovi tavoli ma resta in classifica col suo storico."}
        Il proprio avatar e il colore ognuno se li cambia dal suo profilo; da qui li cambi tu per tutti.</p>
    </section>

    <section class="card">
      <div class="card-head">${icon("download")}<span class="card-title">Backup</span></div>
      <p class="muted small">Una copia di tutta la stanza in un file: giocatori, storico delle partite e classifica.
        Tienila da parte ogni tanto. Importare un backup <b>aggiunge</b> quello che manca e non cancella niente.</p>
      <div class="btn-row">
        <button class="btn" data-action="export-json">${icon("download", "tiny")} Esporta backup</button>
        <label class="btn ghost file">${icon("upload", "tiny")} Importa<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
      </div>
    </section>

    ${advancedCard(room, status)}
    ${footNote()}`;
}

const gamesTxt = (n) => (n === 1 ? "1 partita" : `${n} partite`);

function advancedCard(room, status) {
  const open = localState.showAdvanced;
  const sk = room.control;
  return `
    <section class="card">
      <button class="card-head as-button" data-action="toggle-advanced" aria-expanded="${open}">
        ${icon("sliders")}<span class="card-title">Avanzate</span>
        <span class="chev ml-auto ${open ? "open" : ""}">${icon("chevron")}</span>
      </button>
      ${!open ? `<p class="muted small">Chi segna i punti dal vivo, l'ID di questo dispositivo, entrare con un codice.</p>` : `
      <div class="kv"><span>Segnapunti</span>
        ${store.isScorekeeper()
          ? `<span class="sk-inline you">${icon("check", "tiny")} Sei tu <button class="btn ghost small" data-action="sk-release">Lascia</button></span>`
          : sk && sk.uid
            ? `<span class="sk-inline">${esc(sk.name)} <button class="btn ghost small" data-action="sk-claim">Prendi</button></span>`
            : `<span class="sk-inline none">Nessuno <button class="btn small" data-action="sk-claim">Diventa segnapunti</button></span>`}
      </div>
      <div class="kv"><span>ID di questo dispositivo</span>
        <button class="link mono small" data-action="copy-uid" title="Copia">${esc(status.uid)}</button></div>
      <div class="btn-row">
        <button class="btn ghost" data-action="room-code">${icon("refresh", "tiny")} Entra con un codice</button>
      </div>
      ${!isFirebaseConfigured ? `<p class="warn-note small">Firebase non è configurato: i dati restano su questo dispositivo. Vedi <b>README.md</b> per attivare la sincronia live.</p>` : ""}`}
    </section>`;
}
