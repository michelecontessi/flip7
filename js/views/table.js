// ---------------------------------------------------------------------------
// Vista "Tavolo": la partita online vera e propria, separata dal segnapunti.
// I tavoli aperti vivono in room.game (id -> stato): se ne possono tenere
// piu' di uno insieme, cosi' chi non gioca a quello aperto se ne apre un
// altro invece di aspettare. Le mosse passano dal motore puro (js/game.js)
// e vengono scritte per intero: tutti vedono la stessa cosa.
// Layout (pensato per il telefono, come un tavolo da gioco online): in cima
// la striscia che dice sempre chi deve fare cosa, con i comandi sotto; il
// banco (mazzo e carta girata) accanto; poi una riga per giocatore con nome,
// stato, punti e TUTTE le sue carte in fila. Le carte si dimensionano
// sull'altezza dello schermo, cosi' il tabellone sta in una schermata sola.
// Su desktop le stesse parti si dispongono su due colonne.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, colorOf, toast, askText, askConfirm, askChoice, relTime } from "../ui.js";
import { avatar } from "../avatar.js";
import { icon, wordmark, crownEmblem, fanArt, numberCard, modCard, roundCard, cardBack, flip7Card } from "../icons.js";
import * as engine from "../game.js";

// "stay" copre anche chi viene chiuso d'ufficio a fine round (flip7 altrui,
// carte finite): "ha incassato" e' vero in entrambi i casi, "si e' fermato" no
const OUT_LABEL = { stay: "ha incassato", frozen: "congelato", bust: "sballato", flip7: "FLIP 7" };
// le carte azione hanno un riquadro tutto loro: nome, colore e cosa fare
const ACTION_META = {
  frz: { name: "Congela", ico: "snow", ask: "Chi vuoi congelare?", doing: "sceglie chi congelare" },
  fl3: { name: "Pesca Tre", ico: "cardFan", ask: "Chi deve pescare tre carte?", doing: "sceglie chi pescherà tre carte" },
  sc:  { name: "Seconda Chance", ico: "heartFill", ask: "A chi regali la Seconda Chance?", doing: "sceglie a chi regalare la Seconda Chance" }
};
const BOT_NAMES = ["Bot Ada", "Bot Bruno", "Bot Carla", "Bot Dina"];
let botTimer = null;

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
  podiumKey = null;
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

/** Chi ha vinto (a partita finita): il totale piu' alto. */
const winnerOf = (g) => [...g.order].sort((a, b) => (g.seats[b].total || 0) - (g.seats[a].total || 0))[0];

// --- bot di prova ------------------------------------------------------------
/** Strategia elementare: rischia finche' il bottino del round e' magro. */
function botMove(g, sid) {
  if (g.pending && g.pending.chooser === sid) {
    const others = g.pending.options.filter((x) => x !== sid);
    const pool = others.length ? others : g.pending.options;
    // Congela e Pesca Tre vanno al piu' ricco; la Seconda Chance al primo
    const target = g.pending.type === "sc" ? pool[0]
      : pool.slice().sort((a, b) =>
          ((g.seats[b].total || 0) + engine.handPoints(g.hands[b])) -
          ((g.seats[a].total || 0) + engine.handPoints(g.hands[a])))[0];
    return engine.chooseTarget(g, sid, target);
  }
  if (g.flip3 && g.flip3.target === sid) return engine.hit(g, sid);
  if (g.turn === sid && !g.hands[sid].out) {
    const h = g.hands[sid];
    if (engine.handPoints(h) >= 21 || h.nums.length >= 5) return engine.stay(g, sid);
    return engine.hit(g, sid);
  }
  return g;
}

/** La mano e' completamente vuota? (inizio del proprio turno nel round) */
const emptyHand = (h) => !h.nums.length && !h.plus.length && !h.x2;

/**
 * Mosse che partono da sole: quelle dei bot, le pescate del Pesca Tre
 * e la prima carta quando si e' senza carte (pescarla e' obbligato).
 */
