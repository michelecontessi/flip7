// ---------------------------------------------------------------------------
// Vista "Classifica": Crown perpetue. Una vittoria = una Crown.
// Toccando un giocatore si apre la sua scheda a schermo intero.
// ---------------------------------------------------------------------------
import { esc, initials, colorOf, fmtNum, fmtDate, openPage } from "../ui.js";
import { avatar } from "../avatar.js";
import { icon, crownEmblem, awardEmblem } from "../icons.js";
import { leaderboard, sortLeaderboard, leaderboardTrend, playerHighlights, awards, awardRanking, PERIODS, SOURCES, matchesSource, historyList } from "../stats.js";
import { openGameSheet } from "./history.js";
import { getRoom } from "../store.js";

// ---------------------------------------------------------------------------
// I record nati da UNA partita (o una mano) rimandano a quella partita, per
// rivederla: qui si dice quale campo della riga tiene la partita e cosa
// evidenziare nel dettaglio.
// ---------------------------------------------------------------------------
const GAME_RECORDS = {
  best: (r) => ({ game: r.bestGame, note: `${r.best} punti in questa partita, il suo record` }),
  bestHand: (r) => ({ game: r.bestHandGame, pid: r.playerId, round: r.bestHandRound, note: `la mano da ${r.bestHand} punti` }),
  bestComeback: (r) => ({ game: r.bestComebackGame, pid: r.playerId, round: r.bestComebackRound,
    note: `dopo il round ${r.bestComebackRound + 1} era sotto di ${r.bestComeback} punti, poi ha vinto` })
};

/** Pulsante "rivedi" verso la partita del record (vuoto se il record non ne ha una). */
function gameLink(key, r, cls = "rewatch") {
  const spec = GAME_RECORDS[key];
  const ref = spec ? spec(r) : null;
  const g = ref && ref.game ? (getRoom().history || {})[ref.game] : null;
  if (!g) return "";
  return `<button class="${cls}" data-action="award-game" data-g="${ref.game}" ${ref.pid ? `data-pid="${ref.pid}" data-round="${ref.round}"` : ""} data-note="${esc(ref.note)}">
    ${icon("history", "tiny")} rivedi · ${fmtDate(g.playedAt)}</button>`;
}

const localState = { period: "all", source: "all", sort: "crowns", dir: -1, trendMetric: "rank", trendSel: null };
const filters = () => ({ period: localState.period, source: localState.source });

const COLUMNS = [
  { key: "crowns", label: "crown", icon: "crownFill" },
  { key: "winRate", label: "vinte" },
  { key: "avg", label: "media" },
  { key: "games", label: "part." }
];

let ringSeq = 0;
/**
 * Anello delle vittorie: la fetta dorata e' la quota di partite vinte, il
 * numero al centro la stessa cosa in percentuale. A colpo d'occhio si vede
 * chi vince spesso anche se ha giocato poco.
 */
function winRing(rate) {
  const pct = Math.max(0, Math.min(100, Math.round((rate || 0) * 100)));
  const id = "wr" + (++ringSeq);
  const r = 15, circ = 2 * Math.PI * r;
  return `<span class="win-ring ${pct ? "" : "zero"}" title="${pct}% di partite vinte">
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffe1a0"/><stop offset=".5" stop-color="#f0a91e"/><stop offset="1" stop-color="#d1860c"/>
        </linearGradient>
      </defs>
      <circle class="wr-track" cx="18" cy="18" r="${r}"/>
      ${pct ? `<circle class="wr-arc" cx="18" cy="18" r="${r}" stroke="url(#${id})"
        stroke-dasharray="${(circ * pct / 100).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 18 18)"/>` : ""}
      <text class="wr-num" x="18" y="22.6" text-anchor="middle">${pct}</text>
    </svg>
  </span>`;
}

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

/**
 * Podio delle Crown: i primi tre sui gradini oro/argento/bronzo, il leader
 * al centro sotto la corona. Il podio segue sempre le Crown, qualunque
 * ordinamento sia attivo nella lista sotto.
 */
