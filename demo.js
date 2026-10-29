/** Trascrizione iniziale della schermata fornita dall'utente. Nessuna partita inventata.
 * ATTENZIONE: il valore '-57' nei gol di Antonio è anomalo: non è importato e va verificato.
 * Questi dati sono una DEMO LOCALE: si modificano su Drive solo dopo la configurazione.
 */
window.EXPATS_DEMO = {
  seasons: [{ id: 's-import', name: '2025/26', start: '2025-07-01', end: '2026-06-30' },{id:'s-2026-27',name:'2026/27',start:'2026-07-01',end:'2027-06-30'}],
  players: [
    ['p1',1,'Antonio','Stridi','ATTIVO','Portiere'],
    ['p2',2,'Andrea','Minuti','ATTIVO',''],
    ['p3',3,'Li','Wei','ATTIVO',''],
    ['p4',4,'Marco','Elia','ATTIVO',''],
    ['p5',5,'Guillaume','Lufau','ATTIVO',''],
    ['p6',6,'Domenico','Panetta','ATTIVO',''],
    ['p7',7,'Vincent','Devers','ATTIVO',''],
    ['p8',8,'Luca','Bellegoni','ATTIVO',''],
    ['p9',9,'Domenico','Iuliano','ATTIVO',''],
    ['p10',10,'Stiv','Goraj','ATTIVO',''],
    ['p11',11,'Osama','Elamin','ATTIVO',''],
    ['p13',13,'Gustavo','Gutierrez','ATTIVO',''],
    ['p14',14,'Alessandro','Vitale','ATTIVO',''],
    ['p15',15,'Lorenzo','Bottoli','INFORTUNATO',''],
    ['p16',16,'Paolo','Lokwani','INFORTUNATO',''],
    ['p17',17,'Marco','Berti','ATTIVO',''],
    ['p18',18,'Panos','Geneopoulos','ATTIVO',''],
    ['p31',31,'Giorgio','Macauda','ATTIVO','']
  ].map(([id, number, firstName, lastName, status, role]) => ({id,number,firstName,lastName,status,role,notes:''})),
  memberships: [
    ...[1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,31].map(n=>({seasonId:'s-import',playerId:'p'+n,inRoster:true})),
    ...[1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,31].map(n=>({seasonId:'s-2026-27',playerId:'p'+n,inRoster:true}))
  ],
  matches: [],
  lineups: [],
  baseline: [
    ['p1',18,17,0,0,0,0],['p2',7,7,3,1,0,0],['p3',0,0,0,0,0,0],
    ['p4',12,12,2,0,0,0],['p5',15,15,0,2,1,0],['p6',5,4,0,0,1,0],
    ['p7',10,10,2,4,0,0],['p8',17,17,14,4,2,0],['p9',16,16,14,15,2,0],
    ['p10',14,14,14,10,3,1],['p11',16,16,14,3,1,0],['p13',1,1,0,0,0,0],
    ['p14',7,7,2,3,0,0],['p15',2,0,0,0,0,0],['p16',3,3,0,0,0,0],
    ['p17',17,11,0,0,0,0],['p18',6,6,3,1,0,0],['p31',13,10,1,0,0,0]
  ].map(([playerId,called,played,goals,assists,yellow,red]) => ({
    seasonId:'s-import', playerId,called,played,goals,assists,yellow,red
  }))
};
