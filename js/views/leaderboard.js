// ---------------------------------------------------------------------------
// Vista "Classifica": Crown perpetue. Una vittoria = una Crown.
// Toccando un giocatore si apre la sua scheda a schermo intero.
// ---------------------------------------------------------------------------
import { esc, initials, colorOf, fmtNum, fmtDate, openPage } from "../ui.js";
import { icon, crownEmblem } from "../icons.js";
import { leaderboard, sortLeaderboard, playerHighlights, PERIODS, historyList } from "../stats.js";

const localState = { period: "all", sort: "crowns", dir: -1 };

const COLUMNS = [
  { key: "crowns", label: "crown", icon: "crownFill" },
  { key: "avg", label: "media" },
  { key: "games", label: "part." }
];

const sortRows = (rows) => sortLeaderboard(rows, localState.sort, localState.dir);

/**
 * Fino a 5 Crown le disegna tutte; da 6 in su una corona sola e il numero,
 * cosi' regge anche i 200 di chi gioca tutti i giorni.
 */
function crownRow(n, max = 5) {
  if (!n) return `<span class="crown-none">nessuna Crown</span>`;
  if (n > max) return `<span class="crown-row big-count">${crownEmblem()}<b class="crown-more">×${n}</b></span>`;
  return `<span class="crown-row">${Array.from({ length: n }, (_, i) => `<i style="--d:${i * 90}ms">${crownEmblem()}</i>`).join("")}</span>`;
}

function crownHero(row, gamesCount) {
  if (!row) return "";
  return `
    <section class="crown-hero holo">
      <span class="holo-sweep" aria-hidden="true"></span>
      ${crownEmblem("big")}
      <div class="ch-count"><b>${row.crowns}</b><span>Crown</span></div>
      <div class="ch-name">
        <span class="avatar" style="background:${colorOf(row.name)}">${initials(row.name)}</span>
        ${esc(row.name)}
      </div>
      <div class="ch-sub">${row.crowns} vittorie su ${gamesCount} partite · media ${fmtNum(row.avg, 1)}</div>
    </section>`;
}