function needsAuto(g, sid) {
  const seat = g.seats[sid];
  if (seat.bot) return true;
  if (g.flip3 && g.flip3.target === sid && !g.hands[sid].out) return true;
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

/** Una carta in mano o nel banco. `key` la identifica nel ridisegno
    incrementale, cosi' la stessa carta resta lo stesso elemento. */
function miniCard(c, cls = "mini", key = "", sid = "") {
  const attrs = key ? `data-key="${key}"${sid ? ` data-flip="card:${sid}:${key}"` : ""}` : "";
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
const flightHold = (g) => landingActive && g.status === "playing" && g.lastDraw && g.seats[g.lastDraw.seat] ? g.lastDraw.seat : null;

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
  const ico = kind === "bust" ? "bomb" : kind === "flip7" ? "seven" : "heartFill";
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
  if (!last || !g.seats[last.seat] || !engine.CARD.isNum(last.card)) return;
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
  document.querySelectorAll(".t-seats .fcard.landing").forEach((el) => el.classList.remove("landing"));
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
  const dest = document.querySelector(".t-seats .fcard.landing") || document.querySelector(".t-seats .fcard.fly-dest");
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
    document.querySelectorAll(".t-seats .fcard.landing").forEach((el) => el.classList.remove("landing"));
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
      dest = row.querySelector(".fcard.landing");
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

// --- intro / elenco tavoli / lobby -------------------------------------------
function renderIntro(ctx) {
  return `
    <section class="card empty-state">
      ${fanArt()}
      <h2 class="empty-title">Tavolo online</h2>
      <p class="muted">Qui si gioca a Flip 7 per davvero, ognuno dal suo telefono:
        pesca o fermati, con sballi, Congela, Pesca Tre e Seconda Chance.
        Chi vince prende la Crown come nelle partite dal vivo.</p>
      <button class="btn primary big" data-action="tbl-open">Apri un tavolo</button>
      <p class="hint">Il tavolo lo chiude chi l'ha aperto: gli altri, se vogliono, ne aprono uno loro.</p>
    </section>`;
}

/** In una riga: a che punto e' quel tavolo. */
function tableState(g) {
  if (g.status === "lobby") return "in attesa di giocatori";
  if (g.status === "over") return "partita finita";
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
          return `
          <li>
            <button class="tl-row" data-action="tbl-watch" data-id="${g.id}">
              <span class="tl-avas">${seats.slice(0, 4).map((seat) => avatar(seat.playerId, seat.name, "xs")).join("")}
                ${seats.length > 4 ? `<i class="tl-more">+${seats.length - 4}</i>` : ""}</span>
              <span class="tl-txt">
                <b>${g.owner && g.owner.name ? `Tavolo di ${esc(g.owner.name)}` : "Tavolo aperto"}</b>
                <small>${seats.length} ${seats.length === 1 ? "seduto" : "seduti"} · ${tableState(g)} · traguardo ${g.target}</small>
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
    </div>`;
}

function renderLobby(g, ctx) {
  const seated = mySeat(g, ctx);
  return `
    <section class="card">
      <div class="card-head">${icon("cardFan")}<span class="card-title">Tavolo aperto</span>
        <span class="count-pill ml-auto">${g.order.length} ${g.order.length === 1 ? "seduto" : "seduti"}</span></div>
      <p class="muted small">Ognuno si siede dal proprio telefono. Servono almeno 2 giocatori;
        vince chi arriva per primo a <b>${g.target}</b> punti.</p>
      <div class="pgrid">
        ${g.order.map((sid) => {
          const seat = g.seats[sid];
          const tile = `
              <span class="pg-ava" style="--pc:${colorOf(seat.name)}">
                ${avatar(seat.playerId, seat.name, "lg")}
                <i class="pg-check">${icon(seat.bot ? "close" : "check", "tiny")}</i>
              </span>
              <span class="pg-name">${esc(seat.name)}${seat.bot ? '<small class="bot-note">tocca per togliere</small>' : ""}</span>`;
          return seat.bot
            ? `<button class="pg on" data-action="tbl-unbot" data-id="${sid}">${tile}</button>`
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
        <button class="btn ghost small" data-action="tbl-bot">${icon("plus", "tiny")} Aggiungi un bot di prova</button>` : `
        <p class="hint">Stai guardando: siediti per giocare, oppure apri un tavolo tuo.</p>`}
      <div class="board-links">
        ${seated ? `<button class="ghost-btn" data-action="tbl-stand">${icon("close", "tiny")} Mi alzo</button>` : ""}
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
          <b>${b}${r ? `<small>+${r}</small>` : ""}</b>
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
      : `partita finita con ${g.seats[w].total || 0} punti`;
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
      const meta = ACTION_META[p.type];
      cls = mine(g, ctx, p.chooser) ? "you" : "";
      title = mine(g, ctx, p.chooser) ? `Hai pescato ${meta.name}` : `${nm(p.chooser)} ha pescato ${meta.name}`;
      sub = mine(g, ctx, p.chooser) ? meta.ask : `${meta.doing}…`;
      veil = spoilerHold && g.lastDraw && g.lastDraw.card === p.type ? " spoiler-veil" : "";
    } else if (g.flip3) {
      const t = g.flip3.target;
      const left = g.flip3.left === 1 ? "ancora una carta" : `ancora ${g.flip3.left} carte`;
      cls = mine(g, ctx, t) ? "you" : "";
      title = mine(g, ctx, t) ? `Peschi ${left}` : `${nm(t)} pesca ${left}`;
      sub = "Pesca Tre: le carte arrivano da sole";
    } else if (actor && g.seats[actor]) {
      const first = emptyHand(g.hands[actor]);
      if (mine(g, ctx, actor)) {
        cls = "you";
        title = "Tocca a te";
        sub = first ? "la prima carta arriva da sola…" : "pesca o fermati";
      } else {
        title = `Tocca a ${nm(actor)}`;
        sub = first ? "la prima carta arriva da sola…" : "deve pescare o fermarsi";
      }
    }
  }
  return `
    <div class="turn-strip ${cls}" data-flip="strip">
      <span class="ts-round" title="Round ${g.round}"><small>round</small>${roundCard(g.round)}</span>
      <div class="ts-txt${veil}"><b>${title}</b><small>${sub}</small></div>
      <button class="icon-btn ts-menu" data-action="tbl-menu" aria-label="Altre opzioni">${icon("dots")}</button>
    </div>`;
}

