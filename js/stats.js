// ---------------------------------------------------------------------------
// Calcoli su partita in corso e classifica perpetua (logica pura, senza DOM).
// ---------------------------------------------------------------------------
import { computeRound } from "./scoring.js";

/** Chiave del round n dentro live.scores[playerId] (r0, r1, ...). */
export const roundKey = (n) => "r" + n;

/** Totale di un giocatore nella partita in corso. */
export function playerTotal(live, playerId) {
  const rows = (live && live.scores && live.scores[playerId]) || {};
  let sum = 0;
  for (const key of Object.keys(rows)) sum += computeRound(rows[key]).total;
  return sum;
}

/** Numero di round giocati (max indice + 1 fra tutte le entry). */
export function roundsPlayed(live) {
  let max = -1;
  const scores = (live && live.scores) || {};
  for (const pid of Object.keys(scores)) {
    for (const key of Object.keys(scores[pid] || {})) {
      const n = Number(String(key).slice(1));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

/** Classifica della partita in corso, ordinata dal primo all'ultimo. */
export function liveStandings(live, players) {
  const ids = orderedPlayerIds(live);
  const rows = ids.map((pid) => {
    const rows_ = (live.scores && live.scores[pid]) || {};
    const entry = rows_[roundKey(live.round || 0)];
    const last = lastRoundOf(live, pid);
    return {
      playerId: pid,
      name: (players && players[pid] && players[pid].name) || (live.names && live.names[pid]) || "?",
      total: playerTotal(live, pid),
      currentEntry: entry || null,
      lastRound: last,
      flip7s: countFlip7(live, pid),
      busts: countBusts(live, pid),
      freezes: countFreezes(live, pid),
      hearts: countHearts(live, pid)
    };
  });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "it"));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (prev === null || r.total !== prev) rank = i + 1;
    prev = r.total;
    r.rank = rank;
  });
  return rows;
}

export function orderedPlayerIds(live) {
  const p = (live && live.players) || {};
  return Object.keys(p).sort((a, b) => (p[a].order ?? 0) - (p[b].order ?? 0));
}

/**
 * I pari merito di una manche di SPAREGGIO, o null se quel round lo giocano
 * tutti. Nasce dal pareggio al traguardo: `live.tiebreaks` tiene un elenco di
 * giocatori per ogni round che e' uno spareggio (r3, r4...).
 */
export function tiebreakOf(live, roundIndex) {
  const raw = live && live.tiebreaks && live.tiebreaks[roundKey(roundIndex)];
  const ids = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : null;
  return ids && ids.length ? ids.filter(Boolean) : null;
}

/** Chi gioca il round indicato: tutti, o i soli pari merito dello spareggio. */
export function roundPlayers(live, roundIndex) {
  const only = tiebreakOf(live, roundIndex);
  const ids = orderedPlayerIds(live);
  return only ? ids.filter((pid) => only.includes(pid)) : ids;
}

/**
 * Chi apre la mano corrente: il sorteggiato (`firstIdx`) nel primo round,
 * poi si ruota di un posto a ogni round. In una manche di spareggio la
 * rotazione salta chi e' rimasto fuori. Null sulle partite vecchie
 * cominciate senza sorteggio.
 */
export function roundStarter(live) {
  if (!live || live.firstIdx === undefined || live.firstIdx === null) return null;
  const ids = orderedPlayerIds(live);
  if (!ids.length) return null;
  const from = ((Number(live.firstIdx) || 0) + (live.round || 0)) % ids.length;
  const playing = roundPlayers(live, live.round || 0);
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[(from + i) % ids.length];
    if (playing.includes(pid)) return pid;
  }
  return ids[from];
}

function lastRoundOf(live, pid) {
  const rows = (live.scores && live.scores[pid]) || {};
  const keys = Object.keys(rows).map((k) => Number(String(k).slice(1))).filter(Number.isFinite).sort((a, b) => a - b);
  if (!keys.length) return null;
  const k = keys[keys.length - 1];
  return { round: k, ...computeRound(rows[roundKey(k)]) };
}

function countFlip7(live, pid) {
  const rows = (live.scores && live.scores[pid]) || {};
  return Object.values(rows).filter((e) => computeRound(e).flip7).length;
}
function countBusts(live, pid) {
  const rows = (live.scores && live.scores[pid]) || {};
  return Object.values(rows).filter((e) => e && e.busted).length;
}
function countFreezes(live, pid) {
  const rows = (live.scores && live.scores[pid]) || {};
  return Object.values(rows).filter((e) => e && e.frozen && !e.busted).length;
}
function countHearts(live, pid) {
  const rows = (live.scores && live.scores[pid]) || {};
  return Object.values(rows).reduce((a, e) => a + computeRound(e).hearts, 0);
}

/**
 * Lunghezza delle mani costruite con le carte: quante carte numero, su
 * quante mani. Contano solo le mani segnate carta per carta e non sballate
 * (una mano sballata non e' stata "costruita", e' saltata per aria).
 */
export function handStats(rows) {
  let hands = 0, cards = 0, bestHand = 0, bestHandRound = -1, rounds = 0, doubles = 0, cardRounds = 0;
  for (const [key, e] of Object.entries(rows || {})) {
    const c = computeRound(e);
    rounds += 1;
    if (c.total > bestHand) { bestHand = c.total; bestHandRound = Number(String(key).slice(1)); }
    if (!c.busted && c.cards > 0) { hands += 1; cards += c.cards; }
    // il x2 si sa solo dove le carte sono state segnate una per una: le mani
    // digitate col tastierino non dicono se la carta e' arrivata o no
    const typed = e && e.manual !== null && e.manual !== undefined && e.manual !== "";
    if (!typed) {
      cardRounds += 1;
      if (c.doubled) doubles += 1;
    }
  }
  return { hands, cards, bestHand, bestHandRound, rounds, doubles, cardRounds };
}

/** Chi ha raggiunto o superato il target. */
export function reachedTarget(live, players) {
  const target = live.targetScore || 200;
  return liveStandings(live, players).filter((r) => r.total >= target);
}

/** Id dei vincitori (piu' di uno in caso di parita' al primo posto). */
export function winnersOf(standings) {
  if (!standings.length) return [];
  const top = standings[0].total;
  return standings.filter((r) => r.total === top).map((r) => r.playerId);
}

