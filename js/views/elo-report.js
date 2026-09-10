// ---------------------------------------------------------------------------
// L'Elo di una partita, spiegato. Si vede a fine partita (al segnapunti e al
// tavolo online, prima di salvare: "cosi' si muovera'") e nel dettaglio della
// partita dallo storico. Per ognuno quanto si muove il rating e contro chi:
// "+3 su Bea · −17 su Cal". Con un tocco si passa dall'Elo del mese (quello
// che assegna il titolo) all'Elo di sempre.
// ---------------------------------------------------------------------------
import { esc } from "../ui.js";
import { avatar } from "../avatar.js";
import { eloGameReport } from "../stats.js";

let scope = "month"; // "month" = Elo del mese, "all" = Elo di sempre

/** "+12" / "−8" / "±0". */
const signed = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0");
const tone = (d) => (d > 0 ? "up" : d < 0 ? "down" : "flat");
const RESULT = { 1: "davanti a", 0.5: "alla pari con", 0: "dietro a" };

/** Il perche' di uno spostamento, per chi tiene il dito sopra: risultato e probabilita' stimata. */
function why(v) {
  const pct = Math.round(v.expected * 100);
  return `${RESULT[v.result] || "contro"} ${v.name} (Elo ${v.before}): la probabilità stimata di finirgli davanti era ${pct}%`;
}

/**
 * Il riquadro "Elo della partita".
 * @param {object} history  lo storico CON dentro la partita da spiegare (anche
 *   una non ancora salvata, sotto un id provvisorio)
 * @param {string} gameId  la partita
 * @param {{me?:string|null, pending?:boolean, section?:boolean}} opts
 *   `pending`: la partita non e' ancora nello storico, i numeri valgono quando
 *   si salva; `section`: dentro un pannello (dettaglio dallo storico) invece
 *   che come card a se'
 */
export function eloReportCard(history, gameId, players, { me = null, pending = false, section = false } = {}) {
  const rep = eloGameReport(history, gameId, players, { month: scope === "month" });
  if (!rep) return "";
  const on = (s) => (scope === s ? "on" : "");
  const sub = pending ? "vale appena la partita va nello storico" : "com'è cambiato con questa partita";
  const body = `
      <div class="mode-switch">
        <button class="${on("month")}" data-action="elo-report-scope" data-s="month">Elo del mese</button>
        <button class="${on("all")}" data-action="elo-report-scope" data-s="all">Elo di sempre</button>
      </div>
      <ul class="er-list">
        ${rep.rows.map((r) => `
          <li class="${r.playerId === me ? "me" : ""}">
            ${avatar(r.playerId, r.name, "sm")}
            <span class="er-name">${esc(r.name)}<small>${r.before} → <b>${r.after}</b></small></span>
            <b class="er-delta ${tone(r.delta)}">${signed(r.delta)}</b>
            <span class="er-vs">${r.vs.map((v) => `<i class="${tone(v.swing)}" title="${esc(why(v))}">${signed(v.swing)} su ${esc(v.name)}</i>`).join("")}</span>
          </li>`).join("")}
      </ul>
      <p class="er-note">Ogni avversario è una sfida a due: chi finisci davanti ti dà punti, chi finisci dietro te li toglie.
        Battere chi ha un Elo più alto rende di più, perdere con chi ce l'ha più basso costa di più.${scope === "month" ? " Nel mese tutti ripartono da 1000: è l'Elo che assegna il titolo." : ""}</p>`;
  if (section) {
    return `
    <div class="calc-section elo-report">
      <div class="calc-label"><span>Elo di questa partita</span><span>${sub}</span></div>
      ${body}
    </div>`;
  }
  return `
    <section class="card elo-report">
      <div class="er-head">
        <h2 class="section-title">Elo di questa partita</h2>
        <small>${sub}</small>
      </div>
      ${body}
    </section>`;
}

export const eloReportView = {
  actions: {
    "elo-report-scope"(ctx, el) { scope = el.dataset.s === "all" ? "all" : "month"; }
  }
};
