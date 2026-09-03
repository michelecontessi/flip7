import test from "node:test";
import assert from "node:assert/strict";
import { computeRound, formulaOf, isBlankEntry } from "../js/scoring.js";
import { leaderboard, sortLeaderboard, playerHighlights, playerTotal, liveStandings, winnersOf, roundKey, awards, awardRanking, roundStarter, FREEZE_STATS_SINCE } from "../js/stats.js";

// una partita giocata dopo l'avvio del conteggio delle congelate
const DOPO = FREEZE_STATS_SINCE + 60000;

test("somma semplice delle carte numero", () => {
  assert.equal(computeRound({ numbers: [3, 7, 10] }).total, 20);
});

test("il x2 raddoppia solo le carte numero, poi si sommano i bonus", () => {
  const r = computeRound({ numbers: [1, 5, 12], plus: [4], doubled: true });
  assert.equal(r.total, 40); // (1+5+12)*2 + 4
  assert.equal(formulaOf({ numbers: [1, 5, 12], plus: [4], doubled: true }), "(1+5+12) ×2 +4");
});

test("Flip 7: sette carte diverse valgono 15 punti extra", () => {
  const r = computeRound({ numbers: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(r.flip7, true);
  assert.equal(r.total, 28 + 15);
});

test("sballato azzera tutto, modificatori compresi", () => {
  assert.equal(computeRound({ numbers: [12, 11], plus: [10], doubled: true, busted: true }).total, 0);
});

test("le carte duplicate non vengono contate due volte", () => {
  assert.equal(computeRound({ numbers: [5, 5, 5] }).total, 5);
});

test("inserimento manuale ha la precedenza sulle carte", () => {
  assert.equal(computeRound({ numbers: [1, 2], manual: 77 }).total, 77);
});

test("entry vuota riconosciuta", () => {
  assert.equal(isBlankEntry({ numbers: [], plus: [], doubled: false, busted: false, manual: null }), true);
  assert.equal(isBlankEntry({ numbers: [], plus: [], doubled: false, busted: true, manual: null }), false);
});

test("totale di partita = somma dei round", () => {
  const live = { players: { a: { order: 0 } }, scores: { a: { r0: { numbers: [10] }, r1: { busted: true }, r2: { numbers: [5], plus: [2] } } } };
  assert.equal(playerTotal(live, "a"), 17);
});

test("classifica partita ordinata e con pari merito", () => {
  const live = {
    players: { a: { order: 0 }, b: { order: 1 }, c: { order: 2 } },
    names: { a: "Ale", b: "Bea", c: "Cri" },
    round: 1,
    scores: { a: { r0: { numbers: [10] } }, b: { r0: { numbers: [10] } }, c: { r0: { numbers: [3] } } }
  };
  const s = liveStandings(live, {});
  assert.deepEqual(s.map((r) => r.rank), [1, 1, 3]);
  assert.deepEqual(winnersOf(s).sort(), ["a", "b"]);
});

test("classifica perpetua: una crown per vittoria, media e record", () => {
  const hist = {
    g1: { playedAt: 1000, results: { a: { name: "Ale", total: 210 }, b: { name: "Bea", total: 150 } }, winnerIds: { a: true } },
    g2: { playedAt: 2000, results: { a: { name: "Ale", total: 120 }, b: { name: "Bea", total: 205 } }, winnerIds: { b: true } },
    g3: { playedAt: 3000, results: { a: { name: "Ale", total: 200 }, b: { name: "Bea", total: 100 } }, winnerIds: { a: true } }
  };
  const { rows } = leaderboard(hist, {});
  const ale = rows.find((r) => r.playerId === "a");
  const bea = rows.find((r) => r.playerId === "b");
  assert.equal(ale.crowns, 2);
  assert.equal(bea.crowns, 1);
  assert.equal(ale.games, 3);
  assert.equal(ale.best, 210);
  assert.equal(Math.round(ale.avg), 177);
  assert.equal(rows[0].playerId, "a");
});

test("il nome nel roster ha la precedenza su quello storico (rinomina)", () => {
  const hist = { g1: { playedAt: 1, results: { a: { name: "Ale", total: 10 }, b: { name: "Bea", total: 5 } }, winnerIds: { a: true } } };
  const { rows } = leaderboard(hist, { a: { name: "Alessandro" } });
  assert.equal(rows.find((r) => r.playerId === "a").name, "Alessandro");
});

test("filtro periodo esclude le partite vecchie", () => {
  const hist = {
    old: { playedAt: Date.now() - 400 * 864e5, results: { a: { name: "Ale", total: 10 }, b: { name: "Bea", total: 5 } }, winnerIds: { a: true } },
    now: { playedAt: Date.now(), results: { a: { name: "Ale", total: 10 }, b: { name: "Bea", total: 5 } }, winnerIds: { a: true } }
  };
  assert.equal(leaderboard(hist, {}, { period: "d30" }).gamesCount, 1);
  assert.equal(leaderboard(hist, {}, { period: "all" }).gamesCount, 2);
});

test("roundKey produce chiavi non-array per Firebase", () => {
  assert.equal(roundKey(0), "r0");
  assert.equal(roundKey(12), "r12");
});

test("a parità di Crown decide la media punti, non il nome", () => {
  const rows = [
    { playerId: "anna", name: "Anna", crowns: 2, avg: 174.8, games: 5, points: 874, best: 205 },
    { playerId: "luca", name: "Luca", crowns: 2, avg: 185.0, games: 4, points: 740, best: 208 },
    { playerId: "mich", name: "Michele", crowns: 3, avg: 176.8, games: 8, points: 1414, best: 212 },
    { playerId: "sara", name: "Sara", crowns: 1, avg: 186.0, games: 3, points: 558, best: 210 }
  ];
  const out = sortLeaderboard(rows).map((r) => r.name);
  assert.deepEqual(out, ["Michele", "Luca", "Anna", "Sara"]);
});

test("a parità di Crown e media decidono le partite giocate", () => {
  const rows = [
    { playerId: "a", name: "Aldo", crowns: 1, avg: 150, games: 2, points: 300, best: 160 },
    { playerId: "b", name: "Bruno", crowns: 1, avg: 150, games: 6, points: 900, best: 160 }
  ];
  assert.deepEqual(sortLeaderboard(rows).map((r) => r.name), ["Bruno", "Aldo"]);
});

test("ordinando per media, la Crown resta il primo spareggio", () => {
  const rows = [
    { playerId: "a", name: "Aldo", crowns: 0, avg: 190, games: 3, points: 570, best: 200 },
    { playerId: "b", name: "Bruno", crowns: 4, avg: 190, games: 9, points: 1710, best: 210 }
  ];
  assert.deepEqual(sortLeaderboard(rows, "avg").map((r) => r.name), ["Bruno", "Aldo"]);
});

test("highlights: strisce, record e Flip 7 di un giocatore", () => {
  const G = (day, total, win, flip7s = 0) => ({
    playedAt: day * 864e5, targetScore: 200,
    results: { me: { name: "Io", total, flip7s }, alt: { name: "Altro", total: 100 } },
    winnerIds: win ? { me: true } : { alt: true }
  });
  // ordine sparso di proposito: la funzione deve riordinare
  const games = [G(5, 150, false), G(1, 210, true, 2), G(2, 205, true), G(3, 120, false), G(4, 199, false, 1)];
  const h = playerHighlights(games, "me");
  assert.equal(h.bestStreak, 2);
  assert.equal(h.currentStreak, 0);
  assert.equal(h.sinceLastWin, 3);
  assert.equal(h.best.total, 210);
  assert.equal(h.flip7s, 3);
  assert.equal(h.overTarget, 2);
});

test("highlights: striscia aperta se ha vinto le ultime", () => {
  const G = (day, win) => ({
    playedAt: day * 864e5, targetScore: 200,
    results: { me: { name: "Io", total: 200 } }, winnerIds: win ? { me: true } : {}
  });
  const h = playerHighlights([G(1, false), G(2, true), G(3, true)], "me");
  assert.equal(h.currentStreak, 2);
  assert.equal(h.sinceLastWin, 0);
});

test("trofei: la classifica somma anche gli sballi e i trofei vanno al massimo", () => {
  const hist = {
    g1: {
      playedAt: 1000,
      results: {
        a: { name: "Ale", total: 210, flip7s: 2, busts: 1 },
        b: { name: "Bea", total: 150, flip7s: 0, busts: 3 }
      },
      winnerIds: { a: true }
    },
    g2: {
      playedAt: 2000,
      results: {
        a: { name: "Ale", total: 120, flip7s: 1, busts: 0 },
        b: { name: "Bea", total: 205, flip7s: 0, busts: 2 }
      },
      winnerIds: { b: true }
    }
  };
  const { rows } = leaderboard(hist, {});
  assert.equal(rows.find((r) => r.playerId === "b").busts, 5);

  const list = awards(rows);
  const byId = Object.fromEntries(list.map((a) => [a.id, a]));
  assert.equal(byId.gambler.winners[0].playerId, "a");     // Gambler: 3 Flip 7
  assert.equal(byId.gambler.value, 3);
  assert.equal(byId.golosone.winners[0].playerId, "b");    // Golosone: 5 sballi in 2 partite
  assert.equal(byId.golosone.value, 2.5);                  // conta la media, non la somma
  assert.equal(byId.tanaia.winners[0].playerId, "a");      // Tanaia: 1 sballo in 2 partite
  assert.equal(byId.tanaia.value, 0.5);
  assert.equal(byId.cannoniere.winners[0].playerId, "a");  // Cannoniere: record 210
  assert.ok(!byId.maratoneta);

  const rk = awardRanking(rows, "tanaia");
  assert.deepEqual(rk.rows.map((r) => r.playerId), ["a", "b"]);  // dal piu' basso
  assert.deepEqual(rk.rows.map((r) => r.rank), [1, 2]);
});

test("trofei: senza partite tracciate restano solo quelli sui totali", () => {
  const hist = {
    g1: { playedAt: 1000, results: { a: { name: "Ale", total: 100 }, b: { name: "Bea", total: 90 } }, winnerIds: { a: true } }
  };
  const list = awards(leaderboard(hist, {}).rows);
  assert.deepEqual(list.map((a) => a.id), ["cannoniere"]);
});

test("trofei: il Tanaia ignora chi non ha partite tracciate", () => {
  const hist = {
    g1: {
      playedAt: 1000,
      results: {
        a: { name: "Ale", total: 150, flip7s: 0, busts: 2 },
        b: { name: "Bea", total: 120 }               // recupero a mano: niente sballi noti
      },
      winnerIds: { a: true }
    }
  };
  const list = awards(leaderboard(hist, {}).rows);
  const tanaia = list.find((a) => a.id === "tanaia");
  assert.equal(tanaia.winners.length, 1);
  assert.equal(tanaia.winners[0].playerId, "a");     // Bea non concorre con i suoi 0 finti
  assert.equal(tanaia.value, 2);
});

test("apre la mano: sorteggiato al via, poi ruota a ogni round", () => {
  const live = {
    firstIdx: 1,
    players: { a: { order: 0 }, b: { order: 1 }, c: { order: 2 } }
  };
  assert.equal(roundStarter({ ...live, round: 0 }), "b");   // il sorteggiato
  assert.equal(roundStarter({ ...live, round: 1 }), "c");   // poi il successivo
  assert.equal(roundStarter({ ...live, round: 2 }), "a");
  assert.equal(roundStarter({ ...live, round: 3 }), "b");   // giro completo
  assert.equal(roundStarter({ players: live.players, round: 2 }), null); // partite vecchie senza sorteggio
});

// ---------------------------------------------------------------------------
// Correzione di una partita chiusa (reviseGame)
// ---------------------------------------------------------------------------
import { reviseGame, roundCount } from "../js/stats.js";

const closedGame = () => ({
  playedAt: new Date(2026, 4, 10, 21, 0).getTime(),
  finishedAt: new Date(2026, 4, 10, 21, 40).getTime(),
  targetScore: 200,
  source: "live",
  results: { a: { name: "Ale", total: 60, flip7s: 1, busts: 0 }, b: { name: "Bea", total: 20, flip7s: 0, busts: 1 } },
  winnerIds: { a: true },
  rounds: {
    a: { r0: { numbers: [1, 2, 3, 4, 5, 6, 7] }, r1: { numbers: [10] } },
    b: { r0: { numbers: [12], busted: true }, r1: { numbers: [20] } }
  },
  createdAt: 1
});

test("roundCount conta i round dal massimo indice, buchi compresi", () => {
  assert.equal(roundCount(null), 0);
  assert.equal(roundCount({ a: { r0: {}, r3: {} }, b: { r1: {} } }), 4);
});

test("reviseGame: totali, Flip 7, sballi e vincitore ricalcolati dalle mani corrette", () => {
  const g = closedGame();
  const rounds = JSON.parse(JSON.stringify(g.rounds));
  rounds.b.r1 = { numbers: [12, 11, 10], plus: [10], doubled: true }; // 66+10 = 76
  const out = reviseGame(g, {
    playedAt: g.playedAt, targetScore: 200,
    players: [{ playerId: "a", name: "Ale" }, { playerId: "b", name: "Bea" }],
    rounds, winnerId: null
  });
  assert.equal(out.results.a.total, 43 + 10);
  assert.equal(out.results.a.flip7s, 1);
  assert.equal(out.results.b.total, 76);
  assert.equal(out.results.b.busts, 1);
  assert.deepEqual(out.winnerIds, { b: true });
  assert.equal(out.source, "live");
  assert.equal(out.createdAt, 1);
  assert.ok(out.editedAt > 0);
  assert.equal(g.results.b.total, 20, "l'originale non viene toccato");
});

test("reviseGame: un round svuotato per tutti sparisce e i successivi scalano", () => {
  const g = closedGame();
  const rounds = JSON.parse(JSON.stringify(g.rounds));
  delete rounds.a.r0;
  delete rounds.b.r0;
  const out = reviseGame(g, { playedAt: g.playedAt, targetScore: 200, players: [{ playerId: "a", name: "Ale" }, { playerId: "b", name: "Bea" }], rounds });
  assert.deepEqual(Object.keys(out.rounds.a), ["r0"]);
  assert.equal(out.rounds.a.r0.numbers[0], 10);
  assert.equal(roundCount(out.rounds), 1);
  assert.equal(out.results.a.total, 10);
  assert.equal(out.results.a.flip7s, 0);
});

test("reviseGame: giocatore tolto e aggiunto, vincitore scelto a mano, data spostata con la stessa ora", () => {
  const g = closedGame();
  const newDay = new Date(2026, 4, 12, 0, 0).getTime();
  const out = reviseGame(g, {
    playedAt: new Date(2026, 4, 12, 21, 0).getTime(), targetScore: 250,
    players: [{ playerId: "a", name: "Alessandro" }, { playerId: "c", name: "Cri" }],
    rounds: JSON.parse(JSON.stringify(g.rounds)),
    winnerId: "c"
  });
  assert.deepEqual(Object.keys(out.results).sort(), ["a", "c"]);
  assert.equal(out.results.a.name, "Alessandro");
  assert.equal(out.results.c.total, 0);
  assert.equal(out.rounds.b, undefined, "le mani di chi e' stato tolto spariscono");
  assert.deepEqual(out.winnerIds, { c: true });
  assert.equal(out.targetScore, 250);
  assert.ok(out.playedAt > newDay);
  assert.equal(out.finishedAt - out.playedAt, 40 * 60 * 1000, "la fine segue lo spostamento della data");
});

test("reviseGame: senza mani valgono i totali scritti e il vincitore ignoto ricade sul piu' alto", () => {
  const g = { playedAt: 5, targetScore: 200, source: "manual", results: { a: { name: "Ale", total: 100 }, b: { name: "Bea", total: 90 } }, winnerIds: { a: true }, rounds: null };
  const out = reviseGame(g, {
    playedAt: 5, targetScore: 200,
    players: [{ playerId: "a", name: "Ale", total: "80" }, { playerId: "b", name: "Bea", total: 95.4 }],
    rounds: null, winnerId: "zzz"
  });
  assert.equal(out.results.a.total, 80);
  assert.equal(out.results.b.total, 95);
  assert.equal(out.results.a.flip7s, undefined, "una partita a mano resta senza statistiche di round");
  assert.deepEqual(out.winnerIds, { b: true });
  assert.equal(out.rounds, null);
});

// ---------------------------------------------------------------------------
// Congelato e record nuovi (Surgelato, Architetto)
// ---------------------------------------------------------------------------
import { handStats } from "../js/stats.js";

test("congelato: i punti restano quelli delle carte, ma la mano non e' vuota", () => {
  const r = computeRound({ numbers: [4, 9], plus: [2], frozen: true });
  assert.equal(r.total, 15);
  assert.equal(r.frozen, true);
  assert.equal(formulaOf({ numbers: [4, 9], plus: [2], frozen: true }), "(4+9) +2 · congelato");
  assert.equal(isBlankEntry({ numbers: [], plus: [], frozen: true }), false);
  assert.equal(computeRound({ numbers: [4], busted: true, frozen: true }).frozen, false, "sballato vince sul congelato");
});

test("handStats: conta solo le mani costruite con le carte e non sballate", () => {
  const rows = { r0: { numbers: [1, 2, 3] }, r1: { numbers: [5, 5], busted: true }, r2: { manual: 40 }, r3: { numbers: [7, 8, 9, 10, 11] } };
  const hs = handStats(rows);
  assert.equal(hs.hands, 2);
  assert.equal(hs.cards, 8);
  assert.equal(hs.rounds, 4, "tutte le mani, anche sballate o col tastierino");
  assert.equal(hs.bestHand, 45, "la mano piu' ricca: 7+8+9+10+11");
  assert.deepEqual(handStats(null), { hands: 0, cards: 0, bestHand: 0, rounds: 0 });
});

test("record: Surgelato a chi viene congelato piu' spesso, Architetto alle mani piu' lunghe", () => {
  const hist = {
    g1: {
      playedAt: DOPO, results: { a: { name: "Ale", total: 50, flip7s: 0, busts: 0, freezes: 2 }, b: { name: "Bea", total: 60, flip7s: 0, busts: 0, freezes: 0 } },
      winnerIds: { b: true },
      rounds: { a: { r0: { numbers: [1, 2] }, r1: { numbers: [3, 4, 5, 6] } }, b: { r0: { numbers: [12] }, r1: { manual: 30 } } }
    },
    g2: { playedAt: DOPO + 1000, results: { a: { name: "Ale", total: 10 }, c: { name: "Cri", total: 90 } }, winnerIds: { c: true }, rounds: null }
  };
  const { rows } = leaderboard(hist, {});
  const ale = rows.find((r) => r.playerId === "a");
  assert.equal(ale.freezes, 2);
  assert.equal(ale.freezeRate, 2, "due congelate in una sola partita tracciata");
  assert.equal(ale.avgCards, 3);
  assert.equal(rows.find((r) => r.playerId === "b").avgCards, 1);
  const list = awards(rows);
  assert.deepEqual(list.find((a) => a.id === "surgelato").winners.map((w) => w.playerId), ["a"]);
  assert.deepEqual(list.find((a) => a.id === "architetto").winners.map((w) => w.playerId), ["a"]);
  assert.equal(list.find((a) => a.id === "architetto").unit(3), "3 carte a mano");
  assert.equal(list.find((a) => a.id === "surgelato").unit(1), "1 congelata a partita");
  assert.equal(list.find((a) => a.id === "golosone"), undefined, "nessuno ha sballato: niente Golosone");
  const rank = awardRanking(rows, "architetto");
  assert.deepEqual(rank.rows.map((r) => r.playerId), ["a", "b"], "Cri non ha mani segnate carta per carta");
});

test("reviseGame conta anche le congelate", () => {
  const g = closedGame();
  const rounds = JSON.parse(JSON.stringify(g.rounds));
  rounds.a.r1.frozen = true;
  const out = reviseGame(g, { playedAt: g.playedAt, targetScore: 200, players: [{ playerId: "a", name: "Ale" }, { playerId: "b", name: "Bea" }], rounds });
  assert.equal(out.results.a.freezes, 1);
  assert.equal(out.results.a.total, 43 + 10);
});

test("congelate: le partite vecchie senza quel dato non annacquano la media", () => {
  const hist = {
    vecchia: { playedAt: DOPO - 864e5, results: { a: { name: "Ale", total: 100, flip7s: 0, busts: 1 }, b: { name: "Bea", total: 90, flip7s: 0, busts: 0 } }, winnerIds: { a: true } },
    nuova: { playedAt: DOPO, results: { a: { name: "Ale", total: 80, flip7s: 0, busts: 0, freezes: 3 }, b: { name: "Bea", total: 95, flip7s: 0, busts: 0, freezes: 0 } }, winnerIds: { b: true } }
  };
  const { rows } = leaderboard(hist, {});
  const ale = rows.find((r) => r.playerId === "a");
  assert.equal(ale.tracked, 2);
  assert.equal(ale.frozenTracked, 1, "conta solo la partita che ha registrato le congelate");
  assert.equal(ale.freezeRate, 3, "3 congelate in 1 partita, non 1,5 in 2");
  assert.deepEqual(awards(rows).find((x) => x.id === "surgelato").winners.map((w) => w.playerId), ["a"]);
});

test("congelate: con solo partite vecchie il Surgelato non si assegna", () => {
  const hist = { g: { playedAt: 1, results: { a: { name: "Ale", total: 10, busts: 0 }, b: { name: "Bea", total: 20, busts: 2 } }, winnerIds: { b: true } } };
  const { rows } = leaderboard(hist, {});
  assert.equal(awards(rows).find((x) => x.id === "surgelato"), undefined);
  assert.equal(awardRanking(rows, "surgelato").rows.length, 0);
});

test("la classifica si ordina anche per percentuale di vittorie", () => {
  const rows = [
    { playerId: "a", name: "Ale", crowns: 5, games: 20, winRate: 0.25, avg: 100, points: 2000, best: 200 },
    { playerId: "b", name: "Bea", crowns: 2, games: 3, winRate: 2 / 3, avg: 90, points: 270, best: 180 }
  ];
  assert.deepEqual(sortLeaderboard(rows, "winRate", -1).map((r) => r.playerId), ["b", "a"]);
  assert.deepEqual(sortLeaderboard(rows, "winRate", 1).map((r) => r.playerId), ["a", "b"]);
});

test("congelate: una partita giocata prima dell'avvio non conta, anche se ha il dato", () => {
  const prima = { playedAt: FREEZE_STATS_SINCE - 1, results: { a: { name: "Ale", total: 50, busts: 0, freezes: 0 }, b: { name: "Bea", total: 60, busts: 0, freezes: 0 } }, winnerIds: { b: true } };
  const dopo = { playedAt: FREEZE_STATS_SINCE, results: { a: { name: "Ale", total: 40, busts: 0, freezes: 2 }, b: { name: "Bea", total: 70, busts: 0, freezes: 0 } }, winnerIds: { b: true } };

  const solaPrima = leaderboard({ g: prima }, {}).rows.find((r) => r.playerId === "a");
  assert.equal(solaPrima.frozenTracked, 0, "la partita di prima resta fuori dal conteggio");
  assert.equal(solaPrima.freezeRate, 0);
  assert.equal(awards(leaderboard({ g: prima }, {}).rows).find((x) => x.id === "surgelato"), undefined);

  const rows = leaderboard({ g1: prima, g2: dopo }, {}).rows;
  const ale = rows.find((r) => r.playerId === "a");
  assert.equal(ale.frozenTracked, 1, "conta solo quella dall'avvio in poi");
  assert.equal(ale.freezeRate, 2, "2 congelate in 1 partita, non 1 in 2");

  const h = playerHighlights([prima, dopo].map((g, i) => ({ id: "g" + i, ...g })), "a");
  assert.equal(h.freezeGames, 1);
  assert.equal(h.freezes, 2);
});

test("Colpo Grosso: la mano piu' ricca in un solo round, contando anche gli sballi come zero", () => {
  const hist = {
    g1: {
      playedAt: 1, results: { a: { name: "Ale", total: 100, busts: 1 }, b: { name: "Bea", total: 80, busts: 0 } }, winnerIds: { a: true },
      rounds: { a: { r0: { numbers: [12, 11, 10], doubled: true, plus: [10] }, r1: { numbers: [5], busted: true } }, b: { r0: { manual: 70 }, r1: { numbers: [4, 6] } } }
    },
    g2: { playedAt: 2, results: { c: { name: "Cri", total: 300 }, a: { name: "Ale", total: 10 } }, winnerIds: { c: true }, rounds: null }
  };
  const { rows } = leaderboard(hist, {});
  assert.equal(rows.find((r) => r.playerId === "a").bestHand, 76);
  assert.equal(rows.find((r) => r.playerId === "a").rounds, 2);
  assert.equal(rows.find((r) => r.playerId === "b").bestHand, 70, "vale anche una mano inserita col tastierino");
  const cg = awards(rows).find((x) => x.id === "colpogrosso");
  assert.deepEqual(cg.winners.map((w) => w.playerId), ["a"]);
  assert.equal(cg.unit(76), "76 punti in una mano");
  assert.deepEqual(awardRanking(rows, "colpogrosso").rows.map((r) => r.playerId), ["a", "b"], "Cri ha solo totali, non mani");
  const h = playerHighlights([{ id: "g1", ...hist.g1 }, { id: "g2", ...hist.g2 }], "a");
  assert.equal(h.bestHand, 76);
  assert.equal(h.rounds, 2);
});
