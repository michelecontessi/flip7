// ---------------------------------------------------------------------------
// L'immagine del podio da mandare in chat: si disegna su un canvas (marchio,
// data, i primi tre con avatar e punti, le colonnine di tutti) e si passa al
// foglio di condivisione del telefono; dove non c'e', si scarica il PNG.
// ---------------------------------------------------------------------------
import { toast, initials, colorOf } from "./ui.js";
import { playerAvatar, symbolSvg } from "./avatar.js";

const W = 1080, H = 1350;

/** Carica una sorgente immagine (data URI o svg inline) in un <img>. */
function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** L'avatar del giocatore come immagine: foto, personaggio disegnato o null (iniziali). */
async function avatarImage(pid) {
  const a = playerAvatar(pid);
  if (!a) return null;
  if (a.image) return { img: await loadImg(a.image), bg: null };
  const svg = symbolSvg(a.sym).replace(/class="[^"]*"/, "").replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"');
  return { img: await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)), bg: a.bg };
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

async function drawAvatar(c, pid, name, cx, cy, r) {
  const a = await avatarImage(pid);
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.closePath();
  c.fillStyle = (a && a.bg) || colorOf(name);
  c.fill();
  c.clip();
  if (a && a.img) {
    if (a.bg) c.drawImage(a.img, cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56);
    else c.drawImage(a.img, cx - r, cy - r, r * 2, r * 2);
  } else {
    c.fillStyle = "rgba(0,0,0,.55)";
    c.font = `800 ${Math.round(r * 0.85)}px Fredoka, "Nunito Sans", system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(initials(name), cx, cy + r * 0.04);
  }
  c.restore();
  c.lineWidth = 6;
  c.strokeStyle = "#fff";
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
}

function crown(c, cx, cy, s) {
  c.save();
  c.translate(cx - s / 2, cy - s / 2);
  c.scale(s / 56, s / 52);
  const g = c.createLinearGradient(0, 0, 56, 52);
  g.addColorStop(0, "#ffe9a8"); g.addColorStop(0.3, "#ffc247"); g.addColorStop(0.55, "#ff9ec4"); g.addColorStop(0.75, "#8fd8ff"); g.addColorStop(1, "#ffd166");
  c.beginPath();
  c.moveTo(11, 36); c.lineTo(7.6, 14.6); c.lineTo(17.1, 21.5); c.lineTo(28, 7.2); c.lineTo(38.9, 21.5); c.lineTo(48.4, 14.6); c.lineTo(45, 36); c.closePath();
  c.fillStyle = g; c.fill();
  c.lineWidth = 2; c.strokeStyle = "#b97d0c"; c.lineJoin = "round"; c.stroke();
  roundRect(c, 9.4, 38, 37.2, 8.4, 3);
  c.fillStyle = "#ffd97a"; c.fill(); c.stroke();
  c.restore();
}

/**
 * Disegna il podio. `rows`: [{playerId, name, total}] dal primo all'ultimo;
 * `winners`: Set di id; `meta`: { title, subtitle, room, dateLabel, target }.
 */
export async function drawPodium(rows, winners, meta = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  try { await document.fonts.load('800 60px Fredoka'); await document.fonts.load('700 30px "Nunito Sans"'); } catch { /* font di sistema */ }

  // sfondo: carta chiara con la lamina iridescente in alto
  c.fillStyle = "#f7f4ef";
  c.fillRect(0, 0, W, H);
  const holo = c.createLinearGradient(0, 0, W, 420);
  holo.addColorStop(0, "#ffd8e6"); holo.addColorStop(0.2, "#ffe7ab"); holo.addColorStop(0.4, "#d6f7c6"); holo.addColorStop(0.6, "#c2ecff"); holo.addColorStop(0.8, "#e0d5ff"); holo.addColorStop(1, "#ffd8e6");
  c.fillStyle = holo;
  c.fillRect(0, 0, W, 460);
  c.fillStyle = "rgba(255,255,255,.35)";
  c.fillRect(0, 0, W, 460);

  // marchio
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.fillStyle = "#1c2027";
  c.font = '800 54px Fredoka, "Nunito Sans", system-ui, sans-serif';
  c.fillText("FLIP", 64, 96);
  c.save();
  c.translate(212, 60); c.rotate(-0.16);
  roundRect(c, 0, 0, 44, 58, 8);
  c.fillStyle = "#fff"; c.fill(); c.lineWidth = 3; c.strokeStyle = "#1c2027"; c.stroke();
  c.fillStyle = "#c53b30"; c.font = '800 36px Fredoka, system-ui, sans-serif'; c.textAlign = "center"; c.fillText("7", 22, 43);
  c.restore();
  c.textAlign = "right";
  c.fillStyle = "#4a4f57";
  c.font = '700 30px "Nunito Sans", system-ui, sans-serif';
  if (meta.room) c.fillText(meta.room, W - 64, 82);
  if (meta.dateLabel) { c.font = '600 26px "Nunito Sans", system-ui, sans-serif'; c.fillText(meta.dateLabel, W - 64, 120); }

  // titolo
  c.textAlign = "center";
  c.fillStyle = "#6c7480";
  c.font = '700 30px "Nunito Sans", system-ui, sans-serif';
  c.fillText((meta.title || "Vince").toUpperCase(), W / 2, 200);
  const first = rows[0];
  const names = rows.filter((r) => winners.has(r.playerId)).map((r) => r.name);
  c.fillStyle = "#1c2027";
  c.font = '800 88px Fredoka, "Nunito Sans", system-ui, sans-serif';
  let title = names.join(" e ") || (first ? first.name : "");
  while (c.measureText(title).width > W - 120 && title.length > 4) title = title.slice(0, -2) + "…";
  c.fillText(title, W / 2, 300);
  if (meta.subtitle) {
    c.fillStyle = "#4a4f57";
    c.font = '700 34px "Nunito Sans", system-ui, sans-serif';
    c.fillText(meta.subtitle, W / 2, 360);
  }

  // podio: 2 - 1 - 3
  const top = [rows[1], rows[0], rows[2]];
  const heights = [150, 220, 110];
  const colors = [["#dde4ec", "#a8b4c2", "#3f4c5c"], ["#ffd97a", "#e2a416", "#674502"], ["#e9bd93", "#c0824f", "#59301a"]];
  const baseY = 900;
  const colW = 250, gap = 34;
  const x0 = W / 2 - (colW * 3 + gap * 2) / 2;
  for (let i = 0; i < 3; i++) {
    const r = top[i];
    if (!r) continue;
    const x = x0 + i * (colW + gap);
    const h = heights[i];
    const g = c.createLinearGradient(0, baseY - h, 0, baseY);
    g.addColorStop(0, colors[i][0]); g.addColorStop(1, colors[i][1]);
    roundRect(c, x, baseY - h, colW, h, 22);
    c.fillStyle = g; c.fill();
    c.fillStyle = colors[i][2];
    c.font = '800 64px Fredoka, "Nunito Sans", system-ui, sans-serif';
    c.textAlign = "center";
    c.fillText(String(r.total), x + colW / 2, baseY - h + 88);
    c.font = '700 26px "Nunito Sans", system-ui, sans-serif';
    c.fillText(i === 1 ? "1º" : i === 0 ? "2º" : "3º", x + colW / 2, baseY - h + 126);
    const ar = i === 1 ? 84 : 66;
    const cy = baseY - h - ar - 60;
    await drawAvatar(c, r.playerId, r.name, x + colW / 2, cy, ar);
    if (i === 1) crown(c, x + colW / 2, cy - ar - 44, 96);
    c.fillStyle = "#1c2027";
    c.font = `${i === 1 ? 800 : 700} ${i === 1 ? 38 : 30}px "Nunito Sans", system-ui, sans-serif`;
    let nm = r.name;
    while (c.measureText(nm).width > colW - 16 && nm.length > 3) nm = nm.slice(0, -2) + "…";
    c.fillText(nm, x + colW / 2, cy + ar + 44);
  }

  // tutti gli altri, in riga
  const rest = rows.slice(3);
  let y = baseY + 70;
  c.textAlign = "left";
  for (const r of rest.slice(0, 6)) {
    c.fillStyle = "#4a4f57";
    c.font = '700 30px "Nunito Sans", system-ui, sans-serif';
    c.fillText(`${rows.indexOf(r) + 1}º  ${r.name}`, 120, y);
    c.textAlign = "right";
    c.fillStyle = "#1c2027";
    c.font = '800 34px Fredoka, "Nunito Sans", system-ui, sans-serif';
    c.fillText(String(r.total), W - 120, y);
    c.textAlign = "left";
    y += 50;
  }

  // piede
  c.textAlign = "center";
  c.fillStyle = "#9ba2ad";
  c.font = '600 24px "Nunito Sans", system-ui, sans-serif';
  c.fillText(meta.foot || `Flip 7 · segnapunti dell'ufficio${meta.target ? ` · traguardo ${meta.target}` : ""}`, W / 2, H - 56);
  return canvas;
}

/** Condivide (o scarica) il canvas come PNG. */
export async function shareCanvas(canvas, filename = "flip7-podio.png", text = "") {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return toast("Non sono riuscito a creare l'immagine", "warn");
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; }
    catch (err) { if (err && err.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Immagine scaricata");
}

/** Podio pronto da condividere: rows dal primo all'ultimo, winners Set. */
export async function sharePodium(rows, winners, meta = {}) {
  toast("Preparo l'immagine…");
  const canvas = await drawPodium(rows, winners, meta);
  await shareCanvas(canvas, meta.filename || "flip7-podio.png", meta.text || "");
}
