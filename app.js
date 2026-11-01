/* EXPATS F.C. TEAM MANAGER — v1.16
 * Frontend statico GitHub Pages + Google Sheets API (edit via OAuth) + GViz JSONP (pubblico).
 * Il controllo delle modifiche dipende dai permessi Google Drive sul foglio.
 */
(() => {
  'use strict';
  const CFG = window.EXPATS_CONFIG;
  const SHEETS = ['Giocatori','Stagioni','Partite','Distinte','Pregresso','Tesseramenti','Ruoli','Stati','CampionatoClassifica','CampionatoPartite','CampionatoWidget'];
  const VERSION='v1.16';
  const state = {
    data: structuredClone(window.EXPATS_DEMO),
    source: 'demo', view: 'dashboard', seasonId: '', rosterScope: 'season',
    sort: {key:'number',dir:1}, search:'', filter:'TUTTI', leagueTab:'classifica',
    token: '', sheetIds: {}, schemaReady:false, busy: false, inlineSaving:false, lastError: ''
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
  const seasonEvidence = (playerId,seasonId) => state.data.baseline.some(b=>b.playerId===playerId && b.seasonId===seasonId && ['called','played','assists','yellow','red'].some(k=>positiveInt(b[k])>0) || b.playerId===playerId && b.seasonId===seasonId && (num(b.goals)!==0||positiveInt(b.goalsFor)>0||positiveInt(b.goalsConceded)>0)) || state.data.lineups.some(l=>l.playerId===playerId && (l.called||l.played||l.goals||l.goalsFor||l.goalsConceded||l.assists||l.yellow||l.red) && state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===seasonId));
  // Un tesseramento esplicito, anche se 0, prevale su statistiche pregresse.
  // Rimuovere dalla rosa non cancella mai una distinta o un risultato.
  const isMember = (playerId,seasonId) => {
    const record=state.data.memberships.find(r=>r.playerId===playerId&&r.seasonId===seasonId);
    return record ? record.inRoster : seasonEvidence(playerId,seasonId);
  };
  const seasonYear=s=>{
    const year=/(?:^|\D)((?:19|20)\d{2})\s*\//.exec(s.name||'');
    if(year)return Number(year[1]);
    return /^\d{4}-/.test(s.start||'')?Number(s.start.slice(0,4)):9999;
  };
  const orderedSeasons=()=>[...state.data.seasons].sort((a,b)=>seasonYear(a)-seasonYear(b)||String(a.start).localeCompare(String(b.start))||String(a.name).localeCompare(String(b.name),'it'));
  const isAfterFirstSeason=sid=>orderedSeasons().findIndex(s=>s.id===sid)>0;
  // Conta solamente le stagioni fino a quella selezionata, non quelle future.
  const seasonsPlayed=(playerId,throughSeasonId=state.seasonId)=>{
    const ordered=orderedSeasons();const index=ordered.findIndex(s=>s.id===throughSeasonId);
    return ordered.slice(0,index>=0?index+1:ordered.length).filter(s=>isMember(playerId,s.id)).length;
  };
  // Identità unica in Giocatori; numero maglia, ruolo e stato cambiano per stagione.
  // D:E:F del tesseramento sono gli unici valori usati dopo la migrazione.
  const registration = (playerId,seasonId) => state.data.memberships.find(r=>r.playerId===playerId&&r.seasonId===seasonId);
  function seasonPlayer(p,seasonId) {
    if(!p)return null;
    const r=registration(p.id,seasonId);
    if(r)return {...p,number:r.number ?? p.number,keeperNumber:r.keeperNumber ?? null,role:r.role ?? p.role,status:r.status ?? p.status};
    // Nuova stagione non implica automaticamente maglia, ruolo o stato dell'anno prima.
    if(seasonEvidence(p.id,seasonId))return {...p}; // fallback per vecchie righe non migrate
    return {...p,number:0,keeperNumber:null,role:'',status:'ATTIVO'};
  }
  const playersInSeason = seasonId => state.data.players.filter(p=>isMember(p.id,seasonId)).map(p=>seasonPlayer(p,seasonId));
  const keeperInSeason = (playerId,seasonId) => isKeeper(seasonPlayer(state.data.players.find(p=>p.id===playerId),seasonId));
  const registrationValues=(seasonId,playerId,inRoster,number,role,status,keeperNumber=null)=>[seasonId,playerId,inRoster?1:0,number,role,status,keeperNumber==null?'':keeperNumber];
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
  // Calendario: dalla partita più vecchia alla più recente, a parità di data ordine stabile.
  const seasonMatches = id => state.data.matches.filter(m=>m.seasonId===id).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
  // La posizione dell'Expats F.C. e dei punteggi segue sempre Casa vs Trasferta.
  const fixture = m => ({home:m.venue==='T'?m.opponent:'Expats F.C.',away:m.venue==='T'?'Expats F.C.':m.opponent,
    homeGoals:m.venue==='T'?m.goalsAgainst:m.goalsFor,awayGoals:m.venue==='T'?m.goalsFor:m.goalsAgainst});
  const isUnavailable = p => {
    const label=`${p.status||''} ${statusText(p.status)}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it');
    return /infortun|assen/.test(label);
  };
  const matchResult = m => m.goalsFor>m.goalsAgainst?'W':m.goalsFor<m.goalsAgainst?'L':'D';
  const resultLabel = r => ({W:'Vittoria',D:'Pareggio',L:'Sconfitta'})[r] || '';
  const legacyStates=[{id:'ATTIVO',name:'Attivo',color:'#35c986',active:true},{id:'INFORTUNATO',name:'Infortunato',color:'#f2b84e',active:true},{id:'RITIRATO',name:'Ritirato',color:'#8898ad',active:true}];
  const rolePalette=['#ffc15a','#68b6ec','#488fd7','#4986c1','#30acaa','#987ceb','#8a91ca','#b77ad4','#e28c69','#e66f8c','#789cb1'];
  const legacyRoles=['Portiere','Difensore','Centrale','Terzino','Esterno','Centrocampista','Mediano','Trequartista','Attaccante','Punta','Jolly'].map((name,i)=>({id:'r_'+i,name,type:i===0?'PORTIERE':'MOVIMENTO',color:rolePalette[i],active:true}));
  // Ruoli stagionali: singolo nome legacy oppure array JSON per più ruoli.
  // Il valore rimane nella colonna E di Tesseramenti: nessuna migrazione dello schema.
  const rolesOf=value=>{
    let items=Array.isArray(value)?value:null;
    if(!items){const raw=String(value??'').trim();if(!raw)return [];
      if(raw.startsWith('[')){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))items=parsed;}catch(_){/* valore singolo preesistente */}}
      if(!items)items=[raw];
    }
    return [...new Set(items.map(x=>String(x??'').trim()).filter(Boolean))];
  };
  const rolesValue=value=>{const roles=rolesOf(value);return roles.length<2?(roles[0]||''):JSON.stringify(roles);};
  const rolesText=value=>rolesOf(value).join(', ')||'Nessun ruolo';
  const includesRole=(value,name)=>rolesOf(value).includes(name);
  const isKeeperRole=value=>rolesOf(value).some(n=>{const r=state.data.roles.find(r=>r.name===n);return r?r.type==='PORTIERE':n==='Portiere';});
  const availableRoles=()=>state.data.roles.filter(r=>r.active);
  const availableStates=()=>state.data.states.filter(r=>r.active);
  const isKeeper=p=>!!p&&isKeeperRole(p.role);
  const statusInfo=id=>state.data.states.find(x=>x.id===id)||legacyStates.find(x=>x.id===id)||{name:id,color:'#8898ad'};
  const statusText=s=>statusInfo(s).name;
  const safeColor=c=>/^#[0-9a-f]{6}$/i.test(String(c))?c:'#8898ad';
  const readableText=hex=>{const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return a[0]*.2126+a[1]*.7152+a[2]*.0722>145?'#102339':'#ffffff';};
  const statusBadge=s=>{const c=safeColor(statusInfo(s).color);return `<span class="chip status-pill" style="background:${c};color:${readableText(c)}">${esc(statusText(s))}</span>`;};
  const roleColor=role=>safeColor(state.data.roles.find(x=>x.name===role)?.color||'#488fcf');
  const roleBadge=role=>{
    const roles=rolesOf(role);
    if(!roles.length)return '<span class="chip">—</span>';
    return roles.map(r=>{const c=roleColor(r);return `<span class="chip role-pill" style="background:${c};color:${readableText(c)}">${esc(r)}</span>`;}).join('');
  };
  const roleCell=(role,playerId)=>`<div class="roles-cell-inner" title="${esc(rolesText(role))}"><div class="role-badge-strip" aria-label="Ruoli: ${esc(rolesText(role))}">${roleBadge(role)}</div>${editor()?`<button type="button" class="role-editor-button" data-action="edit-player-roles" data-id="${esc(playerId)}" aria-label="Modifica ruoli di ${esc(state.data.players.find(p=>p.id===playerId)?.firstName||'giocatore')}" title="Aggiungi o rimuovi ruoli">✎</button>`:''}</div>`;
  const dropdown=(kind,selected,id)=>{
    const rows=kind==='role'?availableRoles():availableStates();
    const items=kind==='role'?rows.map(r=>({key:r.name,label:r.name})):rows.map(r=>({key:r.id,label:r.name}));
    if(selected && !items.some(o=>o.key===selected))items.push({key:selected,label:kind==='role'?selected:statusText(selected)});
    const c=selected?(kind==='status'?safeColor(statusInfo(selected).color):roleColor(selected)):null;
    return `<select class="inline-select" ${c?`style="background:${c};color:${readableText(c)}"`:''} data-inline="${kind}" data-id="${esc(id)}" aria-label="Modifica ${kind==='role'?'ruolo':'stato'}" ><option value="" ${!selected?'selected':''}>—</option>${items.map(o=>`<option value="${esc(o.key)}" ${o.key===selected?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
  };
  const keys = ['called','played','goals','assists','yellow','red'];
  const statLabels={called:'Convocazioni',played:'Presenze',goals:'Gol',assists:'Assist',yellow:'Gialli',red:'Rossi'};

  // Maglia larga; variante ARANCIONE per chi ricopre un ruolo di tipo PORTIERE
  // nella stagione selezionata. Il numero resta indipendente per tesseramento.
  const jersey = (number,large=false,keeper=false) => `<span class="shirt-wrap ${large?'shirt-large':''} ${keeper?'shirt-keeper':'shirt-outfield'}" aria-label="Maglia ${keeper?'portiere arancione':'azzurra'} numero ${esc(number)}"><svg class="shirt-svg" viewBox="0 0 100 80" aria-hidden="true"><path d="M32 7H68L79 18 94 25 86 44 76 40V73H24V40L14 44 6 25 21 18Z" fill="${keeper?'#ff9e38':'#61baf7'}" stroke="${keeper?'#ffcf91':'#bce9ff'}" stroke-width="2.5" stroke-linejoin="round"/><path d="M39 7Q50 20 61 7" stroke="${keeper?'#a84c07':'#2278b8'}" stroke-width="3.8" fill="none"/><path d="M25 41V69M75 41V69" stroke="${keeper?'#db6c16':'#2e8fcf'}" stroke-width="1.4" opacity=".5"/><path d="M22 19L13 29M78 19L87 29" stroke="${keeper?'#ffcc89':'#d5efff'}" stroke-width="2" opacity=".7"/></svg><span class="shirt-number">${esc(number)}</span></span>`;
  // Le colonne esplicite salvano gol segnati e subiti SEPARATAMENTE.
  // La colonna legacy Gol (con segno) serve soltanto per compatibilità CSV.
  const goalParts = record => {
    if(record && record.goalsFor!=null && record.goalsConceded!=null)
      return {scored:positiveInt(record.goalsFor),conceded:positiveInt(record.goalsConceded)};
    const signed=Math.trunc(num(record?.goals));
    return {scored:Math.max(0,signed),conceded:Math.max(0,-signed)};
  };
  // La rosa distingue sempre fatti e subiti per i giocatori che possono
  // coprire sia il ruolo portiere sia un ruolo di movimento. Il ruolo
  // occasionale indicato nella distinta prevale anche per lo storico.
  const hasOutfieldRole = value => rolesOf(value).some(role => {
    const definition=state.data.roles.find(item=>item.name===role);
    return definition ? definition.type!=='PORTIERE' : role!=='Portiere';
  });
  const splitSeasonGoals = (player, seasonId=state.seasonId) => {
    if (!hasOutfieldRole(player.role)) return false;
    if (isKeeperRole(player.role) || positiveInt(player.goalsConceded)>0) return true;
    const games=new Set(state.data.matches.filter(m=>m.seasonId===seasonId).map(m=>m.id));
    return state.data.lineups.some(l=>l.playerId===player.id && games.has(l.matchId) &&
      one(l.played) && l.matchRole==='PORTIERE');
  };
  // Doppio completo solo se nello stesso anno ha un ruolo di movimento e
  // almeno un ruolo PORTIERE, o se ha effettivamente giocato in porta.
  const playedKeeperInSeason = (id,sid) => {
    if(!id)return false;
    const ids=new Set(state.data.matches.filter(m=>m.seasonId===sid).map(m=>m.id));
    return state.data.lineups.some(l=>l.playerId===id && ids.has(l.matchId) && one(l.played) && (l.matchRole==='PORTIERE'||goalParts(l).conceded>0));
  };
  // v1.15: la doppia maglia dipende dalla presenza di almeno un ruolo
  // di movimento e uno da portiere, oppure da una presenza occasionale in porta.
  // Nel catalogo ruoli creato dall'utente possono esserci voci personalizzate
  // con tipo incongruente: i nomi calcistici riconoscibili offrono un fallback
  // per la VISUALIZZAZIONE senza modificare catalogo, gol o tesseramenti.
  const visualMovementRole = role => {
    const def=state.data.roles.find(x=>x.name===role);
    return def?.type==='MOVIMENTO' || /^(difensor|centrocamp|attacc|terzin|mediano|esterno|ala\b|punta\b|trequart|jolly\b|centrale\b)/i.test(role);
  };
  const dualKitNeeded = (role,playerId,seasonId) => {
    const assigned=rolesOf(role);
    const movement=assigned.some(visualMovementRole);
    const keeper=isKeeperRole(role) || assigned.some(n=>/^portiere\b/i.test(n)) || playedKeeperInSeason(playerId,seasonId);
    return movement && keeper;
  };
  const keeperKitNumber = p => p.keeperNumber==null ? p.number : p.keeperNumber;
  const kitForMatch = (p,keeper,seasonId=state.seasonId) => keeper && dualKitNeeded(p.role,p.id,seasonId) ? keeperKitNumber(p) : p.number;
  const playerJerseys = (p,large=false,seasonId=state.seasonId) => {
    if(!p)return '';
    if(dualKitNeeded(p.role,p.id,seasonId))
      return `<span class="shirt-pair ${large?'shirt-pair-large':''}" title="Maglia movimento ${esc(p.number)} · Maglia portiere ${esc(keeperKitNumber(p))}">${jersey(p.number,false,false)}${jersey(keeperKitNumber(p),false,true)}</span>`;
    return jersey(p.number,large,isKeeper(p));
  };
  const goalText = (record, forceSplit=false) => {
    const {scored,conceded}=goalParts(record);
    if(forceSplit)return `${scored} / ${conceded?`−${conceded}`:'0'}`;
    return scored&&conceded?`${scored} / −${conceded}`:conceded?`−${conceded}`:String(scored);
  };
  const rosterGoalText = (player,seasonId=state.seasonId)=>goalText(player,splitSeasonGoals(player,seasonId));
  const matchKeeper = (l,seasonId) => {
    if(l?.matchRole==='PORTIERE')return true;
    if(l?.matchRole==='MOVIMENTO')return false;
    const goals=goalParts(l);if(goals.conceded)return true;
    return keeperInSeason(l?.playerId,seasonId);
  };
  const lineupStat=(l,key,playerId)=>{
    if(key==='called'||key==='played')return one(l?.[key])?1:0;
    if(key==='goals'){
      const parts=goalParts(l);
      return parts.scored-parts.conceded;
    }
    return positiveInt(l?.[key]);
  };
  const seasonIsHistorical=(sid)=>{const s=state.data.seasons.find(s=>s.id===sid);return !!s && !!s.end && s.end < new Date().toISOString().slice(0,10);};

  const sheetRange = sheet => `'${sheet.replace(/'/g,"''")}'!A:Z`;
  function statsForSeason(seasonId) {
    const map = new Map(state.data.players.map(p => [p.id,{...seasonPlayer(p,seasonId),called:0,played:0,goals:0,goalsFor:0,goalsConceded:0,assists:0,yellow:0,red:0}]));
    for (const b of state.data.baseline) if (b.seasonId===seasonId && map.has(b.playerId)) {
      const s=map.get(b.playerId),parts=goalParts(b);
      s.goalsFor+=parts.scored;s.goalsConceded+=parts.conceded;
      for(const k of keys)if(k!=='goals')s[k]+=positiveInt(b[k]);
    }
    const validMatches=new Set(state.data.matches.filter(m=>m.seasonId===seasonId).map(m=>m.id));
    for(const lineup of state.data.lineups)if(validMatches.has(lineup.matchId)&&map.has(lineup.playerId)){
      const s=map.get(lineup.playerId),parts=goalParts(lineup);
      s.called+=one(lineup.called)?1:0;s.played+=one(lineup.played)?1:0;
      s.goalsFor+=parts.scored;s.goalsConceded+=parts.conceded;
      for(const k of ['assists','yellow','red'])s[k]+=positiveInt(lineup[k]);
    }
    for(const s of map.values())s.goals=s.goalsFor-s.goalsConceded;
    return [...map.values()];
  }
  const byKey = (items,key) => [...items].sort((a,b) => num(b[key])-num(a[key]) || name(a).localeCompare(name(b),'it'));
  function seasonTotals(id) {
    const st=statsForSeason(id);const matches=seasonMatches(id);
    return { players:playersInSeason(id).length, available:playersInSeason(id).filter(p=>!isUnavailable(p)).length, active:playersInSeason(id).filter(p=>p.status==='ATTIVO').length,
      injured:playersInSeason(id).filter(p=>p.status==='INFORTUNATO').length,
      called:st.reduce((t,p)=>t+p.called,0), played:st.reduce((t,p)=>t+p.played,0),
      goals:st.reduce((t,p)=>t+p.goalsFor,0),ownGoals:matches.reduce((t,m)=>t+positiveInt(m.ownGoalsFor),0),assists:st.reduce((t,p)=>t+p.assists,0),
      matches:matches.length,win:matches.filter(m=>matchResult(m)==='W').length,
      draw:matches.filter(m=>matchResult(m)==='D').length,loss:matches.filter(m=>matchResult(m)==='L').length,
      scored:st.reduce((t,p)=>t+p.goalsFor,0)+matches.reduce((t,m)=>t+positiveInt(m.ownGoalsFor),0),
      conceded:matches.reduce((t,m)=>t+positiveInt(m.goalsAgainst),0)};
  }
  const NAV = [
    ['dashboard','◈','Panoramica'],['players','♙','Rosa giocatori'],
    ['matches','⚽','Partite e risultati'],['rankings','▥','Statistiche'],['league','🏆','Campionato'],
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
      ['GIOCATORI IN ROSA',t.players,'accent-blue'],
      ['CONVOCABILI',t.available,'accent-blue'],
      ['PARTITE GIOCATE',t.matches,'accent-blue'],
      ['GOL SEGNATI',t.scored,'accent-green'],
      ['GOL SUBITI',t.conceded,'accent-red']
    ];
    const card = ([label,value,accent])=>`<div class="stat-card dashboard-kpi"><div class="stat-card-label">${label}</div><div class="stat-value ${accent}">${value}</div></div>`;
    return intro('LA TUA SQUADRA','La stagione in numeri',`Statistiche e andamento · ${s.name}`,newMatchButton())+banner()+
      `<div class="stats-grid dashboard-stats-grid">${kpi.map(card).join('')}</div><div class="panel-grid"><div class="panel"><div class="panel-heading"><div><h2 class="panel-title">⚽ Classifica marcatori</h2><span class="panel-caption">I migliori realizzatori della stagione</span></div><button class="link-btn" data-nav="rankings">Statistiche complete →</button></div>${bars(byKey(leaders,'goalsFor').filter(p=>p.goalsFor>0).slice(0,6),'goalsFor')}</div>
      <div class="panel"><div class="panel-heading"><div><h2 class="panel-title">🎯 Leader assist</h2><span class="panel-caption">Chi crea più occasioni da gol</span></div><button class="link-btn" data-nav="rankings">Vedi tutte →</button></div>${bars(byKey(leaders,'assists').filter(p=>p.assists>0).slice(0,6),'assists',true)}</div></div>
      <div class="panel-grid mt-20"><div class="panel"><div class="panel-heading"><div><h2 class="panel-title">🏟 Ultime partite</h2><span class="panel-caption">Risultati delle partite registrate</span></div><button class="link-btn" data-nav="matches">Tutte le partite →</button></div>${matches.length?matches.slice(-5).reverse().map(matchLine).join(''):empty('📅','Nessuna partita registrata','Puoi conservare le statistiche pregresse e inserire da oggi le nuove partite.')}</div>
      <div class="panel"><div class="panel-heading"><div><h2 class="panel-title">📈 Bilancio stagionale</h2><span class="panel-caption">Solo partite con risultato archiviato</span></div></div><div class="breakdown"><div><span>Vittorie</span><strong class="accent-green">${t.win}</strong></div><div><span>Pareggi</span><strong class="accent-yellow">${t.draw}</strong></div><div><span>Sconfitte</span><strong class="accent-red">${t.loss}</strong></div><div><span>Gol risultanti dai punteggi / subiti</span><strong>${matches.reduce((sum,m)=>sum+positiveInt(m.goalsFor),0)} / ${t.conceded}</strong></div></div><p class="notice">I gol segnati della panoramica provengono dalle statistiche individuali e dagli autogol a favore; i gol subiti provengono dai risultati. Se mancano partite o marcatori nello storico, i totali possono differire.</p></div></div>`;
  }
  function bars(items,key,blue=false) {
    if(!items.length) return empty('📊','Nessun dato per questa classifica');
    const max=Math.max(1,...items.map(p=>p[key]));
    return `<div class="bars-list">${items.map((p,i)=>`<div class="bar-row"><span class="bar-rank ${i===0?'first':''}">${String(i+1).padStart(2,'0')}</span><span class="bar-person">${esc(name(p))}<small>#${esc(p.number)} · ${esc(rolesText(p.role))}</small></span><div class="bar-track"><div class="bar-fill ${blue?'blue':''}" style="width:${Math.round(100*p[key]/max)}%"></div></div><span class="bar-value">${p[key]}</span></div>`).join('')}</div>`;
  }
  function playerRows() {
    const list=statsForSeason(activeSeason().id).filter(p=>{
      if(state.rosterScope==='season' && !isMember(p.id,state.seasonId))return false;
      const q=state.search.trim().toLocaleLowerCase('it');
      return (state.filter==='TUTTI'||p.status===state.filter) && (`${name(p)} ${p.number} ${p.keeperNumber??''} ${rolesText(p.role)}`.toLocaleLowerCase('it').includes(q));
    });
    const {key,dir}=state.sort;
    list.sort((a,b)=>{
      const av=key==='seasons'?seasonsPlayed(a.id):key==='role'?rolesText(a.role):key==='goals'?a.goalsFor:a[key],bv=key==='seasons'?seasonsPlayed(b.id):key==='role'?rolesText(b.role):key==='goals'?b.goalsFor:b[key];
      return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av||'').localeCompare(String(bv||''),'it'))*dir || name(a).localeCompare(name(b),'it');
    });
    return list;
  }
  function playersTable() {
    const rows=playerRows();
    if(!rows.length)return `<tr><td colspan="${isAfterFirstSeason(state.seasonId)?13:12}">${empty('🔎','Nessun giocatore trovato')}</td></tr>`;
    const maximum=Object.fromEntries(keys.map(k=>[k,Math.max(1,...rows.map(r=>k==='goals'?r.goalsFor:positiveInt(r[k])))]));
    const metric=(p,k)=>{
      const hasConceded=k==='goals'&&p.goalsConceded>0;
      const value=k==='goals'?rosterGoalText(p):positiveInt(p[k]);
      const visual=k==='goals'?p.goalsFor:positiveInt(p[k]);
      return `<td class="metric-cell metric-${k} ${hasConceded?'keeper-goals':''}" title="${hasConceded?'Gol fatti / gol subiti':'Statistica stagionale'}"><div class="metric-value">${esc(value)}</div>${hasConceded?'':`<div class="metric-track"><span style="width:${Math.min(100,Math.round(100*visual/maximum[k]))}%"></span></div>`}</td>`;
    };
    return rows.map((p,i)=>`<tr class="clickable" data-player="${esc(p.id)}" title="Dettaglio ${esc(name(p))}"><td class="row-index">${i+1}</td><td class="col-shirt">${playerJerseys(p,false,state.seasonId)}</td><td class="col-name">${esc(p.firstName)}</td><td class="col-name">${esc(p.lastName)}</td><td class="inline-cell role-cell">${roleCell(p.role,p.id)}</td><td class="inline-cell">${editor()?dropdown('status',p.status,p.id):statusBadge(p.status)}</td>${isAfterFirstSeason(state.seasonId)?`<td class="num season-num">${seasonsPlayed(p.id)}</td>`:''}${keys.map(k=>metric(p,k)).join('')}</tr>`).join('');
  }
  function renderPlayers() {
    return intro('ROSA UFFICIALE','I nostri giocatori','Maglia, ruoli multipli e stato indipendenti per stagione, modificabili dalla rosa e dalla scheda giocatore.',`<button class="btn btn-secondary" data-action="export">↓ Esporta CSV</button><button class="btn btn-primary only-editor" data-action="new-player">＋ Nuovo giocatore</button>`)+banner()+
      `<div class="toolbar"><button class="btn btn-secondary only-editor" data-action="manage-roles">🎨 Ruoli e colori</button><button class="btn btn-secondary only-editor" data-action="manage-states">🎨 Stati e colori</button><select id="roster-scope" class="filter-select" aria-label="Rosa della stagione"><option value="season" ${state.rosterScope==='season'?'selected':''}>Rosa stagione</option><option value="all" ${state.rosterScope==='all'?'selected':''}>Tutti i giocatori</option></select><input id="player-search" class="search" type="search" placeholder="Cerca per nome, maglia o ruolo..." value="${esc(state.search)}" aria-label="Cerca giocatore"><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="TUTTI" ${state.filter==='TUTTI'?'selected':''}>Tutti gli stati</option>${availableStates().map(item=>{const x=item.id;return `<option value="${x}" ${state.filter===x?'selected':''}>${statusText(x)}</option>`}).join('')}</select></div>
      <div class="table-shell"><table class="data-table roster-table"><thead><tr><th class="col-count" title="Numerazione progressiva delle righe visualizzate">N°</th><th class="sortable" data-sort="number" title="Numero di maglia">Maglia${state.sort.key==='number'?(state.sort.dir===1?' ↑':' ↓'):''}</th>${[['firstName','Nome'],['lastName','Cognome'],['role','Ruolo'],['status','Stato'],...(isAfterFirstSeason(state.seasonId)?[['seasons','Stagioni']]:[]),['called','Conv.'],['played','Pres.'],['goals','Gol'],['assists','Assist'],['yellow','Gialli'],['red','Rossi']].map(([k,label])=>`<th class="sortable" data-sort="${k}">${label}${state.sort.key===k?(state.sort.dir===1?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody id="players-tbody">${playersTable()}</tbody></table></div><p class="notice">N° = posizione progressiva nella tabella · Maglia = numero scelto dal giocatore; con ruoli misti due maglie (azzurra e arancione), ciascuna con numero stagionale indipendente. Le barre confrontano i valori della stessa colonna nella rosa visualizzata. I gol subiti sono negativi e senza barra; per i giocatori con ruoli da portiere e movimento sono sempre visibili due valori (es. 0 / −3), anche se i gol fatti sono zero. Clicca sulla matita accanto ai badge Ruolo o sul menu Stato per modificarli solo nella stagione scelta. Le maglie doppie (azzurra/arancione) si attivano per i ruoli misti anche se il catalogo contiene tipi statistici personalizzati. La colonna Ruolo si allarga per mostrare tutti i badge su un’unica riga. Per cambiare maglia, apri Modifica giocatore. Apri la scheda di un giocatore per rimuoverlo dalla rosa della stagione senza cancellarne lo storico. La colonna Stagioni appare dalla seconda stagione e conta solo quelle fino alla stagione scelta.</p>`;
  }
  const matchLine = m=>{const f=fixture(m);return `<div class="result-line clickable" data-match="${esc(m.id)}"><div><div class="opponent">${esc(f.home)} <span class="muted">vs</span> ${esc(f.away)}</div><div class="meta">${localeDate(m.date)} · ${esc(m.venue==='T'?'Trasferta':'Casa')} · ${esc(m.competition||'Campionato')}${positiveInt(m.ownGoalsFor)?` · ${positiveInt(m.ownGoalsFor)} autogol a favore`:''}</div></div><div class="results-head"><span class="chip ${matchResult(m)==='W'?'success':matchResult(m)==='D'?'warning':'danger'}">${resultLabel(matchResult(m))}</span><span class="score">${f.homeGoals} : ${f.awayGoals}</span></div></div>`;};
  function renderMatches() {
    const s=activeSeason(), matches=seasonMatches(s.id),t=seasonTotals(s.id);
    return intro('CALENDARIO E RISULTATI','Partite della stagione',`Risultati e distinte archiviate · ${s.name}`,`<button class="btn btn-secondary only-editor" data-action="import-results">⇧ Importa risultati CSV</button>${newMatchButton()}`)+banner()+
      `<div class="stats-grid">${[['GIOCATE',t.matches,'🏟','Partite archiviate','accent-blue'],['VITTORIE',t.win,'🏆','Risultati vincenti','accent-green'],['PAREGGI',t.draw,'🤝','Partite in parità','accent-yellow'],['SCONFITTE',t.loss,'📉','Partite perse','accent-red']].map(([lab,val,icon,foot,color])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-card-label">${lab}</div><div class="stat-value ${color}">${val}</div><div class="stat-foot">${foot}</div></div>`).join('')}</div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">Elenco incontri</h2><span class="panel-caption">${matches.length} partite · ordine cronologico (dalla più vecchia)</span></div>${matches.length?matches.map(matchLine).join(''):empty('⚽','Non sono ancora state registrate partite','Le nuove partite incrementeranno automaticamente presenze, convocazioni e statistiche.')}</div>`;
  }
  function renderRankings() {
    const s=activeSeason(), st=statsForSeason(s.id);
    const sections=[['⚽ Marcatori','goalsFor','Reti segnate'],['🎯 Assist','assists','Passaggi decisivi'],['📋 Convocazioni','called','Chiamate in squadra'],['👟 Presenze','played','Partite disputate'],['🟨 Cartellini gialli','yellow','Ammonizioni'],['🟥 Cartellini rossi','red','Espulsioni']];
    return intro('RECORD INDIVIDUALI','Statistiche giocatori',`I protagonisti della ${s.name.toLowerCase()}.`)+banner()+`<div class="panel-grid">${sections.map(([title,key,desc])=>`<div class="panel"><div class="panel-heading"><div><h2 class="panel-title">${title}</h2><span class="panel-caption">${desc}</span></div></div>${bars(byKey(st,key).filter(p=>p[key]>0).slice(0,8),key,key==='assists'||key==='played')}</div>`).join('')}</div>`;
  }

  // --- Campionato CSI Parma: dati importati dall'utente, NON letti automaticamente da Tuttocampo ---
  const LEAGUE_SOURCE='https://www.tuttocampo.it/EmiliaRomagna/PR/AmatoriCSI/GironeACalcioa7OpenBParma';
  const leagueLatest=(rows,sid)=>{
    const selected=(rows||[]).filter(r=>r.seasonId===sid);
    if(!selected.length)return {batch:'',rows:[]};
    const batch=[...new Set(selected.map(r=>r.batch))].sort().at(-1);
    return {batch,rows:selected.filter(r=>r.batch===batch)};
  };
  // Widget ufficiali Tuttocampo: URL verificati, mai incorporare codice HTML arbitrario.
  const LEAGUE_WIDGET_TYPES=['Classifica','Risultati','Partite'];
  function leagueWidgetUrl(raw,kind='') {
    let value=String(raw||'').trim();
    if(!value)return '';
    // Accetta sia il link diretto sia il codice iframe fornito dal generatore Tuttocampo.
    const src=value.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if(src)value=src[1].replace(/&amp;/gi,'&');
    let url;
    try{url=new URL(value);}catch(_){throw new Error('Inserisci il link del widget Tuttocampo oppure il suo codice iframe.');}
    if(url.protocol!=='https:'||!['www.tuttocampo.it','tuttocampo.it'].includes(url.hostname))
      throw new Error('Sono accettati soltanto widget HTTPS del dominio tuttocampo.it.');
    const match=url.pathname.match(/^\/(Widget|WidgetV2)\/(Classifica|Risultati|Partite|Calendario)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i);
    if(!match)throw new Error('Il collegamento non è un widget Tuttocampo valido (Classifica, Risultati o Partite).');
    const normalized=match[2].toLowerCase();
    if(kind && normalized!==kind.toLowerCase() && !(kind==='Partite' && normalized==='calendario'))
      throw new Error(`Il campo ${kind} richiede il widget ${kind} del girone, non ${match[2]}.`);
    // Scarta query-string, frammenti e parametri non previsti.
    return `https://www.tuttocampo.it/${match[1]}/${match[2]}/${match[3]}`;
  }
  const getLeagueWidget=(sid,type)=>{
    const entry=(state.data.leagueWidgets||[]).find(x=>x.seasonId===sid&&x.type===type);
    try{return leagueWidgetUrl(entry?.url||'',type);}catch(_){return '';}
  };
  const embedLeagueWidget=(url,title,type)=>`<div class="league-embed-wrap"><div class="league-embed-head"><span class="league-embed-mark">Dati Tuttocampo</span><span>Aggiornamento gestito dalla fonte</span></div><iframe class="league-embed league-embed-${type.toLowerCase()}" src="${esc(url)}" title="${esc(title)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  const leagueStamp=batch=>batch?new Date(batch).toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'}):'Nessuna importazione';
  function renderLeague() {
    const season=activeSeason(),standings=leagueLatest(state.data.leagueStandings,season.id),fixtures=leagueLatest(state.data.leagueFixtures,season.id);
    const standingsRows=[...standings.rows].sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.team.localeCompare(b.team,'it'));
    const fixtureRows=[...fixtures.rows].sort((a,b)=>String(a.date).localeCompare(String(b.date))||num(a.round)-num(b.round)||a.home.localeCompare(b.home,'it'));
    const widgetClassifica=getLeagueWidget(season.id,'Classifica');
    const widgetRisultati=getLeagueWidget(season.id,'Risultati');
    const widgetPartite=getLeagueWidget(season.id,'Partite');
    const widgetMode=!!(widgetClassifica||widgetRisultati||widgetPartite);
    const heading=intro('CSI PARMA · CALCIO A 7 OPEN B · GIRONE A','Campionato',`Classifica, calendario e risultati · ${season.name}`,
      `<button class="btn btn-primary only-editor" data-action="league-widgets">⚙ Collega widget</button>`);
    const sourcePanel=widgetMode?
      `<div class="league-source"><div><strong>Campionato integrato</strong><p>I widget ufficiali mostrano i dati all'interno di Expats F.C. Gli aggiornamenti dipendono da Tuttocampo; la stagione è configurata separatamente.</p></div><span class="chip success">Widget collegati</span></div>`:
      `<div class="league-source"><div><strong>Campionato nella tua app</strong><p>Per visualizzare qui la classifica e le partite sempre aggiornate, collega una sola volta i widget ufficiali del girone dal pulsante “Collega widget”. In alternativa puoi usare le importazioni CSV già disponibili.</p></div><span class="chip neutral">Fonte da collegare</span></div>`;
    const tabs=`<div class="league-tabs" role="tablist" aria-label="Sezioni campionato"><button type="button" role="tab" aria-selected="${state.leagueTab==='classifica'}" class="${state.leagueTab==='classifica'?'selected':''}" data-action="league-tab" data-tab="classifica">Classifica</button><button type="button" role="tab" aria-selected="${state.leagueTab==='calendario'}" class="${state.leagueTab==='calendario'?'selected':''}" data-action="league-tab" data-tab="calendario">Calendario e risultati</button></div>`;
    const sourceCredit=`<p class="league-credit">Fonte dei widget: Tuttocampo. I dati visualizzati nel riquadro esterno sono gestiti dalla fonte, non vengono copiati nelle statistiche dei giocatori. Se un widget non carica, verifica il codice di incorporamento fornito da Tuttocampo.</p>`;
    if(state.leagueTab==='classifica'){
      if(widgetClassifica)return heading+banner()+sourcePanel+tabs+`<div class="panel league-embedded-panel"><div class="panel-heading"><h2 class="panel-title">Classifica · ${esc(season.name)}</h2></div>${embedLeagueWidget(widgetClassifica,'Classifica CSI Parma '+season.name,'Classifica')}</div>`+sourceCredit;
      const body=standingsRows.length?`<div class="table-shell"><table class="data-table league-table"><thead><tr><th>POS.</th><th>Squadra</th><th>PG</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>PT</th></tr></thead><tbody>${standingsRows.map((r,i)=>`<tr class="${/expats\s*f\.?c\.?/i.test(r.team)?'league-expats':''}"><td class="league-rank">${i+1}</td><td class="league-team">${esc(r.team)}</td><td>${r.pg}</td><td>${r.win}</td><td>${r.draw}</td><td>${r.loss}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf-r.ga}</td><td class="league-points">${esc(r.pts)}</td></tr>`).join('')}</tbody></table></div>`:empty('🏆','Classifica non ancora collegata','Collega il widget Classifica del girone per visualizzare i dati automaticamente qui dentro.');
      return heading+banner()+sourcePanel+tabs+`<div class="panel"><div class="panel-heading"><div><h2 class="panel-title">Classifica · ${esc(season.name)}</h2><span class="panel-caption">${standingsRows.length} squadre · Ultima importazione: ${leagueStamp(standings.batch)}</span></div><button class="btn btn-secondary only-editor" data-action="league-import" data-kind="classifica">⇧ CSV</button></div>${body}</div>`+sourceCredit;
    }
    if(widgetPartite||widgetRisultati){
      const parts=[];
      if(widgetRisultati)parts.push(`<div class="panel league-embedded-panel"><div class="panel-heading"><h2 class="panel-title">Risultati · ${esc(season.name)}</h2></div>${embedLeagueWidget(widgetRisultati,'Risultati CSI Parma '+season.name,'Risultati')}</div>`);
      if(widgetPartite)parts.push(`<div class="panel league-embedded-panel"><div class="panel-heading"><h2 class="panel-title">Calendario e partite · ${esc(season.name)}</h2></div>${embedLeagueWidget(widgetPartite,'Partite CSI Parma '+season.name,'Partite')}</div>`);
      return heading+banner()+sourcePanel+tabs+parts.join('')+sourceCredit;
    }
    const rows=fixtureRows.length?`<div class="table-shell"><table class="data-table league-table"><thead><tr><th>Giornata</th><th>Data</th><th>Casa</th><th>Risultato</th><th>Trasferta</th></tr></thead><tbody>${fixtureRows.map(r=>`<tr class="${/expats\s*f\.?c\.?/i.test(r.home+' '+r.away)?'league-expats':''}"><td>${esc(r.round||'—')}</td><td>${r.date?esc(localeDate(r.date)):'Da definire'}</td><td class="league-team">${esc(r.home)}</td><td class="league-score">${r.hg===null||r.ag===null?'–':`${r.hg} – ${r.ag}`}</td><td class="league-team">${esc(r.away)}</td></tr>`).join('')}</tbody></table></div>`:empty('📅','Calendario non ancora collegato','Collega il widget Risultati e/o Partite del girone per visualizzare il campionato automaticamente qui dentro.');
    return heading+banner()+sourcePanel+tabs+`<div class="panel"><div class="panel-heading"><div><h2 class="panel-title">Calendario e risultati · ${esc(season.name)}</h2><span class="panel-caption">${fixtureRows.length} incontri · Ultima importazione: ${leagueStamp(fixtures.batch)}</span></div><button class="btn btn-secondary only-editor" data-action="league-import" data-kind="calendario">⇧ CSV</button></div>${rows}</div>`+sourceCredit;
  }
  function leagueWidgetsDialog(){
    if(!editor())return;
    const season=activeSeason();
    const widgets=Object.fromEntries(LEAGUE_WIDGET_TYPES.map(type=>[type,getLeagueWidget(season.id,type)]));
    const fields=LEAGUE_WIDGET_TYPES.map(type=>`<div class="field"><label for="league-widget-${type}">Widget ${type}</label><textarea id="league-widget-${type}" class="form-control league-widget-input" rows="2" spellcheck="false" placeholder="Incolla l'indirizzo https://www.tuttocampo.it/WidgetV2/${type}/... oppure il codice iframe">${esc(widgets[type])}</textarea></div>`).join('');
    modal('Collega i widget ufficiali del campionato',`<div class="modal-explainer">Stagione <strong>${esc(season.name)}</strong>. Sul sito Tuttocampo apri il girone CSI Parma, vai alla funzione <strong>Widget / API</strong> e copia i codici per <strong>Classifica</strong>, <strong>Risultati</strong> e <strong>Partite</strong> dello stesso girone. Incollali qui. È sufficiente farlo una volta per stagione: tutti i visitatori vedranno i dati dentro Expats F.C.</div><div class="field-grid">${fields}</div><p class="notice">Accettiamo soltanto widget ufficiali di tuttocampo.it; non incollare l'URL della pagina generale del campionato, perché non è un widget. Lascia vuoto un campo se non è disponibile. Non vengono importate automaticamente le statistiche dei giocatori.</p>`,
    `<button class="btn btn-primary" data-action="league-widgets-save">Salva collegamenti su Google Drive</button>`,true);
  }
  async function leagueWidgetsSave(){
    if(!editor())return;
    const seasonId=state.seasonId;
    const rows=[];
    try {
      for(const type of LEAGUE_WIDGET_TYPES){
        const source=document.getElementById('league-widget-'+type)?.value||'';
        rows.push({type,url:leagueWidgetUrl(source,type)});
      }
    }catch(err){toast(safeError(err),true);return;}
    const operations=rows.map(r=>{
      const old=(state.data.leagueWidgets||[]).find(x=>x.seasonId===seasonId&&x.type===r.type);
      return {sheet:'CampionatoWidget',...(old?{row:old._row}:{}),rows:[[seasonId,r.type,r.url,new Date().toISOString()]]};
    });
    const ok=await withBusy(()=>writeAtomic(operations));
    if(ok){state.leagueTab='classifica';navigate('league');}
  }
  function leagueImportDialog(kind){
    if(!editor())return;
    if(!['classifica','calendario'].includes(kind))return;
    state.leagueImport=null;
    const header=kind==='classifica'?'Squadra;PG;V;N;P;GF;GS;Punti':'Giornata;Data;Casa;Trasferta;GolCasa;GolTrasferta';
    const example=kind==='classifica'?'Squadra Esempio;3;2;1;0;8;4;7':'1;2026-10-01;Squadra Casa;Squadra Trasferta;2;1';
    const body=`<div class="modal-explainer">Importazione <strong>${kind==='classifica'?'classifica':'calendario e risultati'}</strong> nella stagione <strong>${esc(activeSeason().name)}</strong>. I dati sono copiati dalla fonte esterna: l'app non interroga automaticamente Tuttocampo. Ogni importazione sostituisce la vista precedente senza cancellarne le vecchie versioni dal foglio.</div><div class="field"><label for="league-csv-file">File CSV (opzionale)</label><input class="form-control" id="league-csv-file" type="file" accept=".csv,.txt,text/csv,text/plain"></div><div class="field" style="margin-top:14px"><label for="league-csv-paste">CSV con intestazioni</label><textarea class="form-control csv-input" id="league-csv-paste" rows="9" placeholder="${esc(header+'\n'+example)}"></textarea></div><p class="notice">Le righe di esempio sono soltanto un modello. Nessun dato verrà salvato senza conferma. Separatore ; , oppure TAB.</p><div id="league-import-preview" aria-live="polite"></div>`;
    modal(kind==='classifica'?'Importa classifica':'Importa calendario e risultati',body,`<button class="btn btn-secondary" data-action="league-download" data-kind="${kind}">↓ Modello CSV</button><button class="btn btn-secondary" data-action="league-validate" data-kind="${kind}">Verifica</button><button class="btn btn-primary" id="league-import-save" data-action="league-save" data-kind="${kind}" disabled>Salva su Google Drive</button>`,true);
  }
  function leagueParseCsv(text,kind){
    const input=String(text||'').replace(/^\uFEFF/,'').trim();if(!input)throw new Error('Incolla il CSV o carica un file.');
    const first=input.split(/\r?\n/,1)[0];const delimiter=[';','\t',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
    const raw=[];let row=[],col='',quoted=false;
    for(let i=0;i<input.length;i++){
      const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){col+='"';i++;}else quoted=!quoted;}
      else if(c===delimiter&&!quoted){row.push(col.trim());col='';}
      else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(col.trim());if(row.some(Boolean))raw.push(row);row=[];col='';}
      else col+=c;
    }
    if(quoted)throw new Error('CSV non valido: virgolette non chiuse.');row.push(col.trim());if(row.some(Boolean))raw.push(row);
    if(raw.length<2)throw new Error('Occorrono intestazione e almeno una riga.');
    const canonical=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const header=raw.shift().map(canonical);
    const aliases=kind==='classifica'?{
      team:['squadra','team'],pg:['pg','giocate','partitegiocate'],win:['v','vittorie'],draw:['n','pareggi','x'],loss:['p','sconfitte'],gf:['gf','golfatti'],ga:['gs','golsubiti'],pts:['punti','pt','pts','punteggio']
    }:{round:['giornata','turno','giorno'],date:['data','date'],home:['casa','squadracasa','home'],away:['trasferta','squadratrasferta','away'],hg:['golcasa','golhome','gc'],ag:['goltrasferta','golaway','gt']};
    const idx={};for(const [key,names] of Object.entries(aliases)){idx[key]=header.findIndex(x=>names.includes(x));if(idx[key]===-1)throw new Error('Colonna mancante: '+names[0]);}
    const isInt=x=>/^\d{1,3}$/.test(String(x));
    const seen=new Set();return raw.map((r,i)=>{
      const at=key=>String(r[idx[key]]??'').trim();let value;
      if(kind==='classifica'){
        if(!at('team')||!['pg','win','draw','loss','gf','ga','pts'].every(k=>isInt(at(k))))throw new Error(`Riga ${i+2}: dati classifica mancanti o non validi.`);
        value={team:at('team'),pg:Number(at('pg')),win:Number(at('win')),draw:Number(at('draw')),loss:Number(at('loss')),gf:Number(at('gf')),ga:Number(at('ga')),pts:Number(at('pts'))};
        if(value.win+value.draw+value.loss!==value.pg)throw new Error(`Riga ${i+2}: V+N+P deve essere uguale a PG.`);
        if(value.pts>3*value.pg)throw new Error(`Riga ${i+2}: punti superiori al massimo teorico.`);
      }else{
        const dt=at('date'),date=dt?padDate(dt):'';
        if(!at('home')||!at('away')||at('home').toLowerCase()===at('away').toLowerCase()||dt&&!/^\d{4}-\d{2}-\d{2}$/.test(date)|| !([at('hg'),at('ag')].every(x=>!x)||[at('hg'),at('ag')].every(isInt)))throw new Error(`Riga ${i+2}: calendario o risultato non valido.`);
        value={round:at('round'),date,home:at('home'),away:at('away'),hg:at('hg')===''?null:Number(at('hg')),ag:at('ag')===''?null:Number(at('ag'))};
      }
      const key=kind==='classifica'?value.team.toLocaleLowerCase('it'):[value.round,value.date,value.home.toLocaleLowerCase('it'),value.away.toLocaleLowerCase('it')].join('|');
      if(seen.has(key))throw new Error(`Riga ${i+2}: voce duplicata.`);seen.add(key);return value;
    });
  }
  function leagueValidate(kind){
    const output=$('#league-import-preview');if(!output)return;
    try{
      const csv=$('#league-csv-paste').value,rows=leagueParseCsv(csv,kind);
      if(rows.length>500)throw new Error('Massimo 500 righe per importazione.');
      state.leagueImport={kind,rows,seasonId:state.seasonId,csv};
      output.innerHTML=`<p class="league-import-ok">✓ ${rows.length} ${kind==='classifica'?'squadre':'partite'} valide. Verrà salvata una nuova versione dei dati.</p>`;
      $('#league-import-save').disabled=false;
    }catch(e){state.leagueImport=null;output.textContent=safeError(e);output.className='import-error';$('#league-import-save').disabled=true;}
  }
  async function leagueSave(kind){
    if(!editor()||!state.leagueImport||state.leagueImport.kind!==kind)return;
    let rows;try{rows=leagueParseCsv($('#league-csv-paste').value,kind)}catch(e){toast(safeError(e),true);return;}
    if(state.leagueImport.csv!==$('#league-csv-paste').value||state.leagueImport.seasonId!==state.seasonId||JSON.stringify(rows)!==JSON.stringify(state.leagueImport.rows)){
      leagueValidate(kind);toast('Dati modificati: controlla nuovamente prima del salvataggio.',true);return;
    }
    const importId=new Date().toISOString(),sid=state.seasonId;
    const sheet=kind==='classifica'?'CampionatoClassifica':'CampionatoPartite';
    const values=kind==='classifica'?rows.map(r=>[sid,importId,r.team,r.pg,r.win,r.draw,r.loss,r.gf,r.ga,r.pts]):rows.map(r=>[sid,importId,r.round,r.date,r.home,r.away,r.hg??'',r.ag??'']);
    const ok=await withBusy(()=>writeAtomic([{sheet,rows:values}]));
    if(ok){state.leagueTab=kind==='classifica'?'classifica':'calendario';navigate('league');}
  }
  function leagueDownload(kind){
    const text=kind==='classifica'?'Squadra;PG;V;N;P;GF;GS;Punti\r\nSquadra Esempio;3;2;1;0;8;4;7\r\n':'Giornata;Data;Casa;Trasferta;GolCasa;GolTrasferta\r\n1;2026-10-01;Squadra Casa;Squadra Trasferta;2;1\r\n2;2026-10-08;Squadra Trasferta;Squadra Casa;;\r\n';
    const url=URL.createObjectURL(new Blob(['\ufeff'+text.replaceAll('\\r\\n','\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=el('a',{href:url,download:`expats-fc-campionato-${kind}-modello.csv`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }

  function renderSeasons() {
    const seasons=[...state.data.seasons].sort((a,b)=>String(b.start||b.name).localeCompare(String(a.start||a.name)));
    return intro('ALBO STAGIONALE','Archivio stagioni','Ogni stagione conserva statistiche e risultati separati.',`<button class="btn btn-primary only-editor" data-action="new-season">＋ Nuova stagione</button>`)+banner()+
      `<div class="season-grid">${seasons.map(s=>{const t=seasonTotals(s.id);return `<div class="season-card"><div class="eyebrow">STAGIONE</div><h3>${esc(s.name)}</h3><p>${s.start?localeDate(s.start):'Inizio da definire'} ${s.end?`— ${localeDate(s.end)}`:''}</p><div class="mini-summary"><div><strong>${t.matches}</strong><span>Partite</span></div><div><strong>${t.goals}</strong><span>Gol singoli</span></div><div><strong>${t.assists}</strong><span>Assist</span></div></div><div class="season-bottom mt-20"><span class="chip ${s.id===state.seasonId?'success':'neutral'}">${s.id===state.seasonId?'Selezionata':'Archiviata'}</span><div class="season-card-buttons"><button class="btn btn-secondary btn-small only-editor" data-action="edit-season" data-id="${esc(s.id)}">Modifica</button><button class="btn btn-secondary btn-small" data-season="${esc(s.id)}">Visualizza</button></div></div></div>`}).join('')}</div><p class="notice mt-20">Il numero di stagioni conta i tesseramenti e le partecipazioni documentate. Modifica un giocatore per scegliere le sue stagioni; maglia, ruolo e stato sono propri di ogni stagione, anche quando visualizzi anni precedenti.</p>`;
  }
  function renderSettings() {
    return intro('CONNESSIONE E DATI','Configurazione','Gestione del collegamento con il foglio Google e stato del progetto.')+banner()+
    `<div class="two-cards"><div class="panel"><div class="panel-heading"><h2 class="panel-title">🔐 Stato connessione</h2></div><div class="breakdown"><div><span>Versione applicazione</span><strong>${VERSION}</strong></div><div><span>Origine dati</span><strong>${state.source==='drive'?'Google Drive':'Demo locale'}</strong></div><div><span>Modalità</span><strong>${editor()?'Google OAuth attivo':'Sola consultazione'}</strong></div><div><span>Archivio</span><strong>${CFG.spreadsheetId?'Configurato':'Da configurare'}</strong></div></div><p class="notice">Le autorizzazioni di scrittura non sono affidate al sito GitHub: le controlla Google tramite i permessi del foglio.</p></div>
      <div class="panel"><div class="panel-heading"><h2 class="panel-title">📂 Dove sono salvati i dati?</h2></div><p class="form-guide">Tutte le informazioni sono conservate in un unico Google Sheets nel tuo Drive, diviso in 11 schede.</p><div class="breakdown">${SHEETS.map(s=>`<div><span>${esc(s)}</span><strong>Google Sheets</strong></div>`).join('')}</div>${CFG.spreadsheetId?`<p><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(CFG.spreadsheetId)}/edit">Apri archivio Google Sheets ↗</a></p>`:''}</div></div>
    <div class="panel mt-20"><div class="panel-heading"><h2 class="panel-title">🎨 Ruoli, stati e colori</h2></div><p class="form-guide">Personalizza ruoli e stati, compreso il colore di ciascuno. Il tipo Portiere resta un attributo dei ruoli. Le scelte sono memorizzate su Google Sheets e sono valide per tutti.</p><div class="intro-buttons"><button class="btn btn-secondary only-editor" data-action="manage-roles">Gestisci ruoli e colori</button><button class="btn btn-secondary only-editor" data-action="manage-states">Gestisci stati e colori</button></div><div class="catalog-overview">${availableRoles().map(x=>roleBadge(x.name)).join(' ')}${availableStates().map(x=>statusBadge(x.id)).join(' ')}</div></div>
    <div class="panel mt-20"><div class="panel-heading"><h2 class="panel-title">🚀 Messa online</h2></div><div class="two-cards"><div class="info-step"><h3>1. Aggiorna il database esistente</h3><p>Solo se parti da una versione precedente alla v1.11 esegui <strong>aggiornaDatabaseV111</strong> in Apps Script: aggiunge le colonne per il ruolo partita e per distinguere gol fatti/subiti, preservando i dati. Da versioni precedenti alla v1.9 occorre prima aggiornare lo schema AutogolFavore.</p></div><div class="info-step"><h3>2. Conserva l’accesso Google</h3><p>Se l’app è già collegata a Google, non modificare <strong>config.js</strong> né l’ID client OAuth: rimangono validi.</p></div><div class="info-step"><h3>3. Aggiorna alla v1.16</h3><p>Esegui <strong>aggiornaDatabaseV116</strong> in Apps Script, poi sostituisci <strong>index.html, app.js, styles.css e demo.js</strong>. Le nuove schede Campionato non modificano la rosa, le partite o le statistiche Expats. Conserva config.js.</p></div><div class="info-step"><h3>4. Importa risultati 2025/26</h3><p>Seleziona 2025/26 → Partite e risultati → Importa risultati CSV. Puoi modificare risultato e distinta cliccando una partita; le statistiche già nel pregresso possono essere assorbite senza duplicazioni.</p></div></div><p class="notice mt-20">Per tutte le istruzioni operative, vedere il file LEGGIMI.md incluso nel progetto.</p></div>`;
  }
  function render() {
    if(!state.data.seasons.some(s=>s.id===state.seasonId)) state.seasonId=defaultSeason()?.id||'';
    renderNav();
    const content=({dashboard:renderDashboard,players:renderPlayers,matches:renderMatches,rankings:renderRankings,league:renderLeague,seasons:renderSeasons,settings:renderSettings}[state.view]||renderDashboard)();
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
    const body=`<div class="profile-hero"><div class="player-portrait">${playerJerseys(p,true,state.seasonId)}</div><div><div class="eyebrow">SCHEDA GIOCATORE</div><h3 class="profile-title">${esc(name(p))}</h3>${statusBadge(p.status)} <span class="profile-role-badges">${roleBadge(p.role)}</span></div></div><div class="profile-stats">${[['Convocazioni',p.called],['Presenze',p.played],['Gol',rosterGoalText(p)],['Assist',p.assists],['Gialli',p.yellow],['Rossi',p.red],...(isAfterFirstSeason(state.seasonId)?[['Stagioni',seasonsPlayed(p.id)]]:[])].map(([label,n])=>`<div><strong>${n}</strong><small>${label}</small></div>`).join('')}</div>${p.notes?`<p class="form-guide">${esc(p.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Statistiche registrate per partita</h3>${played.length?played.map(l=>{const m=state.data.matches.find(m=>m.id===l.matchId);return `<div class="result-line"><span>${esc(m?.opponent)} · ${localeDate(m?.date)}</span><span>${matchKeeper(l,state.seasonId)?'🧤 Portiere':'⚽ Movimento'} · Gol ${goalText(l)} · 🎯 ${positiveInt(l.assists)}</span></div>`}).join(''):'<p class="form-guide">Le statistiche pregresse sono aggregate; non è disponibile il dettaglio delle vecchie partite.</p>'}`;
    modal(name(p),body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-secondary only-editor" data-action="edit-baseline" data-id="${esc(p.id)}">Correggi pregresso</button><button class="btn btn-primary only-editor" data-action="edit-player" data-id="${esc(p.id)}">Modifica giocatore</button>${isMember(p.id,state.seasonId)?`<button class="btn btn-danger only-editor" data-action="remove-from-roster" data-id="${esc(p.id)}">Rimuovi dalla rosa ${esc(activeSeason().name)}</button>`:`<button class="btn btn-secondary only-editor" data-action="restore-to-roster" data-id="${esc(p.id)}">Reinserisci in rosa ${esc(activeSeason().name)}</button>`}`);
  }
  function playerForm(playerId='') {
    if(!editor()) {toast('Accedi con Google per modificare i dati.',true);return;}
    const p=state.data.players.find(p=>p.id===playerId);
    const options=(values,current,labels={})=>values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(labels[v]||v)}</option>`).join('');
    const shirtNumbers=Array.from({length:100},(_,i)=>i);
    const seasonal=state.data.seasons.map(season=>{
      const r=p?registration(p.id,season.id):null;
      const existing=p&&isMember(p.id,season.id);
      const values=r?seasonPlayer(p,season.id):existing?seasonPlayer(p,season.id):{number:0,keeperNumber:null,role:'',status:'ATTIVO'};
      const selectedRoles=rolesOf(values.role);
      const isDual=dualKitNeeded(values.role,p?.id,season.id);
      const roles=[...availableRoles(),...selectedRoles.filter(name=>!availableRoles().some(r=>r.name===name)).map(name=>({name,color:roleColor(name)}))];
      const statuses=availableStates().concat(values.status&&!availableStates().some(item=>item.id===values.status)?[{id:values.status,name:statusText(values.status)}]:[]);
      return `<div class="season-registration" data-season-id="${esc(season.id)}" data-player-id="${esc(p?.id||'')}"><label class="membership-option"><input type="checkbox" data-season-field="inRoster" ${p?(existing?'checked':''):(season.id===state.seasonId?'checked':'')}> <strong>${esc(season.name)}</strong> · In rosa</label>
        <div class="season-registration-fields"><div class="field"><label>${isKeeperRole(values.role)&&!hasOutfieldRole(values.role)?'Maglia arancione (portiere)':'Maglia azzurra / maglia principale'}</label><select class="form-control" data-season-field="number">${shirtNumbers.map(n=>`<option value="${n}" ${n===num(values.number)?'selected':''}>${n===0?'0 · senza numero':n}</option>`).join('')}</select></div>
        <div class="field"><label>Ruoli (selezione multipla)</label><div class="role-checkbox-list" role="group" aria-label="Ruoli ${esc(season.name)}">${roles.map(r=>`<label class="role-check-option"><input type="checkbox" data-season-field="role" value="${esc(r.name)}" ${selectedRoles.includes(r.name)?'checked':''}>${roleBadge(r.name)}</label>`).join('')}</div></div>
        <div class="field"><label>Stato</label><select class="form-control" data-season-field="status">${statuses.map(x=>`<option value="${esc(x.id)}" ${x.id===(values.status||'ATTIVO')?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="field dual-keeper-kit" ${isDual?'':'hidden'}><label>Maglia arancione (portiere)</label><select class="form-control" data-season-field="keeperNumber"><option value="" ${values.keeperNumber==null?'selected':''}>Stesso numero della maglia azzurra</option>${shirtNumbers.filter(n=>n>0).map(n=>`<option value="${n}" ${n===values.keeperNumber?'selected':''}>${n}</option>`).join('')}</select><small>Numero indipendente, valido solo per questa stagione.</small></div></div></div>`;
    }).join('');
    const form=`<form id="player-form"><div class="field-grid"><div class="field"><label for="p-firstName">Nome *</label><input class="form-control" name="firstName" id="p-firstName" value="${esc(p?.firstName||'')}" required maxlength="70"></div>
      <div class="field"><label for="p-lastName">Cognome *</label><input class="form-control" name="lastName" id="p-lastName" value="${esc(p?.lastName||'')}" required maxlength="70"></div>
      <div class="field full"><label>Maglia, ruoli e stato per stagione</label><small>Puoi assegnare più ruoli selezionando le caselle. Quando il giocatore fa anche il portiere, puoi assegnare due numeri di maglia diversi. Ogni stagione ha valori indipendenti. Modificare il 2026/27 non cambia il 2025/26. Puoi togliere la spunta a una stagione senza cancellarne lo storico.</small><div class="season-registration-list">${seasonal}</div></div>
      <div class="field full"><label for="p-notes">Note generali</label><textarea class="form-control" id="p-notes" name="notes" rows="3">${esc(p?.notes||'')}</textarea></div></div></form>`;
    modal(p?'Modifica giocatore':'Aggiungi giocatore',form,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-player" data-id="${esc(p?.id||'')}">Salva su Drive</button>`,true);
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
    const players=[...state.data.players].filter(p=>allIds.has(p.id)).map(p=>seasonPlayer(p,seasonId)).sort((a,b)=>num(a.number)-num(b.number)||name(a).localeCompare(name(b),'it'));
    const stored=new Map(state.data.lineups.filter(l=>l.matchId===match?.id).map(l=>[l.playerId,l]));
    return `<div class="lineup-controls"><button type="button" class="btn btn-secondary btn-small" data-action="mark-all-called">✓ Convoca tutti</button><button type="button" class="btn btn-secondary btn-small" data-action="clear-all-called">× Azzera convocazioni</button><span id="lineup-summary" class="lineup-summary" aria-live="polite"></span></div><p class="form-guide">Il ruolo della partita è indipendente da quello stagionale: puoi indicare “Portiere” anche per un giocatore normalmente di movimento. Le reti subite si attribuiscono ai portieri effettivamente presenti.</p><div class="roster-form"><div class="roster-header"><span style="text-align:left">GIOCATORE</span><span>RUOLO PARTITA</span><span>CONV.</span><span>PRES.</span><span>GOL</span><span>ASSIST</span><span>🟨</span><span>🟥</span></div>${players.map(p=>{const l=stored.get(p.id)||{};const keeper=matchKeeper({...l,playerId:p.id},seasonId);const goals=goalParts(l);return `<div class="roster-entry ${one(l.called)?'is-called':''}" data-player-id="${esc(p.id)}" data-keeper="${keeper?1:0}"><span class="player-label">${jersey(kitForMatch(p,keeper,seasonId),false,keeper)} ${esc(name(p))}${p.status==='INFORTUNATO'?'<small> · INFORTUNATO</small>':''}</span><select class="match-role-select" data-line="matchRole" aria-label="Ruolo in partita di ${esc(name(p))}"><option value="MOVIMENTO" ${!keeper?'selected':''}>Movimento</option><option value="PORTIERE" ${keeper?'selected':''}>🧤 Portiere</option></select><input type="checkbox" data-line="called" ${one(l.called)?'checked':''} aria-label="Convocato ${esc(name(p))}"><input type="checkbox" data-line="played" ${one(l.played)?'checked':''} aria-label="Presenza ${esc(name(p))}">${['goals','assists','yellow','red'].map(k=>`<input type="number" data-line="${k}" value="${k==='goals'?(keeper?goals.conceded:goals.scored):positiveInt(l[k])}" min="0" max="${k==='yellow'?2:k==='red'?1:99}" step="1" ${one(l.played)?'':'disabled'} aria-label="${k==='goals'&&keeper?'Gol subiti':statLabels[k]} ${esc(name(p))}">`).join('')}</div>`}).join('')}</div>${!players.length?'<p class="notice">Non ci sono giocatori tesserati in questa stagione: aggiungili dalla Rosa.</p>':''}`;
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
      <div class="field full"><label>Autogol a favore</label><input class="form-control" type="number" name="ownGoalsFor" min="0" max="99" step="1" value="${m?.ownGoalsFor??0}" required><small>Reti segnate dagli avversari nella propria porta: comprese nel risultato degli Expats, ma non assegnate a un marcatore.</small></div>
      <div class="field full"><label>Note partita</label><textarea class="form-control" name="notes" rows="2" maxlength="1000">${esc(m?.notes||'')}</textarea></div>
      <div class="field full"><label>Distinta giocatori</label><small>✓ Convocato = convocazione. ✓ Presenza = giocatore sceso in campo. Gol, assist e cartellini si abilitano dopo la presenza.</small>${lineupEditor(m,sid)}<div id="keeper-allocation" class="keeper-allocation" aria-live="polite"></div></div>
      <div class="field full"><label class="history-option"><input type="checkbox" name="baselineAbsorbed" ${absorbed?'checked':''}> <span><strong>Statistiche della distinta già comprese nel pregresso</strong><small>Usalo per ricostruire partite della 2025/26 già incluse nei totali importati: sposta i valori dal pregresso alla distinta senza aumentarli. Lascialo disattivo per partite nuove: aumenteranno le statistiche automaticamente.</small></span></label></div>
      </div></form>`;
    modal(m?'Modifica partita e distinta':'Registra nuova partita',body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-match">${m?'Salva modifiche e distinta':'Salva partita e distinta'}</button>`,true);
    syncKeeperGoals();
    updateLineupSummary();
  }
  function matchDetail(id) {
    const m=state.data.matches.find(m=>m.id===id);if(!m)return;
    const lines=state.data.lineups.filter(l=>l.matchId===id).sort((a,b)=>num(seasonPlayer(state.data.players.find(p=>p.id===a.playerId),m.seasonId)?.number)-num(seasonPlayer(state.data.players.find(p=>p.id===b.playerId),m.seasonId)?.number));
    const f=fixture(m);
    const body=`<div class="eyebrow">${localeDate(m.date)} · ${esc(m.competition||'Partita')}</div><h3 class="page-title" style="font-size:27px">${esc(f.home)} <span class="muted">vs</span> ${esc(f.away)} <span class="accent-green">${f.homeGoals} — ${f.awayGoals}</span></h3><p class="page-subtitle">${m.venue==='T'?'Trasferta':'Casa'} · ${resultLabel(matchResult(m))}</p>${positiveInt(m.ownGoalsFor)?`<p class="modal-explainer">⚽ Autogol a favore: <strong>${positiveInt(m.ownGoalsFor)}</strong> (non assegnati ai marcatori).</p>`:''}${m.notes?`<p class="modal-explainer">${esc(m.notes)}</p>`:''}<hr class="soft-rule"><h3 class="panel-title">Distinta e statistiche</h3><div class="table-shell mt-20"><table class="data-table" style="min-width:560px"><thead><tr><th>Giocatore</th><th>Ruolo partita</th><th>Conv.</th><th>Pres.</th><th>Gol</th><th>Assist</th><th>Gialli</th><th>Rossi</th></tr></thead><tbody>${lines.map(l=>{const p=state.data.players.find(p=>p.id===l.playerId);return `<tr><td>${esc(p?name(p):'Giocatore non trovato')}</td><td>${matchKeeper(l,m.seasonId)?'🧤 Portiere':'Movimento'}</td><td>${one(l.called)?'✓':'—'}</td><td>${one(l.played)?'✓':'—'}</td><td>${goalText(l)}</td><td>${positiveInt(l.assists)}</td><td>${positiveInt(l.yellow)}</td><td>${positiveInt(l.red)}</td></tr>`}).join('')}</tbody></table></div>${!lines.length?'<p class="form-guide">Nessuna distinta presente per questa partita. Puoi aggiungerla con Modifica partita e distinta.</p>':''}`;
    modal(`Partita contro ${m.opponent}`,body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-primary only-editor" data-action="edit-match" data-id="${esc(m.id)}">Modifica partita e distinta</button>`,true);
  }
  function editMatchForm(matchId) { matchForm(matchId); }
  function baselineForm(playerId) {
    if(!editor())return;
    const p=seasonPlayer(state.data.players.find(x=>x.id===playerId),state.seasonId);if(!p)return;
    const season=activeSeason();
    const st=statsForSeason(season.id).find(x=>x.id===playerId);
    const detail=state.data.lineups.filter(l=>l.playerId===playerId && state.data.matches.some(m=>m.id===l.matchId&&m.seasonId===season.id));
    const counted=Object.fromEntries(['called','played','goalsFor','goalsConceded','assists','yellow','red'].map(k=>[k,detail.reduce((sum,l)=>sum+(k==='goalsFor'?goalParts(l).scored:k==='goalsConceded'?goalParts(l).conceded:lineupStat(l,k,playerId)),0)]));
    const labels={called:'Convocazioni',played:'Presenze',goalsFor:'Gol segnati',goalsConceded:'Gol subiti',assists:'Assist',yellow:'Gialli',red:'Rossi'};
    const body=`<form id="baseline-form"><p class="modal-explainer">Imposta i TOTALI di ${esc(name(p))} nella stagione <strong>${esc(season.name)}</strong>. I gol fatti e quelli subiti sono indipendenti, anche per chi ha giocato una sola partita da portiere. I dati già in distinta vengono sottratti dal pregresso.</p><div class="field-grid">${Object.keys(labels).map(k=>`<div class="field"><label>${labels[k]} (di cui ${counted[k]} già registrati)</label><input class="form-control" name="${k}" type="number" min="${counted[k]}" max="9999" value="${st[k]}" required></div>`).join('')}</div></form>`;
    modal('Correggi statistiche · '+name(p),body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-baseline" data-id="${esc(playerId)}">Salva totali</button>`);
  }
  function importResultsForm() {
    if(!editor())return;
    const body=`<div class="modal-explainer">Importa <strong>solo i risultati</strong> storici, senza modificare convocazioni, presenze, gol e assist individuali già aggregati nel pregresso. Le partite duplicate (stessa stagione, data, avversario e campo) saranno scartate.</div><div class="field-grid"><div class="field full"><label>Stagione destinazione</label><select class="form-control" id="import-season">${state.data.seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===state.seasonId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field full"><label>Carica CSV (.csv o .txt)</label><input id="csv-file" type="file" accept=".csv,.txt,text/csv,text/plain" class="form-control"></div><div class="field full"><label>Oppure incolla il CSV (intestazione inclusa)</label><textarea id="csv-paste" class="form-control csv-input" rows="9" placeholder="Data;Avversario;Campo;GolFatti;GolSubiti;Competizione;Note;AutogolFavore&#10;2025-09-20;Avversari FC;C;3;1;Campionato;;1"></textarea></div></div><p class="form-guide">Colonne obbligatorie: Data (AAAA-MM-GG o GG/MM/AAAA), Avversario, Campo (C/T), GolFatti, GolSubiti. Competizione, Note e AutogolFavore facoltative. Gli autogol non possono superare i gol fatti. Separatore punto e virgola oppure virgola. Usa il pulsante di verifica per controllare i dati prima di importarli.</p><div id="import-preview" aria-live="polite"></div>`;
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
    const optional={competition:['competizione','torneo','campionato'],notes:['note','notes'],ownGoalsFor:['autogolfavore','autogolfatti','autogolafavore','ownGoalsFor'.toLowerCase()]};
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
      const rawOwn=cols.ownGoalsFor<0?'0':String(r[cols.ownGoalsFor]??'').trim()||'0';
      if(!/^\d{1,2}$/.test(rawOwn)||Number(rawOwn)>Number(gf))throw new Error('Riga CSV '+(i+2)+': autogol a favore non validi.');
      return {date:data,opponent:opp,venue,goalsFor:Number(gf),goalsAgainst:Number(ga),competition:cols.competition<0?'':String(r[cols.competition]||'').trim(),notes:cols.notes<0?'':String(r[cols.notes]||'').trim(),ownGoalsFor:Number(rawOwn)};
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
      holder.innerHTML=`<div class="import-summary"><strong>${parsed.rows.length} partite da importare</strong> · ${parsed.duplicates.length} duplicate ignorate</div><div class="table-shell"><table class="data-table"><thead><tr><th>Data</th><th>Avversario</th><th>Campo</th><th>Risultato (Casa–Trasferta)</th><th>Autogol a favore</th></tr></thead><tbody>${parsed.rows.slice(0,8).map(r=>`<tr><td>${esc(localeDate(r.date))}</td><td>${esc(r.opponent)}</td><td>${r.venue}</td><td>${r.venue==='T'?r.goalsAgainst:r.goalsFor} – ${r.venue==='T'?r.goalsFor:r.goalsAgainst}</td><td>${positiveInt(r.ownGoalsFor)}</td></tr>`).join('')}</tbody></table></div>`;
    }catch(error){state.importPreview=null;$('#execute-import').disabled=true;holder.textContent=safeError(error);holder.className='import-error';}
  }
  function downloadTemplate() {
    const text='\uFEFFData;Avversario;Campo;GolFatti;GolSubiti;Competizione;Note;AutogolFavore\r\n2025-09-20;Esempio FC;C;3;1;Campionato;;1\r\n';
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const a=el('a',{href:url,download:'expats-fc-modello-risultati.csv'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function exportCSV() {
    const fields=['number','keeperNumber','firstName','lastName','status','role',...(isAfterFirstSeason(state.seasonId)?['seasons']:[]),'called','played','goals','assists','yellow','red'];
    const labels=['N° progressivo','Maglia','Maglia portiere','Nome','Cognome','Stato','Ruolo',...(isAfterFirstSeason(state.seasonId)?['Stagioni']:[]),'Convocazioni','Presenze','Gol','Assist','Gialli','Rossi'];
    const escapeCSV = (v) => {
      let s=String(v ?? '');
      // Evita l'iniezione di formule nei programmi di calcolo.
      if (/^[\s]*[=+@\-\t\r]/.test(s) && isNaN(Number(s))) s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const rows=[labels,...playerRows().map((p,i)=>[i+1,...fields.map(k=>k==='seasons'?seasonsPlayed(p.id):k==='role'?rolesText(p.role):k==='goals'?rosterGoalText(p):p[k])])];
    const csv='\ufeff'+rows.map(row=>row.map(escapeCSV).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:`expats-fc-${state.seasonId}-v1.13.csv`});
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
    const ranges=response.valueRanges||[];
    const expected=[
      [3,9,['RuoloPartita','GolFatti','GolSubiti']],
      [4,8,['GolFatti','GolSubiti']]
    ];
    expected.push([5,6,['NumeroMagliaPortiere']]);
    expected.push([8,0,['StagioneID','ImportID','Squadra','PG','V','N','P','GF','GS','Punti']]);
    expected.push([9,0,['StagioneID','ImportID','Giornata','Data','Casa','Trasferta','GolCasa','GolTrasferta']]);
    expected.push([10,0,['StagioneID','Tipo','URL','AggiornatoIl']]);
    state.schemaReady=expected.every(([index,start,columns])=>columns.every((v,i)=>String(ranges[index]?.values?.[0]?.[start+i]||'').trim()===v));
    if(!state.schemaReady)throw new Error('Il database richiede la migrazione v1.16: esegui aggiornaDatabaseV116 in Apps Script prima di modificare i dati.');
    return decodeSheets(ranges.map(x=>(x.values||[]).slice(1)));
  }
  async function loadPublic() {
    const tables=await Promise.all(SHEETS.map((sheet,i)=>i<8?gvizSheet(sheet):gvizSheet(sheet).catch(()=>[])));
    return decodeSheets(tables);
  }
  function decodeSheets(arrays) {
    const [p,s,m,l,b,t,rr,ss,cc,cp,cw]=arrays;
    const trimmed=rows=>(rows||[]).filter(row=>row?.some(x=>String(x??'').trim()!==''));
    const str=x=>String(x??'').trim();
    const players=(p||[]).map((r,i)=>({id:str(r[0]),number:num(r[1]),firstName:str(r[2]),lastName:str(r[3]),status:str(r[4])||'ATTIVO',role:str(r[5]),notes:str(r[6]),_row:i+2})).filter(x=>x.id);
    const seasons=(s||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),start:padDate(r[2]),end:padDate(r[3]),_row:i+2})).filter(x=>x.id);
    if(!seasons.length)throw new Error('Il foglio Stagioni è vuoto. Esegui inizializzaDatabase() e importa almeno una stagione.');
    const matches=(m||[]).map((r,i)=>({id:str(r[0]),seasonId:str(r[1]),date:padDate(r[2]),opponent:str(r[3]),venue:str(r[4]),goalsFor:positiveInt(r[5]),goalsAgainst:positiveInt(r[6]),competition:str(r[7]),notes:str(r[8]),baselineAbsorbed:one(r[9]),ownGoalsFor:positiveInt(r[10]),_row:i+2})).filter(x=>x.id);
    const lineups=(l||[]).map((r,i)=>({id:str(r[0]),matchId:str(r[1]),playerId:str(r[2]),called:one(r[3]),played:one(r[4]),goals:Math.trunc(num(r[5])),assists:positiveInt(r[6]),yellow:positiveInt(r[7]),red:positiveInt(r[8]),matchRole:str(r[9]),goalsFor:r[10]!==''&&r[10]!=null?positiveInt(r[10]):null,goalsConceded:r[11]!==''&&r[11]!=null?positiveInt(r[11]):null,_row:i+2})).filter(x=>x.id);
    const baseline=(b||[]).map((r,i)=>({seasonId:str(r[0]),playerId:str(r[1]),called:positiveInt(r[2]),played:positiveInt(r[3]),goals:Math.trunc(num(r[4])),assists:positiveInt(r[5]),yellow:positiveInt(r[6]),red:positiveInt(r[7]),goalsFor:r[8]!==''&&r[8]!=null?positiveInt(r[8]):null,goalsConceded:r[9]!==''&&r[9]!=null?positiveInt(r[9]):null,_row:i+2})).filter(x=>x.playerId);
    const memberships=(t||[]).map((r,i)=>({seasonId:str(r[0]),playerId:str(r[1]),inRoster:one(r[2]),number:r.length>3?num(r[3]):null,role:r.length>4?str(r[4]):null,status:r.length>5?(str(r[5])||'ATTIVO'):null,keeperNumber:r[6]!==''&&r[6]!=null?positiveInt(r[6]):null,_row:i+2})).filter(x=>x.playerId);
    const roles=(rr||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),type:str(r[2])==='PORTIERE'?'PORTIERE':'MOVIMENTO',active:one(r[3]),color:safeColor(str(r[4])||rolePalette[i%rolePalette.length]),_row:i+2})).filter(x=>x.id);
    const states=(ss||[]).map((r,i)=>({id:str(r[0]),name:str(r[1]),color:safeColor(str(r[2])),active:one(r[3]),_row:i+2})).filter(x=>x.id);
    const leagueStandings=(cc||[]).map((r,i)=>({seasonId:str(r[0]),batch:str(r[1]),team:str(r[2]),pg:positiveInt(r[3]),win:positiveInt(r[4]),draw:positiveInt(r[5]),loss:positiveInt(r[6]),gf:positiveInt(r[7]),ga:positiveInt(r[8]),pts:num(r[9]),_row:i+2})).filter(x=>x.seasonId&&x.team&&x.batch);
    const leagueFixtures=(cp||[]).map((r,i)=>({seasonId:str(r[0]),batch:str(r[1]),round:str(r[2]),date:padDate(r[3]),home:str(r[4]),away:str(r[5]),hg:r[6]===''||r[6]==null?null:positiveInt(r[6]),ag:r[7]===''||r[7]==null?null:positiveInt(r[7]),_row:i+2})).filter(x=>x.seasonId&&x.home&&x.away&&x.batch);
    const leagueWidgets=(cw||[]).map((r,i)=>({seasonId:str(r[0]),type:str(r[1]),url:str(r[2]),updatedAt:str(r[3]),_row:i+2})).filter(x=>x.seasonId&&LEAGUE_WIDGET_TYPES.includes(x.type));
    return {players,seasons,matches,lineups,baseline,memberships,leagueStandings,leagueFixtures,leagueWidgets,roles:roles.length?roles:structuredClone(legacyRoles),states:states.length?states:structuredClone(legacyStates)};
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
      const token=state.token;state.token='';state.sheetIds={};state.schemaReady=false;
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
    if(!state.schemaReady)throw new Error('Aggiorna lo schema Google Sheets alla v1.16 eseguendo aggiornaDatabaseV116.');
    const requests=ops.filter(op=>op.rows?.length).map(op=>{
      const sheetId=state.sheetIds[op.sheet];
      if(sheetId===undefined)throw new Error('Scheda '+op.sheet+' mancante. Esegui aggiornaDatabaseV116 in Apps Script.');
      if(op.row) return {updateCells:{start:{sheetId,rowIndex:op.row-1,columnIndex:0},rows:op.rows.map(rowCells),fields:'userEnteredValue'}};
      return {appendCells:{sheetId,rows:op.rows.map(rowCells),fields:'userEnteredValue'}};
    });
    if(!requests.length)return;
    return googleAPI(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
  }
  function baselineRow(b,values) {
    const gf=positiveInt(values.goalsFor),gs=positiveInt(values.goalsConceded);
    return [b.seasonId,b.playerId,positiveInt(values.called),positiveInt(values.played),gf-gs,
      positiveInt(values.assists),positiveInt(values.yellow),positiveInt(values.red),gf,gs];
  }
  async function withBusy(fn) {
    if(state.busy || state.inlineSaving)return;
    state.busy=true;
    document.querySelectorAll('.inline-select,.role-editor-button').forEach(s=>{s.disabled=true;});
    document.querySelectorAll('#modal-root button[data-action^="save-"]').forEach(b=>{b.disabled=true;b.textContent='Salvataggio…';});
    try{await fn();closeModal();await refreshData();toast('Dati salvati su Google Drive.');return true;}
    catch(err){toast('Salvataggio non riuscito: '+safeError(err),true);document.querySelectorAll('#modal-root button[data-action^="save-"]').forEach(b=>{b.disabled=false;b.textContent='Riprova salvataggio';});return false;}
    finally{
      state.busy=false;
      // refreshData() ridisegna la rosa durante il salvataggio: riattivare i menu
      // esistenti nel DOM, non soltanto i vecchi nodi che sono stati sostituiti.
      document.querySelectorAll('.inline-select,.role-editor-button').forEach(s=>{s.disabled=false;});
    }
  }
  function playerRolesModal(playerId){
    if(!editor()||state.busy||state.inlineSaving)return;
    const base=state.data.players.find(p=>p.id===playerId);if(!base)return;
    const p=seasonPlayer(base,state.seasonId),selected=rolesOf(p.role);
    const choices=[...availableRoles(),...selected.filter(n=>!availableRoles().some(r=>r.name===n)).map(name=>({name,color:roleColor(name),inactive:true}))];
    const body=`<p class="modal-explainer">Seleziona uno o più ruoli per <strong>${esc(name(p))}</strong> nella stagione <strong>${esc(activeSeason().name)}</strong>. Ogni ruolo apparirà come badge colorato nella Rosa. Nessuna modifica alle altre stagioni.</p><div class="role-modal-list" role="group" aria-label="Ruoli del giocatore">${choices.map(r=>`<label class="role-modal-choice"><input type="checkbox" data-player-role="1" value="${esc(r.name)}" ${selected.includes(r.name)?'checked':''}>${roleBadge(r.name)}${r.inactive?'<small>Ruolo non più attivo</small>':''}</label>`).join('')}</div><p class="form-guide">I ruoli della rosa sono stagionali. Il ruolo effettivo e i gol fatti/subiti sono registrati separatamente in ogni partita.</p>`;
    modal('Ruoli · '+name(p),body,`<button class="btn btn-secondary" data-action="close-modal">Annulla</button><button class="btn btn-primary" data-action="save-player-roles" data-id="${esc(p.id)}">Salva ruoli</button>`);
  }
  async function savePlayerRoles(playerId){
    if(!editor()||state.busy||state.inlineSaving)return;
    const p=seasonPlayer(state.data.players.find(p=>p.id===playerId),state.seasonId);if(!p)return;
    const next=rolesValue([...document.querySelectorAll('#modal-root [data-player-role]:checked')].map(c=>c.value));
    if(rolesOf(next).some(n=>!availableRoles().some(r=>r.name===n)&&!includesRole(p.role,n))){toast('Ruolo non valido.',true);return;}
    if(rolesValue(p.role)===next){closeModal();return;}
    const old=registration(p.id,state.seasonId);
    await withBusy(()=>writeAtomic([{sheet:'Tesseramenti',...(old?{row:old._row}:{}),rows:[registrationValues(state.seasonId,p.id,isMember(p.id,state.seasonId),p.number,next,p.status,p.keeperNumber)]}]));
  }
  async function saveInline(select) {
    if(!editor()||state.busy||state.inlineSaving)return;
    const base=state.data.players.find(x=>x.id===select.dataset.id);if(!base)return;
    const p=seasonPlayer(base,state.seasonId);
    const col=select.dataset.inline==='status'?'status':'role';
    const next=select.value;
    if(col==='status'&&!availableStates().some(r=>r.id===next)) {toast('Seleziona uno stato valido.',true);return;}
    if(col==='role'&&next&&!availableRoles().some(r=>r.name===next)){toast('Seleziona un ruolo valido.',true);return;}
    if(p[col]===next)return;
    const previous=p[col];
    state.inlineSaving=true;
    document.querySelectorAll('.inline-select,.role-editor-button').forEach(s=>{s.disabled=true;});
    const old=registration(p.id,state.seasonId);
    const row=registrationValues(state.seasonId,p.id,isMember(p.id,state.seasonId),p.number,col==='role'?next:p.role,col==='status'?next:p.status,p.keeperNumber);
    try {
      await writeAtomic([{sheet:'Tesseramenti',...(old?{row:old._row}:{}),rows:[row]}]);
      await refreshData();toast('Valore aggiornato soltanto per '+activeSeason().name+'.');
    }catch(e){select.value=previous;toast('Modifica non salvata: '+safeError(e),true);}
    finally{
      state.inlineSaving=false;
      // La risposta da Google ricrea i select: sblocchiamo quelli correnti.
      document.querySelectorAll('.inline-select,.role-editor-button').forEach(s=>{s.disabled=false;});
    }
  }
  function catalogModal(kind) {
    if(!editor())return;
    const roles=kind==='roles';const items=(roles?state.data.roles:state.data.states).filter(x=>x.active);
    const body=`<p class="modal-explainer">${roles?'Aggiungi, rinomina o disattiva i ruoli e scegli il loro colore. Il tipo PORTIERE determina i gol negativi.':'Aggiungi, rinomina o disattiva gli stati e scegli liberamente il colore.'} Non è possibile eliminare una voce assegnata a un giocatore.</p><div class="catalog-list">${items.map(x=>`<div class="catalog-entry"><div>${roles?`${roleBadge(x.name)}<small>${x.type==='PORTIERE'?'Portiere':'Giocatore di movimento'} · ${esc(x.color||'#488fcf')}</small>`:`${statusBadge(x.id)} <small>${esc(x.color)}</small>`}</div><div><button class="btn btn-secondary btn-small" data-action="catalog-edit" data-kind="${kind}" data-id="${esc(x.id)}">Modifica</button><button class="btn btn-danger btn-small" data-action="catalog-delete" data-kind="${kind}" data-id="${esc(x.id)}">Rimuovi</button></div></div>`).join('')}</div>`;
    modal(roles?'Gestione ruoli e colori':'Gestione stati e colori',body,`<button class="btn btn-secondary" data-action="close-modal">Chiudi</button><button class="btn btn-primary" data-action="catalog-edit" data-kind="${kind}">＋ Aggiungi</button>`);
  }
  function catalogItemForm(kind,id='') {
    if(!editor())return;
    const roles=kind==='roles';const item=(roles?state.data.roles:state.data.states).find(x=>x.id===id);
    const body=`<form id="catalog-form"><div class="field-grid"><div class="field full"><label>Nome ${roles?'ruolo':'stato'} *</label><input class="form-control" name="name" required maxlength="45" value="${esc(item?.name||'')}"></div>${roles?`<div class="field full"><label>Tipo statistico</label><select name="type" class="form-control"><option value="MOVIMENTO" ${item?.type!=='PORTIERE'?'selected':''}>Giocatore di movimento</option><option value="PORTIERE" ${item?.type==='PORTIERE'?'selected':''}>Portiere (gol subiti negativi)</option></select><small>Cambiare il tipo dei ruoli già assegnati può rendere incompatibili i gol storici.</small></div><div class="field full"><label>Colore ruolo</label><input type="color" name="color" class="status-color-input" value="${safeColor(item?.color||'#488fcf')}"></div>`:`<div class="field full"><label>Colore stato</label><input type="color" name="color" class="status-color-input" value="${safeColor(item?.color||'#488fcf')}"></div>`}</div></form>`;
    modal(item?'Modifica '+(roles?'ruolo':'stato'):'Nuovo '+(roles?'ruolo':'stato'),body,`<button class="btn btn-secondary" data-action="${roles?'manage-roles':'manage-states'}">Indietro</button><button class="btn btn-primary" data-action="catalog-save" data-kind="${kind}" data-id="${esc(id)}">Salva</button>`);
  }
  async function saveCatalog(kind,id='') {
    if(!editor())return;
    const f=$('#catalog-form');if(!f?.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const nameNew=v.name.trim();const role=kind==='roles';const rows=role?state.data.roles:state.data.states;
    const old=rows.find(x=>x.id===id);
    if(rows.some(x=>x.active&&x.id!==id&&x.name.toLocaleLowerCase('it')===nameNew.toLocaleLowerCase('it'))){toast('Esiste già una voce con questo nome.',true);return;}
    const affectedReg=old?state.data.memberships.filter(m=>role?includesRole(m.role,old.name):m.status===old.id):[];
    const affectedLegacy=old?state.data.players.filter(p=>role?includesRole(p.role,old.name):p.status===old.id):[];
    if(role&&old&&old.type!==v.type && (state.data.baseline.some(b=>b.goals!==0&&(affectedReg.some(r=>r.playerId===b.playerId&&r.seasonId===b.seasonId)||(!registration(b.playerId,b.seasonId)&&affectedLegacy.some(p=>p.id===b.playerId))))||state.data.lineups.some(l=>l.goals!==0&&state.data.matches.some(m=>m.id===l.matchId&&(affectedReg.some(r=>r.playerId===l.playerId&&r.seasonId===m.seasonId)||(!registration(l.playerId,m.seasonId)&&affectedLegacy.some(p=>p.id===l.playerId))))))){
      toast('Impossibile cambiare il tipo: esistono gol storici riferiti al ruolo in una stagione.',true);return;
    }
    const itemId=old?.id||uid(role?'role':'status');
    const op={sheet:role?'Ruoli':'Stati',...(old?{row:old._row}:{}),rows:[role?[itemId,nameNew,v.type,1,safeColor(v.color)]:[itemId,nameNew,safeColor(v.color),1]]};
    const ops=[op];
    if(role&&old&&old.name!==nameNew){
      for(const r of affectedReg)ops.push({sheet:'Tesseramenti',row:r._row,rows:[registrationValues(r.seasonId,r.playerId,r.inRoster,r.number,rolesValue(rolesOf(r.role).map(n=>n===old.name?nameNew:n)),r.status,r.keeperNumber)]});
      for(const p of affectedLegacy)ops.push({sheet:'Giocatori',row:p._row,rows:[[p.id,p.number,p.firstName,p.lastName,p.status,rolesValue(rolesOf(p.role).map(n=>n===old.name?nameNew:n)),p.notes||'']]});
    }
    const ok=await withBusy(()=>writeAtomic(ops));if(ok)catalogModal(kind);
  }
  async function deleteCatalog(kind,id) {
    if(!editor())return;
    const role=kind==='roles';const item=(role?state.data.roles:state.data.states).find(x=>x.id===id);
    if(!item)return;
    if(state.data.memberships.some(m=>role?includesRole(m.role,item.name):m.status===item.id)||state.data.players.some(p=>role?includesRole(p.role,item.name):p.status===item.id)){toast('Voce usata in una o più stagioni: riassegnala prima di rimuoverla.',true);return;}
    if(!confirm(`Rimuovere ${item.name} dall’elenco delle opzioni?`))return;
    const row=role?[item.id,item.name,item.type,0,safeColor(item.color)]:[item.id,item.name,item.color,0];
    const ok=await withBusy(()=>writeAtomic([{sheet:role?'Ruoli':'Stati',row:item._row,rows:[row]}]));if(ok)catalogModal(kind);
  }
  async function setRosterMembership(playerId,add) {
    if(!editor()||state.busy)return;
    const base=state.data.players.find(x=>x.id===playerId),sid=state.seasonId;
    if(!base||!sid)return;
    const existing=registration(playerId,sid);
    // Nessun trasferimento automatico di numero, ruolo o stato dalle altre stagioni.
    const p=existing?seasonPlayer(base,sid):{...base,number:0,keeperNumber:null,role:'',status:'ATTIVO'};
    if(add){
      if(isMember(playerId,sid))return;
      const conflict=state.data.players.find(x=>x.id!==playerId&&p.number!==0&&seasonPlayer(x,sid).number===p.number&&isMember(x.id,sid));
      if(conflict){toast(`La maglia ${p.number} è già usata da ${name(conflict)} in questa stagione.`,true);return;}
    }else{
      if(!isMember(playerId,sid))return;
      if(!confirm(`Rimuovere ${name(base)} dalla rosa ${activeSeason().name}?\n\nLe partite e tutte le statistiche storiche resteranno archiviate.`))return;
    }
    const row=registrationValues(sid,playerId,add,p.number,p.role,p.status,p.keeperNumber);
    const ok=await withBusy(()=>writeAtomic([{sheet:'Tesseramenti',...(existing?{row:existing._row}:{}),rows:[row]}]));
    if(ok){state.rosterScope=add?'season':state.rosterScope;navigate('players');}
  }
  async function savePlayer(playerId) {
    if(!editor())return;
    const form=$('#player-form');if(!form?.reportValidity())return;
    const v=Object.fromEntries(new FormData(form).entries());
    if(!v.firstName.trim()||!v.lastName.trim()){toast('Nome e cognome obbligatori.',true);return;}
    const player=state.data.players.find(p=>p.id===playerId);
    const id=playerId||uid('p');
    const entries=[...form.querySelectorAll('.season-registration')].map(el=>{
      const get=field=>el.querySelector(`[data-season-field="${field}"]`);
      return {seasonId:el.dataset.seasonId,inRoster:get('inRoster').checked,number:positiveInt(get('number').value),role:rolesValue([...el.querySelectorAll('[data-season-field="role"]:checked')].map(x=>x.value)),status:get('status').value,keeperNumber:get('keeperNumber').value===''?null:positiveInt(get('keeperNumber').value)};
    });
    for(const r of entries){
      if(r.number>99||r.keeperNumber!=null&&(r.keeperNumber<1||r.keeperNumber>99)){toast('I numeri di maglia devono essere compresi tra 0 e 99.',true);return;}
      if(rolesOf(r.role).some(name=>!availableRoles().some(x=>x.name===name)&&!includesRole(registration(id,r.seasonId)?.role||player?.role,name))){toast('Uno dei ruoli selezionati non è valido.',true);return;}
      if(!availableStates().some(x=>x.id===r.status)){toast('Stato non valido.',true);return;}
      if(!r.inRoster)continue;
      const proposed=[r.number];
      if(dualKitNeeded(r.role,id,r.seasonId))proposed.push(r.keeperNumber??r.number);
      const duplicate=state.data.players.find(p=>{
        if(p.id===id||!isMember(p.id,r.seasonId))return false;
        const other=seasonPlayer(p,r.seasonId);
        const numbers=[other.number];
        if(dualKitNeeded(other.role,other.id,r.seasonId))numbers.push(keeperKitNumber(other));
        return proposed.some(n=>n>0&&numbers.includes(n));
      });
      if(duplicate){toast(`Numero di maglia già utilizzato da ${name(duplicate)} nella stagione ${state.data.seasons.find(s=>s.id===r.seasonId)?.name}.`,true);return;}
    }
    // La scheda Giocatori conserva solo identità e note; gli attributi legacy non vengono più modificati.
    const vals=[id,player?.number??0,v.firstName.trim(),v.lastName.trim(),player?.status||'ATTIVO',player?.role||'',(v.notes||'').trim()];
    const operations=[{sheet:'Giocatori',...(player?{row:player._row}:{}),rows:[vals]}];
    const appended=[];
    for(const r of entries){
      const old=registration(id,r.seasonId);
      if(old){
        if(old.inRoster!==r.inRoster||old.number!==r.number||old.role!==r.role||old.status!==r.status||(old.keeperNumber??null)!==r.keeperNumber)
          operations.push({sheet:'Tesseramenti',row:old._row,rows:[registrationValues(r.seasonId,id,r.inRoster,r.number,r.role,r.status,r.keeperNumber)]});
      }else if(r.inRoster||(player&&seasonEvidence(id,r.seasonId)))appended.push(registrationValues(r.seasonId,id,r.inRoster,r.number,r.role,r.status,r.keeperNumber));
    }
    if(appended.length)operations.push({sheet:'Tesseramenti',rows:appended});
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
    for(const key of ['called','played','goalsFor','goalsConceded','assists','yellow','red']) {
      const sum=detail.reduce((t,l)=>t+(key==='goalsFor'?goalParts(l).scored:key==='goalsConceded'?goalParts(l).conceded:lineupStat(l,key,playerId)),0);
      if(!/^\d+$/.test(v[key])||Number(v[key])<sum||Number(v[key])>9999){toast('Totale non valido per '+key+'.',true);return;}
      values[key]=Number(v[key])-sum;
    }
    if(Number(v.played)>Number(v.called)){toast('Le presenze non possono superare le convocazioni.',true);return;}
    const old=state.data.baseline.find(b=>b.playerId===playerId&&b.seasonId===sid);
    const row=baselineRow(old||{seasonId:sid,playerId},values);
    await withBusy(()=>writeAtomic([{sheet:'Pregresso',...(old?{row:old._row}:{}),rows:[row]}]));
  }
  async function importResults() {
    if(!editor())return;
    const checked=checkedImport();
    if(!checked.rows.length){toast('Nessuna nuova partita da importare.',true);return;}
    if(!state.importPreview || JSON.stringify(checked)!==JSON.stringify(state.importPreview)) {previewImport();toast('Controlla l’anteprima aggiornata prima di importare.',true);return;}
    const rows=checked.rows.map(m=>[uid('m'),checked.sid,m.date,m.opponent,m.venue,m.goalsFor,m.goalsAgainst,m.competition,m.notes,0,positiveInt(m.ownGoalsFor)]);
    const ok=await withBusy(()=>writeAtomic([{sheet:'Partite',rows}]));
    if(ok){state.seasonId=checked.sid;state.importPreview=null;navigate('matches');toast('Importate '+rows.length+' partite su Google Drive.');}
  }
  function collectLineup() {
    const rows=[...document.querySelectorAll('#match-form .roster-entry')];
    const all=rows.map(row=>{
      const get=k=>row.querySelector(`[data-line="${k}"]`);
      const keeper=get('matchRole').value==='PORTIERE';
      const played=get('played').checked;
      const n=played?positiveInt(get('goals').value):0;
      return {playerId:row.dataset.playerId,called:get('called').checked,played,
        matchRole:get('matchRole').value,goalsFor:keeper?0:n,goalsConceded:keeper?n:0,
        goals:keeper?-n:n,assists:positiveInt(get('assists').value),yellow:positiveInt(get('yellow').value),red:positiveInt(get('red').value)};
    });
    if(all.some(l=>(l.played&&!l.called)||(!l.played&&(l.goalsFor||l.goalsConceded||l.assists||l.yellow||l.red))))throw new Error('I giocatori con statistiche devono risultare presenti e convocati.');
    if(all.some(l=>l.yellow>2||l.red>1||l.goalsFor>99||l.goalsConceded>99||l.assists>99))throw new Error('Valori della distinta fuori limite.');
    return all;
  }
  function emptyLineup(l) {return !l.called&&!l.played&&!l.goalsFor&&!l.goalsConceded&&!l.assists&&!l.yellow&&!l.red;}
  async function saveMatch() {
    if(!editor())return;
    const f=$('#match-form');if(!f||!f.reportValidity())return;
    const v=Object.fromEntries(new FormData(f).entries());
    const matchId=f.dataset.editId;
    const existing=state.data.matches.find(m=>m.id===matchId);
    if(positiveInt(v.goalsFor)>99||positiveInt(v.goalsAgainst)>99){toast('Punteggio non valido.',true);return;}
    if(!/^\d{1,2}$/.test(String(v.ownGoalsFor??'')) || positiveInt(v.ownGoalsFor)>positiveInt(v.goalsFor)){
      toast('Gli autogol a favore devono essere un intero fra 0 e i gol segnati dagli Expats.',true);return;
    }
    if(state.data.matches.some(m=>m.id!==matchId && matchIdentity(m.seasonId,m)===matchIdentity(v.seasonId,{date:v.date,opponent:v.opponent,venue:v.venue}))){toast('Questa partita è già registrata nella stagione.',true);return;}
    let lineup;
    try {lineup=collectLineup();}catch(error){toast(safeError(error),true);return;}
    const keeperRows=lineup.filter(l=>l.played&&l.matchRole==='PORTIERE');
    if(!keeperRows.length && lineup.some(l=>l.played) && positiveInt(v.goalsAgainst)>0){toast('Nessun portiere selezionato per questa partita. Imposta il ruolo Portiere nella distinta per chi ha difeso la porta.',true);return;}
    if(keeperRows.length===1){keeperRows[0].goalsConceded=positiveInt(v.goalsAgainst);keeperRows[0].goals=-positiveInt(v.goalsAgainst);}
    if(keeperRows.length>1 && keeperRows.reduce((s,l)=>s+l.goalsConceded,0)!==positiveInt(v.goalsAgainst)){
      const attributed=keeperRows.reduce((s,l)=>s+l.goalsConceded,0);
      toast(`Gol subiti dai portieri: ${attributed} assegnati, ma gli avversari ne hanno segnati ${positiveInt(v.goalsAgainst)}. Correggi la ripartizione prima di salvare.`,true);
      const panel=$('#keeper-allocation');panel?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const totalGoals=lineup.reduce((t,l)=>t+l.goalsFor,0);
    if(totalGoals+positiveInt(v.ownGoalsFor)>positiveInt(v.goalsFor)){toast('Gol individuali + autogol a favore superano i gol segnati dagli Expats. Correggi il risultato o la distinta.',true);return;}
    const id=existing?.id||uid('m');
    const newAbsorbed=!!f.querySelector('[name="baselineAbsorbed"]:checked');
    const oldAbsorbed=!!existing?.baselineAbsorbed;
    const oldLineups=state.data.lineups.filter(l=>l.matchId===id);
    const oldMap=new Map(oldLineups.map(l=>[l.playerId,l]));
    const operations=[];
    // Se la distinta ricostruisce totali già importati, sposta i valori tra
    // Pregresso e Distinte. Se è una partita nuova, i numeri aumentano normalmente.
    const adjusted=[];
    // Compensazione atomica del pregresso, separatamente per gol fatti/subiti.
    // Vecchia distinta assorbita -> restituisce i numeri al pregresso;
    // nuova distinta assorbita -> li sottrae. Una presenza non si duplica.
    const newMap=new Map(lineup.map(l=>[l.playerId,l]));
    for(const playerId of new Set([...oldMap.keys(),...newMap.keys()])) {
      const old=oldMap.get(playerId),item=newMap.get(playerId);
      const historical=state.data.baseline.find(b=>b.seasonId===v.seasonId&&b.playerId===playerId);
      const oldParts=goalParts(old),newParts=goalParts(item),baseParts=goalParts(historical);
      const next={...Object.fromEntries(keys.filter(k=>k!=='goals').map(k=>[k,positiveInt(historical?.[k])])),goalsFor:baseParts.scored,goalsConceded:baseParts.conceded};
      // Per il portiere OCCASIONALE (ruolo stagionale di movimento), i gol subiti
      // non erano compresi negli aggregati storici importati: vengono aggiunti,
      // pur assorbendo convocazione, presenza e altre statistiche già conteggiate.
      // Il portiere stagionale, invece, assorbe dai gol subiti storici esistenti.
      const absorbConceded=keeperInSeason(playerId,v.seasonId);
      const deltaOf=(k)=> {
        if(k==='goalsConceded'&&!absorbConceded)return 0;
        const earlier=k==='goalsFor'?oldParts.scored:k==='goalsConceded'?oldParts.conceded:lineupStat(old,k,playerId);
        const now=k==='goalsFor'?newParts.scored:k==='goalsConceded'?newParts.conceded:lineupStat(item,k,playerId);
        return (oldAbsorbed?earlier:0)-(newAbsorbed?now:0);
      };
      const fields=['called','played','goalsFor','goalsConceded','assists','yellow','red'];
      const changes=fields.map(k=>[k,deltaOf(k)]).filter(([,delta])=>delta!==0);
      if(!changes.length)continue;
      for(const [k,delta] of changes){next[k]+=delta;if(next[k]<0){
        const p=state.data.players.find(x=>x.id===playerId);
        toast(`Il pregresso di ${p?name(p):playerId} non contiene abbastanza ${k==='goalsConceded'?'gol subiti':k==='goalsFor'?'gol segnati':statLabels[k]||k} per assorbire questa distinta. Disattiva “già comprese nel pregresso” oppure correggi i totali storici.`,true);return;
      }}
      adjusted.push({sheet:'Pregresso',...(historical?{row:historical._row}:{}),rows:[baselineRow(historical||{seasonId:v.seasonId,playerId},next)]});
    }
    // Le vecchie righe non si cancellano: vengono azzerate, preservando gli ID.
    for(const old of oldLineups)if(!newMap.has(old.playerId)){
      operations.push({sheet:'Distinte',row:old._row,rows:[[old.id,id,old.playerId,0,0,0,0,0,0,old.matchRole||'',0,0]]});
    }
    const matchRow=[id,v.seasonId,v.date,v.opponent.trim(),v.venue,positiveInt(v.goalsFor),positiveInt(v.goalsAgainst),(v.competition||'').trim(),(v.notes||'').trim(),newAbsorbed?1:0,positiveInt(v.ownGoalsFor)];
    operations.unshift({sheet:'Partite',...(existing?{row:existing._row}:{}),rows:[matchRow]});
    for(const l of lineup) {
      const old=oldMap.get(l.playerId);
      if(!old && emptyLineup(l))continue;
      if(old||!emptyLineup(l))operations.push({sheet:'Distinte',...(old?{row:old._row}:{}),rows:[[old?.id||uid('l'),id,l.playerId,l.called?1:0,l.played?1:0,l.goals,l.assists,l.yellow,l.red,l.matchRole,l.goalsFor,l.goalsConceded]]});
    }
    operations.push(...adjusted);
    const saved=await withBusy(()=>writeAtomic(operations));
    if(saved){state.seasonId=v.seasonId;navigate('matches');}
  }
  // Tutti i portieri che hanno giocato in questa partita sono selezionabili
  // individualmente. RuoloPartita + GolFatti/GolSubiti sono colonne indipendenti.
  function changeMatchRole(select) {
    const row=select.closest('.roster-entry');if(!row)return;
    const previouslyKeeper=row.dataset.keeper==='1';
    const nowKeeper=select.value==='PORTIERE';
    if(previouslyKeeper===nowKeeper)return;
    const previous=positiveInt(row.querySelector('[data-line="goals"]').value);
    if(previous>0 && !window.confirm(`Il valore gol (${previous}) verrà azzerato perché cambia il ruolo giocato. Confermi?`)){
      select.value=previouslyKeeper?'PORTIERE':'MOVIMENTO';return;
    }
    row.dataset.keeper=nowKeeper?'1':'0';
    const goal=row.querySelector('[data-line="goals"]');goal.value='0';goal.readOnly=false;
    const label=row.querySelector('.player-label');
    const jerseyIcon=label?.querySelector('.shirt-wrap');
    if(jerseyIcon){
      jerseyIcon.classList.toggle('shirt-keeper',nowKeeper);
      jerseyIcon.classList.toggle('shirt-outfield',!nowKeeper);
      const path=jerseyIcon.querySelector('path');if(path)path.setAttribute('fill',nowKeeper?'#ff9e38':'#61baf7');
      const number=jerseyIcon.querySelector('.shirt-number');if(number){number.style.color=nowKeeper?'#0b1c2a':'#ffffff';const player=seasonPlayer(state.data.players.find(p=>p.id===row.dataset.playerId),document.querySelector('#match-form [name="seasonId"]')?.value||state.seasonId);if(player)number.textContent=kitForMatch(player,nowKeeper,document.querySelector('#match-form [name="seasonId"]')?.value||state.seasonId);}
    }
    goal.setAttribute('aria-label',`${nowKeeper?'Gol subiti':'Gol segnati'} ${label?.textContent.trim()||''}`);
    syncKeeperGoals();updateLineupSummary();
  }
  function keeperParticipants(form) {
    return [...form.querySelectorAll('.roster-entry[data-keeper="1"]')]
      .filter(row=>row.querySelector('[data-line="played"]').checked);
  }
  function keeperAllocationSummary() {
    const form=$('#match-form');const panel=$('#keeper-allocation');
    if(!form||!panel)return;
    const playing=keeperParticipants(form);
    const goals=positiveInt(form.querySelector('[name="goalsAgainst"]')?.value);
    const assigned=playing.reduce((sum,row)=>sum+positiveInt(row.querySelector('[data-line="goals"]').value),0);
    const result=panel.querySelector('#keeper-allocation-result');
    if(!result)return;
    if(playing.length===1){
      result.textContent=`${goals} gol subiti attribuiti automaticamente all'unico portiere presente.`;
      result.classList.remove('allocation-error');
    } else {
      const difference=goals-assigned;
      result.textContent=difference===0
        ? `Ripartizione corretta: ${assigned} su ${goals} gol subiti.`
        : difference>0
          ? `Assegnati ${assigned} su ${goals}: mancano ${difference} gol da attribuire.`
          : `Assegnati ${assigned} su ${goals}: ${-difference} gol di troppo.`;
      result.classList.toggle('allocation-error',difference!==0);
    }
  }
  function renderKeeperAllocation() {
    const form=$('#match-form');const panel=$('#keeper-allocation');
    if(!form||!panel)return;
    const playing=keeperParticipants(form);
    if(!playing.length){
      panel.innerHTML='<div class="keeper-allocation-help">🧤 Nessun portiere risulta presente. Se ne ha giocato uno, spunta la sua casella Pres.</div>';
      return;
    }
    const rows=playing.map(row=>{
      const player=state.data.players.find(p=>p.id===row.dataset.playerId);
      const n=positiveInt(row.querySelector('[data-line="goals"]').value);
      return {id:row.dataset.playerId,name:player?name(player):'Portiere',number:(()=>{const p=seasonPlayer(player,form.querySelector('[name="seasonId"]').value);return p?kitForMatch(p,true,form.querySelector('[name="seasonId"]').value):'';})(),n};
    });
    const multiple=rows.length>1;
    panel.innerHTML=`<div class="keeper-allocation-title">🧤 Ripartizione gol subiti · ${rows.length} ${rows.length===1?'portiere':'portieri'} in campo</div>
      <p class="keeper-allocation-explainer">${multiple?'Indica quanti gol ha subito ciascun portiere, anche se sono entrambi scesi in campo. Il totale deve essere uguale ai gol degli avversari.':'I gol subiti vengono assegnati automaticamente al portiere che ha giocato.'} Nella rosa saranno mostrati con segno negativo.</p>
      ${multiple?`<div class="keeper-allocation-grid">${rows.map(p=>`<label class="keeper-allocation-player"><span class="keeper-allocation-name">${esc(p.name)} <small>n° ${esc(p.number)}</small></span><span class="keeper-allocation-field">Gol subiti <input type="number" data-keeper-allocation="${esc(p.id)}" min="0" max="99" step="1" value="${p.n}" inputmode="numeric" aria-label="Gol subiti da ${esc(p.name)}"></span></label>`).join('')}</div>`:''}
      <div id="keeper-allocation-result" class="keeper-allocation-result" role="status"></div>`;
    keeperAllocationSummary();
  }
  function syncKeeperGoals() {
    const form=$('#match-form');if(!form)return;
    const keepers=[...form.querySelectorAll('.roster-entry[data-keeper="1"]')];
    const playing=keeperParticipants(form);
    const goals=positiveInt(form.querySelector('[name="goalsAgainst"]')?.value);
    for(const row of keepers){
      const input=row.querySelector('[data-line="goals"]');
      if(!row.querySelector('[data-line="played"]').checked){input.value='0';input.readOnly=true;}
      else if(playing.length===1){input.value=String(goals);input.readOnly=true;}
      else {input.readOnly=false;}
      input.title=playing.length===1?'Gol subiti assegnati automaticamente dal risultato':'Gol subiti dal portiere (ripartizione manuale)';
    }
    renderKeeperAllocation();
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
    else if(action==='league-widgets')leagueWidgetsDialog();
    else if(action==='league-widgets-save')leagueWidgetsSave().catch(e=>toast(safeError(e),true));
    else if(action==='league-tab'){state.leagueTab=btn.dataset.tab==='calendario'?'calendario':'classifica';render();}
    else if(action==='league-import')leagueImportDialog(btn.dataset.kind);
    else if(action==='league-validate')leagueValidate(btn.dataset.kind);
    else if(action==='league-save')leagueSave(btn.dataset.kind);
    else if(action==='league-download')leagueDownload(btn.dataset.kind);
    else if(action==='manage-roles')catalogModal('roles');
    else if(action==='edit-player-roles')playerRolesModal(btn.dataset.id);
    else if(action==='save-player-roles')savePlayerRoles(btn.dataset.id).catch(e=>toast(safeError(e),true));
    else if(action==='manage-states')catalogModal('states');
    else if(action==='catalog-edit')catalogItemForm(btn.dataset.kind,btn.dataset.id);
    else if(action==='catalog-save')saveCatalog(btn.dataset.kind,btn.dataset.id).catch(e=>toast(safeError(e),true));
    else if(action==='catalog-delete')deleteCatalog(btn.dataset.kind,btn.dataset.id).catch(e=>toast(safeError(e),true));
    else if(action==='new-player')playerForm();
    else if(action==='edit-player')playerForm(btn.dataset.id);
    else if(action==='remove-from-roster')setRosterMembership(btn.dataset.id,false).catch(e=>toast(safeError(e),true));
    else if(action==='restore-to-roster')setRosterMembership(btn.dataset.id,true).catch(e=>toast(safeError(e),true));
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
    if(event.target.matches('#player-form [data-season-field="role"]')){
      const section=event.target.closest('.season-registration');
      if(section){
        const roles=rolesValue([...section.querySelectorAll('[data-season-field="role"]:checked')].map(x=>x.value));
        const field=section.querySelector('.dual-keeper-kit');
        if(field)field.hidden=!dualKitNeeded(roles,section.dataset.playerId,section.dataset.seasonId);
      }
    }
    if(event.target.id==='season-select'){state.seasonId=event.target.value;render();}
    else if(event.target.id==='roster-scope'){state.rosterScope=event.target.value;$('#players-tbody').innerHTML=playersTable();}
    else if(event.target.id==='league-csv-file'){const file=event.target.files?.[0];if(file)file.text().then(text=>{const input=$('#league-csv-paste');if(input){input.value=text;state.leagueImport=null;$('#league-import-save').disabled=true;$('#league-import-preview').replaceChildren();}}).catch(e=>toast(safeError(e),true));}
    else if(event.target.id==='csv-file'){const file=event.target.files?.[0];if(file){file.text().then(text=>{const target=$('#csv-paste');if(target){target.value=text;state.importPreview=null;$('#execute-import').disabled=true;$('#import-preview').replaceChildren();}}).catch(e=>toast(safeError(e),true));}}
    else if(event.target.id==='import-season'){state.importPreview=null;$('#execute-import').disabled=true;$('#import-preview').replaceChildren();}
    else if(event.target.id==='status-filter'){state.filter=event.target.value;$('#players-tbody').innerHTML=playersTable();}
    else if(event.target.dataset.inline){saveInline(event.target).catch(e=>toast(safeError(e),true));}
    else if(event.target.dataset.line==='matchRole'){changeMatchRole(event.target);}
    else if(event.target.dataset.line){rosterToggle(event.target);}
  });
  document.addEventListener('input',event=>{
    if(event.target.matches('#match-form [data-keeper-allocation]')){
      const form=$('#match-form');
      const row=[...form.querySelectorAll('.roster-entry[data-keeper="1"]')]
        .find(r=>r.dataset.playerId===event.target.dataset.keeperAllocation);
      if(row)row.querySelector('[data-line="goals"]').value=event.target.value;
      keeperAllocationSummary();
    } else if(event.target.matches('#match-form .roster-entry[data-keeper="1"] [data-line="goals"]')){
      const row=event.target.closest('.roster-entry');
      const inputs=[...document.querySelectorAll('#keeper-allocation [data-keeper-allocation]')];
      const twin=inputs.find(i=>i.dataset.keeperAllocation===row?.dataset.playerId);
      if(twin)twin.value=event.target.value;
      keeperAllocationSummary();
    }
    if(event.target.id==='league-csv-paste'){state.leagueImport=null;$('#league-import-save').disabled=true;$('#league-import-preview').replaceChildren();}
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
