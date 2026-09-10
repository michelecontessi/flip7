// ---------------------------------------------------------------------------
// Il tuo profilo: si apre toccando la tua faccia in alto a destra, ed e' di
// tutti. Dentro ci sono le cose TUE: l'avatar (personaggio o iniziali, il
// colore, oppure una foto), gli avvisi del tavolo, il tema e l'account. Le
// cose della STANZA (partecipanti, backup, codice) stanno in Setup, che vede
// solo chi la gestisce.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, initials, toast, askText, askConfirm, openSheet, closeSheet, sheet, openPage, closePage } from "../ui.js";
import { APP_VERSION } from "../config.js";
import { NOTIFY_KEYS, wantsSound, wantsVibration, wantsPush, canPush, canVibrate, canSound, pushPermission, requestPush, unlockAudio, ding, buzz } from "../notify.js";
import { icon } from "../icons.js";
import { applyTheme } from "../theme.js";
import { avatar, avatarHtml, playerAvatar, loadPhoto, centerCrop, cropToAvatarImage, openAvatarCropper, symbolSvg, AVATAR_SYMBOLS, AVATAR_COLORS, INITIALS_SYM } from "../avatar.js";

export function openProfilePage() {
  openPage({ type: "profile" }, renderProfilePage);
}

/** Il foglio dell'avatar: ognuno apre il proprio, chi gestisce la stanza quello di tutti. */
export function openAvatarSheet(id) {
  const p = (store.getRoom().players || {})[id];
  if (!p) return false;
  if (!(store.isOwner() || store.currentPlayerId() === id)) { toast("Puoi cambiare solo il tuo avatar", "warn"); return false; }
  openSheet({ type: "avatar", playerId: id, name: p.name, draft: playerAvatar(id), photo: null }, renderAvatarSheet);
  return true;
}

/** Versione e aggiornamenti: in fondo al profilo e al Setup. */
export const footNote = () => `<p class="foot-note">Flip 7 Scoreboard · versione ${APP_VERSION} · nessun costo, nessun dominio: gira su GitHub Pages + Firebase (piani gratuiti).
  <button class="link" data-action="check-update">Controlla aggiornamenti</button></p>`;

// ---------------------------------------------------------------------------
// La pagina
// ---------------------------------------------------------------------------
function renderProfilePage() {
  const room = store.getRoom();
  const status = store.getStatus();
  const me = store.currentPlayerId();
  return `
    <div class="page-top">
      <button class="nav-btn" data-action="page-close" aria-label="Indietro">${icon("arrowLeft")}</button>
      <span class="page-title">Il tuo profilo</span>
    </div>
    <div class="page-body">
      ${profileHero(room, me)}
      ${alertsCard()}
      ${themeCard()}
      ${accountCard(room, status, me)}
      ${footNote()}
    </div>`;
}

function profileHero(room, me) {
  const p = me && room.players[me];
  if (!p) {
    return `
      <section class="profile-hero me-hero holo">
        <span class="holo-sweep" aria-hidden="true"></span>
        <span class="avatar xl ghost">${icon("user")}</span>
        <div class="profile-name">Chi sei?</div>
        <div class="profile-sub">Non hai ancora scelto il tuo giocatore: fallo dal Segnapunti, toccando il tuo nome.
          ${store.isOwner() ? "" : "Da quel momento il tuo account resta collegato a quel giocatore."}</div>
        <button class="btn primary" data-action="profile-pick-me">${icon("user", "tiny")} Scegli chi sei</button>
      </section>`;
  }
  const a = playerAvatar(me);
  const kind = !a ? "iniziali sul colore del nome"
    : a.image ? "la tua foto"
    : a.sym === INITIALS_SYM ? "iniziali sul tuo colore"
    : `${AVATAR_SYMBOLS[a.sym] ? AVATAR_SYMBOLS[a.sym].name : "personaggio"} sul tuo colore`;
  return `
    <section class="profile-hero me-hero holo">
      <span class="holo-sweep" aria-hidden="true"></span>
      <button class="ava-btn big" data-action="avatar-edit" data-id="${me}" aria-label="Cambia il tuo avatar">${avatar(me, p.name, "xl")}<i class="ava-pen">${icon("pencil")}</i></button>
      <div class="profile-name">${esc(p.name)}</div>
      <div class="profile-sub">${kind}</div>
      <div class="btn-row center">
        <button class="btn" data-action="avatar-edit" data-id="${me}">${icon("pencil", "tiny")} Avatar e colore</button>
        ${store.isOwner() ? `<button class="btn ghost" data-action="profile-rename">Rinomina</button>` : ""}
      </div>
      <p class="profile-note">Il tuo colore e il tuo avatar li vedono tutti: in classifica, nello storico, nei grafici e al tavolo online.${store.isOwner() ? "" : " Il nome lo cambia chi gestisce la stanza."}</p>
    </section>`;
}

