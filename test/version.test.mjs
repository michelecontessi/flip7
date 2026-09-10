// La versione dell'app e quella della cache del service worker devono
// coincidere: e' quello che fa scattare l'avviso "c'e' una versione nuova".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../js/config.js";

test("APP_VERSION (js/config.js) e CACHE (sw.js) portano lo stesso numero", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const m = sw.match(/const CACHE = "flip7-v(\d+)"/);
  assert.ok(m, "sw.js deve avere const CACHE = \"flip7-vN\"");
  assert.equal(m[1], APP_VERSION);
});

test("i file nuovi stanno nella shell del service worker", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["./js/notify.js", "./js/share.js", "./js/game.js", "./js/vengeance.js", "./js/views/table.js"]) assert.ok(sw.includes(`"${f}"`), f);
});
