// ---------------------------------------------------------------------------
// CONFIGURAZIONE
// Questo e' l'unico file da modificare dopo aver creato il progetto Firebase.
// Istruzioni passo-passo nel README.md, sezione "Setup Firebase (5 minuti)".
//
// Finche' lasci i campi vuoti l'app funziona lo stesso, ma in "modalita' locale":
// i dati restano solo sul dispositivo e non c'e' sincronia live.
// ---------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "", // <-- https://<progetto>-default-rtdb.<regione>.firebasedatabase.app
  projectId: "",
  appId: ""
};

// Versione dell'SDK Firebase caricata da CDN. Se un giorno vuoi aggiornarla,
// cambia solo questo numero (elenco versioni: firebase.google.com/support/release-notes/js).
export const FIREBASE_SDK_VERSION = "11.6.0";

export const DEFAULTS = {
  roomId: "ufficio",          // codice stanza di default (condiviso da tutti)
  roomName: "Ufficio",
  targetScore: 200            // punteggio che chiude la partita
};

export const isFirebaseConfigured = Boolean(firebaseConfig.databaseURL && firebaseConfig.apiKey);
