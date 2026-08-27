// ---------------------------------------------------------------------------
// Vista "Tavolo": la partita online vera e propria, separata dal segnapunti.
// Lo stato del gioco vive in room.game; le mosse passano dal motore puro
// (js/game.js) e vengono scritte per intero: tutti vedono la stessa cosa.
// Layout: su mobile tutto in colonna (turno, banco, posti, comandi in basso);
// su desktop due colonne, con banco e comandi a sinistra e i posti a destra.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, initials, colorOf, toast, askText, askConfirm, askChoice } from "../ui.js";
import { icon, wordmark, crownEmblem, fanArt, numberCard, modCard, roundCard, cardBack } from "../icons.js";
import * as engine from "../game.js";

const OUT_LABEL = { stay: "si è fermato", frozen: "congelato", bust: "sballato", flip7: "FLIP 7" };
const ACTION_NAME = { frz: "Congela", fl3: "Pesca Tre", sc: "Seconda Chance" };
const BOT_NAMES = ["Bot Ada", "Bot Bruno", "Bot Carla", "Bot Dina"];
let botTimer = null;

const game = (ctx) => engine.normalizeGame(ctx.room.game);
const mySeat = (g, ctx) => g && g.order.find((sid) => g.seats[sid] && g.seats[sid].uid === ctx.status.uid);
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
  }, 900);
}

