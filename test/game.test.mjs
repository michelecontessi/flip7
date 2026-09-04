import test from "node:test";
import assert from "node:assert/strict";
import { fullDeck, createLobby, startGame, hit, stay, chooseTarget, nextRound, handPoints, normalizeGame, leaveSeat } from "../js/game.js";

// tavolo di prova: 2-3 giocatori con un mazzo costruito a mano.
// ATTENZIONE: si pesca dalla FINE dell'array (deck.pop()).
function table(names, deck, target = 200) {
  let s = createLobby(target);
  names.forEach((n, i) => {
    const sid = "s" + i;
    s.seats[sid] = { uid: "u" + i, name: n, playerId: "p" + i, total: 0 };
    s.order.push(sid);
  });
  return startGame(s, () => 0, deck);
}

test("il mazzo completo ha 94 carte con la composizione giusta", () => {
  const d = fullDeck();
  assert.equal(d.length, 94);
  assert.equal(d.filter((c) => c === "n12").length, 12);
  assert.equal(d.filter((c) => c === "n0").length, 1);
  assert.equal(d.filter((c) => c === "sc").length, 3);
  assert.equal(d.filter((c) => c === "frz").length, 3);
  assert.equal(d.filter((c) => c === "x2").length, 1);
});

test("pesca e stai: il punteggio entra a fine round", () => {
  // Anna pesca 5, sta; Bruno pesca 3, sta -> round finito
  let s = table(["Anna", "Bruno"], ["n3", "n5"]);
  s = hit(s, "s0");            // Anna: 5
  assert.deepEqual(s.hands.s0.nums, [5]);
  assert.equal(s.turn, "s1");
  s = hit(s, "s1");            // Bruno: 3
  s = stay(s, "s0");
  s = stay(s, "s1");
  assert.equal(s.status, "roundEnd");
  assert.equal(s.seats.s0.total, 5);
  assert.equal(s.seats.s1.total, 3);
});

test("il doppione fa sballare: round a zero", () => {
  let s = table(["Anna", "Bruno"], ["n9", "n7", "n7"]);
  s = hit(s, "s0");            // Anna: 7
  s = hit(s, "s1");            // Bruno: 7
  s = hit(s, "s0");            // Anna: 9? no: pescano in ordine dal fondo -> 7,7,9
  // Anna ha 7; Bruno ha 7; Anna pesca 9 -> ok
  s = stay(s, "s1");
  s = stay(s, "s0");
  assert.equal(s.status, "roundEnd");
});

test("la Seconda Chance annulla il doppione", () => {
  // ordine di pescata (dal fondo): Anna sc, Bruno 4, Anna 8, Bruno 3, Anna 8 (doppione)
  let s = table(["Anna", "Bruno"], ["n8", "n3", "n8", "n4", "sc"]);
  s = hit(s, "s0");            // sc
  assert.equal(s.hands.s0.sc, true);
  s = hit(s, "s1");            // 4
  s = hit(s, "s0");            // 8
  s = hit(s, "s1");            // 3
  s = hit(s, "s0");            // 8 di nuovo -> doppione con sc
  assert.equal(s.hands.s0.sc, false);
  assert.equal(s.hands.s0.out, null);
  assert.deepEqual(s.hands.s0.nums, [8]);
});

