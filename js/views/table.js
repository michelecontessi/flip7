// ---------------------------------------------------------------------------
// Vista "Tavolo": la partita online vera e propria, separata dal segnapunti.
// I tavoli aperti vivono in room.game (id -> stato): se ne possono tenere
// piu' di uno insieme, cosi' chi non gioca a quello aperto se ne apre un
// altro invece di aspettare. Le mosse passano dal motore puro (js/game.js)
// e vengono scritte per intero: tutti vedono la stessa cosa.
// Layout (pensato per il telefono, come un tavolo da gioco online): in cima
// la striscia che dice sempre chi deve fare cosa, con i comandi sotto; il
// banco (mazzo e carta girata) accanto; poi una riga per giocatore con nome,
// stato, punti e TUTTE le sue carte in fila. Le righe stanno nell'ordine in
// cui si gioca: in cima chi ha il turno adesso, poi chi viene dopo; il proprio
// posto e' segnato (bordo e "tu") ovunque si trovi. Le carte si dimensionano
// sull'altezza dello schermo, cosi' il tabellone sta in una schermata sola.
// Su desktop le stesse parti si dispongono su due colonne.
//
// Presenza: ogni dispositivo seduto lascia un battito (`seen`) ogni pochi
// secondi; chi ha un battito recente e' "collegato". Se chi deve giocare non
// muove per un minuto, gli altri collegati possono bloccarlo di comune
// accordo: incassa quello che ha e la partita continua. Avvisi (suono,
// vibrazione, notifica) quando tocca a te. Reazioni con gli sticker.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, colorOf, toast, askText, askConfirm, askChoice, relTime, fmtDate, openSheet, closeSheet } from "../ui.js";
import { avatar } from "../avatar.js";
import { icon, wordmark, crownEmblem, fanArt, numberCard, modCard, roundCard, cardBack, flip7Card, vCard, sticker, STICKERS } from "../icons.js";
import * as engine from "../game.js";
import * as V from "../vengeance.js";

// "tocca la carta" (Steal / Swap / Discard): la prima carta scelta per lo
// Swap e l'apertura del riquadro "passa la carta", su QUESTO dispositivo
let swapPick = null;
let giveOpen = false;
import { alertUser, pushLocal } from "../notify.js";
import { sharePodium } from "../share.js";

// "stay" copre anche chi viene chiuso d'ufficio a fine round (flip7 altrui,
// carte finite): "ha incassato" e' vero in entrambi i casi, "si e' fermato" no
const OUT_LABEL = { stay: "ha incassato", frozen: "congelato", bust: "sballato", flip7: "FLIP 7", excluded: "fuori" };
// in Vengeance chi si ferma non ha ancora incassato: resta un bersaglio
const isVg = (g) => Boolean(g) && g.mode === "vengeance";
const outLabel = (g, out) => (isVg(g) && out === "stay" ? "fermo" : OUT_LABEL[out]);
// le carte azione hanno un riquadro tutto loro: nome, colore e cosa fare
const ACTION_META = {
  frz: { name: "Congela", ico: "snow", ask: "Chi vuoi congelare?", doing: "sceglie chi congelare" },
  fl3: { name: "Pesca Tre", ico: "cardFan", ask: "Chi deve pescare tre carte?", doing: "sceglie chi pescherà tre carte" },
  sc:  { name: "Seconda Chance", ico: "heartFill", ask: "A chi regali la Seconda Chance?", doing: "sceglie a chi regalare la Seconda Chance" },
  // With a Vengeance
  fl4: { name: "Flip Four", ico: "four", ask: "Chi deve pescare quattro carte? (anche tu, anche chi è fermo)", doing: "sceglie chi pescherà quattro carte" },
  jom: { name: "Just One More", ico: "oneMore", ask: "Chi pesca un'ultima carta e poi si ferma? (anche tu)", doing: "sceglie a chi tocca l'ultima carta" },
  stl: { name: "Steal", ico: "steal", ask: "Tocca la carta da rubare, nella fila di un altro", doing: "sceglie quale carta rubare" },
  swp: { name: "Swap", ico: "swap", ask: "Tocca le due carte da scambiare, di due giocatori diversi", doing: "sceglie due carte da scambiare" },
  dsc: { name: "Discard", ico: "discard", ask: "Tocca la carta da far scartare (anche una tua)", doing: "sceglie quale carta far scartare" }
};
/** Nome, icona e istruzioni di una carta da assegnare o da usare (modificatori compresi). */
function metaOf(type) {
  if (ACTION_META[type]) return ACTION_META[type];
  if (V.VC.isMod(type)) {
    const lab = V.cardLabel(type);
    return { name: lab, ico: null, mod: true, ask: `A chi dai il ${lab}? (anche a te, anche a chi è fermo)`, doing: `sceglie a chi dare il ${lab}` };
  }
  return { name: engine.cardLabel(type), ico: "star", ask: "Scegli", doing: "sceglie" };
}
const BOT_NAMES = ["Bot Ada", "Bot Bruno", "Bot Carla", "Bot Dina"];
// i livelli dei bot: da chi si ferma presto a chi conta le carte uscite
const BOT_LEVELS = {
  facile: { label: "facile", desc: "si ferma presto, rischia poco" },
  normale: { label: "normale", desc: "rischia finché il bottino è magro" },
  contacarte: { label: "conta-carte", desc: "calcola il rischio dalle carte uscite" }
};
let botTimer = null;

// chi non muove per un minuto puo' essere bloccato dagli altri
const STALL_MS = 60e3;
// un battito piu' vecchio di cosi' vuol dire "non collegato"
const ONLINE_MS = 45e3;
// la reazione resta sulla riga per qualche secondo
const REACTION_MS = 4000;

/** Tutti i tavoli aperti, dal piu' vecchio al piu' nuovo. */
const tablesOf = (ctx) => Object.values(ctx.room.game || {})
  .map((t) => engine.normalizeGame(t))
  .filter(Boolean)
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

// tavolo scelto a mano su QUESTO dispositivo, e voglia di vedere l'elenco
let viewingId = null;
let browsing = false;
// id del tavolo che sto guardando adesso: le mosse automatiche e le
// animazioni devono rileggere quello, non un tavolo qualsiasi
let shownId = null;

/**
 * Il tavolo in vista: quello scelto a mano, altrimenti quello dove sono
 * seduto; con un tavolo solo non c'e' niente da scegliere.
 */
function pickTable(ctx) {
  const list = tablesOf(ctx);
  if (browsing) return null;
  const chosen = list.find((t) => t.id === viewingId);
  if (chosen) return chosen;
  const seated = list.find((t) => mySeat(t, ctx));
  if (seated) return seated;
  return list.length === 1 ? list[0] : null;
}

/** Lo stato aggiornato del tavolo in vista (per timer e animazioni). */
const current = () => engine.normalizeGame((store.getRoom().game || {})[shownId]);

/** Cambiando tavolo si riparte puliti: nessuna animazione a meta'. */
function syncTable(g) {
  const id = g ? g.id : null;
  if (id === shownId) return;
  shownId = id;
  lastAnimKey = null;
  landingActive = false;
  spoilerHold = false;
  parkedCard = null;
  resolveTargetSid = null;
  lastMoveKey = null;
  moveHold = null;
  swapPick = null;
  giveOpen = false;
  podiumKey = null;
  wasMyTurn = null;
  lastAlertKey = null;
}

/** Il tavolo lo chiude solo chi l'ha aperto (i tavoli vecchi non hanno padrone). */
const isTableOwner = (g, ctx) => !g.owner || !g.owner.uid || g.owner.uid === ctx.status.uid;
/**
 * Il MIO posto: quello del mio account, mai un bot (i bot hanno lo stesso uid
 * di chi li ha aggiunti). A parita', vince il posto del giocatore collegato.
 */
const mySeat = (g, ctx) => {
  if (!g) return undefined;
  const mine = g.order.filter((sid) => g.seats[sid] && g.seats[sid].uid === ctx.status.uid && !g.seats[sid].bot);
  return mine.find((sid) => ctx.me && g.seats[sid].playerId === ctx.me) || mine[0];
};
/** Primo nome per gli umani; i bot tengono il nome intero ("Bot" da solo e' ambiguo). */
const shortName = (seat) => seat.bot ? seat.name : String(seat.name || "").split(" ")[0];

/** Chi deve agire adesso (turno, bersaglio del Pesca Tre o chi sta scegliendo). */
const actorOf = (g) => g.pending ? g.pending.chooser : g.flip3 ? g.flip3.target : g.turn;

/** true se il posto indicato e' controllato da questo dispositivo
    (in locale tutti i posti sono tuoi: si gioca passandosi il telefono). */
const controls = (g, ctx, sid) => Boolean(g.seats[sid] && g.seats[sid].uid === ctx.status.uid);
/** Posto umano e mio: e' a me che tocca fare qualcosa. */
const mine = (g, ctx, sid) => Boolean(sid && controls(g, ctx, sid) && !g.seats[sid].bot);

/**
 * Il bottone vale per il tavolo com'era quando e' stato disegnato (`data-at`
 * porta l'istante dell'ultima mossa). La mossa cambia lo stato subito, ma il
 * ridisegno arriva al fotogramma dopo: chi schiaccia Pesca due volte di fila
 * in fretta userebbe il bottone vecchio sul tavolo nuovo e giocherebbe per
 * chi e' venuto dopo. Fuori tempo massimo: il secondo tocco non fa niente.
 */
const isFresh = (g, el) => !el || el.dataset.at === undefined || el.dataset.at === String(g.updatedAt || 0);

/** Chi ha vinto (a partita finita): lo dice il motore, altrimenti il totale piu' alto. */
const winnerOf = (g) => (g.winners && g.winners[0] && g.seats[g.winners[0]]) ? g.winners[0]
  : [...g.order].sort((a, b) => (g.seats[b].total || 0) - (g.seats[a].total || 0))[0];

// --- presenza ----------------------------------------------------------------
/** true se quell'account ha lasciato un battito di recente (io sono sempre qui). */
const isOnline = (g, uid, myUid) => uid === myUid || (Number((g.seen || {})[uid]) || 0) > Date.now() - ONLINE_MS;
/** Posti umani con l'account collegato adesso. */
const onlineSeats = (g, ctx) => g.order.filter((sid) => g.seats[sid] && !g.seats[sid].bot && isOnline(g, g.seats[sid].uid, ctx.status.uid));
/**
 * Gli account il cui consenso serve per bloccare `target`: tutti i giocatori
 * umani collegati, tranne l'interessato (se e' umano) e chi e' gia' bloccato.
 */
function voterUids(g, ctx, target) {
  const t = g.seats[target];
  const out = new Set();
  for (const sid of onlineSeats(g, ctx)) {
    const s = g.seats[sid];
    if (s.blocked) continue;
    if (t && !t.bot && s.uid === t.uid) continue;
    out.add(s.uid);
  }
  return [...out];
}
/** Da quanto chi deve giocare non muove (ms). */
const stalledFor = (g) => (g.status === "playing" && g.updatedAt ? Date.now() - g.updatedAt : 0);
const isStalled = (g) => stalledFor(g) >= STALL_MS;
const fmtStall = (ms) => { const s = Math.floor(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// --- rischio di sballo: dalle carte uscite -----------------------------------
/**
 * Le carte che nessuno ha ancora visto (= quelle nel mazzo), contate per
 * tipo: mazzo intero meno scarti, mani, carta parcheggiata e azioni
 * accantonate. Non si guarda l'ordine del mazzo: sarebbe barare.
 */
function unseenCounts(g) {
  const counts = {};
  for (const c of engine.deckOf(g)) counts[c] = (counts[c] || 0) + 1;
  const take = (c) => { if (counts[c] > 0) counts[c] -= 1; };
  for (const c of g.discard) take(c);
  for (const sid of g.order) {
    const h = g.hands[sid];
    if (!h) continue;
    if (Array.isArray(h.cards)) { for (const c of h.cards) take(c); continue; }
    for (const n of h.nums) take("n" + n);
    for (const p of h.plus) take("p" + p);
    if (h.x2) take("x2");
    if (h.sc) take("sc");
  }
  if (g.pending) {
    take(g.pending.type);
    for (const c of ((g.pending.thenDeferred && g.pending.thenDeferred.cards) || [])) take(c);
  }
  if (g.flip3) for (const c of g.flip3.deferred) take(c);
  for (const seg of g.cont || []) for (const c of seg.cards) take(c);
  return counts;
}

/** Lo stesso, col mazzo Vengeance: sballa un numero che hai gia' (il secondo 13 no, col Lucky). */
function drawOddsV(g, sid) {
  const h = g.hands[sid];
  const counts = unseenCounts(g);
  let total = 0, dup = 0, gain = 0;
  const now = engine.handPoints(h);
  const st = V.scoreSteps(h);
  for (const [c, n] of Object.entries(counts)) {
    if (!n) continue;
    total += n;
    if (!V.VC.isNum(c)) continue; // azioni e modificatori non fanno sballare (e di solito si danno via)
    if (V.wouldBust(h, c)) { dup += n; continue; }
    const v = c === "u7" ? 7 - st.sum : V.VC.num(c) / (st.div ? 2 : 1);
    gain += n * (v + (st.count === 6 ? 15 : 0));
  }
  const pBust = total ? dup / total : 0;
  const safeGain = total - dup ? gain / (total - dup) : 0;
  const ev = (1 - pBust) * safeGain - pBust * now;
  return { pBust, pDup: pBust, ev, unseen: total, now, protectedBySc: false };
}

/**
 * Per una mano: probabilita' di sballare alla prossima pescata, punti attesi
 * da una pescata sicura e valore atteso del pescare (guadagno atteso meno
 * quello che si rischia di perdere). Con la Seconda Chance in mano il
 * doppione non fa sballare.
 */
export function drawOdds(g, sid) {
  if (isVg(g)) return drawOddsV(g, sid);
  const h = g.hands[sid];
  const counts = unseenCounts(g);
  let total = 0, dup = 0, gain = 0;
  const mult = h.x2 ? 2 : 1;
  const base = h.nums.reduce((a, b) => a + b, 0);
  for (const [c, n] of Object.entries(counts)) {
    if (!n) continue;
    total += n;
    if (engine.CARD.isNum(c)) {
      const v = engine.CARD.num(c);
      if (h.nums.includes(v)) { dup += n; continue; }
      gain += n * (v * mult + (h.nums.length === 6 ? 15 : 0));
    } else if (engine.CARD.isPlus(c)) gain += n * engine.CARD.plus(c);
    else if (engine.CARD.isX2(c)) gain += n * base;
  }
  const pBust = total ? (h.sc ? 0 : dup / total) : 0;
  const pDup = total ? dup / total : 0;
  const now = engine.handPoints(h);
  const safeGain = total - dup ? gain / (total - dup) : 0;
  const ev = (1 - pBust) * safeGain - pBust * now;
  return { pBust, pDup, ev, unseen: total, now, protectedBySc: Boolean(h.sc) };
}

// --- bot -----------------------------------------------------------------------
/** Il bersaglio dei bot: Congela e Pesca Tre al piu' ricco, il cuore al primo libero. */
function botTarget(g, sid) {
  if (isVg(g)) return V.botTarget(g, sid, g.pending.type, g.pending.options);
  const others = g.pending.options.filter((x) => x !== sid);
  const pool = others.length ? others : g.pending.options;
  return g.pending.type === "sc" ? pool[0]
    : pool.slice().sort((a, b) =>
        ((g.seats[b].total || 0) + engine.handPoints(g.hands[b])) -
        ((g.seats[a].total || 0) + engine.handPoints(g.hands[a])))[0];
}

/** Il bot decide: pesca o si ferma, secondo il suo livello. */
function botMove(g, sid) {
  if (g.pending && g.pending.chooser === sid) {
    // Steal / Swap / Discard: il bot tocca le carte che gli rendono di piu' (mai le passa)
    if (g.pending.kind === "use") {
      const picks = V.botPick(g, sid, g.pending.type);
      return picks ? engine.pickCards(g, sid, picks) : g;
    }
    return engine.chooseTarget(g, sid, botTarget(g, sid));
  }
  if (g.flip3 && g.flip3.target === sid) return engine.hit(g, sid);
  if (g.turn === sid && !g.hands[sid].out) {
    const h = g.hands[sid];
    if (isVg(g) && V.hasZero(h)) return engine.hit(g, sid); // con The Zero si pesca per forza
    const level = (g.seats[sid] && g.seats[sid].level) || "normale";
    const pts = engine.handPoints(h);
    let stop;
    if (level === "facile") stop = pts >= 14 || numCount(h) >= 4;
    else if (level === "contacarte") {
      const odds = drawOdds(g, sid);
      const nn = numCount(h);
      // rischia finche' conviene in media; con sette carte in vista tenta il Flip 7
      stop = nn < 7 && odds.ev <= 0 && !(nn === 6 && odds.pBust < 0.35);
    } else stop = pts >= 21 || numCount(h) >= 5;
    return stop ? engine.stay(g, sid) : engine.hit(g, sid);
  }
  return g;
}

/** Quanti numeri ha in mano (in Vengeance le carte stanno in un elenco unico). */
const numCount = (h) => (Array.isArray(h.cards) ? V.numsOf(h).length : h.nums.length);
/** La prima carta del round non e' ancora arrivata? (arriva da sola, come dal mazziere) */
const emptyHand = (h) => (Array.isArray(h.cards) ? !h.dealt : !h.nums.length && !h.plus.length && !h.x2);
/** Puo' ricevere una pescata forzata: in Vengeance anche chi si e' fermato (Flip Four / Just One More). */
const canForceDraw = (g, sid) => (isVg(g) ? V.inRound(g, sid) : !g.hands[sid].out);

/**
 * Mosse che partono da sole: quelle dei bot, le pescate del Pesca Tre
 * e la prima carta quando si e' senza carte (pescarla e' obbligato).
 */
function needsAuto(g, sid) {
  const seat = g.seats[sid];
  if (seat.bot) return true;
  if (g.flip3 && g.flip3.target === sid && canForceDraw(g, sid)) return true;
  return !g.pending && !g.flip3 && g.turn === sid && !g.hands[sid].out && emptyHand(g.hands[sid]);
}

// ritmo della pescata: la carta atterra in mano dopo circa 1,2 secondi,
// le mosse automatiche partono subito dopo (cosi' il gioco scorre senza pause)
const DRAW_MS = 1200;
const AUTO_MS = 1300;

/** Le esegue (con una piccola pausa) il dispositivo che controlla quel posto. */
function scheduleAuto(g, ctx) {
  if (!g || g.status !== "playing" || botTimer) return;
  const actor = actorOf(g);
  const seat = actor && g.seats[actor];
  if (!seat || seat.uid !== ctx.status.uid || !needsAuto(g, actor)) return;
  botTimer = setTimeout(() => {
    botTimer = null;
    const g2 = current();
    if (!g2 || g2.status !== "playing") return;
    const a2 = actorOf(g2);
    const s2 = a2 && g2.seats[a2];
    if (!s2 || s2.uid !== store.getStatus().uid || !needsAuto(g2, a2)) return;
    const next = s2.bot ? botMove(g2, a2) : engine.hit(g2, a2);
    if (next !== g2) store.commitGame(next).catch(() => {});
    // mossa a vuoto (stato incoerente?): meglio ritentare che restare fermi
    else setTimeout(() => scheduleAuto(current(), { room: store.getRoom(), status: store.getStatus(), me: null }), 2500);
  }, AUTO_MS);
}

// --- battito, orologio e avvisi ----------------------------------------------
// un timer solo: ogni pochi secondi ridisegna (contatori di attesa, pallini
// di presenza, reazioni che svaniscono) e lascia il battito di presenza
let tickTimer = null;
function keepTicking(g, ctx) {
  const wanted = Boolean(g && g.status !== "over" && (mySeat(g, ctx) || g.status === "playing"));
  if (!wanted) { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } return; }
  if (g && mySeat(g, ctx)) store.touchTable(g.id);
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    const now = current();
    if (!now || now.status === "over") { clearInterval(tickTimer); tickTimer = null; return; }
    const c = { room: store.getRoom(), status: store.getStatus(), me: null };
    if (mySeat(now, c)) store.touchTable(now.id);
    store.refresh();
  }, 5000);
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const g = current();
    if (g) store.touchTable(g.id, 0);
    store.refresh();
  });
}

