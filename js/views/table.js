// ---------------------------------------------------------------------------
// Vista "Tavolo": la partita online vera e propria, separata dal segnapunti.
// Lo stato del gioco vive in room.game; le mosse passano dal motore puro
// (js/game.js) e vengono scritte per intero: tutti vedono la stessa cosa.
// Layout: su mobile tutto in colonna (comandi, banco, corsa, posti); su
// desktop due colonne, comandi/banco/corsa fissi a sinistra e i posti a
// destra, con le carte dimensionate per stare tutte in un'unica schermata.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, initials, colorOf, toast, askText, askConfirm, askChoice, relTime } from "../ui.js";
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

const game = (ctx) => engine.normalizeGame(ctx.room.game);
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

/** Le esegue (con una piccola pausa) il dispositivo che controlla quel posto. */
function scheduleAuto(ctx) {
  const g = game(ctx);
  if (!g || g.status !== "playing" || botTimer) return;
  const actor = actorOf(g);
  const seat = actor && g.seats[actor];
  if (!seat || seat.uid !== ctx.status.uid || !needsAuto(g, actor)) return;
  botTimer = setTimeout(() => {
    botTimer = null;
    const g2 = engine.normalizeGame(store.getRoom().game);
    if (!g2 || g2.status !== "playing") return;
    const a2 = actorOf(g2);
    const s2 = a2 && g2.seats[a2];
    if (!s2 || s2.uid !== store.getStatus().uid || !needsAuto(g2, a2)) return;
    const next = s2.bot ? botMove(g2, a2) : engine.hit(g2, a2);
    if (next !== g2) store.commitGame(next).catch(() => {});
    // mossa a vuoto (stato incoerente?): meglio ritentare che restare fermi
    else setTimeout(() => scheduleAuto({ room: store.getRoom(), status: store.getStatus(), me: null }), 2500);
  }, 1500); // il ritmo asseconda l'animazione della pescata (~1,3s)
}

function miniCard(c, cls = "mini") {
  if (engine.CARD.isNum(c)) return numberCard(engine.CARD.num(c), { on: true, size: cls });
  if (engine.CARD.isPlus(c)) return modCard(engine.CARD.plus(c), { on: true, size: cls });
  if (engine.CARD.isX2(c)) return modCard("x2", { on: true, size: cls });
  // azioni a colpo d'occhio: cuore, fiocco di neve, tre carte
  if (c === "sc") return `<span class="fcard sc on ${cls}"><i class="acard">${icon("heartFill")}</i></span>`;
  if (c === "frz") return `<span class="fcard frz on ${cls}"><i class="acard">${icon("snow")}</i></span>`;
  return `<span class="fcard f3 on ${cls}"><i class="acard">${icon("cardFan")}</i></span>`;
}

// --- animazione della pescata ------------------------------------------------
// La carta si gira accanto al mazzo (dorso -> faccia) e poi vola nella mano
// di chi l'ha presa (~1,3s in tutto: online il ritmo conta). E' un elemento
// temporaneo sopra la pagina, cosi' sopravvive ai ridisegni del tavolo.
let lastAnimKey = null;
// finche' e' true, OGNI render disegna la carta in volo "collassata" (classe
// landing): cosi' anche i ridisegni a meta' animazione (echo del database,
// mosse dei bot) non la fanno comparire in anticipo sul tavolo
let landingActive = false;
let landingToken = 0;
// niente spoiler: gli indizi dello sballo (chip, nota del doppione, riga
// spenta) restano nascosti finche' la carta pescata non si e' girata
let spoilerHold = false;

/** Mentre la pescata e' in volo il turno mostrato resta su chi ha pescato:
    se chip e comandi passassero subito al prossimo, la carta in volo
    sembrerebbe di un'altra persona. Ad atterraggio avvenuto un re-render
    (chiamato da openLanding) fa comparire il turno vero. */
const flightHold = (g) => landingActive && g.status === "playing" && g.lastDraw && g.seats[g.lastDraw.seat] ? g.lastDraw.seat : null;

