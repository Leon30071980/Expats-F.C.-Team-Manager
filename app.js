/* EXPATS F.C. TEAM MANAGER — v1.3
 * Frontend statico GitHub Pages + Google Sheets API (edit via OAuth) + GViz JSONP (pubblico).
 * Il controllo delle modifiche dipende dai permessi Google Drive sul foglio.
 */
(() => {
  'use strict';
  const CFG = window.EXPATS_CONFIG;
  const SHEETS = ['Giocatori','Stagioni','Partite','Distinte','Pregresso','Tesseramenti','Ruoli','Stati'];
  const VERSION='v1.3';
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
  const legacyStates=[{id:'ATTIVO',name:'Attivo',color:'#35c986',active:true},{id:'INFORTUNATO',name:'Infortunato',color:'#f2b84e',active:true},{id:'RITIRATO',name:'Ritirato',color:'#8898ad',active:true}];
  const legacyRoles=['Portiere','Difensore','Centrale','Terzino','Esterno','Centrocampista','Mediano','Trequartista','Attaccante','Punta','Jolly'].map((name,i)=>({id:'r_'+i,name,type:i===0?'PORTIERE':'MOVIMENTO',active:true}));
  const availableRoles=()=>state.data.roles.filter(r=>r.active);
  const availableStates=()=>state.data.states.filter(r=>r.active);
  const isKeeper=p=>{if(!p)return false;const r=state.data.roles.find(r=>r.name===p.role);return r?r.type==='PORTIERE':p.role==='Portiere';};
  const statusInfo=id=>state.data.states.find(x=>x.id===id)||legacyStates.find(x=>x.id===id)||{name:id,color:'#8898ad'};
  const statusText=s=>statusInfo(s).name;
  const safeColor=c=>/^#[0-9a-f]{6}$/i.test(String(c))?c:'#8898ad';
  const readableText=hex=>{const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return a[0]*.2126+a[1]*.7152+a[2]*.0722>145?'#102339':'#ffffff';};
  const statusBadge=s=>{const c=safeColor(statusInfo(s).color);return `<span class="chip status-pill" style="background:${c};color:${readableText(c)}">${esc(statusText(s))}</span>`;};
  const dropdown=(kind,selected,id)=>{
    const rows=kind==='role'?availableRoles():availableStates();
    const items=kind==='role'?rows.map(r=>({key:r.name,label:r.name})):rows.map(r=>({key:r.id,label:r.name}));
    if(selected && !items.some(o=>o.key===selected))items.push({key:selected,label:kind==='role'?selected:statusText(selected)});
    const c=kind==='status'?safeColor(statusInfo(selected).color):null;
    return `<select class="inline-select" ${c?`style="background:${c};color:${readableText(c)}"`:''} data-inline="${kind}" data-id="${esc(id)}" aria-label="Modifica ${kind==='role'?'ruolo':'stato'}" ${state.busy?'disabled':''}><option value="" ${!selected?'selected':''}>—</option>${items.map(o=>`<option value="${esc(o.key)}" ${o.key===selected?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
  };
  const keys = ['called','played','goals','assists','yellow','red'];
  const statLabels={called:'Convocazioni',played:'Presenze',goals:'Gol',assists:'Assist',yellow:'Gialli',red:'Rossi'};

  const jersey = (number,large=false) => `<span class="shirt-wrap ${large?'shirt-large':''}" aria-label="Maglia numero ${esc(number)}"><svg class="shirt-svg" viewBox="0 0 64 68" aria-hidden="true"><path d="M23 5h18l6 8 14 9-9 17-8-4v29H20V35l-8 4L3 22l14-9z" fill="#62b8ff" stroke="#d6ecff" stroke-width="2.2" stroke-linejoin="round"/><path d="M24 5q8 12 16 0" stroke="#2e78c3" stroke-width="3" fill="none"/><path d="M20 37v25M44 37v25" stroke="#368fdf" stroke-width="1" opacity=".6"/></svg><span class="shirt-number">${esc(number)}</span></span>`;
  const lineupStat=(l,key,playerId)=>key==='called'||key==='played'?(one(l?.[key])?1:0):key==='goals'?(isKeeper(state.data.players.find(p=>p.id===playerId))?-Math.abs(Math.trunc(num(l?.goals))):positiveInt(l?.goals)):positiveInt(l?.[key]);
  const seasonIsHistorical=(sid)=>{const s=state.data.seasons.find(s=>s.id===sid);return !!s && !!s.end && s.end < new Date().toISOString().slice(0,10);};

  const sheetRange = sheet => `'${sheet.replace(/'/g,"''")}'!A:Z`;
  function statsForSeason(seasonId) {
    const map = new Map(state.data.players.map(p => [p.id,{...p,called:0,played:0,goals:0,assists:0,yellow:0,red:0}]));
    for (const b of state.data.baseline) if (b.seasonId===seasonId && map.has(b.playerId)) {
      const s=map.get(b.playerId); for(const k of keys) s[k] += k==='goals' && isKeeper(s) ? -Math.abs(Math.trunc(num(b[k]))) : positiveInt(b[k]);
    }
    const validMatches = new Set(state.data.matches.filter(m=>m.seasonId===seasonId).map(m=>m.id));
    for(const lineup of state.data.lineups) if (validMatches.has(lineup.matchId) && map.has(lineup.playerId)) {
      const s=map.get(lineup.playerId);
      s.called += one(lineup.called)?1:0;
      s.played += one(lineup.played)?1:0;
      for (const k of ['goals','assists','yellow','red']) s[k] += lineupStat(lineup,k,lineup.playerId);
    }
    return [...map.values()];
  }
  const byKey = (items,key) => [...items].sort((a,b) => num(b[key])-num(a[key]) || name(a).localeCompare(name(b),'it'));
  function seasonTotals(id) {
    const st=statsForSeason(id);const matches=seasonMatches(id);
    return { players:playersInSeason(id).length, active:playersInSeason(id).filter(p=>p.status==='ATTIVO').length,
      injured:playersInSeason(id).filter(p=>p.status==='INFORTUNATO').length,
      called:st.reduce((t,p)=>t+p.called,0), played:st.reduce((t,p)=>t+p.played,0),
      goals:st.reduce((t,p)=>t+(isKeeper(p)?0:positiveInt(p.goals)),0),assists:st.reduce((t,p)=>t+p.assists,0),
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
      `<div class="stats-grid">${kpi.map(card).join('')}</div><div class="panel-grid"><div class="panel"><div class="panel-heading"><div><h2 class="panel-title">⚽ Classifica marcatori</h2><span class="panel-caption">I migliori realizzatori della stagione</span></div><button class="link-btn" data-nav="rankings">Classifiche complete →</button></div>${bars(byKey(leaders,'goals').filter(p=>!isKeeper(p)&&p.goals>0).slice(0,6),'goals')}</div>
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
    if(!rows.length)return `<tr><td colspan="13">${empty('🔎','Nessun giocatore trovato')}</td></tr>`;
    const maximum=Object.fromEntries(keys.map(k=>[k,Math.max(1,...rows.filter(r=>k!=='goals'||!isKeeper(r)).map(r=>positiveInt(r[k])))]));
    const metric=(p,k)=>{
      const keeperGoals=k==='goals'&&isKeeper(p);
      const v=keeperGoals?(-Math.abs(Math.trunc(num(p[k])))||0):positiveInt(p[k]);
      return `<td class="metric-cell metric-${k} ${keeperGoals?'keeper-goals':''}" title="${keeperGoals?'Gol subiti dal portiere':'Statistica stagionale'}"><div class="metric-value">${v}</div>${keeperGoals?'':`<div class="metric-track"><span style="width:${Math.min(100,Math.round(100*v/maximum[k]))}%"></span></div>`}</td>`;
    };
    return rows.map((p,i)=>`<tr class="clickable" data-player="${esc(p.id)}" title="Dettaglio ${esc(name(p))}"><td class="row-index">${i+1}</td><td class="col-shirt">${jersey(p.number)}</td><td class="col-name">${esc(p.firstName)}</td><td class="col-name">${esc(p.lastName)}</td><td class="inline-cell">${editor()?dropdown('role',p.role,p.id):esc(p.role||'—')}</td><td class="inline-cell">${editor()?dropdown('status',p.status,p.id):statusBadge(p.status)}</td><td class="num season-num">${seasonsPlayed(p.id)}</td>${keys.map(k=>metric(p,k)).join('')}</tr>`).join('');
  }
  function renderPlayers() {
    return intro('ROSA UFFICIALE','I nostri giocatori','Nome e cognome separati, maglia azzurra, ruolo e stato modificabili dalla tabella.',`<button class="btn btn-secondary" data-action="export">↓ Esporta CSV</button><button class="btn btn-primary only-editor" data-action="new-player">＋ Nuovo giocatore</button>`)+banner()+
      `<div class="toolbar"><button class="btn btn-secondary only-editor" data-action="manage-roles">⚙ Ruoli</button><button class="btn btn-secondary only-editor" data-action="manage-states">🎨 Stati e colori</button><select id="roster-scope" class="filter-select" aria-label="Rosa della stagione"><option value="season" ${state.rosterScope==='season'?'selected':''}>Rosa stagione</option><option value="all" ${state.rosterScope==='all'?'selected':''}>Tutti i giocatori</option></select><input id="player-search" class="search" type="search" placeholder="Cerca per nome, maglia o ruolo..." value="${esc(state.search)}" aria-label="Cerca giocatore"><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="TUTTI" ${state.filter==='TUTTI'?'selected':''}>Tutti gli stati</option>${availableStates().map(item=>{const x=item.id;return `<option value="${x}" ${state.filter===x?'selected':''}>${statusText(x)}</option>`}).join('')}</select></div>
      <div class="table-shell"><table class="data-table roster-table"><thead><tr><th class="col-count" title="Numerazione progressiva delle righe visualizzate">N°</th><th class="sortable" data-sort="number" title="Numero di maglia">Maglia${state.sort.key==='number'?(state.sort.dir===1?' ↑':' ↓'):''}</th>${[['firstName','Nome'],['lastName','Cognome'],['role','Ruolo'],['status','Stato'],['seasons','Stagioni'],['called','Conv.'],['played','Pres.'],['goals','Gol'],['assists','Assist'],['yellow','Gialli'],['red','Rossi']].map(([k,label])=>`<th class="sortable" data-sort="${k}">${label}${state.sort.key===k?(state.sort.dir===1?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody id="players-tbody">${playersTable()}</tbody></table></div><p class="notice">N° = posizione progressiva nella tabella · Maglia = numero scelto dal giocatore. Le barre confrontano i valori della stessa colonna nella rosa visualizzata. I gol negativi del portiere indicano reti subite e non hanno barra. Clicca su Ruolo o Stato per modificare direttamente la rosa.</p>`;
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
    return intro('RECORD INDIVIDUALI','Classifiche giocatori',`I protagonisti della ${s.name.toLowerCase()}.`)+banner()+`<div class="panel-grid">${sections.map(([title,key,desc])=>`<div class="panel"><div class="panel-heading"><div><h2 class="panel-title">${title}</h2><span class="panel-caption">${desc}</span></div></div>${bars(byKey(st,key).filter(p=>p[key]>0 && (key!=='goals'||!isKeeper(p))).slice(0,8),key,key==='assists'||key==='played')}</div>`).join('')}</div>`;
  }
  function renderSeasons() {
    const seasons=[...state.data.seasons].sort((a,b)=>String(b.start||b.name).localeCompare(String(a.start||a.name)));
    return intro('ALBO STAGIONALE','Archivio stagioni','Ogni stagione conserva statistiche e risultati separati.',`<button class="btn btn-primary only-editor" data-action="new-season">＋ Nuova stagione</button>`)+banner()+
      `<div class="season-grid">${seasons.map(s=>{const t=seasonTotals(s.id);return `<div class="season-card"><div class="eyebrow">STAGIONE</div><h3>${esc(s.name)}</h3><p>${s.start?localeDate(s.start):'Inizio da definire'} ${s.end?`— ${localeDate(s.end)}`:''}</p><div class="mini-summary"><div><strong>${t.matches}</strong><span>Partite</span></div><div><strong>${t.goals}</strong><span>Gol singoli</span></div><div><strong>${t.assists}</strong><span>Assist</span></div></div><div class="season-bottom mt-20"><span class="chip ${s.id===state.seasonId?'success':'neutral'}">${s.id===state.seasonId?'Selezionata':'Archiviata'}</span><div class="season-card-buttons"><button class="btn btn-secondary btn-small only-editor" data-action="edit-season" data-id="${esc(s.id)}">Modifica</button><button class="btn btn-secondary btn-small" data-season="${esc(s.id)}">Visualizza</button></div></div></div>`}).join('')}</div><p class="notice mt-20">Il numero di stagioni conta i tesseramenti e le partecipazioni documentate. Modifica un giocatore per scegliere le sue stagioni; lo stato Attivo/Infortunato/Ritirato indica la situazione attuale, anche quando visualizzi stagioni precedenti.</p>`;
  }
  function renderSettings() {
    return intro('CONNESSIONE E DATI','Configurazione','Gestione del collegamento con il foglio Google e stato del progetto.')+banner()+
    `<div class="two-cards"><div class="panel"><div class="panel-heading"><h2 class="panel-title">🔐 Stato connessione</h2></div><div class="breakdown"><div><span>Versione applicazione</span><strong>${VERSION}</strong></div><div><span>Origine dati</span><strong>${state.source==='drive'?'Google Drive':'Demo locale'}</strong></div><div><span>Modalità</span><strong>${editor()?'Google OAuth attivo':'Sola consultazione'}</strong></div><div><span>Archivio</span><strong>${CFG.spreadsheetId?'Configurato':'Da configurare'}</strong></div></div><p class="notice">Le autorizzazioni di scrittura non sono affidate al sito GitHub: le controlla Google tramite i permessi del foglio.</p></div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">📂 Dove sono salvati i dati?</h2></div><p class="form-guide">Tutte le informazioni sono conservate in un unico Google Sheets nel tuo Drive, diviso in 8 schede.</p><div class="breakdown">${SHEETS.map(s=>`<div><span>${esc(s)}</span><strong>Google Sheets</strong></div>`).join('')}</div>${CFG.spreadsheetId?`<p><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(CFG.spreadsheetId)}/edit">Apri archivio Google Sheets ↗</a></p>`:''}</div></div>
    <div class="panel mt-20"><div class="panel-heading"><h2 class="panel-title">🎨 Ruoli, stati e colori</h2></div><p class="form-guide">Personalizza i ruoli (compreso il tipo Portiere), gli stati e il relativo colore. Le scelte sono memorizzate su Google Sheets e sono valide per tutti.</p><div class="intro-buttons"><button class="btn btn-secondary only-editor" data-action="manage-roles">Gestisci ruoli</button><button class="btn btn-secondary only-editor" data-action="manage-states">Gestisci stati e colori</button></div><div class="catalog-overview">${availableStates().map(x=>statusBadge(x.id)).join(' ')}</div></div>
    <div class="panel mt-20"><div class="panel-heading"><h2 class="panel-title">🚀 Messa online</h2></div><div class="two-cards"><div class="info-step"><h3>1. Aggiorna il database esistente</h3><p>Nel Google Sheet già collegato: Estensioni → Apps Script. Sostituisci il vecchio script con <strong>setup.gs</strong> e avvia <strong>aggiornaDatabaseV13()</strong>. Crea i cataloghi Ruoli e Stati e ripristina il −57 storico del portiere soltanto se ancora segnalato come dato non importato.</p></div><div class="info-step"><h3>2. Conserva l’accesso Google</h3><p>Se l’app v1.0 già funziona, non modificare <strong>config.js</strong> né l’ID client OAuth: rimangono validi.</p></div><div class="info-step"><h3>3. Pubblica i file v1.3</h3><p>Carica sullo stesso repository GitHub <strong>index.html, app.js, demo.js, styles.css e logo-expats.png</strong>. Non sovrascrivere config.js.</p></div><div class="info-step"><h3>4. Importa risultati 2025/26</h3><p>Seleziona 2025/26 → Partite e risultati → Importa risultati CSV. Puoi modificare risultato e distinta cliccando una partita; le statistiche già nel pregresso possono essere assorbite senza duplicazioni.</p></div></div><p class="notice mt-20">Per tutte le istruzioni operative, vedere il file LEGGIMI.md incluso nel progetto.</p></div>`;
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
    const body=`<div class="profile-hero"><div class="player-portrait">${jersey(p.number,true)}</div><div><div class="eyebrow">SCHEDA GIOCATORE</div><h3 class="profile-title">${esc(name(p))}</h3>${statusBadge(p.status)} <span class="chip">${esc(p.role||'Ruolo da definire')}</span></div></div><div class="profile-stats">${[['Convocazioni',p.called],['Presenze',p.played],['Gol',isKeeper(p)?(-Math.abs(p.goals)||0):p.goals],['Assist',p.assists],['Gialli',p.yellow],['Rossi',p.red],['Stagioni',seasonsPlayed(p.id)]].map(([label,n])=>`<div><strong>${n}</strong><small>${label}</small></div>`).join('')}</div>${p.notes?`<p class="form-guide">${esc(p.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Statistiche registrate per partita</h3>${played.length?played.map(l=>{const m=state.data.matches.find(m=>m.id===l.matchId);return `<div class="result-line"><span>${esc(m?.opponent)} · ${localeDate(m?.date)}</span><span>⚽ ${lineupStat(l,'goals',l.playerId)} · 🎯 ${positiveInt(l.assists)}</span></div>`}).join(''):'<p class="form-guide">Le statistiche pregresse sono aggregate; non è disponibile il dettaglio delle vecchie partite.</p>'}`;
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
      <div class="field"><label for="p-role">Ruolo</label><select class="form-control" name="role" id="p-role"><option value="">Seleziona ruolo</option>${options([...new Set([...availableRoles().map(r=>r.name),...(p?.role&&!availableRoles().some(r=>r.name===p.role)?[p.role]:[])])],p?.role||'')}</select></div>
      <div class="field"><label for="p-firstName">Nome *</label><input class="form-control" name="firstName" id="p-firstName" value="${esc(p?.firstName||'')}" required maxlength="70"></div>
      <div class="field"><label for="p-lastName">Cognome *</label><input class="form-control" name="lastName" id="p-lastName" value="${esc(p?.lastName||'')}" required maxlength="70"></div>
      <div class="field full"><label for="p-status">Stato</label><select class="form-control" name="status" id="p-status">${availableStates().concat(p?.status&&!availableStates().some(x=>x.id===p.status)?[{id:p.status,name:statusText(p.status)}]:[]).map(x=>`<option value="${esc(x.id)}" ${x.id===(p?.status||'ATTIVO')?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
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
    return `<div class="lineup-controls"><button type="button" class="btn btn-secondary btn-small" data-action="mark-all-called">✓ Convoca tutti</button><button type="button" class="btn btn-secondary btn-small" data-action="clear-all-called">× Azzera convocazioni</button><span id="lineup-summary" class="lineup-summary" aria-live="polite"></span></div><div class="roster-form"><div class="roster-header"><span style="text-align:left">GIOCATORE</span><span>CONV.</span><span>PRES.</span><span>GOL</span><span>ASSIST</span><span>🟨</span><span>🟥</span></div>${players.map(p=>{const l=stored.get(p.id)||{};return `<div class="roster-entry ${one(l.called)?'is-called':''}" data-player-id="${esc(p.id)}" data-keeper="${isKeeper(p)?1:0}"><span class="player-label">${jersey(p.number)} ${esc(name(p))}${p.status==='INFORTUNATO'?'<small> · INFORTUNATO</small>':''}</span><input type="checkbox" data-line="called" ${one(l.called)?'checked':''} aria-label="Convocato ${esc(name(p))}"><input type="checkbox" data-line="played" ${one(l.played)?'checked':''} aria-label="Presenza ${esc(name(p))}">${['goals','assists','yellow','red'].map(k=>`<input type="number" data-line="${k}" value="${k==='goals'&&isKeeper(p)?Math.abs(Math.trunc(num(l[k]))):positiveInt(l[k])}" min="0" max="${k==='yellow'?2:k==='red'?1:99}" step="1" ${one(l.played)?'':'disabled'} aria-label="${k==='goals'&&isKeeper(p)?'Gol subiti':statLabels[k]} ${esc(name(p))}">`).join('')}</div>`}).join('')}</div>${!players.length?'<p class="notice">Non ci sono giocatori tesserati in questa stagione: aggiungili dalla Rosa.</p>':''}`;
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
    syncKeeperGoals();
    updateLineupSummary();
  }
  function matchDetail(id) {
    const m=state.data.matches.find(m=>m.id===id);if(!m)return;
    const lines=state.data.lineups.filter(l=>l.matchId===id).sort((a,b)=>num(state.data.players.find(p=>p.id===a.playerId)?.number)-num(state.data.players.find(p=>p.id===b.playerId)?.number));
    const body=`<div class="eyebrow">${localeDate(m.date)} · ${esc(m.competition||'Partita')}</div><h3 class="page-title" style="font-size:27px">Expats F.C. <span class="accent-green">${m.goalsFor} — ${m.goalsAgainst}</span> ${esc(m.opponent)}</h3><p class="page-subtitle">${m.venue==='T'?'Trasferta':'Casa'} · ${resultLabel(matchResult(m))}</p>${m.notes?`<p class="modal-explainer">${esc(m.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Distinta e statistiche</h3><div class="table-shell mt-20"><table class="data-table" style="min-width:560px"><thead><tr><th>Giocatore</th><th>Conv.</th><th>Pres.</th><th>Gol</th><th>Assist</th><th>Gialli</th><th>Rossi</th></tr></thead><tbody>${lines.map(l=>{const p=state.data.players.find(p=>p.id===l.playerId);return `<tr><td>${esc(p?name(p):'Giocatore non trovato')}</td><td>${one(l.called)?'✓':'—'}</td><td>${one(l.played)?'✓':'—'}</td><td>${lineupStat(l,'goals',l.playerId)}</td><td>${positiveInt(l.assists)}</td><td>${positiveInt(l.yellow)}</td><td>${positiveInt(l.red)}</td></tr>`}).join('')}</tbody></table></div>${!lines.length?'<p class="form-guide">Nessuna distinta presente per questa partita. Puoi aggiungerla con Modifica partita e distinta.</p>':''}`;
    modal(`Partita contro ${m.opponent}`,body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-primary only-editor" data-action="edit-match" data-id="${esc(m.id)}">Modifica partita e distinta</button>`,true);
  }
  function editMatchForm(matchId) { matchForm(matchId); }
  function baselineForm(playerId) {
    if(!editor())return;
    const p=state.data.players.find(x=>x.id===playerId);if(!p)return;
    const season=activeSeason();
    const st=statsForSeason(season.id).find(x=>x.id===playerId);
    const detail=state.data.lineups.filter(l=>l.playerId===playerId && state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===season.id));
    const counted=Object.fromEntries(keys.map(k=>[k,detail.reduce((sum,l)=>sum+lineupStat(l,k,playerId),0)]));
    const labels={called:'Convocazioni',played:'Presenze',goals:'Gol',assists:'Assist',yellow:'Gialli',red:'Rossi'};
    const body=`<form id="baseline-form"><p class="modal-explainer">Imposta i TOTALI di ${esc(name(p))} nella stagione <strong>${esc(season.name)}</strong>. L'app sottrarrà automaticamente i dati delle partite già dettagliate, per evitare doppi conteggi.</p><div class="field-grid">${keys.map(k=>`<div class="field"><label>${labels[k]} (di cui ${counted[k]} già registrati)</label><input class="form-control" name="${k}" type="number" min="${k==='goals'&&isKeeper(p)?-9999:counted[k]}" max="${k==='goals'&&isKeeper(p)?0:9999}" value="${st[k]}" required></div>`).join('')}</div></form>`;
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
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:`expats-fc-${state.seasonId}-v1.3.csv`});
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
    const [p,s,m,l,b,t,rr,ss]=arrays;
    const trimmed=rows=>(rows||[]).filter(row=>row?.some(x=>String(x??'').trim()!==''));
    const str=x=>String(x??'').trim();
    const players=(p||[]).map((r,i)=>({id:str(r[0]),number:num(r[1]),firstName:str(r[2]),lastName:str(r[3]),status:str(r[4])||'ATTIVO',role:str(r[5]),notes:str(r[6]),_row:i+2})).filter(x=>x.id);
    const seasons=(s||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),start:padDate(r[2]),end:padDate(r[3]),_row:i+2})).filter(x=>x.id);
    if(!seasons.length)throw new Error('Il foglio Stagioni è vuoto. Esegui inizializzaDatabase() e importa almeno una stagione.');
    const matches=(m||[]).map((r,i)=>({id:str(r[0]),seasonId:str(r[1]),date:padDate(r[2]),opponent:str(r[3]),venue:str(r[4]),goalsFor:positiveInt(r[5]),goalsAgainst:positiveInt(r[6]),competition:str(r[7]),notes:str(r[8]),baselineAbsorbed:one(r[9]),_row:i+2})).filter(x=>x.id);
    const lineups=(l||[]).map((r,i)=>({id:str(r[0]),matchId:str(r[1]),playerId:str(r[2]),called:one(r[3]),played:one(r[4]),goals:Math.trunc(num(r[5])),assists:positiveInt(r[6]),yellow:positiveInt(r[7]),red:positiveInt(r[8]),_row:i+2})).filter(x=>x.id);
    const baseline=(b||[]).map((r,i)=>({seasonId:str(r[0]),playerId:str(r[1]),called:positiveInt(r[2]),played:positiveInt(r[3]),goals:Math.trunc(num(r[4])),assists:positiveInt(r[5]),yellow:positiveInt(r[6]),red:positiveInt(r[7]),_row:i+2})).filter(x=>x.playerId);
    const memberships=(t||[]).map((r,i)=>({seasonId:str(r[0]),playerId:str(r[1]),inRoster:one(r[2]),_row:i+2})).filter(x=>x.playerId);
    const roles=(rr||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),type:str(r[2])==='PORTIERE'?'PORTIERE':'MOVIMENTO',active:one(r[3]),_row:i+2})).filter(x=>x.id);
    const states=(ss||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),color:safeColor(str(r[2])),active:one(r[3]),_row:i+2})).filter(x=>x.id);
    return {players,seasons,matches,lineups,baseline,memberships,roles:roles.length?roles:structuredClone(legacyRoles),states:states.length?states:structuredClone(legacyStates)};
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
    return [b.seasonId,b.playerId,...keys.map(k=>k==='goals'?Math.trunc(num(values[k])):positiveInt(values[k]))];
  }
  async function withBusy(fn) {
    if(state.busy)return;
    state.busy=true;
    document.querySelectorAll('#modal-root button[data-action^="save-"]').forEach(b=>{b.disabled=true;b.textContent='Salvataggio…';});
    try{await fn();closeModal();await refreshData();toast('Dati salvati su Google Drive.');return true;}
    catch(err){toast('Salvataggio non riuscito: '+safeError(err),true);document.querySelectorAll('#modal-root button[data-action^="save-"]').forEach(b=>{b.disabled=false;b.textContent='Riprova salvataggio';});return false;}
    finally{state.busy=false;}
  }
  async function saveInline(select) {
    if(!editor()||state.busy)return;
    const p=state.data.players.find(x=>x.id===select.dataset.id);if(!p)return;
    const col=select.dataset.inline==='status'?'status':'role';
    const next=select.value;
    if(col==='status'&&!availableStates().some(r=>r.id===next)) {toast('Seleziona uno stato valido.',true);return;}
    if(col==='role'&&next&&!availableRoles().some(r=>r.name===next)){toast('Seleziona un ruolo valido.',true);return;}
    if(p[col]===next)return;
    if(col==='role'&&isKeeper(p)!==(state.data.roles.find(r=>r.name===next)?.type==='PORTIERE') && (state.data.baseline.some(b=>b.playerId===p.id&&b.goals!==0)||state.data.lineups.some(l=>l.playerId===p.id&&l.goals!==0))){
      select.value=p[col];toast('Per cambiare il tipo Portiere di un giocatore con gol storici, occorre prima riconciliare il pregresso.',true);return;
    }
    const previous=p[col]; select.disabled=true;
    try {
      await writeAtomic([{sheet:'Giocatori',row:p._row,rows:[[p.id,p.number,p.firstName,p.lastName,col==='status'?next:p.status,col==='role'?next:p.role,p.notes||'']]}]);
      await refreshData();toast('Rosa aggiornata su Google Drive.');
    }catch(e){select.value=previous;toast('Modifica non salvata: '+safeError(e),true);}
    finally{select.disabled=false;}
  }
  function catalogModal(kind) {
    if(!editor())return;
    const roles=kind==='roles';const items=(roles?state.data.roles:state.data.states).filter(x=>x.active);
    const body=`<p class="modal-explainer">${roles?'Aggiungi, rinomina o disattiva i ruoli. Il tipo PORTIERE determina i gol negativi.':'Aggiungi, rinomina o disattiva gli stati e scegli liberamente il colore.'} Non è possibile eliminare una voce assegnata a un giocatore.</p><div class="catalog-list">${items.map(x=>`<div class="catalog-entry"><div>${roles?`<strong>${esc(x.name)}</strong><small>${x.type==='PORTIERE'?'Portiere':'Giocatore di movimento'}</small>`:`${statusBadge(x.id)} <small>${esc(x.color)}</small>`}</div><div><button class="btn btn-secondary btn-small" data-action="catalog-edit" data-kind="${kind}" data-id="${esc(x.id)}">Modifica</button><button class="btn btn-danger btn-small" data-action="catalog-delete" data-kind="${kind}" data-id="${esc(x.id)}">Rimuovi</button></div></div>`).join('')}</div>`;
    modal(roles?'Gestione ruoli':'Gestione stati e colori',body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-primary" data-action="catalog-edit" data-kind="${kind}">＋ Aggiungi</button>`);
  }
  function catalogItemForm(kind,id='') {
    if(!editor())return;
    const roles=kind==='roles';const item=(roles?state.data.roles:state.data.states).find(x=>x.id===id);
    const body=`<form id="catalog-form"><div class="field-grid"><div class="field full"><label>Nome ${roles?'ruolo':'stato'} *</label><input class="form-control" name="name" required maxlength="45" value="${esc(item?.name||'')}"></div>${roles?`<div class="field full"><label>Tipo statistico</label><select name="type" class="form-control"><option value="MOVIMENTO" ${item?.type!=='PORTIERE'?'selected':''}>Giocatore di movimento</option><option value="PORTIERE" ${item?.type==='PORTIERE'?'selected':''}>Portiere (gol subiti negativi)</option></select><small>Cambiare il tipo dei ruoli già assegnati può rendere incompatibili i gol storici.</small></div>`:`<div class="field full"><label>Colore stato</label><input type="color" name="color" class="status-color-input" value="${safeColor(item?.color||'#488fcf')}"></div>`}</div></form>`;
    modal(item?'Modifica '+(roles?'ruolo':'stato'):'Nuovo '+(roles?'ruolo':'stato'),body,`<button class="btn btn-secondary" data-action="${roles?'manage-roles':'manage-states'}">Indietro</button><button class="btn btn-primary" data-action="catalog-save" data-kind="${kind}" data-id="${esc(id)}">Salva</button>`);
  }
  async function saveCatalog(kind,id='') {
    if(!editor())return;
    const f=$('#catalog-form');if(!f?.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const nameNew=v.name.trim();const role=kind==='roles';const rows=role?state.data.roles:state.data.states;
    const old=rows.find(x=>x.id===id);
    if(rows.some(x=>x.active&&x.id!==id&&x.name.toLocaleLowerCase('it')===nameNew.toLocaleLowerCase('it'))){toast('Esiste già una voce con questo nome.',true);return;}
    const assigned=old?state.data.players.filter(p=>(role?p.role:p.status)===(role?old.name:old.id)):[];
    if(role&&old&&old.type!==v.type&&assigned.length&&(state.data.baseline.some(b=>assigned.some(p=>p.id===b.playerId)&&b.goals!==0)||state.data.lineups.some(l=>assigned.some(p=>p.id===l.playerId)&&l.goals!==0))){
      toast('Non è possibile cambiare tipo: ci sono gol storici assegnati a giocatori con questo ruolo.',true);return;
    }
    const itemId=old?.id||uid(role?'role':'status');
    const op={sheet:role?'Ruoli':'Stati',...(old?{row:old._row}:{}),rows:[role?[itemId,nameNew,v.type,1]:[itemId,nameNew,safeColor(v.color),1]]};
    const ops=[op];
    if(role&&old&&old.name!==nameNew)for(const p of assigned)ops.push({sheet:'Giocatori',row:p._row,rows:[[p.id,p.number,p.firstName,p.lastName,p.status,nameNew,p.notes||'']]});
    const ok=await withBusy(()=>writeAtomic(ops));if(ok)catalogModal(kind);
  }
  async function deleteCatalog(kind,id) {
    if(!editor())return;
    const role=kind==='roles';const item=(role?state.data.roles:state.data.states).find(x=>x.id===id);
    if(!item)return;
    if(state.data.players.some(p=>(role?p.role:p.status)===(role?item.name:item.id))){toast('Voce assegnata ad almeno un giocatore: riassegnalo dalla rosa prima di rimuoverla.',true);return;}
    if(!confirm(`Rimuovere ${item.name} dall’elenco delle opzioni?`))return;
    const row=role?[item.id,item.name,item.type,0]:[item.id,item.name,item.color,0];
    const ok=await withBusy(()=>writeAtomic([{sheet:role?'Ruoli':'Stati',row:item._row,rows:[row]}]));if(ok)catalogModal(kind);
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
    if(player && isKeeper(player)!==(state.data.roles.find(r=>r.name===v.role)?.type==='PORTIERE') && (state.data.baseline.some(b=>b.playerId===player.id&&b.goals!==0)||state.data.lineups.some(l=>l.playerId===player.id&&l.goals!==0))){toast('Non si può modificare il tipo Portiere/Movimento senza riconciliare i gol storici.',true);return;}
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
    const p=state.data.players.find(p=>p.id===playerId);
    for(const key of keys) {
      const sum=detail.reduce((t,l)=>t+lineupStat(l,key,playerId),0);
      const keeperGoals=key==='goals'&&isKeeper(p);
      if(!/^-?\d+$/.test(v[key])||(!keeperGoals&&Number(v[key])<sum)||Number(v[key])> (keeperGoals?0:9999)||Number(v[key])< -9999){toast('Totale non valido per '+key+'.',true);return;}
      const residual=Number(v[key])-sum;
      if(keeperGoals&&residual>0){toast('Gol subiti inferiori ai valori già registrati nelle distinte.',true);return;}
      values[key]=residual;
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
        goals:row.dataset.keeper==='1'?-positiveInt(get('goals').value):positiveInt(get('goals').value),assists:positiveInt(get('assists').value),yellow:positiveInt(get('yellow').value),red:positiveInt(get('red').value)};
    });
    if(all.some(l=>(l.played&&!l.called)||(!l.played&&(l.goals||l.assists||l.yellow||l.red))))throw new Error('I giocatori con statistiche devono risultare presenti e convocati.');
    if(all.some(l=>l.yellow>2||l.red>1||Math.abs(l.goals)>99||l.assists>99))throw new Error('Valori della distinta fuori limite.');
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
    const keeperRows=lineup.filter(l=>l.played&&isKeeper(state.data.players.find(p=>p.id===l.playerId)));
    if(keeperRows.length===1)keeperRows[0].goals=-positiveInt(v.goalsAgainst);
    if(keeperRows.length>1 && keeperRows.reduce((s,l)=>s+Math.abs(l.goals),0)!==positiveInt(v.goalsAgainst)){
      toast('Con più portieri in campo, ripartisci i gol subiti: il totale deve coincidere con il risultato avversario.',true);return;
    }
    const totalGoals=lineup.reduce((t,l)=>t+Math.max(0,l.goals),0);
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
        const delta=(oldAbsorbed?lineupStat(old,k,item.playerId):0)-(newAbsorbed?lineupStat(item,k,item.playerId):0);
        next[k]=(historical?.[k]||0)+delta;
        if(delta!==0)change=true;
        if((k==='goals'&&isKeeper(state.data.players.find(p=>p.id===item.playerId)))?next[k]>0:next[k]<0){const p=state.data.players.find(x=>x.id===item.playerId);toast(`La distinta di ${p?name(p):item.playerId} supera il pregresso residuo (${statLabels[k]}). Deseleziona “già comprese nel pregresso” se sono nuove statistiche, oppure correggi il pregresso.`,true);return;}
      }
      if(change) adjusted.push({sheet:'Pregresso',...(historical?{row:historical._row}:{}),rows:[historical?baselineRow(historical,next):[v.seasonId,item.playerId,...keys.map(k=>next[k])]]});
    }
    // Anche un giocatore rimosso dalla distinta va neutralizzato e, se necessario,
    // restituito al pregresso (le righe storiche non vengono cancellate).
    const newMap=new Map(lineup.map(l=>[l.playerId,l]));
    for(const old of oldLineups) if(!newMap.has(old.playerId)) {
      const oldbase=state.data.baseline.find(b=>b.seasonId===v.seasonId&&b.playerId===old.playerId);
      if(oldAbsorbed)adjusted.push({sheet:'Pregresso',...(oldbase?{row:oldbase._row}:{}),rows:[oldbase?baselineRow(oldbase,Object.fromEntries(keys.map(k=>[k,(oldbase[k]||0)+lineupStat(old,k,old.playerId)]))):[v.seasonId,old.playerId,...keys.map(k=>lineupStat(old,k,old.playerId))]]});
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
  function syncKeeperGoals() {
    const form=$('#match-form');if(!form)return;
    const keepers=[...form.querySelectorAll('.roster-entry[data-keeper="1"]')];
    const playing=keepers.filter(row=>row.querySelector('[data-line="played"]').checked);
    const goals=positiveInt(form.querySelector('[name="goalsAgainst"]')?.value);
    for(const row of keepers){
      const input=row.querySelector('[data-line="goals"]');
      if(!row.querySelector('[data-line="played"]').checked){input.value='0';input.readOnly=true;}
      else if(playing.length===1){input.value=String(goals);input.readOnly=true;}
      else {input.readOnly=false;}
      input.title=playing.length===1?'Gol subiti assegnati automaticamente dal risultato':'Gol subiti dal portiere (da ripartire se giocano più portieri)';
    }
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
    syncKeeperGoals();
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
    if(event.target.closest('select,input,textarea,a'))return;
    if(btn.dataset.player){profile(btn.dataset.player);return;}
    if(btn.dataset.match){matchDetail(btn.dataset.match);return;}
    if(btn.dataset.season){state.seasonId=btn.dataset.season;navigate('dashboard');return;}
    const action=btn.dataset.action;
    if(action==='close-modal')closeModal();
    else if(action==='manage-roles')catalogModal('roles');
    else if(action==='manage-states')catalogModal('states');
    else if(action==='catalog-edit')catalogItemForm(btn.dataset.kind,btn.dataset.id);
    else if(action==='catalog-save')saveCatalog(btn.dataset.kind,btn.dataset.id).catch(e=>toast(safeError(e),true));
    else if(action==='catalog-delete')deleteCatalog(btn.dataset.kind,btn.dataset.id).catch(e=>toast(safeError(e),true));
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
    else if(event.target.dataset.inline){saveInline(event.target).catch(e=>toast(safeError(e),true));}
    else if(event.target.dataset.line){rosterToggle(event.target);}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='csv-paste'){state.importPreview=null;$('#execute-import').disabled=true;$('#import-preview').replaceChildren();}
    if(event.target.name==='goalsAgainst' && event.target.closest('#match-form'))syncKeeperGoals();
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
