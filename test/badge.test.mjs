// Lo scudetto di stagione (js/icons.js): mese e anno scritti, il colore del
// mese, la fascia che cambia tra anni pari e dispari, l'argento del mese in corso.
import test from "node:test";
import assert from "node:assert/strict";
import { seasonBadge, seasonTone, SEASON_TONES } from "../js/icons.js";

const months = Array.from({ length: 12 }, (_, i) => "2026-" + String(i + 1).padStart(2, "0"));

test("scudetto: mese e anno, campo del colore del mese, dodici tinte diverse", () => {
  const b = seasonBadge("2026-09");
  assert.match(b, />SET</);
  assert.match(b, />26</);
  assert.ok(b.includes("Campione di Settembre 26"));
  assert.equal(seasonTone("2026-09"), SEASON_TONES[8][0]);
  assert.equal(new Set(months.map(seasonTone)).size, 12, "ogni mese il suo colore");
  assert.equal(seasonTone("2027-09"), seasonTone("2026-09"), "stesso mese, stesso colore anche l'anno dopo");
});

test("scudetto: fascia avorio negli anni pari, inchiostro in quelli dispari", () => {
  assert.ok(seasonBadge("2026-09").includes('fill="#fff7e3"'));
  assert.ok(!seasonBadge("2026-09").includes('fill="#262a33"'));
  assert.ok(seasonBadge("2027-09").includes('fill="#262a33"'));
});

test("scudetto del mese in corso: argento, senza il colore del mese, col titolo dato", () => {
  const b = seasonBadge("2026-09", { muted: true, cls: "md", title: "Settembre 2026, in corso" });
  assert.ok(b.includes('class="season-badge md muted"'));
  assert.ok(!b.includes("#c43a2a") && !b.includes("#fff7e3"));
  assert.ok(b.includes("Settembre 2026, in corso"));
  assert.match(b, />SET</);
});
