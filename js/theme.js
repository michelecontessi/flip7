// ---------------------------------------------------------------------------
// Tema: chiaro di default, scuro se lo chiede il sistema (o l'utente).
// ---------------------------------------------------------------------------
import { prefs } from "./prefs.js";

const COLORS = { light: "#f7f4ef", dark: "#16181c" };

export function applyTheme() {
  const choice = prefs.get("theme", "auto");
  const root = document.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;

  const dark = choice === "dark"
    || (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? COLORS.dark : COLORS.light);
}

export function watchSystemTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => { if (prefs.get("theme", "auto") === "auto") applyTheme(); };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
