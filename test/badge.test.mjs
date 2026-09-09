// La carta di stagione (js/icons.js): il mese e' il NUMERO della carta del
// mazzo (maggio = 5), col colore che quel numero ha nel gioco; l'anno per
// intero nel cartiglio, faccia crema o notte, e la carta spenta del mese in corso.
import test from "node:test";
import assert from "node:assert/strict";
import { seasonBadge, seasonTone, SEASON_TONES } from "../js/icons.js";

const months = Array.from({ length: 12 }, (_, i) => "2026-" + String(i + 1).padStart(2, "0"));
const bigNumber = (svg) => (svg.match(/font-size="2[0-9]"[^>]*>(\d+)</) || [])[1];

test("carta di stagione: il mese e' il numero della carta, l'anno sta nel cartiglio", () => {
  assert.equal(bigNumber(seasonBadge("2026-05")), "5", "maggio e' la carta 5");
  assert.equal(bigNumber(seasonBadge("2026-12")), "12");
  assert.equal(bigNumber(seasonBadge("2026-01")), "1");
  assert.ok(seasonBadge("2026-05").includes(">2026<"), "l'anno per intero");
  assert.ok(seasonBadge("2026-05").includes("Campione di Maggio 2026"));
  assert.equal(months.map((k) => bigNumber(seasonBadge(k))).join(","), "1,2,3,4,5,6,7,8,9,10,11,12");
});

test("carta di stagione: ogni mese il colore della sua carta nel mazzo", () => {
  assert.equal(seasonTone("2026-05"), SEASON_TONES[4]);
  assert.equal(new Set(months.map(seasonTone)).size, 12, "dodici colori diversi");
  assert.equal(seasonTone("2027-05"), seasonTone("2026-05"), "stesso mese, stesso colore ogni anno");
  assert.ok(seasonBadge("2026-05").includes(SEASON_TONES[4]), "il colore finisce nel disegno");
});

test("carta di stagione: faccia crema negli anni pari, notte in quelli dispari", () => {
  assert.ok(seasonBadge("2026-09").includes('fill="#f6efdc"'));
  assert.ok(!seasonBadge("2026-09").includes('fill="#303356"'));
  assert.ok(seasonBadge("2027-09").includes('fill="#303356"'));
});

test("carta del mese in corso: spenta, senza il colore del mese, col titolo dato", () => {
  const b = seasonBadge("2026-09", { muted: true, cls: "md", title: "Settembre 2026, in corso" });
  assert.ok(b.includes('class="season-badge md muted"'));
  assert.ok(!b.includes(SEASON_TONES[8]), "niente colore: il titolo non e' assegnato");
  assert.ok(b.includes("Settembre 2026, in corso"));
  assert.equal(bigNumber(b), "9");
});
