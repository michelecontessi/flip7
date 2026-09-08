// ---------------------------------------------------------------------------
// Spareggio: quando si taglia il traguardo in parita' la partita non finisce,
// si gioca una manche extra fra i soli pari merito. Vale sia per il tavolo
// online (js/game.js) sia per il segnapunti dal vivo (js/store.js).
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import { createLobby, startGame, hit, stay, nextRound } from "../js/game.js";
import * as store from "../js/store.js";
import { roundKey, roundPlayers, tiebreakOf, roundStarter } from "../js/stats.js";

// --- tavolo online -----------------------------------------------------------
/** Tavolo di prova: si pesca dalla FINE del mazzo. */
function table(names, deck, target = 200) {
  let s = createLobby(target, { id: "tP" });
  names.forEach((n, i) => {
    const sid = "s" + i;
    s.seats[sid] = { uid: "u" + i, name: n, playerId: "p" + i, total: 0 };
    s.order.push(sid);
  });
  return startGame(s, () => 0, deck);
}

/** Il giro completo: ognuno pesca una carta e poi si ferma. */
function playRound(s, order) {
  for (const sid of order) s = hit(s, sid);
  for (const sid of order) s = stay(s, sid);
  return s;
}

test("pareggio al traguardo: la partita non finisce, si apre lo spareggio", () => {
  // traguardo a 10: Ada e Bea fanno 10, Carlo 3 -> spareggio fra le prime due
  let s = table(["Ada", "Bea", "Carlo"], ["n3", "n10", "n10"], 10);
  s = playRound(s, ["s0", "s1", "s2"]);

  assert.equal(s.status, "roundEnd", "non e' finita: c'e' da spareggiare");
  assert.deepEqual(s.tiebreak, ["s0", "s1"]);
  assert.equal(s.seats.s0.total, 10);
  assert.equal(s.seats.s1.total, 10);
  assert.equal(s.seats.s2.total, 3);
});

test("nella manche di spareggio chi non e' pari merito parte gia' fuori", () => {
  let s = table(["Ada", "Bea", "Carlo"], ["n3", "n10", "n10"], 10);
  s = playRound(s, ["s0", "s1", "s2"]);
  s = nextRound(s);

  assert.equal(s.hands.s2.out, "excluded");
  assert.equal(s.hands.s0.out, null);
  assert.equal(s.hands.s1.out, null);
  assert.ok(s.turn !== "s2", "il turno non passa mai da chi e' fuori");
  assert.deepEqual(s.tiebreak, ["s0", "s1"], "lo spareggio resta impostato per tutta la manche");
});

test("lo spareggio decide il vincitore, e chi era fuori non prende punti", () => {
  // mano 1 -> Ada 10, Bea 10, Carlo 3; nello spareggio (l'ordine ruota, apre
  // Bea) escono un 8 a Bea e un 5 ad Ada, Carlo resta fermo
  let s = table(["Ada", "Bea", "Carlo"], ["n5", "n8", "n3", "n10", "n10"], 10);
  s = playRound(s, ["s0", "s1", "s2"]);
  s = nextRound(s);
  s = playRound(s, s.order.filter((sid) => sid !== "s2"));

  assert.equal(s.status, "over");
  assert.equal(s.tiebreak, null);
  assert.equal(s.seats.s1.total, 18);
  assert.equal(s.seats.s0.total, 15);
  assert.equal(s.seats.s2.total, 3, "chi era fuori resta ai punti di prima");
  // la mano dello spareggio non esiste per chi non l'ha giocata
  assert.deepEqual(Object.keys(s.rounds[1]).sort(), ["s0", "s1"]);
});

test("se lo spareggio finisce ancora pari se ne gioca un altro", () => {
  // mano 1: pari a 10; spareggio: Ada 4 e Bea 4 -> ancora pari
  let s = table(["Ada", "Bea", "Carlo"], ["n4", "n4", "n3", "n10", "n10"], 10);
  s = playRound(s, ["s0", "s1", "s2"]);
  s = nextRound(s);
  s = playRound(s, s.order.filter((sid) => sid !== "s2"));

  assert.equal(s.status, "roundEnd");
  assert.deepEqual([...s.tiebreak].sort(), ["s0", "s1"]);
  assert.equal(s.seats.s0.total, 14);
  assert.equal(s.seats.s1.total, 14);
});

test("chi taglia il traguardo da solo vince senza spareggi", () => {
  let s = table(["Ada", "Bea"], ["n3", "n10"], 10);
  s = playRound(s, ["s0", "s1"]);
  assert.equal(s.status, "over");
  assert.equal(s.tiebreak, null);
});

test("il pareggio sotto il traguardo non apre nessuno spareggio", () => {
  let s = table(["Ada", "Bea"], ["n4", "n4"], 200);
  s = playRound(s, ["s0", "s1"]);
  assert.equal(s.status, "roundEnd");
  assert.equal(s.tiebreak, null);
});

// --- segnapunti dal vivo -----------------------------------------------------
const entry = (n) => ({ numbers: [n], plus: [], doubled: false, busted: false });

/** Partita dal vivo di prova, gia' dentro allo store (modalita' locale). */
async function liveGame(names, target) {
  const ids = [];
  for (const n of names) ids.push(await store.addPlayer(n));
  await store.startGame(ids, target);
  return ids;
}