function renderPodium(rows, gamesCount) {
  const top = sortLeaderboard(rows.filter((r) => r.crowns > 0), "crowns").slice(0, 3);
  if (!top.length) return "";
  const leader = top[0];
  const col = (r, place) => r ? `
    <div class="pod-col p${place}">
      ${place === 1 ? `<div class="pod-crown">${crownEmblem("big")}</div>` : ""}
      ${avatar(r.playerId, r.name, place === 1 ? "lg" : "")}
      <span class="pod-name">${esc(r.name)}</span>
      <div class="pod-step">${crownEmblem("mini")}<b>${r.crowns}</b></div>
    </div>` : "";
  return `
    <section class="crown-hero holo podium">
      <span class="holo-sweep" aria-hidden="true"></span>
      <div class="pod-row">
        ${col(top[1], 2)}${col(top[0], 1)}${col(top[2], 3)}
      </div>
      <div class="ch-sub">${leader.crowns === 1 ? "1 vittoria" : leader.crowns + " vittorie"} su ${gamesCount === 1 ? "1 partita" : gamesCount + " partite"} · media ${fmtNum(leader.avg, 1)}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Record: titoli scherzosi (piu' Flip 7, piu' sballi, piu' congelate...). Il nome
// mostrato e' quello del vincitore; a pari merito compaiono entrambi.
// ---------------------------------------------------------------------------
function renderAwards(rows) {
  const list = awards(rows);
  if (!list.length) return "";
  return `
    <section class="card">
      <div class="card-head">
        <h2 class="section-title">Record</h2>
      </div>
      <div class="award-grid">
        ${list.map((a) => {
          const names = a.winners.map((w) => w.name);
          const label = names.length === 1 ? names[0]
            : names.length === 2 ? `${names[0]} e ${names[1]}`
            : `${names[0]} +${names.length - 1}`;
          const solo = a.winners.length === 1 ? a.winners[0] : null;
          return `
          <div class="award tone-${a.tone}" data-action="award-detail" data-id="${a.id}">
            ${awardEmblem(a.emblem)}
            <span class="award-title">${a.title}</span>
            <small class="award-desc">${a.desc}</small>
            <span class="award-holder">
              ${solo ? avatar(solo.playerId, solo.name, "xs") : ""}
              <b>${esc(label)}</b>
            </span>
            <span class="award-value">${a.unit(a.value)}</span>
            ${solo ? gameLink(a.key, solo, "rewatch card-link") : ""}
          </div>`;
        }).join("")}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Andamento nel tempo: una linea per giocatore (posizione in classifica o
// media punti dopo ogni partita), con l'avatar sul punto piu' recente.
// ---------------------------------------------------------------------------
function renderTrend(room, me) {
  const { steps, series } = leaderboardTrend(room.history, room.players, filters());
  if (steps.length < 2 || series.length < 2) return "";

  const byRank = localState.trendMetric !== "avg";
  const padL = byRank ? 30 : 40;
  const padR = 42, padT = 14, padB = 12;
  // larghezza reale della card (vista max 660px meno i padding): con poche
  // partite il grafico la riempie tutta, con tante si allarga oltre e scorre
  const vpw = document.documentElement.clientWidth || 360;
  const avail = Math.max(280, Math.min(660, vpw) - (vpw >= 700 ? 70 : 58));
  const minStep = steps.length > 40 ? 14 : steps.length > 20 ? 22 : 34;
  const stepW = Math.max(minStep, (avail - padL - padR) / (steps.length - 1));
  const plotW = (steps.length - 1) * stepW;
  const w = Math.round(padL + plotW + padR);

  const n = series.length;
  const plotH = byRank ? Math.max(1, n - 1) * (n > 8 ? 30 : 38) : 150;
  const h = padT + plotH + padB;
  const x = (i) => padL + i * stepW;

  // scala della media ancorata ai valori reali, non allo zero
  let hi = 10, lo = 0;
  if (!byRank) {
    let max = 0, min = Infinity;
    for (const s of steps) for (const v of Object.values(s.snap)) { max = Math.max(max, v.avg); min = Math.min(min, v.avg); }
    hi = Math.max(10, Math.ceil(max / 10) * 10);
    lo = Math.max(0, Math.min(Math.floor(min / 10) * 10, hi - 10));
  }
  const y = (v) => byRank
    ? padT + (n === 1 ? plotH / 2 : ((v - 1) / (n - 1)) * plotH)
    : padT + (1 - (v - lo) / (hi - lo)) * plotH;

  const grid = byRank
    ? Array.from({ length: n }, (_, i) => ({ y: y(i + 1), label: (i + 1) + "º" }))
    : [hi, (hi + lo) / 2, lo].map((v) => ({ y: y(v), label: String(Math.round(v)) }));

  const lines = series.map((p) => {
    const pts = [];
    steps.forEach((s, i) => {
      const v = s.snap[p.playerId];
      if (v) pts.push([x(i), y(byRank ? v.rank : v.avg)]);
    });
    return { ...p, pts, end: pts.length ? pts[pts.length - 1][1] : null, color: colorOf(p.name) };
  }).filter((p) => p.pts.length);

  // in modalita' media gli avatar finali possono sovrapporsi: li distanzio
  const ends = [...lines].sort((a, b) => a.end - b.end);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].end - ends[i - 1].end < 23) ends[i].end = ends[i - 1].end + 23;
  }
  const totH = Math.round(Math.max(h, ends.length ? ends[ends.length - 1].end + 13 : h));
  const avaX = (x(steps.length - 1) + 19).toFixed(1);
  const sel = Number.isInteger(localState.trendSel) && localState.trendSel < steps.length ? localState.trendSel : null;
  // colonne cliccabili: ognuna copre mezza distanza dai vicini
  const hitX = (i) => (i === 0 ? 0 : (x(i - 1) + x(i)) / 2);
  const hitR = (i) => (i === steps.length - 1 ? w : (x(i) + x(i + 1)) / 2);

  return `
    <section class="card">
      <div class="card-head">
        <h2 class="section-title">Andamento</h2>
        <span class="muted small ml-auto">${steps.length} partite</span>
      </div>
      <div class="mode-switch">
        <button class="${byRank ? "on" : ""}" data-action="trend-metric" data-m="rank">Posizione</button>
        <button class="${!byRank ? "on" : ""}" data-action="trend-metric" data-m="avg">Media punti</button>
      </div>
      <div class="chart-scroll from-end"><div>
        <svg class="trend-svg" width="${w}" height="${totH}" viewBox="0 0 ${w} ${totH}">
          ${grid.map((g) => `
            <line class="grid" x1="${padL - 4}" y1="${g.y.toFixed(1)}" x2="${(padL + plotW + 4).toFixed(1)}" y2="${g.y.toFixed(1)}"/>
            <text x="${padL - 8}" y="${g.y.toFixed(1)}">${g.label}</text>`).join("")}
          ${sel !== null ? `<line class="sel-line" x1="${x(sel).toFixed(1)}" y1="${padT - 8}" x2="${x(sel).toFixed(1)}" y2="${padT + plotH + 8}"/>` : ""}
          ${lines.map((p) => `
            <polyline class="${p.playerId === me ? "me" : ""}" stroke="${p.color}"
              points="${p.pts.map(([px, py]) => px.toFixed(1) + "," + py.toFixed(1)).join(" ")}"/>`).join("")}
          ${ends.map((p) => {
            const [lx, ly] = p.pts[p.pts.length - 1];
            return `
            <g>
              <title>${esc(p.name)}</title>
              ${Math.abs(p.end - ly) > 1 ? `<line class="lead" x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(avaX - 11).toFixed(1)}" y2="${p.end.toFixed(1)}" stroke="${p.color}"/>` : ""}
              <circle cx="${avaX}" cy="${p.end.toFixed(1)}" r="11" fill="${p.color}"/>
              <text class="ava" x="${avaX}" y="${p.end.toFixed(1)}">${esc(initials(p.name))}</text>
            </g>`;
          }).join("")}
          ${sel !== null ? lines.map((p) => {
            const v = steps[sel].snap[p.playerId];
            return v ? `<circle class="pt" cx="${x(sel).toFixed(1)}" cy="${y(byRank ? v.rank : v.avg).toFixed(1)}" r="4.5" fill="${p.color}"/>` : "";
          }).join("") : ""}
          ${steps.map((s, i) => `<rect class="hit" data-action="trend-point" data-i="${i}"
            x="${hitX(i).toFixed(1)}" y="0" width="${(hitR(i) - hitX(i)).toFixed(1)}" height="${totH}"/>`).join("")}
        </svg>
      </div></div>
      <p class="chart-note">${sel !== null ? trendCaption(steps[sel], series, byRank) : `${byRank ? "posizione in classifica" : "media punti"} dopo ogni partita · tocca una colonna per i dettagli`}</p>
    </section>`;
}