/** Il banco: mazzo con le carte rimaste e la carta che si gira. */
function bankRow(g) {
  const last = g.lastDraw;
  // il doppione appena pescato ha fatto sballare: va urlato
  const bustNow = last && g.hands[last.seat] && g.hands[last.seat].out === "bust" && engine.CARD.isNum(last.card);
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

function renderSeatRow(g, sid, ctx, max) {
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
    if (flying === "x2") tail = mc("x2", "x2", "mini just landing");
    else specials.push(mc("x2", "x2"));
  }
  const plus = h.plus.slice().sort((a, b) => a - b);
  let skipPlus = flying && engine.CARD.isPlus(flying) ? engine.CARD.plus(flying) : null;
  for (const p of plus) {
    if (skipPlus === p) { skipPlus = null; tail = mc("p" + p, "p" + p, "mini just landing"); continue; }
    specials.push(mc("p" + p, "p" + p));
  }
  // la Seconda Chance bruciata non sparisce: resta in mano spenta
  // ("consumata") per tutto il round. Durante il giro della carta e'
  // ancora accesa (niente spoiler), si spegne al momento del verdetto.
  if (h.sc) {
    if (flying === "sc") tail = mc("sc", "sc", "mini just landing");
    else specials.push(mc("sc", "sc", resolvedHere ? "mini landing" : cls("sc")));
  } else if (savedHere && spoilerHold) specials.push(mc("sc", "sc", "mini spoiler-burn"));
  else if (h.scUsed) specials.push(mc("sc", "sc", "mini burned"));
  // chi e' stato congelato mostra la carta Congela ricevuta
  if (h.out === "frozen") specials.push(mc("frz", "frz", resolvedHere ? "mini landing" : "mini"));
  const nums = [];
  for (const n of h.nums.slice().sort((a, b) => a - b)) {
    if (flyNum === n && !bustFly && !savedFly) { tail = mc("n" + n, "n" + n, "mini just landing"); continue; }
    nums.push(mc("n" + n, "n" + n));
  }
  // il bonus del Flip 7 compare quando la settima carta e' atterrata
  if (h.out === "flip7" && !flying) nums.push(flip7Card({ size: "mini", attrs: `data-key="f7" data-flip="card:${sid}:f7"` }));
  // il doppione che ha sballato resta in vista, marcato in rosso
  if (h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined) {
    if (bustFly) tail = mc("n" + h.bustCard, "dup", "mini dup landing");
    else nums.push(mc("n" + h.bustCard, "dup", "mini dup"));
  }
  if (specials.length && (nums.length || tail)) specials[specials.length - 1] = specials[specials.length - 1].replace('class="fcard', 'class="fcard gap-after');
  const cards = specials.join("") + nums.join("") + tail;
  // la carta azione sta ancora volando verso questo posto: il verdetto
  // (es. "congelato") e la riga spenta aspettano che atterri
  const outShown = h.out && !resolvedHere;
  const state = outShown ? `<i class="seat-state s-${h.out}${bustSpoiler ? " spoiler-veil" : ""}">${OUT_LABEL[h.out]}</i>`
    : isChoosing ? `<i class="seat-state s-turn">${mine(g, ctx, sid) ? "scegli tu" : "sta scegliendo"}</i>`
    : isFlip3 ? `<i class="seat-state s-flip3">pesca ancora ${g.flip3.left}</i>`
    : isTurn ? `<i class="seat-state s-turn">${mine(g, ctx, sid) ? "tocca a te" : "il suo turno"}</i>`
    : g.status === "playing" ? `<i class="seat-state s-wait">in attesa</i>` : "";
  const total = seat.total || 0;
  const color = colorOf(seat.name);
  // posizione nel giro (1 = chi apre) e chi apre il round
  const order = turnOrder(g);
  const pos = order.indexOf(sid) + 1;
  const opens = order[0] === sid && g.status !== "over";
  return `
    <li class="seat ${isTurn || isFlip3 || isChoosing ? "turn" : ""} ${outShown ? "out-" + h.out : ""} ${bustSpoiler ? "spoiler-hold" : ""}" data-sid="${sid}" data-key="${sid}" data-flip="seat:${sid}" style="--pc:${color}">
      <div class="seat-head">
        <span class="seat-ava" title="${pos}º nel giro">${avatar(seat.playerId, seat.name, "sm")}<i class="seat-no ${pos === 1 ? "first" : ""}">${pos}</i></span>
        <b class="seat-name">${esc(seat.name)}</b>
        ${opens ? `<i class="seat-opens">${g.status === "roundEnd" ? "apre il prossimo" : "apre"}</i>` : ""}
        ${state}
        <span class="seat-pts">
          <b>${total}</b>
          <small class="${h.out === "bust" && !flying ? "bust" : pts > 0 ? "up" : ""}">+${pts}</small>
        </span>
      </div>
      <span class="seat-rail" aria-hidden="true">
        <i style="width:${((total / max) * 100).toFixed(1)}%"></i>${pts ? `<i class="prov" style="width:${((pts / max) * 100).toFixed(1)}%"></i>` : ""}
      </span>
      <div class="cards-row">${cards || '<span class="hand-empty">nessuna carta in mano</span>'}${h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined
          ? `<span class="dup-note${bustSpoiler ? " spoiler-veil" : ""}">${icon("bomb", "tiny")} doppio ${h.bustCard}: il round vale 0</span>` : ""}${savedHere
          ? `<span class="dup-note saved${spoilerHold ? " spoiler-veil" : ""}">${icon("heartFill", "tiny")} doppio ${engine.CARD.num(last.card)}: salvo, Seconda Chance bruciata</span>` : ""}</div>
    </li>`;
}

