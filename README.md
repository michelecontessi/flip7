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
- 🏅 **stagioni mensili**: chi guida il mese (con almeno 10 partite giocate) ne diventa il campione e si prende la carta di quel mese
- 🔔 al tavolo online l'app **avvisa quando tocca a te** (suono, vibrazione, notifica), e chi sparisce
  si **blocca di comune accordo** senza chiudere la partita
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
   Il nodo `users/<uid>/rooms` è l'**elenco delle stanze di ogni account** (lo legge e
   scrive solo l'interessato, più il proprietario quando invita qualcuno in una stanza).

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

1. Apri l'app: ti accoglie la schermata **Crea la stanza**. Si apre la maschera
   **Nuova stanza**: un **nome** (es. *Ufficio*) e i **partecipanti**, un nome alla
   volta. Il codice della stanza è segreto, generato a caso, e resta salvato sul
   tuo dispositivo: la stanza si crea **una volta sola**, non a ogni partita.
2. Atterri in **Setup**, con la stanza e i partecipanti già pronti: premi
   **Condividi il link** e mandalo nella chat dell'ufficio. I colleghi non creano
   niente: aprono il link, chiedono di entrare dicendo chi sono, tu li approvi da
   **Setup → Partecipanti** ed è fatta, per sempre.
3. Su **Partita**: in cima trovi il riquadro *Chi segna i punti?* → premi
   **Segno io i punti**.

**Ogni collega**, aperto il link: accede con Google → sceglie **chi è** fra i
giocatori (o dice il suo nome) → chiede di entrare → tu lo approvi. Da quel momento
il suo account resta **collegato per sempre a quel giocatore**, su qualunque
dispositivo — e il collegamento può cambiarlo solo il proprietario, dal menu **⋯**
accanto al nome in **Setup → Partecipanti**.

**Un gruppo, una stanza.** Se giochi anche con altri (gli amici del giovedì, la
famiglia…) fai una **stanza per ogni gruppo**: ognuna ha giocatori, classifica,
record, storico e tavoli online **tutti suoi**, e niente si mescola. Il nome della
stanza sta sempre in alto a sinistra: toccalo per aprire **Le tue stanze**, passare
da una all'altra o crearne una nuova. Nella maschera **Nuova stanza**, sotto ai
nomi, trovi anche **Già nell'app**: le persone che sono già in una tua stanza. Chi
spunti **entra senza chiedere**, col suo giocatore già collegato, e la stanza gli
compare nell'elenco da sola (lo stesso si fa dopo, da *Setup → Partecipanti →
Da un'altra stanza*). Tutti gli altri passano dal link e dalla tua approvazione:
**decidi tu chi entra, e dove**. Dall'elenco vedi anche quante **richieste in
attesa** ci sono nelle altre stanze, senza doverci entrare.

**Il Setup è del proprietario.** Chi non gestisce la stanza ci trova soltanto il
proprio **profilo** (l'avatar), il tema e l'account: giocatori, richieste, codice e
backup li vede e li tocca solo chi ha creato la stanza. Le cose più tecniche
(segnapunti, obiettivo punti, codice stanza, ID del dispositivo, backup) stanno
sotto **Avanzate**, chiuse finché non servono.

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
     record *Surgelato*). Sotto compare la fila **congelato da**: un tocco sull'avatar di
     chi ha tirato la carta (facoltativo) e quella congelata va a credito suo, per il
     record *Iceman* e per la *nemesi* nella scheda giocatore
   - **Vita extra** conta le carte col **cuore** (la *Seconda Chance*) finite in mano
     in quel round: **non danno punti**, si segnano solo per la statistica (il record
     *Sette Vite*). Ogni tocco ne aggiunge una — *1 vita extra*, *2 vite extra* — e
     dopo la terza si torna a zero
   - sotto il punteggio della mano c'è il **totale provvisorio**: *totale partita 123 → 157*,
     cioè dove arriverebbe il giocatore salvando questa mano, e quanti punti gli mancano
     al traguardo (o *traguardo tagliato*); si aggiorna a ogni carta toccata
   - se preferisci fare i conti a mente, la linguetta **Tastierino** ti fa digitare
     direttamente il totale (lì il Flip 7 si aggiunge col tasto dedicato)
