// ---------------------------------------------------------------------------
// Avatar dei giocatori. Salvato in players/{id}/avatar in una di due forme:
//   { sym: "volpe", bg: "#f6b26b" }          personaggio disegnato su un colore
//   { image: "data:image/jpeg;base64,..." }  foto ridotta a francobollo
// Senza avatar restano le iniziali sul colore derivato dal nome.
// I personaggi sono disegnati qui, nello stesso stile di corona e trofei:
// contorno inciso, sfumature piene, luci bianche. ViewBox 48x48.
// ---------------------------------------------------------------------------
import { esc, initials, colorOf } from "./ui.js";
import { icon } from "./icons.js";
import { getRoom } from "./store.js";

export const AVATAR_COLORS = [
  "#f6b26b", "#e8746a", "#f2cc60", "#9ccc65", "#4db6ac", "#64b5f6",
  "#7986cb", "#b388ff", "#f48fb1", "#a1887f", "#90a4ae", "#ffd54f"
];

const lin = (id, a, b, vertical = true) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const holo = (id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".3" stop-color="#ffc247"/><stop offset=".55" stop-color="#ff9ec4"/><stop offset=".75" stop-color="#8fd8ff"/><stop offset="1" stop-color="#ffd166"/></linearGradient>`;

/** I personaggi: chiave stabile (finisce nel database), nome e disegno. */
export const AVATAR_SYMBOLS = {
  volpe: { name: "Volpe", draw: (id) => `
    <defs>${lin(id, "#ffb066", "#e3651a")}</defs>
    <path d="M9 7 18 16.5C21.6 15 26.4 15 30 16.5L39 7 40.4 24.5C40.4 34.5 33 41 24 41 15 41 7.6 34.5 7.6 24.5Z" fill="url(#${id})" stroke="#8a3d0a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12.6 11.4 17.8 17 14.6 20.6ZM35.4 11.4 30.2 17 33.4 20.6Z" fill="#5a2606"/>
    <path d="M24 41C17.6 41 12.6 37.4 11.4 31.4 15.2 34.2 19.6 33.2 24 29.6 28.4 33.2 32.8 34.2 36.6 31.4 35.4 37.4 30.4 41 24 41Z" fill="#fff5ea"/>
    <circle cx="18.2" cy="25.6" r="2" fill="#2b1508"/><circle cx="29.8" cy="25.6" r="2" fill="#2b1508"/>
    <path d="M24 34.6 21.4 32.2H26.6Z" fill="#2b1508"/>
    <circle cx="15" cy="21" r="2.4" fill="#fff" opacity=".35"/>` },

  orso: { name: "Orso", draw: (id) => `
    <defs>${lin(id, "#c58a5a", "#8a5230")}</defs>
    <circle cx="12" cy="14" r="6" fill="url(#${id})" stroke="#4a2810" stroke-width="2"/>
    <circle cx="36" cy="14" r="6" fill="url(#${id})" stroke="#4a2810" stroke-width="2"/>
    <circle cx="12" cy="14" r="2.6" fill="#e9b790"/><circle cx="36" cy="14" r="2.6" fill="#e9b790"/>
    <circle cx="24" cy="26" r="15.5" fill="url(#${id})" stroke="#4a2810" stroke-width="2"/>
    <ellipse cx="24" cy="31.5" rx="7.4" ry="5.6" fill="#e9b790"/>
    <ellipse cx="24" cy="29.4" rx="3" ry="2.2" fill="#2b1508"/>
    <path d="M24 31.6v2.2M21.6 34.6c1 1.2 3.8 1.2 4.8 0" fill="none" stroke="#2b1508" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="18" cy="23" r="2" fill="#2b1508"/><circle cx="30" cy="23" r="2" fill="#2b1508"/>
    <circle cx="16" cy="17.5" r="2.4" fill="#fff" opacity=".3"/>` },

  gatto: { name: "Gatto", draw: (id) => `
    <defs>${lin(id, "#c3c9d4", "#6c7382")}</defs>
    <path d="M10 7 18.2 15.2C21.8 13.8 26.2 13.8 29.8 15.2L38 7 39.2 25C39.2 34 32.4 40.6 24 40.6 15.6 40.6 8.8 34 8.8 25Z" fill="url(#${id})" stroke="#2f3542" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13.2 11 17.8 16 15 19ZM34.8 11 30.2 16 33 19Z" fill="#f2a0b8"/>
    <ellipse cx="18" cy="25.5" rx="2.8" ry="3.4" fill="#9ee36a"/><ellipse cx="30" cy="25.5" rx="2.8" ry="3.4" fill="#9ee36a"/>
    <ellipse cx="18" cy="25.5" rx="1" ry="2.8" fill="#1d2430"/><ellipse cx="30" cy="25.5" rx="1" ry="2.8" fill="#1d2430"/>
    <path d="M24 32 22.2 30.2H25.8Z" fill="#f28ca8"/>
    <path d="M24 32v1.6M21.4 34.6c1 1 4.2 1 5.2 0" fill="none" stroke="#2f3542" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M14.4 30.8 6.4 29.2M14.4 33 6.6 34.4M33.6 30.8 41.6 29.2M33.6 33 41.4 34.4" stroke="#2f3542" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="14.6" cy="20.6" r="2.2" fill="#fff" opacity=".4"/>` },

  coniglio: { name: "Coniglio", draw: (id) => `
    <defs>${lin(id, "#fffaf2", "#e6d6c4")}</defs>
    <g stroke="#7a5a45" stroke-width="2">
      <ellipse cx="16.5" cy="13" rx="5.2" ry="12" transform="rotate(-10 16.5 13)" fill="url(#${id})"/>
      <ellipse cx="31.5" cy="13" rx="5.2" ry="12" transform="rotate(10 31.5 13)" fill="url(#${id})"/>
    </g>
    <ellipse cx="16.8" cy="13.5" rx="2.4" ry="8" transform="rotate(-10 16.8 13.5)" fill="#f7b3c6"/>
    <ellipse cx="31.2" cy="13.5" rx="2.4" ry="8" transform="rotate(10 31.2 13.5)" fill="#f7b3c6"/>
    <circle cx="24" cy="29" r="13.5" fill="url(#${id})" stroke="#7a5a45" stroke-width="2"/>
    <circle cx="19" cy="27" r="1.9" fill="#3a2418"/><circle cx="29" cy="27" r="1.9" fill="#3a2418"/>
    <circle cx="24" cy="31.4" r="1.6" fill="#f28ca8"/>
    <path d="M24 33v1.4" stroke="#7a5a45" stroke-width="1.3" stroke-linecap="round"/>
    <rect x="21.6" y="34.4" width="2.2" height="3.4" rx=".7" fill="#fff" stroke="#7a5a45" stroke-width="1"/>
    <rect x="24.2" y="34.4" width="2.2" height="3.4" rx=".7" fill="#fff" stroke="#7a5a45" stroke-width="1"/>
    <circle cx="15" cy="30" r="2" fill="#f7b3c6" opacity=".7"/><circle cx="33" cy="30" r="2" fill="#f7b3c6" opacity=".7"/>` },

  leone: { name: "Leone", draw: (id) => `
    <defs>${lin(id, "#f0a441", "#b8621a")}${lin(id + "b", "#ffe0a8", "#f2c07a")}</defs>
    <circle cx="24" cy="25" r="19" fill="url(#${id})" stroke="#6e3a0c" stroke-width="2"/>
    <circle cx="14.5" cy="17" r="3.6" fill="url(#${id}b)" stroke="#6e3a0c" stroke-width="1.6"/>
    <circle cx="33.5" cy="17" r="3.6" fill="url(#${id}b)" stroke="#6e3a0c" stroke-width="1.6"/>
    <circle cx="24" cy="26" r="12.5" fill="url(#${id}b)" stroke="#6e3a0c" stroke-width="2"/>
    <ellipse cx="24" cy="31" rx="5.6" ry="4" fill="#fff5e2"/>
    <path d="M24 30.2 21.8 28.2H26.2Z" fill="#3a2010"/>
    <path d="M24 30.4v1.6M21.6 32.8c1 1 3.8 1 4.8 0" fill="none" stroke="#3a2010" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="19" cy="23.5" r="1.9" fill="#3a2010"/><circle cx="29" cy="23.5" r="1.9" fill="#3a2010"/>
    <circle cx="16" cy="12" r="2.4" fill="#fff" opacity=".3"/>` },

  panda: { name: "Panda", draw: (id) => `
    <defs>${lin(id, "#ffffff", "#e6e8ee")}</defs>
    <circle cx="11.5" cy="13" r="6" fill="#22252b"/><circle cx="36.5" cy="13" r="6" fill="#22252b"/>
    <circle cx="24" cy="26" r="15.5" fill="url(#${id})" stroke="#22252b" stroke-width="2"/>
    <ellipse cx="17.6" cy="24.4" rx="4.6" ry="5.8" transform="rotate(-16 17.6 24.4)" fill="#22252b"/>
    <ellipse cx="30.4" cy="24.4" rx="4.6" ry="5.8" transform="rotate(16 30.4 24.4)" fill="#22252b"/>
    <circle cx="18.4" cy="25" r="1.8" fill="#fff"/><circle cx="29.6" cy="25" r="1.8" fill="#fff"/>
    <circle cx="18.7" cy="25.2" r=".9" fill="#22252b"/><circle cx="29.3" cy="25.2" r=".9" fill="#22252b"/>
    <ellipse cx="24" cy="31.6" rx="2.6" ry="1.9" fill="#22252b"/>
    <path d="M21.6 34.8c1 1.1 3.8 1.1 4.8 0" fill="none" stroke="#22252b" stroke-width="1.4" stroke-linecap="round"/>` },

  gufo: { name: "Gufo", draw: (id) => `
    <defs>${lin(id, "#b18cff", "#6a45c9")}</defs>
    <path d="M11 11 15.6 20.2 21 14ZM37 11 32.4 20.2 27 14Z" fill="#6a45c9" stroke="#3a2470" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="24" cy="27" rx="15.5" ry="16.5" fill="url(#${id})" stroke="#3a2470" stroke-width="2"/>
    <ellipse cx="24" cy="24" rx="12" ry="9.4" fill="#e9dcff"/>
    <circle cx="18" cy="24" r="5.4" fill="#fff" stroke="#3a2470" stroke-width="1.6"/>
    <circle cx="30" cy="24" r="5.4" fill="#fff" stroke="#3a2470" stroke-width="1.6"/>
    <circle cx="18.6" cy="24.4" r="2.7" fill="#2a1a4a"/><circle cx="30.6" cy="24.4" r="2.7" fill="#2a1a4a"/>
    <circle cx="19.6" cy="23.2" r=".9" fill="#fff"/><circle cx="31.6" cy="23.2" r=".9" fill="#fff"/>
    <path d="M21.4 28.4H26.6L24 33Z" fill="#ffb03a" stroke="#3a2470" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M18 36.5l2.4 2.6 2.4-2.6M25.2 36.5l2.4 2.6 2.4-2.6" fill="none" stroke="#3a2470" stroke-width="1.3" stroke-linecap="round"/>` },

  pinguino: { name: "Pinguino", draw: (id) => `
    <defs>${lin(id, "#3d4653", "#1c2129")}</defs>
    <ellipse cx="24" cy="27" rx="14.5" ry="17.5" fill="url(#${id})" stroke="#0d1015" stroke-width="2"/>
    <ellipse cx="24" cy="31" rx="9" ry="11" fill="#fff"/>
    <path d="M14 21c1-6 6-9 10-9s9 3 10 9c-3 3-6.5 4-10 4s-7-1-10-4Z" fill="#fff"/>
    <circle cx="19.5" cy="20" r="1.9" fill="#0d1015"/><circle cx="28.5" cy="20" r="1.9" fill="#0d1015"/>
    <path d="M20.4 22.6H27.6L24 27.4Z" fill="#ff9f2e" stroke="#0d1015" stroke-width="1.2" stroke-linejoin="round"/>
    <ellipse cx="18" cy="43.2" rx="4.4" ry="2.2" fill="#ff9f2e" stroke="#0d1015" stroke-width="1.3"/>
    <ellipse cx="30" cy="43.2" rx="4.4" ry="2.2" fill="#ff9f2e" stroke="#0d1015" stroke-width="1.3"/>
    <circle cx="15.5" cy="27" r="2" fill="#fff" opacity=".2"/>` },

  rana: { name: "Rana", draw: (id) => `
    <defs>${lin(id, "#a5ea7a", "#3fae4a")}</defs>
    <circle cx="15.5" cy="17" r="6.4" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <circle cx="32.5" cy="17" r="6.4" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <ellipse cx="24" cy="30" rx="16.5" ry="12.5" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <circle cx="15.5" cy="17.5" r="3.8" fill="#fff"/><circle cx="32.5" cy="17.5" r="3.8" fill="#fff"/>
    <circle cx="16.2" cy="18" r="2" fill="#123f1a"/><circle cx="33.2" cy="18" r="2" fill="#123f1a"/>
    <path d="M13.5 32c3.4 4.6 17.6 4.6 21 0" fill="none" stroke="#1f6a2a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="21" cy="26.5" r="1" fill="#1f6a2a"/><circle cx="27" cy="26.5" r="1" fill="#1f6a2a"/>
    <circle cx="12" cy="30" r="2.4" fill="#ff9ec4" opacity=".6"/><circle cx="36" cy="30" r="2.4" fill="#ff9ec4" opacity=".6"/>` },

  polpo: { name: "Polpo", draw: (id) => `
    <defs>${lin(id, "#e29bff", "#8c4bd6")}</defs>
    <g fill="url(#${id})" stroke="#4a1f7a" stroke-width="2" stroke-linejoin="round">
      <path d="M11 27c-5.5 6-4.5 15 1 15 4.6 0 5-5.4 2.6-8"/>
      <path d="M37 27c5.5 6 4.5 15-1 15-4.6 0-5-5.4-2.6-8"/>
      <path d="M18.5 30c-2.6 6-1 14 3.4 13.6 3-.3 2.4-4.6.6-6.4"/>
      <path d="M29.5 30c2.6 6 1 14-3.4 13.6-3-.3-2.4-4.6-.6-6.4"/>
      <circle cx="24" cy="20.5" r="14"/>
    </g>
    <circle cx="19" cy="20" r="3.8" fill="#fff"/><circle cx="29" cy="20" r="3.8" fill="#fff"/>
    <circle cx="19.6" cy="20.5" r="1.9" fill="#2a1250"/><circle cx="29.6" cy="20.5" r="1.9" fill="#2a1250"/>
    <path d="M21.4 27.4c1.2 1.4 4 1.4 5.2 0" fill="none" stroke="#4a1f7a" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="15" cy="13" r="2.6" fill="#fff" opacity=".35"/>` },

  squalo: { name: "Squalo", draw: (id) => `
    <defs>${lin(id, "#9fc4dc", "#4f7fa3")}</defs>
    <path d="M24 4 32 18H16Z" fill="url(#${id})" stroke="#1f3e57" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="24" cy="28" rx="16.5" ry="13" fill="url(#${id})" stroke="#1f3e57" stroke-width="2"/>
    <ellipse cx="24" cy="33.5" rx="11" ry="6.5" fill="#eef6fb"/>
    <circle cx="16" cy="24.5" r="2" fill="#0f2233"/><circle cx="32" cy="24.5" r="2" fill="#0f2233"/>
    <path d="M14.5 32.5c4 5.6 15 5.6 19 0Z" fill="#1f3e57"/>
    <path d="M16.2 33.2l1.8 2.4 1.8-2.4 1.8 2.4 1.8-2.4 1.8 2.4 1.8-2.4 1.8 2.4 1.8-2.4 1.8 2.4 1.8-2.4" fill="#fff" stroke="none"/>
    <path d="M10.5 26.5v4M8.5 25v4" stroke="#1f3e57" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="16" cy="19" r="2.2" fill="#fff" opacity=".35"/>` },

  unicorno: { name: "Unicorno", draw: (id) => `
    <defs>${lin(id, "#ffffff", "#ebe8f6")}${lin(id + "b", "#ffe28a", "#d9a017")}</defs>
    <path d="M24 2.5 20 19h8Z" fill="url(#${id}b)" stroke="#8a5a10" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M21.2 14h5.6M20.4 17h7.2" stroke="#8a5a10" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M12.5 12.5 18 20l-6.6 3.4ZM35.5 12.5 30 20l6.6 3.4Z" fill="url(#${id})" stroke="#6f5a8a" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="24" cy="29" r="14" fill="url(#${id})" stroke="#6f5a8a" stroke-width="2"/>
    <circle cx="36" cy="19" r="4.2" fill="#ff8fd0"/><circle cx="38.6" cy="26.5" r="3.8" fill="#b388ff"/><circle cx="36.8" cy="33.5" r="3.6" fill="#8fd8ff"/>
    <circle cx="19" cy="27.5" r="1.9" fill="#3a2f4a"/><circle cx="29" cy="27.5" r="1.9" fill="#3a2f4a"/>
    <circle cx="15" cy="32" r="2.2" fill="#ffb3d3" opacity=".8"/><circle cx="33" cy="32" r="2.2" fill="#ffb3d3" opacity=".8"/>
    <path d="M21.6 36c1 1.1 3.8 1.1 4.8 0" fill="none" stroke="#6f5a8a" stroke-width="1.4" stroke-linecap="round"/>` },

  alieno: { name: "Alieno", draw: (id) => `
    <defs>${lin(id, "#c2f58a", "#5cc24a")}</defs>
    <path d="M24 5.5c12 0 18 10 16 20.5C38 36 31 42.5 24 42.5S10 36 8 26C6 15.5 12 5.5 24 5.5Z" fill="url(#${id})" stroke="#2c6b1e" stroke-width="2"/>
    <ellipse cx="17" cy="25" rx="4.6" ry="7.2" transform="rotate(-22 17 25)" fill="#14201a"/>
    <ellipse cx="31" cy="25" rx="4.6" ry="7.2" transform="rotate(22 31 25)" fill="#14201a"/>
    <circle cx="15.6" cy="21.6" r="1.4" fill="#fff" opacity=".8"/><circle cx="29.6" cy="21.6" r="1.4" fill="#fff" opacity=".8"/>
    <path d="M22 35.4h4" stroke="#2c6b1e" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="17" cy="12" r="2.6" fill="#fff" opacity=".35"/>` },

  robot: { name: "Robot", draw: (id) => `
    <defs>${lin(id, "#9fb8ff", "#4f6bd6")}</defs>
    <path d="M24 13V7.5" stroke="#22307a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="24" cy="5.6" r="2.8" fill="#ff6b6b" stroke="#22307a" stroke-width="1.6"/>
    <circle cx="7" cy="26" r="3" fill="#c8d4ff" stroke="#22307a" stroke-width="1.6"/>
    <circle cx="41" cy="26" r="3" fill="#c8d4ff" stroke="#22307a" stroke-width="1.6"/>
    <rect x="9" y="12.5" width="30" height="27" rx="7" fill="url(#${id})" stroke="#22307a" stroke-width="2"/>
    <rect x="13" y="18.5" width="22" height="9.5" rx="4.75" fill="#14204d"/>
    <circle cx="19" cy="23.2" r="2.6" fill="#6df0ff"/><circle cx="29" cy="23.2" r="2.6" fill="#6df0ff"/>
    <rect x="16" y="31.5" width="16" height="4.4" rx="2.2" fill="#14204d"/>
    <path d="M20 31.5v4.4M24 31.5v4.4M28 31.5v4.4" stroke="#9fb8ff" stroke-width="1.2"/>
    <circle cx="14" cy="16.5" r="1.8" fill="#fff" opacity=".4"/>` },

  fantasma: { name: "Fantasma", draw: (id) => `
    <defs>${lin(id, "#ffffff", "#e6e6f2")}</defs>
    <path d="M9.5 22C9.5 12.5 16 6 24 6s14.5 6.5 14.5 16v19.5l-4.8-4-4.8 4L24 37.5l-4.9 4-4.8-4-4.8 4Z" fill="url(#${id})" stroke="#4a4a66" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="19" cy="22" rx="2.4" ry="3.3" fill="#4a4a66"/><ellipse cx="29" cy="22" rx="2.4" ry="3.3" fill="#4a4a66"/>
    <circle cx="19.8" cy="20.8" r=".8" fill="#fff"/><circle cx="29.8" cy="20.8" r=".8" fill="#fff"/>
    <ellipse cx="24" cy="29.5" rx="2.1" ry="2.7" fill="#4a4a66"/>
    <circle cx="14.5" cy="27.5" r="2.2" fill="#ff9ec4" opacity=".6"/><circle cx="33.5" cy="27.5" r="2.2" fill="#ff9ec4" opacity=".6"/>` },

  dado: { name: "Dado", draw: (id) => `
    <defs>${lin(id, "#ff8f83", "#b3271c", false)}</defs>
    <g transform="rotate(-14 24 24)">
      <rect x="10" y="10" width="28" height="28" rx="7" fill="url(#${id})" stroke="#6e150d" stroke-width="2"/>
      <circle cx="16.5" cy="16.5" r="2.6" fill="#fff"/><circle cx="31.5" cy="16.5" r="2.6" fill="#fff"/>
      <circle cx="24" cy="24" r="2.6" fill="#fff"/>
      <circle cx="16.5" cy="31.5" r="2.6" fill="#fff"/><circle cx="31.5" cy="31.5" r="2.6" fill="#fff"/>
      <circle cx="14.5" cy="13.5" r="3" fill="#fff" opacity=".28"/>
    </g>` },

  carta7: { name: "Carta 7", draw: (id) => `
    <defs>${holo(id)}</defs>
    <g transform="rotate(-9 24 24)">
      <rect x="12" y="5.5" width="24" height="37" rx="4" fill="#fbf4e6" stroke="#4a3a2a" stroke-width="2"/>
      <rect x="15" y="8.5" width="18" height="31" rx="2.5" fill="none" stroke="#e5d5b8" stroke-width="1"/>
      <text x="24" y="31.5" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="700" font-size="21" fill="url(#${id})" stroke="#4a3a2a" stroke-width=".6">7</text>
      <text x="16.2" y="13.6" font-family="Fredoka, sans-serif" font-weight="700" font-size="6" fill="#4a3a2a">7</text>
      <text x="31.8" y="38.6" text-anchor="end" font-family="Fredoka, sans-serif" font-weight="700" font-size="6" fill="#4a3a2a">7</text>
    </g>
    <path d="M40.5 8l.8-2.6.8 2.6 2.6.8-2.6.8-.8 2.6-.8-2.6-2.6-.8Z" fill="#ffc93f"/>` },

  corona: { name: "Corona", draw: (id) => `
    <defs>${holo(id)}${lin(id + "b", "#ffd97a", "#e39a12")}</defs>
    <path d="M10.5 33 7.4 14.5l8.6 6.2L24 8l8 12.7 8.6-6.2L37.5 33Z" fill="url(#${id})" stroke="#b97d0c" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="24" cy="26" r="2.8" fill="#fff" opacity=".85"/>
    <circle cx="16" cy="28" r="1.9" fill="#fff" opacity=".6"/><circle cx="32" cy="28" r="1.9" fill="#fff" opacity=".6"/>
    <circle cx="7.4" cy="14.5" r="2.3" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="1.5"/>
    <circle cx="24" cy="8" r="2.6" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="1.5"/>
    <circle cx="40.6" cy="14.5" r="2.3" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="1.5"/>
    <rect x="9" y="34.5" width="30" height="7" rx="2.6" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="2"/>
    <path d="M13 38h22" stroke="#fff" stroke-opacity=".45" stroke-width="1.8" stroke-linecap="round"/>` },

  razzo: { name: "Razzo", draw: (id) => `
    <defs>${lin(id, "#ffffff", "#dfe3ee")}${lin(id + "b", "#ffd166", "#ff7a2f")}</defs>
    <path d="M18.6 33.5c-1.4-9 .4-19 5.4-26.5 5 7.5 6.8 17.5 5.4 26.5Z" fill="url(#${id})" stroke="#3c3f55" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24 7c2.4 3.4 4 7 4.8 10.6h-9.6C20 14 21.6 10.4 24 7Z" fill="#ff6b6b"/>
    <circle cx="24" cy="22" r="3.6" fill="#6fd0ff" stroke="#3c3f55" stroke-width="1.6"/>
    <path d="M18.8 27.5 11.5 36l7.6-1.4ZM29.2 27.5l7.3 8.5-7.6-1.4Z" fill="#ff6b6b" stroke="#3c3f55" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M19.6 34.6c.8 5 2.4 8 4.4 9.4 2-1.4 3.6-4.4 4.4-9.4Z" fill="url(#${id}b)" stroke="#c8501a" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M22 35.5c.4 3 1.2 4.8 2 5.6.8-.8 1.6-2.6 2-5.6Z" fill="#fff4b0"/>` },

  fulmine: { name: "Fulmine", draw: (id) => `
    <defs>${lin(id, "#ffe58a", "#f5a623")}</defs>
    <path d="M27.5 4 11.5 27.5h10L18.5 44 36.5 19.5h-10Z" fill="url(#${id})" stroke="#a86a06" stroke-width="2" stroke-linejoin="round"/>
    <path d="M25.4 9.6 17.5 21" stroke="#fff" stroke-opacity=".6" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8 10l.8-2.8.8 2.8 2.8.8-2.8.8-.8 2.8-.8-2.8L5.2 10.8Z" fill="#ffc93f"/>
    <path d="M39 34l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z" fill="#ffc93f"/>` },

  cactus: { name: "Cactus", draw: (id) => `
    <defs>${lin(id, "#8fe08a", "#3f9e4a")}${lin(id + "b", "#e8955a", "#b5602a")}</defs>
    <rect x="10.5" y="13" width="6" height="12" rx="3" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <rect x="31.5" y="16" width="6" height="11" rx="3" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <rect x="13" y="20.5" width="10" height="5.5" rx="2.75" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <rect x="25" y="22.5" width="10" height="5.5" rx="2.75" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <rect x="18.5" y="8" width="11" height="26" rx="5.5" fill="url(#${id})" stroke="#1f6a2a" stroke-width="2"/>
    <path d="M21.5 14v12M26.5 14v12" stroke="#1f6a2a" stroke-opacity=".45" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M15.5 33.5h17l-2 11h-13Z" fill="url(#${id}b)" stroke="#6e3512" stroke-width="2" stroke-linejoin="round"/>
    <rect x="13" y="31" width="22" height="5" rx="1.8" fill="url(#${id}b)" stroke="#6e3512" stroke-width="2"/>
    <circle cx="24" cy="8" r="3.6" fill="#ff7bb0" stroke="#b02e6a" stroke-width="1.5"/>
    <circle cx="24" cy="8" r="1.3" fill="#ffe28a"/>` }
};