/** Riquadro bene in vista per le carte azione: chi guarda capisce al volo
    cosa sta succedendo, chi deve scegliere ha tutto lì dentro. */
function actionBox(g, type, sub, body = "") {
  const meta = ACTION_META[type];
  // se la carta azione e' quella che sta ancora girando accanto al mazzo,
  // il riquadro aspetta la fine del giro: niente spoiler
  const veil = spoilerHold && g.lastDraw && g.lastDraw.card === type ? " spoiler-veil" : "";
  return `
    <div class="action-box act-${type}${body ? " mine" : ""}${veil}">
      <div class="ab-head">
        <span class="ab-ico">${icon(meta.ico)}</span>
        <div class="ab-txt"><b>${meta.name}</b><small>${sub}</small></div>
      </div>
      ${body}
    </div>`;
}

function renderControls(g, ctx, me) {
  if (g.status === "over") {
    return `<button class="btn primary big pulse" data-action="tbl-podium">Vai al podio ${icon("chevron", "tiny turn-r")}</button>`;
  }
  if (g.status === "roundEnd") {
    return me
      ? `<button class="btn go big pulse" data-action="tbl-nextround">Via al round ${g.round + 1} →</button>
         <p class="hint">Basta che uno lo prema: il round parte per tutti in diretta.</p>`
      : `<p class="hint">Si aspetta che qualcuno apra il round ${g.round + 1}…</p>`;
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
    if (iAct) {
      return actionBox(g, p.type, "Hai pescato una carta azione: decidi tu", `
        <p class="choose-label">${ACTION_META[p.type].ask}</p>
        <div class="pgrid">
          ${p.options.map((sid) => `
            <button class="pg" data-action="tbl-target" data-id="${sid}">
              <span class="pg-ava ${sid === p.chooser ? "holo-ring" : ""}" style="--pc:${colorOf(g.seats[sid].name)}">
                ${avatar(g.seats[sid].playerId, g.seats[sid].name, "lg")}
              </span>
              <span class="pg-name">${sid === p.chooser ? "me stesso" : esc(g.seats[sid].name)}</span>
            </button>`).join("")}
        </div>`);
    }
    return actionBox(g, p.type, `${esc(shortName(g.seats[p.chooser]))} ${ACTION_META[p.type].doing}…`);
  }

  if (g.flip3) {
    const t = g.flip3.target;
    const left = g.flip3.left === 1 ? "ancora 1 carta" : `ancora ${g.flip3.left} carte`;
    return actionBox(g, "fl3", mine(g, ctx, t)
      ? `Peschi ${left}: arrivano da sole…`
      : `${esc(shortName(g.seats[t]))} pesca ${left}: arrivano da sole…`);
  }

  if (iAct && !g.hands[actor].out && !emptyHand(g.hands[actor])) {
    // la mia carta sta ancora volando: il bottone mostra il valore di prima
    const flying = landingActive && g.lastDraw && g.lastDraw.seat === actor && !g.pending;
    const pts = flying ? pointsBefore(g.hands[actor], g.lastDraw) : engine.handPoints(g.hands[actor]);
    return `
      <div class="table-actions">
        <button class="btn go big" data-action="tbl-hit">Pesca</button>
        <button class="btn stop big" data-action="tbl-stay">Mi fermo · +${pts}</button>
      </div>`;
  }
  if (!me) return `<p class="hint">Stai guardando la partita.</p>`;
  return "";
}

