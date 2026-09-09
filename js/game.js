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
//   - pareggio al traguardo: manche di SPAREGGIO fra i soli pari merito
//     (gli altri restano fuori), ripetuta finche' resta un vincitore solo
//   - chi sparisce a meta' partita puo' essere BLOCCATO dagli altri, di comune
//     accordo: incassa quello che ha in mano, resta al suo punteggio e la
//     partita continua senza di lui (puo' rientrare dal round dopo)
//
// Ogni mano ricorda anche CHI ha fatto cosa (chi ha congelato, chi ha tirato
// il Pesca Tre, chi ha regalato la Seconda Chance, con quale carta si e'
// sballato, se ci si e' fermati di propria volonta'): sono dati che il tavolo
// ha gratis e che nello storico diventano statistiche.
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

// `scGot`: quante vite extra (carte col cuore) sono finite in questa mano nel
// round, comprese quelle gia' spese. Non danno punti: servono alle statistiche.
// `frozenBy`, `fl3By`, `scFrom`: chi ha congelato, chi ha tirato il Pesca Tre,
// chi ha regalato il cuore (posti). `chose`: si e' fermato di sua volonta'.
const emptyHand = () => ({ nums: [], plus: [], x2: false, sc: false, scGot: 0, scFrom: [], out: null, bustCard: null, frozenBy: null, fl3By: [], chose: false, blocked: false });

/** Firebase puo' restituire un array come oggetto {0:..,1:..}: qui torna lista. */
const toList = (v) => Array.isArray(v) ? v
  : v && typeof v === "object" ? Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k])
  : [];

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
    state.hands[sid] = { nums: h.nums || [], plus: h.plus || [], x2: Boolean(h.x2), sc: Boolean(h.sc), scGot: Number(h.scGot) || 0, scFrom: h.scFrom || [], scUsed: Boolean(h.scUsed), out: h.out || null, bustCard: h.bustCard ?? null, frozenBy: h.frozenBy || null, fl3By: h.fl3By || [], chose: Boolean(h.chose), blocked: Boolean(h.blocked) };
  }
  state.votes = g.votes || null;
  state.seen = g.seen || {};
  state.reactions = g.reactions || {};
  state.winners = g.winners || null;
  state.pending = g.pending || null;
  state.flip3 = g.flip3 ? { ...g.flip3, deferred: g.flip3.deferred || [] } : null;
  state.log = g.log || [];
  state.lastDraw = g.lastDraw || null;
  state.lastRound = g.lastRound || null;
  state.lastAction = g.lastAction || null;
  state.trend = toList(g.trend);
  state.rounds = toList(g.rounds);
  state.tiebreak = toList(g.tiebreak);
  // assente nei tavoli aperti prima di questo campo: chi legge lo capisce da undefined
  state.playoffRounds = g.playoffRounds === undefined ? undefined : toList(g.playoffRounds);
  return state;
}

/**
 * Crea il tavolo in attesa di giocatori.
 * `id` distingue i tavoli aperti in contemporanea, `owner` dice chi l'ha
 * aperto: e' l'unico che potra' chiuderlo.
 * @param {{id?:string, owner?:{uid:string,name:string}}} meta
 */
export function createLobby(target = 200, meta = {}) {
  return {
    id: meta.id || null,
    owner: meta.owner || null,
    createdAt: Date.now(),
    status: "lobby", target, round: 0, seats: {}, order: [], deck: [], discard: [], hands: {}, log: [], tiebreak: null
  };
}