// "tocca a te" si avvisa una volta per turno: si guarda il passaggio da
// "non tocca a me" a "tocca a me", cosi' la prima carta automatica non
// suona due volte
let wasMyTurn = null;
let lastAlertKey = null;
function alertOnChanges(g, ctx) {
  const me = mySeat(g, ctx);
  if (!me) { wasMyTurn = null; return; }
  const actor = g.status === "playing" ? actorOf(g) : null;
  const hold = flightHold(g);
  const myTurn = Boolean(actor && mine(g, ctx, actor) && !(hold && hold !== actor));
  const first = wasMyTurn === null;
  if (myTurn && wasMyTurn === false) {
    const what = g.pending && g.pending.chooser === actor ? `hai pescato ${metaOf(g.pending.type).name}: ${g.pending.kind === "use" ? "tocca le carte" : "scegli il bersaglio"}`
      : g.flip3 && g.flip3.target === actor ? (g.flip3.jom ? "Just One More: l'ultima carta arriva" : isVg(g) ? "Flip Four: le carte arrivano" : "Pesca Tre: le carte arrivano") : "pesca o fermati";
    alertUser("turn", "Tocca a te!", `${g.owner && g.owner.name ? `Tavolo di ${g.owner.name} · ` : ""}${what}`, { tag: "flip7-turn" });
  }
  wasMyTurn = myTurn;
  if (first) return; // il primo disegno fotografa e basta
  // fine round / fine partita: solo la notifica, se l'app e' in secondo piano
  const key = `${g.status}:${g.round}`;
  if (key === lastAlertKey) return;
  lastAlertKey = key;
  if (g.status === "over") {
    const w = winnerOf(g);
    alertUser("over", "Partita finita", `Vince ${g.seats[w] ? g.seats[w].name : "?"} con ${g.seats[w] ? g.seats[w].total || 0 : 0} punti`, { tag: "flip7-over" });
  } else if (g.status === "roundEnd") {
    pushLocal(`Round ${g.round} chiuso`, "Apri il prossimo quando vuoi", { tag: "flip7-round" });
  }
}

/** Una carta in mano o nel banco. `key` la identifica nel ridisegno
    incrementale, cosi' la stessa carta resta lo stesso elemento. */
function miniCard(c, cls = "mini", key = "", sid = "", extra = "") {
  const attrs = (key ? `data-key="${key}"${sid ? ` data-flip="card:${sid}:${key}"` : ""}` : "") + (extra ? " " + extra : "");
  if (V.isVCard(c)) return vCard(c, { on: true, size: cls, attrs });
  if (engine.CARD.isNum(c)) return numberCard(engine.CARD.num(c), { on: true, size: cls, attrs });
  if (engine.CARD.isPlus(c)) return modCard(engine.CARD.plus(c), { on: true, size: cls, attrs });
  if (engine.CARD.isX2(c)) return modCard("x2", { on: true, size: cls, attrs });
  // azioni a colpo d'occhio: cuore, fiocco di neve, tre carte
  if (c === "sc") return `<span class="fcard sc on ${cls}" ${attrs}><i class="acard">${icon("heartFill")}</i></span>`;
  if (c === "frz") return `<span class="fcard frz on ${cls}" ${attrs}><i class="acard">${icon("snow")}</i></span>`;
  return `<span class="fcard f3 on ${cls}" ${attrs}><i class="acard">${icon("cardFan")}</i></span>`;
}

// --- animazione della pescata ------------------------------------------------
// La carta parte dal mazzo, si gira accanto (dorso -> faccia) e vola nella
// mano di chi l'ha presa. E' un elemento temporaneo sopra la pagina, cosi'
// sopravvive ai ridisegni del tavolo. Nel frattempo il suo posto in fila e'
// gia' riservato da un segnaposto tratteggiato della stessa taglia: niente
// righe che si allargano di scatto all'atterraggio.
let lastAnimKey = null;
// pescata in volo: il render disegna la carta appena presa come segnaposto
let landingActive = false;
let landingToken = 0;
// niente spoiler: gli indizi dello sballo (chip, nota del doppione, riga
// spenta) restano nascosti finche' la carta pescata non si e' girata
let spoilerHold = false;
// carta azione in volo dal banco verso il bersaglio: quel posto la tiene
// come segnaposto finche' non atterra
let resolveTargetSid = null;

/** Mentre la pescata e' in volo il turno mostrato resta su chi ha pescato:
    se chip e comandi passassero subito al prossimo, la carta in volo
    sembrerebbe di un'altra persona. Ad atterraggio avvenuto un re-render
    (chiamato da openLanding) fa comparire il turno vero. */
const flightHold = (g) => {
  if (g.status !== "playing") return null;
  if (landingActive && g.lastDraw && g.seats[g.lastDraw.seat]) return g.lastDraw.seat;
  if (moveHold && g.lastMove && g.seats[g.lastMove.by]) return g.lastMove.by;
  return null;
};

const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function scheduleDrawAnim(g) {
  const key = g.lastDraw ? `${g.lastDraw.seat}:${g.lastDraw.card}:${g.deck.length}` : "nessuna";
  // il primo render fotografa lo stato e basta: mai rigiocare una pescata vecchia
  if (lastAnimKey === null) { lastAnimKey = key; return; }
  if (key === lastAnimKey || !g.lastDraw) return;
  lastAnimKey = key;
  if (reducedMotion()) { announceDraw(); return; }
  const card = g.lastDraw.card;
  landingActive = true;
  spoilerHold = true;
  const token = ++landingToken;
  deferFrame(() => runDrawAnim(card, token));
}

// --- verdetti in grande ------------------------------------------------------
/** Pannello a centro schermo per le notizie che cambiano il round: compare
    nell'istante in cui la carta si gira, resta un attimo e svanisce da solo. */
function flashBanner(kind, title, sub) {
  document.querySelectorAll(".flash-banner").forEach((el) => el.remove());
  const el = document.createElement("div");
  el.className = `flash-banner fb-${kind}`;
  const ico = { bust: "bomb", flip7: "seven", saved: "heartFill", zero: "target", unlucky: "skull", lucky: "clover", steal: "steal", swap: "swap", discard: "discard" }[kind] || "star";
  el.innerHTML = `<span class="fb-ico">${icon(ico)}</span>
    <div class="fb-txt"><b>${title}</b><small>${sub}</small></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("gone"), 1500);
  setTimeout(() => el.remove(), 1900);
}

/** Sballo, Seconda Chance bruciata o FLIP 7: da urlare, non da cercare nella riga. */
function announceDraw() {
  const g = current();
  const last = g && g.lastDraw;
  if (!last || !g.seats[last.seat]) return;
  if (isVg(g)) return announceDrawV(g, last);
  if (!engine.CARD.isNum(last.card)) return;
  const h = g.hands[last.seat];
  const n = engine.CARD.num(last.card);
  const name = esc(shortName(g.seats[last.seat]));
  if (h && h.out === "bust" && h.bustCard === n) {
    flashBanner("bust", "SBALLATO", `${name} pesca un doppio ${n}: il round vale 0`);
  } else if (last.saved) {
    flashBanner("saved", "Seconda Chance bruciata", `doppio ${n}: ${name} è salvo, ma la protezione se n'è andata`);
  } else if (h && h.out === "flip7" && h.nums.includes(n)) {
    flashBanner("flip7", "FLIP 7!", `${name} ha sette numeri diversi: +15 e round chiuso per tutti`);
  }
}

/** Vengeance: sballo, Unlucky 7, The Zero, Lucky 13 e FLIP 7 nell'istante in cui la carta si gira. */
function announceDrawV(g, last) {
  const h = g.hands[last.seat];
  const c = last.card;
  const name = esc(shortName(g.seats[last.seat]));
  if (h && h.out === "bust" && h.bustCard === c) flashBanner("bust", "SBALLATO", `${name} pesca un altro ${V.cardLabel(c)}: il round vale 0`);
  else if (c === "u7") flashBanner("unlucky", "UNLUCKY 7", `${name} butta via tutte le carte: gli resta solo il 7`);
  else if (c === "z0") flashBanner("zero", "THE ZERO", `${name} vale 0 finché non fa Flip 7, e deve pescare per forza`);
  else if (h && h.out === "flip7" && V.VC.isNum(c)) flashBanner("flip7", "FLIP 7!", `${name} ha sette numeri: +15 e round chiuso per tutti`);
  else if (c === "l13") flashBanner("lucky", "LUCKY 13", `${name} può tenere un secondo 13 senza sballare`);
}

/** Vengeance: la carta rubata, lo scambio, lo scarto o l'Unlucky 7 ricevuto, quando la carta atterra. */
function announceMove(g) {
  const m = g && g.lastMove;
  if (!m || !m.moves || !m.moves.length || m.type === "unlucky") return;
  const nm = (sid) => (g.seats[sid] ? esc(shortName(g.seats[sid])) : "?");
  const lab = (c) => V.cardLabel(c);
  const busted = g.order.filter((sid) => g.hands[sid].out === "bust" && m.moves.some((mv) => mv.to === sid && g.hands[sid].bustCard === mv.card));
  const flipped = g.order.filter((sid) => g.hands[sid].out === "flip7" && m.moves.some((mv) => mv.to === sid));
  if (busted.length) flashBanner("bust", busted.length > 1 ? "SBALLANO IN DUE" : "SBALLATO", `${busted.map(nm).join(" e ")}: doppione arrivato con ${m.type === "swap" ? "lo Swap" : "la Steal"}, il round vale 0`);
  else if (m.wipe) flashBanner("unlucky", "UNLUCKY 7", `${nm(m.wipe.seat)} riceve l'Unlucky 7 e butta via tutto`);
  else if (flipped.length) flashBanner("flip7", "FLIP 7!", `${flipped.map(nm).join(" e ")}: settimo numero, +15 e round chiuso`);
  else if (m.type === "steal") flashBanner("steal", "RUBATA", `${nm(m.by)} ruba il ${lab(m.moves[0].card)} a ${nm(m.moves[0].from)}`);
  else if (m.type === "swap") flashBanner("swap", "SCAMBIO", `il ${lab(m.moves[0].card)} di ${nm(m.moves[0].from)} per il ${lab(m.moves[1].card)} di ${nm(m.moves[1].from)}`);
  else if (m.type === "discard") flashBanner("discard", "SCARTATA", m.moves[0].from === m.by ? `${nm(m.by)} scarta il suo ${lab(m.moves[0].card)}` : `${nm(m.by)} fa scartare il ${lab(m.moves[0].card)} a ${nm(m.moves[0].from)}`);
}

/** requestAnimationFrame non scatta a pagina nascosta: fallback su timer,
    cosi' animazioni e pulizie non restano appese in background. */
const deferFrame = (fn) => (document.hidden ? setTimeout(fn, 0) : requestAnimationFrame(fn));

function revealSpoilers() {
  spoilerHold = false;
  document.querySelectorAll(".spoiler-veil").forEach((el) => el.classList.remove("spoiler-veil"));
  document.querySelectorAll(".seat.spoiler-hold").forEach((el) => el.classList.remove("spoiler-hold"));
  // la Seconda Chance appena spesa si spegne nell'istante del verdetto
  document.querySelectorAll(".fcard.spoiler-burn").forEach((el) => el.classList.add("burned"));
}

/** Il segnaposto diventa la carta vera (senza ridisegnare: e' solo una classe). */
function openLanding(token) {
  if (token !== landingToken) return; // e' gia' partita un'altra pescata
  landingActive = false;
  document.querySelectorAll(".t-seats .fcard.landing.dl").forEach((el) => el.classList.remove("landing", "dl"));
}

