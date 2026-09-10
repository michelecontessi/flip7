// ---------------------------------------------------------------------------
// Stagioni mensili, testa a testa, record della stanza, Elo, corso della
// partita e "chi ha fatto cosa" (logica pura in js/stats.js).
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import { seasons, seasonTitles, seasonShort, seasonClosed, monthKey, SEASON_MIN_GAMES, headToHead, roomRecords, eloRatings, eloSwing, eloGameReport, eloPoints, podiumHeights, ELO_START, leaderboardTrend, gameProgress, leaderboard, awards, interactionCredits, tracksInteractions, playerHighlights, INTERACTIONS_SINCE, fmtDuration } from "../js/stats.js";

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
  const list = seasons(history, players, { now, minGames: 1 });
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
  assert.deepEqual(list[1].champions.map((r) => r.playerId), ["ada"], "l'Elo del mese piu' alto: e' Ada la campionessa");
  assert.ok(list[1].rows[0].elo > ELO_START, "la classifica del mese porta l'Elo del mese");
  assert.deepEqual(list[1].rows.map((r) => r.playerId), ["ada", "bea", "cal"], "ordinata per Elo del mese, a parita' le Crown");
  const titles = seasonTitles(history, players, { now, minGames: 1 });
  assert.equal(titles.ada.length, 1);
  assert.equal(titles.ada[0].key, "2026-08");
  assert.equal(titles.bea, undefined);
  // e la classifica sa quanti titoli ha ognuno
  const { rows } = leaderboard(history, players, { minGames: 1 });
  assert.equal(rows.find((r) => r.playerId === "ada").titles, 1);
  assert.equal(rows.find((r) => r.playerId === "cal").titles, 0);
});

test("stagioni: vale tutto insieme, dal vivo e online; a parita' assoluta il titolo si condivide", () => {
  const now = at(2026, 9, 1);
  // due partite chiuse alla pari: stesse Crown, stesso Elo del mese (1000), stessa media
  const history = Object.fromEntries([
    game("a", at(2026, 8, 1), { ada: 200, bea: 200 }, { source: "online" }),
    game("b", at(2026, 8, 2), { ada: 150, bea: 150 })
  ]);
  const s = seasons(history, players, { now, minGames: 1 })[0];
  assert.equal(s.games, 2, "la partita online conta come quella dal vivo");
  assert.deepEqual(s.champions.map((r) => r.playerId).sort(), ["ada", "bea"]);
  assert.equal(s.tie, true);
  assert.equal(seasonTitles(history, players, { now, minGames: 1 }).ada[0].shared, true);
  // una vittoria a testa non e' una parita': chi vince l'ultima sfida batte uno gia' avanti, e sta davanti
  const swap = Object.fromEntries([
    game("a", at(2026, 8, 1), { ada: 200, bea: 100 }),
    game("b", at(2026, 8, 2), { ada: 100, bea: 200 })
  ]);
  const t = seasons(swap, players, { now, minGames: 1 })[0];
  assert.equal(t.tie, false);
  assert.deepEqual(t.champions.map((r) => r.playerId), ["bea"]);
});

