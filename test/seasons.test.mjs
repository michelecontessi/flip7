// ---------------------------------------------------------------------------
// Stagioni mensili, testa a testa, record della stanza, Elo, corso della
// partita e "chi ha fatto cosa" (logica pura in js/stats.js).
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import { seasons, seasonTitles, seasonShort, seasonClosed, monthKey, headToHead, roomRecords, eloRatings, eloSwing, ELO_START, gameProgress, leaderboard, awards, interactionCredits, tracksInteractions, playerHighlights, INTERACTIONS_SINCE, fmtDuration } from "../js/stats.js";

const at = (y, m, d = 10) => new Date(y, m, d, 20).getTime();
const game = (id, playedAt, totals, extra = {}) => {
  const results = {};
  for (const [pid, total] of Object.entries(totals)) results[pid] = { name: pid.toUpperCase(), total };
  const top = Math.max(...Object.values(totals));
  const winnerIds = Object.fromEntries(Object.entries(totals).filter(([, t]) => t === top).map(([pid]) => [pid, true]));
  return [id, { playedAt, results, winnerIds, targetScore: 200, source: "live", ...extra }];
};
const players = { ada: { name: "Ada" }, bea: { name: "Bea" }, cal: { name: "Cal" } };

test("stagioni: un mese chiuso ha il suo campione, quello in corso solo chi e' in testa", () => {
  const now = at(2026, 8, 9); // 9 settembre 2026
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 12), { ada: 190, bea: 205, cal: 100 }),
    game("g3", at(2026, 7, 20), { ada: 220, bea: 120, cal: 200 }),
    game("g4", at(2026, 8, 2), { cal: 230, ada: 100 })
  ]);
  const list = seasons(history, players, { now });
  assert.equal(list.length, 2);
  assert.equal(list[0].key, "2026-09");
  assert.equal(list[0].closed, false);
  assert.deepEqual(list[0].champions, []);
  assert.equal(list[0].leader.playerId, "cal");
  assert.equal(list[1].key, "2026-08");
  assert.equal(list[1].closed, true);
  assert.equal(list[1].label, "Agosto 2026");
  assert.equal(list[1].short, "Agosto 26");
  assert.equal(list[1].games, 3);
  assert.deepEqual(list[1].champions.map((r) => r.playerId), ["ada"], "2 Crown su 3: e' Ada la campionessa");
  const titles = seasonTitles(history, players, { now });
  assert.equal(titles.ada.length, 1);
  assert.equal(titles.ada[0].key, "2026-08");
  assert.equal(titles.bea, undefined);
  // e la classifica sa quanti titoli ha ognuno
  const { rows } = leaderboard(history, players);
  assert.equal(rows.find((r) => r.playerId === "ada").titles, 1);
  assert.equal(rows.find((r) => r.playerId === "cal").titles, 0);
});

test("stagioni: vale tutto insieme, dal vivo e online; a parita' assoluta il titolo si condivide", () => {
  const now = at(2026, 9, 1);
  const history = Object.fromEntries([
    game("a", at(2026, 8, 1), { ada: 200, bea: 100 }, { source: "online" }),
    game("b", at(2026, 8, 2), { ada: 100, bea: 200 })
  ]);
  const s = seasons(history, players, { now })[0];
  assert.equal(s.games, 2, "la partita online conta come quella dal vivo");
  assert.deepEqual(s.champions.map((r) => r.playerId).sort(), ["ada", "bea"]);
  assert.equal(s.tie, true);
  assert.equal(seasonTitles(history, players, { now }).ada[0].shared, true);
});

test("monthKey e seasonClosed seguono il calendario locale", () => {
  assert.equal(monthKey(at(2026, 0, 31, 23)), "2026-01");
  assert.equal(seasonClosed("2026-08", at(2026, 8, 1, 0)), true);
  assert.equal(seasonClosed("2026-09", at(2026, 8, 30, 23)), false);
  assert.equal(seasonShort("2025-12"), "Dicembre 25");
});

