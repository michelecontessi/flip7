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
}
if (typeof document !== "undefined") {
  const once = () => { unlockAudio(); document.removeEventListener("pointerdown", once); };
  document.addEventListener("pointerdown", once, { passive: true });
}

/** Due note brevi (turno) o una sola (avviso). Silenzioso se disattivato. */
export function ding(kind = "turn") {
  if (!wantsSound()) return;
  const c = audioCtx();
  if (!c || c.state !== "running") return;
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

/** Vibrazione breve (Android; iOS la ignora senza far danni). */
export function buzz(pattern = [70, 40, 70]) {
  if (!wantsVibration()) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* niente */ }
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
