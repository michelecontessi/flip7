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
      freezes: countFreezes(live, pid)
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
 * Chi apre la mano corrente: il sorteggiato (`firstIdx`) nel primo round,
 * poi si ruota di un posto a ogni round. Null sulle partite vecchie
 * cominciate senza sorteggio.
 */
export function roundStarter(live) {
  if (!live || live.firstIdx === undefined || live.firstIdx === null) return null;
  const ids = orderedPlayerIds(live);
  if (!ids.length) return null;
  return ids[((Number(live.firstIdx) || 0) + (live.round || 0)) % ids.length];
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

/**
 * Lunghezza delle mani costruite con le carte: quante carte numero, su
 * quante mani. Contano solo le mani segnate carta per carta e non sballate
 * (una mano sballata non e' stata "costruita", e' saltata per aria).
 */
export function handStats(rows) {
  let hands = 0, cards = 0, bestHand = 0, bestHandRound = -1, rounds = 0;
  for (const [key, e] of Object.entries(rows || {})) {
    const c = computeRound(e);
    rounds += 1;
    if (c.total > bestHand) { bestHand = c.total; bestHandRound = Number(String(key).slice(1)); }
    if (!c.busted && c.cards > 0) { hands += 1; cards += c.cards; }
  }
  return { hands, cards, bestHand, bestHandRound, rounds };
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

export const PERIODS = {
  all: { label: "Sempre", since: () => 0 },
  year: { label: "Quest'anno", since: () => new Date(new Date().getFullYear(), 0, 1).getTime() },
  month: { label: "Questo mese", since: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() },
  d30: { label: "Ultimi 30 gg", since: () => Date.now() - 30 * 864e5 }
};

/**
 * Ordina la classifica: prima il criterio scelto, poi a scalare gli altri.
 * A parita' di Crown decide la media punti, poi le partite, poi i punti totali.
 */
export const TIEBREAK = ["crowns", "avg", "games", "points", "best"];

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
  crowns: { label: "Crown 👑", cmp: (a, b) => b.crowns - a.crowns || b.avg - a.avg || b.games - a.games },
  avg: { label: "Media punti", cmp: (a, b) => b.avg - a.avg || b.crowns - a.crowns },
  games: { label: "Partite", cmp: (a, b) => b.games - a.games || b.crowns - a.crowns },
  points: { label: "Punti totali", cmp: (a, b) => b.points - a.points || b.crowns - a.crowns },
  best: { label: "Record", cmp: (a, b) => b.best - a.best || b.crowns - a.crowns },
  winRate: { label: "Vinte %", cmp: (a, b) => b.winRate - a.winRate || b.crowns - a.crowns }
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
    for (const [pid, res] of Object.entries(results)) {
      let e = acc.get(pid);
      if (!e) {
        e = { playerId: pid, name: res.name || "?", crowns: 0, games: 0, points: 0, best: 0, worst: Infinity, lastPlayed: 0, flip7s: 0, busts: 0, freezes: 0, tracked: 0, frozenTracked: 0, hands: 0, cards: 0, bestHand: 0, rounds: 0, bestComeback: 0, comebackWins: 0,
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
      const hs = handStats(game.rounds && game.rounds[pid]);
      e.hands += hs.hands;
      e.cards += hs.cards;
      e.rounds += hs.rounds;
      if (hs.bestHand > e.bestHand) { e.bestHand = hs.bestHand; e.bestHandGame = game.id; e.bestHandRound = hs.bestHandRound; }
      const cb = comebackDetail(game, pid);
      if (cb.deficit > 0) e.comebackWins += 1;
      if (cb.deficit > e.bestComeback) { e.bestComeback = cb.deficit; e.bestComebackGame = game.id; e.bestComebackRound = cb.round; }
      e.lastPlayed = Math.max(e.lastPlayed, game.playedAt || 0);
      if (winners[pid]) e.crowns += 1;
    }
  }

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
  { id: "fenice", key: "bestComeback", title: "Fenice", desc: "la rimonta più grande, da sotto fino alla vittoria", emblem: "fenice", tone: "rose",
    unit: (v) => `rimonta da −${v}` }
];

// Flip 7, sballi e congelate esistono solo nelle partite segnate round per
// round (`tracked`); le mani lunghe solo dove le carte sono state segnate una
// per una (`hands`). Chi ha solo totali recuperati a mano non concorre.
const awardPool = (a, rows) =>
  a.key === "freezeRate" ? rows.filter((r) => r.frozenTracked > 0)
    : a.key === "flip7s" || a.key === "bustRate" ? rows.filter((r) => r.tracked > 0)
    : a.key === "avgCards" ? rows.filter((r) => r.hands > 0)
    : a.key === "bestHand" ? rows.filter((r) => r.rounds > 0)
    : a.key === "bestComeback" ? rows.filter((r) => r.bestComeback > 0)
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
    const rows = [...acc.values()].map((e) => ({ ...e, avg: e.games ? e.points / e.games : 0 }));
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

  let bestStreak = 0, run = 0, flip7s = 0, busts = 0, freezes = 0, overTarget = 0, detailed = 0, freezeGames = 0, hands = 0, cards = 0, rounds = 0;
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
    if (hs.bestHand > bestHand.total) bestHand = { total: hs.bestHand, gameId: g.id, round: hs.bestHandRound };
    const cb = comebackDetail(g, playerId);
    if (cb.deficit > bestComeback.deficit) bestComeback = { deficit: cb.deficit, gameId: g.id, round: cb.round };
    if (total >= (Number(g.targetScore) || 200)) overTarget += 1;
    if (total > best.total) best = { total, playedAt: g.playedAt || 0, gameId: g.id };
  }

  // strisce che arrivano fino a oggi
  let currentStreak = 0;
  for (let i = chrono.length - 1; i >= 0 && won(chrono[i]); i--) currentStreak += 1;
  let sinceLastWin = 0;
  for (let i = chrono.length - 1; i >= 0 && !won(chrono[i]); i--) sinceLastWin += 1;

  return {
    bestStreak, currentStreak, sinceLastWin,
    flip7s, busts, freezes, freezeGames, overTarget,
    hands, avgCards: hands ? cards / hands : 0,
    rounds,
    bestHand: bestHand.total, bestHandGame: bestHand.gameId, bestHandRound: bestHand.round,
    bestComeback: bestComeback.deficit, bestComebackGame: bestComeback.gameId, bestComebackRound: bestComeback.round,
    best: best.total < 0 ? { total: 0, playedAt: 0, gameId: null } : best,
    played: chrono.length,
    detailedGames: detailed
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
        freezes: rows.filter((e) => e && e.frozen && !e.busted).length
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
