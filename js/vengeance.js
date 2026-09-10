// ---------------------------------------------------------------------------
// Flip 7: With a Vengeance - il mazzo e le regole delle carte (logica pura).
// Dal regolamento ufficiale (The Op, Ruleset Edition 1):
//   - 108 carte: 92 numeri (un 1, due 2 ... dodici 12 e dodici 13, piu' le tre
//     carte speciali che sono l'unico 0, il settimo 7 e il tredicesimo 13:
//     The Zero, Unlucky 7 e Lucky 13), 6 modificatori (÷2, -2, -4, -6, -8,
//     -10: uno ciascuno) e 10 azioni (Just One More, Flip Four, Swap, Steal,
//     Discard: due ciascuna)
//   - punteggio: somma dei numeri, ÷2 (per difetto) se hai il ÷2, meno i
//     negativi (mai sotto zero), +15 con il Flip 7
//   - The Zero: la mano vale 0 finche' non fai Flip 7, e devi sempre pescare
//   - Unlucky 7: butti tutti i numeri e i modificatori, tieni solo il 7
//     (ricevendolo non sballi mai, nemmeno se avevi gia' un 7)
//   - Lucky 13: puoi tenere un secondo 13; con il terzo sballi
//   - chi si e' fermato NON e' al sicuro: azioni e modificatori si giocano su
//     chiunque non abbia sballato, fermi compresi; le carte speciali fanno
//     effetto appena arrivano in mano (anche rubate o scambiate) e smettono
//     appena se ne vanno
// Il flusso del turno (pescate, scelte, fine round) sta in game.js: qui ci
// sono mazzo, carte, mani, conti e le mosse dei bot.
// ---------------------------------------------------------------------------

// Codici carta (non si sovrappongono a quelli del mazzo base):
//   numeri: "n1".."n13" (sei n7, dodici n13) + "z0" The Zero, "u7" Unlucky 7,
//   "l13" Lucky 13 · modificatori: "d2" ÷2, "m2".."m10" negativi · azioni:
//   "jom" Just One More, "fl4" Flip Four, "swp" Swap, "stl" Steal, "dsc" Discard
export const ACTIONS = ["jom", "fl4", "swp", "stl", "dsc"];
export const MODS = ["d2", "m2", "m4", "m6", "m8", "m10"];
export const SPECIALS = ["z0", "u7", "l13"];

export const VC = {
  isNum: (c) => /^n\d+$/.test(c) || SPECIALS.includes(c),
  num: (c) => (c === "z0" ? 0 : c === "u7" ? 7 : c === "l13" ? 13 : Number(c.slice(1))),
  isSpecial: (c) => SPECIALS.includes(c),
  isMod: (c) => MODS.includes(c),
  isNeg: (c) => MODS.includes(c) && c !== "d2",
  neg: (c) => Number(c.slice(1)),
  isAction: (c) => ACTIONS.includes(c),
  /** si assegnano a un giocatore (anche a se stessi) */
  isGiven: (c) => c === "jom" || c === "fl4",
  /** si usano toccando carte sul tavolo */
  isPick: (c) => c === "swp" || c === "stl" || c === "dsc"
};
/** true se il codice esiste solo nel mazzo Vengeance (i numeri 1-12 sono in comune). */
export const isVCard = (c) => VC.isSpecial(c) || VC.isMod(c) || VC.isAction(c);

export const LABEL = {
  z0: "The Zero", u7: "Unlucky 7", l13: "Lucky 13",
  d2: "÷2", m2: "−2", m4: "−4", m6: "−6", m8: "−8", m10: "−10",
  jom: "Just One More", fl4: "Flip Four", swp: "Swap", stl: "Steal", dsc: "Discard"
};
export function cardLabel(c) {
  if (LABEL[c]) return LABEL[c];
  if (VC.isNum(c)) return String(VC.num(c));
  return c;
}

/** Il mazzo completo da 108 carte. */
export function fullDeck() {
  const d = ["z0", "n1"];
  for (let n = 2; n <= 13; n++) {
    const copies = n === 7 || n === 13 ? n - 1 : n; // il settimo 7 e' l'Unlucky, il tredicesimo 13 il Lucky
    for (let i = 0; i < copies; i++) d.push("n" + n);
  }
  d.push("u7", "l13", ...MODS);
  for (const a of ACTIONS) d.push(a, a);
  return d;
}

// ---------------------------------------------------------------------------
// La mano: in mano stanno SOLO numeri e modificatori (le azioni si giocano
// subito). `cards` e' l'elenco dei codici, in ordine di arrivo. `dealt`: ha
// ricevuto la prima carta del round. `mustStay`: dopo un Just One More si
// ferma appena ha risolto quello che ha pescato. `marks`: chi gli ha tirato
// cosa (per le note in riga).
// ---------------------------------------------------------------------------
export const emptyHand = () => ({ cards: [], out: null, bustCard: null, chose: false, blocked: false, dealt: false, mustStay: false, marks: [] });