test("stagioni: il titolo segue l'Elo del mese, non le Crown, e il mese prima non conta", () => {
  const now = at(2026, 9, 1);
  const history = Object.fromEntries([
    // agosto: Cal domina, ma e' un altro mese
    game("p1", at(2026, 7, 1), { cal: 200, ada: 50, bea: 40 }),
    game("p2", at(2026, 7, 2), { cal: 200, ada: 50, bea: 40 }),
    // settembre: Ada vince 4 volte, ma sempre contro Cal che perde e basta;
    // Bea vince 2 volte, contro Ada che e' la piu' forte del mese
    game("g1", at(2026, 8, 1), { ada: 200, cal: 100 }),
    game("g2", at(2026, 8, 2), { ada: 200, cal: 100 }),
    game("g3", at(2026, 8, 3), { ada: 200, cal: 100 }),
    game("g4", at(2026, 8, 4), { bea: 200, ada: 100 }),
    game("g5", at(2026, 8, 5), { bea: 200, ada: 100 }),
    game("g6", at(2026, 8, 6), { ada: 200, cal: 100 })
  ]);
  const s = seasons(history, players, { now, minGames: 1 }).find((x) => x.key === "2026-09");
  const by = Object.fromEntries(s.rows.map((r) => [r.playerId, r]));
  assert.equal(by.ada.crowns, 4);
  assert.equal(by.bea.crowns, 2);
  assert.ok(by.bea.elo > by.ada.elo, "battere Ada vale piu' di 4 Crown contro Cal");
  assert.deepEqual(s.rows.map((r) => r.playerId), ["bea", "ada", "cal"], "la classifica del mese e' per Elo del mese");
  assert.deepEqual(s.champions.map((r) => r.playerId), ["bea"]);
  assert.equal(s.rows[0].rank, 1);
  assert.equal(s.rows[1].rank, 2);
  // tutti da 1000 il primo del mese: il dominio di Cal ad agosto non conta a settembre
  assert.ok(by.cal.elo < ELO_START);
  const general = Object.fromEntries(eloRatings(history, players).map((r) => [r.playerId, r]));
  assert.notEqual(general.cal.elo, by.cal.elo, "il rating di sempre e' un'altra cosa");
  const titles = seasonTitles(history, players, { now, minGames: 1 });
  assert.equal(titles.bea[0].elo, by.bea.elo, "la carta in bacheca porta l'Elo del mese");
  assert.equal(titles.ada, undefined);
});

test("monthKey e seasonClosed seguono il calendario locale", () => {
  assert.equal(monthKey(at(2026, 0, 31, 23)), "2026-01");
  assert.equal(seasonClosed("2026-08", at(2026, 8, 1, 0)), true);
  assert.equal(seasonClosed("2026-09", at(2026, 8, 30, 23)), false);
  assert.equal(seasonShort("2025-12"), "Dicembre 25");
});


test("stagioni: il titolo si assegna con 10 partite nel mese in tutto, non a testa", () => {
  const now = at(2026, 8, 5);
  const entries = [];
  // 10 partite in tutto, ma nessuno ne ha giocate 10: Ada 7, Bea 7, Cal 6
  for (let i = 0; i < 4; i++) entries.push(game("ab" + i, at(2026, 7, i + 1), { ada: 200, bea: 100 }));
  for (let i = 0; i < 3; i++) entries.push(game("bc" + i, at(2026, 7, i + 10), { bea: 200, cal: 100 }));
  for (let i = 0; i < 3; i++) entries.push(game("ac" + i, at(2026, 7, i + 20), { ada: 200, cal: 100 }));
  const s = seasons(Object.fromEntries(entries), players, { now })[0];
  assert.equal(SEASON_MIN_GAMES, 10);
  assert.equal(s.minGames, 10);
  assert.equal(s.games, 10);
  assert.equal(s.enough, true);
  assert.deepEqual(s.eligible.map((r) => r.playerId).sort(), ["ada", "bea", "cal"], "in corsa tutti quelli che hanno giocato");
  assert.deepEqual(s.champions.map((r) => r.playerId), ["ada"]);
  assert.equal(s.noChampion, false);
  // chi passa una sera sola e vince e' in corsa anche lui: decide l'Elo del mese
  const oneNight = Object.fromEntries([...entries, game("dan", at(2026, 7, 28), { dan: 300, bea: 10 })]);
  const t = seasons(oneNight, { ...players, dan: { name: "Dan" } }, { now })[0];
  assert.ok(t.eligible.some((r) => r.playerId === "dan"));
  assert.equal(t.rows.find((r) => r.playerId === "dan").games, 1);
  // con 9 partite in tutto il titolo non si assegna, anche se il primo e' chiaro
  const nine = Object.fromEntries(entries.slice(0, 9));
  const u = seasons(nine, players, { now })[0];
  assert.equal(u.enough, false);
  assert.equal(u.noChampion, true);
  assert.deepEqual(u.champions, []);
});