/**
 * Chi e' arrivato secondo in una partita chiusa: il punteggio piu' alto fra
 * quelli che NON hanno vinto (a pari merito il secondo posto e' di tutti).
 * Vuoto se la partita ha un solo giocatore o se hanno vinto tutti.
 */
export function runnersUpOf(game) {
  const results = (game && game.results) || {};
  const winners = (game && game.winnerIds) || {};
  const ids = Object.keys(results);
  if (ids.length < 2) return [];
  const losers = ids.filter((pid) => !winners[pid]);
  if (!losers.length) return [];
  const total = (pid) => Number(results[pid].total) || 0;
  const top = Math.max(...losers.map(total));
  return losers.filter((pid) => total(pid) === top);
}

// ---------------------------------------------------------------------------
// Classifica perpetua
// ---------------------------------------------------------------------------

/** Filtro sulla provenienza: dal vivo (segnapunti e recuperi a mano) o online. */
export const SOURCES = {
  all: { label: "Tutte" },
  live: { label: "Dal vivo" },
  online: { label: "Online" }
};

export const matchesSource = (g, source) =>
  !source || source === "all" ? true
    : source === "online" ? g.source === "online"
    : g.source !== "online";

/**
 * Da quando valgono le statistiche sulle congelate. Le partite precedenti non
 * contano: o non hanno il dato, oppure ce l'hanno a zero solo perche' nessuno
 * usava ancora il tasto "Congelato", e abbasserebbero la media di chi viene
 * congelato davvero. Sposta questa data se il conteggio parte da un altro giorno.
 */
export const FREEZE_STATS_SINCE = Date.parse("2026-09-03T11:35:00+02:00");
const tracksFreezes = (game, res) => res.freezes !== undefined && (game.playedAt || 0) >= FREEZE_STATS_SINCE;

/**
 * Da quando il tavolo online scrive CHI ha congelato, chi ha tirato il Pesca
 * Tre e chi ha regalato la Seconda Chance. Prima non c'era il dato, quindi
 * quelle partite non concorrono ai record "attivi" (Iceman, Bullo, Generoso).
 * Una partita dal vivo conta se il segnapunti ha segnato almeno un "da chi".
 */
export const INTERACTIONS_SINCE = Date.parse("2026-09-09T12:00:00+02:00");
const listOf = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
export function tracksInteractions(game) {
  if (!game || !game.rounds) return false;
  if (game.source === "online" && (game.playedAt || 0) >= INTERACTIONS_SINCE) return true;
  return Object.values(game.rounds).some((rows) => Object.values(rows || {}).some((e) => e && (e.frozenBy || listOf(e.fl3By).length || listOf(e.scFrom).length)));
}
/**
 * Chi ha fatto cosa in una partita, a credito di chi l'ha fatto:
 * pid -> { froze, fl3, gave, frozeWhom: {pid: n}, fl3Whom: {pid: n} }.
 */
export function interactionCredits(game) {
  const out = {};
  const at = (pid) => out[pid] || (out[pid] = { froze: 0, fl3: 0, gave: 0, frozeWhom: {}, fl3Whom: {}, gaveWhom: {} });
  for (const [victim, rows] of Object.entries((game && game.rounds) || {})) {
    for (const e of Object.values(rows || {})) {
      if (!e) continue;
      if (e.frozenBy) { const c = at(e.frozenBy); c.froze += 1; c.frozeWhom[victim] = (c.frozeWhom[victim] || 0) + 1; }
      for (const by of listOf(e.fl3By)) { const c = at(by); c.fl3 += 1; c.fl3Whom[victim] = (c.fl3Whom[victim] || 0) + 1; }
      for (const by of listOf(e.scFrom)) { const c = at(by); c.gave += 1; c.gaveWhom[victim] = (c.gaveWhom[victim] || 0) + 1; }
    }
  }
  return out;
}

export const PERIODS = {
  all: { label: "Sempre", since: () => 0 },
  year: { label: "Quest'anno", since: () => new Date(new Date().getFullYear(), 0, 1).getTime() },
  month: { label: "Questo mese", since: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() },
  d30: { label: "Ultimi 30 gg", since: () => Date.now() - 30 * 864e5 }
};

/**
 * Ordina la classifica: prima il criterio scelto, poi a scalare gli altri.
 * A parita' di Crown decide la quota di vittorie, poi la media punti, poi le
 * partite giocate e i punti totali.
 */
export const TIEBREAK = ["crowns", "winRate", "avg", "games", "points", "best"];

export function sortLeaderboard(rows, sort = "crowns", dir = -1) {
  const chain = [sort, ...TIEBREAK.filter((k) => k !== sort)];
  return [...rows].sort((a, b) => {
    for (const key of chain) {
      // il criterio scelto segue `dir`, gli spareggi sono sempre dal piu' alto
      const diff = ((a[key] || 0) - (b[key] || 0)) * (key === sort ? dir : -1);
      if (diff) return diff;
    }
    return a.name.localeCompare(b.name, "it");
  });
}

export const SORTS = {
  crowns: { label: "Crown", cmp: (a, b) => b.crowns - a.crowns || b.winRate - a.winRate || b.avg - a.avg },
  avg: { label: "Media punti", cmp: (a, b) => b.avg - a.avg || b.crowns - a.crowns },
  games: { label: "Partite", cmp: (a, b) => b.games - a.games || b.crowns - a.crowns },
  points: { label: "Punti totali", cmp: (a, b) => b.points - a.points || b.crowns - a.crowns },
  best: { label: "Record", cmp: (a, b) => b.best - a.best || b.crowns - a.crowns },
  winRate: { label: "Vinte %", cmp: (a, b) => b.winRate - a.winRate || b.crowns - a.crowns || b.avg - a.avg }
};

/**
 * Aggrega lo storico in una classifica.
 * @param {object} history  mappa gameId -> partita
 * @param {object} players  roster (per il nome aggiornato)
 * @param {{period?:string, sort?:string}} opts
 */