let symSeq = 0;
/** SVG di un personaggio (chiave di AVATAR_SYMBOLS). */
export function symbolSvg(key, cls = "") {
  const sym = AVATAR_SYMBOLS[key];
  if (!sym) return "";
  return `<svg class="ava-sym ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${sym.draw("av" + (++symSeq))}</svg>`;
}

const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Avatar valido (forma controllata: arriva dal database, scritto da altri). */
export function parseAvatar(a) {
  if (!a || typeof a !== "object") return null;
  if (typeof a.image === "string" && a.image.length <= 60000 && IMAGE_RE.test(a.image)) return { image: a.image };
  if (typeof a.sym === "string" && AVATAR_SYMBOLS[a.sym]) {
    return { sym: a.sym, bg: COLOR_RE.test(a.bg || "") ? a.bg : AVATAR_COLORS[0] };
  }
  return null;
}

/** Avatar scelto dal giocatore del roster, o null se usa le iniziali. */
export function playerAvatar(pid) {
  const p = pid ? (getRoom().players || {})[pid] : null;
  return parseAvatar(p && p.avatar);
}

/** HTML dell'avatar a partire dalla forma gia' controllata (o null → iniziali). */
export function avatarHtml(a, name, cls = "sm") {
  if (a && a.image) return `<span class="avatar ${cls} img"><img src="${esc(a.image)}" alt="" draggable="false"></span>`;
  if (a && a.sym) return `<span class="avatar ${cls} sym" style="background:${esc(a.bg)}">${symbolSvg(a.sym)}</span>`;
  return `<span class="avatar ${cls}" style="background:${colorOf(name)}">${initials(name)}</span>`;
}