test("stagioni: mese chiuso con meno di 10 partite in tutto = titolo non assegnato", () => {
  const now = at(2026, 8, 5);
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 12), { ada: 190, bea: 205 })
  ]);
  const s = seasons(history, players, { now })[0];
  assert.deepEqual(s.champions, []);
  assert.equal(s.noChampion, true);
  assert.deepEqual(s.eligible, []);
  assert.equal(s.rows.length, 2, "la classifica del mese resta");
  assert.equal(seasonTitles(history, players, { now }).ada, undefined, "nessuna carta in bacheca");
});

test("stagione in corso: chi guida si vede anche se il mese non e' ancora a quota", () => {
  const now = at(2026, 8, 9);
  const history = Object.fromEntries([game("g1", at(2026, 8, 2), { ada: 210, bea: 150 })]);
  const s = seasons(history, players, { now })[0];
  assert.equal(s.closed, false);
  assert.equal(s.leader.playerId, "ada", "in testa c'e' comunque qualcuno");
  assert.deepEqual(s.eligible, [], "ma nessuno e' ancora in corsa");
  assert.deepEqual(s.champions, []);
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
  assert.equal(by.ada.last + by.bea.last + by.cal.last, 0, "i punti passano di mano: la somma e' zero, anche nei numeri tondi");
  assert.ok(elo.every((r) => Number.isInteger(r.elo)), "i rating restano interi");
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

test("Elo della partita: prima, dopo e quanto contro ciascuno, e i conti tornano", () => {
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 5), { ada: 100, bea: 210, cal: 180 }),
    game("g3", at(2026, 8, 2), { cal: 205, ada: 190, bea: 120 })
  ]);
  const rep = eloGameReport(history, "g2", players);
  assert.deepEqual(rep.rows.map((r) => r.playerId), ["bea", "cal", "ada"], "in ordine di arrivo");
  const by = Object.fromEntries(rep.rows.map((r) => [r.playerId, r]));
  assert.equal(by.ada.before, 1016);
  assert.equal(by.bea.before, 984);
  assert.equal(by.cal.before, ELO_START, "chi gioca la prima volta parte da 1000");
  for (const r of rep.rows) {
    assert.equal(r.after - r.before, r.delta);
    assert.equal(r.vs.length, 2);
    assert.equal(r.vs.reduce((a, v) => a + v.swing, 0), r.delta, "gli spostamenti contro i singoli fanno il totale");
  }
  assert.ok(by.bea.vs.every((v) => v.swing > 0 && v.result === 1), "Bea davanti a tutti e due: guadagna su entrambi");
  assert.ok(by.cal.vs.find((v) => v.playerId === "ada").swing > 0, "Cal davanti ad Ada: guadagna su di lei");
  assert.ok(by.cal.vs.find((v) => v.playerId === "bea").swing < 0, "e dietro a Bea: perde su di lei");
  assert.equal(by.bea.vs.find((v) => v.playerId === "ada").before, 1016, "accanto a ogni avversario, il suo rating prima della partita");
  // coincide con la classifica: l'ultima partita di ognuno e' g3
  const elo = Object.fromEntries(eloRatings(history, players).map((r) => [r.playerId, r]));
  for (const r of eloGameReport(history, "g3", players).rows) {
    assert.equal(r.after, elo[r.playerId].elo);
    assert.equal(r.delta, elo[r.playerId].last);
  }
  // l'Elo del mese: g3 e' la prima di settembre, tutti ripartono da 1000
  const month = eloGameReport(history, "g3", players, { month: true });
  assert.equal(month.month, "2026-09");
  assert.ok(month.rows.every((r) => r.before === ELO_START));
  // una partita da soli non muove niente, una che non c'e' nemmeno
  assert.equal(eloGameReport(Object.fromEntries([game("solo", at(2026, 7, 1), { ada: 200 })]), "solo", players), null);
  assert.equal(eloGameReport(history, "nope", players), null);
});