export function leaderboard(history, players, opts = {}) {
  const since = (PERIODS[opts.period] || PERIODS.all).since();
  const acc = new Map();

  const games = Object.entries(history || {})
    .map(([id, g]) => ({ id, ...g }))
    .filter((g) => (g.playedAt || 0) >= since && matchesSource(g, opts.source))
    .sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));

  for (const game of games) {
    const results = game.results || {};
    const winners = game.winnerIds || {};
    const seconds = new Set(runnersUpOf(game));
    const inter = tracksInteractions(game);
    const credits = inter ? interactionCredits(game) : {};
    for (const [pid, res] of Object.entries(results)) {
      let e = acc.get(pid);
      if (!e) {
        e = { playerId: pid, name: res.name || "?", crowns: 0, seconds: 0, games: 0, points: 0, best: 0, worst: Infinity, lastPlayed: 0, flip7s: 0, busts: 0, freezes: 0, tracked: 0, frozenTracked: 0, hearts: 0, heartTracked: 0, hands: 0, cards: 0, bestHand: 0, rounds: 0, doubles: 0, cardRounds: 0, bestComeback: 0, comebackWins: 0,
          froze: 0, fl3: 0, gave: 0, interTracked: 0, stays: 0, blockedGames: 0, titles: 0,
          bestGame: null, bestHandGame: null, bestHandRound: -1, bestComebackGame: null, bestComebackRound: -1 };
        acc.set(pid, e);
      }
      e.name = res.name || e.name;
      e.games += 1;
      e.points += Number(res.total) || 0;
      if ((Number(res.total) || 0) > e.best || e.bestGame === null) { e.best = Number(res.total) || 0; e.bestGame = game.id; }
      e.worst = Math.min(e.worst, Number(res.total) || 0);
      e.flip7s += Number(res.flip7s) || 0;
      e.busts += Number(res.busts) || 0;
      if (res.busts !== undefined || res.flip7s !== undefined) e.tracked += 1; // segnata round per round
      if (tracksFreezes(game, res)) {
        e.freezes += Number(res.freezes) || 0;
        e.frozenTracked += 1;
      }
      // le vite extra si contano solo dove sono state segnate davvero: nelle
      // partite piu' vecchie il campo non c'e' proprio, e non fanno media
      if (res.hearts !== undefined) {
        e.hearts += Number(res.hearts) || 0;
        e.heartTracked += 1;
      }
      const hs = handStats(game.rounds && game.rounds[pid]);
      e.hands += hs.hands;
      e.cards += hs.cards;
      e.rounds += hs.rounds;
      e.doubles += hs.doubles;
      e.cardRounds += hs.cardRounds;
      if (hs.bestHand > e.bestHand) { e.bestHand = hs.bestHand; e.bestHandGame = game.id; e.bestHandRound = hs.bestHandRound; }
      const cb = comebackDetail(game, pid);
      if (cb.deficit > 0) e.comebackWins += 1;
      if (cb.deficit > e.bestComeback) { e.bestComeback = cb.deficit; e.bestComebackGame = game.id; e.bestComebackRound = cb.round; }
      // chi ha congelato, chi ha tirato il Pesca Tre, chi ha regalato il cuore:
      // solo nelle partite che lo sanno
      if (inter) {
        e.interTracked += 1;
        const c = credits[pid];
        if (c) { e.froze += c.froze; e.fl3 += c.fl3; e.gave += c.gave; }
      }
      e.stays += Object.values((game.rounds && game.rounds[pid]) || {}).filter((x) => x && x.stayed).length;
      if (res.blockedRound !== undefined) e.blockedGames += 1;
      e.lastPlayed = Math.max(e.lastPlayed, game.playedAt || 0);
      if (winners[pid]) e.crowns += 1;
      if (seconds.has(pid)) e.seconds += 1;
    }
  }
  // i titoli di stagione (campione del mese) sulle stesse partite
  const titles = seasonTitles(history, players, opts);
  for (const e of acc.values()) e.titles = (titles[e.playerId] || []).length;

  const rows = [...acc.values()].map((e) => ({
    ...e,
    name: (players && players[e.playerId] && players[e.playerId].name) || e.name,
    archived: Boolean(players && players[e.playerId] && players[e.playerId].archived),
    avg: e.games ? e.points / e.games : 0,
    winRate: e.games ? e.crowns / e.games : 0,
    bustRate: e.tracked ? e.busts / e.tracked : 0,
    freezeRate: e.frozenTracked ? e.freezes / e.frozenTracked : 0,
    avgCards: e.hands ? e.cards / e.hands : 0,
    worst: e.worst === Infinity ? 0 : e.worst
  }));

  const cmp = (SORTS[opts.sort] || SORTS.crowns).cmp;
  rows.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name, "it"));

  let rank = 0, prevKey = null;
  rows.forEach((r, i) => {
    const key = opts.sort === "avg" ? r.avg.toFixed(3) : String(r[opts.sort === "games" ? "games" : opts.sort === "points" ? "points" : opts.sort === "best" ? "best" : "crowns"]);
    if (prevKey === null || key !== prevKey) rank = i + 1;
    prevKey = key;
    r.rank = rank;
  });

  return { rows, gamesCount: games.length };
}

// ---------------------------------------------------------------------------
// Record individuali: titoli scherzosi assegnati sulle righe della classifica.
// ---------------------------------------------------------------------------

const dec = (v) => (Math.round(v * 10) / 10).toLocaleString("it-IT");
/** "1 sballo a partita" / "1,5 sballi a partita". */
const perPartita = (one, many) => (v) => (Math.round(v * 10) / 10 === 1 ? `1 ${one} a partita` : `${dec(v)} ${many} a partita`);

