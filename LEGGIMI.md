# Expats F.C. — Team Manager
**Versione: v1.0** · App web GitHub Pages + database Google Sheets sul tuo Drive.

## Cosa è già implementato

- Dashboard responsive (desktop, tablet e smartphone) con stile sportivo e font **Exo 2**.
- Rosa, numero di maglia, ruolo e stati **Attivo / Infortunato / Ritirato**.
- Convocazioni, presenze, gol, assist, cartellini gialli e rossi.
- Classifiche e schede personali, ricerche e ordinamento per colonna.
- Partite, punteggi casa/trasferta, distinta con elenco di convocati e presenti.
- Risultati, vittorie/pareggi/sconfitte, classifiche stagionali.
- Nuove stagioni, archivio storico, esportazione CSV.
- Collegamento a **Google Sheets senza server a pagamento**: lettura pubblica e modifica con accesso Google.
- Demo iniziale ricostruita dalla schermata inviata (18 giocatori) senza inventare partite.

## Architettura

```text
GitHub Pages (HTML/CSS/JavaScript, pubblico)
             │
             ├── lettura anonima → Google Sheets (query Google Visualization)
             │
             └── scrittura autorizzata → Google OAuth → Google Sheets API
                                                    │
                                                    └── un foglio in Google Drive
```

**Sicurezza:** la web app non contiene password né chiavi segrete. Il `googleClientId` è un identificativo pubblico, non un segreto. I diritti effettivi di modifica sono determinati **dalle autorizzazioni del Google Sheet**. Non condividere il foglio con permesso *Editor* a persone che non devono modificarlo. I dati consultabili pubblicamente diventano accessibili a chi possiede il link dell'app o del foglio; valutare privacy e consenso dei giocatori.

### 1 — Crea il database nel tuo Google Drive

1. Vai su **Google Drive → Nuovo → Fogli Google** e crea un documento chiamato `Expats FC - Database`.
2. Apri **Estensioni → Apps Script**.
3. Cancella il codice iniziale e incolla tutto il file `setup.gs`.
4. Salva, scegli dal menu la funzione `inizializzaDatabase` e fai clic su **Esegui**. Autorizza lo script con il tuo account Google.
5. Vedrai cinque schede: **Giocatori, Stagioni, Partite, Distinte, Pregresso**. Se il file era vuoto, verranno importati 18 giocatori e le statistiche pregresse della schermata.
6. Copia l'**ID del foglio** dall'indirizzo: `https://docs.google.com/spreadsheets/d/QUESTA_PARTE_E_L_ID/edit`.
7. Per consentire la consultazione senza login, imposta **Condividi → Accesso generale → Chiunque abbia il link → Visualizzatore**. Mantieni **Editor** soltanto sul tuo account (o quelli di gestione). Google può cambiare le etichette nel tempo.

> **Nota privacy:** per una dashboard pubblica i nominativi e i dati sportivi contenuti nel foglio devono essere pubblicabili. Se non vuoi rendere pubblico il foglio, serve un'architettura diversa con backend autenticato; non basta nascondere il link.

### 2 — Configura Google Cloud (per aggiungere e modificare dati)

