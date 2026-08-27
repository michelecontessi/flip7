// ---------------------------------------------------------------------------
// Motore del gioco online di Flip 7 (logica pura, testabile).
// Regole implementate dal regolamento ufficiale:
//   - mazzo da 94 carte: numeri (un 0, un 1, due 2 ... dodici 12),
//     modificatori +2 +4 +6 +8 +10 x2 (uno ciascuno), azioni x3
//     (Congela, Pesca Tre, Seconda Chance)
//   - al tuo turno: pesca o stai; il doppione fa sballare (solo i numeri)
//   - Seconda Chance: annulla un doppione; la seconda va regalata
//   - Congela: il bersaglio incassa ed esce dal round
//   - Pesca Tre: il bersaglio pesca 3 carte; le azioni pescate durante
//     si mettono da parte e si risolvono dopo (perse se sballa)
//   - FLIP 7: sette numeri diversi -> +15 e il round finisce SUBITO per tutti;
//     chi era ancora in gioco incassa comunque le proprie carte
//   - punteggio: (somma numeri, x2 se hai il x2) + modificatori + eventuale 15
//   - il mazzo continua fra i round; finito, si rimescolano gli scarti
// ---------------------------------------------------------------------------

export const CARD = {
  isNum: (c) => c[0] === "n",
  num: (c) => Number(c.slice(1)),
  isPlus: (c) => c[0] === "p",
  plus: (c) => Number(c.slice(1)),
  isX2: (c) => c === "x2",
  isAction: (c) => c === "frz" || c === "fl3" || c === "sc"
};

/** Mazzo completo da 94 carte. */
export function fullDeck() {
  const deck = [];
  deck.push("n0");
  for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) deck.push("n" + n);
  deck.push("p2", "p4", "p6", "p8", "p10", "x2");
  for (let i = 0; i < 3; i++) deck.push("frz", "fl3", "sc");
  return deck;
}

export function shuffle(cards, rng = Math.random) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const emptyHand = () => ({ nums: [], plus: [], x2: false, sc: false, out: null, bustCard: null });

/** Normalizza uno stato letto dal database (gli array vuoti spariscono). */
export function normalizeGame(g) {
  if (!g) return null;
  const state = { ...g };
  state.order = g.order || [];
  state.deck = g.deck || [];
  state.discard = g.discard || [];
  state.seats = g.seats || {};
  state.hands = {};
  for (const sid of state.order) {
    const h = (g.hands || {})[sid] || {};
    state.hands[sid] = { nums: h.nums || [], plus: h.plus || [], x2: Boolean(h.x2), sc: Boolean(h.sc), out: h.out || null, bustCard: h.bustCard ?? null };
  }
  state.pending = g.pending || null;
  state.flip3 = g.flip3 ? { ...g.flip3, deferred: g.flip3.deferred || [] } : null;
  state.log = g.log || [];
  state.lastDraw = g.lastDraw || null;
  state.lastRound = g.lastRound || null;
  state.trend = g.trend || [];
  return state;
}

/** Crea il tavolo in attesa di giocatori. */
export function createLobby(target = 200) {
  return { status: "lobby", target, round: 0, seats: {}, order: [], deck: [], discard: [], hands: {}, log: [] };
}

/** Avvia la partita (deckOverride serve ai test). */
export function startGame(state, rng = Math.random, deckOverride = null) {
  if (state.order.length < 2) throw new Error("Servono almeno 2 giocatori seduti");
  const s = { ...state, status: "playing", round: 1, discard: [], pending: null, flip3: null, lastDraw: null, lastRound: null, trend: [] };
  s.deck = deckOverride ? [...deckOverride] : shuffle(fullDeck(), rng);
  s.hands = {};
  for (const sid of s.order) s.hands[sid] = emptyHand();
  s.turn = s.order[0];
  s.log = [];
  return s;
}

const activeSeats = (s) => s.order.filter((sid) => !s.hands[sid].out);

