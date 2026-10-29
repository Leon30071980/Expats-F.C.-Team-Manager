/* EXPATS F.C. TEAM MANAGER — v1.0
 * Frontend statico GitHub Pages + Google Sheets API (edit via OAuth) + GViz JSONP (pubblico).
 * Il controllo delle modifiche dipende dai permessi Google Drive sul foglio.
 */
(() => {
  'use strict';
  const CFG = window.EXPATS_CONFIG;
  const SHEETS = ['Giocatori','Stagioni','Partite','Distinte','Pregresso'];
  const state = {
    data: structuredClone(window.EXPATS_DEMO),
    source: 'demo', view: 'dashboard', seasonId: 's-import',
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
  const activeSeason = () => state.data.seasons.find(s=>s.id===state.seasonId) || state.data.seasons[0];
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
    return { players:st.length, active:st.filter(p=>p.status==='ATTIVO').length,
      injured:st.filter(p=>p.status==='INFORTUNATO').length,
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
      ['GIOCATORI IN ROSA',state.data.players.length,'👥',`${t.active} attivi · ${t.injured} infortunati`,'accent-blue'],
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
      const q=state.search.trim().toLocaleLowerCase('it');
      return (state.filter==='TUTTI'||p.status===state.filter) && (`${name(p)} ${p.number} ${p.role}`.toLocaleLowerCase('it').includes(q));
    });
    const {key,dir}=state.sort;
    list.sort((a,b)=>{
      const av=a[key],bv=b[key];
      return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av||'').localeCompare(String(bv||''),'it'))*dir || name(a).localeCompare(name(b),'it');
    });
    return list;
  }
  function playersTable() {
    const rows=playerRows();
    if(!rows.length)return `<tr><td colspan="10">${empty('🔎','Nessun giocatore trovato')}</td></tr>`;
    return rows.map(p=>`<tr class="clickable" data-player="${esc(p.id)}" title="Dettaglio ${esc(name(p))}"><td><span class="jersey">${esc(p.number)}</span></td><td class="col-name">${esc(name(p))}</td><td>${esc(p.role||'—')}</td><td>${statusBadge(p.status)}</td><td class="num">${p.called}</td><td class="num">${p.played}<span class="tiny-bar"><i style="width:${p.called?Math.min(100,100*p.played/p.called):0}%"></i></span></td><td class="num accent-green">${p.goals}</td><td class="num accent-blue">${p.assists}</td><td class="num accent-yellow">${p.yellow}</td><td class="num accent-red">${p.red}</td></tr>`).join('');
  }
  function renderPlayers() {
    return intro('ROSA UFFICIALE','I nostri giocatori','Anagrafica, disponibilità e rendimento individuale.',`<button class="btn btn-secondary" data-action="export">↓ Esporta CSV</button><button class="btn btn-primary only-editor" data-action="new-player">＋ Nuovo giocatore</button>`)+banner()+
      `<div class="toolbar"><input id="player-search" class="search" type="search" placeholder="Cerca per nome, numero o ruolo..." value="${esc(state.search)}" aria-label="Cerca giocatore"><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="TUTTI" ${state.filter==='TUTTI'?'selected':''}>Tutti gli stati</option>${['ATTIVO','INFORTUNATO','RITIRATO'].map(x=>`<option value="${x}" ${state.filter===x?'selected':''}>${statusText(x)}</option>`).join('')}</select></div>
      <div class="table-shell"><table class="data-table"><thead><tr>${[['number','#'],['firstName','Giocatore'],['role','Ruolo'],['status','Stato'],['called','Conv.'],['played','Pres.'],['goals','Gol'],['assists','Assist'],['yellow','Gialli'],['red','Rossi']].map(([k,label])=>`<th class="sortable" data-sort="${k}">${label}${state.sort.key===k?(state.sort.dir===1?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody id="players-tbody">${playersTable()}</tbody></table></div><p class="notice">Seleziona un giocatore per vedere il profilo e, con autorizzazione Google, aggiornarne i dati.</p>`;
  }
  const matchLine = m=>`<div class="result-line clickable" data-match="${esc(m.id)}"><div><div class="opponent">Expats F.C. <span class="muted">vs</span> ${esc(m.opponent)}</div><div class="meta">${localeDate(m.date)} · ${esc(m.venue==='T'?'Trasferta':'Casa')} · ${esc(m.competition||'Campionato')}</div></div><div class="results-head"><span class="chip ${matchResult(m)==='W'?'success':matchResult(m)==='D'?'warning':'danger'}">${resultLabel(matchResult(m))}</span><span class="score">${m.goalsFor} : ${m.goalsAgainst}</span></div></div>`;
  function renderMatches() {
    const s=activeSeason(), matches=seasonMatches(s.id),t=seasonTotals(s.id);
    return intro('CALENDARIO E RISULTATI','Partite della stagione',`Risultati e distinte archiviate · ${s.name}`,newMatchButton())+banner()+
      `<div class="stats-grid">${[['GIOCATE',t.matches,'🏟','Partite archiviate','accent-blue'],['VITTORIE',t.win,'🏆','Risultati vincenti','accent-green'],['PAREGGI',t.draw,'🤝','Partite in parità','accent-yellow'],['SCONFITTE',t.loss,'📉','Partite perse','accent-red']].map(([lab,val,icon,foot,color])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-card-label">${lab}</div><div class="stat-value ${color}">${val}</div><div class="stat-foot">${foot}</div></div>`).join('')}</div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">Elenco incontri</h2><span class="panel-caption">${matches.length} partite registrate</span></div>${matches.length?matches.map(matchLine).join(''):empty('⚽','Non sono ancora state registrate partite','Le nuove partite incrementeranno automaticamente presenze, convocazioni e statistiche.')}</div>`;
  }
  function renderRankings() {
    const s=activeSeason(), st=statsForSeason(s.id);
    const sections=[['⚽ Marcatori','goals','Reti segnate'],['🎯 Assist','assists','Passaggi decisivi'],['📋 Convocazioni','called','Chiamate in squadra'],['👟 Presenze','played','Partite disputate'],['🟨 Cartellini gialli','yellow','Ammonizioni'],['🟥 Cartellini rossi','red','Espulsioni']];
    return intro('RECORD INDIVIDUALI','Classifiche giocatori',`I protagonisti della ${s.name.toLowerCase()}.`)+banner()+`<div class="panel-grid">${sections.map(([title,key,desc])=>`<div class="panel"><div class="panel-heading"><div><h2 class="panel-title">${title}</h2><span class="panel-caption">${desc}</span></div></div>${bars(byKey(st,key).filter(p=>p[key]>0).slice(0,8),key,key==='assists'||key==='played')}</div>`).join('')}</div>`;
  }
  function renderSeasons() {
    const seasons=[...state.data.seasons].reverse();
    return intro('ALBO STAGIONALE','Archivio stagioni','Ogni stagione conserva statistiche e risultati separati.',`<button class="btn btn-primary only-editor" data-action="new-season">＋ Nuova stagione</button>`)+banner()+
      `<div class="season-grid">${seasons.map(s=>{const t=seasonTotals(s.id);return `<div class="season-card"><div class="eyebrow">STAGIONE</div><h3>${esc(s.name)}</h3><p>${s.start?localeDate(s.start):'Inizio da definire'} ${s.end?`— ${localeDate(s.end)}`:''}</p><div class="mini-summary"><div><strong>${t.matches}</strong><span>Partite</span></div><div><strong>${t.goals}</strong><span>Gol singoli</span></div><div><strong>${t.assists}</strong><span>Assist</span></div></div><div class="season-bottom mt-20"><span class="chip ${s.id===state.seasonId?'success':'neutral'}">${s.id===state.seasonId?'Selezionata':'Archiviata'}</span><button class="btn btn-secondary btn-small" data-season="${esc(s.id)}">Visualizza stagione</button></div></div>`}).join('')}</div><p class="notice mt-20">La rosa è condivisa fra stagioni; convocazioni, presenze, gol, assist e cartellini sono conteggiati per stagione. Per giocatori ritirati, lo stato attuale viene mantenuto nell'anagrafica.</p>`;
  }
  function renderSettings() {
    return intro('CONNESSIONE E DATI','Configurazione','Gestione del collegamento con il foglio Google e stato del progetto.')+banner()+
    `<div class="two-cards"><div class="panel"><div class="panel-heading"><h2 class="panel-title">🔐 Stato connessione</h2></div><div class="breakdown"><div><span>Versione applicazione</span><strong>v1.0</strong></div><div><span>Origine dati</span><strong>${state.source==='drive'?'Google Drive':'Demo locale'}</strong></div><div><span>Modalità</span><strong>${editor()?'Google OAuth attivo':'Sola consultazione'}</strong></div><div><span>Archivio</span><strong>${CFG.spreadsheetId?'Configurato':'Da configurare'}</strong></div></div><p class="notice">Le autorizzazioni di scrittura non sono affidate al sito GitHub: le controlla Google tramite i permessi del foglio.</p></div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">📂 Dove sono salvati i dati?</h2></div><p class="form-guide">Tutte le informazioni sono conservate in un unico Google Sheets nel tuo Drive, diviso in 5 schede.</p><div class="breakdown">${SHEETS.map(s=>`<div><span>${esc(s)}</span><strong>Google Sheets</strong></div>`).join('')}</div>${CFG.spreadsheetId?`<p><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(CFG.spreadsheetId)}/edit">Apri archivio Google Sheets ↗</a></p>`:''}</div></div>
    <div class="panel mt-20"><div class="panel-heading"><h2 class="panel-title">🚀 Messa online</h2></div><div class="two-cards"><div class="info-step"><h3>1. Crea l'archivio su Google Drive</h3><p>Nuovo Foglio Google → Estensioni → Apps Script. Incolla il file <strong>setup.gs</strong> fornito nel pacchetto ed esegui <strong>inizializzaDatabase()</strong>.</p></div><div class="info-step"><h3>2. Collega app e Google</h3><p>Attiva Google Sheets API su Google Cloud, crea un ID client OAuth di tipo applicazione web e aggiungi l'origine JavaScript del tuo GitHub Pages.</p></div><div class="info-step"><h3>3. Imposta il file config.js</h3><p>Inserisci spreadsheetId e googleClientId. Poi condividi il foglio in lettura con chi possiede il link e conserva i permessi di modifica solo per i gestori.</p></div><div class="info-step"><h3>4. Pubblica con GitHub Pages</h3><p>Carica i file nel repository, abilita GitHub Pages e accedi al link pubblico. Prima di pubblicare dati nominativi, verifica il consenso della squadra.</p></div></div><p class="notice mt-20">Per tutte le istruzioni operative, vedere il file LEGGIMI.md incluso nel progetto.</p></div>`;
  }
  function render() {
    if(!state.data.seasons.some(s=>s.id===state.seasonId)) state.seasonId=state.data.seasons[0]?.id||'';
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
    const body=`<div class="profile-hero"><div class="player-portrait">${esc(p.number)}</div><div><div class="eyebrow">SCHEDA GIOCATORE</div><h3 class="profile-title">${esc(name(p))}</h3>${statusBadge(p.status)} <span class="chip">${esc(p.role||'Ruolo da definire')}</span></div></div><div class="profile-stats">${[['Convocazioni',p.called],['Presenze',p.played],['Gol',p.goals],['Assist',p.assists],['Gialli',p.yellow],['Rossi',p.red]].map(([label,n])=>`<div><strong>${n}</strong><small>${label}</small></div>`).join('')}</div>${p.notes?`<p class="form-guide">${esc(p.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Statistiche registrate per partita</h3>${played.length?played.map(l=>{const m=state.data.matches.find(m=>m.id===l.matchId);return `<div class="result-line"><span>${esc(m?.opponent)} · ${localeDate(m?.date)}</span><span>⚽ ${positiveInt(l.goals)} · 🎯 ${positiveInt(l.assists)}</span></div>`}).join(''):'<p class="form-guide">Le statistiche pregresse sono aggregate; non è disponibile il dettaglio delle vecchie partite.</p>'}`;
    modal(name(p),body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-primary only-editor" data-action="edit-player" data-id="${esc(p.id)}">Modifica giocatore</button>`);
  }
  function playerForm(playerId='') {
    if(!editor()) {toast('Accedi con Google per modificare i dati.',true);return;}
    const p=state.data.players.find(p=>p.id===playerId);
    const f=(key,label,type='text',required=false,values='')=>`<div class="field"><label for="p-${key}">${label}</label>${values?`<select class="form-control" name="${key}" id="p-${key}">${values.split('|').map(x=>`<option value="${esc(x)}" ${p?.[key]===x?'selected':''}>${esc(statusText(x))}</option>`).join('')}</select>`:`<input class="form-control" name="${key}" id="p-${key}" type="${type}" value="${esc(p?.[key]??'')}" ${required?'required':''} ${type==='number'?'min="0" max="999" step="1"':''}>`}</div>`;
    const body=`<form id="player-form"><div class="field-grid">${f('number','Numero maglia','number',true)}${f('role','Ruolo')}${f('firstName','Nome','text',true)}${f('lastName','Cognome','text',true)}${f('status','Stato','text',false,'ATTIVO|INFORTUNATO|RITIRATO')}<div class="field full"><label for="p-notes">Note</label><textarea class="form-control" id="p-notes" name="notes" rows="3">${esc(p?.notes||'')}</textarea></div></div></form>`;
    modal(p?'Modifica giocatore':'Aggiungi giocatore',body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-player" data-id="${esc(p?.id||'')}">Salva su Drive</button>`);
  }
  function seasonForm() {
    if(!editor()){toast('Accedi con Google per aggiungere una stagione.',true);return;}
    const body=`<form id="season-form"><div class="field-grid"><div class="field full"><label>Nome stagione *</label><input class="form-control" name="name" required placeholder="Es. 2026/2027" maxlength="70"></div><div class="field"><label>Data inizio (facoltativa)</label><input class="form-control" type="date" name="start"></div><div class="field"><label>Data fine (facoltativa)</label><input class="form-control" type="date" name="end"></div></div></form>`;
    modal('Nuova stagione',body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-season">Crea stagione</button>`);
  }
  function matchForm() {
    if(!editor()){toast('Accedi con Google per registrare una partita.',true);return;}
    const players=[...state.data.players].filter(p=>p.status!=='RITIRATO').sort((a,b)=>num(a.number)-num(b.number));
    const roster=`<div class="roster-form"><div class="roster-header"><span style="text-align:left">GIOCATORE</span><span>CONV.</span><span>PRES.</span><span>GOL</span><span>ASSIST</span><span>🟨</span><span>🟥</span></div>${players.map(p=>`<div class="roster-entry" data-player-id="${esc(p.id)}"><span class="player-label">#${esc(p.number)} ${esc(name(p))}${p.status==='INFORTUNATO'?'<small> · INFORTUNATO</small>':''}</span><input type="checkbox" data-line="called" aria-label="Convocato ${esc(name(p))}"><input type="checkbox" data-line="played" aria-label="Presenza ${esc(name(p))}">${['goals','assists','yellow','red'].map(k=>`<input type="number" data-line="${k}" value="0" min="0" max="99" step="1" disabled aria-label="${k} ${esc(name(p))}">`).join('')}</div>`).join('')}</div>`;
    const body=`<form id="match-form"><div class="field-grid"><div class="field"><label>Data partita *</label><input class="form-control" type="date" name="date" required value="${new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0')}"></div><div class="field"><label>Stagione *</label><select class="form-control" name="seasonId">${state.data.seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===state.seasonId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field full"><label>Avversario *</label><input class="form-control" name="opponent" required maxlength="120" placeholder="Nome squadra avversaria"></div><div class="field"><label>Campo</label><select class="form-control" name="venue"><option value="C">Casa</option><option value="T">Trasferta</option></select></div><div class="field"><label>Competizione</label><input class="form-control" name="competition" placeholder="Campionato" maxlength="100"></div><div class="field"><label>Gol Expats F.C. *</label><input class="form-control" type="number" name="goalsFor" min="0" max="99" step="1" value="0" required></div><div class="field"><label>Gol avversario *</label><input class="form-control" type="number" name="goalsAgainst" min="0" max="99" step="1" value="0" required></div><div class="field full"><label>Note partita</label><textarea class="form-control" name="notes" rows="2" maxlength="1000"></textarea></div><div class="field full"><label>Distinta giocatori</label><small>Conv. = convocato; Pres. = entrato in campo. Spunta Pres. per abilitare gol, assist e cartellini. Le presenze sono comprese nelle convocazioni.</small>${roster}</div></div></form>`;
    modal('Registra nuova partita',body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-match">Salva partita e distinta</button>`,true);
  }
  function matchDetail(id) {
    const m=state.data.matches.find(m=>m.id===id);if(!m)return;
    const lines=state.data.lineups.filter(l=>l.matchId===id).sort((a,b)=>num(state.data.players.find(p=>p.id===a.playerId)?.number)-num(state.data.players.find(p=>p.id===b.playerId)?.number));
    const body=`<div class="eyebrow">${localeDate(m.date)} · ${esc(m.competition||'Partita')}</div><h3 class="page-title" style="font-size:27px">Expats F.C. <span class="accent-green">${m.goalsFor} — ${m.goalsAgainst}</span> ${esc(m.opponent)}</h3><p class="page-subtitle">${m.venue==='T'?'Trasferta':'Casa'} · ${resultLabel(matchResult(m))}</p>${m.notes?`<p class="modal-explainer">${esc(m.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Distinta e statistiche</h3><div class="table-shell mt-20"><table class="data-table" style="min-width:560px"><thead><tr><th>Giocatore</th><th>Conv.</th><th>Pres.</th><th>Gol</th><th>Assist</th><th>Gialli</th><th>Rossi</th></tr></thead><tbody>${lines.map(l=>{const p=state.data.players.find(p=>p.id===l.playerId);return `<tr><td>${esc(p?name(p):'Giocatore non trovato')}</td><td>${one(l.called)?'✓':'—'}</td><td>${one(l.played)?'✓':'—'}</td><td>${positiveInt(l.goals)}</td><td>${positiveInt(l.assists)}</td><td>${positiveInt(l.yellow)}</td><td>${positiveInt(l.red)}</td></tr>`}).join('')}</tbody></table></div>${!lines.length?'<p class="form-guide">Nessuna distinta presente per questa partita.</p>':''}`;
    modal(`Partita contro ${m.opponent}`,body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button>`,true);
  }
  function exportCSV() {
    const fields=['number','firstName','lastName','status','role','called','played','goals','assists','yellow','red'];
    const labels=['Maglia','Nome','Cognome','Stato','Ruolo','Convocazioni','Presenze','Gol','Assist','Gialli','Rossi'];
    const escapeCSV = (v) => {
      let s=String(v ?? '');
      // Evita l'iniezione di formule nei programmi di calcolo.
      if (/^[\s]*[=+@\-\t\r]/.test(s) && isNaN(Number(s))) s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const rows=[labels,...statsForSeason(state.seasonId).map(p=>fields.map(k=>p[k]))];
    const csv='\ufeff'+rows.map(row=>row.map(escapeCSV).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:`expats-fc-${state.seasonId}-v1.0.csv`});
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
    const [p,s,m,l,b]=arrays;
    const trimmed=rows=>(rows||[]).filter(row=>row?.some(x=>String(x??'').trim()!==''));
    const str=x=>String(x??'').trim();
    const players=trimmed(p).map((r,i)=>({id:str(r[0]),number:num(r[1]),firstName:str(r[2]),lastName:str(r[3]),status:str(r[4])||'ATTIVO',role:str(r[5]),notes:str(r[6]),_row:i+2})).filter(x=>x.id);
    const seasons=trimmed(s).map(r=>({id:str(r[0]),name:str(r[1]),start:padDate(r[2]),end:padDate(r[3])})).filter(x=>x.id);
    if(!seasons.length)throw new Error('Il foglio Stagioni è vuoto. Esegui inizializzaDatabase() e importa almeno una stagione.');
    const matches=trimmed(m).map(r=>({id:str(r[0]),seasonId:str(r[1]),date:padDate(r[2]),opponent:str(r[3]),venue:str(r[4]),goalsFor:positiveInt(r[5]),goalsAgainst:positiveInt(r[6]),competition:str(r[7]),notes:str(r[8])})).filter(x=>x.id);
    const lineups=trimmed(l).map(r=>({id:str(r[0]),matchId:str(r[1]),playerId:str(r[2]),called:one(r[3]),played:one(r[4]),goals:positiveInt(r[5]),assists:positiveInt(r[6]),yellow:positiveInt(r[7]),red:positiveInt(r[8])})).filter(x=>x.id);
    const baseline=trimmed(b).map(r=>({seasonId:str(r[0]),playerId:str(r[1]),called:positiveInt(r[2]),played:positiveInt(r[3]),goals:positiveInt(r[4]),assists:positiveInt(r[5]),yellow:positiveInt(r[6]),red:positiveInt(r[7])})).filter(x=>x.playerId);
    return {players,seasons,matches,lineups,baseline};
  }
  async function refreshData() {
    if(!CFG.spreadsheetId) {state.source='demo';render();return;}
    $('#refresh-btn').disabled=true;
    try {
      const data=editor()?await loadPrivate():await loadPublic();
      state.data=data;state.source='drive';state.lastError='';
      if(!data.seasons.some(s=>s.id===state.seasonId))state.seasonId=data.seasons[0].id;
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
    const number=positiveInt(v.number);
    if(number>999){toast('Numero maglia non valido.',true);return;}
    const duplicate=state.data.players.find(p=>p.id!==playerId&&p.number===number&&p.status!=='RITIRATO'&&v.status!=='RITIRATO');
    if(duplicate){toast(`Maglia già assegnata a ${name(duplicate)}.`,true);return;}
    await withBusy(async()=>{
      const values=[playerId||uid('p'),number,v.firstName.trim(),v.lastName.trim(),v.status,v.role.trim(),(v.notes||'').trim()];
      if(playerId) {
        const p=state.data.players.find(p=>p.id===playerId); if(!p?._row)throw new Error('Riga del giocatore non individuata. Aggiorna i dati.');
        await googleAPI(`/values/${encodeURIComponent(`'Giocatori'!A${p._row}:G${p._row}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({range:`'Giocatori'!A${p._row}:G${p._row}`,majorDimension:'ROWS',values:[values]})});
      } else await appendAtomic([{sheet:'Giocatori',rows:[values]}]);
    });
  }
  async function saveSeason() {
    if(!editor())return;
    const f=$('#season-form');if(!f.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const label=v.name.trim();
    if(state.data.seasons.some(s=>s.name.toLocaleLowerCase('it')===label.toLocaleLowerCase('it'))){toast('Esiste già una stagione con questo nome.',true);return;}
    if(v.start&&v.end&&v.end<v.start){toast('La data di fine precede quella di inizio.',true);return;}
    const id=uid('s');
    const saved=await withBusy(async()=>appendAtomic([{sheet:'Stagioni',rows:[[id,label,v.start,v.end]]}]));
    if(saved){state.seasonId=id;render();}
  }
  async function saveMatch() {
    if(!editor())return;
    const f=$('#match-form');if(!f.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    if(positiveInt(v.goalsFor)>99||positiveInt(v.goalsAgainst)>99){toast('Punteggio non valido.',true);return;}
    const rows=[...document.querySelectorAll('.roster-entry')];
    const extracted=rows.map(row=>{
      const get=k=>row.querySelector(`[data-line="${k}"]`);
      const called=get('called').checked,played=get('played').checked;
      return {playerId:row.dataset.playerId,called,played,goals:positiveInt(get('goals').value),assists:positiveInt(get('assists').value),yellow:positiveInt(get('yellow').value),red:positiveInt(get('red').value)};
    }).filter(l=>l.called||l.played||l.goals||l.assists||l.yellow||l.red);
    if(extracted.some(l=>(l.played&&!l.called)||(!l.played&&(l.goals||l.assists||l.yellow||l.red)))){toast('Per segnare statistiche, un giocatore deve risultare presente e convocato.',true);return;}
    const sumGoals=extracted.reduce((t,l)=>t+l.goals,0);
    if(sumGoals>positiveInt(v.goalsFor)){toast('I gol attribuiti ai giocatori superano quelli segnati dalla squadra.',true);return;}
    const id=uid('m');
    const saved=await withBusy(async()=>appendAtomic([
      {sheet:'Partite',rows:[[id,v.seasonId,v.date,v.opponent.trim(),v.venue,positiveInt(v.goalsFor),positiveInt(v.goalsAgainst),v.competition.trim(),(v.notes||'').trim()]]},
      ...(extracted.length?[{sheet:'Distinte',rows:extracted.map(l=>[uid('l'),id,l.playerId,l.called?1:0,l.played?1:0,l.goals,l.assists,l.yellow,l.red])}]:[])
    ]));
    if(saved){state.seasonId=v.seasonId;render();}
  }
  function rosterToggle(target) {
    const row=target.closest('.roster-entry');if(!row)return;
    const get=k=>row.querySelector(`[data-line="${k}"]`);
    if(target.dataset.line==='played'&&target.checked)get('called').checked=true;
    if(target.dataset.line==='called'&&!target.checked)get('played').checked=false;
    const played=get('played').checked;
    for(const k of ['goals','assists','yellow','red']){
      get(k).disabled=!played;if(!played)get(k).value='0';
    }
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
    else if(action==='new-match')matchForm();
    else if(action==='save-player')savePlayer(btn.dataset.id);
    else if(action==='save-season')saveSeason();
    else if(action==='save-match')saveMatch();
    else if(action==='export')exportCSV();
  }
  document.addEventListener('click',handleClick);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
  document.addEventListener('change',event=>{
    if(event.target.id==='season-select'){state.seasonId=event.target.value;render();}
    else if(event.target.id==='status-filter'){state.filter=event.target.value;$('#players-tbody').innerHTML=playersTable();}
    else if(event.target.dataset.line){rosterToggle(event.target);}
  });
  document.addEventListener('input',event=>{
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
