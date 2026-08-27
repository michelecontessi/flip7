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
let status = { mode: "local", ready: false, online: false, uid: deviceId(), error: null };
let fb = null; // { db, ref, update, onValue, roomRef }

export function emptyRoom() {
  return {
    meta: { name: DEFAULTS.roomName, targetScore: DEFAULTS.targetScore, createdAt: Date.now() },
    control: null,
    players: {},
    live: null,
    history: {}
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
    history: v.history || {}
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
  roomId = (id || prefs.get("roomId") || DEFAULTS.roomId).trim().toLowerCase();
  prefs.set("roomId", roomId);

  if (isFirebaseConfigured) {
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

  const cred = await authMod.signInAnonymously(auth);
  const uid = cred.user.uid;

  const roomRef = dbMod.ref(db, `rooms/${roomId}`);
  fb = { db, roomRef, update: dbMod.update, ref: dbMod.ref, onValue: dbMod.onValue };
  status = { ...status, mode: "firebase", uid, ready: false, error: null };

  dbMod.onValue(dbMod.ref(db, ".info/connected"), (snap) => {
    status.online = Boolean(snap.val());
    notify();
  });

  await new Promise((resolve) => {
    let first = true;
    dbMod.onValue(roomRef, (snap) => {
      room = normalize(snap.val());
      status.ready = true;
      status.error = null;
      if (first) {
        first = false;
        if (!snap.exists()) {
          commit({ "meta/name": DEFAULTS.roomName, "meta/targetScore": DEFAULTS.targetScore, "meta/createdAt": Date.now() }).catch(() => {});
        }
        resolve();
      }
      notify();
    }, (err) => {
      status.error = "Lettura rifiutata: " + err.message + " (controlla le regole del database)";
      status.ready = true;
      notify();
      if (first) { first = false; resolve(); }
    });
  });
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