function logIt(s, msg) {
  s.log = [...(s.log || []), msg].slice(-8);
}

function drawOne(s, rng) {
  if (!s.deck.length) {
    s.deck = shuffle(s.discard, rng);
    s.discard = [];
    logIt(s, "Mazzo finito: rimescolo gli scarti");
  }
  return s.deck.pop() || null;
}

/** Punti di una mano (senza il bonus, che dipende da out === "flip7"). */
export function handPoints(h) {
  let base = h.nums.reduce((a, b) => a + b, 0);
  if (h.x2) base *= 2;
  return base + h.plus.reduce((a, b) => a + b, 0) + (h.out === "flip7" ? 15 : 0);
}

function endRound(s) {
  s.lastRound = {};
  for (const sid of s.order) {
    const h = s.hands[sid];
    if (!h.out) h.out = "stay"; // il round e' finito: chi era in gioco incassa
    const pts = h.out === "bust" ? 0 : handPoints(h);
    s.lastRound[sid] = pts;
    s.seats[sid] = { ...s.seats[sid], total: (s.seats[sid].total || 0) + pts };
    // le carte usate vanno negli scarti
    s.discard = [...s.discard, ...h.nums.map((n) => "n" + n), ...h.plus.map((p) => "p" + p)];
    if (h.x2) s.discard.push("x2");
    if (h.sc) s.discard.push("sc");
  }
  s.pending = null;
  s.flip3 = null;
  // storia dei totali round per round (per il grafico di andamento)
  s.trend = [...(s.trend || []), Object.fromEntries(s.order.map((sid) => [sid, s.seats[sid].total || 0]))];
  const someoneWon = s.order.some((sid) => (s.seats[sid].total || 0) >= s.target);
  s.status = someoneWon ? "over" : "roundEnd";
  return s;
}

/** Prepara il round successivo (l'ordine ruota: cambia chi parte). */
export function nextRound(state) {
  const s = { ...state, status: "playing", round: state.round + 1, pending: null, flip3: null, lastDraw: null, lastRound: null };
  s.order = [...state.order.slice(1), state.order[0]];
  s.hands = {};
  for (const sid of s.order) s.hands[sid] = emptyHand();
  s.turn = s.order[0];
  return s;
}

/**
 * Un giocatore abbandona il tavolo a partita in corso: le sue carte vanno
 * negli scarti e il gioco prosegue senza di lui. Se resta una sola persona,
 * la partita finisce subito.
 */
export function leaveSeat(state, sid) {
  if (!state.order.includes(sid)) return state;
  const s = structuredClone(state);
  logIt(s, `${s.seats[sid].name} ha abbandonato il tavolo`);

  const h = s.hands[sid];
  if (h) {
    s.discard = [...s.discard, ...h.nums.map((n) => "n" + n), ...h.plus.map((p) => "p" + p)];
    if (h.x2) s.discard.push("x2");
    if (h.sc) s.discard.push("sc");
  }
  const wasTurn = s.turn === sid;
  const idx = s.order.indexOf(sid); // dopo la rimozione punta al posto successivo
  delete s.seats[sid];
  delete s.hands[sid];
  s.order = s.order.filter((x) => x !== sid);
  if (s.lastDraw && s.lastDraw.seat === sid) s.lastDraw = null;

  if (s.order.length < 2 && s.status !== "lobby") {
    s.status = "over";
    s.pending = null;
    s.flip3 = null;
    return s;
  }

  if (s.flip3 && s.flip3.target === sid) {
    s.discard = [...s.discard, ...(s.flip3.deferred || [])];
    s.flip3 = null;
  }
  if (s.pending) {
    if (s.pending.chooser === sid) s.pending = null;
    else {
      s.pending.options = s.pending.options.filter((x) => x !== sid);
      if (!s.pending.options.length) s.pending = null;
    }
  }

  if (s.status === "playing") {
    const act = activeSeats(s);
    if (!act.length) return endRound(s);
    if ((wasTurn && !s.pending && !s.flip3) || !s.order.includes(s.turn)) {
      for (let i = 0; i < s.order.length; i++) {
        const cand = s.order[(idx + i) % s.order.length];
        if (!s.hands[cand].out) { s.turn = cand; break; }
      }
    }
  }
  return s;
}