function scheduleDrawAnim(g) {
  const key = g.lastDraw ? `${g.lastDraw.seat}:${g.lastDraw.card}:${g.deck.length}` : "nessuna";
  // il primo render fotografa lo stato e basta: mai rigiocare una pescata vecchia
  if (lastAnimKey === null) { lastAnimKey = key; return; }
  if (key === lastAnimKey || !g.lastDraw) return;
  lastAnimKey = key;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { announceDraw(); return; }
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
  el.innerHTML = `<span class="fb-ico">${icon(kind === "bust" ? "bomb" : "heartFill")}</span>
    <div class="fb-txt"><b>${title}</b><small>${sub}</small></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("gone"), 1500);
  setTimeout(() => el.remove(), 1900);
}

/** Sballo o Seconda Chance bruciata: da urlare, non da cercare nella riga. */
function announceDraw() {
  const g = engine.normalizeGame(store.getRoom().game);
  const last = g && g.lastDraw;
  if (!last || !g.seats[last.seat] || !engine.CARD.isNum(last.card)) return;
  const h = g.hands[last.seat];
  const n = engine.CARD.num(last.card);
  const name = esc(shortName(g.seats[last.seat]));
  if (h && h.out === "bust" && h.bustCard === n) {
    flashBanner("bust", "SBALLATO", `${name} pesca un doppio ${n}: il round vale 0`);
  } else if (last.saved) {
    flashBanner("saved", "Seconda Chance bruciata", `doppio ${n}: ${name} è salvo, ma la protezione se n'è andata`);
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

function runDrawAnim(card, token) {
  // apre lo spazio in fila (transizione CSS) SENZA ridisegnare: rifare
  // l'HTML mentre la carta e' in volo farebbe scattare le righe
  const openLanding = () => {
    if (token !== landingToken) return; // e' gia' partita un'altra pescata
    landingActive = false;
    document.querySelectorAll(".t-seats .fcard.landing").forEach((el) => el.classList.remove("landing"));
  };
  // ...il ridisegno vero (chip e comandi al prossimo) arriva a volo concluso
  const settle = () => { openLanding(); store.refresh(); };
  const slot = document.querySelector(".bank .bank-slot:last-child .fcard");
  const deckEl = document.querySelector(".deck-stack .fcard");
  if (!slot || !deckEl) return settle();
  const a = slot.getBoundingClientRect();
  const m = deckEl.getBoundingClientRect();
  if (!a.width) return settle();
  // la destinazione e' collassata: la si apre un attimo (senza dipingere)
  // solo per misurare dove atterrera' la carta
  const dest = document.querySelector(".t-seats .fcard.landing");
  let b = null;
  if (dest) {
    dest.style.transition = "none";
    dest.classList.remove("landing");
    b = dest.getBoundingClientRect();
    dest.classList.add("landing");
    void dest.offsetWidth;
    dest.style.transition = "";
  }

  // la didascalia non deve svelare la carta prima che si giri
  const caption = slot.parentElement ? slot.parentElement.querySelector("small") : null;
  if (caption) { caption.style.transition = "opacity .3s ease"; caption.style.opacity = "0"; }

  // parte DAL mazzo, di dorso: una carta sola che ruota fino a 90 gradi,
  // cambia contenuto quando e' di taglio e completa il giro con la faccia
  // (niente trucchi backface: cosi' il numero non si vede mai specchiato)
  const fly = document.createElement("div");
  fly.className = "fly-card";
  fly.style.cssText = `position:fixed;left:${m.left}px;top:${m.top}px;width:${a.width}px;height:${a.height}px;z-index:60;pointer-events:none;perspective:700px;`;
  fly.innerHTML = `<div class="fly-inner" style="width:100%;height:100%;">${cardBack()}</div>`;
  document.body.appendChild(fly);
  const inner = fly.firstElementChild;

  const toSlot = `translate(${a.left - m.left}px,${a.top - m.top}px)`;
  // 1) scivola dal mazzo alla zona di destra, ancora coperta
  fly.animate([{ transform: "translate(0,0)" }, { transform: toSlot }],
    { duration: 350, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
  // 2) il giro comincia mentre sta ancora planando: prima meta' di dorso...
  inner.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg)" }],
    { duration: 250, delay: 200, easing: "ease-in", fill: "forwards" });
  setTimeout(() => {
    // ...di taglio si scambia il contenuto, poi si finisce il giro di faccia
    inner.innerHTML = miniCard(card, "drawn");
    if (caption) caption.style.opacity = "";
    revealSpoilers();
    if (token === landingToken) announceDraw(); // sballo o vita persa: subito
    inner.animate([{ transform: "rotateY(-90deg)" }, { transform: "rotateY(0deg)" }],
      { duration: 250, easing: "ease-out", fill: "forwards" });
  }, 450);

  const finish = () => { fly.remove(); settle(); revealSpoilers(); if (caption) caption.style.opacity = ""; };
  const gNow = engine.normalizeGame(store.getRoom().game);
  const parkHere = gNow && gNow.pending && gNow.pending.type === card;
  if (parkHere) {
    // carta azione da assegnare: resta parcheggiata a destra finche'
    // non si sceglie il bersaglio (la copia di markup prende il suo posto)
    setTimeout(() => {
      fly.remove();
      document.querySelectorAll(".bank .fcard.veil").forEach((el) => el.classList.remove("veil"));
      if (token === landingToken) landingActive = false;
      if (caption) caption.style.opacity = "";
      store.refresh(); // la carta azione e' parcheggiata: si vede chi deve scegliere
    }, 750);
    return;
  }
  if (b) {
    // 3) e vola nella mano di chi l'ha pescata; lo spazio nella fila si apre
    //    in modo fluido proprio mentre la carta sta planando
    fly.animate([
      { transform: `${toSlot} scale(1)` },
      { transform: `translate(${b.left - m.left}px,${b.top - m.top}px) scale(${b.width / a.width})` }
    ], { duration: 450, delay: 850, easing: "cubic-bezier(.3,.6,.25,1)", fill: "forwards" }).onfinish = finish;
    setTimeout(openLanding, 1000);
  } else {
    // nessuna destinazione (es. azione risolta al volo): la carta svanisce li'
    fly.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: 300, delay: 900, fill: "forwards" }).onfinish = finish;
  }
  // rete di sicurezza: mai lasciare in giro carte volanti o file collassate
  setTimeout(finish, 1700);
}