1. Apri [Google Cloud Console](https://console.cloud.google.com/), crea o seleziona un progetto dedicato.
2. Abilita l'API **Google Sheets API**.
3. In **Google Auth Platform / Schermata consenso OAuth** configura nome dell'app e contatti. Durante i test aggiungi **il tuo indirizzo Google** negli utenti di test. Se usi un'app esterna con utenti aggiuntivi, potrebbero servire altri passaggi di pubblicazione/verifica.
4. Crea un **Client OAuth → Applicazione web** (non Android, iOS né desktop).
5. Nelle **Origini JavaScript autorizzate** aggiungi esattamente il dominio della tua pagina: ad esempio `https://leon30071980.github.io` (senza il nome del repository e senza slash finale). Per una prova locale puoi aggiungere `http://localhost:8000`.
6. Copia l'**ID client OAuth**, che termina in `.apps.googleusercontent.com`.
7. L'app chiede l'ambito `https://www.googleapis.com/auth/spreadsheets` solo quando premi **Accedi con Google**. Google potrebbe mostrare una schermata di test/non verificata finché il progetto rimane in modalità test.

**Importante:** l'account Google che usi per l'accesso deve avere realmente il permesso Editor sul database. Un utente Viewer può leggere ma Google blocca qualsiasi tentativo di scrittura.

### 3 — Imposta `config.js`

Apri `config.js` e inserisci i due identificativi:

```javascript
window.EXPATS_CONFIG = Object.freeze({
  version: 'v1.0',
  teamName: 'Expats F.C.',
  spreadsheetId: 'ID_DEL_TUO_GOOGLE_SHEET',
  googleClientId: 'ID_CLIENT_OAUTH.apps.googleusercontent.com',
  publicMode: true
});
```

Non inserire password, API key private, client secret o token permanenti nel codice pubblico di GitHub.

### 4 — Pubblica su GitHub Pages

1. Crea un repository pubblico GitHub chiamato per esempio `Expats-FC-Stats`.
2. Carica **index.html, styles.css, app.js, config.js e demo.js** nella radice. Puoi caricare anche `LEGGIMI.md`; `setup.gs` serve invece per Apps Script.
3. Vai in **Settings → Pages** e configura **Deploy from a branch → main → / (root)**.
4. Il sito sarà visibile su un indirizzo simile a `https://leon30071980.github.io/Expats-FC-Stats/`.
5. Apri il sito in modalità anonima: la dashboard deve caricare i dati del foglio in lettura. Poi usa **Accedi con Google** e verifica una modifica con il tuo account editor.

Per provare il layout senza configurazione apri `index.html` o avvia un server locale `python -m http.server 8000`. In modalità demo **non è consentito salvare**, per evitare che le modifiche si perdano ricaricando la pagina.

## Utilizzo

1. Vai su **Rosa giocatori** e verifica tutti i dati importati, incluso il valore anomalo riscontrato per Antonio (−57 gol nel foglio originale, impostati a **0** in attesa di verifica).
2. In **Storico stagioni**, crea la stagione corretta o correggi direttamente il nome della stagione iniziale nel foglio Google.
3. Premi **Accedi con Google** per attivare i pulsanti riservati agli editor.
4. Usa **Partite e risultati → Registra partita**: inserisci data, avversario, risultato; per ogni giocatore seleziona **Conv.** e **Pres.** e compila i suoi eventuali gol, assist e cartellini.
5. Salvando, tutte le classifiche si aggiornano dalle nuove distinte più le statistiche pregresse, senza duplicarle.

### Che cosa significa "Pregresso"?

Nel tuo foglio iniziale ci sono i totali dei giocatori, ma non gli eventi delle singole partite. La scheda **Pregresso** salva questi totali iniziali. Quando inserisci una nuova partita, le statistiche dei giocatori vengono **sommate** al pregresso della stagione corrispondente. Se in seguito carichi partite storiche, evita di conservarne anche i totali nel pregresso, altrimenti le conteresti due volte.

### Limiti della v1.0

- Le statistiche pregresse non includono risultati partita: il bilancio vittorie/pareggi/sconfitte parte dalle partite registrate nell'app.
- La gestione delle distinte esistenti e la cancellazione delle partite non sono ancora disponibili nella UI: si possono correggere nel foglio con attenzione, mantenendo gli ID collegati.
- Il numero di maglia e lo stato sono *attuali*; non sono ancora versionati per singola stagione. Per uno storico anagrafico completo occorrerà una tabella di tesseramenti stagionali.
- L'app non supporta caricamento di foto profilo nella v1.0.
- I dati pubblici sono letti tramite Google Visualization, che può avere una breve latenza di cache; l'editor effettua invece la lettura autenticata dalla Google Sheets API.
- Le scritture della distinta e della partita vengono eseguite insieme tramite `spreadsheets.batchUpdate`; non ci sono funzioni offline di modifica.
- Per un progetto OAuth aperto a molte persone, Google può richiedere ulteriori controlli e verifica degli ambiti. Per un unico amministratore in test, usa gli utenti di test configurati nella Google Auth Platform.

## Schema del database

| Scheda | Colonne |
|---|---|
| Giocatori | ID, Numero, Nome, Cognome, Stato, Ruolo, Note |
| Stagioni | ID, Nome, Inizio, Fine |
| Partite | ID, StagioneID, Data, Avversario, Campo, GolFatti, GolSubiti, Competizione, Note |
| Distinte | ID, PartitaID, GiocatoreID, Convocato, Presenza, Gol, Assist, Gialli, Rossi |
| Pregresso | StagioneID, GiocatoreID, Convocazioni, Presenze, Gol, Assist, Gialli, Rossi |

Gli ID non devono essere modificati o duplicati. Le date inserite dall'app sono stringhe ISO `YYYY-MM-DD`. Valori `1` e `0` significano sì e no per Convocato/Presenza.

## Note di rilascio

**v1.0 — 29 ottobre 2026:** primo rilascio. Dashboard, rosa, risultati, distinte, classifiche, storico stagioni, importazione delle statistiche dall'immagine, database su Google Drive con Google Sheets, login editor tramite OAuth, pubblicazione GitHub Pages, export CSV.