function advanceTurn(s) {
  const act = activeSeats(s);
  if (!act.length) return endRound(s);
  if (s.flip3 || s.pending) return s; // il turno resta fermo finche' non si risolve
  const from = s.order.indexOf(s.turn);
  for (let i = 1; i <= s.order.length; i++) {
    const sid = s.order[(from + i) % s.order.length];
    if (!s.hands[sid].out) { s.turn = sid; return s; }
  }
  return endRound(s);
}

/** Il giocatore di turno si ferma e incassa. */
export function stay(state, seatId) {
  if (state.status !== "playing" || state.turn !== seatId || state.pending || state.flip3) return state;
  const s = structuredClone(state);
  s.hands[seatId].out = "stay";
  logIt(s, `${s.seats[seatId].name} sta`);
  return advanceTurn(s);
}

/**
 * Applica UNA carta pescata alla mano di seatId.
 * Ritorna "bust" | "flip7" | "sc-used" | "kept" | "pending" | "deferred" | "given".
 */
function applyCard(s, seatId, card, duringFlip3, rng) {
  const h = s.hands[seatId];
  s.lastDraw = { seat: seatId, card };

  if (CARD.isNum(card)) {
    const n = CARD.num(card);
    if (h.nums.includes(n)) {
      if (h.sc) {
        h.sc = false;
        s.discard = [...s.discard, card, "sc"];
        logIt(s, `${s.seats[seatId].name} pesca un doppio ${n}: salvato dalla Seconda Chance`);
        return "sc-used";
      }
      h.out = "bust";
      h.bustCard = n; // per far VEDERE il doppione che ha sballato
      s.discard = [...s.discard, card];
      logIt(s, `${s.seats[seatId].name} sballa con il ${n}`);
      return "bust";
    }
    h.nums = [...h.nums, n];
    if (h.nums.length >= 7) {
      h.out = "flip7";
      logIt(s, `FLIP 7 di ${s.seats[seatId].name}! +15 e round chiuso`);
      return "flip7";
    }
    return "kept";
  }

  if (CARD.isPlus(card)) { h.plus = [...h.plus, CARD.plus(card)]; return "kept"; }
  if (CARD.isX2(card)) { h.x2 = true; return "kept"; }

  // carte azione
  if (card === "sc") {
    if (!h.sc) { h.sc = true; return "kept"; }
    const eligible = activeSeats(s).filter((sid) => sid !== seatId && !s.hands[sid].sc);
    if (!eligible.length) { s.discard = [...s.discard, "sc"]; logIt(s, "Seconda Chance in più: scartata"); return "kept"; }
    if (eligible.length === 1) { s.hands[eligible[0]].sc = true; logIt(s, `Seconda Chance regalata a ${s.seats[eligible[0]].name}`); return "given"; }
    s.pending = { type: "sc", chooser: seatId, options: eligible };
    return "pending";
  }

  // frz / fl3: durante un Pesca Tre si mettono da parte
  if (duringFlip3) { s.flip3.deferred = [...s.flip3.deferred, card]; return "deferred"; }
  const eligible = activeSeats(s);
  if (eligible.length === 1) return resolveAction(s, card, eligible[0], rng);
  s.pending = { type: card, chooser: seatId, options: eligible };
  return "pending";
}

