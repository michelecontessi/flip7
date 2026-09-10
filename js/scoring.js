// ---------------------------------------------------------------------------
// Regole di punteggio di Flip 7 (logica pura, senza DOM).
//
//   punteggio round = ( somma carte numero  x2 se hai la carta x2 )
//                     + somma modificatori +2/+4/+6/+8/+10
//                     + 15 se hai fatto Flip 7 (7 carte numero diverse)
//   Se sballi (carta numero duplicata senza Second Chance) il round vale 0.
//
// Le vite extra (le carte col cuore, la Seconda Chance) NON danno punti: si
// segnano solo per la statistica, per sapere a chi finiscono in mano.
// ---------------------------------------------------------------------------

export const NUMBER_CARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const PLUS_MODIFIERS = [2, 4, 6, 8, 10];
export const FLIP7_BONUS = 15;
export const FLIP7_CARDS = 7;

/** Nel mazzo di Flip 7 le carte Seconda Chance sono tre. */
export const MAX_HEARTS = 3;
/** Quante vite extra (carte col cuore) sono finite in mano in questo round. */
export function heartsOf(entry) {
  const n = Math.round(Number((entry && entry.hearts) || 0));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_HEARTS) : 0;
}

/** Crea un'entry di round vuota. */
export function emptyEntry() {
  return { numbers: [], plus: [], doubled: false, busted: false, frozen: false, manual: null, flip7: false, hearts: 0 };
}

/**
 * Calcola il punteggio di un round.
 * `frozen` (colpito da un Congela) non cambia i punti: incassa le sue carte e
 * basta, ma spiega perche' quella mano e' corta.
 * @param {{numbers?:number[], plus?:number[], doubled?:boolean, busted?:boolean, frozen?:boolean, manual?:number|null}} entry
 */
export function computeRound(entry = {}) {
  const busted = Boolean(entry.busted);
  const frozen = Boolean(entry.frozen) && !busted;
  const numbers = [...new Set((entry.numbers || []).map(Number))].sort((a, b) => a - b);
  const plus = (entry.plus || []).map(Number);
  const doubled = Boolean(entry.doubled);
  const flip7 = numbers.length >= FLIP7_CARDS;
  const hearts = heartsOf(entry);

  if (busted) {
    return { total: 0, base: 0, doubledBase: 0, bonus: 0, flip7: false, busted: true, frozen: false, numbers, plus, doubled, cards: numbers.length, hearts };
  }

  // mano scritta come totale (col tastierino di una volta, che non c'e' piu'):
  // il numero sono i punti delle carte, il bonus Flip 7 (+15) stava a parte.
  // Le mani vecchie restano leggibili cosi' come sono.
  if (entry.manual !== null && entry.manual !== undefined && entry.manual !== "") {
    const typed = Math.max(0, Math.round(Number(entry.manual) || 0));
    const bonus = entry.flip7 ? FLIP7_BONUS : 0;
    return {
      total: typed + bonus, base: typed, doubledBase: typed, bonus,
      flip7: Boolean(entry.flip7), busted: false, frozen,
      numbers: [], plus: [], doubled: false, cards: 0, manual: true, typed, hearts
    };
  }

  const base = numbers.reduce((a, b) => a + b, 0);
  const doubledBase = doubled ? base * 2 : base;
  const bonus = plus.reduce((a, b) => a + b, 0);
  const total = doubledBase + bonus + (flip7 ? FLIP7_BONUS : 0);

  return { total, base, doubledBase, bonus, flip7, busted: false, frozen, numbers, plus, doubled, cards: numbers.length, hearts };
}

/** Formula leggibile tipo "(1+5+12) x2 +4 +15 Flip7". */
export function formulaOf(entry) {
  const r = computeRound(entry);
  // le vite extra non entrano nel conto: si dicono in coda, come nota
  const life = r.hearts ? (r.hearts === 1 ? " · 1 vita extra" : ` · ${r.hearts} vite extra`) : "";
  if (r.busted) return "sballato" + life;
  const frozen = (text) => (r.frozen ? `${text} · congelato` : text) + life;
  if (r.manual) return frozen(r.flip7 ? `${r.typed} + 15 Flip 7` : "punti inseriti a mano");
  if (!r.numbers.length && !r.plus.length) return (r.frozen ? "congelato senza carte" : "nessuna carta") + life;
  const parts = [];
  if (r.numbers.length) parts.push("(" + r.numbers.join("+") + ")");
  if (r.doubled) parts.push("×2");
  for (const p of r.plus) parts.push("+" + p);
  if (r.flip7) parts.push("+15 Flip 7");
  return frozen(parts.join(" "));
}

/** true se l'entry non contiene nessuna informazione. */
export function isBlankEntry(entry) {
  if (!entry) return true;
  if (entry.busted || entry.frozen) return false;
  if (heartsOf(entry)) return false;
  if (entry.manual !== null && entry.manual !== undefined && entry.manual !== "") return false;
  return !(entry.numbers || []).length && !(entry.plus || []).length && !entry.doubled && !entry.flip7;
}
