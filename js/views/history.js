// ---------------------------------------------------------------------------
// Vista "Storico": elenco partite, dettaglio, inserimento partite passate.
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, initials, colorOf, fmtDate, fmtDateTime, inputDate, openSheet, closeSheet, askText, askConfirm, toast, sheet, captureSheetInputs } from "../ui.js";
import { icon, crownEmblem } from "../icons.js";
import { historyList } from "../stats.js";
import { computeRound } from "../scoring.js";

const MONTHS = new Intl.DateTimeFormat("it-IT", { month: "short" });
const sortedResults = (game) => Object.entries(game.results || {}).sort((a, b) => b[1].total - a[1].total);

function groupByMonth(games) {
  const groups = [];
  let current = null;
  for (const g of games) {
    const d = new Date(g.playedAt || 0);
    const key = d.getFullYear() + "-" + d.getMonth();
    if (!current || current.key !== key) {
      current = { key, label: new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(d), games: [] };
      groups.push(current);
    }
    current.games.push(g);
  }
  return groups;
}

export const historyView = {
  render(ctx) {
    const games = historyList(ctx.room.history);

    const row = (g) => {
      const rows = sortedResults(g);
      const winners = rows.filter(([id]) => g.winnerIds && g.winnerIds[id]);
      const d = new Date(g.playedAt || 0);
      return `
        <li class="hrow" data-action="hist-detail" data-id="${g.id}">
          <span class="hdate"><b>${d.getDate()}</b><span>${MONTHS.format(d).replace(".", "")}</span></span>
          <span class="hmain">
            <span class="hwin">${crownEmblem("mini")}${esc(winners.map(([, r]) => r.name).join(" e ") || "—")}</span>
            <span class="hplayers">${rows.map(([id, r]) => `<i class="hp ${g.winnerIds && g.winnerIds[id] ? "w" : ""}" style="background:${colorOf(r.name)}" title="${esc(r.name)}">${initials(r.name)[0]}</i>`).join("")}
              <span class="muted small">${rows.length} giocatori</span>${g.source === "online" ? '<span class="tag online">online</span>' : g.source === "manual" ? '<span class="tag">a mano</span>' : ""}</span>
          </span>
          <span class="htop"><b>${rows[0] ? rows[0][1].total : ""}</b><span>pt</span></span>
        </li>`;
    };

    return `
      <section class="card add-card">
        <button class="btn primary big" data-action="hist-add">${icon("plus", "tiny")} Aggiungi partita passata</button>
        <p class="muted small center">Per recuperare le partite giocate prima dell'app.</p>
      </section>
      ${games.length ? groupByMonth(games).map((grp) => `
        <section class="card tight">
          <div class="card-head">
            <span class="card-title cap">${esc(grp.label)}</span>
            <span class="count-pill ml-auto">${grp.games.length}</span>
          </div>
          <ul class="hlist">${grp.games.map(row).join("")}</ul>
        </section>`).join("") : `
        <section class="card empty-state">
          <div class="empty-ico">${icon("history")}</div>
          <h2 class="empty-title">Storico vuoto</h2>
          <p class="muted">Le partite salvate finiscono qui e alimentano la classifica Crown.</p>
        </section>`}`;
  },

  actions: {
    "hist-detail"(ctx, el) {
      const g = ctx.room.history[el.dataset.id];
      if (!g) return;
      openSheet({ type: "game", id: el.dataset.id, game: g }, renderGameSheet);
    },
    "hist-add"(ctx) {
      const roster = Object.entries(ctx.room.players || {}).filter(([, p]) => !p.archived);
      const lastLineup = Object.keys(ctx.room.history || {}).length ? [] : roster.slice(0, 4).map(([id]) => ({ playerId: id, total: "" }));
      openSheet({
        type: "manual",
        date: inputDate(Date.now()),
        winner: "auto",
        rows: lastLineup.length ? lastLineup : [{ playerId: "", total: "" }, { playerId: "", total: "" }]
      }, renderManualSheet);
    },

    async "game-delete"() {
      const ok = await askConfirm("Eliminare la partita?", { message: "La classifica Crown verrà ricalcolata.", confirmLabel: "Elimina", danger: true });
      if (!ok) return;
      await store.deleteGame(sheet.state.id);
      closeSheet();
      toast("Partita eliminata");
    },

    "man-add-row"() {
      captureSheetInputs();
      sheet.state.rows.push({ playerId: "", total: "" });
      return "sheet";
    },
    "man-del-row"(ctx, el) {
      captureSheetInputs();
      sheet.state.rows.splice(Number(el.dataset.i), 1);
      if (!sheet.state.rows.length) sheet.state.rows.push({ playerId: "", total: "" });
      return "sheet";
    },
    async "man-new-player"() {
      captureSheetInputs();
      const name = await askText("Nuovo giocatore", { placeholder: "Nome", confirmLabel: "Aggiungi" });
      if (!name) return "sheet";
      const id = await store.addPlayer(name);
      const empty = sheet.state.rows.find((r) => !r.playerId);
      if (empty) empty.playerId = id;
      else sheet.state.rows.push({ playerId: id, total: "" });
      return "sheet";
    },
    async "man-save"() {
      captureSheetInputs();
      const s = sheet.state;
      const entries = s.rows
        .filter((r) => r.playerId && String(r.total).trim() !== "")
        .map((r) => ({ playerId: r.playerId, total: Number(r.total) }));
      if (entries.length < 2) return toast("Servono almeno 2 giocatori con punteggio", "warn");
      const ids = entries.map((e) => e.playerId);
      if (new Set(ids).size !== ids.length) return toast("Hai selezionato due volte lo stesso giocatore", "warn");

      const playedAt = new Date(s.date + "T20:00:00").getTime() || Date.now();
      try {
        await store.addManualGame({
          playedAt,
          entries,
          winnerIds: s.winner && s.winner !== "auto" ? [s.winner] : null
        });
        closeSheet();
        toast("Partita aggiunta allo storico");
      } catch (e) { toast(e.message, "warn"); }
    }
  },

  changes: {
    "man-winner"(ctx, el) { sheet.state.winner = el.value; return "sheet-quiet"; }
  }
};