export const leaderboardView = {
  render(ctx) {
    const { room, me } = ctx;
    const { rows, gamesCount } = leaderboard(room.history, room.players, { period: localState.period });
    const sorted = sortRows(rows);

    if (!rows.length) {
      return `
        <section class="card empty-state">
          <div class="empty-ico gold">${icon("crownFill")}</div>
          <h2 class="empty-title">Ancora nessuna Crown</h2>
          <p class="muted">Ogni partita vinta vale una Crown. Gioca, oppure recupera le partite già fatte dallo Storico.</p>
          <button class="btn primary" data-action="goto-history">${icon("plus", "tiny")} Aggiungi partita passata</button>
        </section>`;
    }

    const leader = sortRows(rows.filter((r) => r.crowns > 0))[0];

    return `
      ${crownHero(leader, gamesCount)}

      <section class="card tight">
        <div class="card-head">
          <h2 class="section-title">Classifica</h2>
          <label class="period-select ml-auto">
            <select data-change="lb-period">
              ${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${localState.period === k ? "selected" : ""}>${v.label}</option>`).join("")}
            </select>
            ${icon("chevron", "tiny")}
          </label>
        </div>

        <div class="lb-head">
          <span></span>
          <span>Giocatore</span>
          ${COLUMNS.map((c) => `
            <button class="lb-sort ${localState.sort === c.key ? "on" : ""}" data-action="lb-sort" data-k="${c.key}">
              ${c.icon ? icon(c.icon, "tiny") : c.label}
              ${localState.sort === c.key ? `<i class="arrow ${localState.dir === -1 ? "down" : "up"}">${icon("chevron", "tiny")}</i>` : ""}
            </button>`).join("")}
        </div>

        <ul class="lb-list">
          ${sorted.map((r, i) => `
            <li class="lbrow ${r.playerId === me ? "me" : ""} ${r.archived ? "arch" : ""} ${i === 0 ? "top" : ""}"
                data-action="lb-detail" data-id="${r.playerId}">
              <span class="rank">${i + 1}</span>
              <span class="lbname">
                <span class="avatar sm" style="background:${colorOf(r.name)}">${initials(r.name)}</span>
                <span class="txt">${esc(r.name)}
                  <small>rec. ${r.best} · ${fmtNum(r.winRate * 100, 0)}%</small></span>
              </span>
              <span class="crown-chip ${r.crowns ? "" : "zero"}">${r.crowns ? crownEmblem("mini") : icon("crownFill")}<b>${r.crowns}</b></span>
              <span class="col avg">${fmtNum(r.avg, 1)}</span>
              <span class="col games">${r.games}</span>
            </li>`).join("")}
        </ul>
      </section>

      <p class="foot-note">Una vittoria = una Crown. Tocca un giocatore per la sua scheda.</p>`;
  },

  actions: {
    "lb-sort"(ctx, el) {
      const k = el.dataset.k;
      if (localState.sort === k) localState.dir = -localState.dir;
      else { localState.sort = k; localState.dir = -1; }
    },
    "goto-history"() { location.hash = "#storico"; },
    "lb-detail"(ctx, el) {
      const pid = el.dataset.id;
      const { rows } = leaderboard(ctx.room.history, ctx.room.players, { period: localState.period });
      const row = rows.find((r) => r.playerId === pid);
      if (!row) return;
      const games = historyList(ctx.room.history).filter((g) => g.results && g.results[pid]);
      openPage({ row, games, pid }, renderPlayerPage);
      // il grafico e' lungo quanto lo storico: lo porto sull'ultima partita
      requestAnimationFrame(() => {
        const box = document.querySelector(".chart-scroll");
        if (box) box.scrollLeft = box.scrollWidth;
      });
      return "page";
    }
  },

  changes: {
    "lb-period"(ctx, el) { localState.period = el.value; }
  }
};

// ---------------------------------------------------------------------------
// Scheda giocatore a schermo intero
// ---------------------------------------------------------------------------
function renderChart(games, pid) {
  const chrono = [...games].sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));
  if (chrono.length < 2) return "";

  const values = chrono.map((g) => Number(g.results[pid].total) || 0);
  const target = Math.max(...chrono.map((g) => Number(g.targetScore) || 200));
  const scale = Math.max(...values, target) * 1.08;
  // con tante partite le barre si stringono e i numeri sopra spariscono
  const dense = chrono.length > 22;
  const barW = chrono.length > 60 ? 8 : dense ? 13 : 26;

  return `
    <section class="card">
      <div class="card-head">
        <h2 class="section-title">Andamento</h2>
        <span class="muted small ml-auto">${chrono.length} partite</span>
      </div>
      <div class="chart-scroll">
        <div class="chart-inner ${dense ? "dense" : ""}" style="--bw:${barW}px">
          <span class="chart-goal" style="bottom:${((target / scale) * 100).toFixed(1)}%"><i></i></span>
          <div class="chart-bars">
            ${chrono.map((g, i) => {
              const v = values[i];
              const h = Math.max(3, (v / scale) * 100).toFixed(1);
              const win = g.winnerIds && g.winnerIds[pid];
              return `
                <div class="cbar ${win ? "win" : ""}" title="${fmtDate(g.playedAt)}: ${v}">
                  ${dense ? "" : `<span class="cbar-val" style="bottom:calc(${h}% + 4px)">${v}</span>`}
                  <i style="height:${h}%"></i>
                </div>`;
            }).join("")}
          </div>
        </div>
      </div>
      <p class="chart-note">dalla più vecchia alla più recente · in oro le vittorie · la linea è l'obiettivo ${target}</p>
    </section>`;
}

function renderPlayerPage(s) {
  const { row, games, pid } = s;
  const h = playerHighlights(games, pid);

  const mood = h.currentStreak >= 2 ? `In serie: <b>${h.currentStreak} vittorie di fila</b>`
    : h.sinceLastWin === 0 ? `Ha vinto <b>l'ultima partita</b>`
    : h.sinceLastWin === 1 ? `Ha perso l'ultima partita`
    : `Non vince da <b>${h.sinceLastWin} partite</b>`;

  return `
    <div class="page-top">
      <button class="nav-btn" data-action="page-close" aria-label="Indietro">${icon("arrowLeft")}</button>
      <span class="page-title">${esc(row.name)}</span>
    </div>

    <div class="page-body">
      <section class="profile-hero holo">
        <span class="holo-sweep" aria-hidden="true"></span>
        <span class="avatar xl" style="background:${colorOf(row.name)}">${initials(row.name)}</span>
        <div class="profile-name">${esc(row.name)}</div>
        <div class="profile-sub">${row.games} partite giocate</div>
      </section>

      <div class="hl-grid">
        <div class="hl hl-crown">
          ${crownEmblem("big")}
          <div class="hl-txt"><b>${row.crowns}</b><span>${row.crowns === 1 ? "Crown vinta" : "Crown vinte"}</span></div>
        </div>

        <div class="hl tone-green">
          <b>${h.bestStreak}</b>
          <span>di fila<small>la serie più lunga</small></span>
        </div>
        <div class="hl tone-blue">
          <b>${h.best.total}</b>
          <span>il suo record<small>${h.best.playedAt ? fmtDate(h.best.playedAt) : "—"}</small></span>
        </div>
        <div class="hl">
          <b>${fmtNum(row.avg, 1)}</b>
          <span>media a partita<small>${row.points} punti in tutto</small></span>
        </div>
        <div class="hl tone-violet">
          <b>${fmtNum(row.winRate * 100, 0)}%</b>
          <span>di partite vinte<small>${row.crowns} su ${row.games}</small></span>
        </div>
        ${h.detailedGames ? `
          <div class="hl tone-gold">
            <b>${h.flip7s}</b>
            <span>${h.flip7s === 1 ? "Flip 7 riuscito" : "Flip 7 riusciti"}<small>in ${h.detailedGames} partite tracciate</small></span>
          </div>
          <div class="hl tone-red">
            <b>${h.busts}</b>
            <span>${h.busts === 1 ? "sballo" : "sballi"}<small>round buttati via</small></span>
          </div>` : ""}
      </div>

      <p class="mood">${mood}</p>

      ${renderChart(games, pid)}

      <section class="card">
        <div class="card-head">
          <h2 class="section-title">Tutte le partite</h2>
          <span class="muted small ml-auto">${games.length}</span>
        </div>
        <ul class="mini-list">
          ${games.map((g) => {
            const res = g.results[pid];
            const win = g.winnerIds && g.winnerIds[pid];
            return `<li class="${win ? "win" : ""}">
              <span class="mini-name">${win ? crownEmblem("mini") : `<i class="dot-empty"></i>`}${fmtDate(g.playedAt)}</span>
              <b>${res.total}</b></li>`;
          }).join("") || `<li class="muted">Nessuna partita</li>`}
        </ul>
      </section>
    </div>`;
}