function miniCard(c, cls = "mini") {
  if (engine.CARD.isNum(c)) return numberCard(engine.CARD.num(c), { on: true, size: cls });
  if (engine.CARD.isPlus(c)) return modCard(engine.CARD.plus(c), { on: true, size: cls });
  if (engine.CARD.isX2(c)) return modCard("x2", { on: true, size: cls });
  if (c === "sc") return `<span class="fcard sc on ${cls}"><b>SC</b></span>`;
  if (c === "frz") return `<span class="fcard frz on ${cls}"><b>FRZ</b></span>`;
  return `<span class="fcard f3 on ${cls}"><b>F3</b></span>`;
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
/** Striscia sempre visibile: chi deve agire adesso e cosa deve fare. */
function turnStrip(g, ctx) {
  const actor = actorOf(g);
  const seat = g.seats[actor];
  const mine = controls(g, ctx, actor) && !seat.bot;
  let title, sub;
  if (g.pending) {
    const what = ACTION_NAME[g.pending.type];
    title = mine ? `Scegli tu: ${what}` : `Sceglie ${shortName(seat)}`;
    sub = mine ? "decidi il bersaglio qui sotto" : `sta scegliendo il bersaglio di ${what}`;
  } else if (g.flip3) {
    const n = g.flip3.left;
    title = mine ? "Pesca Tre: tocca a te" : `Pesca Tre: ${shortName(seat)}`;
    sub = `${mine ? "devi" : "deve"} pescare ancora ${n} ${n === 1 ? "carta" : "carte"}`;
  } else {
    title = mine ? "Tocca a te" : `Tocca a ${shortName(seat)}`;
    sub = mine
      ? (emptyHand(g.hands[actor]) ? "la prima carta arriva da sola" : "pesca (un numero doppio ti sballa) o fermati e incassa")
      : "sta decidendo se pescare o fermarsi";
  }
  if (seat.bot) sub = "il bot gioca da solo, un attimo";
  if (g.flip3) sub = `le pescate partono da sole · ancora ${g.flip3.left}`;
  return `
    <div class="turn-strip ${mine ? "you holo" : ""}">
      ${mine ? '<span class="holo-sweep" aria-hidden="true"></span>' : ""}
      <span class="avatar" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
      <div class="ts-txt"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
    </div>`;
}

/** Il banco: mazzo con le carte rimaste e ultima carta pescata. */
function bankRow(g) {
  const last = g.lastDraw;
  // il doppione appena pescato ha fatto sballare: va urlato
  const bustNow = last && g.hands[last.seat] && g.hands[last.seat].out === "bust" && engine.CARD.isNum(last.card);
  return `
    <div class="bank">
      <div class="bank-slot">
        <span class="deck-stack">${cardBack()}</span>
        <small><b>${g.deck.length}</b> nel mazzo</small>
      </div>
      <span class="bank-arrow">${icon("arrowLeft", "flip")}</span>
      <div class="bank-slot">
        ${last ? miniCard(last.card, "drawn" + (bustNow ? " bust-draw" : "")) : `<span class="fcard slot"></span>`}
        <small class="${bustNow ? "bust-note" : ""}">${last
          ? bustNow
            ? `${esc(shortName(g.seats[last.seat]))} pesca il <b>${engine.cardLabel(last.card)}</b> che aveva già: SBALLATO`
            : `${esc(shortName(g.seats[last.seat]))} ha pescato <b>${engine.cardLabel(last.card)}</b>`
          : "qui compare l'ultima carta pescata"}</small>
      </div>
    </div>`;
}

function renderSeatRow(g, sid, ctx) {
  const seat = g.seats[sid];
  const h = g.hands[sid];
  const isTurn = g.status === "playing" && !g.pending && !g.flip3 && g.turn === sid && !h.out;
  const isFlip3 = g.flip3 && g.flip3.target === sid;
  const pts = h.out === "bust" ? 0 : engine.handPoints(h);
  // due file: sopra azioni e modificatori, sotto tutti i numeri
  const specials = [
    ...(h.x2 ? [miniCard("x2")] : []),
    ...h.plus.slice().sort((a, b) => a - b).map((p) => miniCard("p" + p)),
    ...(h.sc ? [miniCard("sc")] : [])
  ];
  const nums = h.nums.slice().sort((a, b) => a - b).map((n) => miniCard("n" + n));
  // il doppione che ha sballato resta in vista, marcato in rosso
  if (h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined) {
    nums.push(miniCard("n" + h.bustCard, "mini dup"));
  }
  const state = h.out ? `<i class="seat-state s-${h.out}">${OUT_LABEL[h.out]}</i>`
    : isFlip3 ? `<i class="seat-state s-flip3">pesca ancora ${g.flip3.left}</i>`
    : isTurn ? `<i class="seat-state s-turn">${controls(g, ctx, sid) && !seat.bot ? "tocca a te" : "il suo turno"}</i>` : "";
  return `
    <li class="seat ${isTurn || isFlip3 ? "turn" : ""} ${h.out ? "out-" + h.out : ""}">
      <span class="avatar sm" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
      <div class="seat-main">
        <div class="seat-head"><b>${esc(seat.name)}</b>${state}</div>
        <div class="seat-cards">
          ${specials.length ? `<div class="cards-row special">${specials.join("")}</div>` : ""}
          <div class="cards-row">${nums.join("") || '<span class="hand-empty">nessuna carta in mano</span>'}</div>
          ${h.out === "bust" && h.bustCard !== null && h.bustCard !== undefined
            ? `<span class="dup-note">${icon("bomb", "tiny")} doppio ${h.bustCard}: il round vale 0</span>` : ""}
        </div>
      </div>
      <div class="seat-pts">
        <b>${seat.total || 0}</b>
        <small class="${h.out === "bust" ? "bust" : pts > 0 ? "up" : ""}">+${pts} nel round</small>
      </div>
    </li>`;
}

function renderControls(g, ctx, me) {
  const actor = actorOf(g);
  const iAct = controls(g, ctx, actor) && !g.seats[actor].bot;

  if (g.pending) {
    const p = g.pending;
    if (iAct) {
      const label = { frz: "Chi vuoi congelare?", fl3: "Chi deve pescare tre carte?", sc: "A chi regali la Seconda Chance?" }[p.type];
      return `
        <div class="table-choose">
          <p class="choose-label">${label}</p>
          <div class="pgrid">
            ${p.options.map((sid) => `
              <button class="pg" data-action="tbl-target" data-id="${sid}">
                <span class="pg-ava" style="--pc:${colorOf(g.seats[sid].name)}">
                  <span class="avatar lg" style="background:${colorOf(g.seats[sid].name)}">${initials(g.seats[sid].name)}</span>
                </span>
                <span class="pg-name">${sid === p.chooser ? "me stesso" : esc(g.seats[sid].name)}</span>
              </button>`).join("")}
          </div>
        </div>`;
    }
    return `<p class="hint">${esc(g.seats[p.chooser].name)} sta scegliendo…</p>`;
  }

  if (g.flip3) {
    return `<p class="hint">Pesca Tre: le carte di ${esc(shortName(g.seats[g.flip3.target]))} arrivano da sole (ancora ${g.flip3.left})…</p>`;
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

function renderPlaying(g, ctx) {
  const me = mySeat(g, ctx);
  return `
    <div class="table-wrap">
      <section class="card t-side">
        ${turnStrip(g, ctx)}
        ${bankRow(g)}
        ${g.log.length ? `<div class="table-log">${g.log.slice(-3).map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : ""}
      </section>
      <section class="card t-seats">
        <div class="card-head">
          <span class="round-head"><span class="round-word">Round</span>${roundCard(g.round)}</span>
          <span class="round-meta ml-auto"><b>${g.order.length} giocatori</b><span>si vince a ${g.target}</span></span>
        </div>
        <ul class="seats">
          ${g.order.map((sid) => renderSeatRow(g, sid, ctx)).join("")}
        </ul>
      </section>
      <section class="card t-controls">
        ${renderControls(g, ctx, me)}
        <div class="board-links center-links">
          ${me ? `<button class="ghost-btn" data-action="tbl-leave">Abbandono la partita</button>` : ""}
          <button class="ghost-btn danger" data-action="tbl-close">Annulla il tavolo</button>
        </div>
      </section>
    </div>`;
}

function renderRoundEnd(g, ctx) {
  const me = mySeat(g, ctx);
  const rows = g.order.map((sid) => ({ sid, seat: g.seats[sid], pts: (g.lastRound || {})[sid] || 0 }))
    .sort((a, b) => (b.seat.total || 0) - (a.seat.total || 0));
  const lead = rows[0];
  const left = lead ? Math.max(0, g.target - (lead.seat.total || 0)) : 0;
  return `
    <section class="card">
      <div class="card-head">
        <span class="round-head"><span class="round-word">Round</span>${roundCard(g.round)}</span>
        <span class="round-meta ml-auto"><b class="done-note">round finito</b><span>si vince a ${g.target}</span></span>
      </div>
      <ul class="mini-list">
        ${rows.map(({ seat, pts }) => `
          <li><span class="mini-name"><span class="avatar xs" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>${esc(seat.name)}
            <small class="${pts ? "done-note" : "muted"}">+${pts}</small></span><b>${seat.total || 0}</b></li>`).join("")}
      </ul>
      ${lead ? `<p class="hint">${esc(shortName(lead.seat))} è in testa: gli mancano ${left} punti al traguardo.</p>` : ""}
      ${me ? `<button class="btn primary big" data-action="tbl-nextround">Via al round ${g.round + 1}</button>` : ""}
      <div class="board-links center-links">
        ${me ? `<button class="ghost-btn" data-action="tbl-leave">Abbandono la partita</button>` : ""}
        <button class="ghost-btn danger" data-action="tbl-close">Annulla il tavolo</button>
      </div>
    </section>`;
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

// --- export ------------------------------------------------------------------
export const tableView = {
  render(ctx) {
    const g = game(ctx);
    if (!g) return renderIntro(ctx);
    if (g.status === "playing") scheduleAuto(ctx);
    if (g.status === "lobby") return renderLobby(g, ctx);
    if (g.status === "roundEnd") return renderRoundEnd(g, ctx);
    if (g.status === "over") return renderOver(g, ctx);
    return renderPlaying(g, ctx);
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
