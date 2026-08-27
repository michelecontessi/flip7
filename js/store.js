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
let status = { mode: "local", ready: false, online: false, uid: deviceId(), access: "ok", error: null };
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
    game: null
  };
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
    game: v.game || null
  };
}

// --- pub/sub ----------------------------------------------------------------
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of [...listeners]) fn(); }

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
  const forceLocal = new URLSearchParams(location.search).get("local") === "1";
  if (isFirebaseConfigured && !forceLocal) {
    try {
      await initFirebase();
      return;
    } catch (err) {
      console.error("[flip7] Firebase non disponibile, passo alla modalita' locale", err);
      status.error = "Firebase non raggiungibile (" + err.message + "). Dati salvati solo su questo dispositivo.";
    }
  }
  initLocal();
}

function initLocal() {
  status = { ...status, mode: "local", ready: true, online: false, uid: deviceId() };
  room = localLoad();
  if (!room.meta.createdAt) room.meta.createdAt = Date.now();
  localSave();
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
  if (!roomExists) {
    try {
      await commit({
        "meta/name": prefs.get("pendingRoomName") || DEFAULTS.roomName,
        "meta/targetScore": DEFAULTS.targetScore,
        "meta/createdAt": Date.now()
      });
      prefs.set("pendingRoomName", null);
    } catch { /* verra' ritentato al prossimo salvataggio di un'impostazione */ }
  }
  notify();
}

/** In attesa: ascolta la propria voce membri e la propria richiesta. */
function watchApproval() {
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
export async function requestAccess(name) {
  if (!fb) return;
  const clean = String(name || (status.user && status.user.name) || "").trim().slice(0, 40) || "Sconosciuto";
  prefs.set("requestName", clean);
  await fb.update(fb.ref(fb.db, `rooms/${roomId}/requests`), {
    [status.uid]: { name: clean, email: (status.user && status.user.email) || null, at: Date.now() }
  });
  status.access = "pending";
  notify();
}

/** Approva una richiesta (funziona solo per il proprietario). */
export function approveRequest(uid) {
  const req = room.requests[uid] || {};
  return commit({
    [`members/${uid}`]: { name: req.name || "Membro", email: req.email || null, at: Date.now() },
    [`requests/${uid}`]: null
  });
}
export function rejectRequest(uid) {
  return commit({ [`requests/${uid}`]: null });
}
export function revokeMember(uid) {
  return commit({ [`members/${uid}`]: null, [`bindings/${uid}`]: null });
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

/** Crea una stanza nuova con codice segreto e la apre. */
export function createRoom(name) {
  const clean = String(name || "").trim();
  const slug = (clean || "stanza").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16) || "stanza";
  let rand = "";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) rand += alphabet[b % alphabet.length];
  if (clean) prefs.set("pendingRoomName", clean);
  switchRoom(`${slug}-${rand}`);
}

/** Cambia stanza a caldo (ricarica la pagina: e' il modo piu' semplice e sicuro). */
export function switchRoom(id) {
  const clean = String(id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!clean) return;
  prefs.set("roomId", clean);
  const url = new URL(location.href);
  url.searchParams.set("room", clean);
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
  const live = {
    gameId: newId(),
    startedAt: Date.now(),
    targetScore: Number(targetScore) || room.meta.targetScore || DEFAULTS.targetScore,
    status: "playing",
    round: 0,
    players,
    names,
    scores: {}
  };
  return commit({ live });
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
      busts: Object.values(rows_).filter((e) => e && e.busted).length
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
/** Sovrascrive lo stato del tavolo (JSON pulito: Firebase rifiuta undefined). */
export function commitGame(state) {
  return commit({ game: state === null ? null : JSON.parse(JSON.stringify(state)) });
}

/** Archivia una partita online conclusa e libera il tavolo. */
export function saveOnlineGame(state) {
  const results = {};
  for (const sid of state.order) {
    const seat = state.seats[sid];
    const key = seat.playerId || sid;
    results[key] = { name: seat.name, total: Number(seat.total) || 0 };
  }
  const top = Math.max(...Object.values(results).map((r) => r.total));
  const winnerIds = Object.fromEntries(Object.entries(results).filter(([, r]) => r.total === top).map(([id]) => [id, true]));
  const gameId = newId();
  return commit({
    [`history/${gameId}`]: {
      playedAt: Date.now(),
      targetScore: state.target || 200,
      source: "online",
      results,
      winnerIds,
      rounds: null,
      createdAt: Date.now()
    },
    game: null
  }).then(() => gameId);
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