/** Didascalia della partita selezionata sul grafico. */
function trendCaption(step, series, byRank) {
  const rows = series
    .map((p) => ({ name: p.name, v: step.snap[p.playerId] }))
    .filter((r) => r.v)
    .sort((a, b) => (byRank ? a.v.rank - b.v.rank : b.v.avg - a.v.avg))
    .map((r) => (byRank ? `${r.v.rank}º ${esc(r.name)}` : `${esc(r.name)} ${fmtNum(r.v.avg, 1)}`));
  return `<b>${fmtDate(step.playedAt)}</b> · ${rows.join(" · ")}`;
}

export const leaderboardView = {
  render(ctx) {
    const { room, me } = ctx;
    const { rows, gamesCount } = leaderboard(room.history, room.players, filters());
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

    return `
      ${renderPodium(rows, gamesCount)}

      <section class="card tight">
        <div class="card-head">
          <h2 class="section-title">Classifica</h2>
          <label class="period-select ml-auto">
            <select data-change="lb-period">
              ${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${localState.period === k ? "selected" : ""}>${v.label}</option>`).join("")}
            </select>
            ${icon("chevron", "tiny")}
          </label>
          <label class="period-select">
            <select data-change="lb-source">
              ${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}" ${localState.source === k ? "selected" : ""}>${v.label}</option>`).join("")}
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
              <span class="rank ${i < 3 ? "medal m" + (i + 1) : ""}">${i + 1}</span>
              <span class="lbname">
                ${avatar(r.playerId, r.name, "sm")}
                <span class="txt">${esc(r.name)}
                  <small>rec. ${r.best}</small></span>
              </span>
              <span class="crown-chip ${r.crowns ? "" : "zero"}">${r.crowns ? crownEmblem("mini") : icon("crownFill")}<b>${r.crowns}</b></span>
              ${winRing(r.winRate)}
              <span class="col avg">${fmtNum(r.avg, 1)}</span>
              <span class="col games">${r.games}</span>
            </li>`).join("")}
        </ul>
      </section>

      ${renderAwards(rows)}

      ${renderTrend(room, me)}

      <p class="foot-note">Una vittoria = una Crown, e l'anello dorato è la quota di partite vinte.
        Tocca un giocatore per la sua scheda, un record per la classifica di quella statistica.</p>`;
  },

  actions: {
    "lb-sort"(ctx, el) {
      const k = el.dataset.k;
      if (localState.sort === k) localState.dir = -localState.dir;
      else { localState.sort = k; localState.dir = -1; }
    },
    "trend-metric"(ctx, el) { localState.trendMetric = el.dataset.m; localState.trendSel = null; },
    "trend-point"(ctx, el) {
      const box = document.querySelector(".chart-scroll.from-end");
      const left = box ? box.scrollLeft : 0;
      const i = Number(el.dataset.i);
      localState.trendSel = localState.trendSel === i ? null : i;
      // il redraw azzererebbe lo scroll del grafico: lo rimetto dov'era
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const nb = document.querySelector(".chart-scroll.from-end");
        if (nb) nb.scrollLeft = left;
      }));
    },
    "goto-history"() { location.hash = "#storico"; },
    "award-detail"(ctx, el) {
      const { rows } = leaderboard(ctx.room.history, ctx.room.players, filters());
      const detail = awardRanking(rows, el.dataset.id);
      if (!detail || !detail.rows.length) return;
      openPage(detail, renderAwardPage);
      return "page";
    },
    "award-game"(ctx, el) {
      const d = el.dataset;
      openGameSheet(d.g, { pid: d.pid || null, round: d.round !== undefined ? Number(d.round) : -1, note: d.note || "" });
      return "sheet-quiet";
    },
    "lb-detail"(ctx, el) {
      const pid = el.dataset.id;
      const { rows } = leaderboard(ctx.room.history, ctx.room.players, filters());
      const row = rows.find((r) => r.playerId === pid);
      if (!row) return;
      const games = historyList(ctx.room.history)
        .filter((g) => g.results && g.results[pid] && matchesSource(g, localState.source));
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
    "lb-period"(ctx, el) { localState.period = el.value; localState.trendSel = null; },
    "lb-source"(ctx, el) { localState.source = el.value; localState.trendSel = null; }
  }
};