test("testa a testa: davanti, dietro, pari e le Crown incrociate", () => {
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 12), { ada: 190, bea: 205, cal: 100 }),
    game("g3", at(2026, 7, 20), { ada: 150, bea: 150 }),
    game("g4", at(2026, 8, 2), { cal: 230, ada: 100 })
  ]);
  const games = Object.entries(history).map(([id, g]) => ({ id, ...g }));
  const h2h = headToHead(games, "ada", players);
  const vsBea = h2h.find((r) => r.playerId === "bea");
  assert.equal(vsBea.games, 3);
  assert.equal(vsBea.ahead, 1);
  assert.equal(vsBea.behind, 1);
  assert.equal(vsBea.even, 1);
  assert.equal(vsBea.myCrowns, 2, "g1 e il pareggio di g3");
  assert.equal(vsBea.theirCrowns, 2);
  assert.equal(h2h[0].playerId, "bea", "prima chi si e' incontrato di piu'");
  const vsCal = h2h.find((r) => r.playerId === "cal");
  assert.equal(vsCal.games, 2);
  assert.equal(vsCal.ahead, 1);
  assert.equal(vsCal.behind, 1);
});

test("record della stanza: maratona, punteggio di sempre, passeggiata e fotofinish", () => {
  const rounds = (list) => Object.fromEntries(list.map(([pid, hands]) => [pid, Object.fromEntries(hands.map((n, i) => ["r" + i, { numbers: [n], plus: [], doubled: false, busted: false, frozen: false }]))]));
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 22, bea: 3 }, { rounds: rounds([["ada", [10, 12]], ["bea", [3]]]), finishedAt: at(2026, 7, 3) + 40 * 6e4 }),
    game("g2", at(2026, 7, 12), { ada: 12, bea: 11, cal: 5 }, { rounds: rounds([["ada", [1, 2, 9]], ["bea", [4, 7]], ["cal", [5]]]) }),
    game("g3", at(2026, 7, 20), { ada: 30, bea: 25 })
  ]);
  const rec = Object.fromEntries(roomRecords(history, players).map((r) => [r.id, r]));
  assert.equal(rec.longest.value, 3);
  assert.equal(rec.longest.gameId, "g2");
  assert.equal(rec.shortest.value, 2);
  assert.equal(rec.topscore.value, 30);
  assert.equal(rec.topscore.playerName, "Ada");
  assert.equal(rec.widest.value, 19);
  assert.equal(rec.widest.gameId, "g1");
  assert.equal(rec.tightest.value, 1);
  assert.equal(rec.tightest.gameId, "g2");
  assert.equal(rec.richest.value, 12);
  assert.equal(rec.richest.round, 1);
  // il tavolo pieno e la serata lunga non sono piu' primati
  assert.equal(rec.crowded, undefined);
  assert.equal(rec.night, undefined);
  assert.equal(fmtDuration(95 * 6e4), "1 h 35 min");
});

test("Elo: ogni riga dice quanto si e' mossa nell'ultima partita, e la somma degli spostamenti e' zero", () => {
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 5), { ada: 100, bea: 210, cal: 180 })
  ]);
  const elo = eloRatings(history, players);
  const by = Object.fromEntries(elo.map((r) => [r.playerId, r]));
  // g1 alla pari: +16 / -16
  assert.equal(eloSwing(ELO_START, ELO_START, 1), 16);
  // g2: Ada arriva dietro a entrambi, Bea davanti a entrambi
  assert.equal(by.ada.lastGameId, "g2");
  assert.ok(by.ada.last < 0 && by.bea.last > 0);
  assert.equal(by.ada.last + by.bea.last + by.cal.last <= 1 && by.ada.last + by.bea.last + by.cal.last >= -1, true, "arrotondati a parte, i punti passano di mano");
  assert.equal(by.cal.lastPlayedAt, at(2026, 7, 5));
  // gli esempi della spiegazione: contro uno piu' forte di 200 si guadagna piu' di quanto si rischia
  assert.ok(Math.abs(eloSwing(1000, 1200, 1)) > Math.abs(eloSwing(1000, 1200, 0)));
});

