import test from "node:test";
import assert from "node:assert/strict";
import * as store from "../js/store.js";
import { createLobby, startGame, hit, stay, nextRound, leaveSeat } from "../js/game.js";
import { computeRound } from "../js/scoring.js";
import { playerTotal, leaderboard, roundCount } from "../js/stats.js";

/** Tavolo online di prova (si pesca dalla FINE del mazzo). */
function table(names, deck, target = 200) {
  let s = createLobby(target);
  names.forEach((n, i) => {
    const sid = "s" + i;
    s.seats[sid] = { uid: "u" + i, name: n, playerId: "p" + i, total: 0 };
    s.order.push(sid);
  });
  return startGame(s, () => 0, deck);
}

const savedGame = async (state) => {
  const id = await store.saveOnlineGame(state);
  return store.getRoom().history[id];
};

test("la partita online finisce nello storico con le mani round per round", async () => {
  const state = {
    status: "over", target: 20, startedAt: 1000,
    order: ["s0", "s1"],
    seats: { s0: { name: "Ada", playerId: "p1", total: 22 }, s1: { name: "Bea", playerId: "p2", total: 8 } },
    rounds: [
      { s0: { numbers: [3, 4], plus: [], doubled: false, busted: false, frozen: false },
        s1: { numbers: [8], plus: [], doubled: false, busted: false, frozen: true } },
      { s0: { numbers: [5, 10], plus: [], doubled: false, busted: false, frozen: false },
        s1: { numbers: [9], plus: [], doubled: false, busted: true, frozen: false } }
    ]
  };
  const g = await savedGame(state);

  assert.equal(g.source, "online");
  assert.equal(g.playedAt, 1000);           // vale l'inizio partita, non il salvataggio
  assert.equal(roundCount(g.rounds), 2);
  assert.deepEqual(Object.keys(g.rounds).sort(), ["p1", "p2"]);
  assert.deepEqual(g.rounds.p1.r0.numbers, [3, 4]);
  // i totali dello storico coincidono con la somma delle mani archiviate
  assert.equal(playerTotal({ scores: g.rounds }, "p1"), 22);
  assert.equal(playerTotal({ scores: g.rounds }, "p2"), 8);
  assert.equal(g.results.p2.busts, 1);
  assert.equal(g.results.p2.freezes, 1);
  assert.equal(g.results.p1.busts, 0);
  assert.equal(g.results.p1.freezes, 0);
  assert.deepEqual(g.winnerIds, { p1: true });
});

test("sballi, congelate e Flip 7 online entrano in classifica come dal vivo", async () => {
  const state = {
    status: "over", target: 20, startedAt: Date.now(),
    order: ["s0", "s1"],
    seats: { s0: { name: "Ada", playerId: "pa", total: 43 }, s1: { name: "Bea", playerId: "pb", total: 0 } },
    rounds: [
      { s0: { numbers: [1, 2, 3, 4, 5, 6, 7], plus: [], doubled: false, busted: false, frozen: false },
        s1: { numbers: [9], plus: [], doubled: false, busted: true, frozen: false } }
    ]
  };
  const g = await savedGame(state);
  assert.equal(g.results.pa.flip7s, 1);
  assert.equal(g.results.pa.total, 43);     // (1+..+7) + 15 di bonus

  const { rows } = leaderboard({ x: g }, {});
  const ada = rows.find((r) => r.playerId === "pa");
  const bea = rows.find((r) => r.playerId === "pb");
  assert.equal(ada.flip7s, 1);
  assert.equal(ada.tracked, 1);             // conta come partita segnata round per round
  assert.equal(bea.busts, 1);
  assert.equal(bea.bustRate, 1);
  assert.equal(ada.hands, 1);               // mani costruite con le carte
  assert.equal(ada.avgCards, 7);
  assert.equal(ada.bestHand, 43);
});

test("una partita giocata davvero al tavolo si archivia intera", async () => {
  // Ada: 4 e 6; Bea: 3, poi il doppio 3 -> sballa
  let s = table(["Ada", "Bea"], ["n3", "n6", "n3", "n4"], 10);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0"); s = hit(s, "s1");
  assert.equal(s.hands.s1.out, "bust");
  s = stay(s, "s0");
  s = nextRound(s);
  s.deck = ["n1", "n8"];
  s = hit(s, "s0"); s = hit(s, "s1"); s = stay(s, "s0"); s = stay(s, "s1");
  assert.equal(s.status, "over");           // Ada ha superato i 10

  const g = await savedGame(s);
  assert.equal(roundCount(g.rounds), 2);
  for (const pid of ["p0", "p1"]) {
    assert.equal(playerTotal({ scores: g.rounds }, pid), g.results[pid].total);
  }
  assert.equal(g.results.p1.busts, 1);
  assert.equal(computeRound(g.rounds.p1.r0).total, 0);
  assert.deepEqual(g.winnerIds, { p0: true });
  assert.equal(store.getRoom().game, undefined); // il tavolo si libera
});

test("chi abbandona non lascia mani orfane nello storico", async () => {
  let s = table(["Ada", "Bea", "Caio"], ["n2", "n5", "n4"], 10);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");
  s = stay(s, "s0"); s = stay(s, "s1"); s = stay(s, "s2");
  assert.equal(s.rounds.length, 1);
  s = nextRound(s);
  s = leaveSeat(s, "s2");                   // Caio se ne va dopo il primo round
  s.deck = ["n9", "n9"];
  s = hit(s, s.turn); s = hit(s, s.turn); s = stay(s, s.turn); s = stay(s, s.turn);

  const g = await savedGame(s);
  assert.deepEqual(Object.keys(g.rounds).sort(), ["p0", "p1"]);
  assert.ok(!g.results.p2);
});

test("un tavolo aperto prima dell'aggiornamento salva i soli totali", async () => {
  // nessun `startedAt`: le fotografie delle mani mancano o sono a meta'
  const state = {
    status: "over", target: 20,
    order: ["s0", "s1"],
    seats: { s0: { name: "Ada", playerId: "pv", total: 21 }, s1: { name: "Bea", playerId: "pw", total: 9 } },
    rounds: [{ s0: { numbers: [3], plus: [], doubled: false, busted: false, frozen: false },
               s1: { numbers: [9], plus: [], doubled: false, busted: false, frozen: false } }]
  };
  const g = await savedGame(state);
  assert.ok(!g.rounds);                       // niente dettaglio parziale
  assert.equal(g.results.pv.busts, undefined);
  assert.equal(g.results.pv.total, 21);
  // e in classifica non conta come partita segnata round per round
  const { rows } = leaderboard({ old: g }, {});
  assert.equal(rows.find((r) => r.playerId === "pv").tracked, 0);
});
