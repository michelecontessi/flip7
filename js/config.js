// ---------------------------------------------------------------------------
// CONFIGURAZIONE
// Questo e' l'unico file da modificare dopo aver creato il progetto Firebase.
// Istruzioni passo-passo nel README.md, sezione "Setup Firebase (5 minuti)".
//
// Finche' lasci i campi vuoti l'app funziona lo stesso, ma in "modalita' locale":
// i dati restano solo sul dispositivo e non c'e' sincronia live.
// ---------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyBnwT4BlFlFUFExHfzZ3dHPx27AQFNr-1M",
  authDomain: "flip7-ufficio.firebaseapp.com",
  databaseURL: "https://flip7-ufficio-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flip7-ufficio",
  appId: "1:144024516928:web:d207646bc41d22b74ca2a5"
};

// Versione dell'SDK Firebase caricata da CDN. Se un giorno vuoi aggiornarla,
// cambia solo questo numero (elenco versioni: firebase.google.com/support/release-notes/js).
export const FIREBASE_SDK_VERSION = "11.6.0";

export const DEFAULTS = {
  // Nessuna stanza predefinita: al primo avvio l'app chiede di crearne una
  // (con codice segreto) o di entrare con un link ricevuto. Il codice NON
  // sta nel repository: vive solo nel link che condividi.
  roomId: null,
  roomName: "Flip 7",
  targetScore: 200            // punteggio che chiude la partita
};

export const isFirebaseConfigured = Boolean(firebaseConfig.databaseURL && firebaseConfig.apiKey);
