// ---------------------------------------------------------------------------
// Icone SVG disegnate a mano (niente emoji) + facce delle carte Flip 7.
// Tutte usano currentColor, cosi' ereditano il colore del contesto.
// ---------------------------------------------------------------------------

const PATHS = {
  // tab
  cards: `<rect x="2.6" y="6.4" width="9.6" height="14" rx="2.2" transform="rotate(-13 7.4 13.4)"/>
          <rect x="11" y="3.4" width="10.4" height="17.2" rx="2.4"/>
          <path d="M16.2 9.3h-2.1l2.2 2.9-2.4 3.6h2.6" stroke-width="1.5"/>`,
  crown: `<path d="M3.2 18.2 2 7.6l5.1 3.6L12 4.4l4.9 6.8L22 7.6l-1.2 10.6Z"/>
          <path d="M5.4 21.2h13.2"/>`,
  crownFill: `<path d="M4 17.4 2.6 7.4l4.9 3.6L12 4.2l4.5 6.8 4.9-3.6-1.4 10Z" fill="currentColor" stroke-linejoin="round"/>
              <rect x="3.6" y="18.4" width="16.8" height="3.4" rx="1.4" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="12.6" r="1.5" fill="#fff" fill-opacity=".75" stroke="none"/>`,
  history: `<path d="M3.6 12a8.4 8.4 0 1 0 2.5-6"/><path d="M2.8 3.6v4.2h4.2"/><path d="M12 7.6V12l3 1.9"/>`,
  sliders: `<path d="M3 7.5h9M17.5 7.5H21M3 16.5h4.5M13 16.5H21"/>
            <circle cx="14.8" cy="7.5" r="2.4"/><circle cx="10.3" cy="16.5" r="2.4"/>`,

  // azioni
  plus: `<path d="M12 5.2v13.6M5.2 12h13.6"/>`,
  minus: `<path d="M5.2 12h13.6"/>`,
  close: `<path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6"/>`,
  check: `<path d="m5 12.6 4.6 4.6L19 6.8"/>`,
  pencil: `<path d="M4 20.2h4.2L20 8.4l-4.2-4.2L4 16Z"/><path d="m14.4 5.8 4.2 4.2"/>`,
  trash: `<path d="M4.2 6.9h15.6M9.4 6.9V4.6h5.2v2.3"/><path d="m6.3 6.9 1 13.2h9.4l1-13.2"/>`,
  archive: `<rect x="3.2" y="4.2" width="17.6" height="4.2" rx="1.4"/>
            <path d="M5.2 8.4v10.6a1.4 1.4 0 0 0 1.4 1.4h10.8a1.4 1.4 0 0 0 1.4-1.4V8.4"/><path d="M10 12.6h4"/>`,
  restore: `<path d="M4 10.4A8.2 8.2 0 1 1 3.8 14"/><path d="M3.4 5.6v4.8h4.8"/>`,
  link: `<path d="M10.2 13.6a3.9 3.9 0 0 0 5.6.4l2.6-2.6a3.9 3.9 0 0 0-5.6-5.6l-1.5 1.5"/>
         <path d="M13.8 10.4a3.9 3.9 0 0 0-5.6-.4l-2.6 2.6a3.9 3.9 0 0 0 5.6 5.6l1.5-1.5"/>`,
  download: `<path d="M12 3.4v11.8M7.2 10.8 12 15.6l4.8-4.8"/><path d="M4.2 20.2h15.6"/>`,
  upload: `<path d="M12 20.4V8.6M7.2 13 12 8.2l4.8 4.8"/><path d="M4.2 3.8h15.6"/>`,
  user: `<circle cx="12" cy="8.2" r="3.6"/><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>`,
  users: `<circle cx="9.2" cy="8.4" r="3.3"/><path d="M3 20a6.2 6.2 0 0 1 12.4 0"/><path d="M15.2 5.4a3.3 3.3 0 0 1 0 6.2"/><path d="M17 14.3a6.2 6.2 0 0 1 4 5.7"/>`,
  door: `<path d="M5.2 20.6V5.4A1.8 1.8 0 0 1 7 3.6h10a1.8 1.8 0 0 1 1.8 1.8v15.2"/><path d="M2.8 20.6h18.4"/><path d="M8.6 20.6V8.2l6.6-1.8v14.2"/><circle cx="13.1" cy="13.6" r="1" fill="currentColor" stroke="none"/>`,
  pen: `<path d="M3.6 20.4h4L19.4 8.6l-4-4L3.6 16.4Z"/><path d="M14.4 9.6 12 7.2"/>`,
  flag: `<path d="M5.4 21V3.6"/><path d="M5.4 4.6h11.8l-2.1 3.7 2.1 3.7H5.4"/>`,
  chevron: `<path d="m6.6 9.4 5.4 5.2 5.4-5.2"/>`,
  arrowLeft: `<path d="M19 12H5.4"/><path d="m10.8 6.6-5.4 5.4 5.4 5.4"/>`,
  star: `<path d="m12 3.2 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.9l-5.3 2.9 1.1-6-4.4-4.2 6-.8Z"/>`,
  burst: `<path d="M12 2.6 14 8l5.6-2-2.4 5.4 5 3.1-5.6 1.3 1 5.6-4.6-3.3-4.6 3.3 1-5.6L4.8 14.5l5-3.1L7.4 6 13 8Z"/>`,
  bomb: `<circle cx="12" cy="12" r="8.6"/><path d="m8.8 8.8 6.4 6.4M15.2 8.8l-6.4 6.4"/>`,
  seven: `<rect x="4.2" y="3.4" width="15.6" height="17.2" rx="3.4"/>
          <path d="M9 8.6h6.2L11.4 16.4"/>`,
  backspace: `<path d="M9.4 4.8H19a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2H9.4L2.8 12Z"/>
              <path d="m11.6 9.4 5 5.2M16.6 9.4l-5 5.2"/>`,
  medal: `<circle cx="12" cy="14.6" r="5.4"/><path d="M8.6 9.6 6 3.2h12l-2.6 6.4"/><path d="m12 12.2.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z" stroke-width="1.2"/>`,
  target: `<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  eye: `<path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="2.8"/>`,
  refresh: `<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M21 3.4v4.4h-4.4"/>`,
  cardFan: `<rect x="1.8" y="7" width="8.4" height="12.4" rx="2" transform="rotate(-18 6 13.2)"/>
            <rect x="7.8" y="4.6" width="8.4" height="13.6" rx="2"/>
            <rect x="13.8" y="7" width="8.4" height="12.4" rx="2" transform="rotate(18 18 13.2)"/>`,
  heartFill: `<path d="M12 20.6C6.8 16.8 3.2 13.5 3.2 9.7a4.8 4.8 0 0 1 8.8-2.7 4.8 4.8 0 0 1 8.8 2.7c0 3.8-3.6 7.1-8.8 10.9Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>`,
  dots: `<circle cx="5.2" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.8" cy="12" r="1.7" fill="currentColor" stroke="none"/>`,
  snow: `<path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6"/>
         <path d="M9.4 4.4 12 6.6l2.6-2.2M9.4 19.6 12 17.4l2.6 2.2M3.9 10.7l3.2.6.7-3.2M20.1 13.3l-3.2-.6-.7 3.2M3.9 13.3l3.2-.6.7 3.2M20.1 10.7l-3.2.6-.7-3.2"/>`,
  bell: `<path d="M6 16.2V11a6 6 0 0 1 12 0v5.2l1.6 2.2H4.4Z"/><path d="M9.8 20.6a2.3 2.3 0 0 0 4.4 0"/><path d="M12 3.2v1.8"/>`,
  bellOff: `<path d="M6 16.2V11a6 6 0 0 1 9.2-5.1M18 11v5.2l1.6 2.2H4.4"/><path d="M9.8 20.6a2.3 2.3 0 0 0 4.4 0"/><path d="m4 4 16 16"/>`,
  share: `<path d="M12 3.6v11"/><path d="m7.8 7.8 4.2-4.2 4.2 4.2"/><path d="M5 12.4v6.4a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-6.4"/>`,
  pause: `<rect x="6.2" y="4.6" width="4" height="14.8" rx="1.2"/><rect x="13.8" y="4.6" width="4" height="14.8" rx="1.2"/>`,
  play: `<path d="M7.4 4.6v14.8L19 12Z"/>`,
  chart: `<path d="M3.6 20.4h16.8"/><path d="M6.2 16.4 10 11.6l3.4 2.8 4.6-6.4"/><circle cx="18" cy="8" r="1.3" fill="currentColor" stroke="none"/>`,
  clock: `<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>`,
  wifi: `<path d="M2.8 9.2a13.4 13.4 0 0 1 18.4 0"/><path d="M6 12.6a8.6 8.6 0 0 1 12 0"/><path d="M9.2 16a4 4 0 0 1 5.6 0"/><circle cx="12" cy="19.2" r="1.2" fill="currentColor" stroke="none"/>`,
  replay: `<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M3.6 3.8v4.6h4.6"/><path d="m10.6 9.4 4.4 2.6-4.4 2.6Z" fill="currentColor" stroke="none"/>`,
  sound: `<path d="M4 9.6v4.8h3.4L12 18.4V5.6L7.4 9.6Z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.4 6.6a7.6 7.6 0 0 1 0 10.8"/>`,
  vibrate: `<rect x="8" y="3.6" width="8" height="16.8" rx="2"/><path d="M4.4 8.4v7.2M19.6 8.4v7.2M2 10v4M22 10v4"/>`,
  smile: `<circle cx="12" cy="12" r="8.4"/><path d="M8.6 14.2a4.2 4.2 0 0 0 6.8 0"/><circle cx="9.3" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r="1" fill="currentColor" stroke="none"/>`,
  trophy: `<path d="M7 4.6h10v5.2a5 5 0 0 1-10 0Z"/><path d="M7 6.4H4.2v1.8a3 3 0 0 0 3 3M17 6.4h2.8v1.8a3 3 0 0 1-3 3"/><path d="M12 14.8v3M8.6 19.6h6.8"/>`,
  swords: `<path d="m4 4 6.4 6.4M20 4l-6.4 6.4M4 20l4.2-4.2M20 20l-4.2-4.2"/><path d="m8.6 12.2 3.2 3.2M15.4 12.2l-3.2 3.2"/><path d="M4 4h3M4 4v3M20 4h-3M20 4v3"/>`
};