test("Elo: chi batte i forti sale di piu', e tutti partono da 1000", () => {
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 4), { ada: 210, bea: 150 }),
    game("g3", at(2026, 7, 5), { ada: 100, cal: 210 })
  ]);
  const elo = eloRatings(history, players);
  const by = Object.fromEntries(elo.map((r) => [r.playerId, r]));
  assert.ok(by.ada.elo > 1000 && by.bea.elo < 1000);
  assert.ok(by.cal.elo > 1016, "battere Ada, gia' forte, vale piu' di 16 punti");
  assert.equal(elo[0].rank, 1);
  assert.equal(by.ada.games, 3);
  assert.equal(by.ada.peak >= by.ada.elo, true);
});

test("il corso della partita: totali dopo ogni round e cambi in testa", () => {
  const g = {
    results: { ada: { name: "Ada", total: 22 }, bea: { name: "Bea", total: 23 } },
    rounds: {
      ada: { r0: { numbers: [10] }, r1: { numbers: [12] } },
      bea: { r0: { numbers: [3] }, r1: { numbers: [12, 8] } }
    }
  };
  const p = gameProgress(g);
  assert.equal(p.rounds, 2);
  assert.deepEqual(p.series.find((s) => s.playerId === "ada").totals, [10, 22]);
  assert.deepEqual(p.series.find((s) => s.playerId === "bea").totals, [3, 23]);
  assert.deepEqual(p.leaders, [["ada"], ["bea"]]);
  assert.equal(p.leadChanges, 1);
});

test("chi ha fatto cosa: Iceman, Bullo e Generoso contano solo dove il dato esiste", () => {
  const since = INTERACTIONS_SINCE + 1000;
  const history = Object.fromEntries([
    game("g1", since, { ada: 20, bea: 10, cal: 5 }, { source: "online", rounds: {
      ada: { r0: { numbers: [10, 10], scFrom: ["bea"] } },
      bea: { r0: { numbers: [10], frozen: true, frozenBy: "ada", fl3By: ["cal", "ada"] } },
      cal: { r0: { numbers: [5], frozen: true, frozenBy: "ada" } }
    } }),
    // prima della data: nessun credito, anche se e' online
    game("g0", INTERACTIONS_SINCE - 864e5, { ada: 20, bea: 10 }, { source: "online", rounds: { ada: { r0: { numbers: [20] } }, bea: { r0: { numbers: [10], frozen: true } } } })
  ]);
  assert.equal(tracksInteractions(history.g1), true);
  assert.equal(tracksInteractions(history.g0), false);
  const c = interactionCredits(history.g1);
  assert.equal(c.ada.froze, 2);
  assert.deepEqual(c.ada.frozeWhom, { bea: 1, cal: 1 });
  assert.equal(c.ada.fl3, 1);
  assert.equal(c.cal.fl3, 1);
  assert.equal(c.bea.gave, 1);
  const { rows } = leaderboard(history, players);
  const ada = rows.find((r) => r.playerId === "ada");
  assert.equal(ada.froze, 2);
  assert.equal(ada.interTracked, 1);
  const list = Object.fromEntries(awards(rows).map((a) => [a.id, a]));
  assert.deepEqual(list.iceman.winners.map((w) => w.playerId), ["ada"]);
  assert.deepEqual(list.bullo.winners.map((w) => w.playerId).sort(), ["ada", "cal"]);
  assert.deepEqual(list.generoso.winners.map((w) => w.playerId), ["bea"]);
  // la scheda di Bea sa chi e' la sua nemesi
  const games = Object.entries(history).map(([id, g]) => ({ id, ...g }));
  const h = playerHighlights(games.filter((g) => g.results.bea), "bea");
  assert.deepEqual(h.nemesis, { playerId: "ada", n: 1 });
  assert.equal(h.gave, 1);
  // una partita dal vivo conta se il segnapunti ha segnato un "da chi"
  assert.equal(tracksInteractions({ source: "live", rounds: { x: { r0: { numbers: [1], frozen: true, frozenBy: "y" } } } }), true);
  assert.equal(tracksInteractions({ source: "live", rounds: { x: { r0: { numbers: [1], frozen: true } } } }), false);
});
