// ---------------------------------------------------------------------------
// Vista "Storico": elenco partite, dettaglio, inserimento partite passate e,
// per il solo proprietario, correzione di una partita chiusa (mani comprese).
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, initials, colorOf, fmtDate, fmtDateTime, inputDate, openSheet, closeSheet, askText, askConfirm, askChoice, toast, sheet, captureSheetInputs, openPage, closePage, page, capturePageInputs } from "../ui.js";
import { icon, crownEmblem } from "../icons.js";
import { historyList, roundCount, reviseGame, roundKey, playerTotal } from "../stats.js";
import { computeRound, isBlankEntry } from "../scoring.js";
import { avatar, avatarHtml, playerAvatar } from "../avatar.js";
import { renderScoreSheet, patchCalcSheet, makeCalcState, normalizeEntry } from "./live.js";

const MONTHS = new Intl.DateTimeFormat("it-IT", { month: "short" });
const sortedResults = (game) => Object.entries(game.results || {}).sort((a, b) => b[1].total - a[1].total);

const sourceLabel = (g) => g.source === "manual" ? "inserita a mano" : g.source === "online" ? "giocata al tavolo online" : fmtDateTime(g.playedAt);
const sourceTag = (g) => g.source === "online" ? '<span class="tag online">online</span>' : g.source === "manual" ? '<span class="tag">a mano</span>' : "";

/** Pallino di un giocatore nell'elenco: il suo avatar, o la sola iniziale. */
function chip(id, r, won) {
  const a = playerAvatar(id);
  if (a) return avatarHtml(a, r.name, `hp ${won ? "w" : ""}`);
  return `<i class="hp ${won ? "w" : ""}" style="background:${colorOf(r.name)}" title="${esc(r.name)}">${initials(r.name)[0]}</i>`;
}

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

/**
 * Apre il dettaglio di una partita da un'altra vista (es. dai record). `hl`
 * facoltativo: { pid, round, note } evidenzia una mano e spiega perche'.
 */