/** I record: massimo o minimo di una statistica, vedi `pick`. */
export const AWARDS = [
  { id: "gambler", key: "flip7s", title: "Gambler", desc: "rischia tutto e piazza i Flip 7", emblem: "gambler", tone: "gold",
    unit: (v) => v === 1 ? "1 Flip 7" : `${v} Flip 7` },
  { id: "golosone", key: "bustRate", title: "Golosone", desc: "sballi per una carta di troppo", emblem: "golosone", tone: "red",
    unit: perPartita("sballo", "sballi") },
  { id: "tanaia", key: "bustRate", pick: "min", title: "Tanaia", desc: "braccine corte, sballa meno di tutti", emblem: "tanaia", tone: "green",
    unit: perPartita("sballo", "sballi") },
  { id: "cannoniere", key: "best", title: "Cannoniere", desc: "il punteggio record in una partita", emblem: "cannoniere", tone: "blue",
    unit: (v) => `${v} punti` },
  { id: "surgelato", key: "freezeRate", title: "Surgelato", desc: "il bersaglio preferito dei Congela", emblem: "surgelato", tone: "ice",
    unit: perPartita("congelata", "congelate") },
  { id: "architetto", key: "avgCards", title: "Architetto", desc: "costruisce le mani più lunghe", emblem: "architetto", tone: "violet",
    unit: (v) => `${dec(v)} carte a mano` },
  { id: "colpogrosso", key: "bestHand", title: "Colpo Grosso", desc: "la mano più ricca in un solo round", emblem: "colpogrosso", tone: "fire",
    unit: (v) => `${v} punti in una mano` },
  { id: "sculone", key: "bestComeback", title: "Sculone", desc: "la rimonta più grande, da sotto fino alla vittoria", emblem: "sculone", tone: "gold",
    unit: (v) => `rimonta da −${v}` },
  { id: "doppiogiochista", key: "doubles", title: "Doppiogiochista", desc: "il ×2 gli finisce in mano più che a tutti", emblem: "doppiogiochista", tone: "violet",
    unit: (v) => v === 1 ? "1 ×2 pescato" : `${v} ×2 pescati` },
  { id: "rosicone", key: "seconds", title: "Rosicone", desc: "il secondo posto è casa sua, e ancora rosica", emblem: "rosicone", tone: "silver",
    unit: (v) => v === 1 ? "1 secondo posto" : `${v} secondi posti` },
  { id: "settevite", key: "hearts", title: "Sette Vite", desc: "le carte col cuore finiscono sempre in mano sua", emblem: "settevite", tone: "rose",
    unit: (v) => v === 1 ? "1 vita extra" : `${v} vite extra` },
  { id: "iceman", key: "froze", title: "Iceman", desc: "il Congela lo tira lui, e sempre a qualcun altro", emblem: "iceman", tone: "ice",
    unit: (v) => v === 1 ? "1 congelata tirata" : `${v} congelate tirate` },
  { id: "bullo", key: "fl3", title: "Bullo", desc: "il Pesca Tre lo rifila agli altri", emblem: "bullo", tone: "fire",
    unit: (v) => v === 1 ? "1 Pesca Tre tirato" : `${v} Pesca Tre tirati` },
  { id: "generoso", key: "gave", title: "Generoso", desc: "regala la Seconda Chance a chi ne ha bisogno", emblem: "generoso", tone: "rose",
    unit: (v) => v === 1 ? "1 cuore regalato" : `${v} cuori regalati` }
];

// Flip 7, sballi e congelate esistono solo nelle partite segnate round per
// round (`tracked`); le mani lunghe solo dove le carte sono state segnate una
// per una (`hands`); le vite extra solo da quando si segnano (`heartTracked`).
// Chi ha solo totali recuperati a mano non concorre.
const awardPool = (a, rows) =>
  a.key === "freezeRate" ? rows.filter((r) => r.frozenTracked > 0)
    : a.key === "flip7s" || a.key === "bustRate" ? rows.filter((r) => r.tracked > 0)
    : a.key === "avgCards" ? rows.filter((r) => r.hands > 0)
    : a.key === "bestHand" ? rows.filter((r) => r.rounds > 0)
    : a.key === "doubles" ? rows.filter((r) => r.cardRounds > 0)
    : a.key === "bestComeback" ? rows.filter((r) => r.bestComeback > 0)
    : a.key === "seconds" ? rows.filter((r) => r.games > 0)
    : a.key === "hearts" ? rows.filter((r) => r.heartTracked > 0)
    : a.key === "froze" || a.key === "fl3" || a.key === "gave" ? rows.filter((r) => r.interTracked > 0)
    : rows;
// arrotondo per confrontare le medie senza sorprese da virgola mobile
const awardVal = (a, r) => Math.round((Number(r[a.key]) || 0) * 1000) / 1000;

/**
 * Assegna i trofei: vince il massimo (o il minimo, per il Tanaia), a pari
 * merito il titolo e' condiviso. Un trofeo senza candidati (o, per i massimi,
 * con tutti a zero) non viene assegnato.
 */
export function awards(rows) {
  return AWARDS.map((a) => {
    const min = a.pick === "min";
    const pool = awardPool(a, rows);
    if (!pool.length) return { ...a, winners: [] };
    const top = pool.reduce((m, r) => (min ? Math.min(m, awardVal(a, r)) : Math.max(m, awardVal(a, r))), min ? Infinity : 0);
    if (!min && !top) return { ...a, winners: [] };
    return { ...a, value: top, winners: pool.filter((r) => awardVal(a, r) === top) };
  }).filter((a) => a.winners.length);
}

/**
 * Classifica completa di un trofeo: tutti i candidati dal vincitore in giu',
 * con `value` gia' calcolato e `rank` che gestisce i pari merito.
 */
export function awardRanking(rows, id) {
  const a = AWARDS.find((x) => x.id === id);
  if (!a) return null;
  const min = a.pick === "min";
  const ranked = awardPool(a, rows)
    .map((r) => ({ ...r, value: awardVal(a, r) }))
    .sort((x, y) => (min ? x.value - y.value : y.value - x.value) || x.name.localeCompare(y.name, "it"));
  let rank = 0, prev = null;
  ranked.forEach((r, i) => {
    if (prev === null || r.value !== prev) rank = i + 1;
    prev = r.value;
    r.rank = rank;
  });
  return { ...a, rows: ranked };
}

/**
 * Andamento della classifica nel tempo: dopo ogni partita ricalcola posizione
 * e media punti di ognuno, con gli stessi spareggi della classifica vera.
 * Ritorna { steps, series }: steps[i].snap[pid] = { rank, avg } dopo la
 * partita i; series elenca i giocatori con il nome aggiornato dal roster.
 */
