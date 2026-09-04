// ---------------------------------------------------------------------------
// Store: stato condiviso della stanza + due backend intercambiabili.
//   - "firebase": Realtime Database, sincronia live fra tutti i dispositivi
//   - "local":    localStorage, usato se Firebase non e' configurato o non parte
// Le view non sanno quale backend sia attivo: usano solo le funzioni qui sotto.
// ---------------------------------------------------------------------------
import { firebaseConfig, FIREBASE_SDK_VERSION, isFirebaseConfigured, DEFAULTS } from "./config.js";
import { prefs, deviceId } from "./prefs.js";
import { roundKey, playerTotal, liveStandings, winnersOf, orderedPlayerIds } from "./stats.js";
import { computeRound } from "./scoring.js";

const listeners = new Set();

let roomId = DEFAULTS.roomId;
let room = emptyRoom();
// `rooms`: le stanze che questo account conosce (da users/<uid>/rooms, su Firebase);
// `peek`: per il proprietario, uno sguardo alle ALTRE sue stanze (nome, richieste
// in attesa, membri) senza doverci entrare.
let status = { mode: "local", ready: false, online: false, uid: deviceId(), access: "ok", error: null, rooms: {}, peek: {} };
let fb = null; // { db, ref, update, onValue, roomRef }

export function emptyRoom() {
  return {
    meta: { name: DEFAULTS.roomName, targetScore: DEFAULTS.targetScore, createdAt: Date.now() },
    control: null,
    players: {},
    live: null,
    history: {},
    members: {},
    requests: {},
    bindings: {},
    game: {}
  };
}

// `game` non e' piu' un tavolo solo: e' la MAPPA dei tavoli aperti
// (id -> stato). Sta sotto la stessa chiave di prima, cosi' le regole del
// database restano quelle. Un tavolo del formato vecchio (stato scritto
// direttamente li' sotto) diventa il primo della mappa.
const LEGACY_TABLE = "t0";
export function normalizeTables(v) {
  if (!v || typeof v !== "object") return {};
  if (typeof v.status === "string") return { [LEGACY_TABLE]: { ...v, id: LEGACY_TABLE } };
  const out = {};
  for (const [id, t] of Object.entries(v)) if (t && typeof t === "object") out[id] = { ...t, id };
  return out;
}

function normalize(v) {
  const base = emptyRoom();
  if (!v || typeof v !== "object") return base;
  return {
    meta: { ...base.meta, ...(v.meta || {}) },
    control: v.control || null,
    players: v.players || {},
    live: v.live || null,
    history: v.history || {},
    members: v.members || {},
    requests: v.requests || {},
    bindings: v.bindings || {},
    game: normalizeTables(v.game)
  };
}

// --- pub/sub ----------------------------------------------------------------
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of [...listeners]) fn(); }
/** Ridisegno su richiesta, per chi non passa da un cambio di stato
    (es. fine delle animazioni del tavolo). */
export const refresh = notify;

export const getRoom = () => room;
export const getStatus = () => status;
export const getRoomId = () => roomId;
export const newId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);

// --- helper per path relativi ("live/scores/x/r0") --------------------------
function setAt(obj, path, value) {
  const parts = path.split("/").filter(Boolean);
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  const last = parts[parts.length - 1];
  if (value === null) delete node[last];
  else node[last] = value;
}

const lsKey = () => `flip7:room:${roomId}`;
function localSave() {
  try { localStorage.setItem(lsKey(), JSON.stringify(room)); } catch { /* quota / private */ }
}
function localLoad() {
  try { return normalize(JSON.parse(localStorage.getItem(lsKey()))); } catch { return emptyRoom(); }
}
function localExists() {
  try { return localStorage.getItem(lsKey()) !== null; } catch { return false; }
}

/** Applica un update multi-path (stessa semantica di firebase update()). */
async function commit(updates) {
  if (!Object.keys(updates).length) return;
  if (status.mode === "firebase" && fb) {
    try {
      await fb.update(fb.roomRef, updates);
      return;
    } catch (err) {
      status.error = "Scrittura rifiutata: " + err.message;
      notify();
      throw err;
    }
  }
  for (const [path, value] of Object.entries(updates)) setAt(room, path, value);
  localSave();
  notify();
}

// --- init -------------------------------------------------------------------
export async function init(id) {
  const chosen = id || prefs.get("roomId") || DEFAULTS.roomId;
  if (!chosen) {
    // primo avvio: nessuna stanza ancora creata ne' ricevuta
    status = { ...status, mode: "none", ready: true };
    notify();
    return;
  }
  roomId = String(chosen).trim().toLowerCase();
  prefs.set("roomId", roomId);

  // ?local=1 forza la modalita' locale: utile per rileggere i dati salvati su
  // QUESTO dispositivo prima del collegamento a Firebase (e per recuperarli
  // con Setup -> Esporta, da reimportare poi nella stanza online).
  const forceLocal = typeof location !== "undefined" && new URLSearchParams(location.search).get("local") === "1";
  if (isFirebaseConfigured && !forceLocal) {
    try {
      await initFirebase();
      return;
    } catch (err) {
      console.error("[flip7] Firebase non disponibile, passo alla modalita' locale", err);
      status.error = "Firebase non raggiungibile (" + err.message + "). Dati salvati solo su questo dispositivo.";
    }
  }
  await initLocal();
}

