// ---------------------------------------------------------------------------
// Regole di punteggio di Flip 7 (logica pura, senza DOM).
//
//   punteggio round = ( somma carte numero  x2 se hai la carta x2 )
//                     + somma modificatori +2/+4/+6/+8/+10
//                     + 15 se hai fatto Flip 7 (7 carte numero diverse)
//   Se sballi (carta numero duplicata senza Second Chance) il round vale 0.
// ---------------------------------------------------------------------------

export const NUMBER_CARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const PLUS_MODIFIERS = [2, 4, 6, 8, 10];
export const FLIP7_BONUS = 15;
export const FLIP7_CARDS = 7;

/** Crea un'entry di round vuota. */
export function emptyEntry() {
  return { numbers: [], plus: [], doubled: false, busted: false, manual: null, flip7: false };
}

/**
 * Calcola il punteggio di un round.
 * @param {{numbers?:number[], plus?:number[], doubled?:boolean, busted?:boolean, manual?:number|null}} entry
 */
export function computeRound(entry = {}) {
  const busted = Boolean(entry.busted);
  const numbers = [...new Set((entry.numbers || []).map(Number))].sort((a, b) => a - b);
  const plus = (entry.plus || []).map(Number);
  const doubled = Boolean(entry.doubled);
  const flip7 = numbers.length >= FLIP7_CARDS;

  if (busted) {
    return { total: 0, base: 0, doubledBase: 0, bonus: 0, flip7: false, busted: true, numbers, plus, doubled, cards: numbers.length };
  }

  // inserimento diretto col tastierino: il numero digitato sono i punti delle carte,
  // il bonus Flip 7 (+15) si aggiunge con l'apposito interruttore.
  if (entry.manual !== null && entry.manual !== undefined && entry.manual !== "") {
    const typed = Math.max(0, Math.round(Number(entry.manual) || 0));
    const bonus = entry.flip7 ? FLIP7_BONUS : 0;
    return {
      total: typed + bonus, base: typed, doubledBase: typed, bonus,
      flip7: Boolean(entry.flip7), busted: false,
      numbers: [], plus: [], doubled: false, cards: 0, manual: true, typed
    };
  }

  const base = numbers.reduce((a, b) => a + b, 0);
  const doubledBase = doubled ? base * 2 : base;
  const bonus = plus.reduce((a, b) => a + b, 0);
  const total = doubledBase + bonus + (flip7 ? FLIP7_BONUS : 0);

  return { total, base, doubledBase, bonus, flip7, busted: false, numbers, plus, doubled, cards: numbers.length };
}

/** Formula leggibile tipo "(1+5+12) x2 +4 +15 Flip7". */
export function formulaOf(entry) {
  const r = computeRound(entry);
  if (r.busted) return "sballato";
  if (r.manual) return r.flip7 ? `${r.typed} + 15 Flip 7` : "punti inseriti a mano";
  if (!r.numbers.length && !r.plus.length) return "nessuna carta";
  const parts = [];
  if (r.numbers.length) parts.push("(" + r.numbers.join("+") + ")");
  if (r.doubled) parts.push("×2");
  for (const p of r.plus) parts.push("+" + p);
  if (r.flip7) parts.push("+15 Flip 7");
  return parts.join(" ");
}

/** true se l'entry non contiene nessuna informazione. */
export function isBlankEntry(entry) {
  if (!entry) return true;
  if (entry.busted) return false;
  if (entry.manual !== null && entry.manual !== undefined && entry.manual !== "") return false;
  return !(entry.numbers || []).length && !(entry.plus || []).length && !entry.doubled && !entry.flip7;
}
