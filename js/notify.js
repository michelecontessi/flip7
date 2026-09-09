// ---------------------------------------------------------------------------
// Avvisi: vibrazione, un suono breve e, a pagina nascosta, una notifica di
// sistema fatta dal service worker. Tutto sul dispositivo: niente server di
// push, niente Cloud Functions. Le preferenze stanno in prefs (per dispositivo).
// ---------------------------------------------------------------------------
import { prefs } from "./prefs.js";

export const NOTIFY_KEYS = { sound: "notifySound", vibrate: "notifyVibrate", push: "notifyPush" };

export const wantsSound = () => prefs.get(NOTIFY_KEYS.sound, true) !== false;
export const wantsVibration = () => prefs.get(NOTIFY_KEYS.vibrate, true) !== false;
export const wantsPush = () => prefs.get(NOTIFY_KEYS.push, false) === true;

export const canPush = () => typeof Notification !== "undefined" && "serviceWorker" in navigator;
/** true se questo dispositivo sa vibrare dal browser (iPhone: no). */
export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
/** true se il browser sa produrre suoni. */
export const canSound = () => typeof window !== "undefined" && Boolean(window.AudioContext || window.webkitAudioContext);
export const pushPermission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** Chiede il permesso per le notifiche (va chiamato da un tocco). */
export async function requestPush() {
  if (!canPush()) return "unsupported";
  try { return await Notification.requestPermission(); }
  catch { return "denied"; }
}

// --- suono ------------------------------------------------------------------
// Un contesto audio solo, creato al primo tocco: iOS non suona niente senza
// un gesto dell'utente, quindi lo si "sblocca" appena si tocca lo schermo.
let ctx = null;
function audioCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}
export function unlockAudio() {
  const c = audioCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
  return c;
}
// Il primo tocco sblocca l'audio. L'ascolto resta finche' il contesto non e'
// davvero partito: al primissimo tocco `resume()` puo' non fare in tempo, e
// togliere subito l'ascolto lasciava l'app muta per sempre.
if (typeof document !== "undefined") {
  const once = () => {
    const c = unlockAudio();
    if (c && c.state === "running") document.removeEventListener("pointerdown", once);
  };
  document.addEventListener("pointerdown", once, { passive: true });
}

/**
 * Due note brevi (turno) o una sola (avviso). Silenzioso se disattivato.
 * Se il contesto audio e' ancora sospeso (succede al primo tocco, e su iOS
 * dopo ogni pausa) si sveglia e poi suona, invece di non fare niente.
 */
export function ding(kind = "turn") {
  if (!wantsSound()) return;
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") { c.resume().then(() => tones(c, kind)).catch(() => {}); return; }
  if (c.state !== "running") return;
  tones(c, kind);
}

function tones(c, kind) {
  const notes = kind === "turn" ? [[880, 0], [1175, 0.13]] : kind === "over" ? [[660, 0], [880, 0.12], [1175, 0.24]] : [[740, 0]];
  const t0 = c.currentTime;
  for (const [freq, at] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.16);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.2);
  }
}

/** Vibrazione breve. Torna true se il dispositivo ha davvero vibrato. */
export function buzz(pattern = [70, 40, 70]) {
  if (!wantsVibration() || !canVibrate()) return false;
  try { return Boolean(navigator.vibrate(pattern)); } catch { return false; }
}

/**
 * Notifica di sistema, solo se l'app non e' in vista: se la si sta guardando
 * bastano suono e vibrazione. `tag` fa sostituire la precedente dello stesso tipo.
 */
export async function pushLocal(title, body, { tag = "flip7", url = "#tavolo" } = {}) {
  if (!wantsPush() || !canPush() || Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, renotify: true, icon: "icon-192.png", badge: "icon-192.png", data: { url }, vibrate: [70, 40, 70] });
  } catch { /* browser senza notifiche dal SW */ }
}

/** Avviso completo: suono + vibrazione + notifica (se serve). */
export function alertUser(kind, title, body, opts = {}) {
  ding(kind);
  buzz(kind === "over" ? [90, 50, 90, 50, 160] : [70, 40, 70]);
  return pushLocal(title, body, opts);
}
