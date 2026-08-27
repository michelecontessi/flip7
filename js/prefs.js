// Preferenze locali del singolo dispositivo (chi sono io, ultima stanza, ecc).
const KEY = "flip7:prefs";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* private mode */ }
}

export const prefs = {
  get(key, fallback = null) {
    const v = read()[key];
    return v === undefined ? fallback : v;
  },
  set(key, value) {
    const all = read();
    if (value === null || value === undefined) delete all[key];
    else all[key] = value;
    write(all);
  }
};

// Identificativo stabile del dispositivo, usato in modalita' locale al posto
// dell'uid Firebase (serve a capire se sono io il segnapunti).
export function deviceId() {
  let id = prefs.get("deviceId");
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10);
    prefs.set("deviceId", id);
  }
  return id;
}