function resolveAction(s, card, targetId, rng) {
  if (card === "frz") {
    s.hands[targetId].out = "frozen";
    s.discard = [...s.discard, "frz"];
    logIt(s, `${s.seats[targetId].name} viene congelato: incassa ed esce`);
    return "kept";
  }
  if (card === "fl3") {
    s.flip3 = { target: targetId, left: 3, deferred: [] };
    s.discard = [...s.discard, "fl3"];
    logIt(s, `${s.seats[targetId].name} deve pescare 3 carte`);
    return "kept";
  }
  return "kept";
}

/** Dopo un Pesca Tre completato: risolve le azioni messe da parte, in ordine. */
function settleFlip3(s, rng) {
  const f = s.flip3;
  if (!f) return;
  const targetOut = s.hands[f.target].out;
  if (f.left > 0 && !targetOut) return; // deve ancora pescare
  const deferred = f.deferred;
  s.flip3 = null;
  if (targetOut) {
    // sballato o flip7 durante le pescate: le azioni accantonate si perdono
    s.discard = [...s.discard, ...deferred];
    return;
  }
  for (let i = 0; i < deferred.length; i++) {
    const card = deferred[i];
    const eligible = activeSeats(s);
    if (!eligible.length) { s.discard = [...s.discard, ...deferred.slice(i)]; return; }
    if (eligible.length === 1) { resolveAction(s, card, eligible[0], rng); }
    else {
      s.pending = { type: card, chooser: f.target, options: eligible };
      if (deferred.length > i + 1) s.pending.thenDeferred = { target: f.target, cards: deferred.slice(i + 1) };
      return;
    }
    if (s.flip3) return; // un fl3 accantonato ha aperto un nuovo Pesca Tre
  }
}

/** Il giocatore di turno (o il bersaglio di un Pesca Tre) pesca una carta. */
export function hit(state, seatId, rng = Math.random) {
  if (state.status !== "playing" || state.pending) return state;
  const s = structuredClone(state);

  if (s.flip3) {
    if (s.flip3.target !== seatId || s.hands[seatId].out) return state;
    const card = drawOne(s, rng);
    if (!card) return endRound(s);
    s.flip3.left -= 1;
    const res = applyCard(s, seatId, card, true, rng);
    if (res === "flip7") return endRound(s);
    settleFlip3(s, rng);
    if (s.pending || s.flip3) return s;
    return advanceTurn(s);
  }

  if (s.turn !== seatId || s.hands[seatId].out) return state;
  const card = drawOne(s, rng);
  if (!card) return endRound(s);
  const res = applyCard(s, seatId, card, false, rng);
  if (res === "flip7") return endRound(s);
  if (res === "pending") return s;
  if (s.flip3) return s; // il bersaglio del Pesca Tre deve agire
  return advanceTurn(s);
}

/** Risolve la scelta del bersaglio (Congela / Pesca Tre / Seconda Chance). */
export function chooseTarget(state, chooserId, targetId, rng = Math.random) {
  const p = state.pending;
  if (!p || p.chooser !== chooserId || !(p.options || []).includes(targetId)) return state;
  const s = structuredClone(state);
  const pend = s.pending;
  s.pending = null;
  if (pend.type === "sc") {
    s.hands[targetId].sc = true;
    logIt(s, `Seconda Chance regalata a ${s.seats[targetId].name}`);
  } else {
    resolveAction(s, pend.type, targetId, rng);
  }
  // azioni rimaste da un Pesca Tre precedente
  if (pend.thenDeferred && !s.flip3) {
    s.flip3 = { target: pend.thenDeferred.target, left: 0, deferred: pend.thenDeferred.cards };
    settleFlip3(s, rng);
  }
  if (s.pending || s.flip3) return s;
  return advanceTurn(s);
}

/** Etichetta leggibile di una carta (per log e riepiloghi). */
export function cardLabel(c) {
  if (CARD.isNum(c)) return String(CARD.num(c));
  if (CARD.isPlus(c)) return "+" + CARD.plus(c);
  if (CARD.isX2(c)) return "×2";
  return { frz: "Congela", fl3: "Pesca Tre", sc: "Seconda Chance" }[c] || c;
}
