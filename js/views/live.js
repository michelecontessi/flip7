// ---------------------------------------------------------------------------
// Vista "Partita".
// Un solo tabellone (Giocatore | Round | Totale) e un solo pulsante alla volta:
// "Segna i punti" finche' mancano giocatori, poi "Chiudi round".
// L'inserimento scorre da un giocatore all'altro senza chiudere il pannello.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { prefs } from "../prefs.js";
import { esc, colorOf, toast, openSheet, closeSheet, askText, askConfirm, askChoice, sheet } from "../ui.js";
import { avatar } from "../avatar.js";
import { icon, wordmark, crownEmblem, fanArt, numberCard, roundCard, modCard, flip7Card } from "../icons.js";
import { NUMBER_CARDS, PLUS_MODIFIERS, computeRound, formulaOf, emptyEntry, isBlankEntry } from "../scoring.js";
import { liveStandings, orderedPlayerIds, roundKey, roundsPlayed, roundStarter } from "../stats.js";

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

/**
 * Chi non e' segnapunti puo' comunque segnare i PROPRI punti del round in
 * corso, per fare prima. Su Firebase le regole accettano solo il giocatore
 * legato all'account, quindi qui si chiede la stessa cosa.
 */
function canSelfScore(room, live, me) {
  if (!live || live.status !== "playing" || !me || !live.players || !live.players[me]) return false;
  return store.getStatus().mode !== "firebase" || store.myPlayerId() === me;
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

  if (!isSK) {
    return `
      ${whoAmIBanner(room, me)}
      <section class="card empty-state">
        ${fanArt()}
        <h2 class="empty-title">Nessuna partita in corso</h2>
        <p class="muted">Il tabellone comparirà qui appena il segnapunti la avvia.</p>
      </section>`;
  }

  return `
    ${whoAmIBanner(room, me)}
    <section class="card">
      <div class="card-head">${icon("cards")}<span class="card-title">Nuova partita</span>
        <span class="count-pill ml-auto">${localState.selected.size}</span></div>
      <p class="muted small">Toccali <b>nell'ordine in cui siete seduti</b>: dopo il sorteggio
        di chi apre, le mani girano in quella sequenza.</p>
      <div class="pgrid">
        ${list.map(([id, p]) => {
          const seat = [...localState.selected].indexOf(id) + 1;
          return `
          <button class="pg ${seat ? "on" : ""}" data-action="toggle-lineup" data-id="${id}">
            <span class="pg-ava" style="--pc:${colorOf(p.name)}">
              ${avatar(id, p.name, "lg")}
              <i class="pg-check num">${seat || ""}</i>
            </span>
            <span class="pg-name">${esc(p.name)}</span>
          </button>`;
        }).join("")}
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
        ${localState.selected.size < 2 ? "Scegli almeno 2 giocatori" : `Inizia partita · ${localState.selected.size} giocatori`}
      </button>
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
      ${avatar((room.bindings || {})[sk.uid], sk.name, "sm")}
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
      <p class="muted small">Scegli il tuo nome una volta sola: il tuo account resterà
        collegato a quel giocatore (lo cambia solo chi gestisce la stanza).</p>
      <div class="pgrid">
        ${list.map(([id, p]) => `
          <button class="pg" data-action="set-me" data-id="${id}">
            <span class="pg-ava" style="--pc:${colorOf(p.name)}">
              ${avatar(id, p.name, "lg")}
            </span>
            <span class="pg-name">${esc(p.name)}</span>
          </button>`).join("")}
        <button class="pg add" data-action="me-new">
          <span class="pg-ava"><span class="avatar lg ghost">${icon("plus")}</span></span>
          <span class="pg-name muted">sono nuovo</span>
        </button>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Riquadro "il tuo punteggio" (per chi guarda)
// ---------------------------------------------------------------------------
function renderYouCard(live, standings, me, selfId) {
  const mine = standings.find((r) => r.playerId === me);
  if (!mine) return "";
  const cur = selfId ? entryOf(live, me, live.round || 0) : null;
  const target = live.targetScore || 200;
  const leader = standings[0];
  const gap = leader && leader.playerId !== mine.playerId ? leader.total - mine.total : 0;
  const pct = Math.max(1.5, Math.min(100, (mine.total / target) * 100));
  const last = mine.lastRound;

  return `
    <section class="you-card">
      <div class="you-head">
        ${avatar(mine.playerId, mine.name, "")}
        <span class="you-name">${esc(mine.name)}${mine.rank === 1 && mine.total > 0 ? ` ${crownEmblem("mini")}` : ""}</span>
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
      <div class="you-bar"><i style="width:${pct}%; background:${colorOf(mine.name)}"></i></div>
      <div class="you-foot">
        <span class="${mine.total >= target ? "goal" : ""}">
          ${mine.total >= target ? `traguardo tagliato` : `ti mancano <b>${target - mine.total}</b> punti`}
        </span>
        <span>${gap > 0 ? `${gap} dal primo` : "sei in testa"}</span>
      </div>
      ${selfId ? `
      <button class="btn primary big" data-action="calc-self">${icon("pen", "tiny")} ${cur ? "Correggi i miei punti" : `Segna i miei punti · round ${(live.round || 0) + 1}`}</button>
      <p class="hint">Solo i tuoi, per fare prima: il resto lo segna il segnapunti.</p>` : ""}
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
  if (entry.frozen) return `<span class="rc-val ${r.flip7 ? "flip7" : "frozen"}">+${r.total}</span><span class="rc-tag frozen">congelato</span>`;
  if (r.flip7) return `<span class="rc-val flip7">+${r.total}</span><span class="rc-tag flip7">flip 7</span>`;
  return `<span class="rc-val">+${r.total}</span>`;
}

