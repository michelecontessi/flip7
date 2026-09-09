// La modalita' allenamento vive solo ai tavoli online con almeno un bot:
// li' la voce del menu c'e' sempre (anche in lobby e a partita finita, per
// poterla spegnere), ma il rischio di sballo si mostra solo a partita in corso.
import test from "node:test";
import assert from "node:assert/strict";

// prefs.js parla con localStorage: in node lo facciamo finto, in memoria.
const box = new Map();
globalThis.localStorage = {
  getItem: (k) => (box.has(k) ? box.get(k) : null),
  setItem: (k, v) => box.set(k, String(v)),
  removeItem: (k) => box.delete(k)
};

const { trainingAllowed, trainingOn } = await import("../js/views/table.js");
const { prefs } = await import("../js/prefs.js");

const table = (status, bots) => ({
  status,
  order: ["a", "b"],
  seats: { a: { name: "Michele", bot: false }, b: { name: "Bot", bot: bots } }
});
const STATI = ["lobby", "playing", "roundEnd", "over"];

test("senza bot la voce non compare mai, in nessuno stato del tavolo", () => {
  for (const s of STATI) assert.equal(trainingAllowed(table(s, false)), false, s);
  assert.equal(trainingAllowed(null), false);
  assert.equal(trainingAllowed({ status: "playing", order: [], seats: {} }), false);
});

test("con un bot la voce c'e' sempre: si accende in lobby e si spegne a partita finita", () => {
  for (const s of STATI) assert.equal(trainingAllowed(table(s, true)), true, s);
});

test("il rischio si mostra solo a partita in corso, e solo con l'interruttore su", () => {
  prefs.set("training", false);
  for (const s of STATI) assert.equal(trainingOn(table(s, true)), false, `spento: ${s}`);

  prefs.set("training", true);
  assert.equal(trainingOn(table("playing", true)), true);
  assert.equal(trainingOn(table("roundEnd", true)), true);
  assert.equal(trainingOn(table("lobby", true)), false, "in lobby non c'e' turno");
  assert.equal(trainingOn(table("over", true)), false, "a partita finita non c'e' piu' niente da pescare");
  for (const s of STATI) assert.equal(trainingOn(table(s, false)), false, `senza bot: ${s}`);
  prefs.set("training", false);
});