export function leaderboardTrend(history, players, opts = {}) {
  const since = (PERIODS[opts.period] || PERIODS.all).since();
  const games = Object.entries(history || {})
    .map(([id, g]) => ({ id, ...g }))
    .filter((g) => (g.playedAt || 0) >= since && matchesSource(g, opts.source))
    .sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));

  const acc = new Map();
  const steps = [];
  for (const game of games) {
    const winners = game.winnerIds || {};
    for (const [pid, res] of Object.entries(game.results || {})) {
      let e = acc.get(pid);
      if (!e) {
        e = { playerId: pid, name: res.name || "?", crowns: 0, games: 0, points: 0, best: 0 };
        acc.set(pid, e);
      }
      e.name = res.name || e.name;
      e.games += 1;
      e.points += Number(res.total) || 0;
      e.best = Math.max(e.best, Number(res.total) || 0);
      if (winners[pid]) e.crowns += 1;
    }
    // stessa formula della classifica vera: Crown, quota di vittorie, media
    // punti (poi partite, punti, record). Senza winRate il grafico saltava lo
    // spareggio della quota e disegnava posizioni diverse da quelle in lista.
    const rows = [...acc.values()].map((e) => ({
      ...e,
      avg: e.games ? e.points / e.games : 0,
      winRate: e.games ? e.crowns / e.games : 0
    }));
    const snap = {};
    sortLeaderboard(rows).forEach((r, i) => { snap[r.playerId] = { rank: i + 1, avg: r.avg }; });
    steps.push({ playedAt: game.playedAt || 0, snap });
  }

  const series = [...acc.values()].map((e) => ({
    playerId: e.playerId,
    name: (players && players[e.playerId] && players[e.playerId].name) || e.name
  }));
  return { steps, series };
}

/**
 * Statistiche "da raccontare" di un giocatore, calcolate sulle sue partite
 * (ordinate dalla piu' recente, come le restituisce historyList).
 */
export function playerHighlights(games, playerId) {
  const chrono = [...games].sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));
  const won = (g) => Boolean(g.winnerIds && g.winnerIds[playerId]);

  let bestStreak = 0, run = 0, flip7s = 0, busts = 0, freezes = 0, overTarget = 0, detailed = 0, freezeGames = 0, hands = 0, cards = 0, rounds = 0, doubles = 0, cardRounds = 0;
  let froze = 0, fl3 = 0, gave = 0, interGames = 0, stays = 0;
  const frozeWhom = {}, frozenBy = {}, fl3Whom = {}, fl3By = {};
  const bump = (m, k, n = 1) => { if (k) m[k] = (m[k] || 0) + n; };
  let best = { total: -1, playedAt: 0, gameId: null };
  let bestHand = { total: 0, gameId: null, round: -1 };
  let bestComeback = { deficit: 0, gameId: null, round: -1 };

  for (const g of chrono) {
    const res = (g.results || {})[playerId] || {};
    const total = Number(res.total) || 0;
    if (won(g)) { run += 1; bestStreak = Math.max(bestStreak, run); } else { run = 0; }
    if (res.flip7s !== undefined) detailed += 1;   // partita segnata round per round
    flip7s += Number(res.flip7s) || 0;
    busts += Number(res.busts) || 0;
    if (tracksFreezes(g, res)) {
      freezes += Number(res.freezes) || 0;
      freezeGames += 1;
    }
    const hs = handStats(g.rounds && g.rounds[playerId]);
    hands += hs.hands;
    cards += hs.cards;
    rounds += hs.rounds;
    doubles += hs.doubles;
    cardRounds += hs.cardRounds;
    if (hs.bestHand > bestHand.total) bestHand = { total: hs.bestHand, gameId: g.id, round: hs.bestHandRound };
    const cb = comebackDetail(g, playerId);
    if (cb.deficit > bestComeback.deficit) bestComeback = { deficit: cb.deficit, gameId: g.id, round: cb.round };
    if (total >= (Number(g.targetScore) || 200)) overTarget += 1;
    if (total > best.total) best = { total, playedAt: g.playedAt || 0, gameId: g.id };
    if (tracksInteractions(g)) {
      interGames += 1;
      const c = interactionCredits(g)[playerId];
      if (c) {
        froze += c.froze; fl3 += c.fl3; gave += c.gave;
        for (const [k, n] of Object.entries(c.frozeWhom)) bump(frozeWhom, k, n);
        for (const [k, n] of Object.entries(c.fl3Whom)) bump(fl3Whom, k, n);
      }
      for (const e of Object.values((g.rounds && g.rounds[playerId]) || {})) {
        if (!e) continue;
        if (e.frozenBy) bump(frozenBy, e.frozenBy);
        for (const by of listOf(e.fl3By)) bump(fl3By, by);
      }
    }
    stays += Object.values((g.rounds && g.rounds[playerId]) || {}).filter((x) => x && x.stayed).length;
  }
  const topOf = (m) => { const best = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return best ? { playerId: best[0], n: best[1] } : null; };

  // strisce che arrivano fino a oggi
  let currentStreak = 0;
  for (let i = chrono.length - 1; i >= 0 && won(chrono[i]); i--) currentStreak += 1;
  let sinceLastWin = 0;
  for (let i = chrono.length - 1; i >= 0 && !won(chrono[i]); i--) sinceLastWin += 1;

  return {
    bestStreak, currentStreak, sinceLastWin,
    flip7s, busts, freezes, freezeGames, overTarget,
    hands, avgCards: hands ? cards / hands : 0,
    rounds, doubles, cardRounds,
    bestHand: bestHand.total, bestHandGame: bestHand.gameId, bestHandRound: bestHand.round,
    bestComeback: bestComeback.deficit, bestComebackGame: bestComeback.gameId, bestComebackRound: bestComeback.round,
    best: best.total < 0 ? { total: 0, playedAt: 0, gameId: null } : best,
    played: chrono.length,
    detailedGames: detailed,
    // chi ha fatto cosa a chi (solo dalle partite che lo sanno)
    froze, fl3, gave, interGames, stays,
    nemesis: topOf(frozenBy),     // chi lo congela di piu'
    victim: topOf(frozeWhom),     // chi congela di piu'
    bully: topOf(fl3By),          // chi gli tira piu' Pesca Tre
    bullied: topOf(fl3Whom)       // a chi tira piu' Pesca Tre
  };
}

/** Numero di round di una partita dello storico (max indice + 1, buchi compresi). */
export function roundCount(rounds) {
  return roundsPlayed({ scores: rounds || {} });
}