/** Avvia la partita (deckOverride serve ai test). */
export function startGame(state, rng = Math.random, deckOverride = null) {
  if (state.order.length < 2) throw new Error("Servono almeno 2 giocatori seduti");
  const s = { ...state, status: "playing", round: 1, startedAt: Date.now(), discard: [], pending: null, flip3: null, lastDraw: null, lastRound: null, trend: [], rounds: [], tiebreak: null, votes: null, winners: null, reactions: null, playoffRounds: [] };
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

function reshuffle(s, rng) {
  if (!s.discard.length) return;
  s.deck = shuffle([...s.deck, ...s.discard], rng);
  s.discard = [];
  logIt(s, "Mazzo rimescolato con gli scarti");
}

/** Pesca una carta. Appena il mazzo si svuota, gli scarti rientrano SUBITO:
    il gioco non deve mai fermarsi con il contatore a zero. */
function drawOne(s, rng) {
  if (!s.deck.length) reshuffle(s, rng);
  const card = s.deck.pop() || null;
  if (!s.deck.length) reshuffle(s, rng);
  return card;
}

/** Punti di una mano (senza il bonus, che dipende da out === "flip7"). */
export function handPoints(h) {
  let base = h.nums.reduce((a, b) => a + b, 0);
  if (h.x2) base *= 2;
  return base + h.plus.reduce((a, b) => a + b, 0) + (h.out === "flip7" ? 15 : 0);
}

/**
 * La mano nel formato del segnapunti dal vivo (js/scoring.js): numeri, +,
 * x2, sballo, congelata e vite extra ricevute. Serve ad archiviare la partita
 * online round per round, cosi' vale nelle statistiche quanto una segnata a mano.
 */
export function handEntry(h) {
  const e = {
    numbers: [...h.nums],
    plus: [...h.plus],
    doubled: Boolean(h.x2),
    busted: h.out === "bust",
    frozen: h.out === "frozen",
    hearts: Number(h.scGot) || 0
  };
  // i dettagli "chi ha fatto cosa" si scrivono solo quando ci sono: le mani
  // senza restano identiche a prima (e leggere in mezzo allo storico)
  if (h.out === "frozen" && h.frozenBy) e.frozenBy = h.frozenBy;
  if (h.fl3By && h.fl3By.length) e.fl3By = [...h.fl3By];
  if (h.scFrom && h.scFrom.length) e.scFrom = [...h.scFrom];
  if (h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined) e.bustCard = h.bustCard;
  if (h.chose) e.stayed = true;
  if (h.blocked) e.blocked = true;
  return e;
}

function endRound(s) {
  // niente carte perse: le azioni rimaste appese (accantonate da un Pesca Tre
  // o in attesa di bersaglio) tornano negli scarti, pronte per il rimescolo
  if (s.flip3 && s.flip3.deferred && s.flip3.deferred.length) s.discard = [...s.discard, ...s.flip3.deferred];
  if (s.pending) s.discard = [...s.discard, s.pending.type];
  s.lastRound = {};
  const played = {}; // la fotografia delle mani di questo round, per lo storico
  for (const sid of s.order) {
    const h = s.hands[sid];
    if (h.out === "excluded") continue; // spareggio: non ha giocato, niente mano ne' punti
    if (!h.out) h.out = "stay"; // il round e' finito: chi era in gioco incassa
    const pts = h.out === "bust" ? 0 : handPoints(h);
    s.lastRound[sid] = pts;
    played[sid] = handEntry(h);
    s.seats[sid] = { ...s.seats[sid], total: (s.seats[sid].total || 0) + pts };
    // le carte usate vanno negli scarti
    s.discard = [...s.discard, ...h.nums.map((n) => "n" + n), ...h.plus.map((p) => "p" + p)];
    if (h.x2) s.discard.push("x2");
    if (h.sc) s.discard.push("sc");
  }
  s.pending = null;
  s.flip3 = null;
  // le mani giocate, una fotografia per round: da qui nascono sballi,
  // congelate e Flip 7 della partita archiviata
  s.rounds = [...(s.rounds || []), played];
  // storia dei totali round per round (per il grafico di andamento)
  s.trend = [...(s.trend || []), Object.fromEntries(s.order.map((sid) => [sid, s.seats[sid].total || 0]))];
  // Fine partita: il traguardo tagliato basta solo se davanti c'e' UNA persona.
  // A pari merito si gioca una manche di spareggio fra i soli pari (gli altri
  // restano fuori), e si ripete finche' resta un vincitore solo.
  const totalOf = (sid) => s.seats[sid].total || 0;
  const top = Math.max(...s.order.map(totalOf));
  const leaders = s.order.filter((sid) => totalOf(sid) === top);
  // chi e' stato bloccato non gioca lo spareggio: a pari merito lo perde
  const contenders = leaders.filter((sid) => !s.seats[sid].blocked);
  const playoff = top >= s.target && leaders.length > 1 && contenders.length > 1;
  s.tiebreak = playoff ? contenders : null;
  s.status = top >= s.target && !playoff ? "over" : "roundEnd";
  s.winners = s.status === "over" ? (contenders.length ? contenders : leaders) : null;
  if (playoff) logIt(s, `Pareggio a ${top}: spareggio fra ${contenders.map((sid) => s.seats[sid].name).join(" e ")}`);
  return s;
}

/**
 * Prepara il round successivo (l'ordine ruota: cambia chi parte).
 * Se e' una manche di spareggio (`tiebreak`), chi non e' pari merito parte
 * gia' fuori: resta seduto e guarda, senza carte e senza punti.
 */
export function nextRound(state) {
  const s = { ...state, status: "playing", round: state.round + 1, pending: null, flip3: null, lastDraw: null, lastRound: null, endReason: null, votes: null };
  s.order = [...state.order.slice(1), state.order[0]];
  const only = (state.tiebreak || []).length ? new Set(state.tiebreak) : null;
  // le manche di spareggio si ricordano per numero: nello storico si distinguono
  // cosi' dai round saltati da chi era stato bloccato
  s.playoffRounds = [...(toList(state.playoffRounds) || []), ...(only ? [s.round] : [])];
  s.hands = {};
  for (const sid of s.order) {
    s.hands[sid] = emptyHand();
    // chi e' fuori dallo spareggio, o e' stato bloccato, resta seduto a guardare
    if ((only && !only.has(sid)) || s.seats[sid].blocked) s.hands[sid].out = "excluded";
  }
  const first = s.order.find((sid) => !s.hands[sid].out);
  if (!first) {
    // sono bloccati tutti: non c'e' piu' nessuno che possa giocare
    s.status = "over";
    s.endReason = "blocked";
    const totalOf = (sid) => s.seats[sid].total || 0;
    const top = Math.max(...s.order.map(totalOf));
    s.winners = s.order.filter((sid) => totalOf(sid) === top);
    return s;
  }
  s.turn = first;
  return s;
}

/**
 * Abbandono: chi lascia la partita la chiude per tutti. Valgono i punteggi
 * gia' incassati, qualunque siano; la mano in corso non si conta (non e'
 * finita). Da li' si va al podio e si salva nello storico come sempre.
 */
export function abandonGame(state, sid) {
  if (!state.order.includes(sid) || state.status === "lobby" || state.status === "over") return state;
  const s = structuredClone(state);
  s.status = "over";
  s.endReason = "left";
  s.tiebreak = null;
  s.votes = null;
  s.endedBy = s.seats[sid].name;
  s.pending = null;
  s.flip3 = null;
  const totalOf = (x) => s.seats[x].total || 0;
  const top = Math.max(...s.order.map(totalOf));
  s.winners = s.order.filter((x) => totalOf(x) === top);
  logIt(s, `${s.seats[sid].name} ha abbandonato: partita chiusa con i punteggi di adesso`);
  return s;
}

// ---------------------------------------------------------------------------
// Blocco di chi non risponde piu'. Non e' un abbandono: la partita continua.
// ---------------------------------------------------------------------------

/**
 * Blocca un posto al punteggio di adesso: incassa la mano che ha (come se si
 * fosse fermato), un'eventuale carta azione in sospeso va negli scarti, e da
 * qui in poi non riceve carte ne' punti. Il totale resta in classifica, quindi
 * a fine partita conta come tutti gli altri. Si usa quando qualcuno sparisce a
 * meta' partita e gli altri, di comune accordo, decidono di andare avanti.
 */
export function blockSeat(state, sid) {
  if (!state.order.includes(sid) || state.status === "lobby" || state.status === "over") return state;
  if (state.seats[sid].blocked) return state;
  const s = structuredClone(state);
  s.seats[sid] = { ...s.seats[sid], blocked: true, blockedRound: s.round };
  const h = s.hands[sid];
  // la carta azione che doveva assegnare torna negli scarti, con quelle in coda
  if (s.pending && s.pending.chooser === sid) {
    s.discard = [...s.discard, s.pending.type, ...((s.pending.thenDeferred && s.pending.thenDeferred.cards) || [])];
    s.pending = null;
  } else if (s.pending) {
    // era fra i bersagli possibili: non lo e' piu'
    s.pending.options = (s.pending.options || []).filter((x) => x !== sid);
    if (!s.pending.options.length) { s.discard = [...s.discard, s.pending.type]; s.pending = null; }
  }
  // stava pescando tre carte: il Pesca Tre finisce qui, le azioni accantonate si perdono
  if (s.flip3 && s.flip3.target === sid) {
    s.discard = [...s.discard, ...(s.flip3.deferred || [])];
    s.flip3 = null;
  }
  if (!h.out) h.out = "stay"; // incassa quello che ha
  h.blocked = true;
  s.votes = null;
  const pts = h.out === "bust" ? 0 : handPoints(h);
  logIt(s, `${s.seats[sid].name} non risponde: bloccato a ${(s.seats[sid].total || 0) + pts} punti, la partita continua`);
  if (s.status !== "playing") return s; // a round chiuso basta il segno: dal prossimo sta fuori
  if (s.turn === sid) return advanceTurn(s);
  if (!activeSeats(s).length) return endRound(s);
  return s;
}

/** Chi era stato bloccato torna in partita: gioca dal round successivo. */
export function unblockSeat(state, sid) {
  if (!state.order.includes(sid) || !state.seats[sid] || !state.seats[sid].blocked || state.status === "over") return state;
  const s = structuredClone(state);
  const { blocked: _b, blockedRound: _r, ...seat } = s.seats[sid];
  s.seats[sid] = seat;
  logIt(s, `${seat.name} e' tornato: rientra dal prossimo round`);
  return s;
}

/**
 * Un voto per bloccare `targetSid`. `required` e' l'elenco degli account il
 * cui consenso serve (di norma: tutti gli altri giocatori collegati in quel
 * momento): appena ci sono tutti, il blocco scatta nello stesso colpo.
 */
export function voteBlock(state, targetSid, voterUid, required = null) {
  if (!state.order.includes(targetSid) || state.status === "lobby" || state.status === "over") return state;
  if (state.seats[targetSid].blocked) return state;
  const s = structuredClone(state);
  s.votes = { ...(s.votes || {}) };
  s.votes[targetSid] = { ...(s.votes[targetSid] || {}), [voterUid]: true };
  if (required && required.length && required.every((u) => s.votes[targetSid][u])) return blockSeat(s, targetSid);
  return s;
}

/** Ritira il proprio voto. */
export function unvoteBlock(state, targetSid, voterUid) {
  if (!state.votes || !state.votes[targetSid] || !state.votes[targetSid][voterUid]) return state;
  const s = structuredClone(state);
  s.votes = { ...s.votes, [targetSid]: { ...s.votes[targetSid] } };
  delete s.votes[targetSid][voterUid];
  if (!Object.keys(s.votes[targetSid]).length) delete s.votes[targetSid];
  if (!Object.keys(s.votes).length) s.votes = null;
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
  s.hands[seatId].chose = true; // fermato di sua volonta', non chiuso d'ufficio
  s.votes = null; // una mossa cancella le votazioni in corso
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
        h.scUsed = true; // il cuore resta in mano, spento: vita consumata
        s.lastDraw.saved = true; // la vita spesa deve vedersi al volo
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
    if (!h.sc) { h.sc = true; h.scGot = (h.scGot || 0) + 1; return "kept"; }
    const eligible = activeSeats(s).filter((sid) => sid !== seatId && !s.hands[sid].sc);
    if (!eligible.length) { s.discard = [...s.discard, "sc"]; logIt(s, "Seconda Chance in più: scartata"); return "kept"; }
    if (eligible.length === 1) {
      const to = s.hands[eligible[0]];
      to.sc = true;
      to.scGot = (to.scGot || 0) + 1;
      to.scFrom = [...(to.scFrom || []), seatId];
      logIt(s, `Seconda Chance regalata a ${s.seats[eligible[0]].name}`);
      return "given";
    }
    s.pending = { type: "sc", chooser: seatId, options: eligible };
    return "pending";
  }

  // frz / fl3: durante un Pesca Tre si mettono da parte
  if (duringFlip3) { s.flip3.deferred = [...s.flip3.deferred, card]; return "deferred"; }
  const eligible = activeSeats(s);
  if (eligible.length === 1) return resolveAction(s, card, eligible[0], rng, seatId);
  s.pending = { type: card, chooser: seatId, options: eligible };
  return "pending";
}

