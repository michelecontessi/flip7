// ---------------------------------------------------------------------------
// Vista "Storico": elenco partite (con l'ora, la durata e la classifica di
// ognuna in chiaro), dettaglio con il grafico del corso della partita e il
// replay mano per mano, inserimento partite passate e, per il solo
// proprietario, correzione di una partita chiusa (mani comprese).
// ---------------------------------------------------------------------------
import * as store from "../store.js";
import { esc, fmtDate, fmtDateTime, inputDate, openSheet, closeSheet, askText, askConfirm, askChoice, toast, sheet, captureSheetInputs, openPage, closePage, page, capturePageInputs } from "../ui.js";
import { icon, crownEmblem, numberCard, modCard, flip7Card, heartCard, seasonBadge } from "../icons.js";
import { historyList, roundCount, reviseGame, roundKey, playerTotal, tiebreakOf, gameProgress, fmtDuration, seasons, seasonShort } from "../stats.js";
import { computeRound, isBlankEntry } from "../scoring.js";
import { avatar, playerColor } from "../avatar.js";
import { renderScoreSheet, patchCalcSheet, makeCalcState, normalizeEntry } from "./live.js";
import { sharePodium } from "../share.js";
import { eloReportCard } from "./elo-report.js";

const MONTHS = new Intl.DateTimeFormat("it-IT", { month: "short" });
const TIME = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
const sortedResults = (game) => Object.entries(game.results || {}).sort((a, b) => b[1].total - a[1].total);

const sourceLabel = (g) => g.source === "manual" ? "inserita a mano" : g.source === "online" ? "giocata al tavolo online" : "segnata dal vivo";
const sourceTag = (g) => g.source === "online" ? '<span class="tag online">online</span>' : g.source === "manual" ? '<span class="tag">a mano</span>' : "";
/** "20:41" oppure niente per le partite inserite a mano (l'ora e' fittizia). */
const timeOf = (g) => (g.source === "manual" || !g.playedAt ? "" : TIME.format(new Date(g.playedAt)));
/** La durata, se l'inizio e la fine sono credibili (sotto le 12 ore). */
const durationOf = (g) => (g.finishedAt && g.playedAt && g.finishedAt > g.playedAt && g.finishedAt - g.playedAt < 12 * 36e5 ? fmtDuration(g.finishedAt - g.playedAt) : "");