/** Avatar di un giocatore del roster (per id); il nome serve al ripiego sulle iniziali. */
export function avatar(pid, name, cls = "sm") {
  return avatarHtml(playerAvatar(pid), name, cls);
}

// --- foto: lettura, ritaglio, riduzione e compressione -----------------------
async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { /* formato non supportato dal bitmap: ripiego sull'<img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Immagine non leggibile"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * La foto scelta, tenuta a piena risoluzione finche' il pannello avatar resta
 * aperto: serve a poter ricentrare il ritaglio quante volte si vuole senza
 * ripartire dal file.
 * @typedef {{img:CanvasImageSource, w:number, h:number}} PhotoSource
 */
export async function loadPhoto(file) {
  const img = await loadImage(file);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Immagine non leggibile");
  return { img, w, h };
}

/** Ritaglio di partenza: il quadrato piu' grande, preso al centro. */
export const centerCrop = () => ({ zoom: 1, cx: 0.5, cy: 0.5 });

/** Lato (in pixel della foto) del quadrato ritagliato al livello di zoom dato. */
const cropSide = (src, crop) => Math.min(src.w, src.h) / Math.max(1, crop.zoom || 1);

/**
 * Tiene il ritaglio dentro la foto: cosi' trascinando non si finisce mai fuori
 * bordo, con la fascia bianca al posto dell'immagine.
 */
export function clampCrop(src, crop) {
  const side = cropSide(src, crop);
  const halfX = side / 2 / src.w, halfY = side / 2 / src.h;
  return {
    zoom: Math.max(1, Math.min(5, crop.zoom || 1)),
    cx: Math.min(1 - halfX, Math.max(halfX, crop.cx)),
    cy: Math.min(1 - halfY, Math.max(halfY, crop.cy))
  };
}

/** Disegna il ritaglio su un canvas quadrato di `size` pixel. */
export function drawCrop(canvas, src, crop, size) {
  const c = clampCrop(src, crop);
  const side = cropSide(src, c);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size); // le png trasparenti su jpeg diventerebbero nere
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src.img, c.cx * src.w - side / 2, c.cy * src.h - side / 2, side, side, 0, 0, size, size);
  return canvas;
}

