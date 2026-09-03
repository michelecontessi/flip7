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
  snow: `<path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6"/>
         <path d="M9.4 4.4 12 6.6l2.6-2.2M9.4 19.6 12 17.4l2.6 2.2M3.9 10.7l3.2.6.7-3.2M20.1 13.3l-3.2-.6-.7 3.2M3.9 13.3l3.2-.6.7 3.2M20.1 10.7l-3.2.6-.7-3.2"/>`
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
    <path d="M36 5.5h5.5V11" fill="none" stroke="#7a4fd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
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
export function numberCard(n, { on = false, size = "" } = {}) {
  return `<span class="fcard n${n} ${on ? "on" : ""} ${size}" data-face="${n}"><b>${n}</b><small>${CARD_WORDS[n] || ""}</small></span>`;
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
export function modCard(value, { on = false, size = "" } = {}) {
  const isX2 = value === "x2";
  const label = isX2 ? "×2" : "+" + value;
  return `<span class="fcard mod ${isX2 ? "x2" : ""} ${on ? "on" : ""} ${size}" data-face="${label}"><b>${label}</b></span>`;
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
export function flip7Card({ size = "" } = {}) {
  return `<span class="fcard flip7 on ${size}" data-face="7"><b>+15</b></span>`;
}

/** Dorso della carta (il mazzo del tavolo online). */
export function cardBack({ size = "" } = {}) {
  return `<span class="fcard back ${size}"><b>FLIP<i>7</i></b></span>`;
}
