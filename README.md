# Flip 7 — Segnapunti da ufficio 🃏

Segnapunti live per **Flip 7**: un solo segnapunti inserisce i punti, tutti gli altri
seguono il tabellone **in diretta dal telefono**. Ogni partita finita entra nello storico
e alimenta la **classifica perpetua**: ogni vittoria vale una **Crown** 👑.

- 📱 pensata per il telefono (si installa sulla home come un'app)
- 🔴 sincronia in tempo reale fra tutti i dispositivi
- 👑 classifica perpetua: Crown, media punti, record, partite giocate
- 🧮 calcolatrice con le carte: numeri, `+2…+10`, `×2`, bonus **Flip 7** e sballo
- 🕰️ inserimento di **partite vecchie**, giocate prima dell'app
- 🔁 formazione libera: i giocatori possono cambiare da una partita all'altra
- 💸 **costo zero**: nessun dominio, nessun abbonamento

---

## 1. Provala subito (senza configurare niente)

```bash
npm start
```

Apri <http://localhost:4173>. Funziona già, ma in **modalità locale**: i dati restano
solo su quel dispositivo. Per la sincronia live servono i due passi qui sotto.

---

## 2. Setup Firebase (5 minuti, gratis)

Serve un account Google. Il piano **Spark** è gratuito e non chiede la carta di credito:
i suoi limiti (1 GB di dati, 10 GB di traffico al mese) sono migliaia di volte sopra
quello che consuma questa app.

1. Vai su <https://console.firebase.google.com> → **Crea un progetto**.
   Nome a piacere (es. `flip7-ufficio`). Puoi disattivare Google Analytics.
2. Nel menu a sinistra: **Crea** → **Realtime Database** → **Crea database**.
   - posizione: `europe-west1`
   - modalità: **bloccata** (le regole giuste le mettiamo al punto 4)
3. Menu **Crea** → **Authentication** → **Inizia** → scheda **Metodo di accesso** →
   abilita **Anonimo**. Serve perché i telefoni possano leggere/scrivere senza registrarsi.
4. Torna in **Realtime Database** → scheda **Regole**, incolla il contenuto del file
   [`database.rules.json`](database.rules.json) e premi **Pubblica**.
   Queste regole dicono: chiunque abbia il codice stanza può leggere, ma **solo il
   segnapunti in carica può scrivere i punti della partita in corso**.
5. Menu ⚙️ **Impostazioni progetto** → in fondo, **Le tue app** → icona `</>` (Web) →
   registra l'app → copia l'oggetto `firebaseConfig`.
6. Incolla i valori in [`js/config.js`](js/config.js):

```js
export const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "flip7-ufficio.firebaseapp.com",
  databaseURL: "https://flip7-ufficio-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flip7-ufficio",
  appId: "1:123…:web:abc…"
};
```

> La `databaseURL` è quella che vedi in cima alla pagina del Realtime Database.
> Se manca, l'app resta in modalità locale.
> Queste chiavi **non sono segrete**: stanno nel codice di qualsiasi app web Firebase,
> e a proteggere i dati sono le regole del punto 4.

---

## 3. Pubblicazione su GitHub Pages (gratis, dominio incluso)

1. Crea un repository su GitHub (può essere pubblico o privato — Pages funziona
   con i repo privati solo sui piani a pagamento, quindi per restare gratis usa **pubblico**).
2. Dalla cartella del progetto:

```bash
git init && git add -A && git commit -m "Flip 7 scoreboard" && git branch -M main
```

```bash
git remote add origin https://github.com/TUO-UTENTE/flip7.git && git push -u origin main
```

3. Su GitHub: **Settings** → **Pages** → *Source*: `Deploy from a branch`,
   branch `main`, cartella `/ (root)` → **Save**.
4. Dopo un minuto l'app è online su `https://TUO-UTENTE.github.io/flip7/`.

Manda quel link ai colleghi. Su iPhone: *Condividi → Aggiungi a Home*;
su Android: *menu ⋮ → Installa app*. Da lì si apre a schermo intero come un'app vera.

Per aggiornarla in futuro basta un `git push`: Pages ripubblica da solo.

---

## 4. Come si gioca

**Prima volta (chi organizza)**

1. Apri l'app → tab **Setup** → aggiungi i nomi dei giocatori.
2. Torna su **Partita**: in cima trovi il riquadro *Chi segna i punti?* → premi
   **Segno io i punti**. Da quel momento sei tu che inserisci i punteggi.
3. Premi **Condividi stanza** (o l'icona 🔗 in alto) e manda il link nella chat dell'ufficio.

**Ogni collega**, aperto il link, va in **Setup** → *Io sono* e sceglie il proprio nome:
da lì in poi vedrà il proprio punteggio in grande sopra al tabellone.

> **Il ruolo di segnapunti è di un dispositivo alla volta**, ed è chi lo prende a decidere:
> non si assegna a distanza. Chi non ce l'ha vede in cima la striscia
> *"Segna i punti Anna Ricci"* con il pulsante **Passa a me**: basta premerlo per subentrare
> (serve una conferma). Se nessuno l'ha preso, tutti vedono il riquadro grande con
> **Segno io i punti**.

**Durante la partita** (solo il segnapunti)

1. Tab **Partita** → seleziona chi gioca → **Inizia partita**.
2. A fine mano premi il pulsante **Segna i punti**: si apre il pannello sul primo
   giocatore, con le **carte** davanti. Tocchi le carte numero che ha in mano, i
   modificatori `+2…+10` e `×2`, e il totale si calcola da solo; poi **Salva e avanti ›**
   passa al giocatore dopo. Con le frecce ‹ › ti sposti a mano.
   - il bonus **Flip 7** (+15) viene aggiunto da solo alla settima carta numero diversa
   - **Sballato** mette 0 al round
   - se preferisci fare i conti a mente, la linguetta **Tastierino** ti fa digitare
     direttamente il totale (lì il Flip 7 si aggiunge col tasto dedicato)
3. Quando tutti hanno il punteggio, il pulsante diventa **Chiudi round** e si passa al successivo.
   Il round in corso è sempre scritto nella pastiglia scura in cima al tabellone
   (*Round 4*), con accanto quanti punteggi mancano.
4. Al superamento dei 200 punti la partita si chiude da sola: premi
   **Salva e inizia nuova partita** per rigiocare subito con gli stessi,
   oppure **Salva e basta**. Il vincitore incassa la sua Crown.

Serve correggere un errore? Tocchi la casella del round di quel giocatore e la rifai;
*← Round precedente* riapre il round appena chiuso.
Il segnapunti può cambiare in qualsiasi momento: chiunque può premere *prendi tu*.

**La corsa al traguardo**: sotto ogni giocatore c'è una rotaia che avanza verso
l'obiettivo, e sotto il totale i punti che gli mancano (`−69`). Chi è in testa ha la
rotaia dorata, chi arriva a 200 si becca un *arrivato*. Chi guarda dal telefono vede
la stessa cosa in grande nel proprio riquadro: **ti mancano 69 punti**.

**Invitare qualcuno a partita in corso**: il pulsante **Invita** in cima al tabellone
(o l'icona 🔗 nella barra in alto) apre la condivisione del link della stanza.

**Partite vecchie**: tab **Storico** → **Aggiungi partita passata** → data, giocatori e
punteggi finali. Il vincitore è automatico (punteggio più alto) o lo scegli tu.

---

## 5. Classifica e Crown

Una **vittoria = una Crown**, punto. Nessuna formula strana: in classifica le Crown
sono la colonna con la coroncina, e in cima c'è chi ne ha di più.

L'ordine è **Crown, poi media punti**: a parità di vittorie passa avanti chi ha la media
più alta, e se anche quella è uguale chi ha giocato più partite. Vale anche quando
riordini per un'altra colonna: le Crown restano il primo spareggio.

La tabella mostra anche media punti, record personale e partite giocate: tocca
un'intestazione per riordinare, e usa il menù in alto a destra per filtrare il periodo
(sempre / anno / mese / ultimi 30 giorni).

Toccando un giocatore si apre la sua **scheda a schermo intero**, con riquadri diversi
uno dall'altro invece di una griglia tutta uguale:

- **Crown vinte** in evidenza (fino a 5 disegna le coroncine, da 6 in su passa a
  “corona × N”: regge anche 200 vittorie);
- **la serie più lunga** di vittorie di fila, e sotto la frase del momento
  (*in serie: 4 di fila* / *non vince da 6 partite*);
- **il suo record** con la data, **media a partita**, **percentuale di vittorie**;
- **Flip 7 riusciti** e **sballi**, contati sulle partite segnate round per round;
- il grafico **Andamento su tutte le partite** — non solo le ultime dieci: le barre si
  stringono al crescere dello storico, si scorre lateralmente e si apre già sull'ultima
  partita giocata. In oro le vittorie, la tratteggiata è l'obiettivo.

I giocatori sono identificati da un id interno, quindi:
- se **rinomini** qualcuno, tutto il suo storico lo segue;
- i giocatori **non si eliminano**: chi smette di giocare si **archivia** (Setup),
  così sparisce dalle liste dei nuovi tavoli ma la classifica resta coerente.

---

## 6. Look & feel

L'app ha un suo marchio: la scritta **FLIP** con la cartina del **7** inclinata — in
lamina olografica — che ritrovi nella barra in alto, sul banner del vincitore e
sull'icona dell'app. La stessa iridescenza del cartonaggio torna sul filo colorato
sotto la barra in alto, sul riquadro Crown, sulla scheda giocatore e sulla coccarda
del Flip 7, con un riflesso che scorre lentamente. Le carte
numero sono disegnate come carte vere — cifra grande al centro e indice ripetuto ai due
angoli opposti — ognuna con il suo colore, dal celeste dello `0` al viola del `12`.
Il carattere è **Fredoka** per punteggi, titoli e carte, **Nunito Sans** per il testo:
due font Google, caricati da CDN e con ripiego sui font di sistema se sei offline.

> Il marchio è **originale**, disegnato per questa app: non riproduce il logo pubblicato
> del gioco, che è di chi lo ha registrato. Se vuoi usare l'immagine ufficiale in privato
> in ufficio, mettila come `logo.png` nella cartella e sostituisci la chiamata a
> `wordmark()` in [js/app.js](js/app.js) con un `<img src="logo.png">`.

Le sezioni non hanno cornici: si distinguono per superficie e ombra. Le corone sono
un emblema disegnato — gemme, fascia dorata e scintille — non una sagoma piatta, e nella
scheda giocatore ondeggiano piano.

Il **round in corso** è scritto in grande accanto alla carta col suo numero, colorata
con la tinta della carta corrispondente (dopo il 12 la tavolozza riparte). I
**modificatori** `+2…+10` sono arancioni e `×2` arancione scuro, con la fascia bianca
più spessa per distinguerli dalle carte numero — se il colore non ti torna, si cambia
in una riga in [css/styles.css](css/styles.css) (`.fcard.mod` e `.fcard.x2`).

Momenti "da tavolo": quando qualcuno fa **Flip 7** compare la coccarda iridescente e
parte un avviso dedicato; a fine partita il vincitore si prende coriandoli e corona.
Durante la partita ogni giocatore ha la sua rotaia, nel suo colore.

## 7. File del progetto

```
index.html               pagina unica
css/styles.css           tutto lo stile
js/config.js             ← l'unico file da modificare (chiavi Firebase)
js/app.js                avvio, tab, gestione eventi
js/store.js              stato condiviso: backend Firebase o locale
js/scoring.js            regole di punteggio di Flip 7
js/stats.js              totali di partita e classifica perpetua
js/icons.js              icone SVG, marchio FLIP 7 e facce delle carte
js/ui.js                 helper: date, toast, bottom sheet, dialoghi, condivisione
js/theme.js              tema chiaro/scuro
js/views/                partita · classifica · storico · setup
database.rules.json      regole di sicurezza del database
sw.js, manifest.webmanifest, icon.svg    supporto PWA
server.mjs               server di sviluppo locale (npm start)
test/                    test della logica di punteggio (npm test)
```

Niente build, niente `node_modules`: sono file statici che il browser esegue così come sono.

```bash
npm test
```

---

## 8. Domande rapide

**Quanto costa?** Zero. GitHub Pages è gratuito per i repo pubblici e il piano Spark di
Firebase non scade e non chiede metodi di pagamento. Una partita muove qualche decina di KB.

**Serve internet?** Per la sincronia sì. L'app si apre comunque offline (è una PWA) e
in mancanza di rete Firebase riallinea tutto appena torna il segnale.

**Più tavoli in contemporanea?** Sì: Setup → *Cambia stanza* e scegli un codice diverso
(es. `sala-riunioni`). Ogni stanza ha giocatori, partita e storico separati.

**Chiaro o scuro?** L'app segue il tema del telefono. Se preferisci forzarne uno:
Setup → *Aspetto* → Chiaro / Scuro / Come il telefono.

**Come faccio un backup?** Setup → **Esporta**: scarica un JSON con giocatori e storico,
reimportabile con **Importa**.

**Chi può scrivere i punti?** Solo il dispositivo che ha preso il ruolo di segnapunti —
è imposto dalle regole del database, non solo dall'interfaccia. Se preferisci che chiunque
possa correggere qualsiasi cosa, pubblica invece `database.rules.permissive.json`.
