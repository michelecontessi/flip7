import test from "node:test";
import assert from "node:assert/strict";
import * as store from "../js/store.js";
import { createLobby, startGame, hit, stay, nextRound, abandonGame } from "../js/game.js";
import { computeRound } from "../js/scoring.js";
import { playerTotal, leaderboard, roundCount } from "../js/stats.js";

/** Tavolo online di prova (si pesca dalla FINE del mazzo). */
function table(names, deck, target = 200, id = "tA") {
  let s = createLobby(target, { id, owner: { uid: "u0", name: names[0] } });
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
    id: "tX", status: "over", target: 20, startedAt: 1000,
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
    id: "tY", status: "over", target: 20, startedAt: Date.now(),
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
  assert.ok(!store.getRoom().game.tA);      // il tavolo si libera
});

test("l'abbandono chiude la partita e la archivia coi punteggi di quel momento", async () => {
  let s = table(["Ada", "Bea", "Caio"], ["n2", "n5", "n4"], 200);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");
  s = stay(s, "s0"); s = stay(s, "s1"); s = stay(s, "s2");
  assert.equal(s.rounds.length, 1);
  s = nextRound(s);
  s.deck = ["n9", "n9"];
  s = hit(s, s.turn);                       // una mano appena cominciata
  s = abandonGame(s, "s2");                 // Caio abbandona: finisce per tutti
  assert.equal(s.status, "over");

  const g = await savedGame(s);
  assert.deepEqual(Object.keys(g.rounds).sort(), ["p0", "p1", "p2"]);
  assert.equal(roundCount(g.rounds), 1);    // la mano interrotta non si conta
  for (const pid of ["p0", "p1", "p2"]) {
    assert.equal(playerTotal({ scores: g.rounds }, pid), g.results[pid].total);
  }
  assert.deepEqual(g.winnerIds, { p1: true }); // vince il punteggio piu' alto (Bea, 5)
});

test("un tavolo aperto prima dell'aggiornamento salva i soli totali", async () => {
  // nessun `startedAt`: le fotografie delle mani mancano o sono a meta'
  const state = {
    id: "tZ", status: "over", target: 20,
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

test("piu' tavoli aperti insieme: ognuno vive per conto suo", async () => {
  const a = table(["Ada", "Bea"], ["n5", "n3"], 200, "tUno");
  const b = table(["Caio", "Dina"], ["n7", "n2"], 200, "tDue");
  await store.commitGame(a);
  await store.commitGame(b);
  assert.deepEqual(store.tables().map((t) => t.id), ["tUno", "tDue"]);

  // chiudere un tavolo non tocca l'altro
  await store.closeTable("tUno");
  assert.deepEqual(store.tables().map((t) => t.id), ["tDue"]);
  assert.ok(store.getRoom().game.tDue);

  // e salvare una partita libera solo il proprio tavolo
  const c = table(["Eva", "Fabio"], ["n5", "n3"], 200, "tTre");
  await store.commitGame(c);
  let done = c;
  done = stay(hit(done, "s0"), "s0");
  done = stay(hit(done, "s1"), "s1");
  await store.saveOnlineGame(done);
  assert.deepEqual(store.tables().map((t) => t.id), ["tDue"]);
});

test("un tavolo del formato vecchio diventa il primo della mappa", () => {
  const legacy = { status: "playing", round: 2, order: ["s0"], seats: { s0: { name: "Ada", total: 7 } } };
  const map = store.normalizeTables(legacy);
  assert.deepEqual(Object.keys(map), ["t0"]);
  assert.equal(map.t0.round, 2);
  assert.equal(map.t0.id, "t0");
  // la forma nuova passa cosi' com'e', con l'id scritto in ogni tavolo
  const nuovi = store.normalizeTables({ tA: { status: "lobby" }, tB: { status: "playing" } });
  assert.deepEqual(Object.keys(nuovi).sort(), ["tA", "tB"]);
  assert.equal(nuovi.tB.id, "tB");
  assert.deepEqual(store.normalizeTables(null), {});
});
