import test from "node:test";
import assert from "node:assert/strict";
import * as store from "../js/store.js";

const OWNER = "owner-uid";

test("una stanza nuova nasce con nome, obiettivo e i partecipanti indicati", () => {
  const { name, updates, userRooms } = store.seedRoom({ name: "  Amici del giovedì ", players: ["Marco", "Luca", "marco", ""], targetScore: 150 }, OWNER);
  assert.equal(name, "Amici del giovedì");
  assert.equal(updates["meta/name"], "Amici del giovedì");
  assert.equal(updates["meta/targetScore"], 150);
  const players = Object.entries(updates).filter(([k]) => k.startsWith("players/")).map(([, p]) => p.name);
  assert.deepEqual(players, ["Marco", "Luca"]);   // il doppione (maiuscole a parte) e il vuoto non entrano
  assert.deepEqual(userRooms, {});
});

test("chi e' gia' noto entra nella stanza nuova con membro, giocatore e collegamento", () => {
  const invites = [
    { uid: "u-anna", name: "Anna Ricci", email: "anna@example.com", playerName: "Anna", avatar: { sym: "fox", bg: "#ff8800" } },
    { uid: OWNER, name: "Io", email: "me@example.com" },      // il proprietario non si invita da solo
    { uid: "u-bea", name: "Bea" }
  ];
  const { updates, userRooms } = store.seedRoom({ name: "Amici", players: ["Anna", "Carlo"], invites }, OWNER);

  assert.ok(updates["members/u-anna"]);
  assert.equal(updates["members/u-anna"].email, "anna@example.com");
  assert.equal(updates["members/u-anna"].invited, true);
  assert.equal(updates["members/" + OWNER], undefined);

  const annaPid = updates["bindings/u-anna"];
  assert.ok(annaPid, "Anna e' collegata al suo giocatore");
  assert.equal(updates[`players/${annaPid}`].name, "Anna");
  assert.deepEqual(updates[`players/${annaPid}`].avatar, { sym: "fox", bg: "#ff8800" });

  const beaPid = updates["bindings/u-bea"];
  assert.equal(updates[`players/${beaPid}`].name, "Bea");   // senza playerName vale il nome dell'account

  // "Anna" scritta anche a mano non raddoppia: vince quella con l'account
  const names = Object.entries(updates).filter(([k]) => k.startsWith("players/")).map(([, p]) => p.name).sort();
  assert.deepEqual(names, ["Anna", "Bea", "Carlo"]);

  // e la stanza va nell'elenco degli invitati, non del proprietario
  assert.deepEqual(Object.keys(userRooms).sort(), ["u-anna", "u-bea"]);
  assert.equal(userRooms["u-anna"].name, "Amici");
});

test("l'invito nella stanza corrente riusa il giocatore libero con lo stesso nome", async () => {
  const marco = await store.addPlayer("Marco");
  const pid = await store.inviteMember({ uid: "u-marco", name: "Marco Bianchi", email: "marco@example.com", playerName: "marco" });
  assert.equal(pid, marco);
  const room = store.getRoom();
  assert.equal(room.bindings["u-marco"], marco);
  assert.equal(room.members["u-marco"].email, "marco@example.com");

  // stesso nome ma il giocatore e' gia' di qualcun altro: ne nasce uno nuovo
  const pid2 = await store.inviteMember({ uid: "u-marco2", name: "Marco Rossi", playerName: "Marco" });
  assert.notEqual(pid2, marco);
  assert.equal(room.players[pid2].name, "Marco");
  assert.equal(room.bindings["u-marco2"], pid2);

  await assert.rejects(() => store.inviteMember({ uid: "u-marco", name: "Marco Bianchi" }), /già dentro/);
});