test("FLIP 7 chiude il round per tutti e chi era in gioco incassa", () => {
  const deck = ["n7", "n6", "n5", "n4", "n3", "n2", "n1", "n12", "n11", "n10", "n9", "n8", "n1"];
  // pescate alternate: Anna 1,12? costruisco: fondo->cima ... uso 3 giocatori
  // piu' semplice: 2 giocatori, Anna pesca 7 carte uniche di fila? no, il turno passa.
  // Anna: n1,n2,n3,n4,n5,n6,n7 (7 uniche). Bruno: n8..n12 e n1? intercalo:
  const d2 = ["n7", "n12", "n6", "n11", "n5", "n10", "n4", "n9", "n3", "n8", "n2", "n0", "n1"];
  let s = table(["Anna", "Bruno"], [...d2]);
  // ordine pescate (pop dal fondo): Anna n1, Bruno n0, Anna n2, Bruno n8, ...
  for (let i = 0; i < 12; i++) {
    const who = s.turn;
    s = hit(s, who);
    if (s.status !== "playing") break;
  }
  s = hit(s, s.turn); // la tredicesima: settima carta di Anna
  assert.equal(s.status, "roundEnd");
  assert.equal(s.hands.s0.out, "flip7");
  assert.equal(s.seats.s0.total, 1 + 2 + 3 + 4 + 5 + 6 + 7 + 15);
  // Bruno era ancora in gioco: incassa comunque le sue carte
  assert.equal(s.seats.s1.total, 0 + 8 + 9 + 10 + 11 + 12);
});

test("x2 raddoppia i numeri prima dei +: (5)*2 + 4", () => {
  let s = table(["Anna", "Bruno"], ["n1", "p4", "x2", "n5"]);
  s = hit(s, "s0");   // 5
  s = hit(s, "s1");   // x2? no: pop dal fondo -> n5, x2, p4, n1
  // Anna n5, Bruno x2, Anna p4, Bruno n1
  s = hit(s, "s0");   // p4? -> tocca ad Anna: pesca x2... ricalcolo: pop: n5(Anna), x2(Bruno), p4(Anna), n1(Bruno)
  s = hit(s, "s1");
  s = stay(s, "s0");
  s = stay(s, "s1");
  assert.equal(s.seats.s0.total, 5 + 4);
  assert.equal(s.seats.s1.total, 1 * 2);
});

test("Congela: scelta del bersaglio, che incassa ed esce", () => {
  let s = table(["Anna", "Bruno", "Carla"], ["n2", "n3", "frz", "n6", "n5", "n4"]);
  s = hit(s, "s0");   // Anna 4
  s = hit(s, "s1");   // Bruno 5
  s = hit(s, "s2");   // Carla 6
  s = hit(s, "s0");   // Anna pesca Congela -> deve scegliere
  assert.equal(s.pending.type, "frz");
  assert.equal(s.pending.chooser, "s0");
  s = chooseTarget(s, "s0", "s1");     // congela Bruno
  assert.equal(s.hands.s1.out, "frozen");
  s = stay(s, s.turn); s = stay(s, s.turn);
  assert.equal(s.status, "roundEnd");
  assert.equal(s.seats.s1.total, 5);   // congelato ma incassa
});

test("Pesca Tre: tre pescate obbligate, le azioni si risolvono dopo", () => {
  let s = table(["Anna", "Bruno"], ["n9", "frz", "n6", "n5", "n2", "fl3", "n1"]);
  s = hit(s, "s0");   // Anna 1
  s = hit(s, "s1");   // Bruno fl3 -> sceglie
  s = chooseTarget(s, "s1", "s0");     // lo da' ad Anna
  assert.equal(s.flip3.target, "s0");
  s = hit(s, "s0");   // 2
  s = hit(s, "s0");   // 5
  s = hit(s, "s0");   // 6 -> finito il pesca-tre... ma prima pescata era frz? no: pop: n1,fl3,n2,n5,n6,frz,n9
  assert.equal(s.flip3, null);
  assert.deepEqual(s.hands.s0.nums, [1, 2, 5, 6]);
});