// --- sheet: dettaglio partita ------------------------------------------------
function renderGameSheet(s) {
  const g = s.game;
  const rows = sortedResults(g);
  const hasRounds = g.rounds && Object.keys(g.rounds).length;
  const nRounds = hasRounds ? Math.max(...Object.values(g.rounds).map((r) => Object.keys(r).length)) : 0;

  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">${fmtDate(g.playedAt)}</div>
        <div class="sheet-sub">${g.source === "manual" ? "inserita a mano" : g.source === "online" ? "giocata al tavolo online" : fmtDateTime(g.playedAt)} · obiettivo ${g.targetScore || "—"}</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <ol class="board-rows in-sheet">
      ${rows.map(([id, r], i) => `
        <li class="brow">
          <span class="rank r${i + 1}">${i + 1}</span>
          <span class="bname">
            <span class="avatar sm" style="background:${colorOf(r.name)}">${initials(r.name)}</span>
            <span class="txt">${esc(r.name)}</span>
          </span>
          <span class="win-cell">${g.winnerIds && g.winnerIds[id] ? icon("crownFill", "gold") : ""}</span>
          <span class="total-cell">${r.total}</span>
        </li>`).join("")}
    </ol>

    ${hasRounds ? `
      <div class="calc-section">
        <div class="calc-label"><span>Round</span></div>
        <div class="table-scroll">
          <table class="rounds">
            <thead><tr><th>Giocatore</th>${Array.from({ length: nRounds }, (_, i) => `<th>R${i + 1}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map(([id, r]) => `
                <tr><th>${esc(r.name)}</th>${Array.from({ length: nRounds }, (_, i) => {
                  const e = g.rounds[id] && g.rounds[id]["r" + i];
                  if (!e) return `<td class="dim">·</td>`;
                  const c = computeRound(e);
                  return `<td class="${e.busted ? "bust" : c.flip7 ? "flip7" : ""}">${c.total}</td>`;
                }).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}

    <div class="sheet-actions">
      <button class="btn ghost danger" data-action="game-delete">${icon("trash", "tiny")} Elimina</button>
      <button class="btn primary" data-action="sheet-close">Chiudi</button>
    </div>`;
}

// --- sheet: partita passata --------------------------------------------------
function renderManualSheet(s) {
  const room = store.getRoom();
  const roster = Object.entries(room.players || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));
  const used = new Set(s.rows.map((r) => r.playerId).filter(Boolean));

  const rowHtml = (r, i) => `
    <div class="man-row">
      <select data-bind="rows.${i}.playerId">
        <option value="">— giocatore —</option>
        ${roster.map(([id, p]) => `<option value="${id}" ${r.playerId === id ? "selected" : ""} ${used.has(id) && r.playerId !== id ? "disabled" : ""}>${esc(p.name)}</option>`).join("")}
      </select>
      <input type="number" inputmode="numeric" placeholder="punti" value="${r.total ?? ""}" data-bind="rows.${i}.total">
      <button class="icon-btn danger" data-action="man-del-row" data-i="${i}" aria-label="Rimuovi riga">${icon("close")}</button>
    </div>`;

  const filled = s.rows.filter((r) => r.playerId);
  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">Partita passata</div>
        <div class="sheet-sub">Data e punteggi finali</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <label class="field inline">
      <span>Data</span>
      <input type="date" value="${s.date}" data-bind="date">
    </label>

    <div class="calc-section">
      <div class="calc-label"><span>Giocatori e punteggi finali</span></div>
      ${s.rows.map(rowHtml).join("")}
      <div class="man-actions">
        <button class="btn ghost small" data-action="man-add-row">${icon("plus", "tiny")} Riga</button>
        <button class="btn ghost small" data-action="man-new-player">${icon("user", "tiny")} Nuovo giocatore</button>
      </div>
    </div>

    <div class="calc-section">
      <div class="calc-label"><span>Vincitore</span></div>
      <select data-bind="winner" data-change="man-winner">
        <option value="auto" ${s.winner === "auto" ? "selected" : ""}>Automatico — punteggio più alto</option>
        ${filled.map((r) => {
          const p = room.players[r.playerId];
          return p ? `<option value="${r.playerId}" ${s.winner === r.playerId ? "selected" : ""}>${esc(p.name)}</option>` : "";
        }).join("")}
      </select>
    </div>

    <div class="sheet-actions">
      <button class="btn ghost" data-action="sheet-close">Annulla</button>
      <button class="btn primary" data-action="man-save">${icon("check", "tiny")} Salva</button>
    </div>`;
}
