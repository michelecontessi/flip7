// ---------------------------------------------------------------------------
// Vista "Partita".
// Un solo tabellone (Giocatore | Round | Totale) e un solo pulsante alla volta:
// "Segna i punti" finche' mancano giocatori, poi "Chiudi round".
// L'inserimento scorre da un giocatore all'altro senza chiudere il pannello.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, initials, colorOf, toast, openSheet, closeSheet, askText, askConfirm, askChoice, shareRoom, sheet, fmtDate } from "../ui.js";
import { icon, wordmark, crownEmblem, numberCard, roundCard, modCard, bustCard, flip7Card } from "../icons.js";
import { NUMBER_CARDS, PLUS_MODIFIERS, computeRound, formulaOf, emptyEntry, isBlankEntry } from "../scoring.js";
import { liveStandings, orderedPlayerIds, roundKey, roundsPlayed } from "../stats.js";

const localState = { selected: null, target: null, showRounds: false, mode: "cards" };

const activePlayers = (room) => Object.entries(room.players || {})
  .filter(([, p]) => !p.archived)
  .sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));

const nameOf = (room, live, pid) =>
  (room.players[pid] && room.players[pid].name) || (live && live.names && live.names[pid]) || "?";

const entryOf = (live, pid, r) => (live.scores && live.scores[pid] && live.scores[pid][roundKey(r)]) || null;

/** Ordine di inserimento: quello del tavolo, non della classifica. */
const boardOrder = (live) => orderedPlayerIds(live);

function missingIds(live) {
  const r = live.round || 0;
  return boardOrder(live).filter((pid) => !entryOf(live, pid, r));
}

// ---------------------------------------------------------------------------
// Schermata senza partita
// ---------------------------------------------------------------------------
function renderIdle(room, me) {
  const list = activePlayers(room);
  const isSK = store.isScorekeeper();
  if (localState.selected === null) {
    localState.selected = new Set(prefs.get("lastLineup", []).filter((id) => room.players[id] && !room.players[id].archived));
  }
  const target = localState.target ?? (room.meta.targetScore || 200);
  const last = Object.entries(room.history || {}).sort((a, b) => (b[1].playedAt || 0) - (a[1].playedAt || 0))[0];

  if (!isSK) {
    return `
      ${whoAmIBanner(room, me)}
      <section class="card empty-state">
        <div class="empty-ico">${icon("cardFan")}</div>
        <h2 class="empty-title">Nessuna partita in corso</h2>
        <p class="muted">Il tabellone comparirà qui appena il segnapunti la avvia.</p>
      </section>
      ${last ? renderRecapCard(last[1]) : ""}`;
  }

  const lineup = [...localState.selected].map((id) => room.players[id] && room.players[id].name).filter(Boolean);

  return `
    ${whoAmIBanner(room, me)}
    <section class="card">
      <h2 class="section-title">Nuova partita</h2>
      <p class="muted small">Tocca chi gioca stasera.</p>
      <div class="pgrid">
        ${list.map(([id, p]) => `
          <button class="pg ${localState.selected.has(id) ? "on" : ""}" data-action="toggle-lineup" data-id="${id}">
            <span class="pg-ava" style="--pc:${colorOf(p.name)}">
              <span class="avatar lg" style="background:${colorOf(p.name)}">${initials(p.name)}</span>
              <i class="pg-check">${icon("check", "tiny")}</i>
            </span>
            <span class="pg-name">${esc(p.name)}</span>
          </button>`).join("")}
        <button class="pg add" data-action="quick-add-player">
          <span class="pg-ava"><span class="avatar lg ghost">${icon("plus")}</span></span>
          <span class="pg-name muted">aggiungi</span>
        </button>
      </div>

      <label class="field inline">
        <span>Si vince a</span>
        <input type="number" min="10" step="10" value="${target}" data-change="target-input" inputmode="numeric">
      </label>

      <button class="btn primary big" data-action="start-game" ${localState.selected.size < 2 ? "disabled" : ""}>
        ${localState.selected.size < 2 ? "Scegli almeno 2 giocatori" : `Inizia partita · ${lineup.length} giocatori`}
      </button>
    </section>
    ${last ? renderRecapCard(last[1]) : ""}`;
}

