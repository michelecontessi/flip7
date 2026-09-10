// ---------------------------------------------------------------------------
// Flip 7: With a Vengeance al tavolo online (beta). Regole dal regolamento
// ufficiale: mazzo da 108, The Zero / Unlucky 7 / Lucky 13, ÷2 e negativi,
// Flip Four, Just One More, Swap, Steal, Discard. Chi si ferma non e' al sicuro.
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import { createLobby, startGame, hit, stay, chooseTarget, pickCards, giveAction, nextRound, handPoints, normalizeGame, blockSeat, deckOf } from "../js/game.js";
import * as V from "../js/vengeance.js";

// tavolo di prova col mazzo Vengeance: si pesca dalla FINE dell'array (deck.pop()).
function table(names, deck, target = 200) {
  let s = createLobby(target, { id: "tV", mode: "vengeance" });
  names.forEach((n, i) => {
    const sid = "s" + i;
    s.seats[sid] = { uid: "u" + i, name: n, playerId: "p" + i, total: 0 };
    s.order.push(sid);
  });
  return startGame(s, () => 0, deck);
}
const cards = (s, sid) => s.hands[sid].cards;
const countAll = (s) => s.deck.length + s.discard.length + s.order.reduce((a, sid) => a + s.hands[sid].cards.length, 0)
  + (s.pending ? 1 : 0) + (s.flip3 ? s.flip3.deferred.length : 0) + (s.cont || []).reduce((a, seg) => a + seg.cards.length, 0);

test("il mazzo Vengeance ha 108 carte con la composizione del regolamento", () => {
  const d = V.fullDeck();
  assert.equal(d.length, 108);
  const n = (c) => d.filter((x) => x === c).length;
  assert.equal(n("n13"), 12); assert.equal(n("l13"), 1);   // tredici 13 in tutto
  assert.equal(n("n7"), 6); assert.equal(n("u7"), 1);      // sette 7 in tutto
  assert.equal(n("z0"), 1); assert.equal(n("n1"), 1); assert.equal(n("n12"), 12);
  assert.equal(d.filter((c) => c[0] === "n").length + 3, 92);
  for (const m of V.MODS) assert.equal(n(m), 1);
  for (const a of V.ACTIONS) assert.equal(n(a), 2);
  assert.equal(d.filter(V.VC.isAction).length, 10);
  // il tavolo Vengeance parte davvero con quel mazzo
  const s = createLobby(200, { mode: "vengeance" });
  assert.equal(s.mode, "vengeance");
  assert.equal(deckOf(s).length, 108);
  assert.equal(deckOf(createLobby(200)).length, 94);
});

test("il conto: somma, ÷2 per difetto, meno i negativi, mai sotto zero, +15 col Flip 7 (esempio del regolamento)", () => {
  const h = { ...V.emptyHand(), cards: ["n3", "n11", "n5", "n7", "n10", "n8", "n4", "d2", "m4"], out: "flip7" };
  const st = V.scoreSteps(h);
  assert.equal(st.sum, 48); assert.equal(st.afterDiv, 24); assert.equal(st.afterNeg, 20); assert.equal(st.total, 35);
  assert.equal(handPoints(h), 35);
  assert.equal(handPoints({ ...V.emptyHand(), cards: ["n3", "m10"] }), 0, "mai sotto zero");
  assert.equal(handPoints({ ...V.emptyHand(), cards: ["n9", "d2"] }), 4, "÷2 arrotonda per difetto");
  assert.equal(handPoints({ ...V.emptyHand(), cards: ["n12", "n11", "z0"] }), 0, "The Zero azzera");
  assert.equal(handPoints({ ...V.emptyHand(), cards: ["z0", "n1", "n2", "n3", "n4", "n5", "n6"], out: "flip7" }), 21 + 15, "col Flip 7 The Zero non azzera piu'");
  assert.equal(handPoints({ ...V.emptyHand(), cards: ["l13", "n13"] }), 26, "i due 13 valgono entrambi");
});