test("segnapunti: pareggio al traguardo -> il round dopo lo giocano solo i pari merito", async () => {
  const [a, b, c] = await liveGame(["Anna", "Bruno", "Carla"], 10);
  await store.setRoundEntry(a, 0, entry(10));
  await store.setRoundEntry(b, 0, entry(10));
  await store.setRoundEntry(c, 0, entry(3));
  await store.closeRound();

  const live = store.getRoom().live;
  assert.equal(live.status, "playing", "la partita non si chiude in parita'");
  assert.equal(live.round, 1);
  assert.deepEqual(tiebreakOf(live, 1).sort(), [a, b].sort());
  assert.deepEqual(roundPlayers(live, 1).sort(), [a, b].sort());
  assert.ok(roundPlayers(live, 1).indexOf(c) === -1, "Carla resta fuori");
  assert.ok([a, b].includes(roundStarter(live)), "apre la manche uno dei due pari merito");
});

test("segnapunti: chiuso lo spareggio vince chi ha piu' punti", async () => {
  const [a, b, c] = await liveGame(["Anna", "Bruno", "Carla"], 10);
  await store.setRoundEntry(a, 0, entry(10));
  await store.setRoundEntry(b, 0, entry(10));
  await store.setRoundEntry(c, 0, entry(3));
  await store.closeRound();

  await store.setRoundEntry(a, 1, entry(7));
  await store.setRoundEntry(b, 1, entry(2));
  await store.closeRound();

  const live = store.getRoom().live;
  assert.equal(live.status, "finished");
  assert.deepEqual(live.winnerIds, { [a]: true });
  // a Carla non e' stato segnato nessuno zero d'ufficio nella manche extra
  assert.equal((live.scores[c] || {})[roundKey(1)], undefined);
});

test("segnapunti: spareggio ancora pari -> se ne gioca un altro", async () => {
  const [a, b, c] = await liveGame(["Anna", "Bruno", "Carla"], 10);
  await store.setRoundEntry(a, 0, entry(10));
  await store.setRoundEntry(b, 0, entry(10));
  await store.setRoundEntry(c, 0, entry(3));
  await store.closeRound();
  await store.setRoundEntry(a, 1, entry(4));
  await store.setRoundEntry(b, 1, entry(4));
  await store.closeRound();

  const live = store.getRoom().live;
  assert.equal(live.status, "playing");
  assert.equal(live.round, 2);
  assert.deepEqual(tiebreakOf(live, 2).sort(), [a, b].sort());
});

test("segnapunti: riaprire il round cancella lo spareggio appena aperto", async () => {
  const [a, b, c] = await liveGame(["Anna", "Bruno", "Carla"], 10);
  await store.setRoundEntry(a, 0, entry(10));
  await store.setRoundEntry(b, 0, entry(10));
  await store.setRoundEntry(c, 0, entry(3));
  await store.closeRound();
  assert.ok(tiebreakOf(store.getRoom().live, 1));

  await store.reopenRound();
  const live = store.getRoom().live;
  assert.equal(live.round, 0);
  assert.equal(tiebreakOf(live, 1), null);
  assert.deepEqual(roundPlayers(live, 0).sort(), [a, b, c].sort());
});

test("segnapunti: chi vince da solo non passa dallo spareggio", async () => {
  const [a, b] = await liveGame(["Anna", "Bruno"], 10);
  await store.setRoundEntry(a, 0, entry(12));
  await store.setRoundEntry(b, 0, entry(3));
  await store.closeRound();

  const live = store.getRoom().live;
  assert.equal(live.status, "finished");
  assert.deepEqual(live.winnerIds, { [a]: true });
});

// --- archivio ----------------------------------------------------------------
test("la partita online archivia quali round erano manche di spareggio", async () => {
  const state = {
    id: "tS", status: "over", target: 20, startedAt: 1000,
    order: ["s0", "s1", "s2"],
    seats: {
      s0: { name: "Ada", playerId: "pa", total: 27 },
      s1: { name: "Bea", playerId: "pb", total: 23 },
      s2: { name: "Cip", playerId: "pc", total: 5 }
    },
    rounds: [
      { s0: { numbers: [20], plus: [], doubled: false, busted: false, frozen: false },
        s1: { numbers: [20], plus: [], doubled: false, busted: false, frozen: false },
        s2: { numbers: [5], plus: [], doubled: false, busted: false, frozen: false } },
      // manche di spareggio: Cip non c'e'
      { s0: { numbers: [7], plus: [], doubled: false, busted: false, frozen: false },
        s1: { numbers: [3], plus: [], doubled: false, busted: false, frozen: false } }
    ]
  };
  const id = await store.saveOnlineGame(state);
  const g = store.getRoom().history[id];

  assert.deepEqual(g.tiebreaks, { r1: ["pa", "pb"] });
  assert.equal(g.rounds.pc.r1, undefined, "chi era fuori non ha mano in quel round");
  assert.deepEqual(g.winnerIds, { pa: true });
  assert.deepEqual(tiebreakOf(g, 1), ["pa", "pb"]);
  assert.equal(tiebreakOf(g, 0), null);
});
