// ---------------------------------------------------------------------------
// Vista "Tavolo": la partita online vera e propria, separata dal segnapunti.
// Lo stato del gioco vive in room.game; le mosse passano dal motore puro
// (js/game.js) e vengono scritte per intero: tutti vedono la stessa cosa.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, initials, colorOf, toast, askText, askConfirm, askChoice } from "../ui.js";
import { icon, wordmark, crownEmblem, fanArt, numberCard, modCard } from "../icons.js";
import * as engine from "../game.js";

const OUT_LABEL = { stay: "sta", frozen: "congelato", bust: "sballato", flip7: "FLIP 7" };

const game = (ctx) => engine.normalizeGame(ctx.room.game);
const mySeat = (g, ctx) => g && g.order.find((sid) => g.seats[sid] && g.seats[sid].uid === ctx.status.uid);

/** Chi deve agire adesso (turno, bersaglio del Pesca Tre o chi sta scegliendo). */
const actorOf = (g) => g.pending ? g.pending.chooser : g.flip3 ? g.flip3.target : g.turn;

/** true se il posto indicato e' controllato da questo dispositivo
    (in locale tutti i posti sono tuoi: si gioca passandosi il telefono). */
const controls = (g, ctx, sid) => Boolean(g.seats[sid] && g.seats[sid].uid === ctx.status.uid);

function miniCard(c, cls = "mini") {
  if (engine.CARD.isNum(c)) return numberCard(engine.CARD.num(c), { on: true, size: cls });
  if (engine.CARD.isPlus(c)) return modCard(engine.CARD.plus(c), { on: true, size: cls });
  if (engine.CARD.isX2(c)) return modCard("x2", { on: true, size: cls });
  if (c === "sc") return `<span class="fcard sc on ${cls}" data-face="SC"><b>SC</b></span>`;
  if (c === "frz") return `<span class="fcard frz on ${cls}" data-face="❄"><b>❄</b></span>`;
  return `<span class="fcard f3 on ${cls}" data-face="F3"><b>F3</b></span>`;
}

// --- intro / lobby -----------------------------------------------------------
function renderIntro(ctx) {
  return `
    <section class="card empty-state">
      ${fanArt()}
      <h2 class="empty-title">Tavolo online</h2>
      <p class="muted">Qui si gioca a Flip 7 per davvero, ognuno dal suo telefono:
        carte, sballi, Congela, Pesca Tre e Seconda Chance — con le regole ufficiali.
        Chi vince prende la Crown come nelle partite dal vivo.</p>
      <button class="btn primary big" data-action="tbl-open">Apri un tavolo</button>
    </section>`;
}