test("Unlucky 7: butta numeri e modificatori, resta solo il 7, non sballa nemmeno con un 7 in mano; il 7 dopo sballa", () => {
  // pescate (dal fondo): Ada n7, Bea n2, Ada m4 (unico? no: due non sballati -> scelta), ...
  let s = table(["Ada", "Bea"], ["n7", "u7", "n9", "n2", "n7"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");           // Ada 7, 9
  assert.deepEqual(cards(s, "s0"), ["n7", "n9"]);
  s = hit(s, "s1");                                               // Bea: Unlucky 7? no, e' di Ada: ordine dal fondo: n7 Ada, n2 Bea, n9 Ada, u7 Bea
  assert.deepEqual(cards(s, "s1"), ["u7"]);
  assert.ok(s.discard.includes("n2"), "il 2 di Bea e' andato negli scarti");
  assert.equal(s.hands.s1.out, null);
  assert.equal(s.lastMove.type, "unlucky");
  s = hit(s, "s0");                                               // Ada 7 doppio -> sballa
  assert.equal(s.hands.s0.out, "bust");
  // Bea con l'Unlucky 7 in mano pesca un altro 7: sballa
  let t = table(["Ada", "Bea"], ["n7", "u7", "n3"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = stay(t, "s0"); t = hit(t, "s1");
  assert.equal(t.hands.s1.out, "bust");
  assert.equal(t.hands.s1.bustCard, "n7");
});

test("Lucky 13: il secondo 13 passa, il terzo sballa; senza Lucky due 13 sballano", () => {
  let s = table(["Ada", "Bea"], ["n13", "n2", "n13", "n1", "l13"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");           // Ada l13, 13
  assert.deepEqual(cards(s, "s0"), ["l13", "n13"]);
  assert.equal(s.hands.s0.out, null);
  s = hit(s, "s1"); s = hit(s, "s0");                             // terzo 13
  assert.equal(s.hands.s0.out, "bust");
  let t = table(["Ada", "Bea"], ["n13", "n2", "n13"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s0");
  assert.equal(t.hands.s0.out, "bust");
});

test("The Zero: non ci si puo' fermare, si deve pescare", () => {
  let s = table(["Ada", "Bea"], ["n5", "n2", "z0"]);
  s = hit(s, "s0"); s = hit(s, "s1");
  assert.equal(stay(s, "s0"), s, "con The Zero il fermarsi non passa");
  s = hit(s, "s0");
  assert.deepEqual(cards(s, "s0"), ["z0", "n5"]);
});

test("modificatore pescato: si assegna a chi non ha sballato (anche a chi si e' fermato); da soli si tiene", () => {
  let s = table(["Ada", "Bea", "Caio"], ["n4", "m6", "n3", "n2", "n1"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");
  s = stay(s, "s0");                                   // Ada si ferma: NON e' al sicuro
  s = hit(s, "s1");                                    // Bea pesca il -6
  assert.equal(s.pending.type, "m6");
  assert.equal(s.pending.kind, "give");
  assert.deepEqual(s.pending.options, ["s0", "s1", "s2"], "Ada, ferma, e' un bersaglio valido");
  s = chooseTarget(s, "s1", "s0");
  assert.deepEqual(cards(s, "s0"), ["n1", "m6"]);
  assert.equal(handPoints(s.hands.s0), 0, "1 - 6 non va sotto zero");
  assert.deepEqual(s.hands.s0.marks, [{ type: "m6", by: "s1" }]);
  assert.equal(s.turn, "s2");
  // Caio sballa, Bea si ferma... Bea resta sola non sballata: il ÷2 se lo tiene
  let t = table(["Ada", "Bea"], ["d2", "n8", "n3", "n8"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s0");           // Ada 8, Bea 3, Ada 8 -> sballa
  assert.equal(t.hands.s0.out, "bust");
  t = hit(t, "s1");                                               // Bea pesca ÷2: e' l'unica -> lo tiene
  assert.equal(t.pending, null);
  assert.deepEqual(cards(t, "s1"), ["n3", "d2"]);
  assert.equal(handPoints(t.hands.s1), 1);
});

test("Flip Four: quattro carte una alla volta, azioni e modificatori si risolvono DOPO in ordine", () => {
  // Ada pesca Flip Four e lo da' a Bea; Bea pesca 5, -4, 6, Steal: alla fine prima il -4 (scelta), poi la Steal
  let s = table(["Ada", "Bea"], ["stl", "n6", "m4", "n5", "fl4", "n2", "n9"]);
  s = hit(s, "s0"); s = hit(s, "s1");                 // Ada 9, Bea 2
  s = hit(s, "s0");                                   // Ada: Flip Four
  assert.equal(s.pending.type, "fl4");
  s = chooseTarget(s, "s0", "s1");
  assert.equal(s.flip3.target, "s1"); assert.equal(s.flip3.left, 4);
  s = hit(s, "s1"); s = hit(s, "s1");                 // 5, -4 (accantonato)
  assert.deepEqual(s.flip3.deferred, ["m4"]);
  assert.equal(s.flip3.left, 2);
  s = hit(s, "s1"); s = hit(s, "s1");                 // 6, Steal (accantonata)
  assert.equal(s.flip3, null, "le quattro carte sono finite");
  assert.equal(s.pending.type, "m4", "prima si risolve il -4");
  assert.equal(s.pending.chooser, "s1");
  s = chooseTarget(s, "s1", "s0");                    // il -4 ad Ada
  assert.equal(s.pending.type, "stl", "poi tocca alla Steal");
  assert.equal(s.pending.kind, "use");
  s = pickCards(s, "s1", [{ sid: "s0", card: "n9" }]);
  assert.deepEqual(cards(s, "s1"), ["n2", "n5", "n6", "n9"]);
  assert.deepEqual(cards(s, "s0"), ["m4"]);
  assert.equal(s.pending, null);
  assert.equal(s.turn, "s1", "il turno di Ada e' finito col Flip Four: tocca a Bea");
});

test("Flip Four: chi sballa a meta' perde le carte accantonate; chi fa Flip 7 chiude il round", () => {
  let s = table(["Ada", "Bea"], ["n3", "n5", "m8", "n5", "fl4", "n1"]);
  s = hit(s, "s0"); s = hit(s, "s1");                  // Ada 1, Bea Flip Four
  s = chooseTarget(s, "s1", "s0");                     // ad Ada
  s = hit(s, "s0"); s = hit(s, "s0"); s = hit(s, "s0"); // 5, -8, 5 doppio -> sballa
  assert.equal(s.hands.s0.out, "bust");
  assert.equal(s.flip3, null);
  assert.ok(s.discard.includes("m8"), "il -8 accantonato e' perso");
  assert.equal(s.pending, null);
  let t = table(["Ada", "Bea"], ["n7", "m2", "n6", "fl4"]);
  t.hands.s0.cards = ["n1", "n2", "n3", "n4", "n5"]; t.hands.s0.dealt = true;
  t = hit(t, "s0");                                    // Ada pesca il Flip Four e lo tiene
  t = chooseTarget(t, "s0", "s0");
  t = hit(t, "s0"); t = hit(t, "s0"); t = hit(t, "s0"); // 6, -2 (accantonato), 7 -> settimo numero
  assert.equal(t.hands.s0.out, "flip7");
  assert.equal(t.status, "roundEnd");
  assert.ok(t.discard.includes("m2"));
});

test("Flip Four su chi si e' fermato: pesca lo stesso, resta fermo e le carte contano", () => {
  let s = table(["Ada", "Bea"], ["n8", "n6", "n4", "n2", "fl4", "n5", "n3", "n1"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0"); // Ada 1, Bea 3, Ada 5
  s = stay(s, "s1");                                   // Bea si ferma con il 3
  s = hit(s, "s0");                                    // Ada: Flip Four
  assert.deepEqual(s.pending.options, ["s0", "s1"]);
  s = chooseTarget(s, "s0", "s1");                     // su Bea, ferma
  assert.equal(s.flip3.target, "s1");
  s = hit(s, "s1"); s = hit(s, "s1"); s = hit(s, "s1"); s = hit(s, "s1");
  assert.equal(s.hands.s1.out, "stay", "resta ferma");
  assert.deepEqual(cards(s, "s1"), ["n3", "n2", "n4", "n6", "n8"]);
  assert.equal(s.turn, "s0", "tocca di nuovo ad Ada: Bea e' fuori dal giro");
});

test("Unlucky 7 dentro un Flip Four: butta quello pescato prima e continua con le carte che restano", () => {
  let s = table(["Ada", "Bea"], ["n9", "u7", "n5", "n4", "fl4", "n3"]);
  s = hit(s, "s0"); s = hit(s, "s1");                  // Ada 3, Bea Flip Four
  s = chooseTarget(s, "s1", "s0");
  s = hit(s, "s0"); s = hit(s, "s0");                  // 4, 5
  s = hit(s, "s0");                                    // Unlucky 7: via 3, 4, 5
  assert.deepEqual(cards(s, "s0"), ["u7"]);
  assert.equal(s.flip3.left, 1);
  s = hit(s, "s0");                                    // 9
  assert.deepEqual(cards(s, "s0"), ["u7", "n9"]);
  assert.equal(s.flip3, null);
});

test("Just One More: una carta e poi ci si ferma; se e' un'azione si risolve prima", () => {
  let s = table(["Ada", "Bea"], ["n6", "jom", "n2", "n1"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");   // Ada pesca Just One More
  assert.equal(s.pending.type, "jom");
  s = chooseTarget(s, "s0", "s1");
  assert.equal(s.flip3.jom, true); assert.equal(s.flip3.target, "s1");
  s = hit(s, "s1");                                       // Bea pesca il 6 e si ferma
  assert.deepEqual(cards(s, "s1"), ["n2", "n6"]);
  assert.equal(s.hands.s1.out, "stay");
  assert.equal(s.hands.s1.chose, false, "fermata d'ufficio, non di sua volonta'");
  assert.equal(s.turn, "s0");
  // con una Steal come ultima carta: prima la usa, poi si ferma
  let t = table(["Ada", "Bea"], ["stl", "jom", "n2", "n9"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s0");
  t = chooseTarget(t, "s0", "s1");
  t = hit(t, "s1");                                       // Steal
  assert.equal(t.pending.type, "stl");
  assert.equal(t.hands.s1.out, null, "non ancora ferma: deve usare la Steal");
  t = pickCards(t, "s1", [{ sid: "s0", card: "n9" }]);
  assert.deepEqual(cards(t, "s1"), ["n2", "n9"]);
  assert.equal(t.hands.s1.out, "stay");
  assert.equal(t.status, "playing", "Ada e' ancora in gioco");
  assert.equal(t.turn, "s0");
});

test("Just One More su chi ha The Zero: pesca l'ultima e si ferma comunque", () => {
  let s = table(["Ada", "Bea"], ["n4", "jom", "n2", "z0"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");
  s = chooseTarget(s, "s0", "s1");
  assert.equal(s.flip3.target, "s1");
  // Bea non aveva The Zero: proviamo su Ada, che ce l'ha
  let t = table(["Ada", "Bea"], ["n4", "jom", "n2", "z0"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s0");
  t = chooseTarget(t, "s0", "s0");
  t = hit(t, "s0");
  assert.deepEqual(cards(t, "s0"), ["z0", "n4"]);
  assert.equal(t.hands.s0.out, "stay");
  assert.equal(handPoints(t.hands.s0), 0);
});

test("Steal: si tocca la carta, che passa nella propria fila; un doppione fa sballare chi ruba", () => {
  let s = table(["Ada", "Bea", "Caio"], ["stl", "n5", "n12", "n9"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");   // 9, 12, 5
  s = hit(s, "s0");                                       // Ada: Steal
  assert.equal(s.pending.kind, "use");
  assert.equal(s.pending.canGive, true);
  assert.deepEqual(s.pending.options, ["s1", "s2"]);
  assert.deepEqual(V.pickable(s, "s0", "stl").map((p) => p.card), ["n12", "n5"]);
  assert.equal(pickCards(s, "s0", [{ sid: "s0", card: "n9" }]), s, "non si ruba a se stessi");
  s = pickCards(s, "s0", [{ sid: "s1", card: "n12" }]);
  assert.deepEqual(cards(s, "s0"), ["n9", "n12"]);
  assert.deepEqual(cards(s, "s1"), []);
  assert.deepEqual({ ...s.lastMove, at: 0 }, { type: "steal", by: "s0", at: 0, moves: [{ card: "n12", from: "s1", to: "s0" }] });
  assert.ok(s.lastMove.at > 0, "la mossa porta l'istante in cui e' avvenuta");
  assert.ok(s.discard.includes("stl"));
  assert.equal(s.turn, "s1");
  // rubare un doppione: sballa chi ruba (esempio delle FAQ)
  let t = table(["Ada", "Bea", "Caio"], ["stl", "n13", "n13"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s2");   // 13, 13, Steal
  t = giveAction(t, "s2", "s0");                          // Caio la passa ad Ada
  assert.equal(t.pending.chooser, "s0");
  assert.equal(t.pending.canGive, false, "passata una volta, non si passa piu'");
  assert.equal(giveAction(t, "s0", "s1"), t);
  t = pickCards(t, "s0", [{ sid: "s1", card: "n13" }]);   // l'unica carta rubabile: il 13 di Bea
  assert.equal(t.hands.s0.out, "bust");
  assert.equal(t.hands.s0.bustCard, "n13");
  assert.deepEqual(cards(t, "s1"), []);
});

test("Swap: due carte di due giocatori si scambiano; puo' far sballare entrambi (esempio delle FAQ)", () => {
  let s = table(["Ada", "Bea", "Caio"], ["swp", "n11", "n10", "n11", "n10", "n3"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");   // Ada 3, Bea 10, Caio 11
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");   // Ada 10, Bea 11, Caio Swap
  assert.equal(s.pending.type, "swp");
  assert.deepEqual(cards(s, "s0"), ["n3", "n10"]); assert.deepEqual(cards(s, "s1"), ["n10", "n11"]);
  assert.equal(pickCards(s, "s2", [{ sid: "s0", card: "n3" }, { sid: "s0", card: "n10" }]), s, "due carte dello stesso giocatore no");
  s = pickCards(s, "s2", [{ sid: "s0", card: "n3" }, { sid: "s1", card: "n11" }]);
  assert.deepEqual(cards(s, "s0"), ["n10", "n11"]);
  assert.deepEqual(cards(s, "s1"), ["n10", "n3"]);
  assert.equal(s.lastMove.type, "swap");
  // ora il 10 di Ada per l'11 di Bea? entrambe hanno 10 e 11: Ada da' il 10, riceve l'11 -> doppio 11; Bea riceve il 10 -> doppio 10
  let t = table(["Ada", "Bea", "Caio"], ["swp", "n2"]);
  t.hands.s0.cards = ["n10", "n11"]; t.hands.s1.cards = ["n10", "n11"];
  t.hands.s0.dealt = t.hands.s1.dealt = true;
  t.turn = "s2";
  t = hit(t, "s2");                                       // Caio 2? no: pop -> n2 e' l'ultimo: Caio pesca 2
  t = stay(t, "s0"); t = stay(t, "s1");
  t = hit(t, "s2");                                       // Swap
  t = pickCards(t, "s2", [{ sid: "s0", card: "n10" }, { sid: "s1", card: "n11" }]);
  assert.equal(t.hands.s0.out, "bust"); assert.equal(t.hands.s1.out, "bust");
  assert.equal(t.status, "playing", "Caio e' ancora in gioco");
  assert.equal(t.turn, "s2");
  t = stay(t, "s2");
  assert.equal(t.status, "roundEnd");
  assert.equal(t.seats.s0.total, 0); assert.equal(t.seats.s1.total, 0); assert.equal(t.seats.s2.total, 2);
});

test("Discard: si fa scartare una carta a chiunque, anche il proprio ÷2", () => {
  let s = table(["Ada", "Bea"], ["dsc", "n4", "n9"]);
  s.hands.s0.cards = ["n9", "d2"]; s.hands.s0.dealt = true;
  s = hit(s, "s1");                                       // Bea 4? tocca ad Ada prima: turn = s0
  assert.equal(s.turn, "s0");
  s = hit(s, "s0");                                       // Ada pesca 9?? il fondo e' n9: doppio 9 -> sballa. Rifacciamo.
  let t = table(["Ada", "Bea"], ["dsc", "n4", "n3"]);
  t.hands.s0.cards = ["n9", "d2"]; t.hands.s0.dealt = true;
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s0");   // 3, 4, Discard
  assert.equal(t.pending.type, "dsc");
  t = pickCards(t, "s0", [{ sid: "s0", card: "d2" }]);
  assert.deepEqual(cards(t, "s0"), ["n9", "n3"]);
  assert.deepEqual({ ...t.lastMove, at: 0 }, { type: "discard", by: "s0", at: 0, moves: [{ card: "d2", from: "s0", to: null }] });
  assert.ok(t.discard.includes("d2") && t.discard.includes("dsc"));
});

test("Steal, Swap o Discard senza carte da colpire si scartano da sole", () => {
  let s = table(["Ada", "Bea"], ["n5", "stl"]);
  s = hit(s, "s0");                                       // prima carta del round: Steal, nessuno ha carte
  assert.equal(s.pending, null);
  assert.ok(s.discard.includes("stl"));
  assert.equal(s.hands.s0.dealt, true);
  assert.equal(s.turn, "s1");
  let t = table(["Ada", "Bea"], ["n5", "swp"]);
  t = hit(t, "s0");                                       // Swap con una sola fila piena? Nessuna: scartata
  assert.equal(t.pending, null);
  let u = table(["Ada", "Bea"], ["swp", "n5"]);
  u = hit(u, "s0"); u = hit(u, "s1");                     // Bea pesca lo Swap con una fila sola (Ada): scartato
  assert.equal(u.pending, null);
  assert.ok(u.discard.includes("swp"));
});

test("carte speciali rubate o scambiate fanno effetto a chi le riceve", () => {
  // Ada ruba l'Unlucky 7 a Bea: Ada butta tutto
  let s = table(["Ada", "Bea"], ["stl", "u7", "n9"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");
  s = pickCards(s, "s0", [{ sid: "s1", card: "u7" }]);
  assert.deepEqual(cards(s, "s0"), ["u7"]);
  assert.deepEqual(cards(s, "s1"), []);
  assert.deepEqual(s.lastMove.wipe, { seat: "s0", cards: ["n9"] });
  // The Zero scambiato: chi lo riceve non puo' fermarsi
  let t = table(["Ada", "Bea"], ["swp", "z0", "n9"]);
  t = hit(t, "s0"); t = hit(t, "s1"); t = hit(t, "s0");
  t = pickCards(t, "s0", [{ sid: "s0", card: "n9" }, { sid: "s1", card: "z0" }]);
  assert.deepEqual(cards(t, "s0"), ["z0"]);
  assert.deepEqual(cards(t, "s1"), ["n9"]);
  assert.equal(t.turn, "s1");
  t = stay(t, "s1");
  assert.equal(t.turn, "s0");
  assert.equal(stay(t, "s0"), t, "Ada ha The Zero: deve pescare");
});

test("il settimo numero ricevuto con una Steal e' un Flip 7", () => {
  let s = table(["Ada", "Bea"], ["stl", "n12"]);
  s.hands.s0.cards = ["n1", "n2", "n3", "n4", "n5", "n6"]; s.hands.s0.dealt = true;
  s = hit(s, "s0"); s = hit(s, "s1");                     // Ada 12? no: pop n12 ad Ada -> settimo numero -> Flip 7 subito
  assert.equal(s.hands.s0.out, "flip7");
  let t = table(["Ada", "Bea"], ["n12", "stl"]);
  t.hands.s0.cards = ["n1", "n2", "n3", "n4", "n5", "n6"]; t.hands.s0.dealt = true;
  t = hit(t, "s0");                                       // Steal
  assert.equal(t.pending, null, "Bea non ha carte: scartata");
  let u = table(["Ada", "Bea"], ["stl", "n12"]);
  u.hands.s0.cards = ["n1", "n2", "n3", "n4", "n5", "n6"]; u.hands.s0.dealt = true;
  u.hands.s1.cards = ["n12"]; u.hands.s1.dealt = true;
  u.deck = ["stl"];
  u = hit(u, "s0");
  u = pickCards(u, "s0", [{ sid: "s1", card: "n12" }]);
  assert.equal(u.hands.s0.out, "flip7");
  assert.equal(u.status, "roundEnd");
  assert.equal(u.seats.s0.total, 21 + 12 + 15);
});

test("chi si ferma non e' al sicuro, ma a fine round incassa; il round dopo riparte pulito", () => {
  let s = table(["Ada", "Bea"], ["m10", "n4", "n9"]);
  s = hit(s, "s0"); s = hit(s, "s1");                     // Ada 9, Bea 4
  s = stay(s, "s0");
  s = hit(s, "s1");                                       // Bea pesca il -10 e lo da' ad Ada, ferma
  s = chooseTarget(s, "s1", "s0");
  assert.equal(handPoints(s.hands.s0), 0);
  s = stay(s, "s1");
  assert.equal(s.status, "roundEnd");
  assert.equal(s.seats.s0.total, 0);
  assert.equal(s.seats.s1.total, 4);
  assert.ok(s.rounds[0].s0.vengeance);
  s = nextRound(s);
  assert.deepEqual(cards(s, "s0"), []);
  assert.equal(s.hands.s0.dealt, false);
  assert.equal(s.turn, "s1");
});

test("nessuna carta sparisce: mazzo + scarti + mani + sospese = totale", () => {
  const deck = ["n4", "m2", "stl", "n8", "fl4", "n6", "n5", "swp", "n3", "n2", "n1"];
  let s = table(["Ada", "Bea", "Caio"], deck);
  const check = () => assert.equal(countAll(s), deck.length);
  for (let i = 0; i < 40 && s.status === "playing"; i++) {
    check();
    const actor = s.pending ? s.pending.chooser : s.flip3 ? s.flip3.target : s.turn;
    if (s.pending && s.pending.kind === "give") s = chooseTarget(s, actor, s.pending.options[0]);
    else if (s.pending) s = pickCards(s, actor, V.botPick(s, actor, s.pending.type));
    else s = hit(s, actor);
  }
  assert.equal(s.deck.length + s.discard.length, deck.length, "a round chiuso tutto e' negli scarti o nel mazzo");
});

test("bloccare chi doveva usare una Steal: la carta va negli scarti e si va avanti", () => {
  let s = table(["Ada", "Bea"], ["stl", "n5", "n9"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");
  assert.equal(s.pending.type, "stl");
  s = blockSeat(s, "s0");
  assert.equal(s.pending, null);
  assert.ok(s.discard.includes("stl"));
  assert.equal(s.turn, "s1");
  assert.equal(s.status, "playing");
});

test("i bot scelgono mosse valide e sensate", () => {
  let s = table(["Ada", "Bot"], ["stl", "n5", "n12", "n9"]);
  s.hands.s0.cards = ["n12", "m6"]; s.hands.s1.cards = ["n9"]; s.hands.s0.dealt = s.hands.s1.dealt = true;
  s.deck = ["stl"]; s.turn = "s1";
  s = hit(s, "s1");
  const pick = V.botPick(s, "s1", "stl");
  assert.deepEqual(pick, [{ sid: "s0", card: "n12" }], "ruba il 12, non il -6");
  assert.ok(V.validPicks(s, "s1", "stl", pick));
  // con lo Swap da' via il proprio -6 e si prende il 12
  let t = table(["Bot", "Ada"], ["swp"]);
  t.hands.s0.cards = ["n3", "m6"]; t.hands.s1.cards = ["n12", "n5"]; t.hands.s0.dealt = t.hands.s1.dealt = true;
  t.deck = ["swp"];
  t = hit(t, "s0");
  const sw = V.botPick(t, "s0", "swp");
  assert.ok(V.validPicks(t, "s0", "swp", sw));
  assert.ok(sw.some((p) => p.card === "m6") && sw.some((p) => p.card === "n12"));
  // il Flip Four va a chi ha piu' numeri in mano
  assert.equal(V.botTarget(t, "s0", "fl4", ["s0", "s1"]), "s1");
});

test("normalizeGame ripara le mani e le code di Vengeance lette da Firebase", () => {
  const g = normalizeGame({ mode: "vengeance", status: "playing", order: ["a"], seats: { a: { name: "X" } },
    hands: { a: { cards: { 0: "n3", 1: "d2" }, marks: { 0: { type: "d2", by: "b" } } } },
    cont: { 0: { target: "a", cards: { 0: "stl" } } }, lastMove: { type: "steal", moves: { 0: { card: "n3", from: "b", to: "a" } } } });
  assert.deepEqual(g.hands.a.cards, ["n3", "d2"]);
  assert.deepEqual(g.hands.a.marks, [{ type: "d2", by: "b" }]);
  assert.deepEqual(g.cont, [{ target: "a", cards: ["stl"] }]);
  assert.deepEqual(g.lastMove.moves, [{ card: "n3", from: "b", to: "a" }]);
  assert.equal(handPoints(g.hands.a), 1);
  const base = normalizeGame({ status: "playing", order: ["a"], seats: { a: {} }, hands: { a: {} } });
  assert.equal(base.mode, "classic");
  assert.deepEqual(base.hands.a.nums, []);
});
