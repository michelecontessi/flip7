// ---------------------------------------------------------------------------
// Helper condivisi di interfaccia: escape, formattazione, toast, bottom sheet.
// ---------------------------------------------------------------------------

import * as store from "./store.js";

/** URL pubblico della stanza corrente. */
export function roomUrl() {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("room", store.getRoomId());
  return url.toString();
}

/** Condivide la stanza: foglio di sistema su mobile, altrimenti copia il link. */
export async function shareRoom() {
  const url = roomUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: "Flip 7 — Segnapunti", text: "Entra e segui i punti in diretta", url });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copiato: incollalo in chat");
    return;
  } catch { /* clipboard negata */ }
  await askText("Link della stanza", { value: url, confirmLabel: "Chiudi" });
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const dtLong = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });
const dtTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

export function fmtDate(ms) { return ms ? dtLong.format(new Date(ms)) : "—"; }
export function fmtDateTime(ms) { return ms ? `${dtLong.format(new Date(ms))} · ${dtTime.format(new Date(ms))}` : "—"; }
export function fmtNum(n, digits = 1) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function inputDate(ms) {
  const d = new Date(ms || Date.now());
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function relTime(ms) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const day = 864e5;
  if (diff < 6e4) return "adesso";
  if (diff < 36e5) return Math.round(diff / 6e4) + " min fa";
  if (diff < day) return Math.round(diff / 36e5) + " h fa";
  if (diff < 7 * day) return Math.round(diff / day) + " gg fa";
  return fmtDate(ms);
}

/** Iniziali per l'avatar. */
export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

/** Colore stabile derivato dal nome. */
export function colorOf(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 58%)`;
}

export const medal = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "");

// --- toast ------------------------------------------------------------------
export function toast(message, kind = "info") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const node = document.createElement("div");
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 250);
  }, 2600);
}

// --- bottom sheet -----------------------------------------------------------
// Lo sheet vive in un contenitore separato: cosi' gli aggiornamenti live
// (che ridisegnano la view principale) non chiudono quello che stai compilando.
export const sheet = { state: null, render: null, patch: null };

/**
 * `patchFn` (facoltativa) aggiorna il pannello sul posto invece di ridisegnarlo:
 * niente sfarfallio quando si tocca una carta o si digita.
 */
export function openSheet(state, renderFn, patchFn = null, opts = {}) {
  sheet.state = state;
  sheet.render = renderFn;
  sheet.patch = patchFn;
  sheet.full = Boolean(opts.full);
  drawSheet();
}
export function closeSheet() {
  sheet.state = null;
  sheet.render = null;
  sheet.patch = null;
  drawSheet();
}
export function drawSheet() {
  const root = document.getElementById("sheet-root");
  if (!root) return;
  if (!sheet.state || !sheet.render) {
    root.innerHTML = "";
    root.classList.remove("open");
    document.body.classList.remove("sheet-open");
    return;
  }
  root.innerHTML = `<div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet ${sheet.full ? "full" : ""}">${sheet.full ? "" : '<button class="sheet-grab" data-action="sheet-close" aria-label="Chiudi"></button>'}${sheet.render(sheet.state)}</div>`;
  root.classList.add("open");
  document.body.classList.add("sheet-open");
}

// --- pagina a schermo intero (profilo giocatore) -----------------------------
// Diversa dal bottom sheet: entra da destra e occupa tutto, come una schermata vera.
export const page = { state: null, render: null };

export function openPage(state, renderFn) {
  page.state = state;
  page.render = renderFn;
  drawPage();
}
export function closePage() {
  page.state = null;
  page.render = null;
  drawPage();
}
export function drawPage() {
  const root = document.getElementById("page-root");
  if (!root) return;
  if (!page.state || !page.render) {
    root.innerHTML = "";
    root.classList.remove("open");
    if (!sheet.state) document.body.classList.remove("sheet-open");
    return;
  }
  root.innerHTML = page.render(page.state);
  root.classList.add("open");
  document.body.classList.add("sheet-open");
}

