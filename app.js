/* EXPATS F.C. TEAM MANAGER — v1.2
 * Frontend statico GitHub Pages + Google Sheets API (edit via OAuth) + GViz JSONP (pubblico).
 * Il controllo delle modifiche dipende dai permessi Google Drive sul foglio.
 */
(() => {
  'use strict';
  const CFG = window.EXPATS_CONFIG;
  const SHEETS = ['Giocatori','Stagioni','Partite','Distinte','Pregresso','Tesseramenti'];
  const VERSION='v1.2';
  const state = {
    data: structuredClone(window.EXPATS_DEMO),
    source: 'demo', view: 'dashboard', seasonId: '', rosterScope: 'season',
    sort: {key:'number',dir:1}, search:'', filter:'TUTTI',
    token: '', sheetIds: {}, busy: false, lastError: ''
  };
  const $ = (sel, root=document) => root.querySelector(sel);
  const el = (name, attrs={}) => Object.assign(document.createElement(name), attrs);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = v => { const n=Number(v); return Number.isFinite(n) ? n : 0; };
  const positiveInt = v => Math.max(0, Math.trunc(num(v)));
  const one = v => v === true || v === 1 || v === '1' || String(v).toLowerCase()==='true';
  const name = p => `${p.firstName} ${p.lastName}`.trim();
  const defaultSeason = () => state.data.seasons.find(s=>/2026\s*\/\s*(?:27|2027)/i.test(s.name)) || state.data.seasons[0];
  const activeSeason = () => state.data.seasons.find(s=>s.id===state.seasonId) || defaultSeason();
  const seasonEvidence = (playerId,seasonId) => state.data.baseline.some(b=>b.playerId===playerId && b.seasonId===seasonId && ['called','played','goals','assists','yellow','red'].some(k=>positiveInt(b[k])>0)) || state.data.lineups.some(l=>l.playerId===playerId && (l.called||l.played||l.goals||l.assists||l.yellow||l.red) && state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===seasonId));
  const isMember = (playerId,seasonId) => state.data.memberships.some(r=>r.playerId===playerId&&r.seasonId===seasonId&&r.inRoster) || seasonEvidence(playerId,seasonId);
  const seasonsPlayed = playerId => state.data.seasons.filter(s=>isMember(playerId,s.id)).length;
  const playersInSeason = seasonId => state.data.players.filter(p=>isMember(p.id,seasonId));
  const padDate = value => {
    if (typeof value === 'number' && value > 20000 && value < 80000)
      return new Date(Date.UTC(1899,11,30) + Math.round(value)*86400000).toISOString().slice(0,10);
    const text=String(value ?? '').trim();
    const italian=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (italian) return `${italian[3]}-${italian[2].padStart(2,'0')}-${italian[1].padStart(2,'0')}`;
    const gv=/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/.exec(text);
    if (gv) return `${gv[1]}-${String(Number(gv[2])+1).padStart(2,'0')}-${gv[3].padStart(2,'0')}`;
    return text.slice(0,10);
  };
  const localeDate = value => { if(!value) return 'Data non indicata'; const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(padDate(value)); return m?`${m[3]}/${m[2]}/${m[1]}`:String(value); };
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
  const toast = (message, error=false) => { const root=$('#toast-root'); root.innerHTML=`<div class="toast ${error?'error':''}" role="status">${esc(message)}</div>`; setTimeout(()=>root.replaceChildren(),5500); };
  const safeError = error => String(error?.message||error||'Operazione non riuscita').slice(0,300);
  const editor = () => !!state.token;
  const seasonMatches = id => state.data.matches.filter(m=>m.seasonId===id).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const matchResult = m => m.goalsFor>m.goalsAgainst?'W':m.goalsFor<m.goalsAgainst?'L':'D';
  const resultLabel = r => ({W:'Vittoria',D:'Pareggio',L:'Sconfitta'})[r] || '';
  const statusText = s => ({ATTIVO:'Attivo',INFORTUNATO:'Infortunato',RITIRATO:'Ritirato'})[s] || s;
  const statusBadge = s => `<span class="chip ${s==='ATTIVO'?'success':s==='INFORTUNATO'?'warning':'neutral'}">${esc(statusText(s))}</span>`;
  const keys = ['called','played','goals','assists','yellow','red'];
  const statLabels={called:'Convocazioni',played:'Presenze',goals:'Gol',assists:'Assist',yellow:'Gialli',red:'Rossi'};
  const roles=['Portiere','Difensore','Centrale','Terzino','Esterno','Centrocampista','Mediano','Trequartista','Attaccante','Punta','Jolly'];
  const jersey = (number,large=false) => `<span class="shirt-wrap ${large?'shirt-large':''}" aria-label="Maglia numero ${esc(number)}"><svg class="shirt-svg" viewBox="0 0 64 68" aria-hidden="true"><path d="M23 5h18l6 8 14 9-9 17-8-4v29H20V35l-8 4L3 22l14-9z" fill="#2ed69c" stroke="#9af6d5" stroke-width="2.2" stroke-linejoin="round"/><path d="M24 5q8 12 16 0" stroke="#0c3f38" stroke-width="3" fill="none"/><path d="M20 37v25M44 37v25" stroke="#17af81" stroke-width="1" opacity=".6"/></svg><span class="shirt-number">${esc(number)}</span></span>`;
  const lineupStat=(l,key)=>key==='called'||key==='played'?(one(l?.[key])?1:0):positiveInt(l?.[key]);
  const seasonIsHistorical=(sid)=>{const s=state.data.seasons.find(s=>s.id===sid);return !!s && !!s.end && s.end < new Date().toISOString().slice(0,10);};

  const sheetRange = sheet => `'${sheet.replace(/'/g,"''")}'!A:Z`;
  function statsForSeason(seasonId) {
    const map = new Map(state.data.players.map(p => [p.id,{...p,called:0,played:0,goals:0,assists:0,yellow:0,red:0}]));
    for (const b of state.data.baseline) if (b.seasonId===seasonId && map.has(b.playerId)) {
      const s=map.get(b.playerId); for(const k of keys) s[k] += positiveInt(b[k]);
    }
    const validMatches = new Set(state.data.matches.filter(m=>m.seasonId===seasonId).map(m=>m.id));
    for(const lineup of state.data.lineups) if (validMatches.has(lineup.matchId) && map.has(lineup.playerId)) {
      const s=map.get(lineup.playerId);
      s.called += one(lineup.called)?1:0;
      s.played += one(lineup.played)?1:0;
      for (const k of ['goals','assists','yellow','red']) s[k] += positiveInt(lineup[k]);
    }
    return [...map.values()];
  }
  const byKey = (items,key) => [...items].sort((a,b) => num(b[key])-num(a[key]) || name(a).localeCompare(name(b),'it'));
  function seasonTotals(id) {
    const st=statsForSeason(id);const matches=seasonMatches(id);
    return { players:playersInSeason(id).length, active:playersInSeason(id).filter(p=>p.status==='ATTIVO').length,
      injured:playersInSeason(id).filter(p=>p.status==='INFORTUNATO').length,
      called:st.reduce((t,p)=>t+p.called,0), played:st.reduce((t,p)=>t+p.played,0),
      goals:st.reduce((t,p)=>t+p.goals,0),assists:st.reduce((t,p)=>t+p.assists,0),
      matches:matches.length,win:matches.filter(m=>matchResult(m)==='W').length,
      draw:matches.filter(m=>matchResult(m)==='D').length,loss:matches.filter(m=>matchResult(m)==='L').length,
      scored:matches.reduce((t,m)=>t+positiveInt(m.goalsFor),0),
      conceded:matches.reduce((t,m)=>t+positiveInt(m.goalsAgainst),0)};
  }
  const NAV = [
    ['dashboard','◈','Panoramica'],['players','♙','Rosa giocatori'],
    ['matches','⚽','Partite e risultati'],['rankings','▥','Classifiche'],
    ['seasons','▦','Storico stagioni'],['settings','⚙','Configurazione']
  ];
  function renderNav() {
    $('#nav').innerHTML=NAV.map(([id,ico,label])=>`<button class="nav-item ${state.view===id?'active':''}" data-nav="${id}"><span class="nav-icon">${ico}</span>${esc(label)}</button>`).join('');
    $('#current-label').textContent=NAV.find(x=>x[0]===state.view)?.[2] || 'Panoramica';
    $('#season-select').innerHTML=state.data.seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===state.seasonId?'selected':''}>${esc(s.name)}</option>`).join('');
    $('#auth-btn').textContent=editor()?'Disconnetti Google':'Accedi con Google';
    $('#auth-btn').className=editor()?'btn btn-secondary':'btn btn-outline';
    $('#live-dot').className='online-indicator '+(state.source==='drive'?'connected':'');
    $('#sidebar-source').textContent=state.source==='demo'?'Anteprima dimostrativa':'Collegato a Google Drive';
    $('#sidebar-caption').textContent=editor()?'Sessione Google autorizzata':state.source==='demo'?'Dati non sincronizzati':'Consultazione pubblica';
    document.body.classList.toggle('is-editor',editor());
  }
  function banner() {
    if(state.source==='demo') return `<div class="status-banner"><span>⚠</span><span><strong>Modalità anteprima.</strong> I dati sono quelli trascritti dalla schermata e non vengono salvati su Drive. Configura Google Sheets per attivare la sincronizzazione.${state.lastError?' Errore collegamento: '+esc(state.lastError):''}</span></div>`;
    return `<div class="status-banner success"><span>●</span><span>Dati condivisi da Google Drive · ${editor()?'Sessione Google attiva per la gestione':'Accesso pubblico in sola lettura'}</span></div>`;
  }
  function intro(kicker,title,desc,actions='') {
    return `<div class="page-intro"><div><div class="eyebrow">${esc(kicker)}</div><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(desc)}</p></div>${actions?`<div class="intro-buttons">${actions}</div>`:''}</div>`;
  }
  const newMatchButton = () => `<button class="btn btn-primary only-editor" data-action="new-match">＋ Registra partita</button>`;
  const empty = (emoji,msg,sub='') => `<div class="empty-state"><div class="empty-emoji">${emoji}</div><strong>${esc(msg)}</strong>${sub?`<p>${esc(sub)}</p>`:''}</div>`;
  function renderDashboard() {
    const s=activeSeason(), t=seasonTotals(s.id), leaders=statsForSeason(s.id), matches=seasonMatches(s.id);
    const kpi = [
      ['GIOCATORI IN ROSA',t.players,'👥',`${t.active} attivi · ${t.injured} infortunati`,'accent-blue'],
      ['CONVOCAZIONI',t.called,'📋','Totale dei giocatori convocati','accent-green'],
      ['PRESENZE',t.played,'👟','Presenze complessive in campo','accent-blue'],
      ['GOL SEGNATI',t.goals,'⚽','Gol individuali registrati','accent-green']
    ];
    const card = ([label,value,icon,foot,accent])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-card-label">${label}</div><div class="stat-value ${accent}">${value}</div><div class="stat-foot">${esc(foot)}</div></div>`;
    return intro('LA TUA SQUADRA','La stagione in numeri',`Statistiche e andamento · ${s.name}`,newMatchButton())+banner()+
      `<div class="stats-grid">${kpi.map(card).join('')}</div><div class="panel-grid"><div class="panel"><div class="panel-heading"><div><h2 class="panel-title">⚽ Classifica marcatori</h2><span class="panel-caption">I migliori realizzatori della stagione</span></div><button class="link-btn" data-nav="rankings">Classifiche complete →</button></div>${bars(byKey(leaders,'goals').filter(p=>p.goals>0).slice(0,6),'goals')}</div>
      <div class="panel"><div class="panel-heading"><div><h2 class="panel-title">🎯 Leader assist</h2><span class="panel-caption">Chi crea più occasioni da gol</span></div><button class="link-btn" data-nav="rankings">Vedi tutte →</button></div>${bars(byKey(leaders,'assists').filter(p=>p.assists>0).slice(0,6),'assists',true)}</div></div>
      <div class="panel-grid mt-20"><div class="panel"><div class="panel-heading"><div><h2 class="panel-title">🏟 Ultime partite</h2><span class="panel-caption">Risultati delle partite registrate</span></div><button class="link-btn" data-nav="matches">Tutte le partite →</button></div>${matches.length?matches.slice(0,5).map(matchLine).join(''):empty('📅','Nessuna partita registrata','Puoi conservare le statistiche pregresse e inserire da oggi le nuove partite.')}</div>
      <div class="panel"><div class="panel-heading"><div><h2 class="panel-title">📈 Bilancio stagionale</h2><span class="panel-caption">Solo partite con risultato archiviato</span></div></div><div class="breakdown"><div><span>Vittorie</span><strong class="accent-green">${t.win}</strong></div><div><span>Pareggi</span><strong class="accent-yellow">${t.draw}</strong></div><div><span>Sconfitte</span><strong class="accent-red">${t.loss}</strong></div><div><span>Gol fatti / subiti in partita</span><strong>${t.scored} / ${t.conceded}</strong></div></div><p class="notice">I risultati delle partite non vengono ricostruiti dalle statistiche individuali importate.</p></div></div>`;
  }
  function bars(items,key,blue=false) {
    if(!items.length) return empty('📊','Nessun dato per questa classifica');
    const max=Math.max(1,...items.map(p=>p[key]));
    return `<div class="bars-list">${items.map((p,i)=>`<div class="bar-row"><span class="bar-rank ${i===0?'first':''}">${String(i+1).padStart(2,'0')}</span><span class="bar-person">${esc(name(p))}<small>#${esc(p.number)} · ${esc(p.role||'Giocatore')}</small></span><div class="bar-track"><div class="bar-fill ${blue?'blue':''}" style="width:${Math.round(100*p[key]/max)}%"></div></div><span class="bar-value">${p[key]}</span></div>`).join('')}</div>`;
  }
  function playerRows() {
    const list=statsForSeason(activeSeason().id).filter(p=>{
      if(state.rosterScope==='season' && !isMember(p.id,state.seasonId))return false;
      const q=state.search.trim().toLocaleLowerCase('it');
      return (state.filter==='TUTTI'||p.status===state.filter) && (`${name(p)} ${p.number} ${p.role}`.toLocaleLowerCase('it').includes(q));
    });
    const {key,dir}=state.sort;
    list.sort((a,b)=>{
      const av=key==='seasons'?seasonsPlayed(a.id):a[key],bv=key==='seasons'?seasonsPlayed(b.id):b[key];
      return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av||'').localeCompare(String(bv||''),'it'))*dir || name(a).localeCompare(name(b),'it');
    });
    return list;
  }
  function playersTable() {
    const rows=playerRows();
    if(!rows.length)return `<tr><td colspan="12">${empty('🔎','Nessun giocatore trovato')}</td></tr>`;
    const maximum=Object.fromEntries(keys.map(k=>[k,Math.max(1,...rows.map(r=>positiveInt(r[k])))]));
    const metric=(p,k)=>`<td class="metric-cell metric-${k}"><div class="metric-value">${positiveInt(p[k])}</div><div class="metric-track"><span style="width:${Math.min(100,Math.round(100*positiveInt(p[k])/maximum[k]))}%"></span></div></td>`;
    return rows.map((p,i)=>`<tr class="clickable" data-player="${esc(p.id)}" title="Dettaglio ${esc(name(p))}"><td class="row-index">${i+1}</td><td class="col-shirt">${jersey(p.number)}</td><td class="col-name">${esc(name(p))}</td><td>${esc(p.role||'—')}</td><td>${statusBadge(p.status)}</td><td class="num season-num">${seasonsPlayed(p.id)}</td>${keys.map(k=>metric(p,k)).join('')}</tr>`).join('');
  }
  function renderPlayers() {
    return intro('ROSA UFFICIALE','I nostri giocatori','Numero progressivo e maglia separati, ruolo, disponibilità e statistiche per stagione.',`<button class="btn btn-secondary" data-action="export">↓ Esporta CSV</button><button class="btn btn-primary only-editor" data-action="new-player">＋ Nuovo giocatore</button>`)+banner()+
      `<div class="toolbar"><select id="roster-scope" class="filter-select" aria-label="Rosa della stagione"><option value="season" ${state.rosterScope==='season'?'selected':''}>Rosa stagione</option><option value="all" ${state.rosterScope==='all'?'selected':''}>Tutti i giocatori</option></select><input id="player-search" class="search" type="search" placeholder="Cerca per nome, maglia o ruolo..." value="${esc(state.search)}" aria-label="Cerca giocatore"><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="TUTTI" ${state.filter==='TUTTI'?'selected':''}>Tutti gli stati</option>${['ATTIVO','INFORTUNATO','RITIRATO'].map(x=>`<option value="${x}" ${state.filter===x?'selected':''}>${statusText(x)}</option>`).join('')}</select></div>
      <div class="table-shell"><table class="data-table roster-table"><thead><tr><th class="col-count" title="Numerazione progressiva delle righe visualizzate">N°</th><th class="sortable" data-sort="number" title="Numero di maglia">Maglia${state.sort.key==='number'?(state.sort.dir===1?' ↑':' ↓'):''}</th>${[['firstName','Giocatore'],['role','Ruolo'],['status','Stato'],['seasons','Stagioni'],['called','Conv.'],['played','Pres.'],['goals','Gol'],['assists','Assist'],['yellow','Gialli'],['red','Rossi']].map(([k,label])=>`<th class="sortable" data-sort="${k}">${label}${state.sort.key===k?(state.sort.dir===1?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody id="players-tbody">${playersTable()}</tbody></table></div><p class="notice">N° = posizione progressiva nella tabella · Maglia = numero scelto dal giocatore. Le barre confrontano i valori della stessa colonna nella rosa visualizzata.</p>`;
  }
  const matchLine = m=>`<div class="result-line clickable" data-match="${esc(m.id)}"><div><div class="opponent">Expats F.C. <span class="muted">vs</span> ${esc(m.opponent)}</div><div class="meta">${localeDate(m.date)} · ${esc(m.venue==='T'?'Trasferta':'Casa')} · ${esc(m.competition||'Campionato')}</div></div><div class="results-head"><span class="chip ${matchResult(m)==='W'?'success':matchResult(m)==='D'?'warning':'danger'}">${resultLabel(matchResult(m))}</span><span class="score">${m.goalsFor} : ${m.goalsAgainst}</span></div></div>`;
  function renderMatches() {
    const s=activeSeason(), matches=seasonMatches(s.id),t=seasonTotals(s.id);
    return intro('CALENDARIO E RISULTATI','Partite della stagione',`Risultati e distinte archiviate · ${s.name}`,`<button class="btn btn-secondary only-editor" data-action="import-results">⇧ Importa risultati CSV</button>${newMatchButton()}`)+banner()+
      `<div class="stats-grid">${[['GIOCATE',t.matches,'🏟','Partite archiviate','accent-blue'],['VITTORIE',t.win,'🏆','Risultati vincenti','accent-green'],['PAREGGI',t.draw,'🤝','Partite in parità','accent-yellow'],['SCONFITTE',t.loss,'📉','Partite perse','accent-red']].map(([lab,val,icon,foot,color])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-card-label">${lab}</div><div class="stat-value ${color}">${val}</div><div class="stat-foot">${foot}</div></div>`).join('')}</div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">Elenco incontri</h2><span class="panel-caption">${matches.length} partite registrate</span></div>${matches.length?matches.map(matchLine).join(''):empty('⚽','Non sono ancora state registrate partite','Le nuove partite incrementeranno automaticamente presenze, convocazioni e statistiche.')}</div>`;
  }
  function renderRankings() {
    const s=activeSeason(), st=statsForSeason(s.id);
    const sections=[['⚽ Marcatori','goals','Reti segnate'],['🎯 Assist','assists','Passaggi decisivi'],['📋 Convocazioni','called','Chiamate in squadra'],['👟 Presenze','played','Partite disputate'],['🟨 Cartellini gialli','yellow','Ammonizioni'],['🟥 Cartellini rossi','red','Espulsioni']];
    return intro('RECORD INDIVIDUALI','Classifiche giocatori',`I protagonisti della ${s.name.toLowerCase()}.`)+banner()+`<div class="panel-grid">${sections.map(([title,key,desc])=>`<div class="panel"><div class="panel-heading"><div><h2 class="panel-title">${title}</h2><span class="panel-caption">${desc}</span></div></div>${bars(byKey(st,key).filter(p=>p[key]>0).slice(0,8),key,key==='assists'||key==='played')}</div>`).join('')}</div>`;
  }
  function renderSeasons() {
    const seasons=[...state.data.seasons].sort((a,b)=>String(b.start||b.name).localeCompare(String(a.start||a.name)));
    return intro('ALBO STAGIONALE','Archivio stagioni','Ogni stagione conserva statistiche e risultati separati.',`<button class="btn btn-primary only-editor" data-action="new-season">＋ Nuova stagione</button>`)+banner()+
      `<div class="season-grid">${seasons.map(s=>{const t=seasonTotals(s.id);return `<div class="season-card"><div class="eyebrow">STAGIONE</div><h3>${esc(s.name)}</h3><p>${s.start?localeDate(s.start):'Inizio da definire'} ${s.end?`— ${localeDate(s.end)}`:''}</p><div class="mini-summary"><div><strong>${t.matches}</strong><span>Partite</span></div><div><strong>${t.goals}</strong><span>Gol singoli</span></div><div><strong>${t.assists}</strong><span>Assist</span></div></div><div class="season-bottom mt-20"><span class="chip ${s.id===state.seasonId?'success':'neutral'}">${s.id===state.seasonId?'Selezionata':'Archiviata'}</span><div class="season-card-buttons"><button class="btn btn-secondary btn-small only-editor" data-action="edit-season" data-id="${esc(s.id)}">Modifica</button><button class="btn btn-secondary btn-small" data-season="${esc(s.id)}">Visualizza</button></div></div></div>`}).join('')}</div><p class="notice mt-20">Il numero di stagioni conta i tesseramenti e le partecipazioni documentate. Modifica un giocatore per scegliere le sue stagioni; lo stato Attivo/Infortunato/Ritirato indica la situazione attuale, anche quando visualizzi stagioni precedenti.</p>`;
  }
  function renderSettings() {
    return intro('CONNESSIONE E DATI','Configurazione','Gestione del collegamento con il foglio Google e stato del progetto.')+banner()+
    `<div class="two-cards"><div class="panel"><div class="panel-heading"><h2 class="panel-title">🔐 Stato connessione</h2></div><div class="breakdown"><div><span>Versione applicazione</span><strong>${VERSION}</strong></div><div><span>Origine dati</span><strong>${state.source==='drive'?'Google Drive':'Demo locale'}</strong></div><div><span>Modalità</span><strong>${editor()?'Google OAuth attivo':'Sola consultazione'}</strong></div><div><span>Archivio</span><strong>${CFG.spreadsheetId?'Configurato':'Da configurare'}</strong></div></div><p class="notice">Le autorizzazioni di scrittura non sono affidate al sito GitHub: le controlla Google tramite i permessi del foglio.</p></div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">📂 Dove sono salvati i dati?</h2></div><p class="form-guide">Tutte le informazioni sono conservate in un unico Google Sheets nel tuo Drive, diviso in 6 schede.</p><div class="breakdown">${SHEETS.map(s=>`<div><span>${esc(s)}</span><strong>Google Sheets</strong></div>`).join('')}</div>${CFG.spreadsheetId?`<p><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(CFG.spreadsheetId)}/edit">Apri archivio Google Sheets ↗</a></p>`:''}</div></div>
    <div class="panel mt-20"><div class="panel-heading"><h2 class="panel-title">🚀 Messa online</h2></div><div class="two-cards"><div class="info-step"><h3>1. Aggiorna il database esistente</h3><p>Nel Google Sheet già collegato: Estensioni → Apps Script. Sostituisci il vecchio script con <strong>setup.gs</strong> e avvia <strong>aggiornaDatabaseV12()</strong>. Aggiunge il campo tecnico PregressoAssorbito senza cancellare dati.</p></div><div class="info-step"><h3>2. Conserva l’accesso Google</h3><p>Se l’app v1.0 già funziona, non modificare <strong>config.js</strong> né l’ID client OAuth: rimangono validi.</p></div><div class="info-step"><h3>3. Pubblica i file v1.2</h3><p>Carica sullo stesso repository GitHub <strong>index.html, app.js, demo.js, styles.css</strong>. Non sovrascrivere config.js.</p></div><div class="info-step"><h3>4. Importa risultati 2025/26</h3><p>Seleziona 2025/26 → Partite e risultati → Importa risultati CSV. Puoi modificare risultato e distinta cliccando una partita; le statistiche già nel pregresso possono essere assorbite senza duplicazioni.</p></div></div><p class="notice mt-20">Per tutte le istruzioni operative, vedere il file LEGGIMI.md incluso nel progetto.</p></div>`;
  }
  function render() {
    if(!state.data.seasons.some(s=>s.id===state.seasonId)) state.seasonId=defaultSeason()?.id||'';
    renderNav();
    const content=({dashboard:renderDashboard,players:renderPlayers,matches:renderMatches,rankings:renderRankings,seasons:renderSeasons,settings:renderSettings}[state.view]||renderDashboard)();
    $('#main-content').innerHTML=content;
  }
  function navigate(view) { state.view=view;render();window.scrollTo({top:0,behavior:'smooth'}); }
  function closeModal() { $('#modal-root').replaceChildren();document.body.style.overflow=''; }
  function modal(title,body,footer='',wide=false) {
    $('#modal-root').innerHTML=`<div class="modal-backdrop" data-backdrop="true"><div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${esc(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Chiudi finestra">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}</div></div>`;
    document.body.style.overflow='hidden';
    $('.modal .form-control')?.focus();
  }
  function profile(playerId) {
    const p=statsForSeason(state.seasonId).find(p=>p.id===playerId); if(!p)return;
    const played=state.data.lineups.filter(l=>l.playerId===p.id && state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===state.seasonId));
    const body=`<div class="profile-hero"><div class="player-portrait">${jersey(p.number,true)}</div><div><div class="eyebrow">SCHEDA GIOCATORE</div><h3 class="profile-title">${esc(name(p))}</h3>${statusBadge(p.status)} <span class="chip">${esc(p.role||'Ruolo da definire')}</span></div></div><div class="profile-stats">${[['Convocazioni',p.called],['Presenze',p.played],['Gol',p.goals],['Assist',p.assists],['Gialli',p.yellow],['Rossi',p.red],['Stagioni',seasonsPlayed(p.id)]].map(([label,n])=>`<div><strong>${n}</strong><small>${label}</small></div>`).join('')}</div>${p.notes?`<p class="form-guide">${esc(p.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Statistiche registrate per partita</h3>${played.length?played.map(l=>{const m=state.data.matches.find(m=>m.id===l.matchId);return `<div class="result-line"><span>${esc(m?.opponent)} · ${localeDate(m?.date)}</span><span>⚽ ${positiveInt(l.goals)} · 🎯 ${positiveInt(l.assists)}</span></div>`}).join(''):'<p class="form-guide">Le statistiche pregresse sono aggregate; non è disponibile il dettaglio delle vecchie partite.</p>'}`;
    modal(name(p),body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-secondary only-editor" data-action="edit-baseline" data-id="${esc(p.id)}">Correggi pregresso</button><button class="btn btn-primary only-editor" data-action="edit-player" data-id="${esc(p.id)}">Modifica giocatore</button>`);
  }
  function playerForm(playerId='') {
    if(!editor()) {toast('Accedi con Google per modificare i dati.',true);return;}
    const p=state.data.players.find(p=>p.id===playerId);
    const options=(values,current,labels={})=>values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(labels[v]||v)}</option>`).join('');
    const selectedNumber=p?.number??0;
    const shirtNumbers=Array.from({length:100},(_,i)=>i);
    const form=`<form id="player-form"><div class="field-grid">
      <div class="field"><label for="p-number">Numero di maglia *</label><select class="form-control" name="number" id="p-number" required>${shirtNumbers.map(n=>`<option value="${n}" ${n===selectedNumber?'selected':''}>${n===0?'0 · senza numero':n}</option>`).join('')}</select><small>Il numero progressivo N° nella rosa è automatico e indipendente.</small></div>
      <div class="field"><label for="p-role">Ruolo</label><select class="form-control" name="role" id="p-role"><option value="">Seleziona ruolo</option>${options([...new Set([...roles,...(p?.role&&!roles.includes(p.role)?[p.role]:[])])],p?.role||'')}</select></div>
      <div class="field"><label for="p-firstName">Nome *</label><input class="form-control" name="firstName" id="p-firstName" value="${esc(p?.firstName||'')}" required maxlength="70"></div>
      <div class="field"><label for="p-lastName">Cognome *</label><input class="form-control" name="lastName" id="p-lastName" value="${esc(p?.lastName||'')}" required maxlength="70"></div>
      <div class="field full"><label for="p-status">Stato</label><select class="form-control" name="status" id="p-status">${options(['ATTIVO','INFORTUNATO','RITIRATO'],p?.status||'ATTIVO',{ATTIVO:'Attivo',INFORTUNATO:'Infortunato',RITIRATO:'Ritirato'})}</select></div>
      <div class="field full"><label>Stagioni in rosa</label><small>Seleziona le stagioni alle quali il giocatore appartiene. I dati storici non vengono cancellati.</small><div class="membership-grid">${state.data.seasons.map(s=>`<label class="membership-option"><input type="checkbox" name="membership" value="${esc(s.id)}" ${p?(isMember(p.id,s.id)?'checked':''):(s.id===state.seasonId?'checked':'')}> ${esc(s.name)}</label>`).join('')}</div></div>
      <div class="field full"><label for="p-notes">Note</label><textarea class="form-control" id="p-notes" name="notes" rows="3">${esc(p?.notes||'')}</textarea></div></div></form>`;
    modal(p?'Modifica giocatore':'Aggiungi giocatore',form,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-player" data-id="${esc(p?.id||'')}">Salva su Drive</button>`);
  }
  function seasonForm(seasonId='') {
    if(!editor()){toast('Accedi con Google per gestire le stagioni.',true);return;}
    const current=state.data.seasons.find(s=>s.id===seasonId);
    const body=`<form id="season-form"><div class="field-grid"><div class="field full"><label>Nome stagione *</label><input class="form-control" name="name" required placeholder="Es. 2026/27" maxlength="70" value="${esc(current?.name||'')}"></div><div class="field"><label>Data inizio</label><input class="form-control" type="date" name="start" value="${esc(current?.start||'')}"></div><div class="field"><label>Data fine</label><input class="form-control" type="date" name="end" value="${esc(current?.end||'')}"></div></div></form>`;
    modal(current?'Modifica stagione':'Nuova stagione',body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-season" data-id="${esc(current?.id||'')}">${current?'Salva modifiche':'Crea stagione'}</button>`);
  }
  function lineupEditor(match,seasonId) {
    const allIds=new Set(state.data.players.filter(p=>isMember(p.id,seasonId)).map(p=>p.id));
    state.data.lineups.filter(l=>l.matchId===match?.id).forEach(l=>allIds.add(l.playerId));
    const players=[...state.data.players].filter(p=>allIds.has(p.id)).sort((a,b)=>num(a.number)-num(b.number)||name(a).localeCompare(name(b),'it'));
    const stored=new Map(state.data.lineups.filter(l=>l.matchId===match?.id).map(l=>[l.playerId,l]));
    return `<div class="lineup-controls"><button type="button" class="btn btn-secondary btn-small" data-action="mark-all-called">✓ Convoca tutti</button><button type="button" class="btn btn-secondary btn-small" data-action="clear-all-called">× Azzera convocazioni</button><span id="lineup-summary" class="lineup-summary" aria-live="polite"></span></div><div class="roster-form"><div class="roster-header"><span style="text-align:left">GIOCATORE</span><span>CONV.</span><span>PRES.</span><span>GOL</span><span>ASSIST</span><span>🟨</span><span>🟥</span></div>${players.map(p=>{const l=stored.get(p.id)||{};return `<div class="roster-entry ${one(l.called)?'is-called':''}" data-player-id="${esc(p.id)}"><span class="player-label">${jersey(p.number)} ${esc(name(p))}${p.status==='INFORTUNATO'?'<small> · INFORTUNATO</small>':''}</span><input type="checkbox" data-line="called" ${one(l.called)?'checked':''} aria-label="Convocato ${esc(name(p))}"><input type="checkbox" data-line="played" ${one(l.played)?'checked':''} aria-label="Presenza ${esc(name(p))}">${['goals','assists','yellow','red'].map(k=>`<input type="number" data-line="${k}" value="${positiveInt(l[k])}" min="0" max="${k==='yellow'?2:k==='red'?1:99}" step="1" ${one(l.played)?'':'disabled'} aria-label="${statLabels[k]} ${esc(name(p))}">`).join('')}</div>`}).join('')}</div>${!players.length?'<p class="notice">Non ci sono giocatori tesserati in questa stagione: aggiungili dalla Rosa.</p>':''}`;
  }
  function matchForm(matchId='') {
    if(!editor()){toast('Accedi con Google per registrare o modificare una partita.',true);return;}
    const m=state.data.matches.find(x=>x.id===matchId);
    const sid=m?.seasonId||state.seasonId;
    const season=state.data.seasons.find(s=>s.id===sid)||activeSeason();
    const isHistorical=seasonIsHistorical(sid)&&state.data.baseline.some(b=>b.seasonId===sid && keys.some(k=>b[k]>0));
    // Le distinte delle partite storiche possono rappresentare statistiche già importate nel Pregresso.
    const absorbed=m?(state.data.lineups.some(l=>l.matchId===m.id)?m.baselineAbsorbed:isHistorical):isHistorical;
    const body=`<form id="match-form" data-edit-id="${esc(matchId)}"><div class="field-grid"><div class="field"><label>Data partita *</label><input class="form-control" type="date" name="date" required value="${esc(m?.date||[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-'))}"></div><div class="field"><label>Stagione *</label><input type="hidden" name="seasonId" value="${esc(sid)}"><input class="form-control" readonly value="${esc(season.name)}"></div>
      <div class="field full"><label>Avversario *</label><input class="form-control" name="opponent" required maxlength="120" placeholder="Nome squadra avversaria" value="${esc(m?.opponent||'')}"></div>
      <div class="field"><label>Campo</label><select class="form-control" name="venue"><option value="C" ${m?.venue!=='T'?'selected':''}>Casa</option><option value="T" ${m?.venue==='T'?'selected':''}>Trasferta</option></select></div>
      <div class="field"><label>Competizione</label><input class="form-control" name="competition" placeholder="Campionato" maxlength="100" value="${esc(m?.competition||'')}"></div>
      <div class="field"><label>Gol Expats F.C. *</label><input class="form-control" type="number" name="goalsFor" min="0" max="99" step="1" value="${m?.goalsFor??0}" required></div>
      <div class="field"><label>Gol avversario *</label><input class="form-control" type="number" name="goalsAgainst" min="0" max="99" step="1" value="${m?.goalsAgainst??0}" required></div>
      <div class="field full"><label>Note partita</label><textarea class="form-control" name="notes" rows="2" maxlength="1000">${esc(m?.notes||'')}</textarea></div>
      <div class="field full"><label>Distinta giocatori</label><small>✓ Convocato = convocazione. ✓ Presenza = giocatore sceso in campo. Gol, assist e cartellini si abilitano dopo la presenza.</small>${lineupEditor(m,sid)}</div>
      <div class="field full"><label class="history-option"><input type="checkbox" name="baselineAbsorbed" ${absorbed?'checked':''}> <span><strong>Statistiche della distinta già comprese nel pregresso</strong><small>Usalo per ricostruire partite della 2025/26 già incluse nei totali importati: sposta i valori dal pregresso alla distinta senza aumentarli. Lascialo disattivo per partite nuove: aumenteranno le statistiche automaticamente.</small></span></label></div>
      </div></form>`;
    modal(m?'Modifica partita e distinta':'Registra nuova partita',body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-match">${m?'Salva modifiche e distinta':'Salva partita e distinta'}</button>`,true);
    updateLineupSummary();
  }
  function matchDetail(id) {
    const m=state.data.matches.find(m=>m.id===id);if(!m)return;
    const lines=state.data.lineups.filter(l=>l.matchId===id).sort((a,b)=>num(state.data.players.find(p=>p.id===a.playerId)?.number)-num(state.data.players.find(p=>p.id===b.playerId)?.number));
    const body=`<div class="eyebrow">${localeDate(m.date)} · ${esc(m.competition||'Partita')}</div><h3 class="page-title" style="font-size:27px">Expats F.C. <span class="accent-green">${m.goalsFor} — ${m.goalsAgainst}</span> ${esc(m.opponent)}</h3><p class="page-subtitle">${m.venue==='T'?'Trasferta':'Casa'} · ${resultLabel(matchResult(m))}</p>${m.notes?`<p class="modal-explainer">${esc(m.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Distinta e statistiche</h3><div class="table-shell mt-20"><table class="data-table" style="min-width:560px"><thead><tr><th>Giocatore</th><th>Conv.</th><th>Pres.</th><th>Gol</th><th>Assist</th><th>Gialli</th><th>Rossi</th></tr></thead><tbody>${lines.map(l=>{const p=state.data.players.find(p=>p.id===l.playerId);return `<tr><td>${esc(p?name(p):'Giocatore non trovato')}</td><td>${one(l.called)?'✓':'—'}</td><td>${one(l.played)?'✓':'—'}</td><td>${positiveInt(l.goals)}</td><td>${positiveInt(l.assists)}</td><td>${positiveInt(l.yellow)}</td><td>${positiveInt(l.red)}</td></tr>`}).join('')}</tbody></table></div>${!lines.length?'<p class="form-guide">Nessuna distinta presente per questa partita. Puoi aggiungerla con Modifica partita e distinta.</p>':''}`;
    modal(`Partita contro ${m.opponent}`,body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-primary only-editor" data-action="edit-match" data-id="${esc(m.id)}">Modifica partita e distinta</button>`,true);
  }
  function editMatchForm(matchId) { matchForm(matchId); }
  function baselineForm(playerId) {
    if(!editor())return;
    const p=state.data.players.find(x=>x.id===playerId);if(!p)return;
    const season=activeSeason();
    const st=statsForSeason(season.id).find(x=>x.id===playerId);
    const detail=state.data.lineups.filter(l=>l.playerId===playerId && state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===season.id));
    const counted=Object.fromEntries(keys.map(k=>[k,detail.reduce((sum,l)=>sum+(k==='called'||k==='played'?(one(l[k])?1:0):positiveInt(l[k])),0)]));
    const labels={called:'Convocazioni',played:'Presenze',goals:'Gol',assists:'Assist',yellow:'Gialli',red:'Rossi'};
    const body=`<form id="baseline-form"><p class="modal-explainer">Imposta i TOTALI di ${esc(name(p))} nella stagione <strong>${esc(season.name)}</strong>. L'app sottrarrà automaticamente i dati delle partite già dettagliate, per evitare doppi conteggi.</p><div class="field-grid">${keys.map(k=>`<div class="field"><label>${labels[k]} (di cui ${counted[k]} già registrati)</label><input class="form-control" name="${k}" type="number" min="${counted[k]}" max="9999" value="${st[k]}" required></div>`).join('')}</div></form>`;
    modal('Correggi statistiche · '+name(p),body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-baseline" data-id="${esc(playerId)}">Salva totali</button>`);
  }
  function importResultsForm() {
    if(!editor())return;
    const body=`<div class="modal-explainer">Importa <strong>solo i risultati</strong> storici, senza modificare convocazioni, presenze, gol e assist individuali già aggregati nel pregresso. Le partite duplicate (stessa stagione, data, avversario e campo) saranno scartate.</div><div class="field-grid"><div class="field full"><label>Stagione destinazione</label><select class="form-control" id="import-season">${state.data.seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===state.seasonId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field full"><label>Carica CSV (.csv o .txt)</label><input id="csv-file" type="file" accept=".csv,.txt,text/csv,text/plain" class="form-control"></div><div class="field full"><label>Oppure incolla il CSV (intestazione inclusa)</label><textarea id="csv-paste" class="form-control csv-input" rows="9" placeholder="Data;Avversario;Campo;GolFatti;GolSubiti;Competizione;Note&#10;2025-09-20;Avversari FC;C;3;1;Campionato;"></textarea></div></div><p class="form-guide">Colonne obbligatorie: Data (AAAA-MM-GG o GG/MM/AAAA), Avversario, Campo (C/T), GolFatti, GolSubiti. Competizione e Note facoltative. Separatore punto e virgola oppure virgola. Usa il pulsante di verifica per controllare i dati prima di importarli.</p><div id="import-preview" aria-live="polite"></div>`;
    modal('Importa risultati storici',body,`<button class="btn btn-secondary" data-action="download-template">↓ Modello CSV</button><button class="btn btn-secondary" data-action="preview-import">Verifica dati</button><button class="btn btn-primary" id="execute-import" data-action="execute-import" disabled>Importa su Drive</button>`,true);
  }
  function parseCSV(text) {
    const src=String(text||'').replace(/^\uFEFF/,'').trim();
    if(!src)throw new Error('Seleziona un file CSV o incolla i risultati.');
    const first=src.split(/\r?\n/,1)[0];
    const delim=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';
    let arr=[],row=[],field='',quoted=false;
    for(let i=0;i<src.length;i++){
      const ch=src[i];
      if(ch==='"') {if(quoted&&src[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(ch===delim&&!quoted){row.push(field.trim());field='';}
      else if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(field.trim());if(row.some(v=>v))arr.push(row);row=[];field='';}
      else field+=ch;
    }
    if(quoted)throw new Error('Virgolette non chiuse nel CSV.');
    row.push(field.trim());if(row.some(v=>v))arr.push(row);
    if(arr.length<2)throw new Error('Inserisci intestazione e almeno un risultato.');
    const canon=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const headers=arr.shift().map(canon);
    const needed={date:['data','date'],opponent:['avversario','opponent','squadra'],venue:['campo','venue','casatrasferta'],goalsFor:['golfatti','golsegnati','gf','goalsfor'],goalsAgainst:['golsubiti','gs','goalsagainst']};
    const optional={competition:['competizione','torneo','campionato'],notes:['note','notes']};
    const cols={};
    for(const [key,aliases] of Object.entries({...needed,...optional})) {
      cols[key]=headers.findIndex(h=>aliases.includes(h));
      if(key in needed && cols[key]<0)throw new Error('Intestazione mancante: '+aliases[0]);
    }
    const isValidDate=t=>/^\d{4}-\d{2}-\d{2}$/.test(t)&&!Number.isNaN(Date.parse(t))&&new Date(t+'T12:00:00Z').toISOString().startsWith(t);
    return arr.map((r,i)=>{
      const data=padDate(r[cols.date]), opp=String(r[cols.opponent]||'').trim(),venue=String(r[cols.venue]||'').toUpperCase().trim();
      const gf=String(r[cols.goalsFor]??'').trim(),ga=String(r[cols.goalsAgainst]??'').trim();
      if(!isValidDate(data)||!opp||!['C','T'].includes(venue)||!/^\d{1,2}$/.test(gf)||!/^\d{1,2}$/.test(ga))throw new Error('Riga CSV '+(i+2)+' non valida (data, avversario, C/T o gol).');
      return {date:data,opponent:opp,venue,goalsFor:Number(gf),goalsAgainst:Number(ga),competition:cols.competition<0?'':String(r[cols.competition]||'').trim(),notes:cols.notes<0?'':String(r[cols.notes]||'').trim()};
    });
  }
  const matchIdentity=(sid,m)=>[sid,m.date,String(m.opponent).trim().toLocaleLowerCase('it'),m.venue].join('|');
  function checkedImport() {
    const sid=$('#import-season')?.value;
    const rows=parseCSV($('#csv-paste').value);
    if(rows.length>1000)throw new Error('Massimo 1000 partite per importazione.');
    const exists=new Set(state.data.matches.map(m=>matchIdentity(m.seasonId,m))),unique=new Set();
    const result=[],duplicates=[];
    for(const r of rows){const key=matchIdentity(sid,r);if(exists.has(key)||unique.has(key))duplicates.push(r);else{unique.add(key);result.push(r);}}
    return {sid,rows:result,duplicates};
  }
  function previewImport() {
    const holder=$('#import-preview');if(!holder)return;
    try{
      const parsed=checkedImport();state.importPreview=parsed;
      $('#execute-import').disabled=!parsed.rows.length;
      holder.innerHTML=`<div class="import-summary"><strong>${parsed.rows.length} partite da importare</strong> · ${parsed.duplicates.length} duplicate ignorate</div><div class="table-shell"><table class="data-table"><thead><tr><th>Data</th><th>Avversario</th><th>Campo</th><th>Risultato</th></tr></thead><tbody>${parsed.rows.slice(0,8).map(r=>`<tr><td>${esc(localeDate(r.date))}</td><td>${esc(r.opponent)}</td><td>${r.venue}</td><td>${r.goalsFor} – ${r.goalsAgainst}</td></tr>`).join('')}</tbody></table></div>`;
    }catch(error){state.importPreview=null;$('#execute-import').disabled=true;holder.textContent=safeError(error);holder.className='import-error';}
  }
  function downloadTemplate() {
    const text='\uFEFFData;Avversario;Campo;GolFatti;GolSubiti;Competizione;Note\r\n2025-09-20;Esempio FC;C;3;1;Campionato;\r\n';
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const a=el('a',{href:url,download:'expats-fc-modello-risultati.csv'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function exportCSV() {
    const fields=['number','firstName','lastName','status','role','seasons','called','played','goals','assists','yellow','red'];
    const labels=['N° progressivo','Maglia','Nome','Cognome','Stato','Ruolo','Stagioni','Convocazioni','Presenze','Gol','Assist','Gialli','Rossi'];
    const escapeCSV = (v) => {
      let s=String(v ?? '');
      // Evita l'iniezione di formule nei programmi di calcolo.
      if (/^[\s]*[=+@\-\t\r]/.test(s) && isNaN(Number(s))) s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const rows=[labels,...playerRows().map((p,i)=>[i+1,...fields.map(k=>k==='seasons'?seasonsPlayed(p.id):p[k])])];
    const csv='\ufeff'+rows.map(row=>row.map(escapeCSV).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:`expats-fc-${state.seasonId}-v1.2.csv`});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Classifica esportata in CSV.');
  }
  // --- Google Drive: lettura pubblica via Google Visualization JSONP ---
  function gvizSheet(sheet) {
    const id=CFG.spreadsheetId;
    return new Promise((resolve,reject)=>{
      const cb='expats_gviz_'+sheet.toLowerCase()+'_'+Math.random().toString(36).slice(2,9);
      const script=document.createElement('script');let finished=false;
      const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);script.remove();delete window[cb];error?reject(error):resolve(result);};
      window[cb]=result=>{
        if(result?.status==='error') {done(new Error(result.errors?.[0]?.detailed_message||`Errore in ${sheet}`));return;}
        const rows=(result?.table?.rows||[]).map(r=>(r.c||[]).map(c=>c?.v??''));
        done(null,rows);
      };
      const tqx=encodeURIComponent('out:json;responseHandler:'+cb);
      script.src=`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?sheet=${encodeURIComponent(sheet)}&headers=1&tqx=${tqx}&tq=${encodeURIComponent('select *')}&_=${Date.now()}`;
      script.onerror=()=>done(new Error(`Impossibile leggere ${sheet}: il foglio deve essere condiviso pubblicamente in visualizzazione.`));
      const timer=setTimeout(()=>done(new Error(`Timeout nella lettura di ${sheet}`)),14000);
      document.head.append(script);
    });
  }
  async function googleAPI(path,options={}) {
    if(!state.token) throw new Error('Sessione scaduta: accedi nuovamente con Google.');
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(CFG.spreadsheetId)}${path}`;
    const res=await fetch(url,{...options,headers:{Authorization:`Bearer ${state.token}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok) {
      if(res.status===401){state.token='';render();}
      throw new Error(body.error?.message||`Errore Google Sheets HTTP ${res.status}`);
    }
    return body;
  }
  async function loadPrivate() {
    const query=new URLSearchParams();SHEETS.forEach(s=>query.append('ranges',sheetRange(s)));
    query.set('valueRenderOption','UNFORMATTED_VALUE');
    const response=await googleAPI('/values:batchGet?'+query.toString());
    return decodeSheets(response.valueRanges.map(x=>(x.values||[]).slice(1)));
  }
  async function loadPublic() {
    const tables=await Promise.all(SHEETS.map(gvizSheet));
    return decodeSheets(tables);
  }
  function decodeSheets(arrays) {
    const [p,s,m,l,b,t]=arrays;
    const trimmed=rows=>(rows||[]).filter(row=>row?.some(x=>String(x??'').trim()!==''));
    const str=x=>String(x??'').trim();
    const players=(p||[]).map((r,i)=>({id:str(r[0]),number:num(r[1]),firstName:str(r[2]),lastName:str(r[3]),status:str(r[4])||'ATTIVO',role:str(r[5]),notes:str(r[6]),_row:i+2})).filter(x=>x.id);
    const seasons=(s||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),start:padDate(r[2]),end:padDate(r[3]),_row:i+2})).filter(x=>x.id);
    if(!seasons.length)throw new Error('Il foglio Stagioni è vuoto. Esegui inizializzaDatabase() e importa almeno una stagione.');
    const matches=(m||[]).map((r,i)=>({id:str(r[0]),seasonId:str(r[1]),date:padDate(r[2]),opponent:str(r[3]),venue:str(r[4]),goalsFor:positiveInt(r[5]),goalsAgainst:positiveInt(r[6]),competition:str(r[7]),notes:str(r[8]),baselineAbsorbed:one(r[9]),_row:i+2})).filter(x=>x.id);
    const lineups=(l||[]).map((r,i)=>({id:str(r[0]),matchId:str(r[1]),playerId:str(r[2]),called:one(r[3]),played:one(r[4]),goals:positiveInt(r[5]),assists:positiveInt(r[6]),yellow:positiveInt(r[7]),red:positiveInt(r[8]),_row:i+2})).filter(x=>x.id);
    const baseline=(b||[]).map((r,i)=>({seasonId:str(r[0]),playerId:str(r[1]),called:positiveInt(r[2]),played:positiveInt(r[3]),goals:positiveInt(r[4]),assists:positiveInt(r[5]),yellow:positiveInt(r[6]),red:positiveInt(r[7]),_row:i+2})).filter(x=>x.playerId);
    const memberships=(t||[]).map((r,i)=>({seasonId:str(r[0]),playerId:str(r[1]),inRoster:one(r[2]),_row:i+2})).filter(x=>x.playerId);
    return {players,seasons,matches,lineups,baseline,memberships};
  }
  async function refreshData() {
    if(!CFG.spreadsheetId) {state.source='demo';render();return;}
    $('#refresh-btn').disabled=true;
    try {
      const data=editor()?await loadPrivate():await loadPublic();
      state.data=data;state.source='drive';state.lastError='';
      if(!data.seasons.some(s=>s.id===state.seasonId))state.seasonId=(data.seasons.find(s=>/2026\s*\/\s*(?:27|2027)/i.test(s.name))||data.seasons[0]).id;
      render();
    } catch (error) {
      state.lastError=safeError(error);
      // Se erano disponibili dati precedenti da Drive, mantienili senza sostituirli con la demo.
      toast('Errore sincronizzazione: '+state.lastError,true);render();
    } finally{$('#refresh-btn').disabled=false;}
  }
  async function auth() {
    if(editor()) {
      const token=state.token;state.token='';state.sheetIds={};
      try{window.google?.accounts.oauth2.revoke(token,()=>{});}catch(_){}
      await refreshData();toast('Sessione Google disconnessa.');return;
    }
    if(!CFG.googleClientId||!CFG.spreadsheetId){toast('Configura spreadsheetId e googleClientId nel file config.js.',true);navigate('settings');return;}
    if(!window.google?.accounts?.oauth2){toast('Il servizio di accesso Google non è disponibile: verifica la connessione o il blocco popup.',true);return;}
    const client=google.accounts.oauth2.initTokenClient({client_id:CFG.googleClientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:async(response)=>{
      if(response.error||!response.access_token){toast('Accesso Google non riuscito.',true);return;}
      state.token=response.access_token;
      try {
        const meta=await googleAPI('?fields=sheets(properties(sheetId,title))');
        state.sheetIds=Object.fromEntries((meta.sheets||[]).map(s=>[s.properties.title,s.properties.sheetId]));
        if(SHEETS.some(n=>state.sheetIds[n]===undefined))throw new Error('Database Google Sheets non inizializzato: mancano alcune schede.');
        await refreshData();toast('Google connesso. La scrittura è consentita solo a chi ha permessi sul foglio.');
      } catch(error){state.token='';toast(safeError(error),true);render();}
    }});
    client.requestAccessToken({prompt:'select_account'});
  }
  const cell = value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')}});
  const rowCells=values=>({values:values.map(cell)});
  async function appendAtomic(operations) {
    const requests=operations.map(({sheet,rows})=>{
      if(state.sheetIds[sheet]===undefined)throw new Error(`Scheda ${sheet} non trovata.`);
      return {appendCells:{sheetId:state.sheetIds[sheet],rows:rows.map(rowCells),fields:'userEnteredValue'}};
    });
    return googleAPI(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
  }
  async function writeAtomic(ops) {
    const requests=ops.filter(op=>op.rows?.length).map(op=>{
      const sheetId=state.sheetIds[op.sheet];
      if(sheetId===undefined)throw new Error('Scheda '+op.sheet+' mancante. Esegui aggiornaDatabaseV11 in Apps Script.');
      if(op.row) return {updateCells:{start:{sheetId,rowIndex:op.row-1,columnIndex:0},rows:op.rows.map(rowCells),fields:'userEnteredValue'}};
      return {appendCells:{sheetId,rows:op.rows.map(rowCells),fields:'userEnteredValue'}};
    });
    if(!requests.length)return;
    return googleAPI(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
  }
  function baselineRow(b,values) {
    return [b.seasonId,b.playerId,...keys.map(k=>positiveInt(values[k]))];
  }
  async function withBusy(fn) {
    if(state.busy)return;
    state.busy=true;
    document.querySelectorAll('#modal-root button[data-action^="save-"]').forEach(b=>{b.disabled=true;b.textContent='Salvataggio…';});
    try{await fn();closeModal();await refreshData();toast('Dati salvati su Google Drive.');return true;}
    catch(err){toast('Salvataggio non riuscito: '+safeError(err),true);document.querySelectorAll('#modal-root button[data-action^="save-"]').forEach(b=>{b.disabled=false;b.textContent='Riprova salvataggio';});return false;}
    finally{state.busy=false;}
  }
  async function savePlayer(playerId) {
    if(!editor())return;
    const form=$('#player-form');if(!form.reportValidity())return;
    const v=Object.fromEntries(new FormData(form).entries());
    const selected=new Set([...form.querySelectorAll('input[name="membership"]:checked')].map(x=>x.value));
    const number=positiveInt(v.number);
    if(number>999){toast('Numero maglia non valido.',true);return;}
    if(!v.firstName.trim()||!v.lastName.trim()){toast('Nome e cognome obbligatori.',true);return;}
    const duplicate=number===0?null:state.data.players.find(p=>p.id!==playerId&&p.number===number && state.data.seasons.some(season=>selected.has(season.id)&&isMember(p.id,season.id)));
    if(duplicate){toast(`Maglia già assegnata a ${name(duplicate)} in una delle stagioni selezionate.`,true);return;}
    const id=playerId||uid('p');
    const player=state.data.players.find(p=>p.id===playerId);
    const vals=[id,number,v.firstName.trim(),v.lastName.trim(),v.status,v.role.trim(),(v.notes||'').trim()];
    const operations=[{sheet:'Giocatori',...(player?{row:player._row}:{}),rows:[vals]}];
    const newMemberships=[];
    for(const season of state.data.seasons) {
      const old=state.data.memberships.find(r=>r.playerId===id&&r.seasonId===season.id);
      const member=selected.has(season.id)?1:0;
      if(old) {if(old.inRoster!==!!member)operations.push({sheet:'Tesseramenti',row:old._row,rows:[[season.id,id,member]]});}
      else if(member)newMemberships.push([season.id,id,1]);
    }
    if(newMemberships.length)operations.push({sheet:'Tesseramenti',rows:newMemberships});
    await withBusy(()=>writeAtomic(operations));
  }
  async function saveSeason(seasonId='') {
    if(!editor())return;
    const f=$('#season-form');if(!f.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const label=v.name.trim();
    if(state.data.seasons.some(s=>s.id!==seasonId&&s.name.toLocaleLowerCase('it')===label.toLocaleLowerCase('it'))){toast('Esiste già una stagione con questo nome.',true);return;}
    if(v.start&&v.end&&v.end<v.start){toast('La data di fine precede quella di inizio.',true);return;}
    const current=state.data.seasons.find(s=>s.id===seasonId);
    const id=current?.id||uid('s');
    const saved=await withBusy(()=>writeAtomic([{sheet:'Stagioni',...(current?{row:current._row}:{}),rows:[[id,label,v.start,v.end]]}]));
    if(saved){state.seasonId=id;render();}
  }
  async function saveBaseline(playerId) {
    if(!editor())return;
    const f=$('#baseline-form');if(!f.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const sid=state.seasonId;
    const detail=state.data.lineups.filter(l=>l.playerId===playerId&&state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===sid));
    const values={};
    for(const key of keys) {
      const sum=detail.reduce((t,l)=>t+(key==='called'||key==='played'?(one(l[key])?1:0):positiveInt(l[key])),0);
      if(!/^\d+$/.test(v[key])||Number(v[key])<sum||Number(v[key])>9999){toast('Totale non valido per '+key+': minimo '+sum+'.',true);return;}
      values[key]=Number(v[key])-sum;
    }
    if(Number(v.played)>Number(v.called)){toast('Le presenze non possono superare le convocazioni.',true);return;}
    const old=state.data.baseline.find(b=>b.playerId===playerId&&b.seasonId===sid);
    await withBusy(()=>writeAtomic([{sheet:'Pregresso',...(old?{row:old._row}:{}),rows:[[sid,playerId,...keys.map(k=>values[k])]]}]));
  }
  async function importResults() {
    if(!editor())return;
    const checked=checkedImport();
    if(!checked.rows.length){toast('Nessuna nuova partita da importare.',true);return;}
    if(!state.importPreview || JSON.stringify(checked)!==JSON.stringify(state.importPreview)) {previewImport();toast('Controlla l’anteprima aggiornata prima di importare.',true);return;}
    const rows=checked.rows.map(m=>[uid('m'),checked.sid,m.date,m.opponent,m.venue,m.goalsFor,m.goalsAgainst,m.competition,m.notes,0]);
    const ok=await withBusy(()=>writeAtomic([{sheet:'Partite',rows}]));
    if(ok){state.seasonId=checked.sid;state.importPreview=null;navigate('matches');toast('Importate '+rows.length+' partite su Google Drive.');}
  }
  function collectLineup() {
    const rows=[...document.querySelectorAll('#match-form .roster-entry')];
    const all=rows.map(row=>{
      const get=k=>row.querySelector(`[data-line="${k}"]`);
      return {playerId:row.dataset.playerId,called:get('called').checked,played:get('played').checked,
        goals:positiveInt(get('goals').value),assists:positiveInt(get('assists').value),yellow:positiveInt(get('yellow').value),red:positiveInt(get('red').value)};
    });
    if(all.some(l=>(l.played&&!l.called)||(!l.played&&(l.goals||l.assists||l.yellow||l.red))))throw new Error('I giocatori con statistiche devono risultare presenti e convocati.');
    if(all.some(l=>l.yellow>2||l.red>1||l.goals>99||l.assists>99))throw new Error('Valori della distinta fuori limite.');
    return all;
  }
  function emptyLineup(l) {return !l.called&&!l.played&&!l.goals&&!l.assists&&!l.yellow&&!l.red;}
  async function saveMatch() {
    if(!editor())return;
    const f=$('#match-form');if(!f||!f.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const matchId=f.dataset.editId;
    const existing=state.data.matches.find(m=>m.id===matchId);
    if(positiveInt(v.goalsFor)>99||positiveInt(v.goalsAgainst)>99){toast('Punteggio non valido.',true);return;}
    if(state.data.matches.some(m=>m.id!==matchId && matchIdentity(m.seasonId,m)===matchIdentity(v.seasonId,{date:v.date,opponent:v.opponent,venue:v.venue}))){toast('Questa partita è già registrata nella stagione.',true);return;}
    let lineup;
    try {lineup=collectLineup();}catch(error){toast(safeError(error),true);return;}
    const totalGoals=lineup.reduce((t,l)=>t+l.goals,0);
    if(totalGoals>positiveInt(v.goalsFor)){toast('I gol assegnati ai giocatori superano il risultato della squadra.',true);return;}
    const id=existing?.id||uid('m');
    const newAbsorbed=!!f.querySelector('[name="baselineAbsorbed"]:checked');
    const oldAbsorbed=!!existing?.baselineAbsorbed;
    const oldLineups=state.data.lineups.filter(l=>l.matchId===id);
    const oldMap=new Map(oldLineups.map(l=>[l.playerId,l]));
    const operations=[];
    // Se la distinta ricostruisce totali già importati, sposta i valori tra
    // Pregresso e Distinte. Se è una partita nuova, i numeri aumentano normalmente.
    const adjusted=[];
    for(const item of lineup) {
      const old=oldMap.get(item.playerId);
      const historical=state.data.baseline.find(b=>b.seasonId===v.seasonId&&b.playerId===item.playerId);
      const next={};let change=false;
      for(const k of keys) {
        const delta=(oldAbsorbed?lineupStat(old,k):0)-(newAbsorbed?lineupStat(item,k):0);
        next[k]=(historical?.[k]||0)+delta;
        if(delta!==0)change=true;
        if(next[k]<0){const p=state.data.players.find(x=>x.id===item.playerId);toast(`La distinta di ${p?name(p):item.playerId} supera il pregresso residuo (${statLabels[k]}). Deseleziona “già comprese nel pregresso” se sono nuove statistiche, oppure correggi il pregresso.`,true);return;}
      }
      if(change) adjusted.push({sheet:'Pregresso',...(historical?{row:historical._row}:{}),rows:[historical?baselineRow(historical,next):[v.seasonId,item.playerId,...keys.map(k=>next[k])]]});
    }
    // Anche un giocatore rimosso dalla distinta va neutralizzato e, se necessario,
    // restituito al pregresso (le righe storiche non vengono cancellate).
    const newMap=new Map(lineup.map(l=>[l.playerId,l]));
    for(const old of oldLineups) if(!newMap.has(old.playerId)) {
      const oldbase=state.data.baseline.find(b=>b.seasonId===v.seasonId&&b.playerId===old.playerId);
      if(oldAbsorbed)adjusted.push({sheet:'Pregresso',...(oldbase?{row:oldbase._row}:{}),rows:[oldbase?baselineRow(oldbase,Object.fromEntries(keys.map(k=>[k,(oldbase[k]||0)+lineupStat(old,k)]))):[v.seasonId,old.playerId,...keys.map(k=>lineupStat(old,k))]]});
      operations.push({sheet:'Distinte',row:old._row,rows:[[old.id,id,old.playerId,0,0,0,0,0,0]]});
    }
    const matchRow=[id,v.seasonId,v.date,v.opponent.trim(),v.venue,positiveInt(v.goalsFor),positiveInt(v.goalsAgainst),(v.competition||'').trim(),(v.notes||'').trim(),newAbsorbed?1:0];
    operations.unshift({sheet:'Partite',...(existing?{row:existing._row}:{}),rows:[matchRow]});
    for(const l of lineup) {
      const old=oldMap.get(l.playerId);
      if(!old && emptyLineup(l))continue;
      if(old||!emptyLineup(l))operations.push({sheet:'Distinte',...(old?{row:old._row}:{}),rows:[[old?.id||uid('l'),id,l.playerId,l.called?1:0,l.played?1:0,l.goals,l.assists,l.yellow,l.red]]});
    }
    operations.push(...adjusted);
    const saved=await withBusy(()=>writeAtomic(operations));
    if(saved){state.seasonId=v.seasonId;navigate('matches');}
  }
  function updateLineupSummary() {
    const wrap=$('#match-form');if(!wrap)return;
    const rows=[...wrap.querySelectorAll('.roster-entry')];
    let called=0,played=0;
    for(const row of rows){
      const selected=row.querySelector('[data-line="called"]').checked;
      const onField=row.querySelector('[data-line="played"]').checked;
      if(selected)called++;if(onField)played++;
      row.classList.toggle('is-called',selected);
      row.classList.toggle('is-played',onField);
    }
    const text=$('#lineup-summary');if(text)text.textContent=`${called} convocati · ${played} presenze`;
  }
  function rosterToggle(target) {
    const row=target.closest('.roster-entry');if(!row)return;
    const get=k=>row.querySelector(`[data-line="${k}"]`);
    if(target.dataset.line==='played'&&target.checked)get('called').checked=true;
    if(target.dataset.line==='called'&&!target.checked)get('played').checked=false;
    const played=get('played').checked;
    for(const k of ['goals','assists','yellow','red']){get(k).disabled=!played;if(!played)get(k).value='0';}
    updateLineupSummary();
  }
  function bulkCalled(checked) {
    document.querySelectorAll('#match-form .roster-entry').forEach(row=>{
      const called=row.querySelector('[data-line="called"]');called.checked=checked;rosterToggle(called);
    });
    updateLineupSummary();
  }
  function handleClick(event) {
    if(event.target.classList.contains('modal-backdrop')){closeModal();return;}
    const btn=event.target.closest('button,[data-player],[data-match],[data-season]'); if(!btn)return;
    if(btn.dataset.nav){navigate(btn.dataset.nav);return;}
    if(btn.dataset.player){profile(btn.dataset.player);return;}
    if(btn.dataset.match){matchDetail(btn.dataset.match);return;}
    if(btn.dataset.season){state.seasonId=btn.dataset.season;navigate('dashboard');return;}
    const action=btn.dataset.action;
    if(action==='close-modal')closeModal();
    else if(action==='new-player')playerForm();
    else if(action==='edit-player')playerForm(btn.dataset.id);
    else if(action==='new-season')seasonForm();
    else if(action==='edit-season')seasonForm(btn.dataset.id);
    else if(action==='edit-match')editMatchForm(btn.dataset.id);
    else if(action==='edit-baseline')baselineForm(btn.dataset.id);
    else if(action==='save-baseline')saveBaseline(btn.dataset.id);
    else if(action==='import-results')importResultsForm();
    else if(action==='preview-import')previewImport();
    else if(action==='execute-import')importResults().catch(e=>toast(safeError(e),true));
    else if(action==='download-template')downloadTemplate();
    else if(action==='new-match')matchForm();
    else if(action==='save-player')savePlayer(btn.dataset.id);
    else if(action==='save-season')saveSeason(btn.dataset.id);
    else if(action==='save-match')saveMatch();
    else if(action==='mark-all-called')bulkCalled(true);
    else if(action==='clear-all-called')bulkCalled(false);
    else if(action==='export')exportCSV();
  }
  document.addEventListener('click',handleClick);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
  document.addEventListener('change',event=>{
    if(event.target.id==='season-select'){state.seasonId=event.target.value;render();}
    else if(event.target.id==='roster-scope'){state.rosterScope=event.target.value;$('#players-tbody').innerHTML=playersTable();}
    else if(event.target.id==='csv-file'){const file=event.target.files?.[0];if(file){file.text().then(text=>{const target=$('#csv-paste');if(target){target.value=text;state.importPreview=null;$('#execute-import').disabled=true;$('#import-preview').replaceChildren();}}).catch(e=>toast(safeError(e),true));}}
    else if(event.target.id==='import-season'){state.importPreview=null;$('#execute-import').disabled=true;$('#import-preview').replaceChildren();}
    else if(event.target.id==='status-filter'){state.filter=event.target.value;$('#players-tbody').innerHTML=playersTable();}
    else if(event.target.dataset.line){rosterToggle(event.target);}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='csv-paste'){state.importPreview=null;$('#execute-import').disabled=true;$('#import-preview').replaceChildren();}
    if(event.target.id==='player-search'){state.search=event.target.value;$('#players-tbody').innerHTML=playersTable();}
  });
  document.addEventListener('click',event=>{
    const head=event.target.closest('th[data-sort]');if(!head)return;
    const key=head.dataset.sort;
    state.sort.dir=state.sort.key===key?-state.sort.dir:1;
    state.sort.key=key;
    render();
  });
  $('#auth-btn').addEventListener('click',auth);
  $('#refresh-btn').addEventListener('click',refreshData);
  render();
  if(CFG.spreadsheetId) refreshData();
})();
