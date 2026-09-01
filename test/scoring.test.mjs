import test from "node:test";
import assert from "node:assert/strict";
import { computeRound, formulaOf, isBlankEntry } from "../js/scoring.js";
import { leaderboard, sortLeaderboard, playerHighlights, playerTotal, liveStandings, winnersOf, roundKey, awards, awardRanking, roundStarter } from "../js/stats.js";

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