/**
 * La rimonta di chi ha vinto: dopo ogni round (tranne l'ultimo) quanto era
 * sotto al primo in classifica; vale il distacco piu' grande che ha poi
 * ribaltato. Zero se non ha vinto, se non e' mai stato sotto o se la partita
 * non ha le mani segnate.
 */
export function comebackOf(game, pid) {
  return comebackDetail(game, pid).deficit;
}
/** Come comebackOf, ma dice anche dopo quale round (indice) il distacco era massimo. */
export function comebackDetail(game, pid) {
  const none = { deficit: 0, round: -1 };
  if (!game || !game.winnerIds || !game.winnerIds[pid] || !game.rounds) return none;
  const n = roundCount(game.rounds);
  if (n < 2) return none;
  const ids = [...new Set([...Object.keys(game.results || {}), ...Object.keys(game.rounds)])];
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  let worst = 0, round = -1;
  for (let i = 0; i < n - 1; i++) {
    for (const id of ids) {
      const e = game.rounds[id] && game.rounds[id][roundKey(i)];
      if (e) totals[id] += computeRound(e).total;
    }
    const lead = Math.max(...ids.map((id) => totals[id]));
    if (lead - totals[pid] > worst) { worst = lead - totals[pid]; round = i; }
  }
  return { deficit: worst, round };
}

/**
 * Ricostruisce una partita chiusa a partire da una bozza corretta a mano.
 * Con le mani (`rounds`) i totali, i Flip 7 e gli sballi si ricalcolano da
 * quelle; senza, valgono i totali scritti. I round vuoti per tutti spariscono
 * e i successivi scalano. Il vincitore e' chi ha piu' punti, salvo scelta
 * esplicita (`winnerId`) fra i giocatori della partita.
 * @param {object} game  partita originale (immutata)
 * @param {{playedAt:number, targetScore:number, players:{playerId:string,name:string,total?:number}[], rounds:object|null, winnerId?:string|null}} draft
 */
export function reviseGame(game, draft) {
  const { id: _ignored, ...base } = game || {};
  const ids = draft.players.map((p) => p.playerId);

  let rounds = null;
  if (draft.rounds) {
    const kept = [];
    for (let i = 0; i < roundCount(draft.rounds); i++) {
      if (ids.some((pid) => draft.rounds[pid] && draft.rounds[pid][roundKey(i)])) kept.push(i);
    }
    rounds = {};
    for (const pid of ids) {
      const src = draft.rounds[pid] || {};
      const dst = {};
      kept.forEach((from, to) => { if (src[roundKey(from)]) dst[roundKey(to)] = src[roundKey(from)]; });
      if (Object.keys(dst).length) rounds[pid] = dst;
    }
    // i round si rinumerano: le manche di spareggio seguono lo stesso spostamento
    if (base.tiebreaks) {
      const moved = {};
      kept.forEach((from, to) => {
        const only = base.tiebreaks[roundKey(from)];
        if (only) moved[roundKey(to)] = (Array.isArray(only) ? only : Object.values(only)).filter((pid) => ids.includes(pid));
      });
      base.tiebreaks = Object.keys(moved).length ? moved : null;
    }
  }

  const results = {};
  for (const p of draft.players) {
    const prev = (base.results || {})[p.playerId] || {};
    const name = p.name || prev.name || "?";
    if (rounds) {
      const rows = Object.values(rounds[p.playerId] || {});
      results[p.playerId] = {
        ...prev, name,
        total: rows.reduce((a, e) => a + computeRound(e).total, 0),
        flip7s: rows.filter((e) => computeRound(e).flip7).length,
        busts: rows.filter((e) => e && e.busted).length,
        freezes: rows.filter((e) => e && e.frozen && !e.busted).length,
        hearts: rows.reduce((a, e) => a + computeRound(e).hearts, 0)
      };
    } else {
      results[p.playerId] = { ...prev, name, total: Math.max(0, Math.round(Number(p.total) || 0)) };
    }
  }

  const top = Math.max(...Object.values(results).map((r) => r.total));
  const winners = draft.winnerId && results[draft.winnerId]
    ? [draft.winnerId]
    : Object.keys(results).filter((pid) => results[pid].total === top);

  const playedAt = Number(draft.playedAt) || base.playedAt || Date.now();
  const out = {
    ...base,
    playedAt,
    targetScore: Math.max(10, Math.min(2000, Math.round(Number(draft.targetScore) || base.targetScore || 200))),
    results,
    winnerIds: Object.fromEntries(winners.map((pid) => [pid, true])),
    rounds,
    // senza le mani non ha piu' senso ricordare quali round erano spareggi
    tiebreaks: rounds ? base.tiebreaks || null : null,
    editedAt: Date.now()
  };
  // la fine della partita segue lo spostamento della data
  if (base.finishedAt) out.finishedAt = base.finishedAt + (playedAt - (base.playedAt || playedAt));
  return out;
}

/** Riepilogo veloce dello storico (per la home). */
export function historyList(history) {
  return Object.entries(history || {})
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
}

// ---------------------------------------------------------------------------
// Stagioni: un mese di calendario = una stagione. Si calcolano dallo storico,
// niente da scrivere nel database. Il campione del mese e' chi guida la
// classifica di quel mese (stessa formula: Crown, quota vittorie, media...);
// valgono le partite dal vivo e quelle online insieme. Il mese in corso non
// e' ancora assegnato: e' "in corso", con chi e' in testa adesso.
// ---------------------------------------------------------------------------
export const MONTHS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const MONTHS_SHORT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