function runDrawAnim(card, token) {
  let done = false;
  // ridisegno vero (chip e comandi al prossimo) solo a volo concluso
  const settle = () => { openLanding(token); store.refresh(); };
  const slot = document.querySelector(".bank .bank-slot .fcard");
  const deckEl = document.querySelector(".deck-stack .fcard");
  if (!slot || !deckEl) return settle();
  const a = slot.getBoundingClientRect();
  const m = deckEl.getBoundingClientRect();
  if (!a.width) return settle();
  // la destinazione e' il segnaposto gia' aperto nella mano: si misura e basta
  const dest = document.querySelector(".t-seats .fcard.landing.dl") || document.querySelector(".t-seats .fcard.fly-dest");
  const b = dest ? dest.getBoundingClientRect() : null;

  // parte DAL mazzo, di dorso: una carta sola che ruota fino a 90 gradi,
  // cambia contenuto quando e' di taglio e completa il giro con la faccia
  // (niente trucchi backface: cosi' il numero non si vede mai specchiato)
  const fly = document.createElement("div");
  fly.className = "fly-card";
  fly.style.cssText = `position:fixed;left:${m.left}px;top:${m.top}px;width:${a.width}px;height:${a.height}px;z-index:60;pointer-events:none;perspective:700px;will-change:transform;`;
  fly.innerHTML = `<div class="fly-inner" style="width:100%;height:100%;will-change:transform;">${cardBack()}</div>`;
  document.body.appendChild(fly);
  const inner = fly.firstElementChild;

  const toSlot = `translate(${a.left - m.left}px,${a.top - m.top}px)`;
  // 1) scivola dal mazzo alla zona di destra, ancora coperta
  fly.animate([{ transform: "translate(0,0)" }, { transform: toSlot }],
    { duration: 280, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
  // 2) il giro comincia mentre sta ancora planando: prima meta' di dorso...
  inner.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg)" }],
    { duration: 200, delay: 150, easing: "ease-in", fill: "forwards" });
  setTimeout(() => {
    // ...di taglio si scambia il contenuto, poi si finisce il giro di faccia
    inner.innerHTML = miniCard(card, "drawn");
    revealSpoilers();
    if (token === landingToken) announceDraw(); // sballo, vita persa o flip 7: subito
    inner.animate([{ transform: "rotateY(-90deg)" }, { transform: "rotateY(0deg)" }],
      { duration: 200, easing: "ease-out", fill: "forwards" });
  }, 350);

  const finish = () => {
    if (done) return;
    done = true;
    // prima compare la carta vera sotto quella in volo, poi la volante sparisce:
    // cosi' il passaggio non lascia mai un buco ne' un doppione
    openLanding(token);
    deferFrame(() => fly.remove());
    revealSpoilers();
    store.refresh();
  };
  const gNow = current();
  const parkHere = gNow && gNow.pending && gNow.pending.type === card;
  if (parkHere) {
    // carta azione da assegnare: resta parcheggiata a destra finche'
    // non si sceglie il bersaglio (la copia di markup prende il suo posto)
    setTimeout(() => {
      if (done) return;
      done = true;
      document.querySelectorAll(".bank .fcard.veil").forEach((el) => el.classList.remove("veil"));
      deferFrame(() => fly.remove());
      if (token === landingToken) landingActive = false;
      store.refresh(); // la carta azione e' parcheggiata: si vede chi deve scegliere
    }, 650);
    return;
  }
  if (b) {
    // 3) e vola nella mano di chi l'ha pescata, esattamente sul segnaposto
    fly.animate([
      { transform: `${toSlot} scale(1)` },
      { transform: `translate(${b.left - m.left}px,${b.top - m.top}px) scale(${b.width / a.width})` }
    ], { duration: 340, delay: DRAW_MS - 340, easing: "cubic-bezier(.3,.6,.25,1)", fill: "forwards" }).onfinish = finish;
  } else {
    // nessuna destinazione (es. azione risolta al volo): la carta svanisce li'
    fly.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: 260, delay: DRAW_MS - 340, fill: "forwards" }).onfinish = finish;
  }
  // rete di sicurezza: mai lasciare in giro carte volanti o segnaposti
  setTimeout(finish, DRAW_MS + 300);
}

// quando il bersaglio viene scelto, la carta parcheggiata a destra completa
// il volo verso il tavolo del bersaglio
let parkedCard = null;

function checkPendingFlight(g) {
  if (g.status === "lobby") { parkedCard = null; return; }
  if (g.pending) { parkedCard = g.pending.type; return; }
  if (!parkedCard) return;
  const card = parkedCard;
  parkedCard = null;
  if (reducedMotion()) return;
  const target = g.lastAction && g.lastAction.type === card ? g.lastAction.target : null;
  const token = ++landingToken;
  resolveTargetSid = target; // il render tiene come segnaposto la carta ricevuta
  deferFrame(() => { runResolveFly(card, token, target); });
}

function runResolveFly(card, token, targetSid) {
  let done = false;
  const open = () => {
    if (token !== landingToken) return;
    resolveTargetSid = null;
    document.querySelectorAll(".t-seats .fcard.landing.rl").forEach((el) => el.classList.remove("landing", "rl"));
  };
  const settle = () => { open(); store.refresh(); };
  const slot = document.querySelector(".bank .bank-slot .fcard");
  if (!slot) return settle();
  const a = slot.getBoundingClientRect();
  if (!a.width) return settle();

  let dest = null, landingDest = false;
  if (targetSid) {
    const row = document.querySelector(`.seat[data-sid="${targetSid}"]`);
    if (row) {
      dest = row.querySelector(".fcard.landing.rl");
      landingDest = Boolean(dest);
      if (!dest) dest = row;
    }
  }
  const fly = document.createElement("div");
  fly.className = "fly-card";
  fly.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:60;pointer-events:none;will-change:transform;`;
  fly.innerHTML = miniCard(card, "drawn");
  document.body.appendChild(fly);

  const finish = () => {
    if (done) return;
    done = true;
    open();
    deferFrame(() => fly.remove());
    store.refresh();
  };
  if (dest) {
    let b;
    if (landingDest) b = dest.getBoundingClientRect();
    else {
      const r = dest.getBoundingClientRect();
      b = { left: r.left + 10, top: r.top + r.height / 2 - a.height / 2, width: a.width };
    }
    fly.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width})`, opacity: landingDest ? 1 : 0 }
    ], { duration: 420, easing: "cubic-bezier(.3,.6,.25,1)", fill: "forwards" }).onfinish = finish;
  } else {
    fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = finish;
  }
  setTimeout(finish, 800);
}

// --- carte che cambiano fila (Vengeance) -------------------------------------
// Steal, Swap, Discard e l'Unlucky 7 spostano carte gia' in vista. La carta
// parte dalla fila dov'era, vola in quella nuova (o verso il mazzo, se e'
// scartata) e solo allora la fila di arrivo la mostra per davvero. Finche'
// vola, la fila di partenza tiene il suo posto (prima la carta vera, poi un
// segnaposto invisibile che si chiude piano) e quella di arrivo un
// segnaposto tratteggiato: niente scatti, e si vede DA DOVE e' arrivata.
let lastMoveKey = null;
let moveHold = null; // { moves, wipe, rects, token, started, by }
let moveToken = 0;

function scheduleMoveAnim(g) {
  const m = g.lastMove;
  // la chiave e' l'istante scritto dal motore nella mossa: un voto o un blocco
  // riscrivono il tavolo (updatedAt cambia) ma non devono rigiocare il volo
  const key = m && m.moves && m.moves.length ? `${m.at || 0}:${m.type}:${m.by}` : "nessuna";
  if (lastMoveKey === null) { lastMoveKey = key; return; } // il primo render fotografa e basta
  if (key === lastMoveKey) return;
  lastMoveKey = key;
  if (key === "nessuna") return;
  if (reducedMotion()) { announceMove(g); return; }
  // da dove partono: si misura ADESSO, sul tavolo com'era prima della mossa
  const rects = new Map();
  const wipeMoves = m.wipe ? m.wipe.cards.map((card) => ({ card, from: m.wipe.seat, to: null })) : [];
  for (const mv of [...m.moves, ...wipeMoves]) {
    if (!mv.from) continue;
    const el = document.querySelector(`.seat[data-sid="${mv.from}"] .cards-row .fcard[data-key="${mv.card}"]`);
    if (el) rects.set(mv.from + ":" + mv.card, el.getBoundingClientRect());
  }
  const token = ++moveToken;
  moveHold = { moves: m.moves, wipe: m.wipe || null, rects, token, started: false, by: m.by };
  // lo sballo (o il Flip 7) portato da una carta rubata resta segreto finche' non atterra
  if (m.moves.some((mv) => mv.to && g.hands[mv.to] && (g.hands[mv.to].out === "bust" || g.hands[mv.to].out === "flip7"))) spoilerHold = true;
  // se nello stesso colpo vola ancora la pescata (l'Unlucky 7 appena girato) o la
  // carta azione parcheggiata, la carta deve prima atterrare: si parte dopo
  const delay = landingActive ? DRAW_MS + 60 : 220;
  deferFrame(() => setTimeout(() => runMoveAnim(token), delay));
}

function runMoveAnim(token) {
  const hold = moveHold;
  if (!hold || hold.token !== token) return;
  const flies = [];
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (moveHold === hold) {
      // prima la fila di arrivo mostra le carte vere, poi i segnaposti di partenza si chiudono
      document.querySelectorAll(".t-seats .fcard.landing.ml").forEach((el) => el.classList.remove("landing", "ml"));
      document.querySelectorAll(".t-seats .fcard.ghost").forEach((el) => el.classList.add("gone"));
      moveHold = null;
      revealSpoilers();
      announceMove(current());
      setTimeout(() => store.refresh(), 230);
    }
    for (const f of flies) deferFrame(() => f.remove());
  };
  hold.started = true;
  // le carte di partenza diventano segnaposti invisibili: al loro posto vola la copia
  document.querySelectorAll(".t-seats .fcard.leaving").forEach((el) => el.classList.add("ghost"));
  const deckEl = document.querySelector(".deck-stack .fcard");
  const wipeMoves = hold.wipe ? hold.wipe.cards.map((card, i) => ({ card, from: hold.wipe.seat, to: null, i })) : [];
  const all = [...hold.moves.map((mv) => ({ ...mv, i: 0 })), ...wipeMoves];
  let maxEnd = 0;
  for (const mv of all) {
    const a = mv.from ? hold.rects.get(mv.from + ":" + mv.card) : null;
    if (!a || !a.width) continue; // partenza non in vista: la fila si aggiorna e basta
    let b = null, fade = false;
    if (mv.to) {
      const dest = document.querySelector(`.seat[data-sid="${mv.to}"] .cards-row .fcard.landing.ml`);
      if (dest) b = dest.getBoundingClientRect();
    }
    if (!b) {
      // verso gli scarti: plana sul mazzo e svanisce
      const d = deckEl ? deckEl.getBoundingClientRect() : null;
      b = d ? { left: d.left, top: d.top, width: d.width } : { left: a.left, top: a.top - 40, width: a.width * 0.8 };
      fade = true;
    }
    const fly = document.createElement("div");
    fly.className = "fly-card";
    fly.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:60;pointer-events:none;will-change:transform;`;
    fly.innerHTML = miniCard(mv.card, "drawn");
    document.body.appendChild(fly);
    flies.push(fly);
    const dx = b.left - a.left, dy = b.top - a.top, sc = b.width / a.width;
    const delay = mv.i * 70;
    const dur = 460;
    maxEnd = Math.max(maxEnd, delay + dur);
    // un piccolo arco: la carta si alza, poi plana sul posto nuovo
    fly.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      { transform: `translate(${dx / 2}px,${dy / 2 - 28}px) scale(${(1 + sc) / 2 + 0.08})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: fade ? 0 : 1, offset: 1 }
    ], { duration: dur, delay, easing: "cubic-bezier(.3,.6,.25,1)", fill: "forwards" });
  }
  setTimeout(finish, (maxEnd || 200) + 30);
}

// --- intro / elenco tavoli / lobby -------------------------------------------
function renderIntro(ctx) {
  return `
    <section class="card empty-state">
      ${fanArt()}
      <h2 class="empty-title">Tavolo online</h2>
      <p class="muted">Qui si gioca a Flip 7 per davvero, ognuno dal suo telefono:
        pesca o fermati, con sballi, Congela, Pesca Tre e Seconda Chance.
        Chi vince prende la Crown come nelle partite dal vivo.</p>
      <p class="muted small">Novità in prova: il mazzo <b>With a Vengeance</b> (Steal, Swap, Discard, Flip Four, ÷2 e negativi). Si sceglie all'apertura del tavolo; in beta non entra nello storico.</p>
      <button class="btn primary big" data-action="tbl-open">Apri un tavolo</button>
      <p class="hint">Il tavolo lo chiude chi l'ha aperto: gli altri, se vogliono, ne aprono uno loro.</p>
    </section>`;
}

/** In una riga: a che punto e' quel tavolo. */
function tableState(g) {
  if (g.status === "lobby") return "in attesa di giocatori";
  if (g.status === "over") return "partita finita";
  if (isPlayoff(g)) return g.status === "roundEnd" ? "spareggio in arrivo" : `spareggio, round ${g.round}`;
  if (g.status === "roundEnd") return `round ${g.round} chiuso`;
  return `round ${g.round} in corso`;
}

/**
 * L'elenco dei tavoli aperti: si entra in quello che si vuole, oppure se ne
 * apre un altro. Serve da quando il tavolo lo chiude solo chi l'ha aperto:
 * nessuno resta fuori ad aspettare che si liberi.
 */
function renderTables(list, ctx) {
  return `
    <section class="card">
      <div class="card-head">${icon("cardFan")}<span class="card-title">Tavoli aperti</span>
        <span class="count-pill ml-auto">${list.length}</span></div>
      <ul class="table-list">
        ${list.map((g) => {
          const seats = g.order.map((sid) => g.seats[sid]);
          const meIn = Boolean(mySeat(g, ctx));
          const busy = !meIn && list.some((t) => t.id !== g.id && mySeat(t, ctx));
          const go = meIn ? "sei qui" : g.status === "lobby" && !busy ? "siediti" : "guarda";
          const on = onlineSeats(g, ctx).length;
          return `
          <li>
            <button class="tl-row" data-action="tbl-watch" data-id="${g.id}">
              <span class="tl-avas">${seats.slice(0, 4).map((seat) => avatar(seat.playerId, seat.name, "xs")).join("")}
                ${seats.length > 4 ? `<i class="tl-more">+${seats.length - 4}</i>` : ""}</span>
              <span class="tl-txt">
                <b>${g.owner && g.owner.name ? `Tavolo di ${esc(g.owner.name)}` : "Tavolo aperto"}${isVg(g) ? ` <span class="tag beta">Vengeance</span>` : ""}</b>
                <small>${seats.length} ${seats.length === 1 ? "seduto" : "seduti"}${on ? ` · <i class="dot-on"></i>${on} ${on === 1 ? "collegato" : "collegati"}` : ""} · ${tableState(g)} · traguardo ${g.target}</small>
              </span>
              <span class="tl-go ${meIn ? "here" : ""}">${go}${icon("arrowLeft", "flip tiny")}</span>
            </button>
          </li>`;
        }).join("")}
      </ul>
      <button class="btn primary big" data-action="tbl-open">Apri un altro tavolo</button>
      <p class="hint">Ogni tavolo lo chiude chi l'ha aperto: se quello che c'è non fa per te, aprine uno tuo.</p>
    </section>`;
}

