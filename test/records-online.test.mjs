// I record "solo online" sono quelli che il pannello punti dal vivo non puo'
// alimentare: il segnapunti non segna chi tira il Pesca Tre ne' chi regala la
// Seconda Chance (fl3By / scFrom li scrive solo il tavolo online), mentre
// "congelato da" (frozenBy) si segna anche dal vivo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AWARDS } from "../js/stats.js";
import { computeRound } from "../js/scoring.js";

const liveSrc = readFileSync(new URL("../js/views/live.js", import.meta.url), "utf8");

test("Bullo e Generoso sono gli unici record marcati solo online", () => {
  assert.deepEqual(AWARDS.filter((a) => a.online).map((a) => a.id), ["bullo", "generoso"]);
});

test("solo online = esattamente i record che il pannello dal vivo non sa segnare", () => {
  const FIELD = { fl3: "fl3By", gave: "scFrom", froze: "frozenBy" };
  for (const a of AWARDS) {
    const field = FIELD[a.key];
    if (!field) continue;
    const liveWrites = liveSrc.includes(field);
    assert.equal(Boolean(a.online), !liveWrites, `${a.id}: il pannello dal vivo ${liveWrites ? "scrive" : "non scrive"} ${field}`);
  }
});

test("niente tastierino nel pannello punti, ma le mani scritte come totale valgono ancora", () => {
  assert.ok(!liveSrc.includes("calc-mode") && !liveSrc.includes('class="keypad"'), "niente linguetta Tastierino ne' tasti numerici");
  assert.equal(computeRound({ manual: 40 }).total, 40);
  assert.equal(computeRound({ manual: 40, flip7: true }).total, 55);
});