/** Restituisce l'SVG dell'icona. `cls` aggiunge classi (es. "big", "gold"). */
export function icon(name, cls = "") {
  const d = PATHS[name] || PATHS.star;
  const filled = name.endsWith("Fill");
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="${filled ? 1.6 : 1.7}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Corona: emblema vero e proprio, con lamina iridescente, gemme e scintille.
// ---------------------------------------------------------------------------
let crownSeq = 0;

export function crownEmblem(cls = "") {
  const id = "cr" + (++crownSeq);
  return `<svg class="crown-emblem ${cls}" viewBox="0 0 56 52" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0"   stop-color="#ffe9a8"/>
        <stop offset=".28" stop-color="#ffc247"/>
        <stop offset=".52" stop-color="#ff9ec4"/>
        <stop offset=".72" stop-color="#8fd8ff"/>
        <stop offset="1"   stop-color="#ffd166"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd97a"/><stop offset="1" stop-color="#e39a12"/>
      </linearGradient>
    </defs>
    <g class="ce-spark">
      <path d="M6 9.5 7 6l1 3.5L11.5 10.5 8 11.5 7 15l-1-3.5L2.5 10.5Z"/>
      <path d="M49 17l.8-2.8.8 2.8 2.8.8-2.8.8-.8 2.8-.8-2.8-2.8-.8Z"/>
      <path d="M46.5 5.5l.6-2 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6Z"/>
    </g>
    <path d="M11 36 7.6 14.6l9.5 6.9L28 7.2l10.9 14.3 9.5-6.9L45 36Z"
          fill="url(#${id})" stroke="#b97d0c" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="28" cy="27.5" r="3.2" fill="#fff" opacity=".82"/>
    <circle cx="18.5" cy="30" r="2.2" fill="#fff" opacity=".6"/>
    <circle cx="37.5" cy="30" r="2.2" fill="#fff" opacity=".6"/>
    <circle cx="7.6" cy="14.6" r="2.6" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="1.6"/>
    <circle cx="28" cy="7.2" r="3" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="1.6"/>
    <circle cx="48.4" cy="14.6" r="2.6" fill="url(#${id}b)" stroke="#b97d0c" stroke-width="1.6"/>
    <rect x="9.4" y="38" width="37.2" height="8.4" rx="3"
          fill="url(#${id}b)" stroke="#b97d0c" stroke-width="2"/>
    <path d="M14 42.2h28" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Emblemi dei premi: stessa lega della corona (lamina, contorno inciso, luci),
// uno per ogni titolo. Disegnati sullo stesso viewBox 56x52.
// ---------------------------------------------------------------------------
let emblemSeq = 0;

const EMBLEMS = {
  // Gambler: coppia di dadi lanciati, uno d'avorio e uno rosso
  gambler: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffbe9"/><stop offset="1" stop-color="#ffe1a1"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff8f83"/><stop offset="1" stop-color="#b3271c"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ffc93f">
      <path d="M8 5.5 8.9 2.4 9.8 5.5 12.9 6.4 9.8 7.3 8.9 10.4 8 7.3 4.9 6.4Z"/>
      <path d="M50 34l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
    </g>
    <g transform="rotate(14 38 20)">
      <rect x="27" y="8" width="21" height="21" rx="5" fill="url(#${id}b)" stroke="#6e150d" stroke-width="2"/>
      <circle cx="33" cy="14" r="2" fill="#fff"/>
      <circle cx="37.5" cy="18.5" r="2" fill="#fff"/>
      <circle cx="42" cy="23" r="2" fill="#fff"/>
    </g>
    <g transform="rotate(-12 20 33)">
      <rect x="8" y="21" width="24" height="24" rx="5.5" fill="url(#${id})" stroke="#8a5a10" stroke-width="2"/>
      <circle cx="14.5" cy="27.5" r="2.2" fill="#7a4a08"/>
      <circle cx="25.5" cy="27.5" r="2.2" fill="#7a4a08"/>
      <circle cx="20" cy="33" r="2.2" fill="#7a4a08"/>
      <circle cx="14.5" cy="38.5" r="2.2" fill="#7a4a08"/>
      <circle cx="25.5" cy="38.5" r="2.2" fill="#7a4a08"/>
    </g>`,

  // Golosone: la bomba con la miccia accesa
  golosone: (id) => `
    <defs>
      <radialGradient id="${id}" cx=".35" cy=".3" r=".85">
        <stop offset="0" stop-color="#ff9d84"/><stop offset=".45" stop-color="#d33b2a"/>
        <stop offset="1" stop-color="#7a1710"/>
      </radialGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#c8721c"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ffb03a">
      <path d="M46.5 4.6 47.6.6l1.1 4 4 1.1-4 1.1-1.1 4-1.1-4-4-1.1Z"/>
      <path d="M40.6 14.2l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
    </g>
    <path d="M33 14.5c5.6-1.4 6.4-5.2 12-8.4" fill="none" stroke="#8a5a2a" stroke-width="2.8" stroke-linecap="round"/>
    <rect x="22.6" y="10.4" width="10.8" height="8.2" rx="2.4" transform="rotate(-16 28 14.5)"
          fill="url(#${id}b)" stroke="#5c1a12" stroke-width="1.8"/>
    <circle cx="27" cy="33" r="15" fill="url(#${id})" stroke="#5c1a12" stroke-width="2"/>
    <circle cx="21" cy="27.5" r="4.4" fill="#fff" opacity=".4"/>
    <circle cx="32.6" cy="39.4" r="2" fill="#fff" opacity=".22"/>`,

  // Cannoniere: il bersaglio centrato dal dardo
  cannoniere: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8fd8ff"/><stop offset=".55" stop-color="#3a8fd8"/>
        <stop offset="1" stop-color="#1b4e86"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd97a"/><stop offset="1" stop-color="#d98f16"/>
      </linearGradient>
    </defs>
    <circle cx="26" cy="28" r="17" fill="url(#${id})" stroke="#123f6b" stroke-width="2"/>
    <circle cx="26" cy="28" r="12" fill="#f7fbff" stroke="#123f6b" stroke-width="1.5"/>
    <circle cx="26" cy="28" r="7.2" fill="url(#${id})" stroke="#123f6b" stroke-width="1.5"/>
    <circle cx="26" cy="28" r="2.6" fill="#123f6b"/>
    <path d="M26 28 46.5 7.5" stroke="#7a4a22" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M40.6 7.9l6-1.4-1.4 6" fill="none" stroke="url(#${id}b)" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="20.4" cy="21.8" r="2.6" fill="#fff" opacity=".45"/>`,

  // Tanaia: il T-rex con le braccine corte, non arriva alla carta di troppo
  tanaia: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9fe8bf"/><stop offset=".55" stop-color="#3cb47e"/>
        <stop offset="1" stop-color="#15774f"/>
      </linearGradient>
    </defs>
    <path d="M9 12
             C5.5 13.5 4.6 17 7.2 19.4 L15 21.6
             C13.6 24.6 14.6 27.8 17.2 30
             C15.4 33.6 15.8 38.6 18.6 42.4 L18.2 46.6 L25 46.6 L24.6 42.8
             C27.4 43.6 30.6 43.4 33.2 42 L33.6 46.6 L40 46.6 L39 40
             C43.4 36.6 45.8 31.4 46 25.4 C49 23.4 51 20.4 51.6 16.6
             C48.4 19 45.2 20.2 41.8 20.2
             C40.6 13.2 34.6 8.2 27.2 8.2 C20.4 8.2 15.8 9.6 9 12 Z"
          fill="url(#${id})" stroke="#0e5238" stroke-width="2" stroke-linejoin="round"/>
    <path d="M8.4 18.6 15 20.4" fill="none" stroke="#0e5238" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M10.6 19.2l2 2.6 1-2.9 2.2 2.4.8-2.6" fill="#fff" stroke="none"/>
    <circle cx="17" cy="13.6" r="2.5" fill="#fff"/>
    <circle cx="17.6" cy="13.9" r="1.2" fill="#123f2b"/>
    <g fill="none" stroke-linecap="round">
      <path d="M17.4 27.6 c-3.8 .3 -5.6 2 -5.8 4.8" stroke="#0e5238" stroke-width="4.8"/>
      <path d="M17.4 27.6 c-3.8 .3 -5.6 2 -5.8 4.8" stroke="#5ecb96" stroke-width="2"/>
      <path d="M18.2 33.4 c-3 .4 -4.4 1.8 -4.6 4" stroke="#0e5238" stroke-width="4.4"/>
      <path d="M18.2 33.4 c-3 .4 -4.4 1.8 -4.6 4" stroke="#5ecb96" stroke-width="1.8"/>
      <path d="M11.6 32.8 l-2 1.4 M11.6 32.8 l-.2 2.4" stroke="#0e5238" stroke-width="1.7"/>
      <path d="M13.6 37.8 l-1.9 1.2 M13.6 37.8 l-.2 2.2" stroke="#0e5238" stroke-width="1.6"/>
    </g>`,

  // Surgelato: il cubetto di ghiaccio col fiocco inciso, brina intorno
  surgelato: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#eefaff"/><stop offset=".5" stop-color="#8fd8ff"/>
        <stop offset="1" stop-color="#3a9ad8"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#8fd8ff">
      <path d="M7 9l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L3.9 9.9Z"/>
      <path d="M50 38l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
      <path d="M46 6l.5-1.8.5 1.8 1.8.5-1.8.5-.5 1.8-.5-1.8-1.8-.5Z"/>
    </g>
    <g transform="rotate(-9 28 27)">
      <rect x="10" y="9" width="36" height="36" rx="8" fill="url(#${id})" stroke="#1f5f8f" stroke-width="2"/>
      <g stroke="#1f5f8f" stroke-width="2.3" stroke-linecap="round" fill="none">
        <path d="M28 15v24M16.8 20.5l22.4 13M39.2 20.5l-22.4 13"/>
        <path d="M28 15l-3 3M28 15l3 3M28 39l-3-3M28 39l3-3"/>
        <path d="M16.8 20.5l4-.7M16.8 20.5l.7 4M39.2 33.5l-4 .7M39.2 33.5l-.7-4"/>
        <path d="M39.2 20.5l-4-.7M39.2 20.5l-.7 4M16.8 33.5l4 .7M16.8 33.5l.7-4"/>
      </g>
      <circle cx="17.5" cy="15.5" r="3.4" fill="#fff" opacity=".6"/>
      <circle cx="39" cy="38" r="2" fill="#fff" opacity=".3"/>
    </g>`,

  // Architetto: la scalinata di carte, ogni mano piu' alta della precedente
  architetto: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#f0dfb8"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c9a6ff"/><stop offset="1" stop-color="#7a4fd0"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#b388ff">
      <path d="M8 12l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L4.9 12.9Z"/>
      <path d="M49.5 7l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
    </g>
    <g stroke="#4a3a2a" stroke-width="1.8" stroke-linejoin="round">
      <rect x="5" y="30" width="12.5" height="17" rx="2.4" fill="url(#${id})"/>
      <rect x="15.5" y="24" width="12.5" height="23" rx="2.4" fill="url(#${id})"/>
      <rect x="26" y="17" width="12.5" height="30" rx="2.4" fill="url(#${id})"/>
      <rect x="36.5" y="9" width="12.5" height="38" rx="2.4" fill="url(#${id})"/>
    </g>
    <g font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="700" font-size="7.5" text-anchor="middle" fill="url(#${id}b)">
      <text x="11.2" y="38.6">3</text><text x="21.7" y="32.6">5</text><text x="32.2" y="25.6">8</text><text x="42.7" y="17.6">12</text>
    </g>
    <path d="M9 26.5 41 5.5" fill="none" stroke="url(#${id}b)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1 4"/>
    <path d="M36 5.5h5.5V11" fill="none" stroke="#7a4fd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Colpo Grosso: il ventaglio di carte con dietro l'esplosione dei punti
  colpogrosso: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd166"/><stop offset=".5" stop-color="#ff8a3d"/><stop offset="1" stop-color="#d9441f"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#f0dfb8"/>
      </linearGradient>
    </defs>
    <path d="M28 3l3 8.6 8.2-4-4 8.2L44 19l-8.6 3 4 8.2-8.2-4L28 35l-3-8.6-8.2 4 4-8.2L12 19l8.6-3-4-8.2 8.2 4Z"
          fill="url(#${id})" stroke="#9a2f0f" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="28" cy="19" r="5.2" fill="#fff4b0" opacity=".85"/>
    <g class="ae-spark" fill="#ffc93f">
      <path d="M6 12l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L2.9 12.9Z"/>
      <path d="M49 30l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
    </g>
    <g stroke="#4a3a2a" stroke-width="1.8" stroke-linejoin="round">
      <rect x="9" y="24" width="15" height="21" rx="2.6" transform="rotate(-18 16.5 34.5)" fill="url(#${id}b)"/>
      <rect x="20.5" y="22" width="15" height="21" rx="2.6" transform="rotate(-4 28 32.5)" fill="url(#${id}b)"/>
      <rect x="32" y="24" width="15" height="21" rx="2.6" transform="rotate(12 39.5 34.5)" fill="url(#${id}b)"/>
    </g>
    <g font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="700" font-size="8.5" text-anchor="middle">
      <text x="15.5" y="37.5" fill="#d9441f" transform="rotate(-18 16.5 34.5)">12</text>
      <text x="28" y="36" fill="#7a4fd0" transform="rotate(-4 28 32.5)">11</text>
      <text x="39.5" y="37.5" fill="#2270b8" transform="rotate(12 39.5 34.5)">10</text>
    </g>`,

  // Sculone: il ferro di cavallo d'oro con il quadrifoglio, i due portafortuna
  sculone: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#ffc247"/><stop offset="1" stop-color="#d98f16"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a6ecc4"/><stop offset="1" stop-color="#1f9a62"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ffc93f">
      <path d="M6 9l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L2.9 9.9Z"/>
      <path d="M50 6l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
      <path d="M51 30l.6-2 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6Z"/>
    </g>
    <path d="M9 8 C5 26, 12 41, 22 42.5 C32 41, 39 26, 35 8" fill="none" stroke="#8a5a10" stroke-width="11.5" stroke-linecap="round"/>
    <path d="M9 8 C5 26, 12 41, 22 42.5 C32 41, 39 26, 35 8" fill="none" stroke="url(#${id})" stroke-width="8" stroke-linecap="round"/>
    <path d="M9.4 14 C7.8 25, 12 36, 20 39" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>
    <g fill="#8a5a10">
      <circle cx="8.6" cy="15" r="1.4"/><circle cx="9.6" cy="25" r="1.4"/><circle cx="14" cy="34" r="1.4"/>
      <circle cx="35.4" cy="15" r="1.4"/><circle cx="34.4" cy="25" r="1.4"/>
    </g>
    <path d="M40.5 41 c1.2 2.6, 2.6 4.6, 4.8 6.4" fill="none" stroke="#1a6b45" stroke-width="2.2" stroke-linecap="round"/>
    <g transform="translate(40 36)" fill="url(#${id}b)" stroke="#1a6b45" stroke-width="1.5" stroke-linejoin="round">
      <path d="M0 0 C-6-3-8.5-9-4.2-11.2 C-1.4-12.6 0-9.6 0-7.4 C0-9.6 1.4-12.6 4.2-11.2 C8.5-9 6-3 0 0Z"/>
      <path d="M0 0 C-6-3-8.5-9-4.2-11.2 C-1.4-12.6 0-9.6 0-7.4 C0-9.6 1.4-12.6 4.2-11.2 C8.5-9 6-3 0 0Z" transform="rotate(90)"/>
      <path d="M0 0 C-6-3-8.5-9-4.2-11.2 C-1.4-12.6 0-9.6 0-7.4 C0-9.6 1.4-12.6 4.2-11.2 C8.5-9 6-3 0 0Z" transform="rotate(180)"/>
      <path d="M0 0 C-6-3-8.5-9-4.2-11.2 C-1.4-12.6 0-9.6 0-7.4 C0-9.6 1.4-12.6 4.2-11.2 C8.5-9 6-3 0 0Z" transform="rotate(270)"/>
    </g>
    <circle cx="40" cy="36" r="1.4" fill="#fff" opacity=".75"/>
    <circle cx="36.5" cy="29.5" r="1.6" fill="#fff" opacity=".45"/>`,

  // Doppiogiochista: due carte x2 sbucate insieme, con le scintille della fortuna
  doppiogiochista: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffcf7a"/><stop offset=".5" stop-color="#ef9a2a"/><stop offset="1" stop-color="#c2660c"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ffc93f">
      <path d="M7 11l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L2.9 11.9Z"/>
      <path d="M50 15l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
      <path d="M45 42l.6-2 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6Z"/>
    </g>
    <g transform="rotate(-16 19 31)">
      <rect x="8.5" y="15" width="21" height="29" rx="4.6" fill="url(#${id})" stroke="#7d4104" stroke-width="2"/>
      <text x="19" y="34.4" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif"
            font-weight="700" font-size="13" fill="#fff8e6" stroke="#7d4104" stroke-width=".8">×2</text>
    </g>
    <g transform="rotate(15 38 28)">
      <rect x="27.5" y="11" width="21" height="29" rx="4.6" fill="url(#${id})" stroke="#7d4104" stroke-width="2"/>
      <text x="38" y="30.4" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif"
            font-weight="700" font-size="13" fill="#fff8e6" stroke="#7d4104" stroke-width=".8">×2</text>
      <path d="M31.5 15.5h7" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>
    </g>`,

  // Rosicone: la corona del secondo posto. Stessa sagoma di quella vera ma
  // d'argento e sfumata, come una Crown che non si e' mai presa del tutto.
  rosicone: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fbfdff"/><stop offset=".45" stop-color="#cfdae6"/>
        <stop offset="1" stop-color="#8b9aab"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e9eff6"/><stop offset="1" stop-color="#93a2b3"/>
      </linearGradient>
      <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0"   stop-color="#fff" stop-opacity="1"/>
        <stop offset=".38" stop-color="#fff" stop-opacity=".9"/>
        <stop offset=".72" stop-color="#fff" stop-opacity=".38"/>
        <stop offset="1"   stop-color="#fff" stop-opacity=".05"/>
      </linearGradient>
      <mask id="${id}m"><rect x="0" y="0" width="56" height="52" fill="url(#${id}f)"/></mask>
    </defs>
    <g class="ae-spark" fill="#c3d1de">
      <path d="M7.5 8.5 8.4 5.4l.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1-3.1-.9Z"/>
      <path d="M49.5 33l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
    </g>
    <g mask="url(#${id}m)">
      <path d="M11 36 7.6 14.6l9.5 6.9L28 7.2l10.9 14.3 9.5-6.9L45 36Z"
            fill="url(#${id})" stroke="#6d7c8d" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="18.5" cy="30" r="2.2" fill="#fff" opacity=".5"/>
      <circle cx="37.5" cy="30" r="2.2" fill="#fff" opacity=".5"/>
      <circle cx="7.6" cy="14.6" r="2.6" fill="url(#${id}b)" stroke="#6d7c8d" stroke-width="1.6"/>
      <circle cx="28" cy="7.2" r="3" fill="url(#${id}b)" stroke="#6d7c8d" stroke-width="1.6"/>
      <circle cx="48.4" cy="14.6" r="2.6" fill="url(#${id}b)" stroke="#6d7c8d" stroke-width="1.6"/>
      <rect x="9.4" y="38" width="37.2" height="8.4" rx="3"
            fill="url(#${id}b)" stroke="#6d7c8d" stroke-width="2"/>
    </g>
    <text x="28" y="45.4" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif"
          font-weight="700" font-size="8.4" fill="#5a697a">2</text>`,

  // Sette Vite: la carta della Seconda Chance con le vite di scorta che le
  // svolazzano intorno. Il gatto ne ha sette; a lui i cuori arrivano lo stesso.
  settevite: (id) => {
    const heart = "M12 20.6C6.8 16.8 3.2 13.5 3.2 9.7a4.8 4.8 0 0 1 8.8-2.7 4.8 4.8 0 0 1 8.8 2.7c0 3.8-3.6 7.1-8.8 10.9Z";
    return `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff9f92"/><stop offset=".5" stop-color="#e25549"/><stop offset="1" stop-color="#a92b21"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffd7d2"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ff9ec4">
      <path d="M7 12l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L2.9 12.9Z"/>
      <path d="M49.5 9l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
      <path d="M46 41l.6-2 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6Z"/>
    </g>
    <g transform="rotate(-8 28 27)">
      <rect x="14.5" y="7" width="27" height="38" rx="5.5" fill="url(#${id})" stroke="#8e2a20" stroke-width="2"/>
      <path d="M19 12h6.5" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>
      <g transform="translate(28 27.5) scale(.98) translate(-12 -12)">
        <path d="${heart}" fill="url(#${id}b)" stroke="#8e2a20" stroke-width="1.3" stroke-linejoin="round"/>
      </g>
    </g>
    <g transform="translate(45.5 17) rotate(15) scale(.44) translate(-12 -12)">
      <path d="${heart}" fill="#ff8ab8" stroke="#a92b21" stroke-width="1.7" stroke-linejoin="round"/>
    </g>
    <g transform="translate(10.5 35) rotate(-17) scale(.36) translate(-12 -12)">
      <path d="${heart}" fill="#ffb3cd" stroke="#a92b21" stroke-width="2" stroke-linejoin="round"/>
    </g>`;
  },

  // Iceman: la carta Congela lanciata, con la scia di brina dietro
  iceman: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#eefaff"/><stop offset=".5" stop-color="#8fd8ff"/><stop offset="1" stop-color="#2e86c8"/>
      </linearGradient>
    </defs>
    <g stroke="#8fd8ff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".85">
      <path d="M5 16h11"/><path d="M3 24h9"/><path d="M6 32h10"/>
    </g>
    <g class="ae-spark" fill="#c8efff">
      <path d="M48 7l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
      <path d="M50 40l.6-2 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6Z"/>
    </g>
    <g transform="rotate(12 33 26)">
      <rect x="22" y="7" width="24" height="34" rx="5" fill="url(#${id})" stroke="#1f5f8f" stroke-width="2"/>
      <g stroke="#1f5f8f" stroke-width="2" stroke-linecap="round" fill="none">
        <path d="M34 15v18M26.2 19.5l15.6 9M41.8 19.5l-15.6 9"/>
        <path d="M34 15l-2.2 2.2M34 15l2.2 2.2M34 33l-2.2-2.2M34 33l2.2-2.2"/>
      </g>
      <path d="M26 11h6" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>
    </g>`,

  // Bullo: le tre carte del Pesca Tre scagliate addosso a qualcuno
  bullo: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd166"/><stop offset=".55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#c9531a"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#f0dfb8"/>
      </linearGradient>
    </defs>
    <g stroke="#ffb07a" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".9">
      <path d="M4 14h9"/><path d="M2 22h8"/><path d="M5 30h9"/>
    </g>
    <g stroke="#7a3a12" stroke-width="1.8" stroke-linejoin="round">
      <rect x="18" y="20" width="14" height="20" rx="2.6" transform="rotate(-22 25 30)" fill="url(#${id}b)"/>
      <rect x="27" y="14" width="14" height="20" rx="2.6" transform="rotate(-8 34 24)" fill="url(#${id}b)"/>
      <rect x="36" y="8" width="14" height="20" rx="2.6" transform="rotate(8 43 18)" fill="url(#${id})"/>
    </g>
    <text x="43" y="21.5" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="700" font-size="9" fill="#fff8e6" stroke="#7a3a12" stroke-width=".6" transform="rotate(8 43 18)">3</text>
    <g class="ae-spark" fill="#ffc93f">
      <path d="M50 38l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
      <path d="M12 42l.6-2 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6Z"/>
    </g>`,

  // Generoso: la carta col cuore impacchettata col fiocco, come un regalo
  generoso: (id) => {
    const heart = "M12 20.6C6.8 16.8 3.2 13.5 3.2 9.7a4.8 4.8 0 0 1 8.8-2.7 4.8 4.8 0 0 1 8.8 2.7c0 3.8-3.6 7.1-8.8 10.9Z";
    return `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb3cd"/><stop offset=".5" stop-color="#e2558e"/><stop offset="1" stop-color="#a92b5e"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#e2a416"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ff9ec4">
      <path d="M8 10l.9-3.1.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1L4.9 10.9Z"/>
      <path d="M49 12l.7-2.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7Z"/>
    </g>
    <g transform="rotate(-6 28 28)">
      <rect x="14.5" y="10" width="27" height="38" rx="5.5" fill="url(#${id})" stroke="#8e2a4e" stroke-width="2"/>
      <g transform="translate(28 30) scale(.9) translate(-12 -12)">
        <path d="${heart}" fill="#fff" stroke="#8e2a4e" stroke-width="1.3" stroke-linejoin="round"/>
      </g>
      <rect x="26" y="10" width="4" height="38" fill="url(#${id}b)" stroke="#8a5a10" stroke-width="1.2"/>
      <rect x="14.5" y="27" width="27" height="4" fill="url(#${id}b)" stroke="#8a5a10" stroke-width="1.2"/>
    </g>
    <g fill="url(#${id}b)" stroke="#8a5a10" stroke-width="1.4" stroke-linejoin="round">
      <path d="M28 8 C22 2, 16 4, 20 9 Z"/>
      <path d="M28 8 C34 2, 40 4, 36 9 Z"/>
    </g>
    <circle cx="28" cy="8.5" r="2.2" fill="url(#${id}b)" stroke="#8a5a10" stroke-width="1.2"/>`;
  }
};

/** Emblema di un record. `kind` e' la chiave di EMBLEMS. */
export function awardEmblem(kind, cls = "") {
  const draw = EMBLEMS[kind] || EMBLEMS.gambler;
  return `<svg class="award-emblem ${cls}" viewBox="0 0 56 52" aria-hidden="true" focusable="false">
    ${draw("ae" + (++emblemSeq))}
  </svg>`;
}

/** Marchio "FLIP 7": la parola piu' la cartina col sette. */
export function wordmark(cls = "") {
  return `<span class="wordmark ${cls}"><b>FLIP</b><i class="w7">7</i></span>`;
}

const CARD_WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];

/**
 * Faccia di una carta numero (0-12) come nel gioco vero: fondo chiaro,
 * numero gigante, la parola in inglese sotto e gli indici agli angoli.
 */
export function numberCard(n, { on = false, size = "", attrs = "" } = {}) {
  return `<span class="fcard n${n} ${on ? "on" : ""} ${size}" data-face="${n}" ${attrs}><b>${n}</b><small>${CARD_WORDS[n] || ""}</small></span>`;
}

/**
 * Numero del round: disegnato come i numeri sulle carte (tinta del numero
 * corrispondente e contorno d'inchiostro), ma SENZA la carta attorno.
 */
export function roundCard(n) {
  const tone = ((n - 1) % 12) + 1;
  return `<span class="round-num n${tone}"><b>${n}</b></span>`;
}

/** Faccia di un modificatore (+2 … +10 oppure x2). */
export function modCard(value, { on = false, size = "", attrs = "" } = {}) {
  const isX2 = value === "x2";
  const label = isX2 ? "×2" : "+" + value;
  return `<span class="fcard mod ${isX2 ? "x2" : ""} ${on ? "on" : ""} ${size}" data-face="${label}" ${attrs}><b>${label}</b></span>`;
}

/** Ventaglio decorativo di carte vere (per copertine e stati vuoti). */
export function fanArt() {
  return `<span class="fan" aria-hidden="true">
    ${numberCard(3, { on: true })}${numberCard(7, { on: true })}${numberCard(12, { on: true })}
  </span>`;
}

/** Logo "G" di Google per il pulsante di accesso. */
export function googleG() {
  return `<svg class="gg" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>`;
}

/** Carta bonus Flip 7. */
export function flip7Card({ size = "", attrs = "" } = {}) {
  return `<span class="fcard flip7 on ${size}" data-face="7" ${attrs}><b>+15</b></span>`;
}

/** Faccia della Seconda Chance: la carta col cuore, la vita extra. */
export function heartCard({ on = true, size = "", attrs = "" } = {}) {
  return `<span class="fcard sc ${on ? "on" : ""} ${size}" data-face="♥" ${attrs}><i class="acard">${icon("heartFill")}</i></span>`;
}

/** Dorso della carta (il mazzo del tavolo online). */
export function cardBack({ size = "" } = {}) {
  return `<span class="fcard back ${size}"><b>FLIP<i>7</i></b></span>`;
}

// ---------------------------------------------------------------------------
// La carta del mese: il simbolo del campione di stagione. Non una medaglia,
// non una coccarda: la CARTA del mazzo di Flip 7 che porta il numero del mese
// (maggio = la carta 5, dicembre = la carta 12), col colore che quel numero ha
// nel gioco. Cornice d'oro da campione, l'anno nel cartiglio in basso, la
// faccia crema negli anni pari e notte in quelli dispari. Il mese in corso e'
// spento (grigio): la carta non e' ancora stata assegnata. Stesso viewBox 40x56
// (le proporzioni delle carte vere) per tutte le taglie.
// ---------------------------------------------------------------------------
const MONTHS_FULL = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
/** I colori delle carte numero, dall'1 al 12: gli stessi del mazzo (.n1….n12). */
export const SEASON_TONES = ["#9aa0a6", "#b1cb31", "#e04a63", "#2fa7a4", "#3aa246", "#8a56c2", "#c96f4a", "#8fc665", "#ef8c34", "#e03c31", "#6fa8dc", "#8d8272"];
let badgeSeq = 0;

const seasonMonth = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return { y: y || 0, n: Math.min(12, Math.max(1, m || 1)) };
};