// quando il bersaglio viene scelto, la carta parcheggiata a destra completa
// il volo verso il tavolo del bersaglio
let parkedCard = null;
let resolveTargetSid = null;

function checkPendingFlight(g) {
  if (g.status !== "playing" && g.status !== "roundEnd") { parkedCard = null; return; }
  if (g.pending) { parkedCard = g.pending.type; return; }
  if (!parkedCard) return;
  const card = parkedCard;
  parkedCard = null;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = g.lastAction && g.lastAction.type === card ? g.lastAction.target : null;
  landingActive = true;
  const token = ++landingToken;
  resolveTargetSid = target; // il render tiene collassata la carta ricevuta
  deferFrame(() => { runResolveFly(card, token, target); });
}

function runResolveFly(card, token, targetSid) {
  // come nella pescata: prima si apre lo spazio senza ridisegnare...
  const openLanding = () => {
    if (token !== landingToken) return;
    landingActive = false;
    resolveTargetSid = null;
    document.querySelectorAll(".t-seats .fcard.landing").forEach((el) => el.classList.remove("landing"));
  };
  // ...e il ridisegno (chip e comandi tornano a dire il vero) a volo finito
  const settle = () => { openLanding(); store.refresh(); };
  const slot = document.querySelector(".bank .bank-slot:last-child .fcard");
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
  fly.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:60;pointer-events:none;`;
  fly.innerHTML = miniCard(card, "drawn");
  document.body.appendChild(fly);

  const finish = () => { fly.remove(); settle(); };
  if (dest) {
    let b;
    if (landingDest) {
      dest.style.transition = "none";
      dest.classList.remove("landing");
      b = dest.getBoundingClientRect();
      dest.classList.add("landing");
      void dest.offsetWidth;
      dest.style.transition = "";
    } else {
      const r = dest.getBoundingClientRect();
      b = { left: r.left + 10, top: r.top + r.height / 2 - a.height / 2, width: a.width };
    }
    fly.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width})`, opacity: landingDest ? 1 : 0 }
    ], { duration: 450, easing: "cubic-bezier(.3,.6,.25,1)", fill: "forwards" }).onfinish = finish;
    // lo spazio si apre mentre la carta plana e finisce di aprirsi
    // esattamente all'atterraggio: niente scatti al ridisegno
    setTimeout(openLanding, 200);
  } else {
    fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = finish;
  }
  setTimeout(finish, 900);
}

