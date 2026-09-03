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
   abilita **Google** (ti chiede solo un'email di supporto). L'accesso è con
   l'account Google: un tocco, niente password da inventare, e l'identità segue
   la persona anche se cambia telefono o rete.
   Poi scheda **Impostazioni** → **Domini autorizzati** → *Aggiungi dominio* →
   inserisci il dominio del sito pubblicato (es. `TUO-UTENTE.github.io`),
   altrimenti il popup di Google verrà rifiutato.
4. Torna in **Realtime Database** → scheda **Regole**, incolla il contenuto del file
   [`database.rules.json`](database.rules.json) e premi **Pubblica** — ma prima
   sostituisci `OWNER_UID` con l'**ID del tuo dispositivo** (lo trovi nell'app,
   in Setup → Stanza, con un tocco lo copi). Puoi indicarne più di uno, ad esempio
   PC e telefono:

   ```
   auth.uid === 'ID_DEL_PC' || auth.uid === 'ID_DEL_TELEFONO'
   ```

   Con queste regole: **solo i dispositivi approvati** vedono la stanza e scrivono
   i punti; chi apre il tuo link manda una richiesta di accesso e **solo tu**
   (il proprietario) puoi approvarla; il tabellone live resta scrivibile dal solo
   segnapunti in carica, più i **propri punti** della mano in corso per chi è legato a
   un giocatore; le partite già chiuse nello storico le può **correggere o
   eliminare solo il proprietario**, e ognuno può cambiare **solo il proprio avatar**.

   > Hai già pubblicato le regole in passato? Ogni volta che il file cambia va
   > reincollato e ripubblicato dalla console, altrimenti il database continua a
   > seguire quelle vecchie.

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

1. Apri l'app: ti accoglie la schermata **Crea la stanza**. La stanza si crea
   **una volta sola**: il codice è segreto, generato a caso, e resta salvato sul
   tuo dispositivo — da lì in poi l'app si apre sempre lì. Non va ricreata a ogni
   partita.
2. Tab **Setup** → aggiungi i nomi dei giocatori.
3. Torna su **Partita**: in cima trovi il riquadro *Chi segna i punti?* → premi
   **Segno io i punti**.
4. Premi **Condividi stanza** (o l'icona 🔗 in alto) e manda il link nella chat
   dell'ufficio. I colleghi non creano niente: aprono il link, chiedono di entrare,
   tu li approvi da **Setup → Membri** ed è fatta, per sempre.

**Ogni collega**, aperto il link: accede con Google → chiede di entrare → tu lo
approvi. Alla prima visita sceglie **chi è** fra i giocatori (o si crea): da quel
momento il suo account resta **collegato per sempre a quel giocatore**, su qualunque
dispositivo — e il collegamento può cambiarlo solo il proprietario, da
**Setup → Membri** (matita accanto al nome).

> **Ognuno può segnare i propri punti.** Chi non è segnapunti vede nel suo riquadro il
> pulsante **Segna i miei punti** (e la casella del round sulla sua riga del tabellone):
> apre lo stesso pannello carte, ma solo per sé e solo per la mano in corso. Così a fine
> mano ognuno segna il suo dal telefono e il segnapunti chiude il round senza dover fare
> il giro del tavolo. Le regole del database accettano la scrittura soltanto dal giocatore
> legato a quell'account, a partita in corso.
>
> **Il ruolo di segnapunti è di un dispositivo alla volta**, ed è chi lo prende a decidere:
> non si assegna a distanza. Chi non ce l'ha vede in cima la striscia
> *"Segna i punti Anna Ricci"* con il pulsante **Passa a me**: basta premerlo per subentrare
> (serve una conferma). Se nessuno l'ha preso, tutti vedono il riquadro grande con
> **Segno io i punti**.

**Durante la partita** (solo il segnapunti)

1. Tab **Partita** → tocca chi gioca **nell'ordine in cui siete seduti** (ogni avatar
   prende il numero del posto) → **Inizia partita**. Chi apre la prima mano è sorteggiato,
   poi il giro segue quella sequenza; la striscia *Apre la mano* mostra l'ordine.
2. A fine mano premi il pulsante **Segna i punti**: si apre il pannello sul primo
   giocatore, con le **carte** davanti. Tocchi le carte numero che ha in mano, i
   modificatori `+2…+10` e `×2`, e il totale si calcola da solo; poi **Salva e avanti ›**
   passa al giocatore dopo. Con le frecce ‹ › ti sposti a mano.
   - il bonus **Flip 7** (+15) viene aggiunto da solo alla settima carta numero diversa
   - **Sballato** mette 0 al round
   - **Congelato** segna che quel giocatore è stato fermato da un *Congela*: i punti
     restano quelli delle carte, ma si capisce perché la mano è corta (e conta per il
     record *Surgelato*)
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

