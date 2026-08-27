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
      busts: countBusts(live, pid)
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
  best: { label: "Record", cmp: (a, b) => b.best - a.best || b.crowns - a.crowns }
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
        e = { playerId: pid, name: res.name || "?", crowns: 0, games: 0, points: 0, best: 0, worst: Infinity, lastPlayed: 0, flip7s: 0 };
        acc.set(pid, e);
      }
      e.name = res.name || e.name;
      e.games += 1;
      e.points += Number(res.total) || 0;
      e.best = Math.max(e.best, Number(res.total) || 0);
      e.worst = Math.min(e.worst, Number(res.total) || 0);
      e.flip7s += Number(res.flip7s) || 0;
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

  let bestStreak = 0, run = 0, flip7s = 0, busts = 0, overTarget = 0, detailed = 0;
  let best = { total: -1, playedAt: 0 };

  for (const g of chrono) {
    const res = (g.results || {})[playerId] || {};
    const total = Number(res.total) || 0;
    if (won(g)) { run += 1; bestStreak = Math.max(bestStreak, run); } else { run = 0; }
    if (res.flip7s !== undefined) detailed += 1;   // partita segnata round per round
    flip7s += Number(res.flip7s) || 0;
    busts += Number(res.busts) || 0;
    if (total >= (Number(g.targetScore) || 200)) overTarget += 1;
    if (total > best.total) best = { total, playedAt: g.playedAt || 0 };
  }

  // strisce che arrivano fino a oggi
  let currentStreak = 0;
  for (let i = chrono.length - 1; i >= 0 && won(chrono[i]); i--) currentStreak += 1;
  let sinceLastWin = 0;
  for (let i = chrono.length - 1; i >= 0 && !won(chrono[i]); i--) sinceLastWin += 1;

  return {
    bestStreak, currentStreak, sinceLastWin,
    flip7s, busts, overTarget,
    best: best.total < 0 ? { total: 0, playedAt: 0 } : best,
    played: chrono.length,
    detailedGames: detailed
  };
}

/** Riepilogo veloce dello storico (per la home). */
export function historyList(history) {
  return Object.entries(history || {})
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
}