3. Quando tutti hanno il punteggio, il pulsante diventa **Chiudi round** e si passa al successivo.
   Il round in corso è sempre scritto nella pastiglia scura in cima al tabellone
   (*Round 4*), con accanto quanti punteggi mancano.
4. Al superamento dei 200 punti la partita si chiude da sola: premi
   **Salva e inizia nuova partita** per rigiocare subito con gli stessi,
   oppure **Salva e basta**. Il vincitore incassa la sua Crown. **Condividi il podio**
   prepara un'immagine (marchio, data, i primi tre sui gradini, tutti gli altri sotto)
   e apre il foglio di condivisione del telefono: pronta per la chat dell'ufficio.

**Pareggio al traguardo? Si spareggia.** Se al traguardo si arriva **in parità**
la partita non finisce: si gioca una **manche di spareggio** fra i soli pari
merito, e **gli altri restano fuori**. Il tabellone lo dice a chiare lettere
(*Spareggio · pareggio a 210: la manche la giocano Anna e Luca, gli altri stanno
fuori*), la pastiglia **spareggio** compare accanto al numero del round, chi è
fuori ha la riga spenta con la sua casella segnata *fuori* — e a nessuno viene
messo uno zero d'ufficio. Si segna solo per chi gioca (*Segna i punti · 0/2*), e
se la manche finisce ancora pari se ne gioca un'altra, finché uno resta davanti.
Nella tabella dei round le manche di spareggio hanno la loro colonna marcata
**sp**, così anche nello Storico si capisce perché lì mancano dei punteggi.

Il pannello dei punti si **chiude appena salvi**: capita spesso di segnare al volo la
mano di uno solo, e ritrovarsi dentro il giocatore dopo faceva perdere il filo. Per
passare da un giocatore all'altro senza uscire ci sono le frecce in cima al pannello.

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

**Lo Storico** raggruppa le partite per mese (con la carta del **campione del
mese**, quando il mese è chiuso) e di ognuna racconta com'è andata senza doverla aprire:
giorno e **ora**, quanto è **durata**, quanti erano e quante mani sono servite, di
**quanto ha vinto sul secondo**, e sotto la **classifica della partita** riga per riga —
posto con la medaglia per i primi tre, avatar, nome, la barra dei punti in proporzione
al primo e il totale, in oro chi ha vinto. Toccando la partita si apre il dettaglio: la
stessa classifica con le note di ognuno (Flip 7, sballi, congelate, cuori, chi si è
fermato da sé), il **grafico del corso della partita** (una linea per giocatore, il
totale dopo ogni round, con quante volte è cambiata la testa), la tabella dei round —
le mani con il **×2** hanno la loro targhetta arancione — e tre pulsanti: **Rivedi**
apre il replay, **Podio** condivide l'immagine, **Modifica** (solo proprietario) corregge.

**Il replay** rivede la partita **mano per mano**: si scorre di round in round con le
frecce o i puntini, e per ognuno si vedono le carte di ciascuno (numeri, modificatori,
cuori, il doppione dello sballo cerchiato di rosso), i punti della mano, il totale che
cresce e la rotaia verso il traguardo; chi era in testa ha la corona, e le note dicono
chi ha congelato chi, chi ha tirato il Pesca Tre e chi si è fermato di sua volontà. Vale
per le partite online e per quelle segnate carta per carta dal segnapunti.

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
- **Pesca Tre** obbliga il bersaglio a pescare tre carte, e **Congela o Pesca Tre
  pescati nel mentre non scattano subito**: si mettono da parte e si assegnano solo a
  tripla completata (si perdono se il bersaglio sballa o fa Flip 7). Quindi il *Congela*
  che esce alla prima o alla seconda carta **non ti ferma lì**: peschi comunque tutte e
  tre, e se sei rimasto l'unico in gioco te lo assegni alla fine, incassando anche le
  carte appena prese. La **Seconda Chance**, invece, vale all'istante e può salvarti
  proprio dentro quella tripla;