export function openGameSheet(id, hl = null) {
  const g = store.getRoom().history[id];
  if (!g) return toast("Questa partita non c'è più nello storico", "warn");
  openSheet({ type: "game", id, game: g, hl }, renderGameSheet);
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
            <span class="hplayers">${rows.map(([id, r]) => chip(id, r, Boolean(g.winnerIds && g.winnerIds[id]))).join("")}
              <span class="muted small">${rows.length} giocatori</span>${sourceTag(g)}</span>
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

    // --- correzione di una partita chiusa (solo proprietario) ---------------
    "game-edit"(ctx) {
      const s = sheet.state;
      if (!s || s.type !== "game") return;
      if (!store.isOwner()) return toast("Solo il proprietario può modificare le partite", "warn");
      const g = ctx.room.history[s.id];
      if (!g) return toast("Questa partita non c'è più", "warn");
      closeSheet();
      openEditPage(s.id, g);
      return "page";
    },
    "gedit-del-player"(ctx, el) {
      capturePageInputs();
      page.state.players.splice(Number(el.dataset.i), 1);
      return "page";
    },
    async "gedit-add-player"(ctx) {
      capturePageInputs();
      const s = page.state;
      const used = new Set(s.players.map((p) => p.playerId));
      const free = Object.entries(ctx.room.players || {})
        .filter(([id]) => !used.has(id))
        .sort((a, b) => a[1].name.localeCompare(b[1].name, "it"))
        .map(([id, p]) => ({ id, label: p.name + (p.archived ? " (archiviato)" : "") }));
      if (!free.length) return toast("Sono già tutti in partita", "warn");
      const pick = await askChoice("Chi aggiungere?", free);
      if (!pick || !page.state) return "page";
      page.state.players.push({ playerId: pick, name: ctx.room.players[pick].name, total: 0 });
      return "page";
    },
    "gedit-add-round"() {
      capturePageInputs();
      page.state.nRounds += 1;
      return "page";
    },
    async "gedit-del-round"() {
      capturePageInputs();
      const s = page.state;
      if (!s.nRounds) return "page";
      const key = roundKey(s.nRounds - 1);
      const played = s.players.some((p) => s.rounds[p.playerId] && s.rounds[p.playerId][key]);
      if (played) {
        const ok = await askConfirm(`Togliere il round ${s.nRounds}?`, { message: "Le mani di quel round andranno perse.", confirmLabel: "Togli", danger: true });
        if (!ok || !page.state) return "page";
      }
      for (const pid of Object.keys(s.rounds)) if (s.rounds[pid]) delete s.rounds[pid][key];
      s.nRounds -= 1;
      return "page";
    },
    "gedit-round"(ctx, el) {
      capturePageInputs();
      openRoundCalc(el.dataset.pid, Number(el.dataset.r));
      return "sheet-quiet";
    },
    async "gedit-save"(ctx) {
      capturePageInputs();
      const s = page.state;
      if (!store.isOwner()) return toast("Solo il proprietario può modificare le partite", "warn");
      if (s.players.length < 2) return toast("Servono almeno 2 giocatori", "warn");
      const original = ctx.room.history[s.id];
      if (!original) { closePage(); return toast("Questa partita non c'è più", "warn"); }
      const game = reviseGame(original, {
        playedAt: withDate(s.date, original.playedAt),
        targetScore: Number(s.target),
        players: s.players,
        rounds: s.rounds,
        winnerId: s.winner === "auto" ? null : s.winner
      });
      try { await store.updateGame(s.id, game); }
      catch { return toast("Modifica rifiutata: il database accetta correzioni solo dal proprietario", "warn"); }
      closePage();
      toast("Partita aggiornata");
    },
    async "gedit-delete"() {
      const ok = await askConfirm("Eliminare la partita?", { message: "La classifica Crown verrà ricalcolata.", confirmLabel: "Elimina", danger: true });
      if (!ok || !page.state) return "page";
      try { await store.deleteGame(page.state.id); }
      catch { return toast("Solo il proprietario può eliminare le partite", "warn"); }
      closePage();
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

/** Stessa ora della partita originale, sul giorno scelto nel campo data. */
function withDate(dateStr, originalMs) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return originalMs || Date.now();
  const orig = new Date(originalMs || Date.now());
  return new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), orig.getSeconds()).getTime();
}