**Correggere una partita già chiusa** (solo il proprietario): tab **Storico** → tocca
la partita → **Modifica**. Si apre una pagina dove cambi data, obiettivo, chi ha
giocato e il vincitore; se la partita era stata segnata round per round trovi la
tabella delle **mani**: tocchi una casella e la rifai con le carte, come durante la
partita (una mano azzerata sparisce, un round vuoto per tutti viene tolto; puoi anche
aggiungere un round in coda o togliere l'ultimo). Totali, Flip 7, sballi e Crown si
ricalcolano da soli al salvataggio. Da lì si elimina anche la partita. Gli altri
membri vedono lo storico ma non possono toccarlo: lo impongono le regole del
database, non solo l'interfaccia.

**La corsa al traguardo**: sotto ogni giocatore c'è una rotaia che avanza verso
l'obiettivo, e sotto il totale i punti che gli mancano (`−69`). Chi è in testa ha la
rotaia dorata, chi arriva a 200 si becca un *arrivato*. Chi guarda dal telefono vede
la stessa cosa in grande nel proprio riquadro: **ti mancano 69 punti**.

**Invitare qualcuno a partita in corso**: il pulsante **Invita** in cima al tabellone
(o l'icona 🔗 nella barra in alto) apre la condivisione del link della stanza.

**Partite vecchie**: tab **Storico** → **Aggiungi partita passata** → data, giocatori e
punteggi finali. Il vincitore è automatico (punteggio più alto) o lo scegli tu.

---

## 5. Tavolo online

La scheda **Tavolo** è separata apposta dal segnapunti: lì non si contano punti di una
partita fisica, **si gioca a Flip 7 per davvero**, ognuno dal proprio telefono, con le
regole ufficiali del gioco:

- mazzo da 94 carte (un 0, un 1, due 2… dodici 12, i sei modificatori, tre copie di
  ogni carta azione), che continua fra i round e si rimescola dagli scarti quando finisce;
- al tuo turno **peschi o ti fermi**; il numero doppio ti fa sballare;
- **Seconda Chance** annulla un doppione (la seconda va regalata a chi non ce l'ha);
- **Congela** fa incassare e uscire dal round il bersaglio (anche te stesso, e se sono
  tutti fuori il bersaglio sei tu per forza);
- **Pesca Tre** obbliga il bersaglio a pescare tre carte; le azioni pescate nel mentre
  si mettono da parte e si risolvono dopo (perse se sballa);
- **FLIP 7**: sette numeri diversi → +15 e il round si chiude all'istante per tutti
  (chi era ancora in gioco incassa comunque le proprie carte);
- punteggio: somma dei numeri, ×2 se hai il ×2, poi i +, come da regolamento.

Si apre un tavolo, ci si siede (ognuno è il **suo** giocatore, grazie al collegamento
account→giocatore), e a fine partita **la vittoria vale una Crown** nello storico, come
le partite dal vivo. Possono giocare solo i membri approvati.

## 6. Classifica e Crown

Una **vittoria = una Crown**, punto. Nessuna formula strana: in classifica le Crown
sono la colonna con la coroncina, e in cima c'è chi ne ha di più.

L'ordine è **Crown, poi media punti**: a parità di vittorie passa avanti chi ha la media
più alta, e se anche quella è uguale chi ha giocato più partite. Vale anche quando
riordini per un'altra colonna: le Crown restano il primo spareggio.

Accanto alle Crown c'è l'**anello delle vittorie**: la fetta dorata è la quota di
partite vinte e il numero al centro la stessa cosa in percentuale, così si vede al volo
chi vince spesso anche se ha giocato poche partite. La tabella mostra anche media punti,
record personale e partite giocate: tocca un'intestazione per riordinare (l'anello
compreso), e usa il menù in alto a destra per filtrare il periodo
(sempre / anno / mese / ultimi 30 giorni).

Toccando un giocatore si apre la sua **scheda a schermo intero**, con riquadri diversi
uno dall'altro invece di una griglia tutta uguale:

- **Crown vinte** in evidenza (fino a 5 disegna le coroncine, da 6 in su passa a
  “corona × N”: regge anche 200 vittorie);
- **la serie più lunga** di vittorie di fila, e sotto la frase del momento
  (*in serie: 4 di fila* / *non vince da 6 partite*);
- **il suo record** con la data, **media a partita**, **percentuale di vittorie**;
- **Flip 7 riusciti** e **sballi**, contati sulle partite segnate round per round, le
  **volte congelato** (solo dalle partite dall'avvio del conteggio in poi) e la
  **lunghezza media delle mani** dove le carte sono state messe una per una;
- il grafico **Andamento su tutte le partite** — non solo le ultime dieci: le barre si
  stringono al crescere dello storico, si scorre lateralmente e si apre già sull'ultima
  partita giocata. In oro le vittorie, la tratteggiata è l'obiettivo.

Sotto il podio ci sono i **Record**, titoli scherzosi assegnati a chi primeggia in una
statistica (a pari merito si condividono; toccandone uno si apre la classifica completa):

- **Gambler**: più Flip 7 piazzati
- **Golosone**: più sballi a partita · **Tanaia**: meno sballi a partita (braccine corte)
- **Cannoniere**: il punteggio più alto in una singola partita
- **Surgelato**: più volte congelato a partita, il bersaglio preferito dei *Congela*.
  Conta solo dalle partite giocate dopo l'avvio del conteggio: quelle di prima o non
  hanno il dato, o ce l'hanno a zero soltanto perché nessuno usava ancora il tasto
  **Congelato**, e abbasserebbero la media di chi viene congelato davvero. La data di
  partenza è `FREEZE_STATS_SINCE` in [js/stats.js](js/stats.js), una riga sola da
  spostare se il conteggio deve cominciare da un altro giorno
- **Architetto**: le mani mediamente più lunghe (carte numero per mano, senza contare
  le mani sballate né quelle inserite col tastierino)
- **Colpo Grosso**: la mano più ricca, cioè il massimo di punti incassati in un solo round
- **Fenice**: la rimonta più grande. Nelle partite segnate mano per mano, per chi ha vinto
  si guarda dopo ogni round di quanto era sotto al primo in classifica: vale il distacco
  più grande che ha poi ribaltato. Chi non è mai stato sotto non concorre

I giocatori sono identificati da un id interno, quindi:
- se **rinomini** qualcuno, tutto il suo storico lo segue;
- i giocatori **non si eliminano**: chi smette di giocare si **archivia** (Setup),
  così sparisce dalle liste dei nuovi tavoli ma la classifica resta coerente.

**Avatar**: di base ognuno è un cerchio con le iniziali sul colore del nome. Da
**Setup → Il tuo avatar → Cambia** si apre il configuratore: scegli un **personaggio**
fra i ventuno disegnati apposta per l'app (volpe, gufo, robot, dado, la carta col 7…,
nello stesso stile di corona e trofei) e un **colore** di sfondo, oppure **carichi una foto** (viene
ritagliata al centro e ridotta a un francobollo, così pesa pochi KB e sta nel
database insieme al resto). Ognuno cambia solo il proprio; il proprietario può
sistemare quello di tutti (matita sull'avatar in Setup → Giocatori), utile per chi
non ha un account.

---

## 7. Look & feel

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

## 8. File del progetto

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
js/avatar.js             avatar: simboli e colori predefiniti, foto ridotte, disegno
js/theme.js              tema chiaro/scuro
js/game.js               motore del gioco online (regole ufficiali, logica pura)
js/views/                partita · tavolo · classifica · storico · setup
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

## 9. Domande rapide

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

**Chi può vedere e scrivere?** Solo i dispositivi approvati dal proprietario (tu):
è imposto dalle regole del database, non solo dall'interfaccia. Il codice stanza è
segreto e non sta nel repository; il tuo ID di proprietario è scolpito nelle regole,
che si cambiano solo dalla console Firebase con il tuo account Google. Dentro la
stanza, il tabellone live resta scrivibile dal solo segnapunti in carica, le partite
chiuse le corregge o elimina solo il proprietario, e l'avatar lo cambia solo il
diretto interessato (o il proprietario).

**E se cambio telefono, rete o cancello i dati del browser?** Nessun problema:
l'identità è l'**account Google**, non il dispositivo. Stesso account = stesso accesso
e stesso giocatore, ovunque. La rete non c'entra mai nulla.

**E se il proprietario non c'è?** Chi è già stato approvato entra e fa tutto da solo
(segnapunti compreso): il proprietario serve soltanto per approvare le persone **nuove**
e per cambiare i collegamenti account→giocatore.