- **FLIP 7**: sette numeri diversi → +15 e il round si chiude all'istante per tutti
  (chi era ancora in gioco incassa comunque le proprie carte);
- punteggio: somma dei numeri, ×2 se hai il ×2, poi i +, come da regolamento;
- **pareggio al traguardo → spareggio**: la partita non finisce, si gioca una manche
  extra fra i soli pari merito e si ripete finché resta un vincitore solo.

Si apre un tavolo, ci si siede (ognuno è il **suo** giocatore, grazie al collegamento
account→giocatore), e a fine partita **la vittoria vale una Crown** nello storico, come
le partite dal vivo. Possono giocare solo i membri approvati.

**Più tavoli insieme, e ognuno è padrone del suo.** Il tavolo lo **chiude solo chi
l'ha aperto**: chi non gioca a quello che c'è non deve aspettare né chiedere il
permesso, apre il **suo** tavolo e via — dalla schermata *Tavoli aperti* si vede chi
c'è a ciascuno, a che punto è la partita e si entra con un tocco (a un tavolo per
volta: per cambiare, prima ci si alza). Un tavolo fermo da tre ore lo può chiudere
chiunque, così non resta lì per sempre.

**Abbandonare vuol dire chiudere la partita**, non sfilarsi: chi abbandona la termina
per tutti con i **punteggi di quel momento** (la mano in corso, non finita, non conta).
Da lì si va al podio e si salva nello storico come qualsiasi altra partita: la Crown
va a chi era davanti.