/** JPEG in data URL, con la qualita' abbassata finche' sta dentro `maxChars`. */
function encodeAvatar(canvas, maxChars) {
  let quality = 0.84;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > maxChars && quality > 0.3) {
    quality -= 0.12;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > maxChars || !IMAGE_RE.test(out)) throw new Error("Foto troppo pesante: provane una più semplice");
  return out;
}

/** Francobollo quadrato (JPEG in data URL) del ritaglio scelto. */
export function cropToAvatarImage(src, crop, { size = 160, maxChars = 30000 } = {}) {
  return encodeAvatar(drawCrop(document.createElement("canvas"), src, crop, size), maxChars);
}

// --- ritaglio interattivo ----------------------------------------------------
// Una foto caricata quasi mai e' gia' centrata: qui si trascina e si ingrandisce
// finche' la faccia sta nel cerchio, e si puo' tornarci sopra quante volte si vuole.
const STAGE = 260;

/**
 * Apre il ritaglio della foto. Risolve col nuovo `crop`, oppure null se annullato.
 * @param {PhotoSource} src
 * @param {{zoom:number, cx:number, cy:number}} start
 */
export function openAvatarCropper(src, start = centerCrop()) {
  return new Promise((resolve) => {
    const root = document.getElementById("dialog-root");
    if (!root) return resolve(null);

    let crop = clampCrop(src, { ...start });
    const wrap = document.createElement("div");
    wrap.className = "dlg-wrap";
    wrap.innerHTML = `
      <div class="dlg-backdrop"></div>
      <div class="dlg crop-dlg" role="dialog" aria-modal="true">
        <div class="dlg-title">Centra la foto</div>
        <div class="crop-stage">
          <canvas class="crop-canvas"></canvas>
          <span class="crop-ring" aria-hidden="true"></span>
        </div>
        <div class="crop-zoom">
          <button class="icon-btn" data-z="-.4" aria-label="Riduci">${icon("minus")}</button>
          <input type="range" min="1" max="5" step="0.01" value="${crop.zoom}" aria-label="Ingrandimento">
          <button class="icon-btn" data-z=".4" aria-label="Ingrandisci">${icon("plus")}</button>
        </div>
        <p class="dlg-msg">Trascina la foto per spostarla, la barra per ingrandirla.</p>
        <div class="dlg-actions">
          <button class="btn ghost" data-r="cancel">Annulla</button>
          <button class="btn primary" data-r="ok">${icon("check", "tiny")} Usa questa</button>
        </div>
      </div>`;

    root.appendChild(wrap);
    document.body.classList.add("sheet-open");

    const canvas = wrap.querySelector(".crop-canvas");
    const range = wrap.querySelector('input[type="range"]');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = canvas.style.height = STAGE + "px";
    const paint = () => { crop = clampCrop(src, crop); drawCrop(canvas, src, crop, Math.round(STAGE * dpr)); };
    paint();

    // trascinamento: un pixel sullo schermo = un pixel della foto, alla scala del ritaglio
    let dragging = null;
    const stage = wrap.querySelector(".crop-stage");
    stage.addEventListener("pointerdown", (ev) => {
      dragging = { x: ev.clientX, y: ev.clientY };
      stage.setPointerCapture(ev.pointerId);
    });
    stage.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const k = (Math.min(src.w, src.h) / crop.zoom) / STAGE;
      crop.cx -= ((ev.clientX - dragging.x) * k) / src.w;
      crop.cy -= ((ev.clientY - dragging.y) * k) / src.h;
      dragging = { x: ev.clientX, y: ev.clientY };
      paint();
    });
    const endDrag = () => { dragging = null; };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      crop.zoom = Math.max(1, Math.min(5, crop.zoom * (ev.deltaY < 0 ? 1.08 : 1 / 1.08)));
      range.value = crop.zoom;
      paint();
    }, { passive: false });

    range.addEventListener("input", () => { crop.zoom = Number(range.value); paint(); });

    const done = (value) => {
      wrap.remove();
      const openSheetRoot = document.getElementById("sheet-root");
      if (!root.children.length && !(openSheetRoot && openSheetRoot.classList.contains("open"))) {
        document.body.classList.remove("sheet-open");
      }
      resolve(value);
    };
    wrap.addEventListener("click", (ev) => {
      const step = ev.target.closest("[data-z]");
      if (step) {
        crop.zoom = Math.max(1, Math.min(5, crop.zoom + Number(step.dataset.z)));
        range.value = crop.zoom;
        return paint();
      }
      const hit = ev.target.closest("[data-r], .dlg-backdrop");
      if (!hit) return;
      if (hit.classList.contains("dlg-backdrop") || hit.dataset.r === "cancel") return done(null);
      if (hit.dataset.r === "ok") return done(clampCrop(src, crop));
    });
    wrap.addEventListener("keydown", (ev) => { if (ev.key === "Escape") done(null); });
  });
}