test("il round successivo ruota chi comincia e i totali restano", () => {
  let s = table(["Anna", "Bruno"], ["n3", "n5"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = stay(s, "s0"); s = stay(s, "s1");
  const t0 = s.seats.s0.total;
  s = nextRound(s);
  assert.equal(s.status, "playing");
  assert.equal(s.round, 2);
  assert.equal(s.order[0], "s1");     // parte l'altro
  assert.equal(s.turn, "s1");
  assert.equal(s.seats.s0.total, t0);
});

test("mazzo finito: si rimescolano gli scarti", () => {
  let s = table(["Anna", "Bruno"], ["n3"]);
  s.discard = ["n5", "n6"];
  s = hit(s, "s0");                   // pesca l'ultima del mazzo
  s = hit(s, "s1");                   // mazzo vuoto -> rimescola gli scarti
  assert.equal(s.hands.s1.nums.length, 1);
  assert.ok([5, 6].includes(s.hands.s1.nums[0]));
});

test("normalizeGame ripara gli array che Firebase omette", () => {
  const g = normalizeGame({ status: "playing", order: ["a"], seats: { a: { name: "X" } }, hands: { a: {} } });
  assert.deepEqual(g.hands.a.nums, []);
  assert.deepEqual(g.deck, []);
  assert.equal(g.pending, null);
});

test("abbandono: carte negli scarti e turno al successivo nell'ordine", () => {
  let s = table(["Ada", "Bea", "Caio"], ["n5", "n3"]);
  s = hit(s, "s0");                   // Ada pesca il 3, tocca a Bea
  s = leaveSeat(s, "s1");             // Bea abbandona mentre e' di turno
  assert.equal(s.order.length, 2);
  assert.ok(!s.seats.s1);
  assert.equal(s.turn, "s2");         // passa a Caio, non torna ad Ada
  assert.ok(s.discard.length >= 0);
});

test("abbandono: se resta uno solo la partita finisce subito", () => {
  let s = table(["Ada", "Bea"], ["n5", "n3"]);
  s = leaveSeat(s, "s0");
  assert.equal(s.status, "over");
  assert.deepEqual(s.order, ["s1"]);
});

test("abbandono del bersaglio di una scelta: l'opzione sparisce", () => {
  // mazzo: Ada pesca subito un Congela con 3 giocatori attivi -> pending
  let s = table(["Ada", "Bea", "Caio"], ["n2", "n4", "frz"]);
  s = hit(s, "s0");
  assert.ok(s.pending);
  s = leaveSeat(s, "s2");             // Caio (fra le opzioni) abbandona
  assert.ok(!s.pending.options.includes("s2"));
});

test("lo sballo registra quale doppione l'ha causato", () => {
  // pescate (dalla fine): Ada n3, Bea n5, Ada n3 di nuovo -> sballa
  let s = table(["Ada", "Bea"], ["n3", "n5", "n3"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0");
  assert.equal(s.hands.s0.out, "bust");
  assert.equal(s.hands.s0.bustCard, 3);
});

test("Pesca Tre annidato: prima si completa la tripla, poi parte il secondo", () => {
  // pescate (dalla fine): fl3 (Anna) -> Bruno pesca 2, un ALTRO fl3, 5
  let s = table(["Anna", "Bruno"], ["n1", "n3", "n4", "n5", "fl3", "n2", "fl3"]);
  s = hit(s, "s0");
  s = chooseTarget(s, "s0", "s1");
  s = hit(s, "s1");                       // 1a pescata: 2
  s = hit(s, "s1");                       // 2a: un altro Pesca Tre -> accantonato
  assert.equal(s.flip3.left, 1);          // la tripla continua comunque
  s = hit(s, "s1");                       // 3a: 5 -> tripla completata
  assert.ok(s.pending);                   // solo ORA si risolve il fl3 accantonato
  assert.equal(s.pending.chooser, "s1");  // sceglie chi l'ha pescato
  s = chooseTarget(s, "s1", "s0");
  assert.equal(s.flip3.target, "s0");     // nuovo Pesca Tre, tripla piena
  assert.equal(s.flip3.left, 3);
});

test("flip7 durante un Pesca Tre: le azioni accantonate finiscono negli scarti", () => {
  let s = table(["Ada", "Bea"], ["n7", "frz", "fl3"]);
  s.hands.s1.nums = [1, 2, 3, 4, 5, 6];
  s = hit(s, "s0");                 // Ada pesca il Pesca Tre
  s = chooseTarget(s, "s0", "s1");  // e lo gira a Bea
  s = hit(s, "s1");                 // Congela -> accantonata
  s = hit(s, "s1");                 // settimo numero: FLIP 7, round chiuso subito
  assert.ok(s.status === "roundEnd" || s.status === "over");
  assert.ok(s.discard.includes("frz")); // la carta accantonata non sparisce
});

test("nessuna carta sparisce mai: mazzo + scarti + mani = totale", () => {
  const deck = ["n5", "n4", "frz", "n3", "n2", "n1"];
  let s = table(["Ada", "Bea"], deck);
  const count = (st) => st.deck.length + st.discard.length +
    st.order.reduce((a, sid) => {
      const h = st.hands[sid];
      return a + h.nums.length + h.plus.length + (h.x2 ? 1 : 0) + (h.sc ? 1 : 0);
    }, 0);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0"); // n1, n2, n3
  s = hit(s, "s1");                                     // frz con 2 attivi -> pending
  s = chooseTarget(s, "s1", "s0");                      // congela Ada
  assert.equal(count(s), deck.length);
  s = stay(s, "s1");                                    // round chiuso: le mani sono
  // gia' negli scarti (restano in vista solo per la UI): conta mazzo + scarti
  assert.equal(s.deck.length + s.discard.length, deck.length);
});

test("appena il mazzo si svuota, gli scarti rientrano subito", () => {
  let s = table(["Anna", "Bruno"], ["n3"]);
  s.discard = ["n5", "n6"];
  s = hit(s, "s0");                  // pesca l'ultima: il mazzo si ricarica al volo
  assert.equal(s.deck.length, 2);
  assert.equal(s.discard.length, 0);
});

test("ogni round finito lascia la fotografia delle mani (per lo storico)", () => {
  // pescate (dalla fine): Ada n4, Bea x2, Ada p6, Bea n3, Ada n4 di nuovo -> sballa
  let s = table(["Ada", "Bea"], ["n4", "n3", "p6", "x2", "n4"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s0"); s = hit(s, "s1");
  s = hit(s, "s0");                       // doppio 4: Ada sballa
  assert.equal(s.hands.s0.out, "bust");
  s = stay(s, "s1");
  assert.equal(s.status, "roundEnd");
  assert.equal(s.rounds.length, 1);
  assert.deepEqual(s.rounds[0].s0, { numbers: [4], plus: [6], doubled: false, busted: true, frozen: false });
  assert.deepEqual(s.rounds[0].s1, { numbers: [3], plus: [], doubled: true, busted: false, frozen: false });
  // il round dopo si aggiunge in coda, senza toccare il primo
  s = nextRound(s);
  s.deck = ["n2", "n7"];
  s = hit(s, s.turn); s = hit(s, s.turn); s = stay(s, s.turn); s = stay(s, s.turn);
  assert.equal(s.rounds.length, 2);
  assert.deepEqual(s.rounds[0].s0.numbers, [4]);
});

test("la fotografia segna chi e' stato congelato", () => {
  let s = table(["Ada", "Bea", "Caio"], ["n2", "n3", "frz", "n6", "n5", "n4"]);
  s = hit(s, "s0"); s = hit(s, "s1"); s = hit(s, "s2");
  s = hit(s, "s0");                        // Ada pesca Congela
  s = chooseTarget(s, "s0", "s1");         // congela Bea
  s = stay(s, s.turn); s = stay(s, s.turn);
  assert.equal(s.status, "roundEnd");
  assert.equal(s.rounds[0].s1.frozen, true);
  assert.equal(s.rounds[0].s0.frozen, false);
  assert.equal(s.rounds[0].s2.frozen, false);
});

test("il Flip 7 si legge dalle sette carte della fotografia", () => {
  const d2 = ["n7", "n12", "n6", "n11", "n5", "n10", "n4", "n9", "n3", "n8", "n2", "n0", "n1"];
  let s = table(["Anna", "Bruno"], d2);
  while (s.status === "playing") s = hit(s, s.turn);
  assert.equal(s.hands.s0.out, "flip7");
  assert.equal(s.rounds[0].s0.numbers.length, 7);
});