**Chi sparisce, invece, si blocca — e la partita continua.** Ogni telefono seduto al
tavolo lascia un battito di presenza ogni pochi secondi: il pallino verde accanto al
nome dice chi è **collegato** adesso. Se chi deve giocare **non muove per un minuto**
(telefono in tasca, app chiusa, rete andata), la striscia lo segna *fermo da 1:12* e
sotto compare il riquadro del blocco: **solo i giocatori collegati** in quel momento
possono decidere, **di comune accordo**, di bloccarlo. Ognuno tocca *Sono d'accordo*,
si vede chi ha già votato (*2 di 3 d'accordo*), e all'ultimo voto il blocco scatta: il
giocatore **incassa quello che ha in mano** e resta al suo punteggio, da lì in poi non
riceve carte né punti, e il turno passa avanti. Il suo totale resta in classifica come
quello di tutti (se era davanti al traguardo, vince lui; a pari merito però lo spareggio
lo perde). Se poi torna, trova il riquadro *Sei stato bloccato* con **Rientro dal
prossimo round**: dal round dopo è di nuovo in gioco. Una mossa di chi era fermo
cancella i voti contro di lui. Nello storico la partita segna da quale round è stato
bloccato, e quelle mani non contano nelle sue medie.

**Un tocco, una mossa.** I comandi del tavolo (*Pesca*, *Mi fermo*, la scelta del
bersaglio) portano scritto per quale momento della partita sono stati disegnati: la
mossa cambia lo stato subito, ma il tavolo si ridisegna al fotogramma dopo, e chi
schiaccia due o tre volte di fila in fretta userebbe il bottone vecchio sul tavolo
nuovo — giocando per chi viene dopo (il bot di turno, per dire, che si ritrovava a
pescare una carta che non aveva chiesto). I tocchi in più adesso non fanno niente:
esce una carta sola, quella che hai chiesto.

**Quando tocca a te, l'app te lo dice.** Suono breve e vibrazione appena arriva il tuo
turno (o devi scegliere il bersaglio di una carta azione), e — se l'app non è in vista —
una **notifica di sistema** che riporta al tavolo con un tocco; lo stesso a fine round e
a fine partita. Si attiva da **Setup → Avvisi del tavolo**: suono, vibrazione e
notifica si accendono e spengono una per una, e ognuno **si prova appena lo accendi**
(il suono suona, il telefono vibra, un messaggio conferma che è attivo). Gli interruttori
che questo dispositivo non può onorare restano spenti e lo dicono: gli iPhone non vibrano
dal browser, e la notifica chiede il permesso (sempre su iPhone serve l'app aggiunta alla
Home e iOS 16.4 o più recente). Niente server: è tutto sul telefono, dal service worker.

**I bot hanno tre livelli.** In lobby, un tocco sul bot apre il menu: *facile* si ferma
presto, *normale* rischia finché il bottino è magro, **conta-carte** calcola la
probabilità di sballare dalle carte già uscite (scarti, mani in vista, carta
parcheggiata) e pesca finché in media conviene — senza sbirciare il mazzo. In due, con
un conta-carte, la partita regge.

**Modalità allenamento** (dal menu **⋯** del tavolo): al tuo turno, sotto *Pesca* e
*Mi fermo*, vedi il **rischio di sballo** alla prossima carta e quanto vale in media
pescare, con lo stesso conto del bot. La voce compare solo ai tavoli con almeno un bot
seduto — lì però c'è sempre, in lobby, a partita in corso e a partita finita: si accende
e si spegne dallo stesso menu, e la spunta ✓ dice com'è messa adesso. Fra sole persone
non compare e il rischio non si mostra mai; anche acceso, il rischio si vede solo a
partita in corso. Utile per imparare; per il brivido meglio spenta.

**Reazioni.** Sotto le righe del tavolo ci sono dieci sticker disegnati, due file da
cinque (risata, wow, pianto, occhiali da sole, fuoco, pollice, *Che culo!*, *Parolacce*,
*Ciaone*, *Muoviti*): un tocco e lo sticker sbuca per qualche secondo sulla tua riga,
visibile a tutti. *Che culo!* è il fondoschiena dello Sculone, con quadrifoglio e
scintille; *Parolacce* è la faccia paonazza che sbraita `#@%!` nella nuvoletta — i
simboli al posto delle parole, che qui non si scrive niente; *Ciaone* è la linguaccia
con l'occhiolino e *Muoviti* la faccia che si addormenta aspettando il tuo turno.
Niente chat, solo la faccia giusta al momento giusto.

**Il tavolo si racconta anche a chi non lo vede**: la striscia in cima ha una regione
`aria-live`, quindi con VoiceOver o TalkBack ogni cambio di turno e ogni verdetto
(*Anna ha sballato*, *Tocca a te*) viene letto ad alta voce.

**Vale come una partita segnata a mano.** Alla fine di ogni mano il tavolo ne conserva la
fotografia — numeri, `+`, `×2`, sballo, congelata e **vite extra ricevute** — e a partita
finita la archivia round per round, con le stesse righe del segnapunti. Quindi una partita
online conta nelle statistiche esattamente come una dal vivo: **Flip 7**, **sballi**,
**congelate**, **cuori**, mani lunghe, `×2` pescati, punteggio della singola mano e
rimonte finiscono in classifica e nei **Record**, e nello Storico la partita ha la sua **tabella dei round**. Chi lascia il
tavolo a metà non entra nello storico, e delle partite iniziate prima di questo
aggiornamento restano i soli totali (meglio nessun dettaglio che uno a metà).

**Il tavolo sta in una schermata**, anche sul telefono, senza andare su e giù: in cima la
striscia che dice sempre chi deve fare cosa (*Tocca a te: pesca o fermati*, *Bot Ada
pesca ancora 2 carte*, *Round 3 chiuso*) col numero del round accanto, sotto i due
bottoni **Pesca** / **Mi fermo**, a fianco il mazzo con la carta che si gira; poi una
riga per giocatore con nome, stato, totale, la rotaia verso il traguardo nel suo colore
e **tutte le carte in fila** (azioni e modificatori prima, numeri dopo). Le carte si
dimensionano sull'altezza dello schermo e sul numero di giocatori, e se una mano si fa
lunga si stringono un po' invece di andare a capo. Il menu **⋯** nella striscia raccoglie
*Abbandono la partita* (che la chiude per tutti), *Annulla il tavolo* (solo per chi
l'ha aperto) e *Tavoli aperti*, per passare a un altro o aprirne uno nuovo.
Su desktop le stesse parti stanno su due colonne, con la corsa al traguardo a sinistra.

**Niente spoiler mentre la carta vola**: finché la pescata non si è girata, la mano non
lascia trapelare nulla. Il posto riservato alla carta in arrivo è sempre l'ultimo della
fila (qualunque cosa sia: numero, modificatore o azione), i punti del round e la rotaia
restano fermi al valore di prima, e chip, note e riga spenta aspettano il verdetto. Solo
quando la carta è atterrata scivola al suo posto in ordine, e i punti si aggiornano.

**Il giro si legge dall'alto in basso, e le righe stanno ferme**: in cima **chi apre la
mano**, sotto chi viene dopo nel giro (numero sull'avatar: 1 è chi apre, 2 chi viene
dopo…), e lì restano **per tutto il round**. Le facce non si rincorrono su e giù a ogni
turno: si impara a colpo d'occhio dove sta ognuno, e chi tocca adesso si riconosce
dalla riga accesa e dalla striscia in cima. La lista si riordina **una volta sola**, a
round chiuso, sul prossimo che aprirà — e la striscia lo dice. Il **tuo** posto non viene
spostato in cima: si riconosce dal filo dorato e dall'etichetta **tu**.

Accanto ai punti di ogni riga c'è il **totale provvisorio**: *210 +30 **= 240***, cioè
dove si arriva fermandosi adesso. Lo stesso numero sta sul pulsante **Mi fermo** e nella
corsa al traguardo, dove la barra piena sono i punti incassati e la coda chiara il
bottino del round in corso.

**Lo spareggio, al tavolo**: se il traguardo viene tagliato in parità la striscia annuncia
*Pareggio a 210 · spareggio fra Anna e Luca: gli altri restano fuori*, il pulsante diventa
**Via allo spareggio** e la manche extra la giocano solo loro. Chi è fuori resta seduto,
scende in fondo alla lista con l'etichetta *fuori*, non riceve carte e non prende punti;
se anche lo spareggio finisce pari se ne gioca un altro. Nello storico quella manche resta
segnata come tale, con la colonna **sp** nella tabella dei round.

**La fine della partita si vede**: quando qualcuno supera l'obiettivo l'ultima mano resta
sul tavolo, sballi e carte comprese, con la striscia che annuncia il vincitore. Il podio
con la corona si apre con **Vai al podio**, e da lì si può tornare a **rivedere l'ultima
mano**. Sballo, Seconda Chance bruciata e FLIP 7 hanno anche il loro avviso grande a
centro schermo nell'istante in cui la carta si gira.

A ogni mossa il tavolo **non viene ricostruito** ma solo aggiornato dove cambia
([js/morph.js](js/morph.js)): righe, carte e rotaie restano gli stessi elementi, quindi
le transizioni partono davvero e la carta in volo non salta. Mentre la pescata vola, il
suo posto in fila è già riservato da un segnaposto tratteggiato della stessa taglia:
la carta atterra lì sopra e la riga non si allarga di scatto.

## 6. Classifica e Crown

Una **vittoria = una Crown**, punto. Nessuna formula strana: in classifica le Crown
sono la colonna con la coroncina, e in cima c'è chi ne ha di più.

L'ordine è **Crown → percentuale di vittorie → media punti**: a parità di Crown passa
avanti chi le ha fatte in meno partite, e se anche quella è uguale chi ha la media più
alta (poi le partite giocate). Vale anche quando riordini per un'altra colonna: le Crown
restano il primo spareggio.

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

**Le stagioni.** Un mese di calendario è una stagione: alla fine del mese, chi guida la
classifica di quel mese (stessa formula: Crown, quota di vittorie, media) ne diventa il
**campione** e si prende **la carta di quel mese**. Non una medaglia e non una coccarda:
la carta del mazzo di Flip 7 che porta il numero del mese — maggio è la **5**, dicembre è
la **12** — col colore che quel numero ha nel gioco, la cornice d'oro da campione e l'anno
nel cartiglio in basso. La faccia è crema negli anni pari e notte in quelli dispari, così
due edizioni dello stesso mese non si confondono. La carta resta per sempre accanto al
nome in classifica e nella **Bacheca** della scheda, dove ogni riquadro prende la tinta
del suo mese.

Per prendersi il titolo bisogna **aver giocato almeno 10 partite in quel mese**: il
campione è chi ha fatto la stagione, non chi passa di lì una sera fortunata e vince
l'unica partita a cui si è seduto. Chi non ci arriva resta in classifica ma fuori dalla
corsa, e un mese che si chiude senza nessuno a quota 10 resta **senza campione** (l'albo
d'oro lo dice: *titolo non assegnato*). Valgono le partite dal vivo e quelle online
insieme; a parità assoluta il titolo si condivide.

La **Classifica si apre sulla stagione in corso**, perché il mese conta più del
totale di sempre: in cima il mese con i giorni che mancano e la barra del tempo, il
podio del mese con chi è in testa (e la carta ancora spenta), chi è in corsa per il titolo, il **campione in
carica** dell'ultimo mese chiuso, poi la classifica del mese, i record del mese e
l'**albo d'oro**. Lo switch in alto (**Stagione / Generale**, c'è anche un pulsante in
fondo) porta al generale: le Crown di sempre con i filtri di periodo e provenienza, i
record, i primati della stanza, il rating Elo e l'andamento (**Posizione**, **Media
punti** e **Rating Elo**: tre letture dello stesso storico, una per pulsante). Toccando un mese dell'albo
si apre la sua pagina: campione, classifica del mese, record del mese, le partite, e il
pulsante per condividere l'immagine. Non c'è niente da chiudere a mano: si calcola
dallo storico.

Sotto il podio ci sono i **Record**, titoli scherzosi assegnati a chi primeggia in una
statistica (a pari merito si condividono; toccandone uno si apre la classifica completa).
Quelli nati da una partita sola, cioè Cannoniere, Colpo Grosso e Sculone, hanno il
pulsante **Vedi ›** che apre il dettaglio di quella partita con la mano incriminata
cerchiata in oro; lo stesso vale per i riquadri corrispondenti nella scheda giocatore:

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
- **Sculone**: la rimonta più grande, con ferro di cavallo e quadrifoglio come emblema.
  Nelle partite segnate mano per mano, per chi ha vinto si guarda dopo ogni round di
  quanto era sotto al primo in classifica: vale il distacco più grande che ha poi
  ribaltato. Chi non è mai stato sotto non concorre
- **Doppiogiochista**: chi si è visto arrivare più volte la carta **×2**. Conta solo le
  mani segnate carta per carta (col tastierino non si sa se il ×2 è arrivato), sballi
  compresi: la carta l'aveva in mano comunque
- **Iceman**, **Bullo** e **Generoso**: chi tira più Congela, chi rifila più Pesca Tre,
  chi regala più Seconde Chance. Sono i record "attivi": contano dalle partite online
  giocate da quando il tavolo segna chi ha fatto cosa (`INTERACTIONS_SINCE` in
  [js/stats.js](js/stats.js)) e da quelle dal vivo in cui il segnapunti ha indicato
  *congelato da*

Poi i **Primati della stanza**: non "chi è il migliore in X" ma "la partita più…" — la
maratona (più mani), la partita lampo, il punteggio di sempre, la passeggiata (vittoria
più larga) e il fotofinish (la più tirata), la mano d'oro. Ognuno si tocca e riapre
quella partita.

Il **Rating Elo** è un'altra lettura della classifica, che pesa *chi* ti lasci dietro e
non quante volte vinci. Tutti partono da **1000**. Prima di ogni partita, per ogni coppia
di giocatori, dalla differenza dei rating si stima quanto è probabile che uno finisca
davanti all'altro (alla pari 50%, con 200 punti in più 76%, con 400 in più 91%); poi si
guarda com'è andata (davanti = 1, pari = 0,5, dietro = 0) e ci si sposta di
**32 × (risultato − atteso)**, diviso per il numero di avversari. In pratica: alla pari
una vittoria vale +16 e una sconfitta −16; contro uno più forte di 200 punti vincere vale
+24 e perdere solo −8; contro uno più debole vincere vale +8 e perdere −24. Con più
giocatori al tavolo la partita è un giro di sfide a due contro ognuno degli altri, i
punti in gioco si dividono per il numero di avversari (una partita a 5 pesa quanto una
a 2) e la somma degli spostamenti fa sempre zero. Le partite si contano in ordine di
data, tutte, senza stagioni. Il grafico **Andamento → Rating Elo** lo racconta nel tempo:
una linea per giocatore, il rating dopo ogni partita, e si tocca una colonna per leggere
i valori di quel giorno. La lista mostra rating, picco e lo spostamento dell'ultima
partita (*+12 ultima*), e il pulsante **Come si calcola** apre questa spiegazione con
gli esempi; la scheda giocatore ha lo stesso riquadro, e il suo rating si tocca per
riaprire l'ultima partita che l'ha mosso. La formula è `eloRatings` in
[js/stats.js](js/stats.js).

Nella scheda giocatore c'è anche il **Testa a testa**, disegnato come una serie di
duelli: a sinistra il giocatore della scheda, a destra ogni avversario, in mezzo quante
volte è finito **davanti** e quante **dietro** (con le due parole scritte sotto i
numeri, così non c'è niente da indovinare), un verdetto (*in vantaggio*, *sempre
davanti*, *in parità*…), la barra verde/grigia/rossa e sotto le partite insieme, i pari,
le vittorie di ciascuno e le medie. "Davanti" vuol dire più punti dell'altro in quella
partita, anche senza vincerla. E dalle partite che lo sanno: la
sua **nemesi** (chi lo congela di più), la sua vittima preferita, chi gli tira più Pesca
Tre, quanti cuori ha regalato, quante volte si è fermato da sé.
- **Sette Vite**: chi raccoglie più carte col **cuore** (la *Seconda Chance*). Le vite
  extra non danno punti: si contano e basta, sia quelle pescate sia quelle **regalate**
  da un altro giocatore, e valgono anche se poi vengono spese per annullare un doppione.
  Contano solo le partite in cui i cuori sono stati segnati davvero: nelle partite
  archiviate prima di questo aggiornamento il dato non esiste proprio, e non fa media

I giocatori sono identificati da un id interno, quindi:
- se **rinomini** qualcuno, tutto il suo storico lo segue;
- i giocatori **non si eliminano**: chi smette di giocare si **archivia** (Setup),
  così sparisce dalle liste dei nuovi tavoli ma la classifica resta coerente.

**Avatar**: di base ognuno è un cerchio con le iniziali sul colore del nome. Da
**Setup → Il tuo avatar → Cambia** si apre il configuratore: scegli un **personaggio**
fra i ventuno disegnati apposta per l'app (volpe, gufo, robot, dado, la carta col 7…,
nello stesso stile di corona e trofei) e un **colore** di sfondo, oppure **carichi una foto**.
La foto la **ritagli tu**: si apre un riquadro dove la trascini e la ingrandisci finché
la faccia sta nel cerchio, e finché il pannello resta aperto puoi tornarci sopra con
**Ricentra** quante volte vuoi. Quello che salvi è un francobollo, così pesa pochi KB e
sta nel database insieme al resto. Ognuno cambia solo il proprio; il proprietario può
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
js/game.js               motore del gioco online (regole ufficiali, blocco, chi ha fatto cosa)
js/morph.js              ridisegno incrementale del tavolo (aggiorna solo cio' che cambia)
js/notify.js             avvisi: suono, vibrazione, notifica locale dal service worker
js/share.js              l'immagine del podio (canvas) da condividere
js/views/                partita · tavolo · classifica · storico · setup · stanze
database.rules.json      regole di sicurezza del database
sw.js, manifest.webmanifest, icon.svg, icon-192/512.png    supporto PWA
.github/workflows/test.yml   i test girano da soli a ogni push (GitHub Actions)
server.mjs               server di sviluppo locale (npm start)
test/                    test della logica di punteggio (npm test)
```

Niente build, niente `node_modules`: sono file statici che il browser esegue così come sono.

```bash
npm test
```

**Versione e aggiornamenti.** Il numero di versione sta in `APP_VERSION`
([js/config.js](js/config.js)) e si vede in fondo al Setup; a ogni pubblicazione va alzato
insieme a `CACHE` in [sw.js](sw.js) (un test controlla che coincidano). Quando il service
worker nuovo prende il controllo, in basso compare *C'è una versione nuova dell'app* con
il pulsante **Ricarica**; *Controlla aggiornamenti* nel Setup forza il controllo.

---

## 9. Domande rapide

**Quanto costa?** Zero. GitHub Pages è gratuito per i repo pubblici e il piano Spark di
Firebase non scade e non chiede metodi di pagamento. Una partita muove qualche decina di KB.

**Come funzionano gli avvisi senza un server?** Suono e vibrazione partono dal telefono;
la notifica la mostra il service worker dell'app quando la pagina non è in vista, con il
permesso che dai al browser. Non ci sono push da un server: se l'app non è aperta da
nessuna parte (nemmeno in background) la notifica non arriva. È il compromesso per
restare a costo zero.

**Cosa succede a chi resta senza rete a metà partita online?** Gli altri lo vedono
*fermo da…* e dopo un minuto possono bloccarlo di comune accordo: lui resta al suo
punteggio, loro vanno avanti. Quando torna, rientra dal round dopo.

**Serve internet?** Per la sincronia sì. L'app si apre comunque offline (è una PWA) e
in mancanza di rete Firebase riallinea tutto appena torna il segnale.

**Gioco con più gruppi: si mescolano?** No. Ogni **stanza** è un mondo chiuso: giocatori,
classifica, record, storico, partita in corso e tavoli online sono suoi e basta. Fai una
stanza per l'ufficio e una per gli amici; il nome in alto a sinistra apre **Le tue
stanze** per passare dall'una all'altra. Chi entra in una stanza non vede le altre, a
meno che non lo faccia entrare tu anche lì.

**Un collega è anche un amico: deve rifare tutto?** No. Quando crei la stanza (o dopo,
da *Setup → Partecipanti → Da un'altra stanza*) lo spunti fra quelli **Già nell'app**:
entra senza chiedere, col suo giocatore già collegato, e la stanza gli compare
nell'elenco. Il suo avatar lo porta con sé, la classifica no: ogni stanza parte da zero.

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
diretto interessato (o il proprietario). Solo il proprietario può **creare stanze**
e **approvare** chi entra: gli altri, nel Setup, vedono soltanto il proprio profilo.

**E se cambio telefono, rete o cancello i dati del browser?** Nessun problema:
l'identità è l'**account Google**, non il dispositivo. Stesso account = stesso accesso
e stesso giocatore, ovunque. La rete non c'entra mai nulla.

**Dice "solo locale" e non compare più l'accesso.** Vuol dire che l'app non è riuscita a
scaricare Firebase: rete assente al momento giusto, un blocco contenuti, o il file
arrivato a metà. I punti restano al sicuro **su quel dispositivo** e non si perde niente,
ma la stanza online non si vede. In cima appare il tasto tondo con la **freccia circolare**
(e in *Setup* il pulsante **Riprova il collegamento**): un tocco e, se la rete c'è, torna
la schermata di accesso con **Continua con Google**. Se non basta, chiudi e riapri l'app.
Attenzione anche al **codice stanza**: è quello **intero** del link, tipo
`ufficio-k7m2x9qp`, non la sola prima parola.

**E se il proprietario non c'è?** Chi è già stato approvato entra e fa tutto da solo
(segnapunti compreso): il proprietario serve soltanto per approvare le persone **nuove**
e per cambiare i collegamenti account→giocatore.