function groupByMonth(games) {
  const groups = [];
  let current = null;
  for (const g of games) {
    const d = new Date(g.playedAt || 0);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
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

/**
 * La classifica di una partita, riga per riga: posto (con la medaglia per i
 * primi tre), avatar, nome, la barra dei punti in proporzione al primo e il
 * totale. Si capisce a colpo d'occhio chi ha vinto e di quanto.
 */
function rankRows(g, { max = 6, cls = "" } = {}) {
  const rows = sortedResults(g);
  const top = rows.length ? Number(rows[0][1].total) || 0 : 0;
  const shown = rows.length > max ? rows.slice(0, max - 1) : rows;
  const winners = g.winnerIds || {};
  let place = 0, prev = null;
  const html = shown.map(([id, r], i) => {
    const total = Number(r.total) || 0;
    if (prev === null || total !== prev) place = i + 1;
    prev = total;
    const won = Boolean(winners[id]);
    return `
      <li class="hg-row ${won ? "win" : ""}">
        <span class="rank ${place <= 3 ? "medal m" + place : ""}">${place}</span>
        ${avatar(id, r.name, "xs")}
        <span class="hg-name">${esc(r.name)}${won ? crownEmblem("mini") : ""}${r.blockedRound !== undefined ? `<small class="tag">bloccato</small>` : ""}</span>
        <span class="hg-bar"><i style="width:${top ? Math.max(3, (total / top) * 100).toFixed(1) : 0}%; background:${won ? "" : playerColor(id, r.name)}"></i></span>
        <b>${total}</b>
      </li>`;
  }).join("");
  const more = rows.length > shown.length ? `<li class="hg-more">e altri ${rows.length - shown.length}</li>` : "";
  return `<ol class="hg-rows ${cls}">${html}${more}</ol>`;
}

export const historyView = {
  render(ctx) {
    const games = historyList(ctx.room.history);
    // il campione di ogni mese chiuso, per la carta del mese in testa al gruppo
    const byMonth = Object.fromEntries(seasons(ctx.room.history, ctx.room.players).map((s) => [s.key, s]));

    const row = (g) => {
      const rows = sortedResults(g);
      const winners = rows.filter(([id]) => g.winnerIds && g.winnerIds[id]);
      const d = new Date(g.playedAt || 0);
      const top = rows.length ? Number(rows[0][1].total) || 0 : 0;
      const nRounds = roundCount(g.rounds);
      // il distacco dal secondo racconta la partita meglio di qualsiasi etichetta
      const gap = winners.length === 1 && rows.length > 1 ? top - (Number(rows[1][1].total) || 0) : null;
      const time = timeOf(g), dur = durationOf(g);
      const meta = [
        time ? `${WEEKDAY.format(d)} ${time}` : WEEKDAY.format(d),
        dur || null,
        rows.length === 1 ? "1 giocatore" : `${rows.length} giocatori`,
        nRounds ? (nRounds === 1 ? "1 mano" : `${nRounds} mani`) : null,
        winners.length > 1 ? "a pari punti" : gap === null ? null : gap === 0 ? "vinta ai punti" : `+${gap} sul secondo`
      ].filter(Boolean).join(" · ");
      return `
        <li class="hgame" data-action="hist-detail" data-id="${g.id}">
          <span class="hg-head">
            <span class="hdate"><b>${d.getDate()}</b><span>${MONTHS.format(d).replace(".", "")}</span></span>
            <span class="hg-id">
              <span class="hg-win">${crownEmblem("mini")}<b>${esc(winners.map(([, r]) => r.name).join(" e ") || "—")}</b></span>
              <span class="hg-meta">${meta}${sourceTag(g)}</span>
            </span>
            <span class="hg-top"><b>${top}</b><span>pt</span></span>
          </span>
          ${rankRows(g)}
        </li>`;
    };

    return `
      <section class="card add-card">
        <button class="btn primary big" data-action="hist-add">${icon("plus", "tiny")} Aggiungi partita passata</button>
        <p class="muted small center">Per recuperare le partite giocate prima dell'app.</p>
      </section>
      ${games.length ? groupByMonth(games).map((grp) => {
        const s = byMonth[grp.key];
        const champ = s && s.closed && s.champions.length ? s.champions : null;
        return `
        <section class="card tight">
          <div class="card-head">
            <span class="card-title cap">${esc(grp.label)}</span>
            ${champ ? `<button class="month-champ" data-action="season-open" data-key="${grp.key}" title="Campione di ${esc(seasonShort(grp.key))}">${seasonBadge(grp.key, { cls: "xs" })}<span>${esc(champ.map((r) => r.name).join(" e "))}</span></button>` : s && !s.closed ? `<span class="month-live">in corso</span>` : ""}
            <span class="count-pill ml-auto">${grp.games.length}</span>
          </div>
          <ul class="hlist">${grp.games.map(row).join("")}</ul>
        </section>`;
      }).join("") : `
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
    /** Condivide il podio di una partita chiusa (immagine). */
    async "game-share"(ctx) {
      const s = sheet.state;
      if (!s || s.type !== "game") return "sheet-quiet";
      const g = ctx.room.history[s.id] || s.game;
      const rows = sortedResults(g).map(([id, r]) => ({ playerId: id, name: r.name, total: Number(r.total) || 0 }));
      const winners = new Set(Object.keys(g.winnerIds || {}));
      const n = roundCount(g.rounds);
      await sharePodium(rows, winners, {
        title: g.source === "online" ? "Vince al tavolo online" : "Vince",
        room: ctx.room.meta.name || "",
        dateLabel: fmtDate(g.playedAt) + (timeOf(g) ? ` · ${timeOf(g)}` : ""),
        target: g.targetScore,
        subtitle: `${rows[0] ? rows[0].total : 0} punti${n ? ` · ${n} ${n === 1 ? "mano" : "mani"}` : ""}`,
        text: `Flip 7 · ${fmtDate(g.playedAt)}: vince ${rows.filter((r) => winners.has(r.playerId)).map((r) => r.name).join(" e ")}`
      });
      return "sheet-quiet";
    },
    /** Il replay: la partita rivista mano per mano. */
    "game-replay"(ctx) {
      const s = sheet.state;
      if (!s || s.type !== "game") return;
      const g = ctx.room.history[s.id] || s.game;
      if (!roundCount(g.rounds)) return toast("Di questa partita ci sono solo i totali", "warn");
      closeSheet();
      openReplayPage(s.id, g);
      return "page";
    },
    "replay-step"(ctx, el) {
      const s = page.state;
      if (!s || s.type !== "replay") return "page";
      const n = s.progress.rounds;
      const to = el.dataset.to === "prev" ? s.step - 1 : el.dataset.to === "next" ? s.step + 1 : Number(el.dataset.to);
      s.step = Math.max(0, Math.min(n - 1, Number.isFinite(to) ? to : s.step));
      return "page";
    },
    "season-open"(ctx, el) {
      // la pagina della stagione vive nella Classifica: la si apre da li'
      location.hash = "#classifica";
      // dopo il cambio di scheda (che chiude le pagine aperte), non prima
      setTimeout(() => document.dispatchEvent(new CustomEvent("flip7:open-season", { detail: el.dataset.key })), 60);
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

// --- grafico del corso della partita -------------------------------------------
/**
 * Una linea per giocatore: il totale dopo ogni round. Si vede chi era in
 * testa e quando la partita si e' decisa. `mark` evidenzia un round.
 */
export function progressChart(g, { mark = -1, height = 150, inset = 28 } = {}) {
  const p = gameProgress(g);
  if (p.rounds < 2) return "";
  const target = Number(g.targetScore) || 200;
  const maxV = Math.max(target, ...p.series.map((s) => s.final)) * 1.06;
  const padL = 34, padR = 16, padT = 12, padB = 22;
  // largo quanto lo spazio che ha (la vista e' al massimo 660px, meno i
  // bordi indicati da `inset`): con poche mani riempie la riga, con tante
  // si allarga oltre e scorre nel suo riquadro, mai fuori dal pannello
  const vpw = (typeof document !== "undefined" && document.documentElement.clientWidth) || 360;
  const avail = Math.max(240, Math.min(660, vpw) - inset);
  const w = Math.max(avail, padL + padR + (p.rounds - 1) * 34);
  const h = height;
  const x = (i) => padL + (i / (p.rounds - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - v / maxV) * (h - padT - padB);
  const grid = [0, Math.round(maxV / 2 / 10) * 10, target].filter((v, i, a) => a.indexOf(v) === i);
  const winners = g.winnerIds || {};
  return `
    <div class="chart-scroll flat"><div>
      <svg class="progress-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Totali dopo ogni round">
        ${grid.map((v) => `<line class="grid ${v === target ? "goal" : ""}" x1="${padL - 4}" y1="${y(v).toFixed(1)}" x2="${(w - padR + 4).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${padL - 8}" y="${(y(v) + 3.5).toFixed(1)}">${v}</text>`).join("")}
        ${Array.from({ length: p.rounds }, (_, i) => `<text class="rx" x="${x(i).toFixed(1)}" y="${h - 6}">${i + 1}</text>`).join("")}
        ${mark >= 0 && mark < p.rounds ? `<line class="sel-line" x1="${x(mark).toFixed(1)}" y1="${padT - 4}" x2="${x(mark).toFixed(1)}" y2="${h - padB + 4}"/>` : ""}
        ${p.series.map((s) => `
          <polyline class="${winners[s.playerId] ? "win" : ""}" stroke="${winners[s.playerId] ? "var(--gold)" : playerColor(s.playerId, s.name)}"
            points="${s.totals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("")}
        ${p.series.map((s) => {
          const i = mark >= 0 && mark < p.rounds ? mark : p.rounds - 1;
          return `<circle cx="${x(i).toFixed(1)}" cy="${y(s.totals[i]).toFixed(1)}" r="4" fill="${winners[s.playerId] ? "var(--gold)" : playerColor(s.playerId, s.name)}"><title>${esc(s.name)}: ${s.totals[i]}</title></circle>`;
        }).join("")}
      </svg>
    </div></div>
    <p class="chart-note">${p.leadChanges === 0 ? "in testa dall'inizio alla fine" : p.leadChanges === 1 ? "la testa è cambiata una volta" : `la testa è cambiata ${p.leadChanges} volte`} · la linea tratteggiata è il traguardo ${target}</p>`;
}

// --- sheet: dettaglio partita ------------------------------------------------
/** Le note sulla riga di un giocatore nel dettaglio: Flip 7, sballi, congelate... */
function resultNotes(r, g, pid) {
  const notes = [];
  if (r.flip7s) notes.push(`${r.flip7s}× Flip 7`);
  if (r.busts) notes.push(`${r.busts}× sballo`);
  if (r.freezes) notes.push(`${r.freezes}× congelato`);
  if (r.hearts) notes.push(`${r.hearts}× cuore`);
  const rows = (g.rounds && g.rounds[pid]) || {};
  // le congelate tirate agli altri: quella su se stessi non e' un dispetto
  const froze = Object.entries(g.rounds || {}).reduce((n, [victim, other]) => n + (victim === pid ? 0 : Object.values(other || {}).filter((e) => e && e.frozenBy === pid).length), 0);
  if (froze) notes.push(`ha congelato ${froze}×`);
  const stays = Object.values(rows).filter((e) => e && e.stayed).length;
  if (stays && Object.keys(rows).length) notes.push(`fermato ${stays}×`);
  if (r.blockedRound !== undefined) notes.push(`bloccato al round ${r.blockedRound}`);
  return notes.join(" · ");
}

function renderGameSheet(s) {
  const g = s.game;
  const rows = sortedResults(g);
  const nRounds = roundCount(g.rounds);
  const hl = s.hl || {};
  const winners = g.winnerIds || {};
  const time = timeOf(g), dur = durationOf(g);
  let place = 0, prev = null;
  const blockedAt = (pid) => (g.results[pid] && g.results[pid].blockedRound !== undefined ? Number(g.results[pid].blockedRound) : null);

  return `
    <div class="sheet-head">
      <div>
        <div class="sheet-title">${fmtDate(g.playedAt)}${time ? ` <span class="sheet-time">· ${time}</span>` : ""}</div>
        <div class="sheet-sub">${sourceLabel(g)}${dur ? ` · ${dur}` : ""} · obiettivo ${g.targetScore || "—"}${g.editedAt ? ` · corretta il ${fmtDate(g.editedAt)}` : ""}</div>
      </div>
      <button class="icon-btn" data-action="sheet-close" aria-label="Chiudi">${icon("close")}</button>
    </div>

    <ol class="rank-list">
      ${rows.map(([id, r], i) => {
        const total = Number(r.total) || 0;
        if (prev === null || total !== prev) place = i + 1;
        prev = total;
        const notes = resultNotes(r, g, id);
        return `
        <li class="${winners[id] ? "win" : ""} ${hl.pid === id ? "hl-row" : ""}">
          <span class="rank ${place <= 3 ? "medal m" + place : ""}">${place}</span>
          ${avatar(id, r.name, "sm")}
          <span class="rl-name">${esc(r.name)}${notes ? `<small>${notes}</small>` : ""}</span>
          ${winners[id] ? crownEmblem("mini") : ""}
          <b>${total}</b>
        </li>`;
      }).join("")}
    </ol>

    ${nRounds ? `
      ${nRounds > 1 ? `
      <div class="calc-section">
        <div class="calc-label"><span>Il corso della partita</span><span>totali dopo ogni mano</span></div>
        ${progressChart(g, { mark: hl.round })}
      </div>` : ""}
      <div class="calc-section">
        <div class="calc-label"><span>Round</span><span>${nRounds} ${nRounds === 1 ? "mano" : "mani"}</span></div>
        <div class="table-scroll">
          <table class="rounds">
            <thead><tr><th>Giocatore</th>${Array.from({ length: nRounds }, (_, i) => tiebreakOf(g, i)
              ? `<th class="sp" title="manche di spareggio">R${i + 1}<i>sp</i></th>`
              : `<th>R${i + 1}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map(([id, r]) => `
                <tr class="${hl.pid === id ? "hl-row" : ""}"><th>${esc(r.name)}</th>${Array.from({ length: nRounds }, (_, i) => {
                  const e = g.rounds[id] && g.rounds[id][roundKey(i)];
                  const mark = hl.pid === id && hl.round === i ? " hl" : "";
                  const b = blockedAt(id);
                  // in uno spareggio chi era fuori non ha mano: non e' un buco; idem chi era bloccato
                  if (!e) return b !== null && i + 1 > b ? `<td class="dim${mark}" title="bloccato">⏸</td>`
                    : tiebreakOf(g, i) ? `<td class="dim${mark}" title="fuori dallo spareggio">–</td>` : `<td class="dim${mark}">·</td>`;
                  const c = computeRound(e);
                  return `<td class="${e.busted ? "bust" : c.flip7 ? "flip7" : e.frozen ? "frozen" : ""}${mark}${c.doubled ? " x2" : ""}">${c.doubled ? `<span class="x2-val">${c.total}<i class="x2-flag">×2</i></span>` : c.total}</td>`;
                }).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}
    ${hl.note ? `<p class="hl-note">${icon("star", "tiny")} ${esc(hl.note)}</p>` : ""}

    ${eloReportCard(store.getRoom().history, s.id, store.getRoom().players, { me: store.currentPlayerId(), section: true })}

    <div class="sheet-actions stack">
      <div class="act-row">
        ${nRounds ? `<button class="btn" data-action="game-replay">${icon("replay", "tiny")} Rivedi</button>` : ""}
        <button class="btn" data-action="game-share">${icon("share", "tiny")} Podio</button>
        ${store.isOwner() ? `<button class="btn" data-action="game-edit">${icon("pencil", "tiny")} Modifica</button>` : ""}
      </div>
      <button class="btn primary" data-action="sheet-close">Chiudi</button>
    </div>`;
}

// --- pagina: replay mano per mano ------------------------------------------------
function openReplayPage(id, g) {
  const progress = gameProgress(g);
  openPage({ type: "replay", id, game: g, progress, step: 0 }, renderReplayPage);
}

/** La mano di un giocatore in un round, disegnata con le carte. */
function handCards(e) {
  const r = computeRound(e);
  if (r.manual) return `<span class="rp-typed">${r.typed} punti scritti come totale${r.flip7 ? " + 15" : ""}</span>`;
  const cards = [
    ...(e.plus || []).slice().sort((a, b) => a - b).map((p) => modCard(p, { on: true, size: "mini" })),
    ...(e.doubled ? [modCard("x2", { on: true, size: "mini" })] : []),
    ...Array.from({ length: r.hearts }, () => heartCard({ size: "mini" })),
    ...r.numbers.map((n) => numberCard(n, { on: true, size: "mini" })),
    ...(r.flip7 ? [flip7Card({ size: "mini" })] : []),
    ...(e.busted && e.bustCard !== undefined && e.bustCard !== null ? [numberCard(Number(e.bustCard), { on: true, size: "mini dup" })] : [])
  ];
  return cards.join("") || `<span class="hand-empty">${e.frozen ? "congelato senza carte" : "nessuna carta"}</span>`;
}

function renderReplayPage(s) {
  const { game: g, progress: p, step } = s;
  const nameOf = (pid) => (g.results && g.results[pid] && g.results[pid].name) || "?";
  const rows = p.series
    .map((sr) => ({ ...sr, total: sr.totals[step], entry: g.rounds[sr.playerId] && g.rounds[sr.playerId][roundKey(step)] }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "it"));
  const target = Number(g.targetScore) || 200;
  const max = Math.max(target, ...rows.map((r) => r.total));
  const playoff = tiebreakOf(g, step);
  const leaders = new Set(p.leaders[step] || []);
  const last = step === p.rounds - 1;
  return `
    <div class="page-top">
      <button class="nav-btn" data-action="page-close" aria-label="Indietro">${icon("arrowLeft")}</button>
      <span class="page-title">Round ${step + 1} di ${p.rounds}</span>
      <span class="page-sub">${fmtDate(g.playedAt)}</span>
    </div>
    <div class="page-body">
      <div class="replay-nav">
        <button class="nav-btn" data-action="replay-step" data-to="prev" ${step === 0 ? "disabled" : ""} aria-label="Round precedente">${icon("arrowLeft")}</button>
        <div class="replay-dots">${Array.from({ length: p.rounds }, (_, i) => `<button class="rdot ${i === step ? "on" : ""} ${tiebreakOf(g, i) ? "sp" : ""}" data-action="replay-step" data-to="${i}" aria-label="Round ${i + 1}"></button>`).join("")}</div>
        <button class="nav-btn" data-action="replay-step" data-to="next" ${last ? "disabled" : ""} aria-label="Round successivo">${icon("arrowLeft", "flip")}</button>
      </div>
      ${playoff ? `<div class="playoff-strip">${icon("flag", "tiny")}<span><b>Spareggio</b> · la manche la giocano solo ${playoff.map(nameOf).map(esc).join(" e ")}</span></div>` : ""}
      <section class="card">
        ${progressChart(g, { mark: step, height: 130, inset: 58 })}
      </section>
      <section class="card">
        <ol class="rp-list">
          ${rows.map((r) => {
            const e = r.entry;
            const c = e ? computeRound(e) : null;
            const byName = (pid) => esc(nameOf(pid));
            const notes = [];
            if (e && e.frozen) notes.push(e.frozenBy ? `${icon("snow", "tiny")} congelato da ${byName(e.frozenBy)}` : `${icon("snow", "tiny")} congelato`);
            if (e && e.fl3By) notes.push(`${icon("cardFan", "tiny")} Pesca Tre da ${(Array.isArray(e.fl3By) ? e.fl3By : Object.values(e.fl3By)).map(byName).join(", ")}`);
            if (e && e.scFrom) notes.push(`${icon("heartFill", "tiny")} cuore da ${(Array.isArray(e.scFrom) ? e.scFrom : Object.values(e.scFrom)).map(byName).join(", ")}`);
            if (e && e.stayed) notes.push("si è fermato");
            if (e && e.blocked) notes.push("bloccato qui");
            const state = !e ? (playoff ? "fuori dallo spareggio" : "non ha giocato") : e.busted ? "SBALLATO" : c.flip7 ? "FLIP 7" : "";
            return `
            <li class="rp-row ${e && e.busted ? "bust" : ""} ${c && c.flip7 ? "flip7" : ""} ${leaders.has(r.playerId) ? "lead" : ""}" style="--pc:${playerColor(r.playerId, r.name)}">
              <div class="rp-head">
                ${avatar(r.playerId, r.name, "sm")}
                <b class="rp-name">${esc(r.name)}</b>
                ${leaders.has(r.playerId) && r.total > 0 ? crownEmblem("mini") : ""}
                ${state ? `<i class="seat-state ${e && e.busted ? "s-bust" : c && c.flip7 ? "s-flip7" : "s-excluded"}">${state}</i>` : ""}
                <span class="seat-pts"><b>${r.total}</b><small class="${e && e.busted ? "bust" : c && c.total ? "up" : ""}">${e ? (e.busted ? "+0" : `+${c.total}`) : ""}</small></span>
              </div>
              <span class="seat-rail" aria-hidden="true"><i style="width:${((r.total / max) * 100).toFixed(1)}%"></i></span>
              ${e ? `<div class="cards-row rp-cards">${handCards(e)}</div>` : ""}
              ${notes.length ? `<div class="by-note">${notes.join(" · ")}</div>` : ""}
            </li>`;
          }).join("")}
        </ol>
      </section>
      <p class="foot-note">${last ? "Ultima mano: la partita finisce qui." : "Scorri i round con le frecce o i puntini."}</p>
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
        <div class="card-head">${icon("history")}<span class="card-title">${fmtDateTime(s.game.playedAt)}</span><span class="ml-auto">${sourceTag(s.game) || '<span class="tag">dal vivo</span>'}</span></div>
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
    const st = makeCalcState({ order, roundIndex: r, playerId: id, playerName: p ? p.name : "?", existing, fullTotal: playerTotal({ scores: s.rounds }, id), others: s.players.filter((x) => x.playerId !== id).map((x) => ({ id: x.playerId, name: x.name })) });
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