function renderRecapCard(game) {
  const rows = Object.entries(game.results || {}).sort((a, b) => b[1].total - a[1].total);
  return `
    <section class="card">
      <div class="card-head">
        <h2 class="section-title">Ultima partita</h2>
        <span class="muted small ml-auto">${fmtDate(game.playedAt)}</span>
      </div>
      <ul class="mini-list">
        ${rows.map(([id, r]) => `
          <li>
            <span class="mini-name">${game.winnerIds && game.winnerIds[id] ? icon("crownFill", "gold tiny") : `<i class="dot-empty"></i>`}${esc(r.name)}</span>
            <b>${r.total}</b>
          </li>`).join("")}
      </ul>
      <button class="btn" data-action="replay-last" data-id="${game.id || ""}">Rigioca con gli stessi</button>
    </section>`;
}

/** Blocco ben visibile per assegnare/prendere il ruolo di segnapunti. */
function scorekeeperCard(room) {
  if (store.isScorekeeper()) return "";
  const sk = room.control;
  if (!sk || !sk.uid) {
    return `
      <section class="card sk-card">
        <h2 class="section-title">Chi segna i punti?</h2>
        <p class="muted small">Un solo dispositivo inserisce i punteggi: tutti gli altri
          seguono il tabellone in diretta, senza dover toccare niente.</p>
        <button class="btn primary big" data-action="sk-claim">Segno io i punti</button>
      </section>`;
  }
  return `
    <div class="sk-strip">
      <span class="avatar sm" style="background:${colorOf(sk.name)}">${initials(sk.name)}</span>
      <span class="sk-txt">Segna i punti <b>${esc(sk.name)}</b><small>tu stai seguendo in diretta</small></span>
      <button class="btn small" data-action="sk-claim">Passa a me</button>
    </div>`;
}