// --- intro / lobby -----------------------------------------------------------
function renderIntro(ctx) {
  return `
    <section class="card empty-state">
      ${fanArt()}
      <h2 class="empty-title">Tavolo online</h2>
      <p class="muted">Qui si gioca a Flip 7 per davvero, ognuno dal suo telefono:
        pesca o fermati, con sballi, Congela, Pesca Tre e Seconda Chance.
        Chi vince prende la Crown come nelle partite dal vivo.</p>
      <button class="btn primary big" data-action="tbl-open">Apri un tavolo</button>
      <p class="hint">Il tavolo si può annullare in qualsiasi momento, senza toccare lo storico.</p>
    </section>`;
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
                <span class="avatar lg" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
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
        <button class="btn ghost small" data-action="tbl-bot">${icon("plus", "tiny")} Aggiungi un bot di prova</button>
        <div class="board-links">
          <button class="ghost-btn" data-action="tbl-stand">${icon("close", "tiny")} Mi alzo</button>
          <button class="ghost-btn danger" data-action="tbl-close">Chiudi il tavolo</button>
        </div>` : `
        <p class="hint">Stai guardando: siediti per giocare.</p>`}
    </section>`;
}

// --- partita -----------------------------------------------------------------
/**
 * La corsa al traguardo: una barra per giocatore, ordinata dal primo
 * all'ultimo. Barra piena = punti incassati, coda chiara = bottino
 * provvisorio del round in corso. La propria riga e' evidenziata.
 */
function raceBoard(g, me) {
  const banked = (sid) => g.seats[sid].total || 0;
  const roundPts = (sid) => (g.status === "playing" && g.hands[sid] && g.hands[sid].out !== "bust")
    ? engine.handPoints(g.hands[sid]) : 0;
  const sorted = [...g.order].sort((a, b) => (banked(b) + roundPts(b)) - (banked(a) + roundPts(a)));
  const max = Math.max(g.target, ...sorted.map((sid) => banked(sid) + roundPts(sid)));
  return `
    <div class="race">
      <div class="race-head"><span>La corsa</span><span>traguardo ${g.target}</span></div>
      ${sorted.map((sid) => {
        const seat = g.seats[sid];
        const b = banked(sid), r = roundPts(sid);
        return `
        <div class="race-row ${sid === me ? "me" : ""}" title="${esc(seat.name)}" data-flip="race:${sid}">
          <span class="avatar xs" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
          <span class="race-track">
            <i style="width:${((b / max) * 100).toFixed(1)}%${sid === me ? `; background:${colorOf(seat.name)}` : ""}"></i>
            ${r ? `<i class="prov" style="width:${((r / max) * 100).toFixed(1)}%${sid === me ? `; background:${colorOf(seat.name)}` : ""}"></i>` : ""}
          </span>
          <b>${b}${r ? `<small>+${r}</small>` : ""}</b>
        </div>`;
      }).join("")}
    </div>`;
}

/** Il banco: mazzo con le carte rimaste e ultima carta pescata. */
function bankRow(g) {
  const last = g.lastDraw;
  // il doppione appena pescato ha fatto sballare: va urlato
  const bustNow = last && g.hands[last.seat] && g.hands[last.seat].out === "bust" && engine.CARD.isNum(last.card);
  return `
    <div class="bank" data-flip="bank">
      <div class="bank-slot">
        <span class="deck-stack">${cardBack()}<b class="deck-count">${g.deck.length}</b></span>
        <small>carte nel mazzo${g.discard.length ? ` · ${g.discard.length} scartate` : ""}</small>
      </div>
      <span class="bank-arrow">${icon("arrowLeft", "flip")}</span>
      <div class="bank-slot">
        ${g.pending
          ? miniCard(g.pending.type, "drawn parked" + (landingActive ? " veil" : ""))
          : `<span class="fcard slot"></span>`}
        <small class="${bustNow ? "bust-note" : last && last.saved ? "saved-note" : ""}${spoilerHold && last ? " spoiler-veil" : ""}">${last
          ? bustNow
            ? `${esc(shortName(g.seats[last.seat]))} pesca il <b>${engine.cardLabel(last.card)}</b> che aveva già: SBALLATO`
            : last.saved
              ? `${esc(shortName(g.seats[last.seat]))} pesca il <b>${engine.cardLabel(last.card)}</b> che aveva già: salvo, Seconda Chance bruciata`
              : `${esc(shortName(g.seats[last.seat]))} ha pescato <b>${engine.cardLabel(last.card)}</b>`
          : "qui si gira la carta pescata"}</small>
      </div>
    </div>`;
}