function themeCard() {
  const cur = prefs.get("theme", "auto");
  const opt = (v, label) => `<button class="${cur === v ? "on" : ""}" data-action="profile-theme" data-v="${v}">${label}</button>`;
  return `
    <section class="card">
      <div class="card-head">${icon("eye")}<span class="card-title">Aspetto</span></div>
      <div class="mode-switch">${opt("auto", "Come il telefono")}${opt("light", "Chiaro")}${opt("dark", "Scuro")}</div>
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

/** Avvisi del tavolo online: suono, vibrazione e notifica quando tocca a te. */
function alertsCard() {
  const perm = pushPermission();
  return `
    <section class="card">
      <div class="card-head">${icon("bell")}<span class="card-title">Avvisi del tavolo</span></div>
      <p class="muted small">Quando a Gioca online tocca a te, l'app te lo dice: così si gioca anche una mano ogni tanto, senza restare a fissare lo schermo.</p>
      <label class="switch-row"><span>${icon("sound", "tiny")} Suono</span><input type="checkbox" data-change="notify-sound" ${wantsSound() && canSound() ? "checked" : ""} ${canSound() ? "" : "disabled"}></label>
      <label class="switch-row"><span>${icon("vibrate", "tiny")} Vibrazione</span><input type="checkbox" data-change="notify-vibrate" ${wantsVibration() && canVibrate() ? "checked" : ""} ${canVibrate() ? "" : "disabled"}></label>
      <label class="switch-row"><span>${icon("bell", "tiny")} Notifica a schermo spento</span><input type="checkbox" data-change="notify-push" ${wantsPush() && perm === "granted" ? "checked" : ""} ${canPush() && perm !== "denied" ? "" : "disabled"}></label>
      <p class="hint">${!canPush() ? "Le notifiche non sono disponibili in questo browser: su iPhone servono l'app aggiunta alla Home e iOS 16.4 o più recente."
        : perm === "denied" ? "Le notifiche sono bloccate dalle impostazioni del browser per questo sito."
        : "La notifica arriva solo quando l'app non è in vista; suono e vibrazione anche mentre la guardi."}${canVibrate() ? "" : " Questo dispositivo non vibra dal browser (gli iPhone non lo fanno): l'interruttore resta spento."}</p>
    </section>`;
}

// ---------------------------------------------------------------------------
// Azioni: valgono da qualsiasi schermata (le cerca app.js)
// ---------------------------------------------------------------------------
export const profileView = {
  actions: {
    "open-profile"() { openProfilePage(); return "page"; },
    "profile-pick-me"() { closePage(); location.hash = "#partita"; },
    "profile-theme"(ctx, el) { prefs.set("theme", el.dataset.v); applyTheme(); },
    async "profile-rename"(ctx) {
      const id = store.currentPlayerId();
      const p = id && ctx.room.players[id];
      if (!p) return;
      const name = await askText("Il tuo nome", { value: p.name, maxlength: 24 });
      if (!name || name === p.name) return;
      try { await store.renamePlayer(id, name); toast("Nome aggiornato"); }
      catch { toast("Il nome lo cambia chi gestisce la stanza", "warn"); }
    },

    // --- avatar: ognuno cambia il proprio, il proprietario quello di tutti ---
    "avatar-edit"(ctx, el) {
      if (openAvatarSheet(el.dataset.id)) return "sheet-full";
    },
    "ava-sym"(ctx, el) {
      const s = sheet.state;
      s.draft = { sym: el.dataset.s, bg: (s.draft && s.draft.bg) || AVATAR_COLORS[0] };
      return "sheet";
    },
    "ava-color"(ctx, el) {
      const s = sheet.state;
      // il colore vale per il personaggio scelto; senza, colora le iniziali
      s.draft = { sym: (s.draft && s.draft.sym) || INITIALS_SYM, bg: el.dataset.c };
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
      toast(s.draft ? "Avatar aggiornato" : "Tornate le iniziali sul colore del nome");
    },

    async "google-signout"() {
      const ok = await askConfirm("Uscire dall'account?", { message: "Per rientrare dovrai rifare l'accesso con Google.", confirmLabel: "Esci" });
      if (ok) { closePage(); await store.signOutUser(); }
    },
    async "check-update"() {
      toast("Controllo…");
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
        setTimeout(() => location.reload(), 900);
      } catch { location.reload(); }
    }
  },

  changes: {
    // il tocco sull'interruttore e' il gesto che serve per sbloccare l'audio:
    // si prova subito il suono, cosi' si sente che e' attivo davvero
    "notify-sound"(ctx, el) {
      prefs.set(NOTIFY_KEYS.sound, el.checked);
      if (!el.checked) return toast("Suono spento");
      unlockAudio();
      ding("turn");
      toast(canSound() ? "Suono attivo: lo senti quando tocca a te" : "Questo browser non sa produrre suoni", canSound() ? "info" : "warn");
    },
    "notify-vibrate"(ctx, el) {
      prefs.set(NOTIFY_KEYS.vibrate, el.checked);
      if (!el.checked) return toast("Vibrazione spenta");
      buzz();
      toast(canVibrate() ? "Vibrazione attiva: la senti quando tocca a te" : "Questo dispositivo non vibra dal browser", canVibrate() ? "info" : "warn");
    },
    async "notify-push"(ctx, el) {
      if (!el.checked) { prefs.set(NOTIFY_KEYS.push, false); return; }
      const res = await requestPush();
      if (res === "granted") { prefs.set(NOTIFY_KEYS.push, true); toast("Notifiche attive: ti avviso quando tocca a te"); }
      else { prefs.set(NOTIFY_KEYS.push, false); toast(res === "unsupported" ? "Questo browser non ha le notifiche (su iPhone servono l'app in Home e iOS 16.4+)" : "Permesso negato: si cambia dalle impostazioni del browser", "warn"); }
    },
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
    }
  }
};

// --- sheet: configuratore avatar --------------------------------------------
function renderAvatarSheet(s) {
  const a = s.draft;
  const sym = a && a.sym ? a.sym : null;
  const bg = (a && a.bg) || AVATAR_COLORS[0];
  const symName = sym === INITIALS_SYM ? "Iniziali" : sym && AVATAR_SYMBOLS[sym] ? AVATAR_SYMBOLS[sym].name : "";
  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">Avatar di ${esc(s.name)}</div>
        <div class="sheet-sub">Le iniziali o un personaggio, sul colore che vuoi; oppure una foto</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <div class="ava-preview">
      ${avatarHtml(a, s.name, "xl")}
      <span class="ava-preview-name">${esc(s.name)}</span>
    </div>

    <div class="calc-section">
      <div class="calc-label"><span>Colore</span><span>anche per le linee nei grafici</span></div>
      <div class="ava-colors">
        ${AVATAR_COLORS.map((c) => `<button class="ava-color ${sym && bg === c ? "on" : ""}" data-action="ava-color" data-c="${c}" style="background:${c}" aria-label="Colore ${c}"></button>`).join("")}
      </div>
    </div>

    <div class="calc-section">
      <div class="calc-label"><span>Personaggio</span>${symName ? `<span>${esc(symName)}</span>` : ""}</div>
      <div class="ava-grid">
        <button class="ava-pick ini ${sym === INITIALS_SYM ? "on" : ""}" data-action="ava-sym" data-s="${INITIALS_SYM}" ${sym === INITIALS_SYM ? `style="background:${bg}"` : ""} aria-label="Iniziali" title="Iniziali">${esc(initials(s.name))}</button>
        ${Object.entries(AVATAR_SYMBOLS).map(([key, def]) => `<button class="ava-pick ${sym === key ? "on" : ""}" data-action="ava-sym" data-s="${key}" ${sym === key ? `style="background:${bg}"` : ""} aria-label="${esc(def.name)}" title="${esc(def.name)}">${symbolSvg(key)}</button>`).join("")}
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
      <button class="btn ghost" data-action="ava-reset" ${a ? "" : "disabled"}>Predefinito</button>
      <button class="btn primary" data-action="ava-save">${icon("check", "tiny")} Salva</button>
    </div>`;
}