/** "2026-08" per un istante (mese locale). */
export function monthKey(ms) {
  const d = new Date(ms || 0);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
export function monthOf(key) {
  const [y, m] = String(key).split("-").map(Number);
  return { year: y, month: m - 1 };
}
/** "Agosto 2026" */
export function seasonLabel(key) {
  const { year, month } = monthOf(key);
  return `${MONTHS_IT[month] || "?"} ${year}`;
}
/** "Agosto 26", la forma corta del badge. */
export function seasonShort(key) {
  const { year, month } = monthOf(key);
  return `${MONTHS_IT[month] || "?"} ${String(year).slice(-2)}`;
}
/** true se quel mese e' finito (rispetto a `now`). */
export function seasonClosed(key, now = Date.now()) {
  const { year, month } = monthOf(key);
  return new Date(year, month + 1, 1).getTime() <= now;
}

/** Stesso posto in classifica: uguali su tutta la catena degli spareggi. */
const sameStanding = (a, b) => TIEBREAK.every((k) => (a[k] || 0) === (b[k] || 0));

/**
 * Le stagioni, dalla piu' recente. Ognuna porta la classifica del mese, il
 * campione (o i campioni, a pari merito assoluto) se il mese e' chiuso, e
 * chi e' in testa se e' ancora in corso.
 * @returns {{key, label, short, year, month, games, rows, champions, leader, closed}[]}
 */
export function seasons(history, players, opts = {}) {
  const now = opts.now || Date.now();
  const byMonth = new Map();
  for (const [id, g] of Object.entries(history || {})) {
    if (!g || !matchesSource(g, opts.source)) continue;
    const key = monthKey(g.playedAt || 0);
    if (!byMonth.has(key)) byMonth.set(key, {});
    byMonth.get(key)[id] = g;
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, games]) => {
      const { rows } = leaderboard(games, players, { source: opts.source, skipTitles: true });
      const sorted = sortLeaderboard(rows, "crowns");
      const top = sorted[0] || null;
      const tied = top ? sorted.filter((r) => sameStanding(r, top)) : [];
      const closed = seasonClosed(key, now);
      const { year, month } = monthOf(key);
      return {
        key, year, month,
        label: seasonLabel(key), short: seasonShort(key),
        games: Object.keys(games).length,
        rows: sorted,
        champions: closed ? tied : [],
        leader: closed ? null : top,
        tie: tied.length > 1,
        closed
      };
    });
}