function renderSeatRow(g, sid, ctx) {
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
  const pts = h.out === "bust" ? 0 : engine.handPoints(h);
  // l'ultima carta pescata si riconosce anche in mano (anello scuro);
  // se era il doppione dello sballo, l'evidenza ce l'ha gia' il doppione rosso
  let just = g.lastDraw && g.lastDraw.seat === sid ? g.lastDraw.card : null;
  if (h.out === "bust" && just === "n" + h.bustCard) just = null;
  const justCls = "mini just" + (landingActive ? " landing" : "");
  const cls = (card) => (card === just ? justCls : "mini");
  // lo sballo di QUESTA pescata resta segreto finche' la carta non si gira
  const bustSpoiler = spoilerHold && h.out === "bust" && g.lastDraw
    && g.lastDraw.seat === sid && g.lastDraw.card === "n" + h.bustCard;
  // doppione annullato dalla Seconda Chance: la nota resta fino alla
  // prossima pescata, cosi' la vita persa non passa inosservata
  const savedHere = g.lastDraw && g.lastDraw.seat === sid && g.lastDraw.saved;
  // due file: sopra azioni e modificatori, sotto tutti i numeri
  const resolvedHere = landingActive && resolveTargetSid === sid;
  const specials = [
    ...(h.x2 ? [miniCard("x2", cls("x2"))] : []),
    ...h.plus.slice().sort((a, b) => a - b).map((p) => miniCard("p" + p, cls("p" + p))),
    // la Seconda Chance bruciata non sparisce: resta in mano spenta
    // ("consumata") per tutto il round. Durante il giro della carta e'
    // ancora accesa (niente spoiler), si spegne al momento del verdetto.
    ...(h.sc ? [miniCard("sc", resolvedHere ? "mini landing" : cls("sc"))]
      : savedHere && spoilerHold ? [miniCard("sc", "mini spoiler-burn")]
      : h.scUsed ? [miniCard("sc", "mini burned")] : [])
  ];
  // chi e' stato congelato mostra la carta Congela ricevuta
  if (h.out === "frozen") specials.push(miniCard("frz", resolvedHere ? "mini landing" : "mini"));
  const nums = h.nums.slice().sort((a, b) => a - b).map((n) => miniCard("n" + n, cls("n" + n)));
  if (h.out === "flip7") nums.push(flip7Card({ size: "mini" }));
  // il doppione che ha sballato resta in vista, marcato in rosso
  if (h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined) {
    nums.push(miniCard("n" + h.bustCard, "mini dup" + (landingActive && g.lastDraw && g.lastDraw.seat === sid ? " landing" : "")));
  }
  // la carta azione sta ancora volando verso questo posto: il verdetto
  // (es. "congelato") e la riga spenta aspettano che atterri
  const outShown = h.out && !resolvedHere;
  const state = outShown ? `<i class="seat-state s-${h.out}${bustSpoiler ? " spoiler-veil" : ""}">${OUT_LABEL[h.out]}</i>`
    : isChoosing ? `<i class="seat-state s-turn">${controls(g, ctx, sid) && !seat.bot ? "scegli tu" : "sta scegliendo"}</i>`
    : isFlip3 ? `<i class="seat-state s-flip3">pesca ancora ${g.flip3.left}</i>`
    : isTurn ? `<i class="seat-state s-turn">${controls(g, ctx, sid) && !seat.bot ? "tocca a te" : "il suo turno"}</i>`
    : g.status === "playing" ? `<i class="seat-state s-wait">in attesa</i>` : "";
  return `
    <li class="seat ${isTurn || isFlip3 || isChoosing ? "turn" : ""} ${outShown ? "out-" + h.out : ""} ${bustSpoiler ? "spoiler-hold" : ""}" data-sid="${sid}" data-flip="seat:${sid}">
      <span class="avatar sm" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
      <div class="seat-main">
        <div class="seat-head"><b>${esc(seat.name)}</b>${state}</div>
        <div class="seat-cards">
          ${specials.length ? `<div class="cards-row special">${specials.join("")}</div>` : ""}
          <div class="cards-row">${nums.join("") || '<span class="hand-empty">nessuna carta in mano</span>'}</div>
          ${h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined
            ? `<span class="dup-note${bustSpoiler ? " spoiler-veil" : ""}">${icon("bomb", "tiny")} doppio ${h.bustCard}: il round vale 0</span>` : ""}
          ${savedHere
            ? `<span class="dup-note saved${spoilerHold ? " spoiler-veil" : ""}">${icon("heartFill", "tiny")} doppio ${engine.CARD.num(g.lastDraw.card)}: salvo, Seconda Chance bruciata</span>` : ""}
        </div>
      </div>
      <div class="seat-pts">
        <b>${seat.total || 0}</b>
        <small class="${h.out === "bust" ? "bust" : pts > 0 ? "up" : ""}${bustSpoiler ? " spoiler-veil" : ""}">+${pts} nel round</small>
      </div>
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
  const actor = actorOf(g);
  const iAct = controls(g, ctx, actor) && !g.seats[actor].bot;

  // il turno sta passando ma la carta e' ancora in volo: i comandi del
  // prossimo compaiono solo ad atterraggio avvenuto (se chi agisce e' lo
  // stesso che ha pescato, es. Pesca Tre, si continua normalmente)
  const hold = flightHold(g);
  if (hold && hold !== actor) {
    const s = g.seats[hold];
    return `<p class="hint">${controls(g, ctx, hold) && !s.bot
      ? "La tua carta sta arrivando…"
      : `La carta di ${esc(shortName(s))} sta arrivando…`}</p>`;
  }

  if (g.pending) {
    const p = g.pending;
    if (iAct) {
      return actionBox(g, p.type, "Hai pescato una carta azione: decidi tu", `
        <p class="choose-label">${ACTION_META[p.type].ask}</p>
        <div class="pgrid">
          ${p.options.map((sid) => `
            <button class="pg" data-action="tbl-target" data-id="${sid}">
              <span class="pg-ava ${sid === p.chooser ? "holo-ring" : ""}" style="--pc:${colorOf(g.seats[sid].name)}">
                <span class="avatar lg" style="background:${colorOf(g.seats[sid].name)}">${initials(g.seats[sid].name)}</span>
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
    return actionBox(g, "fl3", controls(g, ctx, t) && !g.seats[t].bot
      ? `Peschi ${left}: arrivano da sole…`
      : `${esc(shortName(g.seats[t]))} pesca ${left}: arrivano da sole…`);
  }

  if (iAct && !g.hands[actor].out) {
    if (emptyHand(g.hands[actor])) return `<p class="hint">Mano vuota: la prima carta arriva da sola…</p>`;
    return `
      <div class="table-actions">
        <button class="btn go big" data-action="tbl-hit">Pesca</button>
        <button class="btn stop big" data-action="tbl-stay">Mi fermo · +${engine.handPoints(g.hands[actor])}</button>
      </div>`;
  }
  if (me && g.hands[me] && g.hands[me].out) return `<p class="hint">Sei ${OUT_LABEL[g.hands[me].out] || "fuori"}: aspetta la fine del round.</p>`;
  if (!me) return `<p class="hint">Stai guardando la partita.</p>`;
  return `<p class="hint">Aspetta il tuo turno…</p>`;
}

/** Il mio posto sta SEMPRE in cima alla lista, chiunque sia a iniziare. */
const seatOrder = (g, me) => (me ? [me, ...g.order.filter((sid) => sid !== me)] : g.order);

function renderPlaying(g, ctx) {
  const me = mySeat(g, ctx);
  return `
    <div class="table-wrap" style="--seats:${g.order.length}">
      <section class="card t-side">
        <div class="seat-controls">${renderControls(g, ctx, me)}</div>
        ${bankRow(g)}
        ${raceBoard(g, me)}
      </section>
      <section class="card t-seats">
        <div class="card-head">
          <span class="round-head"><span class="round-word">Round</span>${roundCard(g.round)}</span>
          <span class="round-meta ml-auto"><b>${g.order.length} giocatori</b><span>si vince a ${g.target}</span></span>
        </div>
        <ul class="seats">
          ${seatOrder(g, me).map((sid) => renderSeatRow(g, sid, ctx)).join("")}
        </ul>
        <div class="board-links center-links">
          ${me ? `<button class="ghost-btn" data-action="tbl-leave">Abbandono la partita</button>` : ""}
          <button class="ghost-btn danger" data-action="tbl-close">Annulla il tavolo</button>
        </div>
      </section>
    </div>`;
}

/**
 * Fine round SENZA schermata di riepilogo: si resta sul tavolo con le mani
 * in vista (sballi compresi) e si riparte da li' col bottone verde.
 */
function renderRoundEnd(g, ctx) {
  const me = mySeat(g, ctx);
  const f7 = g.order.find((sid) => g.hands[sid].out === "flip7");
  const buster = g.lastDraw && g.hands[g.lastDraw.seat] && g.hands[g.lastDraw.seat].out === "bust" ? g.lastDraw.seat : null;
  const sub = f7 ? `FLIP 7 di ${shortName(g.seats[f7])}: +15 e round chiuso per tutti`
    : g.endReason === "deck" ? "le carte sono finite: chi era in gioco incassa d'ufficio"
    : buster ? `lo sballo di ${shortName(g.seats[buster])} chiude il giro: punti incassati`
    : "tutti fermi, congelati o sballati: punti incassati";
  return `
    <div class="table-wrap" style="--seats:${g.order.length}">
      <section class="card t-side">
        <div class="turn-strip end">
          <div class="ts-txt ${spoilerHold && buster ? "spoiler-veil" : ""}"><b>Round ${g.round} chiuso</b><small>${esc(sub)}</small></div>
        </div>
        <div class="seat-controls">
          ${me ? `<button class="btn go big pulse" data-action="tbl-nextround">Via al round ${g.round + 1} →</button>` : `<p class="hint">Si aspetta che qualcuno apra il round ${g.round + 1}…</p>`}
          <p class="hint">Basta che uno lo prema: il round parte per tutti in diretta.</p>
        </div>
        ${bankRow(g)}
        ${raceBoard(g, me)}
      </section>
      <section class="card t-seats">
        <div class="card-head">
          <span class="round-head"><span class="round-word">Round</span>${roundCard(g.round)}</span>
          <span class="round-meta ml-auto"><b class="done-note">round chiuso</b><span>si vince a ${g.target}</span></span>
        </div>
        <ul class="seats">
          ${seatOrder(g, me).map((sid) => renderSeatRow(g, sid, ctx)).join("")}
        </ul>
        <div class="board-links center-links">
          ${me ? `<button class="ghost-btn" data-action="tbl-leave">Abbandono la partita</button>` : ""}
          <button class="ghost-btn danger" data-action="tbl-close">Annulla il tavolo</button>
        </div>
      </section>
    </div>`;
}

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
      ${me ? `
        <button class="btn primary big" data-action="tbl-save">Salva nello storico (vale una Crown)</button>
        <button class="ghost-btn" data-action="tbl-close">Chiudi senza salvare</button>` : ""}
    </section>`;
}

/**
 * Tavolo fermo da ore: chi entra lo vede subito e puo' liberarlo con un
 * tocco, cosi' una partita lasciata a meta' non blocca le successive.
 */
const STALE_MS = 3 * 36e5; // 3 ore senza mosse
function staleNotice(g) {
  if (!g.updatedAt || Date.now() - g.updatedAt < STALE_MS) return "";
  return `
    <section class="card stale-card">
      <p class="muted small">Ultima mossa <b>${relTime(g.updatedAt)}</b>: questo tavolo
        sembra abbandonato. Puoi guardarlo, oppure chiuderlo per aprirne uno nuovo
        (lo storico non si tocca).</p>
      <button class="btn danger" data-action="tbl-close">Chiudi il tavolo abbandonato</button>
    </section>`;
}

// --- export ------------------------------------------------------------------
export const tableView = {
  render(ctx) {
    const g = game(ctx);
    if (!g) return renderIntro(ctx);
    if (g.status === "playing") scheduleAuto(ctx);
    if (g.status === "playing" || g.status === "roundEnd") scheduleDrawAnim(g);
    checkPendingFlight(g);
    const stale = staleNotice(g);
    if (g.status === "lobby") return stale + renderLobby(g, ctx);
    if (g.status === "roundEnd") return stale + renderRoundEnd(g, ctx);
    if (g.status === "over") return stale + renderOver(g, ctx);
    return stale + renderPlaying(g, ctx);
  },

  actions: {
    "tbl-open"(ctx) {
      return store.commitGame(engine.createLobby(ctx.room.meta.targetScore || 200));
    },
    async "tbl-sit"(ctx) {
      const g = game(ctx);
      if (!g || g.status !== "lobby") return;
      // se l'account e' gia' collegato a un giocatore, ci si siede come lui
      const bound = ctx.status.mode === "firebase" ? store.myPlayerId() : null;
      if (bound && ctx.room.players[bound]) {
        const sid = ctx.status.uid;
        const s2 = structuredClone(g);
        s2.seats[sid] = { uid: ctx.status.uid, name: ctx.room.players[bound].name, playerId: bound, total: 0 };
        if (!s2.order.includes(sid)) s2.order = [...s2.order, sid];
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
      return store.commitGame(s2);
    },
    "tbl-bot"(ctx) {
      const g = game(ctx);
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
      const g = game(ctx);
      const sid = el.dataset.id;
      if (!g || g.status !== "lobby" || !g.seats[sid] || !g.seats[sid].bot) return;
      const s2 = structuredClone(g);
      delete s2.seats[sid];
      s2.order = s2.order.filter((x) => x !== sid);
      return store.commitGame(s2);
    },
    async "tbl-leave"(ctx) {
      const g = game(ctx);
      const me = mySeat(g, ctx);
      if (!g || !me || g.status === "lobby") return;
      const ok = await askConfirm("Abbandonare la partita?", {
        message: g.order.length <= 2
          ? "Resterebbe una persona sola: la partita finirebbe subito."
          : "Le tue carte vanno negli scarti e il tavolo continua senza di te.",
        confirmLabel: "Abbandona", danger: true
      });
      if (!ok) return;
      const next = engine.leaveSeat(g, me);
      // se restano solo bot il tavolo non ha piu' senso: si chiude
      if (next.order.every((sid) => next.seats[sid].bot)) {
        toast("Restavano solo bot: tavolo chiuso");
        return store.commitGame(null);
      }
      return store.commitGame(next);
    },
    "tbl-stand"(ctx) {
      const g = game(ctx);
      const me = mySeat(g, ctx);
      if (!g || g.status !== "lobby" || !me) return;
      const s2 = structuredClone(g);
      delete s2.seats[me];
      s2.order = s2.order.filter((sid) => sid !== me);
      return store.commitGame(s2);
    },
    "tbl-start"(ctx) {
      const g = game(ctx);
      if (!g) return;
      try { return store.commitGame(engine.startGame(g)); }
      catch (e) { toast(e.message, "warn"); }
    },
    "tbl-hit"(ctx) {
      const g = game(ctx);
      if (!g) return;
      const actor = actorOf(g);
      if (!controls(g, ctx, actor)) return;
      const next = engine.hit(g, actor);
      if (next !== g) return store.commitGame(next);
    },
    "tbl-stay"(ctx) {
      const g = game(ctx);
      if (!g) return;
      const actor = actorOf(g);
      if (!controls(g, ctx, actor)) return;
      const next = engine.stay(g, actor);
      if (next !== g) return store.commitGame(next);
    },
    "tbl-target"(ctx, el) {
      const g = game(ctx);
      if (!g || !g.pending) return;
      if (!controls(g, ctx, g.pending.chooser)) return;
      const next = engine.chooseTarget(g, g.pending.chooser, el.dataset.id);
      if (next !== g) return store.commitGame(next);
    },
    "tbl-nextround"(ctx) {
      const g = game(ctx);
      if (!g || g.status !== "roundEnd") return;
      return store.commitGame(engine.nextRound(g));
    },
    async "tbl-save"(ctx) {
      const g = game(ctx);
      if (!g || g.status !== "over") return;
      await store.saveOnlineGame(g);
      toast("Partita salvata: Crown assegnata");
      location.hash = "#classifica";
    },
    async "tbl-close"(ctx) {
      const ok = await askConfirm("Annullare il tavolo?", { message: "La partita online in corso andrà persa (lo storico non si tocca).", confirmLabel: "Annulla tavolo", danger: true });
      if (ok) return store.commitGame(null);
    }
  },

  changes: {}
};