function renderBoard(room, live, standings, me, { editable, selfId = null }) {
  const r = live.round || 0;
  const target = live.targetScore || 200;
  const ids = boardOrder(live);
  const missing = missingIds(live);
  const finished = live.status === "finished";
  const starter = finished ? null : roundStarter(live);

  return `
    <section class="card board">
      <div class="board-head">
        <span class="round-head">
          <span class="round-word">Round</span>
          ${roundCard(r + 1)}
        </span>
        ${!editable && !finished ? `<span class="live-pill"><i></i>LIVE</span>` : ""}
        <span class="round-meta ml-auto">${finished
          ? `<b>partita chiusa</b>`
          : missing.length
            ? `<b>${ids.length - missing.length} di ${ids.length} segnati</b><span>si vince a ${target}</span>`
            : `<b class="done-note">round completo</b><span>si vince a ${target}</span>`}</span>
      </div>

      ${starter ? `
      <div class="opens-strip">
        ${icon("cardFan", "tiny")}
        <span>Apre la mano <b>${esc(nameOf(room, live, starter))}</b></span>
        <span class="opens-seq" title="ordine del giro, come siete seduti">
          ${(() => { const i = ids.indexOf(starter); return [...ids.slice(i), ...ids.slice(0, i)]; })()
            .map((pid, i) => `${i ? '<i class="sep">›</i>' : ""}${avatar(pid, nameOf(room, live, pid), "xs")}`).join("")}
        </span>
      </div>` : ""}

      <div class="board-cols"><span></span><span>Giocatore</span><span>Round</span><span>Totale</span></div>

      <ol class="board-rows">
        ${standings.map((row) => {
          const entry = entryOf(live, row.playerId, r);
          const left = Math.max(0, target - row.total);
          const pct = Math.max(1, Math.min(100, (row.total / target) * 100));
          const self = !editable && !finished && row.playerId === selfId;
          const inner = roundCellContent(entry, (editable || self) && !finished);
          const cell = editable && !finished
            ? `<button class="round-cell ${entry ? "filled" : "todo"}" data-action="calc-open" data-id="${row.playerId}">${inner}</button>`
            : self
              ? `<button class="round-cell self ${entry ? "filled" : "todo"}" data-action="calc-self" aria-label="Segna i tuoi punti">${inner}</button>`
              : `<span class="round-cell static ${entry ? "filled" : ""}">${inner}</span>`;
          const notes = [];
          if (row.playerId === starter) notes.push('<i class="opens">apre</i>');
          if (row.playerId === me) notes.push('<i class="you">tu</i>');
          if (row.flip7s) notes.push(row.flip7s + "× flip 7");
          if (row.busts) notes.push(row.busts + "× sballo");
          if (row.freezes) notes.push(row.freezes + "× congelato");
          return `
            <li class="brow ${row.playerId === me ? "me" : ""} ${row.rank === 1 ? "leader" : ""}">
              <span class="rank r${row.rank}">${row.rank === 1 && row.total > 0 ? crownEmblem("rank-crown") : row.rank}</span>
              <span class="bname">
                ${avatar(row.playerId, row.name, "sm")}
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
            : `
            <div class="round-done">${icon("check", "tiny")} Tutti i punteggi del round ${r + 1} sono segnati</div>
            <button class="btn go big pulse" data-action="round-close">Chiudi round ${r + 1} — via al round ${r + 2} →</button>`}
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
                return `<td class="${e.busted ? "bust" : c.flip7 ? "flip7" : e.frozen ? "frozen" : ""}${c.doubled ? " x2" : ""}">${c.doubled ? `<span class="x2-val">${c.total}<i class="x2-flag">×2</i></span>` : c.total}</td>`;
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
  openSheet(buildSheetState(room, live, order, r, pid), renderScoreSheet, patchCalcSheet, { full: true });
}