// ---------------------------------------------------------------------------
// Pagina di un record: la stessa statistica per tutti i giocatori in gara.
// ---------------------------------------------------------------------------
function awardRowSub(a, r) {
  if (a.key === "bustRate") {
    const s = r.busts === 1 ? "1 sballo" : `${r.busts} sballi`;
    return `${s} in ${r.tracked === 1 ? "1 partita" : r.tracked + " partite"}`;
  }
  if (a.key === "freezeRate") {
    const s = r.freezes === 1 ? "congelato 1 volta" : `congelato ${r.freezes} volte`;
    return `${s} in ${r.frozenTracked === 1 ? "1 partita" : r.frozenTracked + " partite"}`;
  }
  if (a.key === "avgCards") return `${r.cards} carte in ${r.hands === 1 ? "1 mano" : r.hands + " mani"}`;
  if (a.key === "bestHand") return `su ${r.rounds === 1 ? "1 mano giocata" : r.rounds + " mani giocate"}`;
  if (a.key === "bestComeback") return r.comebackWins === 1 ? "1 vittoria in rimonta" : `${r.comebackWins} vittorie in rimonta`;
  if (a.key === "flip7s") return `in ${r.tracked === 1 ? "1 partita tracciata" : r.tracked + " partite tracciate"}`;
  return `media ${fmtNum(r.avg, 1)}`;
}