/** Applica Congela o Pesca Tre al bersaglio; `byId` e' chi l'ha tirato. */
function resolveAction(s, card, targetId, rng, byId = null) {
  s.lastAction = { type: card, target: targetId, by: byId }; // per l'animazione in vista
  if (card === "frz") {
    s.hands[targetId].out = "frozen";
    s.hands[targetId].frozenBy = byId;
    s.discard = [...s.discard, "frz"];
    logIt(s, `${s.seats[targetId].name} viene congelato: incassa ed esce`);
    return "kept";
  }
  if (card === "fl3") {
    s.flip3 = { target: targetId, left: 3, deferred: [] };
    s.hands[targetId].fl3By = [...(s.hands[targetId].fl3By || []), byId];
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
    if (eligible.length === 1) { resolveAction(s, card, eligible[0], rng, f.target); }
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
  s.votes = null; // una mossa cancella le votazioni in corso

  if (s.flip3) {
    if (s.flip3.target !== seatId || s.hands[seatId].out) return state;
    const card = drawOne(s, rng);
    if (!card) { s.endReason = "deck"; return endRound(s); }
    s.flip3.left -= 1;
    const res = applyCard(s, seatId, card, true, rng);
    if (res === "flip7") return endRound(s);
    settleFlip3(s, rng);
    if (s.pending || s.flip3) return s;
    return advanceTurn(s);
  }

  if (s.turn !== seatId || s.hands[seatId].out) return state;
  const card = drawOne(s, rng);
  if (!card) { s.endReason = "deck"; return endRound(s); }
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
  s.votes = null; // una mossa cancella le votazioni in corso
  const pend = s.pending;
  s.pending = null;
  if (pend.type === "sc") {
    s.hands[targetId].sc = true;
    s.hands[targetId].scGot = (s.hands[targetId].scGot || 0) + 1;
    s.hands[targetId].scFrom = [...(s.hands[targetId].scFrom || []), chooserId];
    s.lastAction = { type: "sc", target: targetId, by: chooserId };
    logIt(s, `Seconda Chance regalata a ${s.seats[targetId].name}`);
  } else {
    resolveAction(s, pend.type, targetId, rng, chooserId);
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