function whoAmIBanner(room, me) {
  const list = activePlayers(room);
  if ((me && room.players[me]) || !list.length) return "";
  return `
    <section class="card">
      <h2 class="section-title">Chi sei?</h2>
      <p class="muted small">Scegli il tuo nome: vedrai il tuo punteggio in grande.</p>
      <div class="pgrid">
        ${list.map(([id, p]) => `
          <button class="pg" data-action="set-me" data-id="${id}">
            <span class="pg-ava" style="--pc:${colorOf(p.name)}">
              <span class="avatar lg" style="background:${colorOf(p.name)}">${initials(p.name)}</span>
            </span>
            <span class="pg-name">${esc(p.name)}</span>
          </button>`).join("")}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Riquadro "il tuo punteggio" (per chi guarda)
// ---------------------------------------------------------------------------
function renderYouCard(live, standings, me) {
  const mine = standings.find((r) => r.playerId === me);
  if (!mine) return "";
  const target = live.targetScore || 200;
  const leader = standings[0];
  const gap = leader && leader.playerId !== mine.playerId ? leader.total - mine.total : 0;
  const pct = Math.max(1.5, Math.min(100, (mine.total / target) * 100));
  const last = mine.lastRound;

  return `
    <section class="you-card">
      <div class="you-head">
        <span class="avatar" style="background:${colorOf(mine.name)}">${initials(mine.name)}</span>
        <span class="you-name">${esc(mine.name)}</span>
        <span class="you-pos">${mine.rank}º di ${standings.length}</span>
      </div>
      <div class="you-score">
        <b>${mine.total}</b>
        <span class="you-round ${last ? (last.busted ? "bust" : last.flip7 ? "flip7" : "up") : ""}">
          ${(() => {
            if (!last) return "nessun round giocato";
            const when = last.round === (live.round || 0) ? "in questo round" : "nel round scorso";
            return last.busted ? `sballato ${when}` : `+${last.total} ${when}`;
          })()}
        </span>
      </div>
      <div class="you-bar"><i style="width:${pct}%"></i></div>
      <div class="you-foot">
        <span class="${mine.total >= target ? "goal" : ""}">
          ${mine.total >= target ? `traguardo tagliato` : `ti mancano <b>${target - mine.total}</b> punti`}
        </span>
        <span>${gap > 0 ? `${gap} dal primo` : "sei in testa"}</span>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Tabellone
// ---------------------------------------------------------------------------
function roundCellContent(entry, editable) {
  if (!entry) return editable ? `<span class="rc-add">${icon("plus", "tiny")}</span>` : `<span class="rc-empty">–</span>`;
  if (entry.busted) return `<span class="rc-val bust">0</span><span class="rc-tag">sballo</span>`;
  if (entry.skipped) return `<span class="rc-val zero">0</span>`;
  const r = computeRound(entry);
  if (r.flip7) return `<span class="rc-val flip7">+${r.total}</span><span class="rc-tag flip7">flip 7</span>`;
  return `<span class="rc-val">+${r.total}</span>`;
}

function renderBoard(room, live, standings, me, { editable }) {
  const r = live.round || 0;
  const target = live.targetScore || 200;
  const ids = boardOrder(live);
  const missing = missingIds(live);
  const finished = live.status === "finished";

  return `
    <section class="card board">
      <div class="board-head">
        <span class="round-head">
          <span class="round-word">Round</span>
          ${roundCard(r + 1)}
        </span>
        <span class="round-meta">${finished
          ? "partita chiusa"
          : `${ids.length - missing.length} di ${ids.length} segnati<br>si vince a ${target}`}</span>
        <button class="ghost-btn ml-auto" data-action="share-room">${icon("link", "tiny")} Invita</button>
      </div>

      <div class="board-cols"><span></span><span>Giocatore</span><span>Round</span><span>Totale</span></div>

      <ol class="board-rows">
        ${standings.map((row) => {
          const entry = entryOf(live, row.playerId, r);
          const left = Math.max(0, target - row.total);
          const pct = Math.max(1, Math.min(100, (row.total / target) * 100));
          const inner = roundCellContent(entry, editable && !finished);
          const cell = editable && !finished
            ? `<button class="round-cell ${entry ? "filled" : "todo"}" data-action="calc-open" data-id="${row.playerId}">${inner}</button>`
            : `<span class="round-cell static ${entry ? "filled" : ""}">${inner}</span>`;
          const notes = [];
          if (row.playerId === me) notes.push('<i class="you">tu</i>');
          if (row.flip7s) notes.push(row.flip7s + "× flip 7");
          if (row.busts) notes.push(row.busts + "× sballo");
          return `
            <li class="brow ${row.playerId === me ? "me" : ""} ${row.rank === 1 ? "leader" : ""}">
              <span class="rank r${row.rank}">${row.rank}</span>
              <span class="bname">
                <span class="avatar sm" style="background:${colorOf(row.name)}">${initials(row.name)}</span>
                <span class="txt">${esc(row.name)}${notes.length ? `<small>${notes.join(" · ")}</small>` : ""}</span>
              </span>
              ${cell}
              <span class="total-cell">
                <b>${row.total}</b>
                <small class="${left === 0 ? "goal" : ""}">${left === 0 ? "arrivato" : "−" + left}</small>
              </span>
              <span class="track" aria-hidden="true"><i style="width:${pct}%;background:${colorOf(row.name)}"></i></span>
            </li>`;
        }).join("")}
      </ol>

      ${editable && !finished ? `
        <div class="board-cta">
          ${missing.length
            ? `<button class="btn primary big" data-action="score-next">Segna i punti · ${ids.length - missing.length}/${ids.length}</button>`
            : `<button class="btn primary big" data-action="round-close">Chiudi round ${r + 1} e vai avanti</button>`}
        </div>
        <div class="board-links">
          ${r > 0 ? `<button class="ghost-btn" data-action="round-back">${icon("arrowLeft", "tiny")} Round ${r}</button>` : "<span></span>"}
          <button class="ghost-btn" data-action="game-finish">Termina partita</button>
          <button class="ghost-btn danger" data-action="game-cancel">Annulla</button>
        </div>` : ""}
    </section>`;
}

function renderRoundsTable(room, live) {
  const n = Math.max(roundsPlayed(live), live.round || 0);
  if (n < 2) return "";
  const ids = boardOrder(live);
  return `
    <section class="card">
      <button class="card-head as-button" data-action="toggle-rounds">
        <h2 class="section-title">Round precedenti</h2>
        <span class="ml-auto chevron ${localState.showRounds ? "up" : ""}">${icon("chevron", "tiny")}</span>
      </button>
      ${localState.showRounds ? `
      <div class="table-scroll">
        <table class="rounds">
          <thead><tr><th>Giocatore</th>${Array.from({ length: n }, (_, i) => `<th>R${i + 1}</th>`).join("")}<th>Tot</th></tr></thead>
          <tbody>
            ${ids.map((pid) => {
              const rows = (live.scores && live.scores[pid]) || {};
              let sum = 0;
              const cells = Array.from({ length: n }, (_, i) => {
                const e = rows[roundKey(i)];
                if (!e) return `<td class="dim">·</td>`;
                const c = computeRound(e);
                sum += c.total;
                return `<td class="${e.busted ? "bust" : c.flip7 ? "flip7" : ""}">${c.total}</td>`;
              }).join("");
              return `<tr><th>${esc(nameOf(room, live, pid))}</th>${cells}<td class="tot">${sum}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : ""}
    </section>`;
}

// ---------------------------------------------------------------------------
// Fine partita
// ---------------------------------------------------------------------------
function renderFinished(room, live, standings, me) {
  const winners = Object.keys(live.winnerIds || {});
  const names = winners.map((id) => nameOf(room, live, id));
  const isSK = store.isScorekeeper();
  return `
    <section class="winner-banner holo">
      <span class="holo-sweep" aria-hidden="true"></span>
      <span class="confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</span>
      <div class="wb-crown">${crownEmblem("big")}</div>
      <div class="wb-label">${names.length > 1 ? "Vincono" : "Vince"}</div>
      <div class="wb-name">${esc(names.join(" e "))}</div>
      <div class="wb-score">${standings[0] ? standings[0].total : ""} punti</div>
      <div class="wb-mark">${wordmark()}</div>
    </section>

    ${isSK ? `
      <section class="card">
        <button class="btn primary big" data-action="game-save-restart">Salva e inizia nuova partita</button>
        <button class="btn big" data-action="game-save">Salva e basta</button>
        <div class="board-links">
          <button class="ghost-btn" data-action="round-back">${icon("arrowLeft", "tiny")} Riapri round</button>
          <button class="ghost-btn" data-action="pick-winner">Cambia vincitore</button>
          <button class="ghost-btn danger" data-action="game-cancel">Scarta</button>
        </div>
      </section>` : `
      <section class="card empty-state"><p class="muted">Il segnapunti sta salvando la partita nello storico.</p></section>`}

    ${renderBoard(room, live, standings, me, { editable: false })}
    ${renderRoundsTable(room, live)}`;
}

// ---------------------------------------------------------------------------
// Pannello di inserimento punti
// ---------------------------------------------------------------------------
function openScoreSheet(room, live, startPid) {
  const order = boardOrder(live);
  const r = live.round || 0;
  const pid = startPid || missingIds(live)[0] || order[0];
  openSheet(buildSheetState(room, live, order, r, pid), renderScoreSheet);
}

function buildSheetState(room, live, order, roundIndex, pid) {
  const existing = entryOf(live, pid, roundIndex);
  const entry = existing
    ? { ...emptyEntry(), ...existing, numbers: [...(existing.numbers || [])], plus: [...(existing.plus || [])] }
    : emptyEntry();
  if (existing && existing.manual !== null && existing.manual !== undefined) localState.mode = "keypad";
  return {
    type: "score",
    order,
    roundIndex,
    pos: order.indexOf(pid),
    playerId: pid,
    playerName: nameOf(room, live, pid),
    total: (liveStandings(live, room.players).find((x) => x.playerId === pid) || {}).total || 0,
    entry
  };
}

function keypadValue(entry) {
  return entry.manual === null || entry.manual === undefined ? "" : String(entry.manual);
}

export function renderScoreSheet(s) {
  const e = s.entry;
  const r = computeRound(e);
  const isKeypad = localState.mode === "keypad";
  const filledElsewhere = s.order.filter((pid) => pid !== s.playerId);

  const hand = [
    ...(e.numbers || []).slice().sort((a, b) => a - b).map((n) => numberCard(n, { on: true })),
    ...(e.doubled ? [modCard("x2", { on: true })] : []),
    ...(e.plus || []).slice().sort((a, b) => a - b).map((p) => modCard(p, { on: true })),
    ...(r.flip7 ? [flip7Card()] : [])
  ];

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  const typed = keypadValue(e);

  return `
    <div class="sheet-nav">
      <button class="nav-btn" data-action="calc-prev" ${s.pos === 0 ? "disabled" : ""}>${icon("arrowLeft")}</button>
      <div class="nav-mid">
        <span class="avatar sm" style="background:${colorOf(s.playerName)}">${initials(s.playerName)}</span>
        <div>
          <div class="nav-name">${esc(s.playerName)}</div>
          <div class="nav-sub">${s.pos + 1} di ${s.order.length} · totale ${s.total}</div>
        </div>
        ${roundCard(s.roundIndex + 1)}
      </div>
      <button class="nav-btn" data-action="calc-next-player" ${s.pos >= s.order.length - 1 ? "disabled" : ""}>${icon("arrowLeft", "flip")}</button>
    </div>

    <div class="score-display ${e.busted ? "bust" : r.flip7 ? "flip7" : ""}">
      ${r.flip7 ? `<div class="flip7-badge">${wordmark()}<span>+15</span></div>` : ""}
      <div class="sd-value">${e.busted ? "0" : r.total}</div>
      <div class="sd-note">${e.busted ? "sballato" : (isKeypad ? (r.flip7 ? `${r.typed} + 15 di bonus` : "punti del round") : esc(formulaOf(e)))}</div>
      ${!isKeypad && !e.busted ? `<div class="sd-hand">${hand.join("") || `<span class="hand-empty">tocca le carte del giocatore</span>`}</div>` : ""}
    </div>

    <div class="mode-switch">
      <button class="${isKeypad ? "on" : ""}" data-action="calc-mode" data-m="keypad">Tastierino</button>
      <button class="${!isKeypad ? "on" : ""}" data-action="calc-mode" data-m="cards">Carte</button>
    </div>

    ${isKeypad ? `
      <div class="keypad">
        ${keys.map((k) => `<button class="key" data-action="key" data-k="${k}">${k}</button>`).join("")}
        <button class="key sub" data-action="key-clear">C</button>
        <button class="key" data-action="key" data-k="0">0</button>
        <button class="key sub" data-action="key-back" aria-label="Cancella">${icon("backspace")}</button>
      </div>
      <div class="quick-row">
        <button class="quick ${e.flip7 ? "on gold" : ""}" data-action="calc-flip7">${icon("seven", "tiny")} Flip 7 · +15</button>
        <button class="quick ${e.busted ? "on red" : ""}" data-action="calc-bust">${icon("bomb", "tiny")} Sballato</button>
      </div>
      ${typed === "" && !e.busted ? `<p class="hint">Somma delle carte del giocatore. Il bonus Flip 7 lo aggiungi col tasto.</p>` : ""}
    ` : `
      <div class="calc-section">
        <div class="calc-label"><span>Carte numero</span><span>${(e.numbers || []).length}/7</span></div>
        <div class="numgrid">
          ${NUMBER_CARDS.map((n) => `<button class="card-btn" data-action="calc-num" data-n="${n}">${numberCard(n, { on: (e.numbers || []).includes(n) })}</button>`).join("")}
        </div>
      </div>
      <div class="calc-section">
        <div class="calc-label"><span>Modificatori</span></div>
        <div class="modgrid">
          ${PLUS_MODIFIERS.map((p) => `<button class="card-btn" data-action="calc-plus" data-n="${p}">${modCard(p, { on: (e.plus || []).includes(p) })}</button>`).join("")}
          <button class="card-btn" data-action="calc-double">${modCard("x2", { on: Boolean(e.doubled) })}</button>
        </div>
      </div>
      <div class="quick-row">
        <button class="quick ${e.busted ? "on red" : ""}" data-action="calc-bust">${icon("bomb", "tiny")} Sballato</button>
      </div>
    `}

    <div class="sheet-actions">
      <button class="btn" data-action="calc-clear">Azzera</button>
      <button class="btn primary" data-action="calc-save">${nextLabel(s)}</button>
    </div>`;
}

function nextLabel(s) {
  const live = store.getRoom().live;
  if (!live) return "Salva";
  const others = missingIds(live).filter((id) => id !== s.playerId);
  return others.length ? "Salva e avanti ›" : "Salva e chiudi";
}

async function persistEntry(s) {
  const e = s.entry;
  if (isBlankEntry(e)) {
    await store.clearRoundEntry(s.playerId, s.roundIndex);
    return;
  }
  await store.setRoundEntry(s.playerId, s.roundIndex, {
    numbers: e.numbers || [],
    plus: e.plus || [],
    doubled: Boolean(e.doubled),
    busted: Boolean(e.busted),
    flip7: Boolean(e.flip7),
    manual: e.manual === null || e.manual === undefined || e.manual === "" ? null : Number(e.manual)
  });
}

function gotoPlayer(pid) {
  const room = store.getRoom();
  const live = room.live;
  if (!live) return closeSheet();
  sheet.state = buildSheetState(room, live, boardOrder(live), live.round || 0, pid);
}

// ---------------------------------------------------------------------------
export const liveView = {
  render(ctx) {
    const { room, me } = ctx;
    const live = room.live;
    const isSK = store.isScorekeeper();

    if (!live) return scorekeeperCard(room) + renderIdle(room, me) + skFooter(room);

    const standings = liveStandings(live, room.players);
    if (live.status === "finished") return scorekeeperCard(room) + renderFinished(room, live, standings, me) + skFooter(room);

    return scorekeeperCard(room)
      + whoAmIBanner(room, me)
      + (!isSK ? renderYouCard(live, standings, me) : "")
      + renderBoard(room, live, standings, me, { editable: isSK })
      + renderRoundsTable(room, live)
      + skFooter(room);
  },

  actions: {
    "set-me"(ctx, el) {
      prefs.set("me", el.dataset.id);
      toast("Ciao " + (ctx.room.players[el.dataset.id] || {}).name);
    },
    "toggle-lineup"(ctx, el) {
      const id = el.dataset.id;
      if (localState.selected.has(id)) localState.selected.delete(id);
      else localState.selected.add(id);
    },
    async "quick-add-player"() {
      const name = await askText("Nuovo giocatore", { placeholder: "Nome", confirmLabel: "Aggiungi" });
      if (!name) return;
      const id = await store.addPlayer(name);
      if (id) localState.selected.add(id);
    },
    async "start-game"(ctx) {
      const ids = [...localState.selected].filter((id) => ctx.room.players[id]);
      if (ids.length < 2) return toast("Servono almeno 2 giocatori", "warn");
      await store.startGame(ids, localState.target ?? ctx.room.meta.targetScore);
      prefs.set("lastLineup", ids);
    },
    async "replay-last"(ctx, el) {
      const game = ctx.room.history[el.dataset.id];
      if (!game) return;
      const ids = Object.keys(game.results || {}).filter((id) => ctx.room.players[id]);
      if (ids.length < 2) return toast("Alcuni giocatori non ci sono più", "warn");
      if (!store.isScorekeeper()) {
        const mine = ctx.me && ctx.room.players[ctx.me] ? ctx.room.players[ctx.me].name : "Segnapunti";
        await store.claimScorekeeper(mine);
      }
      await store.startGame(ids, ctx.room.meta.targetScore);
      prefs.set("lastLineup", ids);
    },
    "toggle-rounds"() { localState.showRounds = !localState.showRounds; },

    async "sk-claim"(ctx) {
      const cur = ctx.room.control;
      if (cur && cur.uid) {
        const ok = await askConfirm("Prendere il controllo?", { message: `Ora segna i punti ${cur.name}.`, confirmLabel: "Prendi" });
        if (!ok) return;
      }
      const mine = ctx.me && ctx.room.players[ctx.me] ? ctx.room.players[ctx.me].name : null;
      const name = mine || await askText("Come ti chiami?", { value: "Segnapunti", confirmLabel: "Inizia" });
      if (!name) return;
      await store.claimScorekeeper(name);
      toast("Ora segni tu i punti");
    },
    "sk-release"() { return store.releaseScorekeeper(); },

    "score-next"(ctx) { openScoreSheet(ctx.room, ctx.room.live, null); },
    "calc-open"(ctx, el) { openScoreSheet(ctx.room, ctx.room.live, el.dataset.id); },

    async "calc-prev"() {
      await persistEntry(sheet.state);
      gotoPlayer(sheet.state.order[Math.max(0, sheet.state.pos - 1)]);
      return "sheet";
    },
    async "calc-next-player"() {
      await persistEntry(sheet.state);
      gotoPlayer(sheet.state.order[Math.min(sheet.state.order.length - 1, sheet.state.pos + 1)]);
      return "sheet";
    },
    async "calc-save"() {
      const s = sheet.state;
      const scored = computeRound(s.entry);
      await persistEntry(s);
      if (scored.flip7) toast(`FLIP 7! +15 a ${s.playerName}`, "party");
      const live = store.getRoom().live;
      const next = live ? missingIds(live).filter((id) => id !== s.playerId)[0] : null;
      if (next) { gotoPlayer(next); return "sheet"; }
      closeSheet();
      toast("Round completo: chiudi il round");
    },

    "calc-mode"(ctx, el) {
      localState.mode = el.dataset.m;
      return "sheet";
    },
    "key"(ctx, el) {
      const e = sheet.state.entry;
      const cur = keypadValue(e);
      if (cur.length >= 4) return "sheet";
      const next = (cur + el.dataset.k).replace(/^0+(?=\d)/, "");
      e.manual = Number(next);
      e.busted = false;
      e.numbers = []; e.plus = []; e.doubled = false;
      return "sheet";
    },
    "key-back"() {
      const e = sheet.state.entry;
      const cur = keypadValue(e).slice(0, -1);
      e.manual = cur === "" ? null : Number(cur);
      return "sheet";
    },
    "key-clear"() {
      const e = sheet.state.entry;
      e.manual = null; e.busted = false; e.flip7 = false;
      return "sheet";
    },
    "calc-flip7"() {
      const e = sheet.state.entry;
      e.flip7 = !e.flip7;
      if (e.flip7) e.busted = false;
      return "sheet";
    },
    "calc-bust"() {
      const e = sheet.state.entry;
      e.busted = !e.busted;
      if (e.busted) e.flip7 = false;
      return "sheet";
    },
    "calc-clear"() { sheet.state.entry = emptyEntry(); return "sheet"; },
    "calc-num"(ctx, el) {
      const n = Number(el.dataset.n);
      const e = sheet.state.entry;
      e.numbers = (e.numbers || []).includes(n) ? e.numbers.filter((x) => x !== n) : [...(e.numbers || []), n];
      e.manual = null; e.busted = false;
      return "sheet";
    },
    "calc-plus"(ctx, el) {
      const n = Number(el.dataset.n);
      const e = sheet.state.entry;
      e.plus = (e.plus || []).includes(n) ? e.plus.filter((x) => x !== n) : [...(e.plus || []), n];
      e.manual = null; e.busted = false;
      return "sheet";
    },
    "calc-double"() {
      const e = sheet.state.entry;
      e.doubled = !e.doubled; e.manual = null; e.busted = false;
      return "sheet";
    },

    async "round-close"(ctx) {
      const live = ctx.room.live;
      const missing = missingIds(live);
      if (missing.length) {
        const names = missing.map((pid) => nameOf(ctx.room, live, pid)).join(", ");
        const ok = await askConfirm("Chiudere il round?", { message: `Mancano i punti di ${names}: verranno segnati 0.`, confirmLabel: "Chiudi" });
        if (!ok) return;
      }
      await store.closeRound();
    },
    "round-back"() { return store.reopenRound(); },
    async "game-finish"() {
      const ok = await askConfirm("Terminare la partita?", { message: "Vince chi ha più punti adesso.", confirmLabel: "Termina" });
      if (ok) await store.finishGameNow();
    },
    async "game-cancel"() {
      const ok = await askConfirm("Annullare la partita?", { message: "I punti di questa partita andranno persi.", confirmLabel: "Annulla partita", danger: true });
      if (!ok) return;
      await store.cancelGame();
      toast("Partita annullata");
    },
    async "game-save"() {
      await store.saveGameToHistory();
      toast("Salvata nello storico");
    },
    async "game-save-restart"(ctx) {
      const live = ctx.room.live;
      const ids = live ? boardOrder(live).filter((id) => ctx.room.players[id]) : [];
      const target = live ? live.targetScore : ctx.room.meta.targetScore;
      await store.saveGameToHistory();
      if (ids.length >= 2) {
        await store.startGame(ids, target);
        prefs.set("lastLineup", ids);
        toast("Nuova partita iniziata");
      }
    },
    async "pick-winner"(ctx) {
      const live = ctx.room.live;
      const choices = boardOrder(live).map((pid) => ({ id: pid, label: nameOf(ctx.room, live, pid) }));
      const pick = await askChoice("Chi ha vinto?", choices);
      if (pick) await store.setWinner(pick);
    },
    "share-room"() { return shareRoom(); }
  },

  changes: {
    "target-input"(ctx, el) { localState.target = Number(el.value) || ctx.room.meta.targetScore; }
  }
};

function skFooter(room) {
  if (!store.isScorekeeper()) return "";
  return `<p class="sk-note">Stai segnando tu i punti. <button class="link" data-action="sk-release">passa il turno a un altro</button></p>`;
}