async function initLocal() {
  status = { ...status, mode: "local", ready: true, online: false, uid: deviceId() };
  const exists = localExists();
  room = localLoad();
  if (!room.meta.createdAt) room.meta.createdAt = Date.now();
  localSave();
  await applyPendingRoom(exists);
  rememberRoom();
  notify();
}

async function initFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [appMod, authMod, dbMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`)
  ]);

  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = dbMod.getDatabase(app);

  const roomRef = dbMod.ref(db, `rooms/${roomId}`);
  fb = { db, roomRef, update: dbMod.update, ref: dbMod.ref, onValue: dbMod.onValue, auth, authMod };
  status = { ...status, mode: "firebase", ready: false, access: "checking", error: null };

  dbMod.onValue(dbMod.ref(db, ".info/connected"), (snap) => {
    status.online = Boolean(snap.val());
    notify();
  });

  // login con Google: l'identita' e' l'account, non il browser, quindi
  // sopravvive a cambio rete, telefono nuovo e pulizia dei dati.
  let user = await new Promise((resolve) => {
    const stop = authMod.onAuthStateChanged(auth, (u) => { stop(); resolve(u); });
  });
  // sessioni anonime rimaste da prima del passaggio a Google: non valgono
  if (user && user.isAnonymous) {
    await authMod.signOut(auth).catch(() => {});
    user = null;
  }
  if (!user) {
    status.ready = true;
    status.access = "signin";
    notify();
    return;
  }
  adoptUser(user);
  watchMyRooms();
  await attachRoom();
}

function adoptUser(u) {
  status.uid = u.uid;
  status.user = {
    name: u.displayName || u.email || "Utente",
    email: u.email || "",
    photo: u.photoURL || ""
  };
}

/** Avvia il login con Google (va chiamato da un gesto dell'utente). */
export async function signIn() {
  const provider = new fb.authMod.GoogleAuthProvider();
  try {
    const cred = await fb.authMod.signInWithPopup(fb.auth, provider);
    adoptUser(cred.user);
    status.access = "checking";
    notify();
    watchMyRooms();
    await attachRoom();
  } catch (err) {
    if (err && (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request")) return;
    const friendly = {
      "auth/unauthorized-domain": "Questo indirizzo non è autorizzato: in Firebase → Authentication → Impostazioni → Domini autorizzati va aggiunto il dominio del sito.",
      "auth/operation-not-allowed": "L'accesso Google non è abilitato: in Firebase → Authentication → Metodo di accesso attiva Google.",
      "auth/network-request-failed": "Problema di rete: controlla la connessione e riprova.",
      "auth/popup-blocked": "Il browser ha bloccato la finestra di accesso: tocca di nuovo il pulsante.",
      "auth/operation-not-supported-in-this-environment": "Questo browser non supporta l'accesso: apri il link in Safari o Chrome."
    };
    status.error = friendly[err && err.code] || ("Accesso non riuscito: " + ((err && err.message) || err));
    notify();
  }
}

export async function signOutUser() {
  await fb.authMod.signOut(fb.auth);
  status.access = "signin";
  status.user = null;
  notify();
}

/**
 * Si mette in ascolto sulla stanza. Se le regole rifiutano la lettura vuol dire
 * che questo dispositivo non e' (ancora) fra i membri: si passa alla richiesta
 * di accesso e si resta in ascolto dell'approvazione.
 */
function attachRoom() {
  return new Promise((resolve) => {
    let first = true;
    fb.onValue(fb.roomRef, (snap) => {
      const exists = snap.exists();
      room = normalize(snap.val());
      status.ready = true;
      status.error = null;
      if (room.members[status.uid]) {
        status.access = "ok";
      } else if (!Object.keys(room.members).length && !bootstrapTried) {
        // riesco a leggere ma la stanza non ha membri: o sono il proprietario
        // (regole consigliate) o le regole non gestiscono i membri. Un tentativo solo.
        bootstrapTried = true;
        bootstrapOwner(exists);
      } else if (status.access !== "ok" && bootstrapTried) {
        status.access = "ok"; // lettura consentita: le regole non chiedono membership
      }
      if (status.access === "ok") { rememberRoom(); syncPeeks(); }
      if (first) { first = false; resolve(); }
      notify();
    }, () => {
      // lettura rifiutata: non siamo membri di questa stanza
      status.ready = true;
      status.access = "blocked";
      watchApproval();
      if (first) { first = false; resolve(); }
      notify();
    });
  });
}

let bootstrapTried = false;

/** Primo accesso del proprietario: si registra fra i membri e battezza la stanza. */
async function bootstrapOwner(roomExists) {
  try {
    await fb.update(fb.roomRef, {
      [`members/${status.uid}`]: { name: (status.user && status.user.name) || "Proprietario", email: (status.user && status.user.email) || null, at: Date.now() }
    });
    prefs.set("owner", true);
  } catch {
    // le regole attuali non gestiscono i membri (o non sono il proprietario):
    // se riesco a leggere, posso comunque usare la stanza
  }
  status.access = "ok";
  // battesimo della stanza: indipendente dalla registrazione fra i membri
  await applyPendingRoom(roomExists);
  rememberRoom();
  syncPeeks();
  notify();
}

/**
 * Battesimo di una stanza appena creata: nome, obiettivo, i partecipanti
 * indicati alla creazione e le persone gia' note che entrano senza chiedere.
 * La "prenotazione" e' salvata sul dispositivo da prepareRoom(), perche' la
 * creazione passa da un ricaricamento della pagina. Una stanza che esiste
 * gia' non si tocca.
 */
async function applyPendingRoom(roomExists) {
  const pending = prefs.get("pendingRoom");
  const forThis = pending && pending.id === roomId ? pending : null;
  if (forThis) prefs.set("pendingRoom", null);
  if (roomExists) return;
  const seed = seedRoom(forThis || { name: prefs.get("pendingRoomName") || DEFAULTS.roomName }, status.uid);
  prefs.set("pendingRoomName", null);
  try { await commit(seed.updates); }
  catch { return; /* verra' ritentato al prossimo salvataggio di un'impostazione */ }
  // agli invitati la stanza compare nel loro elenco senza bisogno del link
  if (status.mode === "firebase" && fb) {
    const entries = Object.fromEntries(Object.entries(seed.userRooms).map(([uid, v]) => [`${uid}/rooms/${roomId}`, v]));
    if (Object.keys(entries).length) fb.update(fb.ref(fb.db, "users"), entries).catch(() => {});
  }
}

/**
 * Dal cancello (accesso non ancora approvato) si possono leggere i soli
 * nomi dei giocatori e i collegamenti: servono per presentarsi come
 * "uno dei censiti". Il resto della stanza resta invisibile.
 */
function watchGateRoster() {
  fb.onValue(fb.ref(fb.db, `rooms/${roomId}/players`), (snap) => {
    status.gatePlayers = snap.val() || {};
    notify();
  }, () => {});
  fb.onValue(fb.ref(fb.db, `rooms/${roomId}/bindings`), (snap) => {
    status.gateBindings = snap.val() || {};
    notify();
  }, () => {});
}

/** In attesa: ascolta la propria voce membri e la propria richiesta. */
function watchApproval() {
  watchGateRoster();
  const memberRef = fb.ref(fb.db, `rooms/${roomId}/members/${status.uid}`);
  fb.onValue(memberRef, (snap) => {
    if (snap.exists()) {
      status.access = "ok";
      attachRoom();
      notify();
    }
  }, () => {});
  const reqRef = fb.ref(fb.db, `rooms/${roomId}/requests/${status.uid}`);
  fb.onValue(reqRef, (snap) => {
    if (snap.exists() && status.access !== "ok") {
      status.access = "pending";
      notify();
    }
  }, () => {});
}

// ---------------------------------------------------------------------------
// Accesso e membri
// ---------------------------------------------------------------------------

/** Chiede di entrare nella stanza (scrive la propria richiesta). */
export async function requestAccess(name, playerId = null) {
  if (!fb) return;
  const clean = String(name || (status.user && status.user.name) || "").trim().slice(0, 40) || "Sconosciuto";
  prefs.set("requestName", clean);
  await fb.update(fb.ref(fb.db, `rooms/${roomId}/requests`), {
    [status.uid]: { name: clean, playerId: playerId || null, email: (status.user && status.user.email) || null, at: Date.now() }
  });
  status.access = "pending";
  notify();
}

/** Approva una richiesta (funziona solo per il proprietario). */
export function approveRequest(uid) {
  const req = room.requests[uid] || {};
  const updates = {
    [`members/${uid}`]: { name: req.name || "Membro", email: req.email || null, at: Date.now() },
    [`requests/${uid}`]: null
  };
  // se ha detto chi e' fra i censiti, il collegamento nasce con l'approvazione
  if (req.playerId && room.players[req.playerId]) updates[`bindings/${uid}`] = req.playerId;
  return commit(updates);
}
export function rejectRequest(uid) {
  return commit({ [`requests/${uid}`]: null });
}
export async function revokeMember(uid) {
  await commit({ [`members/${uid}`]: null, [`bindings/${uid}`]: null });
  // e la stanza sparisce dal suo elenco (scrittura concessa al proprietario)
  if (status.mode === "firebase" && fb) fb.update(fb.ref(fb.db, `users/${uid}/rooms`), { [roomId]: null }).catch(() => {});
}

/**
 * Fa entrare subito una persona gia' nota da un'altra stanza: membro, giocatore
 * (col nome e l'avatar che ha di la', se c'e') e collegamento account -> giocatore,
 * tutto in un colpo. Non deve chiedere ne' aspettare: apre l'app e la stanza c'e'.
 */
export async function inviteMember(person) {
  if (!person || !person.uid) throw new Error("Persona non valida");
  if (room.members && room.members[person.uid]) throw new Error("È già dentro");
  const now = Date.now();
  const label = String(person.playerName || person.name || "").trim().slice(0, 24) || "Membro";
  const taken = new Set(Object.values(room.bindings || {}));
  const free = Object.entries(room.players || {})
    .find(([id, p]) => !p.archived && !taken.has(id) && p.name.toLowerCase() === label.toLowerCase());
  const updates = { [`members/${person.uid}`]: { name: person.name || label, email: person.email || null, at: now, invited: true } };
  let pid;
  if (free) pid = free[0];
  else {
    pid = newId();
    updates[`players/${pid}`] = { name: label, createdAt: now, archived: false, ...(person.avatar ? { avatar: person.avatar } : {}) };
  }
  updates[`bindings/${person.uid}`] = pid;
  await commit(updates);
  if (status.mode === "firebase" && fb) {
    fb.update(fb.ref(fb.db, `users/${person.uid}/rooms`), { [roomId]: { name: room.meta.name || DEFAULTS.roomName, at: now } }).catch(() => {});
  }
  return pid;
}

// ---------------------------------------------------------------------------
// Le mie stanze
// ---------------------------------------------------------------------------
/**
 * Le stanze che questo account conosce, la corrente per prima: l'elenco vive
 * in users/<uid>/rooms (segue l'account) e, come ripiego, sul dispositivo.
 * Per il proprietario ogni voce porta anche le richieste in attesa la' dentro.
 */
export function knownRooms() {
  const local = prefs.get("rooms", {}) || {};
  const merged = { ...local, ...(status.mode === "firebase" ? status.rooms : {}) };
  if (roomId && status.mode !== "none") merged[roomId] = { ...(merged[roomId] || {}), name: room.meta.name || (merged[roomId] || {}).name };
  return Object.entries(merged)
    .map(([id, r]) => {
      const pk = status.peek[id] || {};
      return { id, name: pk.name || (r && r.name) || id, at: (r && r.at) || 0, current: id === roomId, requests: pk.requests || 0 };
    })
    .sort((a, b) => (a.current ? -1 : b.current ? 1 : a.name.localeCompare(b.name, "it")));
}

let remembered = null;
/** Segna la stanza corrente fra quelle conosciute (una volta per nome). */
function rememberRoom() {
  if (!roomId) return;
  const name = room.meta.name || DEFAULTS.roomName;
  const key = roomId + "|" + name;
  if (remembered === key) return;
  remembered = key;
  const local = prefs.get("rooms", {}) || {};
  local[roomId] = { name, at: (local[roomId] && local[roomId].at) || Date.now() };
  prefs.set("rooms", local);
  if (status.mode === "firebase" && fb && status.uid) {
    const prev = status.rooms[roomId];
    if (!prev || prev.name !== name) {
      fb.update(fb.ref(fb.db, `users/${status.uid}/rooms`), { [roomId]: { name, at: (prev && prev.at) || Date.now() } }).catch(() => {});
    }
  }
}

/** Toglie una stanza dall'elenco (i dati della stanza restano dove sono). */
export function forgetRoom(id) {
  if (!id || id === roomId) return;
  const local = prefs.get("rooms", {}) || {};
  delete local[id];
  prefs.set("rooms", local);
  delete status.rooms[id];
  delete status.peek[id];
  const offs = peeks.get(id);
  if (offs) { for (const off of offs) off(); peeks.delete(id); }
  if (status.mode === "firebase" && fb && status.uid) {
    fb.update(fb.ref(fb.db, `users/${status.uid}/rooms`), { [id]: null }).catch(() => {});
  }
  notify();
}

/** L'elenco delle stanze segue l'account: si aggiorna anche se il proprietario mi invita altrove. */
function watchMyRooms() {
  if (!fb || !status.uid) return;
  fb.onValue(fb.ref(fb.db, `users/${status.uid}/rooms`), (snap) => {
    status.rooms = snap.val() || {};
    syncPeeks();
    notify();
  }, () => { /* regole senza `users`: resta l'elenco salvato sul dispositivo */ });
}

/**
 * Il proprietario tiene d'occhio le altre sue stanze senza entrarci: nome,
 * richieste in attesa e membri (per invitare qui chi e' gia' di la').
 */
const peeks = new Map(); // roomId -> [unsubscribe]
function syncPeeks() {
  if (!fb || status.access !== "ok" || !isOwner()) return;
  for (const r of knownRooms()) {
    if (r.current || peeks.has(r.id)) continue;
    const info = (patch) => { status.peek[r.id] = { ...(status.peek[r.id] || {}), ...patch }; notify(); };
    peeks.set(r.id, [
      fb.onValue(fb.ref(fb.db, `rooms/${r.id}/meta/name`), (s) => info({ name: s.val() || r.name }), () => {}),
      fb.onValue(fb.ref(fb.db, `rooms/${r.id}/requests`), (s) => info({ requests: Object.keys(s.val() || {}).length }), () => {}),
      fb.onValue(fb.ref(fb.db, `rooms/${r.id}/members`), (s) => info({ members: s.val() || {} }), () => {})
    ]);
  }
}

/**
 * Le persone gia' entrate in una delle mie stanze (io escluso): con il nome
 * del giocatore e l'avatar, se in questa stanza sono collegate a uno.
 * Servono a far entrare qualcuno in una stanza nuova senza passare dal link.
 */
export function knownPeople() {
  const people = {};
  const add = (uid, m, where) => {
    if (!uid || uid === status.uid || !m) return;
    const p = people[uid] || (people[uid] = { uid, name: m.name || "Membro", email: m.email || "", rooms: [] });
    if (m.email && !p.email) p.email = m.email;
    if (!p.rooms.includes(where)) p.rooms.push(where);
  };
  for (const [uid, m] of Object.entries(room.members || {})) add(uid, m, room.meta.name || roomId);
  for (const [rid, pk] of Object.entries(status.peek || {})) for (const [uid, m] of Object.entries(pk.members || {})) add(uid, m, pk.name || rid);
  for (const [uid, pid] of Object.entries(room.bindings || {})) {
    const p = people[uid];
    const pl = room.players[pid];
    if (p && pl) { p.playerName = pl.name; if (pl.avatar) p.avatar = pl.avatar; }
  }
  return Object.values(people).sort((a, b) => (a.playerName || a.name).localeCompare(b.playerName || b.name, "it"));
}

/**
 * Prepara i dati di una stanza nuova: nome, obiettivo, i giocatori dai nomi
 * indicati e, per le persone gia' note (`invites`), giocatore + membro +
 * collegamento, cosi' entrano senza chiedere. Logica pura: restituisce
 * l'update relativo alla stanza e le voci per l'elenco stanze degli invitati.
 */
export function seedRoom(spec, ownerUid) {
  const now = Date.now();
  const name = String((spec && spec.name) || "").trim().slice(0, 40) || DEFAULTS.roomName;
  const target = Math.max(10, Math.min(2000, Math.round(Number(spec && spec.targetScore) || DEFAULTS.targetScore)));
  const updates = { "meta/name": name, "meta/targetScore": target, "meta/createdAt": now };
  const seen = new Set();
  const addPlayer = (label, extra = {}) => {
    const clean = String(label || "").trim().slice(0, 24);
    if (!clean || seen.has(clean.toLowerCase())) return null;
    seen.add(clean.toLowerCase());
    const id = newId();
    updates[`players/${id}`] = { name: clean, createdAt: now, archived: false, ...extra };
    return id;
  };
  const userRooms = {};
  // prima gli invitati: se lo stesso nome e' anche fra quelli scritti a mano, vince il collegamento
  for (const inv of (spec && spec.invites) || []) {
    if (!inv || !inv.uid || inv.uid === ownerUid) continue;
    const pid = addPlayer(inv.playerName || inv.name, inv.avatar ? { avatar: inv.avatar } : {});
    updates[`members/${inv.uid}`] = { name: inv.name || inv.playerName || "Membro", email: inv.email || null, at: now, invited: true };
    if (pid) updates[`bindings/${inv.uid}`] = pid;
    userRooms[inv.uid] = { name, at: now };
  }
  for (const n of (spec && spec.players) || []) addPlayer(n);
  return { name, updates, userRooms };
}

/** Sceglie il codice segreto della stanza nuova e mette da parte i dati per il battesimo. */
export function prepareRoom(spec) {
  const clean = String((spec && spec.name) || "").trim();
  const slug = (clean || "stanza").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16) || "stanza";
  let rand = "";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) rand += alphabet[b % alphabet.length];
  const id = `${slug}-${rand}`;
  prefs.set("pendingRoom", { ...(spec || {}), name: clean || DEFAULTS.roomName, id });
  return id;
}

/**
 * Crea una stanza nuova e la apre (atterrando in Setup, dove si condivide il link).
 * `spec`: { name, players: [nomi], invites: [persone da knownPeople()], targetScore }.
 */
export function createRoom(spec) {
  if (typeof spec === "string") spec = { name: spec };
  switchRoom(prepareRoom(spec || {}), "#setup");
}

/**
 * Lega questo account a un giocatore del roster. Il primo collegamento lo fa
 * l'interessato; da li' in poi puo' cambiarlo solo il proprietario (regole).
 */
export function bindSelf(playerId) {
  return commit({ [`bindings/${status.uid}`]: playerId });
}
export function bindMember(uid, playerId) {
  return commit({ [`bindings/${uid}`]: playerId || null });
}
/** Il giocatore legato a questo account (null se non ancora scelto). */
export function myPlayerId() {
  return (room.bindings || {})[status.uid] || null;
}

/**
 * Il proprietario della stanza: in modalita' locale chiunque; su Firebase chi
 * l'ha creata. Lo si riconosce perche' e' il primo iscritto fra i membri (solo
 * lui puo' scrivere quell'elenco), cosi' vale anche da un dispositivo nuovo.
 * Le regole del database restano l'unica vera barriera.
 */
export function isOwner() {
  if (status.mode !== "firebase") return true;
  if (prefs.get("owner")) return true;
  const first = Object.entries(room.members || {})
    .sort((a, b) => ((a[1] && a[1].at) || 0) - ((b[1] && b[1].at) || 0))[0];
  return Boolean(first && first[0] === status.uid);
}

/** Cambia stanza a caldo (ricarica la pagina: e' il modo piu' semplice e sicuro). */
export function switchRoom(id, hash = null) {
  const clean = String(id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!clean) return;
  prefs.set("roomId", clean);
  const url = new URL(location.href);
  url.searchParams.set("room", clean);
  if (hash !== null) url.hash = hash;
  location.href = url.toString();
}

// ---------------------------------------------------------------------------
// Segnapunti (controllo)
// ---------------------------------------------------------------------------
export function isScorekeeper() {
  return Boolean(room.control && room.control.uid === status.uid);
}
export function hasScorekeeper() {
  return Boolean(room.control && room.control.uid);
}
export function claimScorekeeper(name) {
  return commit({
    "control/uid": status.uid,
    "control/name": name || "Segnapunti",
    "control/at": Date.now()
  });
}
export function releaseScorekeeper() {
  return commit({ control: null });
}

// ---------------------------------------------------------------------------
// Roster giocatori
// ---------------------------------------------------------------------------
export function addPlayer(name) {
  const clean = String(name || "").trim();
  if (!clean) return Promise.resolve(null);
  const exists = Object.entries(room.players || {}).find(([, p]) => p.name.toLowerCase() === clean.toLowerCase());
  if (exists) return Promise.resolve(exists[0]);
  const id = newId();
  return commit({ [`players/${id}`]: { name: clean, createdAt: Date.now(), archived: false } }).then(() => id);
}
export function renamePlayer(id, name) {
  const clean = String(name || "").trim();
  if (!clean) return Promise.resolve();
  return commit({ [`players/${id}/name`]: clean });
}
export function setPlayerArchived(id, archived) {
  return commit({ [`players/${id}/archived`]: Boolean(archived) });
}
/** Avatar scelto dal giocatore (null = torna alle iniziali). Le regole lasciano
    scrivere solo al proprietario e all'account legato a quel giocatore. */
export function setPlayerAvatar(id, avatar) {
  return commit({ [`players/${id}/avatar`]: avatar ? JSON.parse(JSON.stringify(avatar)) : null });
}
// I giocatori non si eliminano: si archiviano, cosi' lo storico resta coerente.

// ---------------------------------------------------------------------------
// Partita in corso
// ---------------------------------------------------------------------------
export function startGame(playerIds, targetScore) {
  if (!playerIds || playerIds.length < 2) throw new Error("Servono almeno 2 giocatori");
  const players = {};
  const names = {};
  playerIds.forEach((pid, i) => {
    players[pid] = { order: i };
    names[pid] = (room.players[pid] && room.players[pid].name) || "?";
  });
  // sorteggio di chi apre la prima mano: dal secondo round in poi si ruota
  const firstIdx = Math.floor(Math.random() * playerIds.length);
  const live = {
    gameId: newId(),
    startedAt: Date.now(),
    targetScore: Number(targetScore) || room.meta.targetScore || DEFAULTS.targetScore,
    status: "playing",
    round: 0,
    firstIdx,
    players,
    names,
    scores: {}
  };
  return commit({ live }).then(() => playerIds[firstIdx]);
}

export function setRoundEntry(playerId, roundIndex, entry) {
  return commit({ [`live/scores/${playerId}/${roundKey(roundIndex)}`]: entry });
}
export function clearRoundEntry(playerId, roundIndex) {
  return commit({ [`live/scores/${playerId}/${roundKey(roundIndex)}`]: null });
}

/** Chiude il round corrente: i giocatori senza entry prendono 0. */
export function closeRound() {
  const live = room.live;
  if (!live || live.status !== "playing") return Promise.resolve();
  const r = live.round || 0;
  const updates = {};
  for (const pid of orderedPlayerIds(live)) {
    const cur = live.scores && live.scores[pid] && live.scores[pid][roundKey(r)];
    if (!cur) updates[`live/scores/${pid}/${roundKey(r)}`] = { numbers: [], plus: [], doubled: false, busted: false, skipped: true };
  }
  updates["live/round"] = r + 1;

  // simulo lo stato dopo l'update per capire se la partita e' finita
  const simulated = JSON.parse(JSON.stringify(live));
  for (const [path, value] of Object.entries(updates)) {
    setAt({ live: simulated }, path, value);
  }
  const target = live.targetScore || DEFAULTS.targetScore;
  const anyReached = orderedPlayerIds(simulated).some((pid) => playerTotal(simulated, pid) >= target);
  if (anyReached) {
    const standings = liveStandings(simulated, room.players);
    updates["live/status"] = "finished";
    updates["live/finishedAt"] = Date.now();
    updates["live/winnerIds"] = Object.fromEntries(winnersOf(standings).map((id) => [id, true]));
  }
  return commit(updates);
}

export function reopenRound() {
  const live = room.live;
  if (!live) return Promise.resolve();
  const r = Math.max(0, (live.round || 0) - 1);
  return commit({ "live/round": r, "live/status": "playing", "live/winnerIds": null, "live/finishedAt": null });
}

/** Termina la partita subito, senza aspettare il target. */
export function finishGameNow() {
  const live = room.live;
  if (!live) return Promise.resolve();
  const standings = liveStandings(live, room.players);
  return commit({
    "live/status": "finished",
    "live/finishedAt": Date.now(),
    "live/winnerIds": Object.fromEntries(winnersOf(standings).map((id) => [id, true]))
  });
}

export function setWinner(playerId) {
  return commit({ "live/winnerIds": { [playerId]: true } });
}

/** Archivia la partita conclusa nello storico e libera il tavolo. */
export function saveGameToHistory() {
  const live = room.live;
  if (!live) return Promise.resolve(null);
  const standings = liveStandings(live, room.players);
  const results = {};
  for (const row of standings) {
    const rows_ = (live.scores && live.scores[row.playerId]) || {};
    results[row.playerId] = {
      name: row.name,
      total: row.total,
      flip7s: Object.values(rows_).filter((e) => computeRound(e).flip7).length,
      busts: Object.values(rows_).filter((e) => e && e.busted).length,
      freezes: Object.values(rows_).filter((e) => e && e.frozen && !e.busted).length
    };
  }
  const winnerIds = live.winnerIds && Object.keys(live.winnerIds).length
    ? live.winnerIds
    : Object.fromEntries(winnersOf(standings).map((id) => [id, true]));

  const game = {
    playedAt: live.startedAt || Date.now(),
    finishedAt: live.finishedAt || Date.now(),
    targetScore: live.targetScore || DEFAULTS.targetScore,
    source: "live",
    results,
    winnerIds,
    rounds: live.scores || null,
    createdAt: Date.now()
  };
  const gameId = live.gameId || newId();
  return commit({ [`history/${gameId}`]: game, live: null }).then(() => gameId);
}

export function cancelGame() {
  return commit({ live: null });
}

// ---------------------------------------------------------------------------
// Tavolo online
// ---------------------------------------------------------------------------
/** I tavoli aperti in questo momento, in ordine di apertura. */
export function tables() {
  return Object.values(room.game || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** Sovrascrive lo stato di UN tavolo (JSON pulito: Firebase rifiuta undefined).
    Ogni mossa aggiorna updatedAt: serve a riconoscere i tavoli abbandonati. */
export function commitGame(state) {
  if (!state || !state.id) throw new Error("Tavolo senza id");
  return commit({ [`game/${state.id}`]: JSON.parse(JSON.stringify({ ...state, updatedAt: Date.now() })) });
}

/** Chiude un tavolo senza salvare nulla (lo storico non si tocca). */
export function closeTable(id) {
  return commit({ [`game/${id}`]: null });
}

/**
 * Archivia una partita online conclusa e libera il tavolo.
 * Le mani fotografate dal motore (`state.rounds`) diventano le stesse righe
 * del segnapunti dal vivo: sballi, congelate, Flip 7, ×2 e rimonte contano
 * nelle statistiche esattamente come in una partita segnata a mano.
 */
export function saveOnlineGame(state) {
  const keyOf = (sid) => (state.seats[sid] && state.seats[sid].playerId) || sid;
  // Le mani ci sono solo dalle partite avviate da quando il tavolo le fotografa
  // (`startedAt`): di una cominciata prima si archiviano i soli totali, meglio
  // che un dettaglio a meta' che falserebbe medie e record.
  const rounds = {};
  if (state.startedAt) {
    (state.rounds || []).forEach((played, i) => {
      for (const [sid, entry] of Object.entries(played || {})) {
        if (!state.seats[sid]) continue; // chi ha abbandonato non finisce nello storico
        const key = keyOf(sid);
        rounds[key] = { ...(rounds[key] || {}), [roundKey(i)]: entry };
      }
    });
  }
  const tracked = Object.keys(rounds).length > 0;
  const results = {};
  for (const sid of state.order) {
    const seat = state.seats[sid];
    const key = keyOf(sid);
    const rows = Object.values(rounds[key] || {});
    results[key] = {
      name: seat.name,
      total: Number(seat.total) || 0,
      ...(tracked ? {
        flip7s: rows.filter((e) => computeRound(e).flip7).length,
        busts: rows.filter((e) => e && e.busted).length,
        freezes: rows.filter((e) => e && e.frozen && !e.busted).length
      } : {})
    };
  }
  const top = Math.max(...Object.values(results).map((r) => r.total));
  const winnerIds = Object.fromEntries(Object.entries(results).filter(([, r]) => r.total === top).map(([id]) => [id, true]));
  const gameId = newId();
  const now = Date.now();
  const updates = {
    [`history/${gameId}`]: {
      playedAt: state.startedAt || now,
      finishedAt: now,
      targetScore: state.target || 200,
      source: "online",
      results,
      winnerIds,
      rounds: tracked ? rounds : null,
      createdAt: now
    }
  };
  if (state.id) updates[`game/${state.id}`] = null; // il tavolo si libera
  return commit(updates).then(() => gameId);
}

// ---------------------------------------------------------------------------
// Storico
// ---------------------------------------------------------------------------
/**
 * Inserisce una partita passata.
 * @param {{playedAt:number, entries:{playerId:string,total:number}[], winnerIds?:string[], note?:string, targetScore?:number}} data
 */
export function addManualGame(data) {
  const results = {};
  for (const e of data.entries) {
    if (!e.playerId) continue;
    results[e.playerId] = {
      name: (room.players[e.playerId] && room.players[e.playerId].name) || e.name || "?",
      total: Number(e.total) || 0
    };
  }
  if (Object.keys(results).length < 2) throw new Error("Servono almeno 2 giocatori");

  let winners = data.winnerIds && data.winnerIds.length ? data.winnerIds : null;
  if (!winners) {
    const top = Math.max(...Object.values(results).map((r) => r.total));
    winners = Object.entries(results).filter(([, r]) => r.total === top).map(([id]) => id);
  }
  const gameId = data.id || newId();
  const game = {
    playedAt: data.playedAt || Date.now(),
    targetScore: Number(data.targetScore) || room.meta.targetScore || DEFAULTS.targetScore,
    source: "manual",
    note: data.note || null,
    results,
    winnerIds: Object.fromEntries(winners.map((id) => [id, true])),
    rounds: null,
    createdAt: Date.now()
  };
  return commit({ [`history/${gameId}`]: game }).then(() => gameId);
}

export function updateGameWinners(gameId, winnerIds) {
  return commit({ [`history/${gameId}/winnerIds`]: Object.fromEntries(winnerIds.map((id) => [id, true])) });
}
/** Riscrive per intero una partita chiusa (le regole lo concedono al solo proprietario). */
export function updateGame(gameId, game) {
  return commit({ [`history/${gameId}`]: JSON.parse(JSON.stringify(game)) });
}
export function deleteGame(gameId) {
  return commit({ [`history/${gameId}`]: null });
}

// ---------------------------------------------------------------------------
// Impostazioni stanza
// ---------------------------------------------------------------------------
export function setRoomName(name) { return commit({ "meta/name": String(name || "").trim() || DEFAULTS.roomName }); }
export function setTargetScore(n) {
  const v = Math.max(10, Math.min(2000, Math.round(Number(n) || DEFAULTS.targetScore)));
  return commit({ "meta/targetScore": v });
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------
export function exportJSON() {
  return JSON.stringify({ exportedAt: Date.now(), roomId, room }, null, 2);
}
export async function importJSON(text, { merge = true } = {}) {
  const parsed = JSON.parse(text);
  const incoming = normalize(parsed.room || parsed);
  const updates = {};
  updates["meta/name"] = incoming.meta.name;
  updates["meta/targetScore"] = incoming.meta.targetScore;
  for (const [id, p] of Object.entries(incoming.players)) updates[`players/${id}`] = p;
  for (const [id, g] of Object.entries(incoming.history)) updates[`history/${id}`] = g;
  if (!merge) {
    for (const id of Object.keys(room.history || {})) if (!incoming.history[id]) updates[`history/${id}`] = null;
    for (const id of Object.keys(room.players || {})) if (!incoming.players[id]) updates[`players/${id}`] = null;
  }
  await commit(updates);
  return { players: Object.keys(incoming.players).length, games: Object.keys(incoming.history).length };
}
