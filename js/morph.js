// ---------------------------------------------------------------------------
// Ridisegno incrementale: porta il DOM esistente allo stato del nuovo HTML
// toccando solo quello che cambia, invece di sostituire tutto con innerHTML.
// Gli elementi che restano (righe dei posti, carte in mano, barre) mantengono
// la loro identita': le transizioni CSS partono davvero, niente ricostruzione
// di decine di carte a ogni mossa, e le animazioni in corso non si interrompono.
//
// Abbinamento dei figli: chi ha `data-key` si ritrova per chiave (anche se ha
// cambiato posizione), gli altri per ordine e tipo di nodo.
// ---------------------------------------------------------------------------

/** Aggiorna `root` perche' contenga esattamente `html`. */
export function morph(root, html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  morphChildren(root, tpl.content);
}

const keyOf = (n) => (n.nodeType === 1 && n.hasAttribute("data-key")) ? n.tagName + "|" + n.getAttribute("data-key") : null;

function compatible(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true; // testo o commento: basta aggiornare il contenuto
  return a.tagName === b.tagName;
}

function morphElement(a, b) {
  for (const name of a.getAttributeNames()) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const name of b.getAttributeNames()) {
    const v = b.getAttribute(name);
    if (a.getAttribute(name) !== v) a.setAttribute(name, v);
  }
  if (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT") {
    if (a.value !== b.value) a.value = b.value;
    if (a.type === "checkbox" || a.type === "radio") a.checked = b.checked;
  }
  morphChildren(a, b);
}

function morphChildren(a, b) {
  const wanted = [...b.childNodes];
  const keyed = new Map();
  for (const old of a.childNodes) {
    const k = keyOf(old);
    if (k) keyed.set(k, old);
  }
  let cursor = a.firstChild;
  for (const want of wanted) {
    let match = null;
    const k = keyOf(want);
    if (k) {
      match = keyed.get(k) || null;
      if (match) keyed.delete(k);
    } else {
      // il primo nodo senza chiave, compatibile, a partire dal cursore
      for (let c = cursor; c; c = c.nextSibling) {
        if (!keyOf(c) && compatible(c, want)) { match = c; break; }
      }
    }
    if (match) {
      if (match !== cursor) a.insertBefore(match, cursor);
      if (match.nodeType === 1) morphElement(match, want);
      else if (match.nodeValue !== want.nodeValue) match.nodeValue = want.nodeValue;
      cursor = match.nextSibling;
    } else {
      a.insertBefore(want, cursor); // nodo nuovo: si sposta dal template al DOM
    }
  }
  // tutto quello che e' rimasto dopo il cursore non serve piu'
  while (cursor) {
    const next = cursor.nextSibling;
    a.removeChild(cursor);
    cursor = next;
  }
}