function renderAwardPage(a) {
  return `
    <div class="page-top">
      <button class="nav-btn" data-action="page-close" aria-label="Indietro">${icon("arrowLeft")}</button>
      <span class="page-title">${a.title}</span>
    </div>

    <div class="page-body">
      <section class="award-hero tone-${a.tone}">
        ${awardEmblem(a.emblem)}
        <span class="award-title">${a.title}</span>
        <small class="award-desc">${a.desc}</small>
      </section>

      <section class="card tight">
        <ul class="aw-list">
          ${a.rows.map((r) => `
            <li class="${r.rank === 1 ? "aw-top tone-" + a.tone : ""}">
              <span class="rank">${r.rank}</span>
              ${avatar(r.playerId, r.name, "sm")}
              <span class="nm">${esc(r.name)}<small>${awardRowSub(a, r)}</small>${gameLink(a.key, r)}</span>
              <b>${a.unit(r.value)}</b>
            </li>`).join("")}
        </ul>
      </section>
      <p class="foot-note">${a.pick === "min" ? "Vince chi ha il valore più basso." : "Vince chi ha il valore più alto."}${a.key === "best" ? "" : " Contano solo le partite segnate round per round."}</p>
    </div>`;
}

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
        ${avatar(pid, row.name, "xl")}
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
        <div class="hl tone-blue ${h.best.gameId ? "tap" : ""}" ${h.best.gameId ? `data-action="award-game" data-g="${h.best.gameId}" data-note="${esc(`${h.best.total} punti in questa partita, il suo record`)}"` : ""}>
          <b>${h.best.total}</b>
          <span>il suo record<small>${h.best.playedAt ? fmtDate(h.best.playedAt) + " · rivedi" : "—"}</small></span>
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
            <span>${h.flip7s === 1 ? "Flip 7 riuscito" : "Flip 7 riusciti"}<small>in ${h.detailedGames === 1 ? "1 partita tracciata" : h.detailedGames + " partite tracciate"}</small></span>
          </div>
          <div class="hl tone-red">
            <b>${h.busts}</b>
            <span>${h.busts === 1 ? "sballo" : "sballi"}<small>round buttati via</small></span>
          </div>
          ${h.freezeGames ? `
          <div class="hl tone-ice">
            <b>${h.freezes}</b>
            <span>${h.freezes === 1 ? "volta congelato" : "volte congelato"}<small>in ${h.freezeGames === 1 ? "1 partita" : h.freezeGames + " partite"} con i Congela segnati</small></span>
          </div>` : ""}
          ${h.rounds ? `
          <div class="hl tone-fire ${h.bestHandGame ? "tap" : ""}" ${h.bestHandGame ? `data-action="award-game" data-g="${h.bestHandGame}" data-pid="${pid}" data-round="${h.bestHandRound}" data-note="${esc(`la mano da ${h.bestHand} punti`)}"` : ""}>
            <b>${h.bestHand}</b>
            <span>la sua mano migliore<small>punti in un solo round${h.bestHandGame ? " · rivedi" : ""}</small></span>
          </div>` : ""}
          ${h.bestComeback ? `
          <div class="hl tone-rose tap" data-action="award-game" data-g="${h.bestComebackGame}" data-pid="${pid}" data-round="${h.bestComebackRound}" data-note="${esc(`dopo il round ${h.bestComebackRound + 1} era sotto di ${h.bestComeback} punti, poi ha vinto`)}">
            <b>−${h.bestComeback}</b>
            <span>la rimonta più grande<small>era sotto di tanto, poi ha vinto · rivedi</small></span>
          </div>` : ""}
          ${h.hands ? `
          <div class="hl tone-violet">
            <b>${fmtNum(h.avgCards, 1)}</b>
            <span>carte a mano<small>su ${h.hands === 1 ? "1 mano segnata" : h.hands + " mani segnate"} carta per carta</small></span>
          </div>` : ""}` : ""}
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