/** Il colore della carta di quel mese ("2026-05" -> il verde del 5). */
export function seasonTone(key) {
  return SEASON_TONES[seasonMonth(key).n - 1];
}

/** Il ventaglio a raggi ai lati della carta, come le conchiglie del mazzo vero. */
function cardFan(cx, cy, r, dir, color) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a0 = (-90 + i * 26) * Math.PI / 180, a1 = a0 + 11 * Math.PI / 180;
    const x0 = cx + dir * Math.sin(a0) * r, y0 = cy - Math.cos(a0) * r;
    const x1 = cx + dir * Math.sin(a1) * r, y1 = cy - Math.cos(a1) * r;
    parts.push(`M${cx} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}Z`);
  }
  return `<path d="${parts.join("")}" fill="${color}" opacity=".32"/>`;
}

/**
 * @param {string} key  "2026-08"
 * @param {{cls?:string, muted?:boolean, title?:string}} opts  muted = mese in corso (spento, non ancora assegnato)
 */
export function seasonBadge(key, opts = {}) {
  const { y, n } = seasonMonth(key);
  const id = "sb" + (++badgeSeq);
  const muted = !!opts.muted;
  const night = !muted && y % 2 === 1;
  const tone = muted ? "#9aa0a6" : SEASON_TONES[n - 1];
  const face = night ? "#303356" : "#f6efdc";
  const ink = night ? "#f6efdc" : "#303356";
  const rim = muted ? ["#f2f5f8", "#bcc6d1", "#8494a4"] : ["#ffedb3", "#ffc247", "#cf8710"];
  const rimLine = muted ? "#6b7886" : "#8f5f0a";
  const yearInk = muted ? "#4f5b68" : "#3b2703";
  const title = opts.title || `Campione di ${MONTHS_FULL[n - 1]} ${y}`;
  return `<svg class="season-badge ${opts.cls || ""} ${muted ? "muted" : ""}" viewBox="0 0 40 56" role="img" aria-label="${title}" focusable="false">
    <title>${title}</title>
    <defs>
      <clipPath id="${id}c"><rect x="4.4" y="4.4" width="31.2" height="47.2" rx="2.4"/></clipPath>
      <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${rim[0]}"/><stop offset=".5" stop-color="${rim[1]}"/><stop offset="1" stop-color="${rim[2]}"/>
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="38" height="54" rx="4.5" fill="${face}" stroke="#fff" stroke-width="1.6"/>
    <rect x="3.3" y="3.3" width="33.4" height="49.4" rx="3" fill="none" stroke="url(#${id}r)" stroke-width="1.5"/>
    <rect x="5.4" y="5.4" width="29.2" height="45.2" rx="1.8" fill="none" stroke="url(#${id}r)" stroke-width=".55" opacity=".85"/>
    <g clip-path="url(#${id}c)">${cardFan(3.2, 28, 9.5, 1, tone)}${cardFan(36.8, 28, 9.5, -1, tone)}</g>
    <text x="20" y="33.5" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="600" font-size="${n >= 10 ? 23 : 28}" fill="${tone}" stroke="${ink}" stroke-width="1" paint-order="stroke" stroke-linejoin="round">${n}</text>
    <rect x="9" y="38.6" width="22" height="8.6" rx="1.7" fill="url(#${id}r)" stroke="${rimLine}" stroke-width=".5"/>
    <text x="20" y="44.9" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="600" font-size="6.2" letter-spacing=".5" fill="${yearInk}">${y}</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Sticker del tavolo: reazioni disegnate (facce e simboli), da lanciare sulla
// riga di chi ha appena sballato o fatto Flip 7. Stesso viewBox 48x48.
// ---------------------------------------------------------------------------
const FACE = (id, extra) => `
  <defs>
    <radialGradient id="${id}" cx=".35" cy=".3" r=".9">
      <stop offset="0" stop-color="#fff2a8"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#e9a11a"/>
    </radialGradient>
  </defs>
  <circle cx="24" cy="24" r="20" fill="url(#${id})" stroke="#9a6a0c" stroke-width="1.8"/>
  ${extra}`;

export const STICKERS = {
  lol: { label: "Che ridere", draw: (id) => FACE(id, `
    <path d="M13 20c2-3 5-3 7 0M28 20c2-3 5-3 7 0" fill="none" stroke="#5a3a06" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M13.5 27h21c-1 7-6 11-10.5 11S14.5 34 13.5 27Z" fill="#7a2a1a" stroke="#5a3a06" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M17 33.5c4-2 10-2 14 0-2 3-5 4.5-7 4.5s-5-1.5-7-4.5Z" fill="#ff8a94"/>
    <path d="M9 24c-3 2-3 6-.5 7 2.5-1 2.5-5 .5-7ZM39 24c3 2 3 6 .5 7-2.5-1-2.5-5-.5-7Z" fill="#6ec2ff" stroke="#2a7cc2" stroke-width="1.2"/>`) },
  wow: { label: "Wow", draw: (id) => FACE(id, `
    <circle cx="17" cy="20" r="4.2" fill="#fff" stroke="#5a3a06" stroke-width="1.6"/>
    <circle cx="31" cy="20" r="4.2" fill="#fff" stroke="#5a3a06" stroke-width="1.6"/>
    <circle cx="17.6" cy="20.6" r="2" fill="#3a2a10"/><circle cx="31.6" cy="20.6" r="2" fill="#3a2a10"/>
    <path d="M12 13c2-2 5-2.4 8-1M36 13c-2-2-5-2.4-8-1" fill="none" stroke="#5a3a06" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="24" cy="33" rx="5" ry="6" fill="#7a2a1a" stroke="#5a3a06" stroke-width="1.6"/>`) },
  cry: { label: "Che sfiga", draw: (id) => FACE(id, `
    <path d="M13 17c3 1 5 3 6 5M35 17c-3 1-5 3-6 5" fill="none" stroke="#5a3a06" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="17.5" cy="23" r="1.9" fill="#3a2a10"/><circle cx="30.5" cy="23" r="1.9" fill="#3a2a10"/>
    <path d="M16 36c3-4 13-4 16 0" fill="none" stroke="#5a3a06" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M16.5 26c-3 5-3 9 0 10 3-1 3-5 0-10Z" fill="#6ec2ff" stroke="#2a7cc2" stroke-width="1.2"/>
    <path d="M31.5 26c-3 5-3 9 0 10 3-1 3-5 0-10Z" fill="#6ec2ff" stroke="#2a7cc2" stroke-width="1.2"/>`) },
  cool: { label: "Troppo forte", draw: (id) => FACE(id, `
    <path d="M8 18h32" stroke="#23272f" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M11 18h11a1 1 0 0 1 1 1v3.5a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5V19a1 1 0 0 1 1-1Z" fill="#23272f"/>
    <path d="M26 18h11a1 1 0 0 1 1 1v3.5a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5V19a1 1 0 0 1 1-1Z" fill="#23272f"/>
    <path d="M13 21.5c1.6-1.4 4-1.6 6-1M28 21.5c1.6-1.4 4-1.6 6-1" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M15 32c4 4 14 4 18 0" fill="none" stroke="#5a3a06" stroke-width="2.4" stroke-linecap="round"/>`) },
  fire: { label: "Fuoco", draw: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#d9441f"/><stop offset=".55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffd166"/>
      </linearGradient>
    </defs>
    <path d="M24 4c2 7 9 10 9 19 0 3-1 5-2 7 4-1 7-5 7-10 3 5 4 11 1 16-4 7-11 9-15 9S13 43 9 36c-3-6 0-13 5-17-1 4 0 7 2 8-1-9 7-13 8-23Z" fill="url(#${id})" stroke="#9a2f0f" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M24 26c1 4 5 5 5 10 0 4-2 7-5 7s-5-3-5-7c0-4 4-6 5-10Z" fill="#fff4b0" opacity=".9"/>`
  },
  gg: { label: "Bravo", draw: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe0b8"/><stop offset="1" stop-color="#f0b57a"/>
      </linearGradient>
    </defs>
    <rect x="7" y="22" width="9" height="19" rx="2.5" fill="#2270b8" stroke="#123f6b" stroke-width="1.6"/>
    <path d="M17 41V23l6-5c1.5-1.5 3-6 3-10 0-2 1.5-3 3-2.5 2.5 1 3 5 1 11h9.5a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 1 1 7 3.5 3.5 0 0 1-2 7 3.5 3.5 0 0 1-3 6H26c-3 0-6-1.5-9-3Z" fill="url(#${id})" stroke="#8a5a2a" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M30 23.5h8M30 30.5h8M30 37.5h6" fill="none" stroke="#8a5a2a" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>`
  },
  // Che culo: il fondoschiena dello Sculone, con quadrifoglio e scintille
  culo: { label: "Che culo!", draw: (id) => `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe4c0"/><stop offset="1" stop-color="#e9a86b"/>
      </linearGradient>
    </defs>
    <g class="ae-spark" fill="#ffc93f">
      <path d="M6 10l.9-3 .9 3 3 .9-3 .9-.9 3-.9-3-3-.9Z"/>
      <path d="M42 40l.7-2.3.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7Z"/>
    </g>
    <path d="M14.5 11.5c3-2.8 16-2.8 19 0 3.6 3.2 4.7 9.4 4.1 15.6C37 34 33.8 39 29.5 39c-3.3 0-4.8-3-5.5-7-.7 4-2.2 7-5.5 7C14.2 39 11 34 10.4 27.1 9.8 20.9 10.9 14.7 14.5 11.5Z" fill="url(#${id})" stroke="#8a5a2a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M24 13c-1.8 6-1.8 13-.1 19" fill="none" stroke="#8a5a2a" stroke-width="1.7" stroke-linecap="round" opacity=".75"/>
    <path d="M14.6 20c.9-2.4 2.6-4.1 4.7-4.9M29 15.4c2.3.7 4.1 2.3 5 4.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>
    <g stroke="#0f6b42" stroke-width=".9">
      <circle cx="38.6" cy="8.4" r="2.4" fill="#3fbd7c"/><circle cx="43" cy="8.4" r="2.4" fill="#3fbd7c"/>
      <circle cx="38.6" cy="12.8" r="2.4" fill="#3fbd7c"/><circle cx="43" cy="12.8" r="2.4" fill="#3fbd7c"/>
    </g>
    <path d="M40.8 13.2c.4 3.2-.5 5.2-2.3 6.4" fill="none" stroke="#0f6b42" stroke-width="1.3" stroke-linecap="round"/>`
  },
  // Parolacce: la faccia paonazza e la nuvoletta con i simboli al posto delle parole
  rage: { label: "Parolacce", draw: (id) => `
    <defs>
      <radialGradient id="${id}" cx=".35" cy=".3" r=".9">
        <stop offset="0" stop-color="#ffa17a"/><stop offset=".55" stop-color="#e8452a"/><stop offset="1" stop-color="#a3200f"/>
      </radialGradient>
    </defs>
    <g fill="#fff" fill-opacity=".9" stroke="#c9d3dd" stroke-width=".9">
      <circle cx="5.6" cy="16" r="3"/><circle cx="9.8" cy="12.4" r="2.1"/>
    </g>
    <circle cx="18" cy="30" r="14" fill="url(#${id})" stroke="#7a1608" stroke-width="1.8"/>
    <path d="M7.5 25.4l7 3M28.5 25.4l-7 3" fill="none" stroke="#5c1206" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="12.6" cy="31" r="1.9" fill="#4a0f05"/><circle cx="23.4" cy="31" r="1.9" fill="#4a0f05"/>
    <rect x="10" y="35.2" width="16" height="6.6" rx="2.1" fill="#57120a" stroke="#7a1608" stroke-width="1.2"/>
    <path d="M10 38.5h16M14 35.2v6.6M18 35.2v6.6M22 35.2v6.6" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.2"/>
    <path d="M24 2h19a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H29l-6.5 5 1.8-5H24a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill="#fff8ec" stroke="#7a1608" stroke-width="1.7" stroke-linejoin="round"/>
    <text x="33.5" y="13.2" text-anchor="middle" font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="700" font-size="9" fill="#c0261a">#@%!</text>`
  },
  // Ciaone: linguaccia e occhiolino, lo sfottò di chi ti ha appena passato
  tongue: { label: "Ciaone", draw: (id) => FACE(id, `
    <path d="M13 21.5c2.2-3 5.3-3 7.4 0" fill="none" stroke="#5a3a06" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="31" cy="20.5" r="2.6" fill="#3a2a10"/>
    <path d="M27.6 15c2-1.5 4.6-1.5 6.6.2" fill="none" stroke="#5a3a06" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>
    <path d="M14 28h20c-1.5 6-5.5 9-10 9s-8.5-3-10-9Z" fill="#7a2a1a" stroke="#5a3a06" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M19 33c0-1.2 10-1.2 10 0v4.6a5 5 0 0 1-10 0Z" fill="#ff8a94" stroke="#b3505a" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M24 34.6v5.4" fill="none" stroke="#b3505a" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>`) },
  // Muoviti: la faccia che si addormenta aspettando il tuo turno
  sleep: { label: "Muoviti", draw: (id) => FACE(id, `
    <path d="M12.8 21.6c2 2.8 5 2.8 7 0M28.2 21.6c2 2.8 5 2.8 7 0" fill="none" stroke="#5a3a06" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="22" cy="33" rx="4.2" ry="3.4" fill="#7a2a1a" stroke="#5a3a06" stroke-width="1.5"/>
    <g font-family="Fredoka, 'Nunito Sans', sans-serif" font-weight="700" fill="#2270b8" stroke="#fff8ec" stroke-width="2" paint-order="stroke" stroke-linejoin="round">
      <text x="31" y="17" font-size="13">Z</text>
      <text x="38.5" y="10" font-size="9">Z</text>
    </g>`) }
};
let stickerSeq = 0;
export function sticker(kind, cls = "") {
  const def = STICKERS[kind] || STICKERS.wow;
  return `<svg class="sticker ${cls}" viewBox="0 0 48 48" aria-label="${def.label}" role="img" focusable="false">${def.draw("st" + (++stickerSeq))}</svg>`;
}