// --- sheet: dettaglio partita ------------------------------------------------
function renderGameSheet(s) {
  const g = s.game;
  const rows = sortedResults(g);
  const nRounds = roundCount(g.rounds);
  const hl = s.hl || {};

  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">${fmtDate(g.playedAt)}</div>
        <div class="sheet-sub">${sourceLabel(g)} · obiettivo ${g.targetScore || "—"}${g.editedAt ? ` · corretta il ${fmtDate(g.editedAt)}` : ""}</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <ol class="board-rows in-sheet">
      ${rows.map(([id, r], i) => `
        <li class="brow">
          <span class="rank r${i + 1}">${i + 1}</span>
          <span class="bname">
            ${avatar(id, r.name, "sm")}
            <span class="txt">${esc(r.name)}</span>
          </span>
          <span class="win-cell">${g.winnerIds && g.winnerIds[id] ? icon("crownFill", "gold") : ""}</span>
          <span class="total-cell">${r.total}</span>
        </li>`).join("")}
    </ol>

    ${nRounds ? `
      <div class="calc-section">
        <div class="calc-label"><span>Round</span></div>
        <div class="table-scroll">
          <table class="rounds">
            <thead><tr><th>Giocatore</th>${Array.from({ length: nRounds }, (_, i) => `<th>R${i + 1}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map(([id, r]) => `
                <tr class="${hl.pid === id ? "hl-row" : ""}"><th>${esc(r.name)}</th>${Array.from({ length: nRounds }, (_, i) => {
                  const e = g.rounds[id] && g.rounds[id][roundKey(i)];
                  const mark = hl.pid === id && hl.round === i ? " hl" : "";
                  if (!e) return `<td class="dim${mark}">·</td>`;
                  const c = computeRound(e);
                  return `<td class="${e.busted ? "bust" : c.flip7 ? "flip7" : e.frozen ? "frozen" : ""}${mark}">${c.total}</td>`;
                }).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}
    ${hl.note ? `<p class="hl-note">${icon("star", "tiny")} ${esc(hl.note)}</p>` : ""}

    <div class="sheet-actions">
      ${store.isOwner() ? `<button class="btn" data-action="game-edit">${icon("pencil", "tiny")} Modifica</button>` : ""}
      <button class="btn primary" data-action="sheet-close">Chiudi</button>
    </div>`;
}

// --- pagina: modifica partita chiusa (solo proprietario) ---------------------
function openEditPage(id, g) {
  const room = store.getRoom();
  const players = sortedResults(g).map(([pid, r]) => ({
    playerId: pid,
    name: (room.players[pid] && room.players[pid].name) || r.name || "?",
    total: Number(r.total) || 0
  }));
  const nRounds = roundCount(g.rounds);
  openPage({
    type: "game-edit",
    id,
    game: g,
    date: inputDate(g.playedAt),
    target: g.targetScore || 200,
    winner: chosenWinner(g, players),
    players,
    rounds: nRounds ? JSON.parse(JSON.stringify(g.rounds)) : null,
    nRounds
  }, renderEditPage);
}

/** "auto" se il vincitore salvato e' chi ha piu' punti, altrimenti chi era stato scelto. */
function chosenWinner(g, players) {
  const winners = Object.keys(g.winnerIds || {});
  const top = Math.max(...players.map((p) => p.total));
  const auto = players.filter((p) => p.total === top).map((p) => p.playerId);
  if (winners.length === 1 && !(auto.length === 1 && auto[0] === winners[0])) return winners[0];
  return "auto";
}

function renderEditPage(s) {
  const hasRounds = Boolean(s.rounds);
  const totalOf = (p) => hasRounds ? playerTotal({ scores: s.rounds }, p.playerId) : Number(p.total) || 0;

  return `
    <div class="page-top">
      <button class="nav-btn" data-action="page-close" aria-label="Indietro">${icon("arrowLeft")}</button>
      <span class="page-title">Modifica partita</span>
    </div>

    <div class="page-body">
      <section class="card">
        <div class="card-head">${icon("history")}<span class="card-title">${fmtDate(s.game.playedAt)}</span><span class="ml-auto">${sourceTag(s.game) || '<span class="tag">dal vivo</span>'}</span></div>
        <div class="field-row">
          <label class="field">
            <span>Data</span>
            <input type="date" value="${esc(s.date)}" data-bind="date">
          </label>
          <label class="field">
            <span>Obiettivo punti</span>
            <input type="number" min="10" step="10" inputmode="numeric" value="${esc(s.target)}" data-bind="target">
          </label>
        </div>
      </section>

      <section class="card">
        <div class="card-head">${icon("cards")}<span class="card-title">Giocatori</span><span class="count-pill ml-auto">${s.players.length}</span></div>
        <p class="muted small">${hasRounds ? "I totali si ricalcolano dalle mani qui sotto." : "Il punteggio finale di ognuno."}</p>
        <ul class="plist">
          ${s.players.map((p, i) => `
            <li>
              ${avatar(p.playerId, p.name, "sm")}
              <span class="pname">${esc(p.name)}</span>
              ${hasRounds
                ? `<b class="gedit-tot">${totalOf(p)}</b>`
                : `<input type="number" class="gedit-pts" inputmode="numeric" value="${esc(p.total)}" data-bind="players.${i}.total" aria-label="Punti di ${esc(p.name)}">`}
              <button class="icon-btn danger" data-action="gedit-del-player" data-i="${i}" aria-label="Togli ${esc(p.name)}">${icon("close")}</button>
            </li>`).join("") || `<li class="muted small">Nessun giocatore</li>`}
        </ul>
        <button class="btn ghost small" data-action="gedit-add-player">${icon("plus", "tiny")} Aggiungi giocatore</button>
      </section>

      ${hasRounds ? `
      <section class="card">
        <div class="card-head">${icon("cardFan")}<span class="card-title">Mani</span><span class="count-pill ml-auto">${s.nRounds}</span></div>
        <p class="muted small">Tocca una casella per rifare quella mano con le carte. Una mano azzerata sparisce; un round vuoto per tutti viene tolto.</p>
        <div class="table-scroll">
          <table class="rounds edit">
            <thead><tr><th>Giocatore</th>${Array.from({ length: s.nRounds }, (_, i) => `<th>R${i + 1}</th>`).join("")}<th>Tot</th></tr></thead>
            <tbody>
              ${s.players.map((p) => `
                <tr><th>${esc(p.name)}</th>${Array.from({ length: s.nRounds }, (_, i) => {
                  const e = s.rounds[p.playerId] && s.rounds[p.playerId][roundKey(i)];
                  const c = e ? computeRound(e) : null;
                  const cls = !e ? "empty" : e.busted ? "bust" : c.flip7 ? "flip7" : e.frozen ? "frozen" : "";
                  return `<td><button class="rcell ${cls}" data-action="gedit-round" data-pid="${p.playerId}" data-r="${i}" aria-label="${esc(p.name)}, round ${i + 1}">${e ? c.total : icon("plus", "tiny")}</button></td>`;
                }).join("")}<td class="tot">${totalOf(p)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="btn-row">
          <button class="btn ghost small" data-action="gedit-add-round">${icon("plus", "tiny")} Aggiungi round</button>
          <button class="btn ghost small" data-action="gedit-del-round" ${s.nRounds ? "" : "disabled"}>${icon("close", "tiny")} Togli l'ultimo round</button>
        </div>
      </section>` : ""}

      <section class="card">
        <div class="card-head">${icon("crown")}<span class="card-title">Vincitore</span></div>
        <select data-bind="winner">
          <option value="auto" ${s.winner === "auto" ? "selected" : ""}>Automatico — punteggio più alto</option>
          ${s.players.map((p) => `<option value="${p.playerId}" ${s.winner === p.playerId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select>
      </section>

      <button class="btn primary big" data-action="gedit-save">${icon("check", "tiny")} Salva modifiche</button>
      <button class="ghost-btn danger center-self" data-action="gedit-delete">${icon("trash", "tiny")} Elimina partita</button>
    </div>`;
}

/** Apre il pannello carte su una mano della bozza; salva nella bozza, non nel database. */
function openRoundCalc(pid, r) {
  const s = page.state;
  if (!s || !s.rounds) return;
  const order = s.players.map((p) => p.playerId);

  const keep = (cs) => {
    if (!page.state) return;
    const rows = page.state.rounds;
    if (isBlankEntry(cs.entry)) {
      if (rows[cs.playerId]) delete rows[cs.playerId][roundKey(cs.roundIndex)];
    } else {
      (rows[cs.playerId] = rows[cs.playerId] || {})[roundKey(cs.roundIndex)] = normalizeEntry(cs.entry);
    }
  };
  const build = (id) => {
    const p = s.players.find((x) => x.playerId === id);
    const existing = (s.rounds[id] || {})[roundKey(r)] || null;
    const st = makeCalcState({ order, roundIndex: r, playerId: id, playerName: p ? p.name : "?", existing, fullTotal: playerTotal({ scores: s.rounds }, id) });
    st.saveLabel = "Salva";
    st.onSave = (cs) => { keep(cs); closeSheet(); return "page"; };
    st.onMove = (cs, delta) => {
      keep(cs);
      sheet.state = build(order[Math.max(0, Math.min(order.length - 1, cs.pos + delta))]);
      return "sheet-full";
    };
    return st;
  };
  openSheet(build(pid), renderScoreSheet, patchCalcSheet, { full: true });
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