/** La riga sopra al tavolo quando ce n'è più di uno: dove sono e come si torna indietro. */
function tableBar(g, list) {
  return `
    <div class="table-bar">
      <button class="ghost-btn" data-action="tbl-list">${icon("arrowLeft", "tiny")} Tavoli aperti (${list.length})</button>
      <span class="tb-name">${g.owner && g.owner.name ? `Tavolo di ${esc(g.owner.name)}` : "Tavolo aperto"}</span>
      ${isVg(g) ? modePill() : ""}
    </div>`;
}

function renderLobby(g, ctx) {
  const seated = mySeat(g, ctx);
  return `
    <section class="card">
      <div class="card-head">${icon("cardFan")}<span class="card-title">Tavolo aperto</span>${isVg(g) ? modePill() : ""}
        <span class="count-pill ml-auto">${g.order.length} ${g.order.length === 1 ? "seduto" : "seduti"}</span></div>
      <p class="muted small">Ognuno si siede dal proprio telefono. Servono almeno 2 giocatori;
        vince chi arriva per primo a <b>${g.target}</b> punti.${isVg(g) ? ` Mazzo <b>With a Vengeance</b>: The Zero, Unlucky 7, Lucky 13, ÷2 e negativi, Flip Four, Just One More, Swap, Steal e Discard. Chi si ferma non è al sicuro.` : ""}</p>
      ${isVg(g) ? betaNote() : ""}
      <div class="pgrid">
        ${g.order.map((sid) => {
          const seat = g.seats[sid];
          const on = !seat.bot && isOnline(g, seat.uid, ctx.status.uid);
          const tile = `
              <span class="pg-ava" style="--pc:${colorOf(seat.name)}">
                ${avatar(seat.playerId, seat.name, "lg")}
                <i class="pg-check">${icon(seat.bot ? "sliders" : "check", "tiny")}</i>
                ${seat.bot ? "" : `<i class="pg-presence ${on ? "on" : ""}" title="${on ? "collegato" : "non collegato"}"></i>`}
              </span>
              <span class="pg-name">${esc(seat.name)}${seat.bot ? `<small class="bot-note">${BOT_LEVELS[seat.level || "normale"].label} · tocca</small>` : ""}</span>`;
          return seat.bot
            ? `<button class="pg on" data-action="tbl-bot-menu" data-id="${sid}">${tile}</button>`
            : `<span class="pg on">${tile}</span>`;
        }).join("")}
        ${!seated || ctx.status.mode !== "firebase" ? `
          <button class="pg add" data-action="tbl-sit">
            <span class="pg-ava"><span class="avatar lg ghost">${icon("plus")}</span></span>
            <span class="pg-name muted">siediti</span>
          </button>` : ""}
      </div>
      ${seated ? `
        <button class="btn primary big" data-action="tbl-start" ${g.order.length < 2 ? "disabled" : ""}>
          ${g.order.length < 2 ? "Aspetta almeno un altro giocatore" : "Dai le carte"}
        </button>
        <button class="btn ghost small" data-action="tbl-bot">${icon("plus", "tiny")} Aggiungi un bot</button>` : `
        <p class="hint">Stai guardando: siediti per giocare, oppure apri un tavolo tuo.</p>`}
      <div class="board-links">
        ${seated ? `<button class="ghost-btn" data-action="tbl-stand">${icon("close", "tiny")} Mi alzo</button>` : ""}
        ${isVg(g) ? `<button class="ghost-btn" data-action="tbl-vrules">${icon("eye", "tiny")} Regole in breve</button>` : ""}
        <button class="ghost-btn" data-action="tbl-list">${icon("cardFan", "tiny")} Tavoli aperti</button>
        ${isTableOwner(g, ctx) ? `<button class="ghost-btn danger" data-action="tbl-close">Chiudi il tavolo</button>` : ""}
      </div>
    </section>`;
}

// --- partita -----------------------------------------------------------------
/** Punti provvisori del round per un posto (0 per chi ha sballato). */
const roundPts = (g, sid) => (g.status === "playing" && g.hands[sid] && g.hands[sid].out !== "bust")
  ? engine.handPoints(g.hands[sid]) : 0;
/** Il fondo scala della corsa: il traguardo, o di piu' se qualcuno l'ha superato. */
const raceMax = (g) => Math.max(g.target, ...g.order.map((sid) => (g.seats[sid].total || 0) + roundPts(g, sid)));

/**
 * La corsa al traguardo (solo su desktop, nella colonna di sinistra): una
 * barra per giocatore, ordinata dal primo all'ultimo. Barra piena = punti
 * incassati, coda chiara = bottino provvisorio del round in corso.
 */
function raceBoard(g, me) {
  const banked = (sid) => g.seats[sid].total || 0;
  const sorted = [...g.order].sort((a, b) => (banked(b) + roundPts(g, b)) - (banked(a) + roundPts(g, a)));
  const max = raceMax(g);
  return `
    <div class="race">
      <div class="race-head"><span>La corsa</span><span>traguardo ${g.target}</span></div>
      <p class="race-note">i punti del round in corso sono già contati</p>
      ${sorted.map((sid) => {
        const seat = g.seats[sid];
        const b = banked(sid), r = roundPts(g, sid);
        return `
        <div class="race-row ${sid === me ? "me" : ""}" title="${esc(seat.name)}" data-key="${sid}" data-flip="race:${sid}">
          ${avatar(seat.playerId, seat.name, "xs")}
          <span class="race-track">
            <i style="width:${((b / max) * 100).toFixed(1)}%${sid === me ? `; background:${colorOf(seat.name)}` : ""}"></i>
            ${r ? `<i class="prov" style="width:${((r / max) * 100).toFixed(1)}%${sid === me ? `; background:${colorOf(seat.name)}` : ""}"></i>` : ""}
          </span>
          <b>${r ? b + r : b}${r ? `<small>+${r}</small>` : ""}</b>
        </div>`;
      }).join("")}
    </div>`;
}

/** Perche' il round si e' chiuso, in una riga. */
function roundEndReason(g) {
  const f7 = g.order.find((sid) => g.hands[sid].out === "flip7");
  const buster = g.lastDraw && g.hands[g.lastDraw.seat] && g.hands[g.lastDraw.seat].out === "bust" ? g.lastDraw.seat : null;
  if (f7) return `FLIP 7 di ${shortName(g.seats[f7])}: +15 e round chiuso per tutti`;
  if (g.endReason === "deck") return "le carte sono finite: chi era in gioco incassa d'ufficio";
  if (buster) return `lo sballo di ${shortName(g.seats[buster])} chiude il giro: punti incassati`;
  if (isVg(g)) return "tutti fermi o sballati: si contano le carte rimaste in fila";
  return "tutti fermi, congelati o sballati: punti incassati";
}

/**
 * La striscia in cima: dice SEMPRE chi deve fare cosa (come la barra di
 * stato di un tavolo online), col numero del round accanto. Quando tocca a
 * te si accende. Il menu a destra raccoglie abbandono e annullamento.
 */
function statusStrip(g, ctx, me) {
  const nm = (sid) => esc(shortName(g.seats[sid]));
  let cls = "", title = "", sub = "", veil = "";
  if (g.status === "over") {
    const w = winnerOf(g);
    cls = "over";
    title = `Vince ${nm(w)}`;
    sub = g.endReason === "left"
      ? `${esc(g.endedBy || "qualcuno")} ha abbandonato: valgono i punteggi di adesso`
      : g.endReason === "blocked" ? "erano tutti bloccati: valgono i punteggi di adesso"
      : `partita finita con ${g.seats[w].total || 0} punti`;
  } else if (g.status === "roundEnd" && isPlayoff(g)) {
    // pareggio al traguardo: la partita non e' finita, si gioca una manche extra
    const tied = g.tiebreak;
    cls = "end";
    title = `Pareggio a ${g.seats[tied[0]].total || 0}`;
    sub = `spareggio fra ${tied.map(nm).join(" e ")}: gli altri restano fuori`;
    veil = spoilerHold ? " spoiler-veil" : "";
  } else if (g.status === "roundEnd") {
    const buster = g.lastDraw && g.hands[g.lastDraw.seat] && g.hands[g.lastDraw.seat].out === "bust";
    cls = "end";
    title = `Round ${g.round} chiuso`;
    const nextOpener = turnOrder(g)[0];
    sub = roundEndReason(g) + (nextOpener && g.seats[nextOpener] ? ` · poi apre ${nm(nextOpener)}` : "");
    veil = spoilerHold && buster ? " spoiler-veil" : "";
  } else {
    const actor = actorOf(g);
    const hold = flightHold(g);
    if (hold && hold !== actor) {
      cls = mine(g, ctx, hold) ? "you" : "";
      title = mine(g, ctx, hold) ? "Tocca a te" : `Tocca a ${nm(hold)}`;
      sub = "la carta sta arrivando…";
    } else if (g.pending) {
      const p = g.pending;
      const meta = metaOf(p.type);
      const isMine = mine(g, ctx, p.chooser);
      cls = isMine ? "you" : "";
      if (p.givenBy && g.seats[p.givenBy]) title = isMine ? `${nm(p.givenBy)} ti ha passato ${meta.name}` : `${nm(p.givenBy)} passa ${meta.name} a ${nm(p.chooser)}`;
      else title = isMine ? `Hai pescato ${meta.name}` : `${nm(p.chooser)} ha pescato ${meta.name}`;
      sub = isMine ? (p.type === "swp" && swapPick ? "ora tocca la seconda carta, di un altro giocatore" : meta.ask) : `${meta.doing}…`;
      veil = spoilerHold && g.lastDraw && g.lastDraw.card === p.type ? " spoiler-veil" : "";
    } else if (g.flip3) {
      const t = g.flip3.target;
      const jom = Boolean(g.flip3.jom);
      const left = jom ? "l'ultima carta" : g.flip3.left === 1 ? "ancora una carta" : `ancora ${g.flip3.left} carte`;
      cls = mine(g, ctx, t) ? "you" : "";
      title = mine(g, ctx, t) ? `Peschi ${left}` : `${nm(t)} pesca ${left}`;
      sub = jom ? "Just One More: poi si ferma" : isVg(g) ? "Flip Four: le carte arrivano da sole" : "Pesca Tre: le carte arrivano da sole";
    } else if (actor && g.seats[actor]) {
      const first = emptyHand(g.hands[actor]);
      const zero = isVg(g) && V.hasZero(g.hands[actor]);
      if (mine(g, ctx, actor)) {
        cls = "you";
        title = "Tocca a te";
        sub = first ? "la prima carta arriva da sola…" : zero ? "hai The Zero: devi pescare" : "pesca o fermati";
      } else {
        title = `Tocca a ${nm(actor)}`;
        sub = first ? "la prima carta arriva da sola…" : zero ? "ha The Zero: deve pescare" : "deve pescare o fermarsi";
        // fermo da un po': lo dice la striscia, prima ancora del riquadro del blocco
        const ms = stalledFor(g);
        if (ms >= 20e3) { sub = `fermo da ${fmtStall(ms)}`; cls = ms >= STALL_MS ? "stalled" : cls; }
      }
    }
  }
  const spoken = `${title}. ${sub}`.replace(/<[^>]+>/g, "");
  return `
    <div class="turn-strip ${cls}" data-flip="strip">
      <span class="ts-round" title="Round ${g.round}"><small>round</small>${roundCard(g.round)}</span>
      ${isPlayoff(g) ? `<span class="ts-sp" title="manche di spareggio">${icon("flag", "tiny")}</span>` : ""}
      <div class="ts-txt${veil}"><b>${title}</b><small>${sub}</small></div>
      <button class="icon-btn ts-menu" data-action="tbl-menu" aria-label="Altre opzioni">${icon("dots")}</button>
      <p class="sr-only" aria-live="polite" data-key="announce">${esc(spoken)}</p>
    </div>`;
}

/** Il banco: mazzo con le carte rimaste e la carta che si gira. */
function bankRow(g) {
  const last = g.lastDraw;
  // il doppione appena pescato ha fatto sballare: va urlato
  const bustNow = last && g.hands[last.seat] && g.hands[last.seat].out === "bust" && (isVg(g) ? g.hands[last.seat].bustCard === last.card : engine.CARD.isNum(last.card));
  const noteCls = (bustNow ? "bust-note" : last && last.saved ? "saved-note" : "") + (spoilerHold && last ? " spoiler-veil" : "");
  const note = last
    ? bustNow
      ? `${esc(shortName(g.seats[last.seat]))} pesca il <b>${engine.cardLabel(last.card)}</b> che aveva già: SBALLATO`
      : last.saved
        ? `${esc(shortName(g.seats[last.seat]))} pesca il <b>${engine.cardLabel(last.card)}</b> che aveva già: salvo, Seconda Chance bruciata`
        : `${esc(shortName(g.seats[last.seat]))} ha pescato <b>${engine.cardLabel(last.card)}</b>`
    : "qui si gira la carta pescata";
  return `
    <div class="bank" data-flip="bank">
      <div class="bank-cards">
        <span class="deck-stack" title="${g.deck.length} carte nel mazzo${g.discard.length ? `, ${g.discard.length} scartate` : ""}">${cardBack()}<b class="deck-count">${g.deck.length}</b></span>
        <span class="bank-arrow">${icon("arrowLeft", "flip")}</span>
        <span class="bank-slot">${g.pending
          ? miniCard(g.pending.type, "drawn parked" + (landingActive ? " veil" : ""))
          : `<span class="fcard slot"></span>`}</span>
      </div>
      <small class="bank-note ${noteCls}">${note}</small>
    </div>`;
}

/** La reazione fresca di un account (se c'e'), per la riga del suo posto. */
function reactionOf(g, seat) {
  if (!seat || seat.bot) return null;
  const r = (g.reactions || {})[seat.uid];
  if (!r || !STICKERS[r.s]) return null;
  const age = Date.now() - (Number(r.at) || 0);
  if (age < 0 || age > REACTION_MS) return null;
  // sparisce da sola: un ridisegno appena scaduta
  setTimeout(() => store.refresh(), REACTION_MS - age + 50);
  return r;
}