export const numsOf = (h) => h.cards.filter(VC.isNum).map(VC.num);
export const hasZero = (h) => h.cards.includes("z0");

/**
 * Il conto della mano, passo per passo (per farlo capire a fine round):
 * somma dei numeri -> ÷2 -> meno i negativi -> mai sotto zero -> +15.
 * Con The Zero in mano vale 0, a meno del Flip 7 (allora si conta normale).
 */
export function scoreSteps(h) {
  const nums = numsOf(h);
  const sum = nums.reduce((a, b) => a + b, 0);
  const flip7 = h.out === "flip7";
  const zero = hasZero(h) && !flip7;
  const div = h.cards.includes("d2");
  const afterDiv = div ? Math.floor(sum / 2) : sum;
  const neg = h.cards.filter(VC.isNeg).reduce((a, c) => a + VC.neg(c), 0);
  const afterNeg = afterDiv - neg;
  const floored = afterNeg < 0;
  const base = zero ? 0 : Math.max(0, afterNeg);
  return { sum, div, afterDiv, neg, afterNeg, floored, zero, flip7, total: base + (flip7 ? 15 : 0), count: nums.length };
}
/** Punti della mano (chi ha sballato ne vale 0: lo decide chi chiama). */
export const handPoints = (h) => scoreSteps(h).total;

/** Un numero in piu' farebbe sballare? (Unlucky 7 mai; con Lucky 13 il secondo 13 passa.) */
export function wouldBust(h, c) {
  if (!VC.isNum(c) || c === "u7") return false;
  const v = VC.num(c);
  const have = h.cards.filter((x) => VC.isNum(x) && VC.num(x) === v).length;
  const lucky = v === 13 && (h.cards.includes("l13") || c === "l13");
  return have + 1 > (lucky ? 2 : 1);
}

export function removeCard(cards, c) {
  const i = cards.indexOf(c);
  return i < 0 ? cards : [...cards.slice(0, i), ...cards.slice(i + 1)];
}

/**
 * Una carta (numero o modificatore) entra nella mano di `sid`, da qualunque
 * parte arrivi: pescata, rubata, scambiata, regalata. Applica il doppione
 * (sballo), l'Unlucky 7 (butta tutto) e il Flip 7.
 * Ritorna { res: "bust" | "unlucky" | "flip7" | "kept", gone? }.
 */
export function addCard(s, sid, c) {
  const h = s.hands[sid];
  if (wouldBust(h, c)) {
    h.out = "bust";
    h.bustCard = c;
    s.discard = [...s.discard, c];
    return { res: "bust" };
  }
  if (c === "u7") {
    const gone = h.cards.slice();
    h.cards = ["u7"];
    s.discard = [...s.discard, ...gone];
    return { res: "unlucky", gone };
  }
  h.cards = [...h.cards, c];
  if (VC.isNum(c) && numsOf(h).length >= 7) { h.out = "flip7"; return { res: "flip7" }; }
  return { res: "kept" };
}

// ---------------------------------------------------------------------------
// Bersagli: chi non ha sballato e' colpibile, fermo o no
// ---------------------------------------------------------------------------
export const inRound = (s, sid) => {
  const h = s.hands[sid];
  return Boolean(h) && h.out !== "bust" && h.out !== "flip7" && h.out !== "excluded" && !(s.seats[sid] && s.seats[sid].blocked);
};
export const nonBusted = (s) => s.order.filter((sid) => inRound(s, sid));
export const withCards = (s) => nonBusted(s).filter((sid) => s.hands[sid].cards.length > 0);

/** `sid` puo' usare Steal / Discard / Swap? (altrimenti la carta si scarta) */
export function canUse(s, sid, type) {
  if (type === "stl") return withCards(s).some((x) => x !== sid);
  if (type === "dsc") return withCards(s).length > 0;
  if (type === "swp") return withCards(s).length >= 2;
  return true;
}

/**
 * Le carte che `sid` puo' toccare con quella azione: [{sid, card}].
 * Per lo Swap, con la prima carta gia' scelta (`first`), restano quelle
 * degli ALTRI giocatori.
 */
export function pickable(s, sid, type, first = null) {
  const out = [];
  for (const x of withCards(s)) {
    if (type === "stl" && x === sid) continue;
    if (type === "swp" && first && x === first.sid) continue;
    for (const card of s.hands[x].cards) out.push({ sid: x, card });
  }
  return out;
}