function renderLobby(g, ctx) {
  const seated = mySeat(g, ctx);
  return `
    <section class="card">
      <div class="card-head">
        <h2 class="section-title">Tavolo aperto</h2>
        <span class="count-pill ml-auto">${g.order.length} seduti</span>
      </div>
      <p class="muted small">Ognuno si siede dal proprio telefono. Si parte in ${g.order.length >= 2 ? "qualsiasi momento" : "2 o più"};
        si vince a <b>${g.target}</b> punti.</p>
      <div class="pgrid">
        ${g.order.map((sid) => {
          const seat = g.seats[sid];
          return `
            <span class="pg on">
              <span class="pg-ava" style="--pc:${colorOf(seat.name)}">
                <span class="avatar lg" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
                <i class="pg-check">${icon("check", "tiny")}</i>
              </span>
              <span class="pg-name">${esc(seat.name)}</span>
            </span>`;
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
        <div class="board-links">
          <button class="ghost-btn" data-action="tbl-stand">${icon("close", "tiny")} Mi alzo</button>
          <button class="ghost-btn danger" data-action="tbl-close">Chiudi il tavolo</button>
        </div>` : `
        <p class="hint">Stai guardando: siediti per giocare.</p>`}
    </section>`;
}

// --- partita -----------------------------------------------------------------
function renderSeatRow(g, sid, ctx, me) {
  const seat = g.seats[sid];
  const h = g.hands[sid];
  const isTurn = g.status === "playing" && !g.pending && !g.flip3 && g.turn === sid && !h.out;
  const isFlip3 = g.flip3 && g.flip3.target === sid;
  const pts = h.out === "bust" ? 0 : engine.handPoints(h);
  const cards = [
    ...h.nums.slice().sort((a, b) => a - b).map((n) => miniCard("n" + n)),
    ...(h.x2 ? [miniCard("x2")] : []),
    ...h.plus.map((p) => miniCard("p" + p)),
    ...(h.sc ? [miniCard("sc")] : [])
  ];
  return `
    <li class="seat ${isTurn || isFlip3 ? "turn" : ""} ${h.out ? "out-" + h.out : ""} ${sid === me ? "me" : ""}">
      <span class="avatar sm" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>
      <div class="seat-main">
        <div class="seat-head">
          <b>${esc(seat.name)}</b>
          ${h.out ? `<i class="seat-state s-${h.out}">${OUT_LABEL[h.out]}</i>` : isFlip3 ? `<i class="seat-state s-flip3">pesca ${g.flip3.left}</i>` : isTurn ? `<i class="seat-state s-turn">tocca a ${sid === me ? "te" : (seat.name.split(" ")[0] || "")}</i>` : ""}
        </div>
        <div class="seat-cards">${cards.join("") || '<span class="hand-empty">nessuna carta</span>'}</div>
      </div>
      <div class="seat-pts">
        <b class="${h.out === "bust" ? "bust" : ""}">${pts}</b>
        <small>tot ${seat.total || 0}</small>
      </div>
    </li>`;
}

function renderControls(g, ctx, me) {
  const actor = actorOf(g);
  const iAct = controls(g, ctx, actor);

  if (g.pending) {
    const p = g.pending;
    if (iAct) {
      const label = { frz: "Chi vuoi congelare?", fl3: "Chi deve pescare tre carte?", sc: "A chi regali la Seconda Chance?" }[p.type];
      return `
        <div class="table-choose">
          <p class="choose-label">${label}</p>
          <div class="chips">
            ${p.options.map((sid) => `<button class="chip" data-action="tbl-target" data-id="${sid}">
              <span class="avatar xs" style="background:${colorOf(g.seats[sid].name)}">${initials(g.seats[sid].name)}</span>${sid === p.chooser ? "me stesso" : esc(g.seats[sid].name)}</button>`).join("")}
          </div>
        </div>`;
    }
    return `<p class="hint">${esc(g.seats[p.chooser].name)} sta scegliendo…</p>`;
  }

  if (g.flip3) {
    if (iAct && !g.hands[actor].out) {
      return `<button class="btn primary big" data-action="tbl-hit">Pesca — ancora ${g.flip3.left}</button>`;
    }
    return `<p class="hint">${esc(g.seats[g.flip3.target].name)} deve pescare ancora ${g.flip3.left}…</p>`;
  }

  if (iAct && !g.hands[actor].out) {
    return `
      <div class="table-actions">
        <button class="btn primary big" data-action="tbl-hit">Pesca</button>
        <button class="btn big" data-action="tbl-stay">Mi fermo · ${engine.handPoints(g.hands[actor])} punti</button>
      </div>`;
  }
  if (me && g.hands[me] && g.hands[me].out) return `<p class="hint">Sei ${OUT_LABEL[g.hands[me].out] || "fuori"}: aspetta la fine del round.</p>`;
  if (!me) return `<p class="hint">Stai guardando la partita.</p>`;
  return `<p class="hint">Tocca a ${esc(g.seats[g.turn].name)}…</p>`;
}

function renderPlaying(g, ctx) {
  const me = mySeat(g, ctx);
  const last = g.lastDraw;
  return `
    <section class="card board">
      <div class="board-head">
        <span class="round-head"><span class="round-word">Round</span>${engine.cardLabel("n1") ? "" : ""}
          <span class="fcard round-card n${((g.round - 1) % 12) + 1}" data-face="${g.round}"><b>${g.round}</b></span></span>
        <span class="round-meta">si vince a ${g.target}<br>${g.deck.length} carte nel mazzo</span>
      </div>
      ${last ? `
        <div class="last-draw">
          <span class="ld-card">${miniCard(last.card, "")}</span>
          <span class="ld-txt"><b>${esc(g.seats[last.seat].name)}</b> pesca ${engine.cardLabel(last.card)}</span>
        </div>` : ""}
      <ul class="seats">
        ${g.order.map((sid) => renderSeatRow(g, sid, ctx, me)).join("")}
      </ul>
      <div class="table-foot">${renderControls(g, ctx, me)}</div>
      ${g.log.length ? `<div class="table-log">${g.log.slice(-3).map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : ""}
    </section>`;
}

function renderRoundEnd(g, ctx) {
  const me = mySeat(g, ctx);
  const rows = g.order.map((sid) => ({ sid, seat: g.seats[sid], pts: (g.lastRound || {})[sid] || 0 }))
    .sort((a, b) => (b.seat.total || 0) - (a.seat.total || 0));
  return `
    <section class="card">
      <div class="card-head"><h2 class="section-title">Round ${g.round} finito</h2></div>
      <ul class="mini-list">
        ${rows.map(({ seat, pts }) => `
          <li><span class="mini-name"><span class="avatar xs" style="background:${colorOf(seat.name)}">${initials(seat.name)}</span>${esc(seat.name)}
            <small class="muted">+${pts}</small></span><b>${seat.total || 0}</b></li>`).join("")}
      </ul>
      ${me ? `<button class="btn primary big" data-action="tbl-nextround">Round ${g.round + 1}</button>` : ""}
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
      const ok = await askConfirm("Chiudere il tavolo?", { message: "La partita online in corso andrà persa (lo storico non si tocca).", confirmLabel: "Chiudi tavolo", danger: true });
      if (ok) return store.commitGame(null);
    }
  },

  changes: {}
};