function renderSeatRow(g, sid, ctx, max, me) {
  const seat = g.seats[sid];
  const h = g.hands[sid];
  let isTurn = g.status === "playing" && !g.pending && !g.flip3 && g.turn === sid && !h.out;
  let isFlip3 = Boolean(g.flip3 && g.flip3.target === sid);
  let isChoosing = Boolean(g.pending && g.pending.chooser === sid);
  // pescata in volo: il turno mostrato resta su chi ha pescato
  const hold = flightHold(g);
  if (hold) {
    isChoosing = false;
    isFlip3 = isFlip3 && sid === hold;
    isTurn = sid === hold && !h.out && !isFlip3;
  }
  // la carta che sta volando verso QUESTO posto (se non e' parcheggiata al banco)
  const last = g.lastDraw;
  const flying = landingActive && last && last.seat === sid && !g.pending ? last.card : null;
  const flyNum = flying && engine.CARD.isNum(flying) ? engine.CARD.num(flying) : null;
  const bustFly = flyNum !== null && h.out === "bust" && h.bustCard === flyNum;
  const savedFly = flyNum !== null && Boolean(last.saved);
  // finche' la carta vola, punti e rotaia restano quelli di prima;
  // la mano interrotta da un abbandono non e' stata incassata: vale zero
  const ptsNow = h.out === "bust" || g.endReason === "left" ? 0 : engine.handPoints(h);
  const pts = flying ? pointsBefore(h, last) : ptsNow;
  // l'ultima carta pescata si riconosce anche in mano (anello scuro);
  // se era il doppione dello sballo, l'evidenza ce l'ha gia' il doppione rosso
  let just = last && last.seat === sid ? last.card : null;
  if (h.out === "bust" && just === "n" + h.bustCard) just = null;
  // il doppione annullato dalla Seconda Chance: la carta in volo atterra
  // sulla gemella gia' in mano (nessun segnaposto: non c'e' niente da svelare)
  const cls = (card) => (card === just ? (savedFly && card === flying ? "mini just fly-dest" : "mini just") : "mini");
  // lo sballo di QUESTA pescata resta segreto finche' la carta non si gira
  const bustSpoiler = spoilerHold && bustFly;
  // doppione annullato dalla Seconda Chance: la nota resta fino alla
  // prossima pescata, cosi' la vita persa non passa inosservata
  const savedHere = last && last.seat === sid && last.saved;
  const resolvedHere = resolveTargetSid === sid;
  const mc = (c, k, extra = "") => miniCard(c, extra || cls(c), k, sid);
  // la carta in volo si tiene come segnaposto IN FONDO alla fila, qualunque
  // cosa sia: la posizione non svela ne' il valore ne' il tipo di carta
  let tail = "";
  // una fila sola: prima azioni e modificatori, poi i numeri in ordine
  const specials = [];
  if (h.x2) {
    if (flying === "x2") tail = mc("x2", "x2", "mini just landing dl");
    else specials.push(mc("x2", "x2"));
  }
  const plus = h.plus.slice().sort((a, b) => a - b);
  let skipPlus = flying && engine.CARD.isPlus(flying) ? engine.CARD.plus(flying) : null;
  for (const p of plus) {
    if (skipPlus === p) { skipPlus = null; tail = mc("p" + p, "p" + p, "mini just landing dl"); continue; }
    specials.push(mc("p" + p, "p" + p));
  }
  // la Seconda Chance bruciata non sparisce: resta in mano spenta
  // ("consumata") per tutto il round. Durante il giro della carta e'
  // ancora accesa (niente spoiler), si spegne al momento del verdetto.
  if (h.sc) {
    if (flying === "sc") tail = mc("sc", "sc", "mini just landing dl");
    else specials.push(mc("sc", "sc", resolvedHere ? "mini landing rl" : cls("sc")));
  } else if (savedHere && spoilerHold) specials.push(mc("sc", "sc", "mini spoiler-burn"));
  else if (h.scUsed) specials.push(mc("sc", "sc", "mini burned"));
  // chi e' stato congelato mostra la carta Congela ricevuta
  if (h.out === "frozen") specials.push(mc("frz", "frz", resolvedHere ? "mini landing rl" : "mini"));
  const nums = [];
  for (const n of h.nums.slice().sort((a, b) => a - b)) {
    if (flyNum === n && !bustFly && !savedFly) { tail = mc("n" + n, "n" + n, "mini just landing dl"); continue; }
    nums.push(mc("n" + n, "n" + n));
  }
  // il bonus del Flip 7 compare quando la settima carta e' atterrata
  if (h.out === "flip7" && !flying) nums.push(flip7Card({ size: "mini", attrs: `data-key="f7" data-flip="card:${sid}:f7"` }));
  // il doppione che ha sballato resta in vista, marcato in rosso
  if (h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined) {
    if (bustFly) tail = mc("n" + h.bustCard, "dup", "mini dup landing dl");
    else nums.push(mc("n" + h.bustCard, "dup", "mini dup"));
  }
  if (specials.length && (nums.length || tail)) specials[specials.length - 1] = specials[specials.length - 1].replace('class="fcard', 'class="fcard gap-after');
  const cards = specials.join("") + nums.join("") + tail;
  // la carta azione sta ancora volando verso questo posto: il verdetto
  // (es. "congelato") e la riga spenta aspettano che atterri
  const outShown = h.out && !resolvedHere;
  const stalled = isStalled(g) && actorOf(g) === sid && !seat.blocked;
  const state = seat.blocked ? `<i class="seat-state s-blocked">bloccato</i>`
    : stalled ? `<i class="seat-state s-stalled">fermo da ${fmtStall(stalledFor(g))}</i>`
    : outShown ? `<i class="seat-state s-${h.out}${bustSpoiler ? " spoiler-veil" : ""}">${OUT_LABEL[h.out]}</i>`
    : isChoosing ? `<i class="seat-state s-turn">${mine(g, ctx, sid) ? "scegli tu" : "sta scegliendo"}</i>`
    : isFlip3 ? `<i class="seat-state s-flip3">pesca ancora ${g.flip3.left}</i>`
    : isTurn ? `<i class="seat-state s-turn">${mine(g, ctx, sid) ? "tocca a te" : "il suo turno"}</i>`
    : g.status === "playing" ? `<i class="seat-state s-wait">in attesa</i>` : "";
  const total = seat.total || 0;
  const color = colorOf(seat.name);
  // posizione nel giro (1 = chi apre): chi e' fuori dallo spareggio non ne ha
  const order = playingSeats(g);
  const pos = order.indexOf(sid) + 1;
  const opens = order[0] === sid && g.status !== "over";
  const benched = pos === 0;
  // presenza: il pallino accanto al nome (i bot seguono chi li ha messi)
  const on = isOnline(g, seat.uid, ctx.status.uid);
  const rx = reactionOf(g, seat);
  // chi ha congelato / tirato il Pesca Tre a questa mano, in una nota
  const byName = (x) => (g.seats[x] ? esc(shortName(g.seats[x])) : null);
  const notes = [];
  if (h.out === "frozen" && h.frozenBy && byName(h.frozenBy) && !resolvedHere) notes.push(`${icon("snow", "tiny")} da ${byName(h.frozenBy)}`);
  if (h.fl3By && h.fl3By.length && byName(h.fl3By[h.fl3By.length - 1])) notes.push(`${icon("cardFan", "tiny")} Pesca Tre da ${byName(h.fl3By[h.fl3By.length - 1])}`);
  return `
    <li class="seat ${isTurn || isFlip3 || isChoosing ? "turn" : ""} ${outShown ? "out-" + h.out : ""} ${seat.blocked ? "blocked" : ""} ${stalled ? "stalled" : ""} ${bustSpoiler ? "spoiler-hold" : ""} ${sid === me ? "me" : ""}" data-sid="${sid}" data-key="${sid}" data-flip="seat:${sid}" style="--pc:${color}">
      <div class="seat-head">
        <span class="seat-ava" title="${benched ? "fuori dal giro" : pos + "º nel giro"}">${avatar(seat.playerId, seat.name, "sm")}${benched ? "" : `<i class="seat-no ${pos === 1 ? "first" : ""}">${pos}</i>`}</span>
        <b class="seat-name">${esc(seat.name)}</b>
        ${seat.bot ? "" : `<i class="presence ${on ? "on" : "off"}" title="${on ? "collegato" : "non collegato"}"></i>`}
        ${sid === me ? `<i class="seat-you">tu</i>` : ""}
        ${opens && !seat.blocked ? `<i class="seat-opens">${g.status === "roundEnd" ? "apre il prossimo" : "apre"}</i>` : ""}
        ${state}
        <span class="seat-pts">
          <b>${total}</b>
          <small class="${h.out === "bust" && !flying ? "bust" : pts > 0 ? "up" : ""}">+${pts}</small>
          ${pts > 0 && g.status === "playing" ? `<i class="seat-tot" title="Totale se si ferma adesso">${total + pts}</i>` : ""}
        </span>
      </div>
      <span class="seat-rail" aria-hidden="true">
        <i style="width:${((total / max) * 100).toFixed(1)}%"></i>${pts ? `<i class="prov" style="width:${((pts / max) * 100).toFixed(1)}%"></i>` : ""}
      </span>
      <div class="cards-row">${cards || '<span class="hand-empty">nessuna carta in mano</span>'}${h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined
          ? `<span class="dup-note${bustSpoiler ? " spoiler-veil" : ""}">${icon("bomb", "tiny")} doppio ${h.bustCard}: il round vale 0</span>` : ""}${savedHere
          ? `<span class="dup-note saved${spoilerHold ? " spoiler-veil" : ""}">${icon("heartFill", "tiny")} doppio ${engine.CARD.num(last.card)}: salvo, Seconda Chance bruciata</span>` : ""}${notes.length
          ? `<span class="by-note">${notes.join(" · ")}</span>` : ""}</div>
      ${rx ? `<span class="reaction-bubble" data-key="rx-${rx.at}">${sticker(rx.s)}</span>` : ""}
    </li>`;
}

// ---------------------------------------------------------------------------
// With a Vengeance: la riga del posto. Stessa struttura della riga classica,
// ma le carte stanno in un elenco unico (modificatori prima, numeri poi),
// si possono TOCCARE quando hai in mano Steal / Swap / Discard, tengono il
// posto mentre volano da una fila all'altra, e sotto c'e' il conto passo
// per passo quando ci sono ÷2, negativi o The Zero.
// ---------------------------------------------------------------------------
const MARK_ICO = { fl4: "four", jom: "oneMore", stl: "steal", swp: "swap", dsc: "discard" };

/** Toccando quella carta ci si fa male? (doppione che sballa, Unlucky 7 o The Zero che arrivano a te) */
function pickWarn(g, p, sid, c) {
  const me = p.chooser;
  const hurts = (hand, card) => card === "u7" || card === "z0" || V.wouldBust(hand, card);
  if (p.type === "stl") return hurts(g.hands[me], c);
  if (p.type === "swp" && swapPick) {
    // la seconda carta va a chi ha dato la prima; la prima va a chi possiede la seconda
    const toFirst = { ...g.hands[swapPick.sid], cards: V.removeCard(g.hands[swapPick.sid].cards, swapPick.card) };
    const toSecond = { ...g.hands[sid], cards: V.removeCard(g.hands[sid].cards, c) };
    return (swapPick.sid === me && hurts(toFirst, c)) || (sid === me && hurts(toSecond, swapPick.card));
  }
  return false;
}

/** Il conto della mano in una riga: "numeri 48 · ÷2 → 24 · −4 → 20 · +15 Flip 7 · = 35". */
function calcLine(h) {
  if (h.out === "bust" || !h.cards.length) return "";
  const st = V.scoreSteps(h);
  const zero = V.hasZero(h);
  if (!st.div && !st.neg && !zero && !st.flip7) return "";
  const parts = [`<i>numeri</i> <b>${st.sum}</b>`];
  if (st.div) parts.push(`<span class="sc-div">÷2 → ${st.afterDiv}</span>`);
  if (st.neg) parts.push(`<span class="sc-neg">−${st.neg} → ${Math.max(0, st.afterNeg)}</span>`);
  if (st.floored) parts.push(`<i>mai sotto 0</i>`);
  if (zero && !st.flip7) parts.push(`<span class="sc-zero">The Zero: vale 0${h.out ? "" : ", deve pescare"}</span>`);
  if (st.flip7) parts.push(`<span class="sc-bonus">+15 Flip 7</span>`);
  parts.push(`<span class="sc-tot">= ${st.total}</span>`);
  return parts.join("<i>·</i>");
}

function renderSeatRowV(g, sid, ctx, max, me) {
  const seat = g.seats[sid];
  const h = g.hands[sid];
  let isTurn = g.status === "playing" && !g.pending && !g.flip3 && g.turn === sid && !h.out;
  let isFlip3 = Boolean(g.flip3 && g.flip3.target === sid);
  let isChoosing = Boolean(g.pending && g.pending.chooser === sid);
  const hold = flightHold(g);
  if (hold) { isChoosing = false; isFlip3 = isFlip3 && sid === hold; isTurn = sid === hold && !h.out && !isFlip3; }
  const last = g.lastDraw;
  const flying = landingActive && last && last.seat === sid && !g.pending ? last.card : null;
  const bustFly = Boolean(flying) && h.out === "bust" && h.bustCard === flying;
  // carte in arrivo o in partenza per uno spostamento in corso (Steal, Swap, Discard, Unlucky 7)
  const mh = moveHold;
  const incoming = mh ? mh.moves.filter((mv) => mv.to === sid).map((mv) => mv.card) : [];
  const leaving = mh ? [...mh.moves.filter((mv) => mv.from === sid).map((mv) => mv.card), ...(mh.wipe && mh.wipe.seat === sid ? mh.wipe.cards : [])] : [];
  const holding = Boolean(flying) || incoming.length > 0 || leaving.length > 0;
  // finche' le carte volano si vede la mano com'era prima, punti compresi
  const shown = holding ? { ...h, out: null, cards: [...h.cards.filter((c) => c !== flying && !incoming.includes(c)), ...leaving] } : h;
  const ptsNow = h.out === "bust" || g.endReason === "left" ? 0 : engine.handPoints(h);
  const pts = holding ? engine.handPoints(shown) : ptsNow;
  const verdictHidden = holding && (h.out === "bust" || h.out === "flip7");
  const bustHidden = verdictHidden && h.out === "bust";
  const resolvedHere = resolveTargetSid === sid;
  let just = last && last.seat === sid && !flying ? last.card : null;
  if (h.out === "bust" && just === h.bustCard) just = null;
  // "tocca la carta": con Steal / Swap / Discard in mano, le carte colpibili si toccano
  const p = g.pending;
  const picking = Boolean(p && p.kind === "use" && !hold && mine(g, ctx, p.chooser) && !giveOpen);
  const pickables = picking ? V.pickable(g, p.chooser, p.type, swapPick) : [];
  const canPick = (c) => pickables.some((x) => x.sid === sid && x.card === c);
  // una fila sola: prima i modificatori (÷2, poi i negativi), poi i numeri in ordine
  const order = (c) => (V.VC.isMod(c) ? (c === "d2" ? -100 : -50 + V.VC.neg(c)) : V.VC.num(c) + (c === "l13" ? -0.5 : 0));
  const list = shown.cards.slice().sort((a, b) => order(a) - order(b));
  const lastMod = list.reduce((k, c, i) => (V.VC.isMod(c) ? i : k), -1);
  let html = "";
  list.forEach((c, i) => {
    const gone = leaving.includes(c);
    let cls = "mini";
    if (i === lastMod && i < list.length - 1) cls += " gap-after";
    if (c === just && !gone) cls += " just";
    if (gone) cls += " leaving" + (mh && mh.started ? " ghost" : "");
    if (resolvedHere && !flying && g.lastAction && g.lastAction.type === c) cls += " landing rl";
    let extra = "";
    const pickable = picking && !gone && canPick(c);
    if (pickable) {
      cls += " pick" + (swapPick && swapPick.sid === sid && swapPick.card === c ? " picked" : "");
      extra = `data-action="tbl-pick" data-sid="${sid}" data-card="${c}" data-at="${g.updatedAt || 0}" role="button" tabindex="0"`;
    }
    let card = miniCard(c, cls, c, sid, extra);
    if (pickable && pickWarn(g, p, sid, c)) card = card.replace(/<\/span>$/, `<i class="pick-warn" title="così sballi, o butti tutto">${icon("bomb")}</i></span>`);
    html += card;
  });
  // in arrivo: la pescata in volo o la carta che arriva da un'altra fila, come segnaposto in coda
  if (flying && !bustFly && h.cards.includes(flying)) html += miniCard(flying, "mini just landing dl", flying, sid);
  if (bustFly) html += miniCard(flying, "mini dup landing dl", "dup", sid);
  for (const c of incoming) {
    if (h.out === "bust" && h.bustCard === c) html += miniCard(c, "mini dup landing ml", "dup", sid);
    else if (h.cards.includes(c)) html += miniCard(c, "mini landing ml", c, sid);
  }
  if (h.out === "flip7" && !holding) html += flip7Card({ size: "mini", attrs: `data-key="f7" data-flip="card:${sid}:f7"` });
  if (h.out === "bust" && h.bustCard && !bustFly && !incoming.includes(h.bustCard)) html += miniCard(h.bustCard, "mini dup", "dup", sid);
  const outShown = h.out && !resolvedHere && !verdictHidden;
  const stalled = isStalled(g) && actorOf(g) === sid && !seat.blocked;
  const zero = !h.out && V.hasZero(shown);
  const state = seat.blocked ? `<i class="seat-state s-blocked">bloccato</i>`
    : stalled ? `<i class="seat-state s-stalled">fermo da ${fmtStall(stalledFor(g))}</i>`
    : isFlip3 ? `<i class="seat-state s-flip4">${g.flip3.jom ? "ultima carta" : `pesca ancora ${g.flip3.left}`}${h.out === "stay" ? " · fermo" : ""}</i>`
    : isChoosing ? `<i class="seat-state s-turn">${mine(g, ctx, sid) ? (p.kind === "use" ? "tocca le carte" : "scegli tu") : "sta scegliendo"}</i>`
    : outShown ? `<i class="seat-state s-${h.out}${bustHidden ? " spoiler-veil" : ""}">${outLabel(g, h.out)}</i>`
    : isTurn ? `<i class="seat-state s-turn">${mine(g, ctx, sid) ? "tocca a te" : "il suo turno"}</i>`
    : g.status === "playing" ? (zero ? `<i class="seat-state s-mustdraw">deve pescare</i>` : `<i class="seat-state s-wait">in attesa</i>`) : "";
  const total = seat.total || 0;
  const color = colorOf(seat.name);
  const orderRow = playingSeats(g);
  const pos = orderRow.indexOf(sid) + 1;
  const opens = orderRow[0] === sid && g.status !== "over";
  const benched = pos === 0;
  const on = isOnline(g, seat.uid, ctx.status.uid);
  const rx = reactionOf(g, seat);
  // chi gli ha tirato cosa: le ultime due note
  const byName = (x) => (g.seats[x] ? esc(shortName(g.seats[x])) : null);
  const notes = (h.marks || []).slice(-2).filter((m) => byName(m.by)).map((m) =>
    `${icon(MARK_ICO[m.type] || "minus", "tiny")} ${V.VC.isMod(m.type) ? V.cardLabel(m.type) : metaOf(m.type).name}${m.card ? ` (${V.cardLabel(m.card)})` : ""} da ${byName(m.by)}`);
  const calc = holding ? "" : calcLine(h);
  return `
    <li class="seat ${isTurn || isFlip3 || isChoosing ? "turn" : ""} ${outShown ? "out-" + h.out : ""} ${seat.blocked ? "blocked" : ""} ${stalled ? "stalled" : ""} ${bustHidden ? "spoiler-hold" : ""} ${sid === me ? "me" : ""} ${picking && pickables.some((x) => x.sid === sid) ? "pickable" : ""}" data-sid="${sid}" data-key="${sid}" data-flip="seat:${sid}" style="--pc:${color}">
      <div class="seat-head">
        <span class="seat-ava" title="${benched ? "fuori dal giro" : pos + "º nel giro"}">${avatar(seat.playerId, seat.name, "sm")}${benched ? "" : `<i class="seat-no ${pos === 1 ? "first" : ""}">${pos}</i>`}</span>
        <b class="seat-name">${esc(seat.name)}</b>
        ${seat.bot ? "" : `<i class="presence ${on ? "on" : "off"}" title="${on ? "collegato" : "non collegato"}"></i>`}
        ${sid === me ? `<i class="seat-you">tu</i>` : ""}
        ${opens && !seat.blocked ? `<i class="seat-opens">${g.status === "roundEnd" ? "apre il prossimo" : "apre"}</i>` : ""}
        ${state}
        <span class="seat-pts">
          <b>${total}</b>
          <small class="${h.out === "bust" && !holding ? "bust" : pts > 0 ? "up" : ""}">+${pts}</small>
          ${pts > 0 && g.status === "playing" ? `<i class="seat-tot" title="Totale se il round finisse adesso">${total + pts}</i>` : ""}
        </span>
      </div>
      <span class="seat-rail" aria-hidden="true">
        <i style="width:${((total / max) * 100).toFixed(1)}%"></i>${pts ? `<i class="prov" style="width:${((pts / max) * 100).toFixed(1)}%"></i>` : ""}
      </span>
      <div class="cards-row">${html || '<span class="hand-empty">nessuna carta in fila</span>'}${h.out === "bust" && h.bustCard && !(incoming.includes(h.bustCard) || bustFly)
          ? `<span class="dup-note${bustHidden ? " spoiler-veil" : ""}">${icon("bomb", "tiny")} doppio ${V.cardLabel(h.bustCard)}: il round vale 0</span>` : ""}${notes.length
          ? `<span class="by-note">${notes.join(" · ")}</span>` : ""}</div>
      ${calc ? `<div class="seat-calc" data-key="calc">${calc}</div>` : ""}
      ${rx ? `<span class="reaction-bubble" data-key="rx-${rx.at}">${sticker(rx.s)}</span>` : ""}
    </li>`;
}