/**
 * Stato del pannello punti. Lo usa la partita in corso e, con gli agganci
 * `onSave(s)` / `onMove(s, delta)` / `saveLabel`, anche la correzione delle
 * mani di una partita chiusa (vista Storico), che decide lei dove salvare.
 */
export function makeCalcState({ order, roundIndex, playerId, playerName, existing, fullTotal }) {
  const entry = existing
    ? { ...emptyEntry(), ...existing, numbers: [...(existing.numbers || [])], plus: [...(existing.plus || [])] }
    : emptyEntry();
  if (existing && existing.manual !== null && existing.manual !== undefined) localState.mode = "keypad";
  return {
    type: "score",
    order,
    roundIndex,
    pos: order.indexOf(playerId),
    playerId,
    playerName,
    // totale partita PRIMA di questo round: cosi' sommando l'entry in corso
    // si vede in diretta dove arriverebbe il giocatore
    baseTotal: (fullTotal || 0) - (existing ? computeRound(existing).total : 0),
    entry
  };
}

function buildSheetState(room, live, order, roundIndex, pid) {
  const existing = entryOf(live, pid, roundIndex);
  const fullTotal = (liveStandings(live, room.players).find((x) => x.playerId === pid) || {}).total || 0;
  return makeCalcState({ order, roundIndex, playerId: pid, playerName: nameOf(room, live, pid), existing, fullTotal });
}

function keypadValue(entry) {
  return entry.manual === null || entry.manual === undefined ? "" : String(entry.manual);
}

function buildHand(e, r) {
  const cards = [
    ...(e.numbers || []).slice().sort((a, b) => a - b).map((n) => numberCard(n, { on: true })),
    ...(e.doubled ? [modCard("x2", { on: true })] : []),
    ...(e.plus || []).slice().sort((a, b) => a - b).map((p) => modCard(p, { on: true })),
    ...(r.flip7 ? [flip7Card()] : [])
  ];
  const inner = cards.join("") || `<span class="hand-empty">tocca le carte del giocatore</span>`;
  // sballare non e' una carta: le carte restano li', annullate
  return e.busted ? `<span class="hand-void">${inner}</span><span class="void-flag">SBALLATO · vale 0</span>` : inner;
}

function noteOf(e, r, isKeypad) {
  if (e.busted) return "sballato";
  if (isKeypad) return (r.flip7 ? `${r.typed} + 15 di bonus` : "punti del round") + (e.frozen ? " · congelato" : "");
  return formulaOf(e);
}
const displayClass = (e, r) => (e.busted ? "bust" : r.flip7 ? "flip7" : e.frozen ? "frozen" : "");