/** Titoli di stagione per giocatore: pid -> [{key, label, short, games, shared}], dal piu' recente. */
export function seasonTitles(history, players, opts = {}) {
  if (opts.skipTitles) return {};
  const out = {};
  for (const s of seasons(history, players, opts)) {
    for (const r of s.champions) {
      (out[r.playerId] = out[r.playerId] || []).push({ key: s.key, label: s.label, short: s.short, games: s.games, shared: s.champions.length > 1, crowns: r.crowns });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Testa a testa: come e' andata contro ognuno degli altri.
// ---------------------------------------------------------------------------
/**
 * Per ogni avversario incontrato: partite insieme, quante volte e' finito
 * davanti / dietro / alla pari, le Crown di ciascuno in quelle partite e
 * le medie punti. Dal piu' incontrato.
 */
export function headToHead(games, pid, players = null) {
  const acc = new Map();
  for (const g of games || []) {
    const res = g.results || {};
    if (!res[pid]) continue;
    const mine = Number(res[pid].total) || 0;
    for (const [oid, r] of Object.entries(res)) {
      if (oid === pid) continue;
      let e = acc.get(oid);
      if (!e) { e = { playerId: oid, name: r.name || "?", games: 0, ahead: 0, behind: 0, even: 0, myCrowns: 0, theirCrowns: 0, myPoints: 0, theirPoints: 0 }; acc.set(oid, e); }
      const theirs = Number(r.total) || 0;
      e.games += 1;
      if (mine > theirs) e.ahead += 1; else if (mine < theirs) e.behind += 1; else e.even += 1;
      if (g.winnerIds && g.winnerIds[pid]) e.myCrowns += 1;
      if (g.winnerIds && g.winnerIds[oid]) e.theirCrowns += 1;
      e.myPoints += mine;
      e.theirPoints += theirs;
    }
  }
  return [...acc.values()]
    .map((e) => ({
      ...e,
      name: (players && players[e.playerId] && players[e.playerId].name) || e.name,
      myAvg: e.games ? e.myPoints / e.games : 0,
      theirAvg: e.games ? e.theirPoints / e.games : 0,
      edge: e.games ? (e.ahead - e.behind) / e.games : 0
    }))
    .sort((a, b) => b.games - a.games || b.edge - a.edge || a.name.localeCompare(b.name, "it"));
}

// ---------------------------------------------------------------------------
// Record della stanza: non "chi e' il migliore in X" ma "la partita piu'..."
// ---------------------------------------------------------------------------
const nameIn = (g, pid, players) => (players && players[pid] && players[pid].name) || (g.results && g.results[pid] && g.results[pid].name) || "?";

/**
 * I primati della stanza, ognuno con la partita (e il giocatore) che lo
 * detiene: la partita piu' lunga e la piu' corta, il punteggio piu' alto di
 * sempre, la vittoria piu' larga e quella piu' tirata, il tavolo piu'
 * affollato, la mano piu' ricca, la serata piu' lunga.
 */
export function roomRecords(history, players, opts = {}) {
  const games = Object.entries(history || {})
    .map(([id, g]) => ({ id, ...g }))
    .filter((g) => matchesSource(g, opts.source));
  if (!games.length) return [];
  const out = [];
  const pick = (id, title, desc, unit, best) => { if (best) out.push({ id, title, desc, unit, ...best }); };
  const maxBy = (list, val) => list.reduce((m, x) => { const v = val(x); return v !== null && (m === null || v > m.v) ? { v, x } : m; }, null);
  const minBy = (list, val) => list.reduce((m, x) => { const v = val(x); return v !== null && (m === null || v < m.v) ? { v, x } : m; }, null);
  const ref = (m, extra = {}) => (m ? { value: m.v, gameId: m.x.id, playedAt: m.x.playedAt || 0, ...extra(m.x) } : null);

  const withRounds = games.filter((g) => roundCount(g.rounds) > 0);
  pick("longest", "La maratona", "la partita con più mani", (v) => `${v} mani`,
    ref(maxBy(withRounds, (g) => roundCount(g.rounds)), () => ({})));
  pick("shortest", "La partita lampo", "chiusa in poche mani", (v) => `${v} mani`,
    ref(minBy(withRounds.filter((g) => Object.keys(g.results || {}).length >= 2), (g) => roundCount(g.rounds)), () => ({})));

  const topScore = maxBy(games.flatMap((g) => Object.entries(g.results || {}).map(([pid, r]) => ({ g, pid, v: Number(r.total) || 0 }))), (x) => x.v);
  if (topScore) out.push({ id: "topscore", title: "Il punteggio di sempre", desc: "il totale più alto in una partita", unit: (v) => `${v} punti`,
    value: topScore.v, gameId: topScore.x.g.id, playedAt: topScore.x.g.playedAt || 0, playerId: topScore.x.pid, playerName: nameIn(topScore.x.g, topScore.x.pid, players) });

  const margins = games.map((g) => {
    const rows = Object.entries(g.results || {}).sort((a, b) => (Number(b[1].total) || 0) - (Number(a[1].total) || 0));
    if (rows.length < 2) return null;
    return { g, pid: rows[0][0], v: (Number(rows[0][1].total) || 0) - (Number(rows[1][1].total) || 0) };
  }).filter(Boolean);
  const wide = maxBy(margins, (x) => x.v);
  if (wide) out.push({ id: "widest", title: "La passeggiata", desc: "la vittoria più larga sul secondo", unit: (v) => `+${v} sul secondo`,
    value: wide.v, gameId: wide.x.g.id, playedAt: wide.x.g.playedAt || 0, playerId: wide.x.pid, playerName: nameIn(wide.x.g, wide.x.pid, players) });
  const tight = minBy(margins.filter((x) => x.v > 0), (x) => x.v);
  if (tight) out.push({ id: "tightest", title: "Il fotofinish", desc: "la vittoria più tirata", unit: (v) => `+${v} sul secondo`,
    value: tight.v, gameId: tight.x.g.id, playedAt: tight.x.g.playedAt || 0, playerId: tight.x.pid, playerName: nameIn(tight.x.g, tight.x.pid, players) });

  pick("crowded", "Il tavolo pieno", "la partita con più giocatori", (v) => `${v} giocatori`,
    ref(maxBy(games, (g) => Object.keys(g.results || {}).length), () => ({})));

  const hands = games.flatMap((g) => Object.entries(g.rounds || {}).flatMap(([pid, rows]) => Object.entries(rows || {}).map(([k, e]) => ({ g, pid, round: Number(String(k).slice(1)), v: computeRound(e).total }))));
  const richest = maxBy(hands, (x) => x.v);
  if (richest) out.push({ id: "richest", title: "La mano d'oro", desc: "più punti in un solo round", unit: (v) => `${v} in una mano`,
    value: richest.v, gameId: richest.x.g.id, playedAt: richest.x.g.playedAt || 0, playerId: richest.x.pid, playerName: nameIn(richest.x.g, richest.x.pid, players), round: richest.x.round });

  const timed = games.filter((g) => g.finishedAt && g.playedAt && g.finishedAt > g.playedAt && g.finishedAt - g.playedAt < 12 * 36e5);
  pick("night", "La serata lunga", "la partita durata di più", (v) => fmtDuration(v),
    ref(maxBy(timed, (g) => g.finishedAt - g.playedAt), () => ({})));
  return out;
}

/** "1 h 12 min" / "38 min". */
export function fmtDuration(ms) {
  const min = Math.round((ms || 0) / 6e4);
  if (min < 1) return "meno di un minuto";
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------------------------------------------------------------------------
// Rating Elo: premia chi batte i forti, e da' un ordine sensato anche a chi
// ha giocato poche partite. Ogni partita vale come un giro di scontri a due
// fra tutti i presenti (K diviso per il numero di avversari).
// ---------------------------------------------------------------------------
export const ELO_START = 1000;
export function eloRatings(history, players, opts = {}) {
  const K = opts.k || 32;
  const games = Object.entries(history || {})
    .map(([id, g]) => ({ id, ...g }))
    .filter((g) => matchesSource(g, opts.source))
    .sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));
  const rating = new Map();
  const played = new Map();
  const peak = new Map();
  const get = (pid) => (rating.has(pid) ? rating.get(pid) : ELO_START);
  for (const g of games) {
    const ids = Object.keys(g.results || {});
    if (ids.length < 2) continue;
    const total = (pid) => Number(g.results[pid].total) || 0;
    const delta = {};
    for (const a of ids) {
      let d = 0;
      for (const b of ids) {
        if (a === b) continue;
        const expected = 1 / (1 + Math.pow(10, (get(b) - get(a)) / 400));
        const actual = total(a) > total(b) ? 1 : total(a) < total(b) ? 0 : 0.5;
        d += (K / (ids.length - 1)) * (actual - expected);
      }
      delta[a] = d;
    }
    for (const a of ids) {
      const next = get(a) + delta[a];
      rating.set(a, next);
      played.set(a, (played.get(a) || 0) + 1);
      peak.set(a, Math.max(peak.get(a) || ELO_START, next));
    }
  }
  return [...rating.entries()]
    .map(([pid, r]) => ({
      playerId: pid,
      name: (players && players[pid] && players[pid].name) || "?",
      elo: Math.round(r),
      peak: Math.round(peak.get(pid) || ELO_START),
      games: played.get(pid) || 0
    }))
    .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name, "it"))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// Il corso di una partita: i totali di ognuno dopo ogni round (per il
// grafico nel dettaglio e per il replay mano per mano).
// ---------------------------------------------------------------------------
export function gameProgress(game) {
  const rounds = (game && game.rounds) || {};
  const n = roundCount(rounds);
  const ids = [...new Set([...Object.keys((game && game.results) || {}), ...Object.keys(rounds)])];
  const series = ids.map((pid) => {
    const totals = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const e = rounds[pid] && rounds[pid][roundKey(i)];
      sum += e ? computeRound(e).total : 0;
      totals.push(sum);
    }
    return { playerId: pid, name: (game.results && game.results[pid] && game.results[pid].name) || "?", totals, final: sum };
  });
  // chi era in testa dopo ogni round (a pari merito, tutti)
  const leaders = Array.from({ length: n }, (_, i) => {
    const top = Math.max(...series.map((s) => s.totals[i]));
    return series.filter((s) => s.totals[i] === top).map((s) => s.playerId);
  });
  // quante volte e' cambiata la testa
  let leadChanges = 0;
  for (let i = 1; i < n; i++) if (leaders[i].join() !== leaders[i - 1].join()) leadChanges += 1;
  return { rounds: n, series, leaders, leadChanges };
}