/** Il corpo del riquadro per Steal / Swap / Discard: istruzioni, la prima carta dello Swap, "passa la carta". */
function useBody(g, p) {
  const meta = metaOf(p.type);
  const nm = (sid) => esc(shortName(g.seats[sid]));
  const give = p.canGive && (p.options || []).length > 0;
  if (giveOpen && give) {
    return `
      <p class="choose-label">A chi la passi? Dovrà usarla lui, subito</p>
      <div class="pgrid">
        ${p.options.map((sid) => `
          <button class="pg" data-action="tbl-give" data-id="${sid}" data-at="${g.updatedAt || 0}">
            <span class="pg-ava" style="--pc:${colorOf(g.seats[sid].name)}">${avatar(g.seats[sid].playerId, g.seats[sid].name, "lg")}</span>
            <span class="pg-name">${esc(g.seats[sid].name)}</span>
          </button>`).join("")}
      </div>
      <button class="ghost-btn" data-action="tbl-give-open">${icon("arrowLeft", "tiny")} No, la uso io</button>`;
  }
  const hint = p.type === "stl" ? "La carta rubata entra nella tua fila: un doppione ti fa sballare, l'Unlucky 7 ti fa buttare tutto."
    : p.type === "swp" ? "Le due carte si scambiano di posto: chi riceve un doppione sballa, chi riceve l'Unlucky 7 butta tutto."
    : "La carta scartata sparisce dal round: anche un ÷2 o un negativo tuo.";
  return `
    <p class="choose-label">${meta.ask}</p>
    ${p.type === "swp" && swapPick && g.seats[swapPick.sid] ? `
      <div class="ab-pick">${miniCard(swapPick.card, "drawn")}<span>prima carta: <b>${V.cardLabel(swapPick.card)}</b> di <b>${nm(swapPick.sid)}</b> · ora la seconda, di un altro giocatore</span>
        <button class="ghost-btn" data-action="tbl-pick-cancel">annulla</button></div>` : ""}
    <p class="hint">${hint}</p>
    ${give ? `<button class="ghost-btn" data-action="tbl-give-open">${icon("share", "tiny")} Oppure passala a un altro giocatore</button>` : ""}`;
}

/** L'etichetta del mazzo Vengeance, accanto al titolo del tavolo. */
const modePill = () => `<span class="mode-pill" title="Flip 7: With a Vengeance (beta)">${vCard("m6")} Vengeance</span>`;
const betaNote = () => `<div class="beta-note"><span class="tag beta">beta</span><span>Partita di prova con il mazzo <b>With a Vengeance</b>: non entra nello storico e non vale Crown.</span></div>`;

/** Il foglio "con che mazzo?" all'apertura di un tavolo. */
function renderDeckSheet() {
  return `
    <div class="sheet-head">
      <div><div class="sheet-title">Con che mazzo?</div><div class="sheet-sub">Ogni tavolo ha il suo</div></div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>
    <div class="deck-pick">
      <button class="deck-opt" data-action="tbl-open-deck" data-mode="classic">
        ${fanArt()}<b>Flip 7</b><small>il mazzo classico: Congela, Pesca Tre, Seconda Chance. Vale per lo storico e le Crown.</small>
      </button>
      <button class="deck-opt" data-action="tbl-open-deck" data-mode="vengeance">
        <span class="fan" aria-hidden="true">${vCard("u7")}${vCard("stl")}${vCard("m6")}</span>
        <b>With a Vengeance <span class="tag beta">beta</span></b><small>Steal, Swap, Discard, Flip Four, ÷2 e negativi: nessuno è al sicuro. Partita di prova, non entra nello storico.</small>
      </button>
    </div>`;
}

/** Le regole di With a Vengeance in un foglio, carta per carta. */
function renderVRules() {
  const row = (card, title, text) => `<div class="vrule">${vCard(card)}<div><b>${title}</b><small>${text}</small></div></div>`;
  return `
    <div class="sheet-head">
      <div><div class="sheet-title">With a Vengeance</div><div class="sheet-sub">Le regole in breve · beta, non entra nello storico</div></div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>
    <div class="vrules">
      <p class="muted small">Come in Flip 7: pesca o fermati, il doppione fa sballare, sette numeri diversi fanno Flip 7 (+15 e round chiuso). Ma qui <b>chi si ferma non è al sicuro</b>: azioni e modificatori si giocano su chiunque non abbia sballato, fermi compresi. Nel mazzo c'è anche il 13 (tredici copie).</p>
      <p class="vr-title">Carte speciali: fanno effetto appena arrivano, anche rubate o scambiate</p>
      ${row("z0", "The Zero", "La mano vale 0 finché non fai Flip 7 (allora conta tutto). Finché ce l'hai devi pescare. Conta come numero per il Flip 7.")}
      ${row("u7", "Unlucky 7", "Appena arriva butti via numeri e modificatori: ti resta solo il 7. Non sballi mai ricevendolo, nemmeno con un 7 in mano; un altro 7 dopo, sì.")}
      ${row("l13", "Lucky 13", "Puoi tenere un secondo 13 senza sballare: valgono entrambi e contano per il Flip 7. Col terzo 13 sballi.")}
      <p class="vr-title">Modificatori: si danno a chi vuoi, anche a te, anche a chi è fermo</p>
      ${row("d2", "÷2", "A fine round la somma dei numeri si dimezza (per difetto), prima dei negativi.")}
      ${row("m6", "−2 … −10", "Si tolgono dalla somma. Il round non va mai sotto zero. Non fanno mai sballare e non contano per il Flip 7.")}
      <p class="vr-title">Azioni: si risolvono subito</p>
      ${row("fl4", "Flip Four", "Chi la riceve pesca quattro carte una alla volta, anche se era fermo. Azioni e modificatori pescati si risolvono in ordine DOPO, se non ha sballato. Sballo o Flip 7 fermano le pescate.")}
      ${row("jom", "Just One More", "Chi la riceve pesca un'ultima carta (se è un'azione la risolve) e poi si ferma.")}
      ${row("stl", "Steal", "Prendi una carta scoperta dalla fila di un altro e la metti nella tua: un doppione ti fa sballare, l'Unlucky 7 fa effetto su di te.")}
      ${row("swp", "Swap", "Scambi due carte scoperte di due giocatori diversi: una tua con una loro, o due degli altri. Chi riceve un doppione sballa.")}
      ${row("dsc", "Discard", "Scegli una carta scoperta di chiunque, anche tua, e si scarta.")}
      <p class="muted small">Steal, Swap e Discard le usa chi le pesca, oppure le passa a un altro che dovrà usarle lui. Senza carte da colpire si scartano. Flip Four, Just One More e i modificatori si assegnano a chi non ha sballato: se sei l'unico, a te.</p>
      <p class="vr-title">Il conto a fine round</p>
      <ol class="vr-steps"><li>somma dei numeri</li><li>÷2 se hai il ÷2 (per difetto)</li><li>meno i negativi, mai sotto zero</li><li>+15 se hai fatto Flip 7</li></ol>
      <p class="muted small">Esempio del regolamento: 3+11+5+7+10+8+4 = 48 → ÷2 = 24 → −4 = 20 → +15 = 35.</p>
    </div>`;
}

/** Riquadro bene in vista per le carte azione: chi guarda capisce al volo
    cosa sta succedendo, chi deve scegliere ha tutto lì dentro. */
function actionBox(g, type, sub, body = "") {
  const meta = metaOf(type);
  // se la carta azione e' quella che sta ancora girando accanto al mazzo,
  // il riquadro aspetta la fine del giro: niente spoiler
  const veil = spoilerHold && g.lastDraw && g.lastDraw.card === type ? " spoiler-veil" : "";
  return `
    <div class="action-box act-${meta.mod ? "mod" : type}${body ? " mine" : ""}${veil}">
      <div class="ab-head">
        <span class="ab-ico${meta.ico ? "" : " has-card"}">${meta.ico ? icon(meta.ico) : miniCard(type, "drawn")}</span>
        <div class="ab-txt"><b>${meta.name}</b><small>${sub}</small></div>
      </div>
      ${body}
    </div>`;
}

/**
 * Il riquadro del blocco: chi deve giocare non muove da un minuto. Gli altri
 * collegati votano; con tutti d'accordo il blocco scatta. Chi non e' fra i
 * votanti vede come sta andando.
 */
function stallBox(g, ctx, me) {
  if (g.status !== "playing" || !isStalled(g)) return "";
  const target = actorOf(g);
  const seat = target && g.seats[target];
  if (!seat || seat.blocked || mine(g, ctx, target)) return "";
  const required = voterUids(g, ctx, target);
  const votes = Object.keys((g.votes && g.votes[target]) || {});
  const iCan = Boolean(me) && required.includes(ctx.status.uid) && !g.seats[me].blocked;
  const iVoted = votes.includes(ctx.status.uid);
  const have = required.filter((u) => votes.includes(u)).length;
  const need = required.length;
  const done = need > 0 && have >= need;
  const on = !seat.bot && isOnline(g, seat.uid, ctx.status.uid);
  const nm = esc(shortName(seat));
  return `
    <div class="stall-box" data-key="stall">
      <div class="sb-head">
        <span class="sb-ico">${icon("clock")}</span>
        <div class="sb-txt">
          <b>${nm} non muove da ${fmtStall(stalledFor(g))}</b>
          <small>${on ? "è collegato ma fermo" : "sembra non collegato"}. ${need
            ? `Chi è al tavolo può bloccarlo di comune accordo: incassa quello che ha in mano, resta a ${(seat.total || 0) + roundPts(g, target)} punti e la partita va avanti. Se torna, rientra dal round dopo.`
            : "Nessun altro giocatore collegato per decidere."}</small>
        </div>
      </div>
      ${need ? `
      <div class="sb-votes">
        <span class="sb-count"><b>${have}</b> di ${need} d'accordo</span>
        <span class="sb-avas">${required.map((u) => {
          const sid = g.order.find((x) => g.seats[x].uid === u && !g.seats[x].bot);
          const s = sid ? g.seats[sid] : null;
          return s ? `<span class="sb-ava ${votes.includes(u) ? "yes" : ""}" title="${esc(s.name)}${votes.includes(u) ? " · d'accordo" : ""}">${avatar(s.playerId, s.name, "xs")}</span>` : "";
        }).join("")}</span>
      </div>
      ${iCan
        ? done
          ? `<button class="btn danger big" data-action="tbl-block-confirm" data-id="${target}">${icon("pause", "tiny")} Blocca ${nm} a ${(seat.total || 0) + roundPts(g, target)} e vai avanti</button>`
          : iVoted
            ? `<button class="btn ghost" data-action="tbl-unvote" data-id="${target}">Ritiro il voto · aspettiamo gli altri</button>`
            : `<button class="btn danger big" data-action="tbl-vote" data-id="${target}">${icon("pause", "tiny")} Sono d'accordo: blocca ${nm}</button>`
        : `<p class="hint">Decidono i giocatori collegati al tavolo.</p>`}` : ""}
    </div>`;
}

/** Se sono io a essere stato bloccato: la via per rientrare. */
function blockedBox(g, ctx, me) {
  if (!me || !g.seats[me] || !g.seats[me].blocked || g.status === "over") return "";
  return `
    <div class="stall-box mine" data-key="blocked">
      <div class="sb-head">
        <span class="sb-ico">${icon("pause")}</span>
        <div class="sb-txt"><b>Sei stato bloccato</b><small>Non rispondevi: gli altri sono andati avanti, tu resti a ${g.seats[me].total || 0} punti. Se vuoi tornare in gioco, rientri dal prossimo round.</small></div>
      </div>
      <button class="btn primary big" data-action="tbl-unblock">${icon("play", "tiny")} Rientro dal prossimo round</button>
    </div>`;
}