export function renderScoreSheet(s) {
  const e = s.entry;
  const r = computeRound(e);
  const isKeypad = localState.mode === "keypad";

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  const typed = keypadValue(e);

  return `
    <div class="sheet-nav">
      <button class="nav-btn" data-action="calc-prev" ${s.pos === 0 ? "disabled" : ""}>${icon("arrowLeft")}</button>
      <div class="nav-mid">
        ${avatar(s.playerId, s.playerName, "sm")}
        <div>
          <div class="nav-name">${esc(s.playerName)}</div>
          <div class="nav-sub">${s.navSub || `giocatore ${s.pos + 1} di ${s.order.length}`}</div>
        </div>
        ${roundCard(s.roundIndex + 1)}
      </div>
      <button class="nav-btn" data-action="calc-next-player" ${s.pos >= s.order.length - 1 ? "disabled" : ""}>${icon("arrowLeft", "flip")}</button>
      <button class="nav-btn nav-close" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <div class="score-display ${displayClass(e, r)}">
      <div class="flip7-badge" ${r.flip7 ? "" : 'style="display:none"'}>${wordmark()}<span>+15</span></div>
      <div class="sd-value">${e.busted ? "0" : r.total}</div>
      <div class="sd-note">${esc(noteOf(e, r, isKeypad))}</div>
      <div class="sd-running">totale partita <b>${s.baseTotal + (e.busted ? 0 : r.total)}</b></div>
      ${!isKeypad ? `<div class="sd-hand">${buildHand(e, r)}</div>` : ""}
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
    ` : `
      <div class="calc-section">
        <div class="calc-label"><span>Carte numero</span><span class="count-num">${(e.numbers || []).length}/7</span></div>
        <div class="numgrid">
          ${NUMBER_CARDS.map((n) => `<button class="card-btn" data-action="calc-num" data-n="${n}">${numberCard(n, { on: (e.numbers || []).includes(n) })}<i class="pick">${icon("check")}</i></button>`).join("")}
        </div>
      </div>
      <div class="calc-section">
        <div class="calc-label"><span>Modificatori</span></div>
        <div class="modgrid">
          ${PLUS_MODIFIERS.map((p) => `<button class="card-btn" data-action="calc-plus" data-n="${p}">${modCard(p, { on: (e.plus || []).includes(p) })}<i class="pick">${icon("check")}</i></button>`).join("")}
          <button class="card-btn" data-action="calc-double">${modCard("x2", { on: Boolean(e.doubled) })}<i class="pick">${icon("check")}</i></button>
        </div>
      </div>
    `}

    <div class="sheet-actions col">
      ${isKeypad ? `
      <div class="quick-row">
        <button class="quick ${e.flip7 ? "on gold" : ""}" data-action="calc-flip7">${icon("seven", "tiny")} Flip 7 · +15</button>
        <button class="quick ${e.busted ? "on red" : ""}" data-action="calc-bust">${icon("bomb", "tiny")} Sballato</button>
        <button class="quick ${e.frozen ? "on ice" : ""}" data-action="calc-freeze">${icon("snow", "tiny")} Congelato</button>
      </div>` : `
      <div class="quick-row">
        <button class="quick ${e.busted ? "on red" : ""}" data-action="calc-bust">${icon("bomb", "tiny")} Sballo</button>
        <button class="quick ${e.frozen ? "on ice" : ""}" data-action="calc-freeze">${icon("snow", "tiny")} Congelato</button>
      </div>`}
      <div class="act-row">
        <button class="btn" data-action="calc-clear">Azzera</button>
        <button class="btn primary" data-action="calc-save">${nextLabel(s)}</button>
      </div>
    </div>`;
}

/** Aggiorna il pannello punti sul posto, senza ridisegnarlo (niente flicker). */
export function patchCalcSheet(s) {
  const root = document.getElementById("sheet-root");
  if (!root || !s) return;
  const e = s.entry;
  const r = computeRound(e);
  const isKeypad = localState.mode === "keypad";

  root.querySelectorAll('[data-action="calc-num"]').forEach((btn) => {
    btn.querySelector(".fcard").classList.toggle("on", (e.numbers || []).includes(Number(btn.dataset.n)));
  });
  root.querySelectorAll('[data-action="calc-plus"]').forEach((btn) => {
    btn.querySelector(".fcard").classList.toggle("on", (e.plus || []).includes(Number(btn.dataset.n)));
  });
  const dbl = root.querySelector('[data-action="calc-double"] .fcard');
  if (dbl) dbl.classList.toggle("on", Boolean(e.doubled));

  const disp = root.querySelector(".score-display");
  if (disp) disp.className = "score-display " + displayClass(e, r);
  const badge = root.querySelector(".flip7-badge");
  if (badge) badge.style.display = r.flip7 ? "" : "none";
  const val = root.querySelector(".sd-value");
  if (val) val.textContent = e.busted ? "0" : r.total;
  const note = root.querySelector(".sd-note");
  if (note) note.textContent = noteOf(e, r, isKeypad);
  const count = root.querySelector(".count-num");
  if (count) count.textContent = `${(e.numbers || []).length}/7`;
  const hand = root.querySelector(".sd-hand");
  if (hand) hand.innerHTML = buildHand(e, r);
  const running = root.querySelector(".sd-running b");
  if (running) running.textContent = s.baseTotal + (e.busted ? 0 : r.total);

  const q7 = root.querySelector('[data-action="calc-flip7"]');
  if (q7) q7.className = "quick " + (e.flip7 ? "on gold" : "");
  const qb = root.querySelector('[data-action="calc-bust"]');
  if (qb) qb.className = "quick " + (e.busted ? "on red" : "");
  const qf = root.querySelector('[data-action="calc-freeze"]');
  if (qf) qf.className = "quick " + (e.frozen ? "on ice" : "");
}

function nextLabel(s) {
  return s.saveLabel || "Salva e chiudi";
}

/** Entry pronta per il database: solo i campi previsti, mai undefined. */
export function normalizeEntry(e) {
  return {
    numbers: e.numbers || [],
    plus: e.plus || [],
    doubled: Boolean(e.doubled),
    busted: Boolean(e.busted),
    frozen: Boolean(e.frozen) && !e.busted,
    flip7: Boolean(e.flip7),
    manual: e.manual === null || e.manual === undefined || e.manual === "" ? null : Number(e.manual)
  };
}

async function persistEntry(s) {
  if (isBlankEntry(s.entry)) {
    await store.clearRoundEntry(s.playerId, s.roundIndex);
    return;
  }
  await store.setRoundEntry(s.playerId, s.roundIndex, normalizeEntry(s.entry));
}

/** Pannello punti per il solo giocatore dell'account: niente frecce, salva e chiude. */
function openSelfScoreSheet(room, live, pid) {
  const r = live.round || 0;
  const existing = entryOf(live, pid, r);
  const fullTotal = (liveStandings(live, room.players).find((x) => x.playerId === pid) || {}).total || 0;
  const s = makeCalcState({ order: [pid], roundIndex: r, playerId: pid, playerName: nameOf(room, live, pid), existing, fullTotal });
  s.navSub = "i tuoi punti di questa mano";
  s.saveLabel = "Salva i miei punti";
  s.onSave = async (cs) => {
    const scored = computeRound(cs.entry);
    try { await persistEntry(cs); }
    catch { return toast("Il database non ha accettato: puoi segnare solo il tuo giocatore, a partita in corso", "warn"); }
    closeSheet();
    if (scored.flip7) toast("FLIP 7! +15 per te", "party");
    else toast(cs.entry.busted ? "Sballo segnato" : `Segnati ${scored.total} punti`);
  };
  openSheet(s, renderScoreSheet, patchCalcSheet, { full: true });
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

    const selfId = !isSK && canSelfScore(room, live, me) ? me : null;
    return scorekeeperCard(room)
      + whoAmIBanner(room, me)
      + (!isSK ? renderYouCard(live, standings, me, selfId) : "")
      + renderBoard(room, live, standings, me, { editable: isSK, selfId })
      + renderRoundsTable(room, live)
      + skFooter(room);
  },

  actions: {
    async "set-me"(ctx, el) {
      const id = el.dataset.id;
      prefs.set("me", id);
      try {
        await store.bindSelf(id);
        toast("Ciao " + (ctx.room.players[id] || {}).name + "! D'ora in poi sei tu.");
      } catch {
        toast("Il collegamento lo può cambiare solo chi gestisce la stanza", "warn");
      }
    },
    async "me-new"(ctx) {
      const name = await askText("Come ti chiami?", { placeholder: "Nome", confirmLabel: "Crea" });
      if (!name) return;
      const id = await store.addPlayer(name);
      prefs.set("me", id);
      try { await store.bindSelf(id); } catch { /* gia' collegato */ }
      toast("Benvenuto " + name + "!");
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
      const first = await store.startGame(ids, localState.target ?? ctx.room.meta.targetScore);
      prefs.set("lastLineup", ids);
      const name = first && ctx.room.players[first] ? ctx.room.players[first].name : null;
      if (name) toast(`Sorteggio: apre ${name}`);
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
    "calc-self"(ctx) {
      const { room, me } = ctx;
      if (!canSelfScore(room, room.live, me)) return toast("Puoi segnare solo i tuoi punti, a partita in corso", "warn");
      openSelfScoreSheet(room, room.live, me);
    },
    "calc-open"(ctx, el) { openScoreSheet(ctx.room, ctx.room.live, el.dataset.id); },

    async "calc-prev"() {
      const s = sheet.state;
      if (s.onMove) return s.onMove(s, -1);
      await persistEntry(s);
      gotoPlayer(s.order[Math.max(0, s.pos - 1)]);
      return "sheet-full";
    },
    async "calc-next-player"() {
      const s = sheet.state;
      if (s.onMove) return s.onMove(s, 1);
      await persistEntry(s);
      gotoPlayer(s.order[Math.min(s.order.length - 1, s.pos + 1)]);
      return "sheet-full";
    },
    // Salvare chiude sempre il pannello: capita di segnare una mano "al volo"
    // e ritrovarsi dentro il giocatore dopo faceva perdere il filo.
    async "calc-save"() {
      const s = sheet.state;
      if (s.onSave) return s.onSave(s);
      const scored = computeRound(s.entry);
      await persistEntry(s);
      closeSheet();
      if (scored.flip7) return toast(`FLIP 7! +15 a ${s.playerName}`, "party");
      const live = store.getRoom().live;
      const missing = live ? missingIds(live).length : 0;
      toast(missing
        ? `${s.playerName}: ${scored.total} punti · ${missing === 1 ? "manca 1 giocatore" : `mancano ${missing} giocatori`}`
        : "Round completo: chiudi il round");
    },

    "calc-mode"(ctx, el) {
      localState.mode = el.dataset.m;
      return "sheet-full";
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
      e.manual = null; e.busted = false; e.flip7 = false; e.frozen = false;
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
      if (e.busted) { e.flip7 = false; e.frozen = false; }
      return "sheet";
    },
    // congelato da un Congela: incassa e basta, i punti restano quelli delle carte
    "calc-freeze"() {
      const e = sheet.state.entry;
      e.frozen = !e.frozen;
      if (e.frozen) e.busted = false;
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
        const first = await store.startGame(ids, target);
        prefs.set("lastLineup", ids);
        const name = first && ctx.room.players[first] ? ctx.room.players[first].name : null;
        toast(name ? `Si rigioca: apre ${name}` : "Nuova partita iniziata");
      }
    },
    async "pick-winner"(ctx) {
      const live = ctx.room.live;
      const choices = boardOrder(live).map((pid) => ({ id: pid, label: nameOf(ctx.room, live, pid) }));
      const pick = await askChoice("Chi ha vinto?", choices);
      if (pick) await store.setWinner(pick);
    }
  },

  changes: {
    "target-input"(ctx, el) { localState.target = Number(el.value) || ctx.room.meta.targetScore; }
  }
};

function skFooter(room) {
  if (!store.isScorekeeper()) return "";
  return `<p class="sk-note">Stai segnando tu i punti. <button class="link" data-action="sk-release">passa il turno a un altro</button></p>`;
}
