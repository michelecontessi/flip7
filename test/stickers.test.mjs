// Gli sticker del tavolo (js/icons.js): disegnati a mano, mai emoji di sistema,
// e con una chiave corta perche' e' quella che finisce nel database.
import test from "node:test";
import assert from "node:assert/strict";
import { STICKERS, sticker } from "../js/icons.js";

const keys = Object.keys(STICKERS);

test("il set: i sei di sempre piu' i quattro nuovi, dieci in tutto", () => {
  assert.deepEqual(keys, ["lol", "wow", "cry", "cool", "fire", "gg", "culo", "rage", "tongue", "sleep"]);
  assert.equal(keys.length % 5, 0, "la barra e' una griglia da cinque: le file restano piene");
});

test("ogni sticker: un disegno SVG con la sua etichetta, niente emoji", () => {
  for (const k of keys) {
    const svg = sticker(k);
    assert.match(svg, /^<svg class="sticker /, k);
    assert.match(svg, /<\/svg>$/, k);
    assert.ok(STICKERS[k].label.trim(), `${k} senza etichetta`);
    assert.ok(svg.includes(`aria-label="${STICKERS[k].label}"`), k);
    assert.ok(!/\p{Extended_Pictographic}/u.test(svg), `${k}: qui si disegna, niente emoji`);
    assert.ok(k.length <= 16, `${k}: la chiave viene tagliata a 16 caratteri in salvataggio`);
  }
});

test("due sticker sulla stessa pagina non si rubano il gradiente", () => {
  const ids = (s) => (s.match(/id="([^"]+)"/g) || []);
  const a = ids(sticker("culo")), b = ids(sticker("culo"));
  assert.ok(a.length, "il culo ha un gradiente suo");
  assert.equal(a.filter((x) => b.includes(x)).length, 0, "id diversi a ogni disegno");
});

test("i quattro nuovi hanno la loro etichetta in italiano", () => {
  assert.equal(STICKERS.culo.label, "Che culo!");
  assert.equal(STICKERS.rage.label, "Parolacce");
  assert.equal(STICKERS.tongue.label, "Ciaone");
  assert.equal(STICKERS.sleep.label, "Muoviti");
  assert.ok(sticker("rage").includes("#@%!"), "le parolacce restano simboli");
});

test("uno sticker sconosciuto non rompe la riga: si ripiega su wow", () => {
  assert.equal(sticker("bestemmia").replace(/st\d+/g, "st"), sticker("wow").replace(/st\d+/g, "st"));
});