/**
 * L'allenamento c'e' solo dove ha senso: a un tavolo con almeno un bot seduto.
 * Li' la voce nel menu c'e' sempre - in lobby, a partita in corso e a partita
 * finita - cosi' chi l'ha acceso lo ritrova per spegnerlo. Fra sole persone
 * non compare proprio.
 */
export function trainingAllowed(g) {
  if (!g) return false;
  return (g.order || []).some((sid) => g.seats && g.seats[sid] && g.seats[sid].bot);
}
/** Acceso davvero: c'e' un bot, l'interruttore e' su e la partita e' in corso. */
export function trainingOn(g) {
  if (!trainingAllowed(g) || g.status === "lobby" || g.status === "over") return false;
  return prefs.get("training", false) === true;
}
/** Il rischio di sballare alla prossima carta (modalita' allenamento). */
function riskLine(g, sid) {
  if (!trainingOn(g)) return "";
  const o = drawOdds(g, sid);
  const pct = Math.round(o.pBust * 100);
  const tone = o.protectedBySc ? "safe" : pct >= 35 ? "hot" : pct >= 18 ? "warm" : "safe";
  const txt = o.protectedBySc
    ? `doppione coperto dalla Seconda Chance (${Math.round(o.pDup * 100)}% che arrivi)`
    : `rischio di sballo <b>${pct}%</b> · in media ${o.ev >= 0 ? "+" : ""}${o.ev.toFixed(1)} a pescare`;
  return `<p class="risk ${tone}" data-key="risk">${icon("target", "tiny")} ${txt} <small>· ${o.unseen} carte coperte</small></p>`;
}

/** La riga degli sticker: una reazione, sulla propria riga, per pochi secondi. */
function reactionBar(g, me) {
  if (!me || g.status === "lobby") return "";
  return `
    <div class="react-bar" data-key="react-bar" aria-label="Reazioni">
      ${Object.keys(STICKERS).map((k) => `<button class="react-btn" data-action="tbl-react" data-s="${k}" aria-label="${esc(STICKERS[k].label)}" title="${esc(STICKERS[k].label)}">${sticker(k)}</button>`).join("")}
    </div>`;
}

function renderControls(g, ctx, me) {
  if (g.status === "over") {
    return `<button class="btn primary big pulse" data-action="tbl-podium">Vai al podio ${icon("chevron", "tiny turn-r")}</button>`;
  }
  if (g.status === "roundEnd") {
    const playoff = isPlayoff(g);
    const label = playoff ? `Via allo spareggio · round ${g.round + 1} →` : `Via al round ${g.round + 1} →`;
    return blockedBox(g, ctx, me) + (me
      ? `<button class="btn go big pulse" data-action="tbl-nextround">${label}</button>
         <p class="hint">${playoff
           ? "La manche la giocano solo i pari merito: chi è fuori guarda, e si ripete finché uno resta davanti."
           : "Basta che uno lo prema: il round parte per tutti in diretta."}</p>`
      : `<p class="hint">Si aspetta che qualcuno apra ${playoff ? "lo spareggio" : `il round ${g.round + 1}`}…</p>`);
  }
  const actor = actorOf(g);
  const iAct = mine(g, ctx, actor);

  // il turno sta passando ma la carta e' ancora in volo: i comandi del
  // prossimo compaiono solo ad atterraggio avvenuto (se chi agisce e' lo
  // stesso che ha pescato, es. Pesca Tre, si continua normalmente)
  const hold = flightHold(g);
  if (hold && hold !== actor) return "";

  if (g.pending) {
    const p = g.pending;
    if (iAct && p.kind === "use") {
      const from = p.givenBy && g.seats[p.givenBy] ? `${esc(shortName(g.seats[p.givenBy]))} te l'ha passata: ora devi usarla tu` : "Hai pescato una carta azione: si usa toccando le carte qui sotto";
      return actionBox(g, p.type, from, useBody(g, p));
    }
    if (iAct) {
      return actionBox(g, p.type, metaOf(p.type).mod ? "Hai pescato un modificatore: decidi a chi va" : "Hai pescato una carta azione: decidi tu", `
        <p class="choose-label">${metaOf(p.type).ask}</p>
        <div class="pgrid">
          ${p.options.map((sid) => `
            <button class="pg" data-action="tbl-target" data-id="${sid}" data-at="${g.updatedAt || 0}">
              <span class="pg-ava ${sid === p.chooser ? "holo-ring" : ""}" style="--pc:${colorOf(g.seats[sid].name)}">
                ${avatar(g.seats[sid].playerId, g.seats[sid].name, "lg")}
              </span>
              <span class="pg-name">${sid === p.chooser ? "me stesso" : esc(g.seats[sid].name)}</span>
            </button>`).join("")}
        </div>`);
    }
    return actionBox(g, p.type, `${esc(shortName(g.seats[p.chooser]))} ${metaOf(p.type).doing}…`) + stallBox(g, ctx, me);
  }

  if (g.flip3) {
    const t = g.flip3.target;
    const jom = Boolean(g.flip3.jom);
    const left = jom ? "l'ultima carta" : g.flip3.left === 1 ? "ancora 1 carta" : `ancora ${g.flip3.left} carte`;
    const type = jom ? "jom" : isVg(g) ? "fl4" : "fl3";
    const tail = jom ? ": poi si ferma" : ": arrivano da sole…";
    return actionBox(g, type, mine(g, ctx, t)
      ? `Peschi ${left}${tail}`
      : `${esc(shortName(g.seats[t]))} pesca ${left}${tail}`) + stallBox(g, ctx, me);
  }

  if (iAct && !g.hands[actor].out && !emptyHand(g.hands[actor])) {
    // la mia carta sta ancora volando: il bottone mostra il valore di prima
    const flying = landingActive && g.lastDraw && g.lastDraw.seat === actor && !g.pending;
    const pts = flying ? pointsBefore(g.hands[actor], g.lastDraw) : engine.handPoints(g.hands[actor]);
    const zero = isVg(g) && V.hasZero(g.hands[actor]);
    return `
      <div class="table-actions">
        <button class="btn go big" data-action="tbl-hit" data-at="${g.updatedAt || 0}">Pesca</button>
        <button class="btn stop big" data-action="tbl-stay" data-at="${g.updatedAt || 0}" ${zero ? "disabled" : ""}>Mi fermo · +${pts} <i class="btn-tot">${(g.seats[actor].total || 0) + pts}</i></button>
      </div>${zero ? `<p class="hint">Hai <b>The Zero</b>: la mano vale 0 finché non fai Flip 7, e non puoi fermarti.</p>` : flying ? "" : riskLine(g, actor)}`;
  }
  // fuori dallo spareggio: niente comandi, si guarda e basta
  if (me && g.seats[me] && g.seats[me].blocked) return blockedBox(g, ctx, me) + stallBox(g, ctx, me);
  if (me && g.hands[me] && g.hands[me].out === "excluded") {
    return `<p class="hint">Sei fuori dallo spareggio: la manche la giocano i pari merito.</p>` + stallBox(g, ctx, me);
  }
  if (!me) return `<p class="hint">Stai guardando la partita.</p>` + stallBox(g, ctx, me);
  return stallBox(g, ctx, me);
}

/**
 * L'ordine del giro da mostrare. A round chiuso e' gia' quello del prossimo
 * (chi apriva passa in coda): la lista si riordina quando la mano finisce e
 * si vede subito chi aprira'.
 */
const turnOrder = (g) => (g.status === "roundEnd" && g.order.length > 1 ? [...g.order.slice(1), g.order[0]] : g.order);

/**
 * Chi gioca la mano in vista: tutti, oppure i soli pari merito quando e' in
 * corso (o sta per cominciare) una manche di SPAREGGIO. Gli altri restano
 * seduti a guardare, senza carte e senza punti. Chi e' bloccato sta fuori.
 */
const playingSeats = (g) => {
  const only = (g.tiebreak || []).length ? new Set(g.tiebreak) : null;
  return turnOrder(g).filter((sid) => (!only || only.has(sid)) && !(g.seats[sid] && g.seats[sid].blocked));
};
/** true se la mano in vista e' una manche di spareggio. */
const isPlayoff = (g) => Boolean((g.tiebreak || []).length) && g.status !== "over";

/**
 * L'ordine delle righe: FERMO per tutto il round. In cima chi apre la mano,
 * sotto chi viene dopo nel giro, e li' restano fino alla fine del round -
 * le facce non si rincorrono su e giu' a ogni turno, e si impara a colpo
 * d'occhio dove sta ognuno. A round chiuso la lista si riordina una volta
 * sola, sul prossimo che aprira'. Chi e' fuori dallo spareggio va in fondo;
 * il proprio posto non viene spostato in cima, si riconosce dal bordo.
 */
const seatOrder = (g) => {
  const line = playingSeats(g);
  const bench = turnOrder(g).filter((sid) => !line.includes(sid));
  return line.concat(bench);
};

/**
 * Quanto valeva la mano PRIMA dell'ultima pescata: finche' la carta vola,
 * punti e rotaia restano fermi li' (il nuovo valore direbbe in anticipo
 * cosa e' arrivato, sballo compreso).
 */
function pointsBefore(h, last) {
  const card = last.card;
  if (Array.isArray(h.cards)) {
    const b = { ...h, out: null, cards: h.cards.filter((c) => c !== card) };
    // l'Unlucky 7 appena girato ha buttato il resto: prima valevano quelle carte
    if (card === "u7" && moveHold) b.cards = moveHold.moves.filter((mv) => mv.from === last.seat).map((mv) => mv.card);
    return engine.handPoints(b);
  }
  const b = { nums: h.nums, plus: h.plus, x2: h.x2, out: null };
  if (engine.CARD.isNum(card)) {
    const n = engine.CARD.num(card);
    // doppione (sballo o vita spesa): la carta non e' entrata in mano
    if ((h.out === "bust" && h.bustCard === n) || last.saved) return engine.handPoints(b);
    b.nums = h.nums.filter((x) => x !== n);
  } else if (engine.CARD.isPlus(card)) {
    const i = h.plus.indexOf(engine.CARD.plus(card));
    b.plus = h.plus.filter((_, k) => k !== i);
  } else if (engine.CARD.isX2(card)) b.x2 = false;
  return engine.handPoints(b);
}

/**
 * Il tavolo: vale per il round in corso, per la fine del round (si resta
 * sulle mani in vista, sballi compresi, e si riparte da qui) e per la fine
 * della partita (l'ultima mano resta in vista finche' non si va al podio).
 */
function renderTable(g, ctx) {
  const me = mySeat(g, ctx);
  const max = raceMax(g);
  return `
    <div class="table-wrap" style="--seats:${g.order.length}">
      <section class="card t-side">
        ${statusStrip(g, ctx, me)}
        <div class="seat-controls">${renderControls(g, ctx, me)}</div>
        ${bankRow(g)}
        ${raceBoard(g, me)}
      </section>
      <section class="card t-seats${isVg(g) && g.pending && g.pending.kind === "use" && mine(g, ctx, g.pending.chooser) && !giveOpen ? " picking" : ""}">
        <ul class="seats">
          ${seatOrder(g).map((sid) => (isVg(g) ? renderSeatRowV : renderSeatRow)(g, sid, ctx, max, me)).join("")}
        </ul>
        ${reactionBar(g, me)}
      </section>
    </div>`;
}

// il podio si apre solo quando lo chiedi: prima si guarda l'ultima mano
let podiumKey = null;
const overKey = (g) => `${g.id}:${g.round}:${g.updatedAt || 0}`;

function renderOver(g, ctx) {
  const me = mySeat(g, ctx);
  const winners = new Set(g.winners && g.winners.length ? g.winners : [winnerOf(g)]);
  const rows = g.order.map((sid) => ({ sid, ...g.seats[sid] })).sort((a, b) => (b.total || 0) - (a.total || 0) || (winners.has(a.sid) ? -1 : 1));
  const winner = rows.find((r) => winners.has(r.sid)) || rows[0];
  return `
    <section class="winner-banner holo">
      <span class="holo-sweep" aria-hidden="true"></span>
      <span class="confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</span>
      <div class="wb-crown">${crownEmblem("big")}</div>
      <div class="wb-label">${isVg(g) ? "Vince · With a Vengeance (beta)" : "Vince al tavolo online"}</div>
      <div class="wb-name">${esc(winner.name)}</div>
      <div class="wb-score">${winner.total} punti</div>
      <div class="wb-mark">${wordmark()}</div>
    </section>
    <section class="card">
      <ol class="rank-list">
        ${rows.map((seat, i) => `
          <li class="${winners.has(seat.sid) ? "win" : ""}">
            <span class="rank ${i < 3 ? "medal m" + (i + 1) : ""}">${i + 1}</span>
            ${avatar(seat.playerId, seat.name, "sm")}
            <span class="rl-name">${esc(seat.name)}${seat.blocked ? `<small>bloccato al round ${seat.blockedRound || "?"}</small>` : ""}</span>
            ${winners.has(seat.sid) ? crownEmblem("mini") : ""}
            <b>${seat.total || 0}</b>
          </li>`).join("")}
      </ol>
      ${g.endReason === "left" ? `<p class="hint">Partita chiusa da <b>${esc(g.endedBy || "un giocatore")}</b>:
        valgono i punteggi di quel momento, la mano in corso non conta.</p>` : ""}
      ${isVg(g) ? betaNote() : me ? `
        <button class="btn primary big" data-action="tbl-save">Salva nello storico (vale una Crown)</button>` : ""}
      <div class="board-links">
        <button class="ghost-btn" data-action="tbl-share">${icon("share", "tiny")} Condividi il podio</button>
        <button class="ghost-btn" data-action="tbl-lasthand">${icon("arrowLeft", "tiny")} Rivedi l'ultima mano</button>
        <button class="ghost-btn" data-action="tbl-list">${icon("cardFan", "tiny")} Tavoli aperti</button>
        ${isTableOwner(g, ctx) ? `<button class="ghost-btn danger" data-action="tbl-close">Chiudi senza salvare</button>` : ""}
      </div>
    </section>`;
}

/**
 * Tavolo fermo da ore: chi entra lo vede subito e puo' liberarlo con un
 * tocco, cosi' una partita lasciata a meta' non blocca le successive.
 */
const STALE_MS = 3 * 36e5; // 3 ore senza mosse
const isStale = (g) => Boolean(g.updatedAt) && Date.now() - g.updatedAt >= STALE_MS;
function staleNotice(g) {
  if (!isStale(g)) return "";
  return `
    <section class="card stale-card">
      <p class="muted small">Ultima mossa <b>${relTime(g.updatedAt)}</b>: questo tavolo
        sembra abbandonato. Puoi guardarlo, aprirne un altro tuo, oppure chiuderlo
        anche se non sei tu ad averlo aperto (lo storico non si tocca).</p>
      <button class="btn danger" data-action="tbl-close">Chiudi il tavolo abbandonato</button>
    </section>`;
}

/** Il tavolo con la mossa applicata, se e' cambiato qualcosa. */
function apply(next, g) {
  if (next !== g) return store.commitGame(next);
}

