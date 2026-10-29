/**
 * EXPATS F.C. — Team Manager v1.0
 * INSTALLAZIONE (unica esecuzione):
 * Apri il foglio Google > Estensioni > Apps Script > incolla questo codice
 * e avvia la funzione inizializzaDatabase, autorizzandola.
 * ATTENZIONE: lo script non cancella righe già presenti.
 */
const EXPATS_SHEETS = {
  Giocatori: ['ID','Numero','Nome','Cognome','Stato','Ruolo','Note'],
  Stagioni: ['ID','Nome','Inizio','Fine'],
  Partite: ['ID','StagioneID','Data','Avversario','Campo','GolFatti','GolSubiti','Competizione','Note'],
  Distinte: ['ID','PartitaID','GiocatoreID','Convocato','Presenza','Gol','Assist','Gialli','Rossi'],
  Pregresso: ['StagioneID','GiocatoreID','Convocazioni','Presenze','Gol','Assist','Gialli','Rossi']
};

function inizializzaDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {};
  Object.entries(EXPATS_SHEETS).forEach(([title, headers]) => {
    const sh = ss.getSheetByName(title) || ss.insertSheet(title);
    sheets[title] = sh;
    const row = sh.getRange(1,1,1,headers.length);
    const existing = row.getValues()[0];
    if (existing.every(v => String(v).trim() === '')) row.setValues([headers]);
    else if (headers.some((v,i) => String(existing[i] || '').trim() !== v)) {
      throw new Error('La scheda ' + title + ' ha intestazioni diverse: controllare prima di proseguire.');
    }
    row.setFontWeight('bold').setBackground('#14334c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setTabColor(title === 'Giocatori' ? '#23b981' : '#4287c2');
    sh.autoResizeColumns(1,headers.length);
  });
  const allEmpty = ['Giocatori','Stagioni','Partite','Distinte','Pregresso']
    .every(title => sheets[title].getLastRow() <= 1);
  if (allEmpty) importaDatiIniziali_(sheets);
  SpreadsheetApp.flush();
  Logger.log('Expats F.C. v1.0: database inizializzato. ID foglio: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
}

function importaDatiIniziali_(sheets) {
  // Trascrizione dati dalla schermata fornita, con stagione provvisoria rinominabile.
  // Il dato -57 per i gol di Antonio è anomalo: importato 0, con nota esplicita.
  const raw = [
    [1,'Antonio','Stridi','ATTIVO','Portiere',18,17,0,0,0,0],
    [2,'Andrea','Minuti','ATTIVO','',7,7,3,1,0,0],
    [3,'Li','Wei','ATTIVO','',0,0,0,0,0,0],
    [4,'Marco','Elia','ATTIVO','',12,12,2,0,0,0],
    [5,'Guillaume','Lufau','ATTIVO','',15,15,0,2,1,0],
    [6,'Domenico','Panetta','ATTIVO','',5,4,0,0,1,0],
    [7,'Vincent','Devers','ATTIVO','',10,10,2,4,0,0],
    [8,'Luca','Bellegoni','ATTIVO','',17,17,14,4,2,0],
    [9,'Domenico','Iuliano','ATTIVO','',16,16,14,15,2,0],
    [10,'Stiv','Goraj','ATTIVO','',14,14,14,10,3,1],
    [11,'Osama','Elamin','ATTIVO','',16,16,14,3,1,0],
    [13,'Gustavo','Gutierrez','ATTIVO','',1,1,0,0,0,0],
    [14,'Alessandro','Vitale','ATTIVO','',7,7,2,3,0,0],
    [15,'Lorenzo','Bottoli','INFORTUNATO','',2,0,0,0,0,0],
    [16,'Paolo','Lokwani','INFORTUNATO','',3,3,0,0,0,0],
    [17,'Marco','Berti','ATTIVO','',17,11,0,0,0,0],
    [18,'Panos','Geneopoulos','ATTIVO','',6,6,3,1,0,0],
    [31,'Giorgio','Macauda','ATTIVO','',13,10,1,0,0,0]
  ];
  const players = raw.map(r => ['p'+r[0],r[0],r[1],r[2],r[3],r[4],r[0]===1
    ? 'Verificare il valore -57 nella colonna Gol originale: non importato.' : '']);
  const previous = raw.map(r => ['s-import','p'+r[0],r[5],r[6],r[7],r[8],r[9],r[10]]);
  sheets.Giocatori.getRange(2,1,players.length,players[0].length).setValues(players);
  sheets.Stagioni.getRange(2,1,1,4).setValues([['s-import','Stagione iniziale (import)','','']]);
  sheets.Pregresso.getRange(2,1,previous.length,previous[0].length).setValues(previous);
  Logger.log('Importati 18 giocatori e le statistiche pregresse della schermata. Nessun risultato inventato.');
}