/** Legge nello state dello sheet il valore di ogni input marcato data-bind. */
export function captureSheetInputs() {
  const root = document.getElementById("sheet-root");
  if (!root || !sheet.state) return;
  root.querySelectorAll("[data-bind]").forEach((node) => {
    const path = node.dataset.bind.split(".");
    let obj = sheet.state;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]] = obj[path[i]] || {};
    obj[path[path.length - 1]] = node.type === "checkbox" ? node.checked : node.value;
  });
}

// --- dialoghi (sostituiscono prompt/confirm nativi: piu' belli e affidabili) --
export function askDialog({ title, message = "", input = null, choices = null, confirmLabel = "OK", cancelLabel = "Annulla", danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById("dialog-root");
    if (!root) return resolve(null);

    const wrap = document.createElement("div");
    wrap.className = "dlg-wrap";
    wrap.innerHTML = `
      <div class="dlg-backdrop"></div>
      <div class="dlg" role="dialog" aria-modal="true">
        <div class="dlg-title">${esc(title)}</div>
        ${message ? `<p class="dlg-msg">${esc(message)}</p>` : ""}
        ${input ? `<input class="dlg-input" type="${input.type || "text"}" value="${esc(input.value ?? "")}"
                     placeholder="${esc(input.placeholder || "")}" maxlength="${input.maxlength || 40}"
                     autocomplete="off" enterkeyhint="done">` : ""}
        ${choices ? `<div class="dlg-choices">${choices.map((c, i) => `<button class="dlg-choice" data-i="${i}">${esc(c.label)}</button>`).join("")}</div>` : ""}
        <div class="dlg-actions">
          <button class="btn ghost" data-r="cancel">${esc(cancelLabel)}</button>
          ${choices ? "" : `<button class="btn ${danger ? "danger" : "primary"}" data-r="ok">${esc(confirmLabel)}</button>`}
        </div>
      </div>`;

    root.appendChild(wrap);
    document.body.classList.add("sheet-open");

    const field = wrap.querySelector(".dlg-input");
    if (field) setTimeout(() => { field.focus(); if (field.select) field.select(); }, 60);

    const done = (value) => {
      wrap.remove();
      if (!root.children.length && !sheet.state) document.body.classList.remove("sheet-open");
      resolve(value);
    };

    wrap.addEventListener("click", (ev) => {
      const hit = ev.target.closest("[data-r], .dlg-choice, .dlg-backdrop");
      if (!hit) return;
      if (hit.classList.contains("dlg-backdrop") || hit.dataset.r === "cancel") return done(null);
      if (hit.classList.contains("dlg-choice")) return done(choices[Number(hit.dataset.i)].id);
      if (hit.dataset.r === "ok") return done(field ? field.value.trim() : true);
    });
    wrap.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && field) { ev.preventDefault(); done(field.value.trim()); }
      if (ev.key === "Escape") done(null);
    });
  });
}

/** Chiede un testo. Risolve con la stringa, oppure null se annullato. */
export const askText = (title, opts = {}) => askDialog({
  title, message: opts.message,
  input: { value: opts.value || "", placeholder: opts.placeholder || "", maxlength: opts.maxlength, type: opts.type },
  confirmLabel: opts.confirmLabel || "Salva"
}).then((v) => (v && String(v).trim() ? String(v).trim() : null));

/** Chiede conferma. Risolve true/false. */
export const askConfirm = (title, opts = {}) => askDialog({
  title, message: opts.message,
  confirmLabel: opts.confirmLabel || "Conferma", danger: opts.danger
}).then((v) => v === true);

/** Chiede di scegliere fra piu' opzioni: [{id, label}]. Risolve con l'id o null. */
export const askChoice = (title, choices, opts = {}) => askDialog({ title, message: opts.message, choices });