/**
 * L'ordine del giro da mostrare. A round chiuso e' gia' quello del prossimo
 * (chi apriva passa in coda): la lista si riordina quando la mano finisce e
 * si vede subito chi aprira'.
 */
const turnOrder = (g) => (g.status === "roundEnd" && g.order.length > 1 ? [...g.order.slice(1), g.order[0]] : g.order);
/** Il mio posto sta SEMPRE in cima; sotto, gli altri nell'ordine in cui giocano. */
const seatOrder = (g, me) => {
  const o = turnOrder(g);
  return me && o.includes(me) ? [me, ...o.filter((sid) => sid !== me)] : o;
};

/**
 * Quanto valeva la mano PRIMA dell'ultima pescata: finche' la carta vola,
 * punti e rotaia restano fermi li' (il nuovo valore direbbe in anticipo
 * cosa e' arrivato, sballo compreso).
 */
function pointsBefore(h, last) {
  const card = last.card;
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
      <section class="card t-seats">
        <ul class="seats">
          ${seatOrder(g, me).map((sid) => renderSeatRow(g, sid, ctx, max)).join("")}
        </ul>
      </section>
    </div>`;
}

// il podio si apre solo quando lo chiedi: prima si guarda l'ultima mano
let podiumKey = null;
const overKey = (g) => `${g.id}:${g.round}:${g.updatedAt || 0}`;

function renderOver(g, ctx) {
  const me = mySeat(g, ctx);
  const rows = g.order.map((sid) => g.seats[sid]).sort((a, b) => (b.total || 0) - (a.total || 0));
  const winner = rows[0];
  return `
    <section class="winner-banner holo">
      <span class="holo-sweep" aria-hidden="true"></span>
      <span class="confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</span>
      <div class="wb-crown">${crownEmblem("big")}</div>
      <div class="wb-label">Vince al tavolo online</div>
      <div class="wb-name">${esc(winner.name)}</div>
      <div class="wb-score">${winner.total} punti</div>
      <div class="wb-mark">${wordmark()}</div>
    </section>
    <section class="card">
      <ul class="mini-list">
        ${rows.map((seat) => `<li><span class="mini-name">${seat === winner ? crownEmblem("mini") : '<i class="dot-empty"></i>'}${esc(seat.name)}</span><b>${seat.total || 0}</b></li>`).join("")}
      </ul>
      ${g.endReason === "left" ? `<p class="hint">Partita chiusa da <b>${esc(g.endedBy || "un giocatore")}</b>:
        valgono i punteggi di quel momento, la mano in corso non conta.</p>` : ""}
      ${me ? `
        <button class="btn primary big" data-action="tbl-save">Salva nello storico (vale una Crown)</button>` : ""}
      <div class="board-links">
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

// --- export ------------------------------------------------------------------
export const tableView = {
  render(ctx) {
    const list = tablesOf(ctx);
    const g = pickTable(ctx);
    syncTable(g);
    if (!g) return list.length ? renderTables(list, ctx) : renderIntro(ctx);
    if (g.status === "playing") scheduleAuto(g, ctx);
    // anche l'ultima pescata della partita si anima: la fine si vede, non si intuisce
    if (g.status !== "lobby") scheduleDrawAnim(g);
    checkPendingFlight(g);
    // con piu' tavoli aperti serve sapere dove si e' e come si torna indietro
    const head = (list.length > 1 ? tableBar(g, list) : "") + staleNotice(g);
    if (g.status === "lobby") return head + renderLobby(g, ctx);
    if (g.status === "over" && podiumKey === overKey(g)) return head + renderOver(g, ctx);
    return head + renderTable(g, ctx);
  },

  actions: {
    /** Apre un tavolo nuovo, anche se ce n'è già uno: e' mio, lo chiudo io. */
    "tbl-open"(ctx) {
      const id = "t" + store.newId();
      const mine = ctx.me && ctx.room.players[ctx.me];
      // se non sono collegato a un giocatore vale il nome con cui gioco altrove
      const elsewhere = tablesOf(ctx).map((t) => { const sid = mySeat(t, ctx); return sid ? t.seats[sid].name : null; }).find(Boolean);
      const owner = { uid: ctx.status.uid, name: (mine ? mine.name : "") || elsewhere || "" };
      viewingId = id;
      browsing = false;
      podiumKey = null;
      return store.commitGame(engine.createLobby(ctx.room.meta.targetScore || 200, { id, owner }));
    },
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
        return store.commitGame(s2);
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
      return store.commitGame(s2);
    },
    "tbl-bot"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "lobby") return;
      const used = new Set(g.order.map((sid) => g.seats[sid].name));
      const name = BOT_NAMES.find((n) => !used.has(n));
      if (!name) return toast(`Massimo ${BOT_NAMES.length} bot`, "warn");
      const sid = "b" + store.newId();
      const s2 = structuredClone(g);
      s2.seats[sid] = { uid: ctx.status.uid, name, playerId: null, bot: true, total: 0 };
      s2.order = [...s2.order, sid];
      return store.commitGame(s2);
    },
    "tbl-unbot"(ctx, el) {
      const g = pickTable(ctx);
      const sid = el.dataset.id;
      if (!g || g.status !== "lobby" || !g.seats[sid] || !g.seats[sid].bot) return;
      const s2 = structuredClone(g);
      delete s2.seats[sid];
      s2.order = s2.order.filter((x) => x !== sid);
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
      choices.push({ id: "list", label: "Tavoli aperti (aprine un altro)" });
      const pick = await askChoice("Tavolo", choices, {
        message: me && g.status !== "over" && g.status !== "lobby"
          ? "Chi abbandona chiude la partita per tutti, coi punteggi di adesso. Lo storico non si tocca."
          : "Lo storico non si tocca in nessun caso."
      });
      if (pick === "list") { viewingId = null; browsing = true; return; }
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
    "tbl-hit"(ctx) {
      const g = pickTable(ctx);
      if (!g) return;
      const actor = actorOf(g);
      if (!controls(g, ctx, actor)) return;
      const next = engine.hit(g, actor);
      if (next !== g) return store.commitGame(next);
    },
    "tbl-stay"(ctx) {
      const g = pickTable(ctx);
      if (!g) return;
      const actor = actorOf(g);
      if (!controls(g, ctx, actor)) return;
      const next = engine.stay(g, actor);
      if (next !== g) return store.commitGame(next);
    },
    "tbl-target"(ctx, el) {
      const g = pickTable(ctx);
      if (!g || !g.pending) return;
      if (!controls(g, ctx, g.pending.chooser)) return;
      const next = engine.chooseTarget(g, g.pending.chooser, el.dataset.id);
      if (next !== g) return store.commitGame(next);
    },
    "tbl-nextround"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "roundEnd") return;
      return store.commitGame(engine.nextRound(g));
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
    async "tbl-save"(ctx) {
      const g = pickTable(ctx);
      if (!g || g.status !== "over") return;
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