test("Elo a punti interi: la somma fa zero e le sfide a due si specchiano", () => {
  // il caso della schermata: uno un po' sopra 1000 che chiude davanti a due nuovi
  const history = Object.fromEntries([
    game("w1", at(2026, 7, 1), { ada: 200, bea: 150 }),
    game("w2", at(2026, 7, 2), { cal: 200, ada: 150 }),
    game("w3", at(2026, 7, 3), { ada: 200, cal: 190 }),
    game("t", at(2026, 7, 5), { ada: 210, dan: 150, eva: 90 })
  ]);
  const ppl = { ...players, dan: { name: "Bot Bruno" }, eva: { name: "Bot Ada" } };
  for (const month of [false, true]) {
    const rep = eloGameReport(history, "t", ppl, { month });
    assert.equal(rep.rows.reduce((a, r) => a + r.delta, 0), 0, "quello che uno prende gli altri lo perdono");
    for (const r of rep.rows) {
      assert.equal(r.after - r.before, r.delta);
      assert.ok(Number.isInteger(r.before) && Number.isInteger(r.delta));
      assert.equal(r.vs.reduce((a, v) => a + v.swing, 0), r.delta);
      for (const v of r.vs) {
        const back = rep.rows.find((x) => x.playerId === v.playerId).vs.find((x) => x.playerId === r.playerId);
        assert.equal(v.swing + back.swing, 0, `${r.name} su ${v.name} e ${v.name} su ${r.name} si specchiano`);
      }
    }
  }
  assert.equal(eloPoints(7.5), 8);
  assert.equal(eloPoints(-7.5), -8, "la meta' si arrotonda allo stesso modo nei due versi");
  assert.equal(eloPoints(-0.2), 0);
  assert.ok(Object.is(eloPoints(-0.2), 0), "niente −0");
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
  const { rows } = leaderboard(history, players, { minGames: 1 });
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
  // dal vivo non conta mai, nemmeno se il segnapunti ha segnato un "da chi"
  assert.equal(tracksInteractions({ source: "live", playedAt: since, rounds: { x: { r0: { numbers: [1], frozen: true, frozenBy: "y" } } } }), false);
  assert.equal(tracksInteractions({ source: "live", playedAt: since, rounds: { x: { r0: { numbers: [1], frozen: true } } } }), false);
});

test("andamento: la serie porta anche il rating Elo, partita per partita", () => {
  const history = Object.fromEntries([
    game("g1", at(2026, 7, 3), { ada: 210, bea: 150 }),
    game("g2", at(2026, 7, 12), { ada: 190, bea: 205 }),
    game("g3", at(2026, 7, 20), { ada: 220, bea: 120 })
  ]);
  const { steps } = leaderboardTrend(history, players, {});
  assert.equal(steps.length, 3);
  for (const s of steps) {
    assert.ok(Number.isFinite(s.snap.ada.elo) && Number.isFinite(s.snap.bea.elo));
    assert.equal(s.snap.ada.elo + s.snap.bea.elo, 2 * ELO_START, "quel che uno prende, l'altro lo perde");
  }
  assert.ok(steps[0].snap.ada.elo > ELO_START, "chi vince la prima sale");
  assert.ok(steps[1].snap.ada.elo < steps[0].snap.ada.elo, "poi perde e scende");
  // e il valore finale coincide con la classifica Elo vera
  const elo = eloRatings(history, players, {});
  assert.equal(steps[2].snap.ada.elo, elo.find((r) => r.playerId === "ada").elo);
});

test("podio: i gradini seguono il punteggio, non il posto", () => {
  // Crown da zero: il doppio delle Crown, il gradino alto il doppio (col minimo per la targhetta)
  assert.deepEqual(podiumHeights([10, 5, 1]), [72, 36, 30]);
  assert.deepEqual(podiumHeights([4, 4, 2]), [72, 72, 36], "a pari Crown gradini pari");
  // Elo: dal piu' basso del mese (gradino minimo) al primo (gradino pieno)
  const [a, b, c] = podiumHeights([1050, 1048, 960], { floor: 900 });
  assert.equal(a, 72);
  assert.ok(a - b <= 1, "due Elo quasi uguali, gradini quasi uguali");
  assert.ok(b - c > 15, "un distacco largo si vede");
  assert.deepEqual(podiumHeights([1016, 984], { floor: 984 }), [72, 30]);
  assert.deepEqual(podiumHeights([1000, 1000], { floor: 1000 }), [72, 72], "tutti pari: tutti pieni");
  assert.deepEqual(podiumHeights([]), []);
});