/** Le scelte sono valide per quella azione? */
export function validPicks(s, sid, type, picks) {
  if (!Array.isArray(picks)) return false;
  const ok = (p, first) => p && pickable(s, sid, type, first).some((q) => q.sid === p.sid && q.card === p.card);
  if (type === "swp") return picks.length === 2 && ok(picks[0]) && ok(picks[1], picks[0]);
  return picks.length === 1 && ok(picks[0]);
}

/**
 * Applica Steal / Discard / Swap. Scrive `s.lastMove` (per l'animazione:
 * quale carta va da dove a dove, con l'istante `at` che la identifica anche
 * se il tavolo viene riscritto da un voto o da un battito) e le note "chi ha
 * fatto cosa".
 * Ritorna { busted: [sid], flip7: [sid] }.
 */
export function applyPick(s, type, picks, byId) {
  const result = { busted: [], flip7: [] };
  const take = (p) => { s.hands[p.sid].cards = removeCard(s.hands[p.sid].cards, p.card); };
  const mark = (sid, m) => { const h = s.hands[sid]; h.marks = [...(h.marks || []), m].slice(-3); };
  const give = (sid, c) => {
    const r = addCard(s, sid, c);
    if (r.res === "bust") result.busted.push(sid);
    if (r.res === "flip7") result.flip7.push(sid);
    if (r.res === "unlucky") s.lastMove.wipe = { seat: sid, cards: r.gone };
  };
  if (type === "stl") {
    const [p] = picks;
    take(p);
    s.lastMove = { type: "steal", by: byId, at: Date.now(), moves: [{ card: p.card, from: p.sid, to: byId }] };
    mark(p.sid, { type: "stl", by: byId, card: p.card });
    give(byId, p.card);
  } else if (type === "dsc") {
    const [p] = picks;
    take(p);
    s.discard = [...s.discard, p.card];
    s.lastMove = { type: "discard", by: byId, at: Date.now(), moves: [{ card: p.card, from: p.sid, to: null }] };
    if (p.sid !== byId) mark(p.sid, { type: "dsc", by: byId, card: p.card });
  } else if (type === "swp") {
    const [a, b] = picks;
    take(a); take(b);
    s.lastMove = { type: "swap", by: byId, at: Date.now(), moves: [{ card: a.card, from: a.sid, to: b.sid }, { card: b.card, from: b.sid, to: a.sid }] };
    if (a.sid !== byId) mark(a.sid, { type: "swp", by: byId, card: a.card });
    if (b.sid !== byId) mark(b.sid, { type: "swp", by: byId, card: b.card });
    give(b.sid, a.card);
    give(a.sid, b.card);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Bot: guardano solo quello che c'e' sul tavolo, mai il mazzo
// ---------------------------------------------------------------------------
const seatValue = (s, sid) => (s.seats[sid].total || 0) + (s.hands[sid].out === "bust" ? 0 : handPoints(s.hands[sid]));

/** Simula una mossa su una copia e dice quanto ci guadagna `me` (suo +, altrui -). */
function gainOf(s, me, type, picks) {
  const sim = { order: s.order, seats: s.seats, hands: structuredClone(s.hands), discard: [], lastMove: null };
  applyPick(sim, type, picks, me);
  let gain = 0;
  for (const sid of s.order) {
    const d = seatValue(sim, sid) - seatValue(s, sid);
    gain += sid === me ? d : -d;
  }
  return gain;
}

/** A chi dare un modificatore, un Flip Four o un Just One More. */
export function botTarget(s, sid, type, options) {
  const others = options.filter((x) => x !== sid);
  if (!others.length) return options[0];
  const richest = (list) => list.slice().sort((a, b) => seatValue(s, b) - seatValue(s, a))[0];
  // Flip Four a chi ha piu' numeri in mano (piu' facile che sballi), a parita' al piu' ricco
  if (type === "fl4") return others.slice().sort((a, b) => numsOf(s.hands[b]).length - numsOf(s.hands[a]).length || seatValue(s, b) - seatValue(s, a))[0];
  // Just One More ferma chi e' ancora in gioco: al piu' ricco fra gli attivi
  if (type === "jom") { const active = others.filter((x) => !s.hands[x].out); return richest(active.length ? active : others); }
  return richest(others);
}

/** Quali carte toccare con Steal, Discard o Swap: la mossa che rende di piu'. */
export function botPick(s, sid, type) {
  let best = null, bestGain = -Infinity;
  const consider = (picks) => { const g = gainOf(s, sid, type, picks); if (g > bestGain) { bestGain = g; best = picks; } };
  if (type === "swp") {
    const all = pickable(s, sid, type);
    for (const a of all) for (const b of all) if (a.sid !== b.sid) consider([a, b]);
  } else {
    for (const p of pickable(s, sid, type)) consider([p]);
  }
  return best;
}