// --- export ------------------------------------------------------------------
export const tableView = {
  render(ctx) {
    const list = tablesOf(ctx);
    const g = pickTable(ctx);
    syncTable(g);
    keepTicking(g, ctx);
    if (!g) return list.length ? renderTables(list, ctx) : renderIntro(ctx);
    if (g.status === "playing") scheduleAuto(g, ctx);
    if (!g.pending || g.pending.kind !== "use") { swapPick = null; giveOpen = false; }
    // anche l'ultima pescata della partita si anima: la fine si vede, non si intuisce
    if (g.status !== "lobby") scheduleDrawAnim(g);
    checkPendingFlight(g);
    if (isVg(g) && g.status !== "lobby") scheduleMoveAnim(g);
    if (g.status !== "lobby") alertOnChanges(g, ctx);
    // con piu' tavoli aperti serve sapere dove si e' e come si torna indietro
    const head = (list.length > 1 ? tableBar(g, list) : "") + staleNotice(g);
    if (g.status === "lobby") return head + renderLobby(g, ctx);
    if (g.status === "over" && podiumKey === overKey(g)) return head + renderOver(g, ctx);
    return head + renderTable(g, ctx);
  },

  actions: {
    /** Apre un tavolo nuovo, anche se ce n'è già uno: prima si sceglie il mazzo. */
    "tbl-open"() {
      openSheet({ type: "deck" }, renderDeckSheet);
    },
    /** ...e' mio, lo chiudo io. */
    "tbl-open-deck"(ctx, el) {
      const mode = el.dataset.mode === "vengeance" ? "vengeance" : "classic";
      closeSheet();
      const id = "t" + store.newId();
      const mine = ctx.me && ctx.room.players[ctx.me];
      // se non sono collegato a un giocatore vale il nome con cui gioco altrove
      const elsewhere = tablesOf(ctx).map((t) => { const sid = mySeat(t, ctx); return sid ? t.seats[sid].name : null; }).find(Boolean);
      const owner = { uid: ctx.status.uid, name: (mine ? mine.name : "") || elsewhere || "" };
      viewingId = id;
      browsing = false;
      podiumKey = null;
      return store.commitGame(engine.createLobby(ctx.room.meta.targetScore || 200, { id, owner, mode }));
    },
    // --- With a Vengeance: tocca la carta, passa la carta, regole ---
    async "tbl-pick"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !g.pending || g.pending.kind !== "use" || !isFresh(g, el)) return;
      const p = g.pending;
      if (!mine(g, ctx, p.chooser)) return;
      const pick = { sid: el.dataset.sid, card: el.dataset.card };
      const confirmHurt = async () => {
        if (!pickWarn(g, p, pick.sid, pick.card)) return true;
        return askConfirm("Così ti fai male", { message: "Quella carta ti fa sballare, oppure ti fa buttare tutto (Unlucky 7) o azzera la mano (The Zero). Vuoi farlo lo stesso?", confirmLabel: "Sì, lo faccio", danger: true });
      };
      if (p.type === "swp") {
        if (!swapPick) { if (V.pickable(g, p.chooser, "swp").some((x) => x.sid === pick.sid && x.card === pick.card)) swapPick = pick; return; }
        if (swapPick.sid === pick.sid && swapPick.card === pick.card) { swapPick = null; return; } // toccata di nuovo: si deseleziona
        if (swapPick.sid === pick.sid) { swapPick = pick; return; }                                // stessa fila: cambia la prima
        const picks = [swapPick, pick];
        if (!V.validPicks(g, p.chooser, "swp", picks)) return toast("Scegli due carte di due giocatori diversi", "warn");
        if (!(await confirmHurt())) return;
        const g2 = pickTable(ctx);
        if (!g2 || !g2.pending || g2.updatedAt !== g.updatedAt) return;
        swapPick = null;
        return apply(engine.pickCards(g2, p.chooser, picks), g2);
      }
      if (!V.validPicks(g, p.chooser, p.type, [pick])) return;
      if (!(await confirmHurt())) return;
      const g2 = pickTable(ctx);
      if (!g2 || !g2.pending || g2.updatedAt !== g.updatedAt) return;
      return apply(engine.pickCards(g2, p.chooser, [pick]), g2);
    },
    "tbl-pick-cancel"() { swapPick = null; },
    "tbl-give-open"() { giveOpen = !giveOpen; swapPick = null; },
    "tbl-give"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !g.pending || !isFresh(g, el) || !mine(g, ctx, g.pending.chooser)) return;
      giveOpen = false;
      return apply(engine.giveAction(g, g.pending.chooser, el.dataset.id), g);
    },
    "tbl-vrules"() { openSheet({ type: "vrules" }, renderVRules); },
    /** Entra in un tavolo dell'elenco (o torna a guardarlo). */
    "tbl-watch"(ctx, el) {
      viewingId = el.dataset.id;
      browsing = false;
    },
    /** Torna all'elenco dei tavoli aperti. */
    "tbl-list"() {
      viewingId = null;
      browsing = true;
    },
    async "tbl-sit"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "lobby") return;
      // a un tavolo per volta: chi e' gia' seduto altrove prima si alza
      const other = tablesOf(ctx).find((t) => t.id !== g.id && mySeat(t, ctx));
      if (other) return toast(`Sei già seduto ${other.owner && other.owner.name ? `al tavolo di ${other.owner.name}` : "a un altro tavolo"}: alzati prima`, "warn");
      // se l'account e' gia' collegato a un giocatore, ci si siede come lui
      const bound = ctx.status.mode === "firebase" ? store.myPlayerId() : null;
      if (bound && ctx.room.players[bound]) {
        const sid = ctx.status.uid;
        const s2 = structuredClone(g);
        const nm = ctx.room.players[bound].name;
        s2.seats[sid] = { uid: ctx.status.uid, name: nm, playerId: bound, total: 0 };
        if (!s2.order.includes(sid)) s2.order = [...s2.order, sid];
        if (s2.owner && s2.owner.uid === ctx.status.uid && !s2.owner.name) s2.owner = { ...s2.owner, name: nm };
        await store.commitGame(s2);
        return store.touchTable(g.id, 0);
      }
      const roster = Object.entries(ctx.room.players || {}).filter(([, p]) => !p.archived);
      const takenPlayers = new Set(g.order.map((sid) => g.seats[sid].playerId));
      const options = roster.filter(([id]) => !takenPlayers.has(id)).map(([id, p]) => ({ id, label: p.name }));
      options.push({ id: "__new", label: "＋ Nuovo giocatore…" });
      let playerId = options.length === 1 ? "__new" : await askChoice("Chi sei al tavolo?", options);
      if (!playerId) return;
      let name;
      if (playerId === "__new") {
        name = await askText("Come ti chiami?", { placeholder: "Nome", confirmLabel: "Siediti" });
        if (!name) return;
        playerId = await store.addPlayer(name);
      } else {
        name = (ctx.room.players[playerId] || {}).name;
      }
      const sid = ctx.status.mode === "firebase" ? ctx.status.uid : "s" + store.newId();
      const s2 = structuredClone(g);
      s2.seats[sid] = { uid: ctx.status.uid, name, playerId, total: 0 };
      if (!s2.order.includes(sid)) s2.order = [...s2.order, sid];
      // il tavolo prende il nome di chi l'ha aperto appena si siede
      if (s2.owner && s2.owner.uid === ctx.status.uid && !s2.owner.name) s2.owner = { ...s2.owner, name };
      await store.commitGame(s2);
      return store.touchTable(g.id, 0);
    },
    "tbl-bot"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "lobby") return;
      const used = new Set(g.order.map((sid) => g.seats[sid].name));
      const name = BOT_NAMES.find((n) => !used.has(n));
      if (!name) return toast(`Massimo ${BOT_NAMES.length} bot`, "warn");
      const sid = "b" + store.newId();
      const s2 = structuredClone(g);
      s2.seats[sid] = { uid: ctx.status.uid, name, playerId: null, bot: true, level: "normale", total: 0 };
      s2.order = [...s2.order, sid];
      return store.commitGame(s2);
    },
    /** Tocco su un bot in lobby: cambia livello o toglilo. */
    async "tbl-bot-menu"(ctx, el) {
      const g = pickTable(ctx);
      const sid = el.dataset.id;
      if (!g || g.status !== "lobby" || !g.seats[sid] || !g.seats[sid].bot) return;
      const cur = g.seats[sid].level || "normale";
      const pick = await askChoice(g.seats[sid].name, [
        ...Object.entries(BOT_LEVELS).map(([k, v]) => ({ id: k, label: `${k === cur ? "✓ " : ""}${v.label} — ${v.desc}` })),
        { id: "__remove", label: "Togli dal tavolo" }
      ], { message: "Il bot conta-carte guarda solo le carte già uscite, come farebbe una persona: il mazzo non lo sbircia." });
      if (!pick) return;
      const g2 = pickTable(ctx);
      if (!g2 || !g2.seats[sid]) return;
      const s2 = structuredClone(g2);
      if (pick === "__remove") {
        delete s2.seats[sid];
        s2.order = s2.order.filter((x) => x !== sid);
      } else s2.seats[sid] = { ...s2.seats[sid], level: pick };
      return store.commitGame(s2);
    },
    /** Il menu della striscia: abbandonare o annullare, senza occupare spazio sul tavolo. */
    async "tbl-menu"(ctx) {
      const g = pickTable(ctx);
      if (!g) return;
      const me = mySeat(g, ctx);
      const choices = [];
      if (me && g.status !== "over" && g.status !== "lobby") choices.push({ id: "leave", label: "Abbandono la partita" });
      if (isTableOwner(g, ctx) || isStale(g)) choices.push({ id: "close", label: "Annulla il tavolo" });
      if (trainingAllowed(g)) choices.push({ id: "training", label: prefs.get("training", false) ? "✓ Modalità allenamento — tocca per spegnerla" : "Modalità allenamento (rischio di sballo)" });
      if (isVg(g)) choices.push({ id: "vrules", label: "Regole di With a Vengeance" });
      choices.push({ id: "list", label: "Tavoli aperti (aprine un altro)" });
      const pick = await askChoice("Tavolo", choices, {
        message: me && g.status !== "over" && g.status !== "lobby"
          ? "Chi abbandona chiude la partita per tutti, coi punteggi di adesso. Se invece qualcuno non risponde, si può bloccare solo lui e andare avanti. Lo storico non si tocca."
          : "Lo storico non si tocca in nessun caso."
      });
      if (pick === "list") { viewingId = null; browsing = true; return; }
      if (pick === "vrules") { openSheet({ type: "vrules" }, renderVRules); return; }
      if (pick === "training") { prefs.set("training", !prefs.get("training", false)); toast(prefs.get("training") ? "Allenamento acceso: al tuo turno vedi il rischio di sballo — si spegne da questo stesso menu" : "Allenamento spento"); return; }
      if (pick === "leave") return tableView.actions["tbl-leave"](ctx);
      if (pick === "close") return tableView.actions["tbl-close"](ctx);
    },
    async "tbl-leave"(ctx) {
      const g = pickTable(ctx);
      const me = g && mySeat(g, ctx);
      if (!g || !me || g.status === "lobby" || g.status === "over") return;
      const ok = await askConfirm("Abbandonare la partita?", {
        message: "La partita finisce qui per tutti, con i punteggi di adesso: la mano in corso non conta. Dal podio si salva nello storico come sempre.",
        confirmLabel: "Termina la partita", danger: true
      });
      if (!ok) return;
      podiumKey = null;
      return store.commitGame(engine.abandonGame(g, me));
    },
    "tbl-stand"(ctx) {
      const g = pickTable(ctx);
      const me = mySeat(g, ctx);
      if (!g || g.status !== "lobby" || !me) return;
      const s2 = structuredClone(g);
      delete s2.seats[me];
      s2.order = s2.order.filter((sid) => sid !== me);
      return store.commitGame(s2);
    },
    "tbl-start"(ctx) {
      const g = pickTable(ctx);
      if (!g) return;
      podiumKey = null;
      try { return store.commitGame(engine.startGame(g)); }
      catch (e) { toast(e.message, "warn"); }
    },
    "tbl-hit"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !isFresh(g, el)) return;
      const actor = actorOf(g);
      if (!mine(g, ctx, actor)) return;
      return apply(engine.hit(g, actor), g);
    },
    "tbl-stay"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !isFresh(g, el)) return;
      const actor = actorOf(g);
      if (!mine(g, ctx, actor)) return;
      return apply(engine.stay(g, actor), g);
    },
    "tbl-target"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !g.pending || !isFresh(g, el)) return;
      if (!mine(g, ctx, g.pending.chooser)) return;
      return apply(engine.chooseTarget(g, g.pending.chooser, el.dataset.id), g);
    },
    "tbl-nextround"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "roundEnd") return;
      return store.commitGame(engine.nextRound(g));
    },
    // --- blocco di chi non risponde ---
    "tbl-vote"(ctx, el) {
      const g = pickTable(ctx);
      const target = el.dataset.id;
      if (!g || !isStalled(g) || actorOf(g) !== target) return toast("Non è più fermo", "warn");
      const required = voterUids(g, ctx, target);
      if (!required.includes(ctx.status.uid)) return toast("Decidono i giocatori collegati al tavolo", "warn");
      const next = engine.voteBlock(g, target, ctx.status.uid, required);
      if (next.seats[target].blocked) toast(`${g.seats[target].name} bloccato: la partita continua`);
      return apply(next, g);
    },
    "tbl-unvote"(ctx, el) {
      const g = pickTable(ctx);
      if (!g) return;
      return apply(engine.unvoteBlock(g, el.dataset.id, ctx.status.uid), g);
    },
    /** I voti bastano (es. qualcuno si e' scollegato nel frattempo): si conferma. */
    "tbl-block-confirm"(ctx, el) {
      const g = pickTable(ctx);
      const target = el.dataset.id;
      if (!g || !isStalled(g) || actorOf(g) !== target) return toast("Non è più fermo", "warn");
      const required = voterUids(g, ctx, target);
      const votes = (g.votes && g.votes[target]) || {};
      if (!required.length || !required.every((u) => votes[u])) return toast("Non sono ancora tutti d'accordo", "warn");
      toast(`${g.seats[target].name} bloccato: la partita continua`);
      return apply(engine.blockSeat(g, target), g);
    },
    "tbl-unblock"(ctx) {
      const g = pickTable(ctx);
      const me = g && mySeat(g, ctx);
      if (!g || !me) return;
      toast("Bentornato: rientri dal prossimo round");
      return apply(engine.unblockSeat(g, me), g);
    },
    // --- reazioni ---
    "tbl-react"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !mySeat(g, ctx)) return;
      return store.reactAt(g.id, el.dataset.s);
    },
    /** Dall'ultima mano al podio (scelta locale: ognuno quando vuole). */
    "tbl-podium"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "over") return;
      podiumKey = overKey(g);
      window.scrollTo({ top: 0 });
    },
    "tbl-lasthand"() {
      podiumKey = null;
    },
    async "tbl-share"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "over") return;
      const winners = new Set(g.winners && g.winners.length ? g.winners : [winnerOf(g)]);
      const rows = g.order.map((sid) => ({ sid, playerId: g.seats[sid].playerId, name: g.seats[sid].name, total: g.seats[sid].total || 0 }))
        .sort((a, b) => b.total - a.total);
      const winIds = new Set(rows.filter((r) => winners.has(r.sid)).map((r) => r.playerId || r.sid));
      await sharePodium(rows.map((r) => ({ ...r, playerId: r.playerId || r.sid })), winIds,
        { title: "Vince al tavolo online", room: ctx.room.meta.name || "", dateLabel: fmtDate(Date.now()), target: g.target, subtitle: `${rows[0].total} punti · ${g.round} ${g.round === 1 ? "mano" : "mani"}`, text: `Flip 7 · vince ${rows[0].name} con ${rows[0].total} punti` });
    },
    async "tbl-save"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "over") return;
      if (isVg(g)) return toast("Partita di prova (beta): non si salva nello storico", "warn");
      await store.saveOnlineGame(g);
      toast("Partita salvata: Crown assegnata");
      location.hash = "#classifica";
    },
    async "tbl-close"(ctx) {
      const g = pickTable(ctx);
      if (!g) return;
      if (!isTableOwner(g, ctx) && !isStale(g)) return toast("Questo tavolo lo chiude chi l'ha aperto", "warn");
      const ok = await askConfirm("Annullare il tavolo?", { message: "La partita online in corso andrà persa (lo storico non si tocca).", confirmLabel: "Annulla tavolo", danger: true });
      if (!ok) return;
      viewingId = null;
      return store.closeTable(g.id);
    }
  },

  changes: {}
};
