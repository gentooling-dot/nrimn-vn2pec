'use strict';
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d }catch{ return d } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true }catch{ return false } },
  del(k){ try{ localStorage.removeItem(k) }catch{} },
};

const IPTV = 'https://iptv-org.github.io/iptv/';
const API = 'https://iptv-org.github.io/api/';
const RAW = 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/';
const DEFAULT = IPTV + 'countries/be.m3u';

const VRT_RADIO = [
  { name:'Radio 1', group:'VRT · voetbal live', url:'https://icecast.vrtcdn.be/radio1-high.mp3' },
  { name:'Radio 2', group:'VRT', url:'https://icecast.vrtcdn.be/ra2ant-high.mp3' },
  { name:'Studio Brussel', group:'VRT', url:'https://icecast.vrtcdn.be/stubru-high.mp3' },
  { name:'MNM', group:'VRT', url:'https://icecast.vrtcdn.be/mnm-high.mp3' },
  { name:'Klara', group:'VRT', url:'https://icecast.vrtcdn.be/klara-high.mp3' },
].map(s => ({ ...s, logo:'', audio:true }));

/* ---------- herkenning van waarschijnlijk illegale streams ---------- */
const SUS_NAME = /\b(dazn|play ?sports?|eleven ?(sports?)?|sky ?(sports?|cinema|movies)|bein|canal ?\+|ziggo ?sport|espn|hbo|streamz|pickx ?sports?|viaplay|movistar|setanta|supersport|tnt ?sports?|bt ?sport|arena ?sport|sport ?tv ?\d|ppv|vip|backup|event ?\d+|jupiler|pro ?league|premier ?league|champions ?league)\b/i;
const SUS_URL = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?\/|[?&](username|password|user|pass|token)=|get\.php|player_api|m3u_plus|xtream|stalker|portal\.php|\/live\/[^/]+\/[^/]+\/\d+|:(25461|8080|8880|2095|2082)\//i;
let BLOCK = new Map(); // tvg-id -> reden (iptv-org blocklist: dmca / nsfw)
function susReason(c){
  const b = c.id && BLOCK.get(c.id);
  if (b) return b === 'dmca' ? 'DMCA-geblokkeerd' : '18+';
  const u = c.url, n = c.name;
  if (/[?&](username|password|user|pass)=|\/live\/[^/]+\/[^/]+\/\d+/i.test(u)) return 'login in de link (doorverkocht abonnement)';
  if (/get\.php|player_api|m3u_plus|xtream|stalker|portal\.php/i.test(u)) return 'Xtream/Stalker-paneel (IPTV-reseller)';
  if (/^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(u)) return 'IP-adres i.p.v. officieel domein';
  if (/:(25461|8080|8880|2095|2082)\//.test(u)) return 'typische reseller-poort';
  if (/[?&]token=/i.test(u)) return 'token van iemand anders in de link';
  if (/\b(event ?\d+|ppv)\b|\s[-–]\s.*\blive\b/i.test(n)) return 'losse wedstrijd als kanaal';
  if (/\b(vip|backup)\b/i.test(n)) return 'reseller-label (VIP/backup)';
  if (SUS_NAME.test(n)) return 'betaalzender gratis aangeboden';
  return '';
}

/* ---------- oefenlijst: fictieve voorbeelden om patronen te leren herkennen ----------
   Alleen gereserveerde testadressen (RFC 5737 / 2606): 203.0.113.x, 198.51.100.x, *.example, *.invalid.
   Niets hiervan speelt af of wijst naar een echte server. */
const DEMO = `#EXTM3U
#EXTINF:-1 group-title="Oefening · verdacht",DAZN 1 BE FHD
http://203.0.113.24:8080/live/klant8812/wachtw00rd/10021.ts
#EXTINF:-1 group-title="Oefening · verdacht",DAZN 2 BE ᴴᴰ ★VIP★
https://cdn.iptvpro.invalid/get.php?username=demo&password=demo&type=m3u_plus&output=ts
#EXTINF:-1 group-title="Oefening · verdacht",|BE| Jupiler Pro League 1 FHD
http://198.51.100.7:25461/play/a0f3
#EXTINF:-1 group-title="Oefening · verdacht",Club Brugge - Anderlecht LIVE
https://streams.example.invalid/hls/match7/index.m3u8
#EXTINF:-1 group-title="Oefening · verdacht",EVENT 04 (alleen tijdens wedstrijd)
https://ppv.example.invalid/event04.m3u8
#EXTINF:-1 group-title="Oefening · verdacht",Eleven Pro League 1 BACKUP
https://relay.example.invalid/eleven1/master.m3u8
#EXTINF:-1 group-title="Oefening · verdacht",Play Sports 1 (720p)
https://edge.example.invalid/stream/ps1/master.m3u8?p=8f2a91c&u=Oleg
#EXTINF:-1 group-title="Oefening · verdacht",Sky Sports Main Event UK
https://tv.example.invalid/player_api.php?username=x&password=y&action=get_live_streams
#EXTINF:-1 group-title="Oefening · verdacht",Eurosport 1 NL
http://203.0.113.90/eurosport1/index.m3u8?token=a91f22e0
#EXTINF:-1 group-title="Oefening · lijkt legaal",ATV Antwerpen (eigen stream omroep)
https://live.atv.example/hls/atv/master.m3u8
#EXTINF:-1 group-title="Oefening · lijkt legaal",Red Bull TV
https://rbmn-live.example/hls/live/redbulltv/master.m3u8
#EXTINF:-1 group-title="Oefening · lijkt legaal",Pluto TV Sports (FAST-kanaal)
https://service-stitcher.example/stitch/hls/channel/sports/master.m3u8
`;
function loadDemo(){
  S.opt.hideSus = false; saveOpt(); $('hideSus').checked = false;
  $('dlg').close();
  setList(parseM3U(DEMO).map(c => ({ ...c, demo: true })), 'oefenlijst');
  setMeta($('meta').textContent + ' · oefenlijst: niets hiervan speelt af');
}
const isSus = c => !!susReason(c);
async function loadBlocklist(){
  try{
    let bl = store.get('blocklist', null);
    if (!bl || Date.now() - bl.t > 864e5){
      const j = await get(API + 'blocklist.json', { as:'json' });
      bl = { t: Date.now(), items: j.map(x => [x.channel, x.reason]) };
      store.set('blocklist', bl);
    }
    BLOCK = new Map(bl.items); render();
  }catch{}
}

/* ---------- state ---------- */
const S = {
  tab: 'tv', tv: [], radio: null, srcLabel: '',
  group: { tv:'Alle', radio:'Alle' },
  favs: new Set(store.get('favs', [])),
  dead: new Set(store.get('dead', [])),
  recent: store.get('recent', []),
  current: null, visible: [],
  opt: Object.assign({ logos:false, http:true, hideDead:true, hideSus:true }, store.get('opt', {})),
};
let hls = null;
// Native HLS (Safari/iPhone) heeft geen CORS nodig -> meer zenders spelen af
const NATIVE_HLS = !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
const saveOpt = () => store.set('opt', S.opt);

/* ---------- netwerk: zonder cookies/referrer, met timeout en retry ---------- */
async function get(url, { timeout = 15000, tries = 2, as = 'text' } = {}){
  let lastErr;
  for (let i = 0; i < tries; i++){
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try{
      const r = await fetch(url, { signal: ctl.signal, credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', redirect:'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return as === 'json' ? await r.json() : await r.text();
    }catch(e){
      lastErr = e.name === 'AbortError' ? new Error('time-out') : e;
      if (i < tries - 1) await wait(600 * (i + 1));
    }finally{ clearTimeout(t); }
  }
  throw lastErr;
}

function cleanUrl(u){
  try{
    const x = new URL(u.trim());
    if (x.protocol === 'https:') return x.href;
    if (x.protocol === 'http:') return S.opt.http ? x.href.replace(/^http:/, 'https:') : null;
  }catch{}
  return null;
}

/* ---------- M3U ---------- */
function parseM3U(txt){
  const out = []; let cur = null;
  for (const raw of txt.split(/\r?\n/)){
    const l = raw.trim();
    if (l.startsWith('#EXTINF')){
      const attr = k => (l.match(new RegExp(k + '="([^"]*)"')) || [])[1] || '';
      cur = { name: (l.slice(l.lastIndexOf(',') + 1).trim() || attr('tvg-name') || 'Onbekend').slice(0, 120),
              id: attr('tvg-id').split('@')[0], logo: attr('tvg-logo'), group: (attr('group-title') || 'Overig').split(';')[0].slice(0, 60) };
    } else if (l && !l.startsWith('#')){
      const url = /^https?:\/\//i.test(l) ? l : null;
      if (url) out.push({ ...(cur || { name: decodeURIComponent(url.split('/').pop() || url).slice(0, 120), logo:'', group:'Overig' }), url });
      cur = null;
    }
  }
  return out;
}

function toM3U(list){
  const esc = s => String(s || '').replace(/["\r\n]/g, ' ');
  return '#EXTM3U\n' + list.map(c =>
    `#EXTINF:-1 tvg-name="${esc(c.name)}"${c.logo ? ` tvg-logo="${esc(c.logo)}"` : ''} group-title="${esc(c.group)}",${esc(c.name)}\n${c.url}`
  ).join('\n') + '\n';
}

/* ---------- bronnen laden ---------- */
function setList(list, label){
  if ($('optMerge').checked && S.tv.length){
    const have = new Set(S.tv.map(c => c.url));
    list = S.tv.concat(list.filter(c => !have.has(c.url)));
    label = 'samengevoegd';
  }
  S.tv = list; S.srcLabel = label; S.group.tv = 'Alle';
  if (S.tab !== 'tv') setTab('tv'); else render();
}

async function loadTV(src){
  if (src === MYCH){ showMyCh(); return; }
  setMeta('Laden…'); $('list').replaceChildren();
  try{
    if (src.startsWith('local:')){
      const txt = store.get('imp:' + src.slice(6), null);
      if (!txt) throw new Error('bestand niet meer bewaard, importeer opnieuw');
      setList(parseM3U(txt), src.slice(6));
    } else {
      const url = cleanUrl(src); if (!url) throw new Error('ongeldige link');
      setList(parseM3U(await get(url)), url);
    }
    store.set('src', src);
  }catch(e){
    setMeta('Kon lijst niet laden (' + e.message + '). Kies een andere bron.');
  }
}

async function loadRadio(){
  if (S.radio) return;
  S.radio = [...VRT_RADIO]; render();
  try{
    const data = await get('https://de1.api.radio-browser.info/json/stations/search?countrycode=BE&hidebroken=true&order=clickcount&reverse=true&limit=300', { as:'json' });
    const seen = new Set(S.radio.map(s => s.name.toLowerCase()));
    for (const s of data){
      const url = cleanUrl(s.url_resolved || s.url || '');
      if (!url || !(s.url_resolved || s.url).startsWith('https:')) continue;
      const key = String(s.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue; seen.add(key);
      const tag = String(s.tags || '').split(',')[0];
      S.radio.push({ name: s.name.trim().slice(0, 120), logo: String(s.favicon || '').startsWith('https:') ? s.favicon : '',
                     group: tag ? tag[0].toUpperCase() + tag.slice(1, 40) : 'Overig', url, audio: true });
    }
  }catch{}
  if (S.tab === 'radio') render();
}

function fillSelect(sel, placeholder, items){
  sel.replaceChildren(el('option', { value:'', textContent: placeholder }), ...items.map(([v, t]) => el('option', { value: v, textContent: t })));
}

async function loadSourceLists(){
  try{
    const [countries, cats] = await Promise.all([get(API + 'countries.json', { as:'json' }), get(API + 'categories.json', { as:'json' })]);
    fillSelect($('selCountry'), '— kies land —', countries.sort((a, b) => a.name.localeCompare(b.name))
      .filter(c => /^[A-Z]{2}$/.test(c.code)).map(c => [`${IPTV}countries/${c.code.toLowerCase()}.m3u`, `${c.flag || ''} ${c.name}`]));
    fillSelect($('selCat'), '— kies categorie —', cats.sort((a, b) => a.name.localeCompare(b.name))
      .filter(c => /^[a-z0-9_-]+$/.test(c.id)).map(c => [`${IPTV}categories/${c.id}.m3u`, c.name]));
  }catch{
    fillSelect($('selCountry'), 'Niet beschikbaar', []); fillSelect($('selCat'), 'Niet beschikbaar', []);
  }
  try{
    let raw = store.get('rawList', null);
    if (!raw || Date.now() - raw.t > 864e5){
      const j = await get('https://api.github.com/repos/iptv-org/iptv/contents/streams', { as:'json' });
      raw = { t: Date.now(), names: j.map(f => f.name).filter(n => /^[a-z0-9_.-]+\.m3u$/i.test(n)) };
      store.set('rawList', raw);
    }
    fillSelect($('selRaw'), `— ${raw.names.length} lijsten —`, raw.names.map(n => [RAW + n, n.replace('.m3u', '').replace('_', ' · ').toUpperCase()]));
  }catch{
    fillSelect($('selRaw'), 'Niet beschikbaar', []);
  }
}

/* ---------- eigen links + import/export ---------- */
let mine = store.get('mine', []);
function renderMine(){
  $('mineLbl').hidden = !mine.length;
  $('mine').replaceChildren(...mine.map((m, i) => {
    const go = el('button', { type:'button', textContent: (m.url.startsWith('local:') ? '📄 ' : '') + m.name });
    go.onclick = () => $('dlg').close(m.url);
    const del = el('button', { type:'button', textContent:'✕' });
    del.setAttribute('aria-label', 'Verwijder ' + m.name);
    del.onclick = () => { if (m.url.startsWith('local:')) store.del('imp:' + m.url.slice(6)); mine.splice(i, 1); store.set('mine', mine); renderMine(); };
    return el('div', { className:'m' }, go, del);
  }));
}
function saveMine(url, name){
  if (mine.some(m => m.url === url)) return;
  let label = name;
  if (!label){ try{ const u = new URL(url); label = u.pathname.split('/').pop() || u.host; }catch{ label = url; } }
  mine.push({ url, name: label.slice(0, 60) }); store.set('mine', mine); renderMine();
}

$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 5e6){ setMeta('Bestand is te groot (max 5 MB).'); return; }
  const txt = await f.text();
  const list = parseM3U(txt);
  if (!list.length){ setMeta('Geen kanalen gevonden in ' + f.name + '.'); $('dlg').close(); return; }
  const name = f.name.replace(/\.m3u8?$/i, '').slice(0, 50);
  if (store.set('imp:' + name, txt)){ saveMine('local:' + name, name); store.set('src', 'local:' + name); }
  $('dlg').close(); setList(list, name);
});

$('exportBtn').onclick = () => {
  const list = S.visible.length ? S.visible : items();
  if (!list.length) return;
  const blob = new Blob([toM3U(list)], { type:'audio/x-mpegurl' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'zender-' + (S.group[S.tab] === '★' ? 'favorieten' : 'lijst') + '.m3u' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/* ---------- map scannen (idee uit M3Unator) ---------- */
const VID = /\.(mp4|mkv|webm|mov|m4v|avi|ts|m2ts|m3u8)$/i;
const AUD = /\.(mp3|aac|m4a|flac|ogg|opus|wav)$/i;
let scanning = false;

async function scanDir(){
  if (scanning){ scanning = false; return; }
  const start = cleanUrl($('scanUrl').value.replace(/\/?$/, '/'));
  const log = t => $('scanLog').textContent = t;
  if (!start){ log('Vul een geldige https-link naar een map in.'); return; }
  const depth = +$('scanDepth').value, type = $('scanType').value;
  const want = n => (type !== 'audio' && VID.test(n)) || (type !== 'video' && AUD.test(n));
  const base = new URL(start);
  const seen = new Set([start]); const found = []; let queue = [{ url: start, d: 0 }]; let pages = 0;
  scanning = true; $('scanBtn').textContent = 'Stoppen';
  try{
    while (queue.length && scanning && found.length < 3000){
      const batch = queue.splice(0, 4);
      const results = await Promise.allSettled(batch.map(async ({ url, d }) => {
        const html = await get(url, { timeout: 12000 });
        const doc = new DOMParser().parseFromString(html, 'text/html');
        pages++;
        for (const a of doc.querySelectorAll('a[href]')){
          let u; try{ u = new URL(a.getAttribute('href'), url); }catch{ continue; }
          u.hash = ''; u.search = '';
          if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) continue; // nooit omhoog of naar andere sites
          const href = u.href;
          if (seen.has(href)) continue; seen.add(href);
          if (href.endsWith('/')){ if (d < depth) queue.push({ url: href, d: d + 1 }); continue; }
          const file = decodeURIComponent(u.pathname.split('/').pop());
          if (!want(file)) continue;
          const rel = decodeURIComponent(u.pathname.slice(base.pathname.length)).split('/');
          found.push({ name: file.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim(), url: href, logo:'',
                       group: rel.length > 1 ? rel[0] : 'Hoofdmap', audio: AUD.test(file) });
        }
      }));
      const fails = results.filter(r => r.status === 'rejected').length;
      log(`${pages} mappen gelezen · ${found.length} bestanden${fails ? ` · ${fails} mislukt` : ''}…`);
    }
    if (!pages){ log('Kon de map niet lezen. Staat CORS aan op de server en is het een mappenlijst?'); return; }
    log(`Klaar: ${found.length} bestanden uit ${pages} mappen.${found.length ? ' Exporteer de lijst om hem te bewaren.' : ''}`);
    if (found.length){ $('dlg').close(); setList(found, base.host + base.pathname); }
  }finally{
    scanning = false; $('scanBtn').textContent = 'Scannen';
  }
}
$('scanBtn').onclick = scanDir;

/* ---------- lijst controleren (idee: Playlist Health Checker) ---------- */
let checking = false;
async function checkList(){
  const btn = $('checkBtn');
  if (checking){ checking = false; return; }
  const list = S.visible.filter(c => /\.m3u8(\?|$)/i.test(c.url)).slice(0, 400);
  if (!list.length){ setMeta('Niets te controleren in deze weergave (alleen HLS-streams kunnen getest worden).'); return; }
  checking = true; btn.textContent = 'Stop';
  let done = 0, bad = 0, i = 0;
  const worker = async () => {
    while (checking && i < list.length){
      const c = list[i++]; const url = cleanUrl(c.url);
      let ok = false, unknown = false;
      if (url){
        try{ ok = (await get(url, { timeout: 7000, tries: 1 })).includes('#EXTM3U'); }
        catch(e){ unknown = NATIVE_HLS && e instanceof TypeError; } // CORS-blokkade: speelt op iPhone vaak toch
      }
      if (ok) S.dead.delete(c.url); else if (!unknown){ S.dead.add(c.url); bad++; }
      done++;
      if (done % 10 === 0) setMeta(`Controleren… ${done}/${list.length} · ${bad} defect`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  store.set('dead', [...S.dead]);
  checking = false; btn.textContent = 'Controleer';
  render();
  setMeta($('meta').textContent + ` · gecontroleerd: ${done - bad} werken, ${bad} defect`);
}
$('checkBtn').onclick = checkList;

/* ---------- eigen kanalen, verbergen, bewerken ---------- */
const MYCH = 'mych:';
let myCh = store.get('mych', []);          // eigen kanalen
let hidden = store.get('hidden', []);      // [{url, name}]
let edits = store.get('edits', {});        // url -> {name, group}
const hiddenSet = () => new Set(hidden.map(h => h.url));
const withEdit = c => edits[c.url] ? { ...c, ...edits[c.url] } : c;

function showMyCh(){
  S.tv = myCh.slice(); S.srcLabel = 'Mijn kanalen'; S.group.tv = 'Alle'; store.set('src', MYCH);
  if (S.tab !== 'tv') setTab('tv'); else render();
  if (!myCh.length) setMeta('Nog geen eigen kanalen. Tik ＋ om er een toe te voegen.');
}
function updateMyBtn(){ $('myBtn').textContent = `Mijn kanalen (${myCh.length})`; }

let edCtx = null;
function openEd(mode, c){
  edCtx = { mode, c };
  const add = mode === 'add', inMine = !add && myCh.some(x => x.url === c.url);
  $('edTitle').textContent = add ? 'Kanaal toevoegen' : c.name;
  $('edName').value = add ? '' : c.name;
  $('edUrl').value = add ? '' : c.url;
  $('edUrl').readOnly = !add;
  $('edGroup').value = add ? 'Mijn kanalen' : c.group;
  $('edSave').textContent = add ? 'Toevoegen' : 'Opslaan';
  $('edHide').hidden = add;
  $('edCopy').hidden = add || inMine;
  $('edDel').hidden = !inMine;
  const why = !add && susReason(c);
  $('edMsg').textContent = why ? '⚠ ' + why : '';
  $('edDlg').showModal();
}
$('addBtn').onclick = () => openEd('add');
$('edCancel').onclick = () => $('edDlg').close();
$('edSave').onclick = () => {
  const name = $('edName').value.trim(), group = ($('edGroup').value.trim() || 'Overig').slice(0, 60);
  if (edCtx.mode === 'add'){
    const raw = $('edUrl').value.trim();
    if (!/^https?:\/\/\S+$/i.test(raw)){ $('edMsg').textContent = 'Vul een link in die met https:// begint.'; return; }
    if (myCh.some(x => x.url === raw)){ $('edMsg').textContent = 'Dit kanaal staat al in Mijn kanalen.'; return; }
    const c = { name: (name || decodeURIComponent(raw.split('/').pop() || '') || 'Kanaal').slice(0, 120), url: raw, group, logo:'', id:'' };
    myCh.push(c); store.set('mych', myCh); updateMyBtn();
    $('edDlg').close(); showMyCh();
    const why = susReason(c); if (why) setMeta($('meta').textContent + ' · ⚠ nieuw kanaal: ' + why);
    return;
  }
  const c = edCtx.c;
  edits[c.url] = { name: (name || c.name).slice(0, 120), group }; store.set('edits', edits);
  const i = myCh.findIndex(x => x.url === c.url);
  if (i >= 0){ Object.assign(myCh[i], edits[c.url]); store.set('mych', myCh); }
  $('edDlg').close(); render();
};
$('edHide').onclick = () => {
  const c = edCtx.c;
  if (!hidden.some(h => h.url === c.url)){ hidden.push({ url: c.url, name: c.name }); store.set('hidden', hidden); }
  $('edDlg').close(); renderHidden(); render();
};
$('edCopy').onclick = () => {
  const c = edCtx.c;
  myCh.push({ name: c.name, url: c.url, group: c.group, logo: c.logo || '', id: c.id || '' }); store.set('mych', myCh);
  updateMyBtn(); $('edMsg').textContent = 'Gekopieerd naar Mijn kanalen.'; $('edCopy').hidden = true; $('edDel').hidden = false;
};
$('edDel').onclick = () => {
  const c = edCtx.c;
  myCh = myCh.filter(x => x.url !== c.url); store.set('mych', myCh); updateMyBtn();
  $('edDlg').close();
  if (S.srcLabel === 'Mijn kanalen') showMyCh(); else render();
};
$('myBtn').onclick = () => { $('dlg').close(); showMyCh(); };

function renderHidden(){
  $('hiddenLbl').textContent = hidden.length ? `Verborgen kanalen (${hidden.length})` : 'Geen verborgen kanalen';
  $('hiddenList').replaceChildren(...hidden.map((h, i) => {
    const b = el('button', { type:'button', textContent:'Terugzetten' });
    b.onclick = () => { hidden.splice(i, 1); store.set('hidden', hidden); renderHidden(); render(); };
    return el('div', { className:'m' }, el('span', { className:'hn', textContent: h.name }), b);
  }));
}

/* ---------- weergave ---------- */
function setMeta(t){ $('meta').textContent = t; }
function items(){ return S.tab === 'radio' ? (S.radio || []) : S.tv; }

function logoEl(c, cls){
  if (S.opt.logos && c.logo && /^https:\/\//.test(c.logo)){
    const img = el('img', { className: cls, loading:'lazy', alt:'', referrerPolicy:'no-referrer', src: c.logo });
    img.onerror = () => img.replaceWith(el('div', { className: cls, textContent: (c.name[0] || '?').toUpperCase() }));
    return img;
  }
  return el('div', { className: cls, textContent: (c.name[0] || '?').toUpperCase() });
}

function render(){
  if (S.tab === 'apps') return;
  const hid = hiddenSet();
  const all = items().map(withEdit).filter(c => !hid.has(c.url)); const g = S.group[S.tab];
  const groups = ['★', 'Recent', 'Alle', ...[...new Set(all.map(c => c.group))].sort()];
  $('groups').replaceChildren(...groups.map(name => {
    const b = el('button', { className: 'chip' + (name === g ? ' on' : ''), textContent: name === '★' ? '★ Favorieten' : name });
    b.onclick = () => { S.group[S.tab] = name; render(); };
    return b;
  }));
  const q = $('q').value.toLowerCase();
  let list = g === 'Recent' ? S.recent.map(withEdit).filter(c => !!c.audio === (S.tab === 'radio') && !hid.has(c.url))
           : all.filter(c => g === 'Alle' || (g === '★' ? S.favs.has(c.url) : c.group === g));
  const susCount = list.filter(isSus).length;
  list = list.filter(c => (!q || c.name.toLowerCase().includes(q)) && !(S.opt.hideDead && S.dead.has(c.url)) && !(S.opt.hideSus && isSus(c)));
  S.visible = list;
  const deadCount = all.filter(c => S.dead.has(c.url)).length;
  setMeta(`${list.length} ${S.tab === 'radio' ? (list.length === 1 ? 'zender' : 'zenders') : (list.length === 1 ? 'kanaal' : 'kanalen')}` +
    (deadCount ? ` · ${deadCount} defect` : '') + (susCount ? ` · ${susCount} ⚠${S.opt.hideSus ? ' verborgen' : ''}` : '') +
    (g === '★' && !list.length ? ' · tik ☆ om toe te voegen' : ''));
  const frag = document.createDocumentFragment();
  for (const c of list.slice(0, 600)){
    const fav = el('button', { className:'fav' }); fav.setAttribute('aria-label', 'Favoriet');
    const paint = () => { const on = S.favs.has(c.url); fav.textContent = on ? '★' : '☆'; fav.classList.toggle('on', on); };
    paint();
    fav.onclick = () => { S.favs.has(c.url) ? S.favs.delete(c.url) : S.favs.add(c.url); store.set('favs', [...S.favs]); paint(); };
    const t = el('div', { className:'t' }, el('div', { className:'n', textContent: c.name }), el('div', { className:'g', textContent: c.group }));
    t.onclick = () => play(c);
    const more = el('button', { className:'more', textContent:'⋯' });
    more.setAttribute('aria-label', 'Opties voor ' + c.name);
    more.onclick = () => openEd('edit', c);
    const li = el('li', {}, logoEl(c, 'logo'), t, more, fav);
    if (S.current && S.current.url === c.url) li.classList.add('playing');
    if (S.dead.has(c.url)) li.classList.add('dead');
    const why = susReason(c); if (why){ li.classList.add('sus'); li.dataset.sus = why; }
    frag.append(li);
  }
  $('list').replaceChildren(frag);
}

function setTab(tab){
  S.tab = tab;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  $('appsView').hidden = tab !== 'apps';
  $('listView').hidden = tab === 'apps';
  $('srcBtn').hidden = tab !== 'tv';
  $('addBtn').hidden = tab !== 'tv';
  $('q').placeholder = tab === 'radio' ? 'Zoek radiozender…' : 'Zoek zender…';
  if (tab === 'radio') loadRadio();
  render();
}

/* ---------- afspelen ---------- */
function setNow(c, sub){
  $('nname').textContent = c.name; $('nsub').textContent = sub || c.group;
  const img = $('nlogo');
  if (S.opt.logos && c.logo && /^https:\/\//.test(c.logo)){ img.referrerPolicy = 'no-referrer'; img.src = c.logo; img.onerror = () => img.removeAttribute('src'); }
  else img.removeAttribute('src');
}
function showErr(msg){ $('err').textContent = msg; $('err').hidden = !msg; $('dot').classList.toggle('on', !msg && !!S.current && !$('v').paused); }
function markDead(c){ if (!c) return; S.dead.add(c.url); store.set('dead', [...S.dead]); render(); }

function play(c){
  if (c.demo){ showErr('Oefenvoorbeeld: ' + (susReason(c) || 'geen alarmsignalen, zo ziet een officiële stream eruit') + '. Dit speelt niet af.'); return; }
  S.current = c;
  S.recent = [c, ...S.recent.filter(x => x.url !== c.url)].slice(0, 30);
  store.set('recent', S.recent); store.set('last', c);
  setNow(c); showErr('');
  $('pl').classList.toggle('audio', !!c.audio);
  const v = $('v');
  if (hls){ hls.destroy(); hls = null; }
  v.removeAttribute('src'); v.load();
  const url = cleanUrl(c.url);
  if (!url){ showErr('Deze zender gebruikt een onveilige http-link en wordt overgeslagen.'); markDead(c); return; }
  const isHls = /\.m3u8(\?|$)|\/hls\//i.test(url);
  if (isHls && window.Hls && Hls.isSupported()){
    hls = new Hls({ maxBufferLength: 20, enableWorker: false,
      xhrSetup: xhr => { xhr.withCredentials = false; } });
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR){ hls.recoverMediaError(); return; }
      // CORS-blokkade of netwerkfout: probeer de eigen speler van het toestel (iPhone speelt zonder CORS)
      if (NATIVE_HLS && d.type === Hls.ErrorTypes.NETWORK_ERROR && S.current === c){
        hls.destroy(); hls = null; v.src = url; v.play().catch(() => {}); return;
      }
      showErr('Stream speelt niet af (offline of geblokkeerd). Gemarkeerd als defect.');
      markDead(c);
    });
    hls.loadSource(url); hls.attachMedia(v);
  } else {
    v.src = url;
  }
  v.play().then(() => { if (S.dead.delete(c.url)) store.set('dead', [...S.dead]); }).catch(() => {});
  render();
}

function step(dir){
  const list = S.visible.length ? S.visible : items();
  if (!list.length) return;
  const i = S.current ? list.findIndex(c => c.url === S.current.url) : -1;
  play(list[(i + dir + list.length) % list.length]);
}

$('v').addEventListener('error', () => { if (!S.current || hls) return; showErr('Stream speelt niet af. Gemarkeerd als defect.'); markDead(S.current); });
$('v').addEventListener('playing', () => { showErr(''); $('dot').classList.add('on'); });
$('v').addEventListener('pause', () => $('dot').classList.remove('on'));

/* ---------- events ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('q').addEventListener('input', render);
$('srcBtn').onclick = () => $('dlg').showModal();
for (const id of ['selCountry', 'selCat', 'selRaw']) $(id).onchange = e => { const v = e.target.value; if (v){ e.target.value = ''; $('dlg').close(v); } };
$('dlg').addEventListener('close', () => {
  const v = $('dlg').returnValue; $('dlg').returnValue = '';
  if (v === 'custom'){
    const raw = $('custom').value.trim(); const u = cleanUrl(raw);
    if (u){ saveMine(raw, $('customName').value.trim()); loadTV(raw); $('custom').value = $('customName').value = ''; }
    else if (raw) setMeta('Die link is ongeldig of gebruikt http zonder https-optie.');
  } else if (v) loadTV(v);
});
$('nowText').onclick = () => { if (S.current && !$('v').currentSrc) play(S.current); };
document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea') || $('dlg').open) return;
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
});

// opties
const bindOpt = (id, key, after) => { const c = $(id); c.checked = S.opt[key]; c.addEventListener('change', () => { S.opt[key] = c.checked; saveOpt(); after && after(); }); };
bindOpt('hideDead', 'hideDead', render);
bindOpt('hideSus', 'hideSus', render);
bindOpt('optLogos', 'logos', () => { render(); if (S.current) setNow(S.current); });
bindOpt('optHttp', 'http');
$('demoBtn').onclick = loadDemo;
let clearArmed = false;
$('clearData').onclick = () => {
  if (!clearArmed){ clearArmed = true; $('clearData').textContent = 'Zeker? Tik nogmaals om alles te wissen'; setTimeout(() => { clearArmed = false; $('clearData').textContent = 'Alle lokale gegevens wissen'; }, 4000); return; }
  try{ localStorage.clear(); }catch{}
  $('clearMsg').textContent = 'Favorieten, eigen links, geschiedenis en instellingen zijn gewist.';
  setTimeout(() => location.reload(), 1200);
};

/* ---------- start ---------- */
renderMine();
renderHidden();
updateMyBtn();
const last = store.get('last', null);
if (last){ S.current = last; setNow(last, last.group + ' · tik om te spelen'); }
loadTV(store.get('src', DEFAULT));
loadSourceLists();
loadBlocklist();
