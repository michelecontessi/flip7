// I record "solo online" (Sette Vite, Iceman, Bullo, Generoso) contano soltanto
// le partite giocate al tavolo online: dal vivo le vite extra e il "congelato
// da" si segnano quando ci si ricorda, e chi tira il Pesca Tre o regala la
// Seconda Chance non lo segna nessuno. La carta tirata a se stessi non conta.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AWARDS, leaderboard, awards, playerHighlights, interactionCredits, INTERACTIONS_SINCE } from "../js/stats.js";
import { computeRound } from "../js/scoring.js";

const liveSrc = readFileSync(new URL("../js/views/live.js", import.meta.url), "utf8");
const since = INTERACTIONS_SINCE + 1000;
const results = (totals, extra = {}) => Object.fromEntries(Object.entries(totals).map(([pid, total]) => [pid, { name: pid, total, ...(extra[pid] || {}) }]));

test("Sette Vite, Iceman, Bullo e Generoso sono i record marcati solo online", () => {
  assert.deepEqual(AWARDS.filter((a) => a.online).map((a) => a.id), ["settevite", "iceman", "bullo", "generoso"]);
});

test("una partita dal vivo non alimenta i record solo online, anche se il segnapunti ha segnato cuori e congelato da", () => {
  const history = {
    live: { playedAt: since, source: "live", winnerIds: { ada: true },
      results: results({ ada: 100, bea: 50 }, { ada: { hearts: 2 }, bea: { hearts: 1 } }),
      rounds: { ada: { r0: { numbers: [10], hearts: 2 } }, bea: { r0: { numbers: [5], frozen: true, frozenBy: "ada", hearts: 1 } } } },
    online: { playedAt: since, source: "online", winnerIds: { bea: true },
      results: results({ ada: 40, bea: 60 }, { ada: { hearts: 0 }, bea: { hearts: 1 } }),
      rounds: { ada: { r0: { numbers: [10], frozen: true, frozenBy: "bea", fl3By: ["bea"] } }, bea: { r0: { numbers: [10], hearts: 1, scFrom: ["ada"] } } } }
  };
  const { rows } = leaderboard(history, {});
  const ada = rows.find((r) => r.playerId === "ada");
  const bea = rows.find((r) => r.playerId === "bea");
  // dal vivo: 2 cuori e una congelata tirata da Ada, e non contano
  assert.equal(ada.hearts, 0);
  assert.equal(ada.heartTracked, 1);
  assert.equal(ada.froze, 0);
  assert.equal(ada.interTracked, 1);
  // online: tutto a credito
  assert.equal(bea.hearts, 1);
  assert.equal(bea.heartTracked, 1);
  assert.equal(bea.froze, 1);
  assert.equal(bea.fl3, 1);
  assert.equal(ada.gave, 1);
  const list = Object.fromEntries(awards(rows).map((a) => [a.id, a]));
  assert.deepEqual(list.settevite.winners.map((w) => w.playerId), ["bea"]);
  assert.deepEqual(list.iceman.winners.map((w) => w.playerId), ["bea"]);
  assert.deepEqual(list.bullo.winners.map((w) => w.playerId), ["bea"]);
  assert.deepEqual(list.generoso.winners.map((w) => w.playerId), ["ada"]);
  // la scheda giocatore ragiona allo stesso modo: nemesi solo dall'online
  const games = Object.entries(history).map(([id, g]) => ({ id, ...g }));
  assert.equal(playerHighlights(games, "ada").froze, 0);
  assert.deepEqual(playerHighlights(games, "ada").nemesis, { playerId: "bea", n: 1 });
  assert.equal(playerHighlights(games, "bea").nemesis, null);
});

test("il Pesca Tre o il Congela tirati a se stessi non fanno Bullo ne' Iceman", () => {
  const g = { id: "g", playedAt: since, source: "online", winnerIds: { ada: true },
    results: results({ ada: 100, bea: 50 }),
    rounds: {
      // Ada unica in gioco: il Pesca Tre e il Congela se li tira da sola
      ada: { r0: { numbers: [10], fl3By: ["ada"], frozen: true, frozenBy: "ada" }, r1: { numbers: [10], fl3By: ["bea", "ada"] } },
      bea: { r0: { numbers: [5], frozen: true, frozenBy: "ada" } }
    } };
  const c = interactionCredits(g);
  assert.equal(c.ada.fl3, 0);
  assert.equal(c.ada.froze, 1);
  assert.deepEqual(c.ada.frozeWhom, { bea: 1 });
  assert.equal(c.bea.fl3, 1);
  const { rows } = leaderboard({ g }, {});
  const list = Object.fromEntries(awards(rows).map((a) => [a.id, a]));
  assert.deepEqual(list.bullo.winners.map((w) => w.playerId), ["bea"]);
  assert.equal(list.bullo.value, 1);
  assert.deepEqual(list.iceman.winners.map((w) => w.playerId), ["ada"]);
  assert.equal(list.iceman.value, 1);
  // e nella scheda non si e' la nemesi di se stessi
  const h = playerHighlights([g], "ada");
  assert.equal(h.fl3, 0);
  assert.equal(h.nemesis, null);
  assert.deepEqual(h.bully, { playerId: "bea", n: 1 });
});

test("il pannello dal vivo non segna le vite extra, ma tiene Congelato e il congelato da", () => {
  assert.ok(!liveSrc.includes("calc-heart"), "niente tasto Vita extra");
  assert.ok(liveSrc.includes('data-action="calc-freeze"') && liveSrc.includes('data-action="calc-frozen-by"'), "Congelato e congelato da restano");
});

test("niente tastierino nel pannello punti, ma le mani scritte come totale valgono ancora", () => {
  assert.ok(!liveSrc.includes("calc-mode") && !liveSrc.includes('class="keypad"'), "niente linguetta Tastierino ne' tasti numerici");
  assert.equal(computeRound({ manual: 40 }).total, 40);
  assert.equal(computeRound({ manual: 40, flip7: true }).total, 55);
});
