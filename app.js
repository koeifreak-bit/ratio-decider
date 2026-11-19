/* The Ratio Decider: app UI. Engine maths lives in engine.js; this file only renders and stores. */
(function () {
  'use strict';
  var E = window.RatioEngine, LEX = window.RD_LEXICON, BASE_ORIGINS = window.RD_ORIGINS;
  var ATTRS = E.ATTRS, TATTRS = E.TARGET_ATTRS, AL = E.ATTR_LABEL;
  var BEAN_COLORS = ['var(--b1)', 'var(--b2)', 'var(--b3)', 'var(--b4)', 'var(--b5)'];
  var SPECIES = ['arabica', 'robusta', 'liberica', 'excelsa'];
  var PROCS = E.PROCESS_KEYS;
  var BAGS = [250, 500, 1000];
  var ROAST_NAMES = ['', 'light', 'light-medium', 'medium', 'medium-dark', 'dark'];
  var ROUTES = [
    ['simulator', 'Simulator'], ['beans', 'My beans'], ['cupping', 'Cupping log'], ['blends', 'Blends'], ['sheet', 'Spec sheet'],
    ['batches', 'Batches'], ['origins', 'Origins'], ['prefs', 'Settings']
  ];
  var BREW_SHORT = { filter: 'Filter', espresso: 'Espresso', kopisusu: 'Kopi susu', tubruk: 'Tubruk', flatwhite: 'Flat white', icedmilk: 'Iced milk', coldbrew: 'Cold brew', tonic: 'Tonic / orange' };
  var REGION_LABEL = { SG: '🇸🇬 Singapore high-end', TH: '🇹🇭 Thailand high-end', ID: '🇮🇩 Indonesia high-end' };
  function defaultSpecialty() { return { on: false, minScore: 84, arabicaOnly: true, robustaMax: 0, roastWindow: ['', ''], minBalance: 4, minComplexity: 3 }; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------------- DOM helpers ----------------
  function el(tag, props) {
    var node = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2), val;
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (k === 'value') val = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    append(node, kids);
    if (val !== undefined) node.value = val;
    return node;
  }
  function append(node, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) append(node, c);
      else node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function byId(id) { return document.getElementById(id); }
  function nf(v, dp) { return Number(v).toLocaleString('id-ID', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }); }
  function fmtG(g, dp) { return nf(g, dp || 0) + ' g'; }
  function fmtKg(g) { return g >= 1000 ? nf(g / 1000, g % 1000 ? 2 : 0) + ' kg' : fmtG(g); }
  function bagLabel(g) { return g >= 1000 ? (g / 1000) + ' kg' : g + ' g'; }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dateStr(ts) { try { return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function field(label, input, hint) { return el('label', { class: 'field' }, el('span', null, label), input, hint ? el('small', { class: 'muted' }, hint) : null); }
  function opt(value, label, selected) { return el('option', { value: value, selected: selected }, label); }
  var toastTimer;
  function toast(msg, bad) {
    var t = document.querySelector('.toast');
    if (t) t.remove();
    t = el('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 3600);
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  // Save a generated file: the claude.ai downloads capability when present, otherwise a normal browser download.
  async function saveFile(filename, text) {
    var claude = window.claude, dl = null;
    try { dl = claude && claude.use ? await claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: filename, data: text }); return true; }
      catch (e) { if (e && e.code === 'declined') return false; toast('Couldn\'t save the file.', true); return false; }
    }
    // Inside the claude.ai viewer a plain download link is blocked, so only fall back when not framed by claude.ai.
    if (claude) { toast('Downloading files isn\'t available in this view.', true); return false; }
    try {
      var blob = new Blob([text], { type: /\.html$/.test(filename) ? 'text/html' : 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) { toast('Downloading files isn\'t available in this browser.', true); return false; }
  }
  function sameScores(a, b) { return !!a && !!b && ATTRS.every(function (k) { return Number(a[k]) === Number(b[k]); }); }

  // ---------------- state ----------------
  var state = {
    mode: 'connecting', route: 'simulator',
    beans: [], blends: [], batches: [], cuppings: [],
    settings: { rules: {}, customNotes: {}, customOrigins: [], customPresets: [], sourceCountries: [], brewBias: {} },
    cloud: null, subs: null,
    confirm: null, beanForm: null, cupDraft: null, sample: null, aiHidden: false, mapper: null
  };
  function origins() { return BASE_ORIGINS.concat(state.settings.customOrigins || []); }
  function originById(id) { var all = origins(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function mainProcess(o) { return o ? E.processOf(String(o.process || '').split(/[,;]/)[0]) : 'full'; }
  function derived(originId, roast, process, varietal, species) {
    var o = originById(originId); if (!o) return null;
    return E.scoresFor(o, roast, process || mainProcess(E.originAs(o, species)), varietal && varietal !== 'unknown' ? varietal : null, species);
  }
  // Same region sold as another species (e.g. Sidikalang arabica ↔ robusta).
  function siblingOrigin(o, species) {
    if (!o || o.species === species) return o;
    return origins().filter(function (x) { return x.species === species && x.country === o.country && x.region.replace(/\s*\(Robusta\)/i, '') === o.region.replace(/\s*\(Robusta\)/i, ''); })[0] || null;
  }
  // Swap the notes for the new species / process, unless the user typed their own.
  // Notes count as "auto" when every one of them came from the previous suggestion or the origin's notes (any order).
  function noteKeys(text) { return parse(text).known.map(function (n) { return n.key; }); }
  function autoNotes(current, prev, next) {
    var po = originById(prev.originId);
    var allowed = noteKeys(E.typicalNotes(po, prev.species, prev.process) + ', ' + (po ? po.notes : ''));
    var mine = parse(current || '');
    var isAuto = !String(current || '').trim() || (!mine.unknown.length && mine.known.every(function (n) { return allowed.indexOf(n.key) >= 0; }));
    return isAuto ? E.typicalNotes(originById(next.originId), next.species, next.process) : current;
  }
  function procLabel(p) { return (E.PROCESSES[p] || E.PROCESSES.full).label; }
  function beanProcess(b) { return b.process || mainProcess(originById(b.originId)); }

  function quickRow(name, originId, roast, notes, process) {
    var o = originById(originId) || BASE_ORIGINS[0];
    var p = process || mainProcess(o);
    return { key: uid('r'), kind: 'quick', beanId: '', name: name, originId: o.id, species: o.species, roast: roast, process: p, varietal: 'unknown', cupScore: '', notesText: notes, scores: E.scoresFor(o, roast, p), min: '', max: '' };
  }
  function savedRow(beanId) { return { key: uid('r'), kind: 'saved', beanId: beanId, min: '', max: '' }; }
  function defaultSim() {
    return {
      rows: [
        quickRow('Example: Gayo', 'id-gayo', 3, 'dark chocolate, brown sugar, spice, herbal'),
        quickRow('Example: Kintamani', 'id-kintamani', 2, 'orange, lemon, brown sugar'),
        quickRow('Example: Lampung robusta', 'id-lampung', 4, 'dark chocolate, earthy, peanut')
      ],
      brew: 'kopisusu',
      ranges: { body: ['4', '5'], acidity: ['', '3'], sweetness: ['3', ''], bitterness: ['', '3.5'], roast: ['', ''] },
      mustText: 'chocolate', notText: '',
      result: null, sig: '', pcts: null, manual: false,
      plan: { 250: 20, 500: 0, 1000: 5 }, cupping: null, saveName: '', busy: false,
      mode: 'taste', useKey: '', pick: { source: 'mine', maxBeans: 3, roast: 3 },
      acidType: '', specialty: defaultSpecialty(), robustaMax: ''
    };
  }
  // A remembered draft can be corrupted or from an older version: start from defaults and keep only what checks out.
  function loadSim() {
    var d = defaultSim(), s = lsGet('rd.sim.v2');
    if (!s || typeof s !== 'object' || Array.isArray(s) || !Array.isArray(s.rows)) return d;
    var out = Object.assign(d, s);
    function obj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
    function str(v, dflt) { return typeof v === 'string' ? v : dflt; }
    out.rows = s.rows.filter(obj).map(function (r) {
      if (r.kind === 'saved') return typeof r.beanId === 'string' && r.beanId ? { key: str(r.key, '') || uid('r'), kind: 'saved', beanId: r.beanId, min: r.min == null ? '' : r.min, max: r.max == null ? '' : r.max } : null;
      var o = originById(r.originId) || BASE_ORIGINS[0];
      var q = quickRow(str(r.name, ''), o.id, E.ROAST_COLOURS[Number(r.roast)] ? Number(r.roast) : 3, str(r.notesText, o.notes), PROCS.indexOf(r.process) >= 0 ? r.process : null);
      q.key = str(r.key, '') || q.key;
      if (typeof r.originId === 'string' && r.originId) q.originId = r.originId; // custom origins load with settings, later
      if (SPECIES.indexOf(r.species) >= 0) q.species = r.species;
      if (E.VARIETALS[r.varietal]) q.varietal = r.varietal;
      if (r.cupScore === '' || isFinite(r.cupScore)) q.cupScore = r.cupScore;
      if (obj(r.scores) && ATTRS.every(function (a) { return isFinite(r.scores[a]); })) q.scores = r.scores;
      q.min = r.min == null ? '' : r.min; q.max = r.max == null ? '' : r.max;
      return q;
    }).filter(Boolean).slice(0, 5);
    if (!out.rows.length) out.rows = defaultSim().rows;
    if (!E.BREWS[out.brew]) out.brew = d.brew;
    out.ranges = obj(s.ranges) ? s.ranges : defaultSim().ranges;
    TATTRS.forEach(function (a) { if (!Array.isArray(out.ranges[a]) || out.ranges[a].length !== 2) out.ranges[a] = ['', '']; });
    out.mustText = str(out.mustText, ''); out.notText = str(out.notText, ''); out.saveName = str(out.saveName, '');
    out.plan = obj(out.plan) ? out.plan : defaultSim().plan;
    out.mode = ['taste', 'stock', 'useup'].indexOf(out.mode) >= 0 ? out.mode : 'taste';
    out.useKey = str(out.useKey, '');
    out.acidType = out.acidType && E.ACID_TYPES[out.acidType] ? out.acidType : '';
    out.specialty = Object.assign(defaultSpecialty(), obj(out.specialty) ? out.specialty : {});
    out.pick = Object.assign({ source: 'mine', maxBeans: 3, roast: 3 }, obj(out.pick) ? out.pick : {});
    out.robustaMax = out.robustaMax == null ? '' : String(out.robustaMax);
    out.pcts = Array.isArray(out.pcts) && out.pcts.length === out.rows.length && out.pcts.every(function (p) { return isFinite(p); }) ? out.pcts : null;
    out.manual = !!out.manual;
    return out;
  }
  var sim = loadSim();
  sim.result = null; sim.busy = false; sim.cupping = null;
  var pickRes = null, pickBusy = false;
  function saveSimDraft() { lsSet('rd.sim.v2', Object.assign({}, sim, { result: null, cupping: null, busy: false })); }

  function beanById(id) { for (var i = 0; i < state.beans.length; i++) if (state.beans[i].id === id) return state.beans[i]; return null; }
  function rules() { return E.withRules(Object.assign({}, state.settings.rules, { brewBias: state.settings.brewBias || {} })); }
  function rulesNoBias() { return E.withRules(Object.assign({}, state.settings.rules, { brewBias: {} })); }
  function sourceable(o) { return E.originAllowed(o, state.settings.sourceCountries); }
  var idxCache = { key: null, index: null };
  function noteIndex() {
    var key = JSON.stringify(state.settings.customNotes || {});
    if (idxCache.key !== key) { idxCache.key = key; idxCache.index = E.buildIndex(LEX, state.settings.customNotes || {}); }
    return idxCache.index;
  }
  function parse(text) { return E.parseNotes(text, noteIndex()); }
  function savedBean(b) {
    return { id: b.id, name: b.name, species: b.species, roast: b.roast, process: beanProcess(b), varietal: b.varietal || 'unknown', producer: b.producer || '', altitude: b.altitude || '', originId: b.originId,
      cupScore: b.cupScore, scores: b.scores, calib: b.calib, noteCalib: b.noteCalib, notes: parse(b.bagNotes).known, bagNotes: b.bagNotes, stockG: b.stockG };
  }

  // ---------------- store: claude.ai db > cloud (Supabase, GitHub site only) > this browser > memory ----------------
  var db = null;
  var COLS = ['beans', 'blends', 'batches', 'cuppings'];
  function sortByDate(list) { return list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); }
  function normSettings(s) {
    s = s || {};
    return {
      rules: Object.assign({}, s.rules || {}), customNotes: Object.assign({}, s.customNotes || {}),
      customOrigins: (s.customOrigins || []).slice(), customPresets: (s.customPresets || []).slice(),
      sourceCountries: Array.isArray(s.sourceCountries) ? s.sourceCountries.filter(function (x) { return typeof x === 'string'; }) : [],
      brewBias: s.brewBias && typeof s.brewBias === 'object' ? JSON.parse(JSON.stringify(s.brewBias)) : {}
    };
  }
  async function initStore() {
    var claude = window.claude;
    try { db = claude && claude.use ? await claude.use('db') : null; } catch (e) { db = null; }
    try { state.sample = claude && claude.use ? await claude.use('sample') : null; } catch (e) { state.sample = null; }
    if (!db) {
      // Outside claude.ai (e.g. GitHub Pages): keep data in this browser, or only in memory if storage is blocked.
      state.mode = lsSet('rd.store.test', 1) ? 'local' : 'memory';
      if (state.mode === 'local') localLoad();
      pruneMissingBeans(); render();
      initCloud();
      return;
    }
    state.mode = 'db';
    var pending = COLS.length + 1;
    var timer = setTimeout(function () { if (pending > 0) { state.mode = 'slow'; render(); } }, 10000);
    function done() { pending--; if (pending <= 0) { clearTimeout(timer); if (state.mode === 'slow') state.mode = 'db'; } }
    COLS.forEach(function (c) {
      var first = true;
      db.collection(c).onSnapshot(function (snap) {
        state[c] = sortByDate(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
        if (first && !snap.metadata.fromCache) { first = false; done(); if (c === 'beans') pruneMissingBeans(); }
        scheduleRender();
      }, function (err) { done(); toast('Couldn\'t load ' + c + ': ' + (err && err.code || 'error'), true); });
    });
    var firstS = true;
    db.doc('settings/main').onSnapshot(function (snap) {
      var d = snap.exists ? snap.data() : {};
      state.settings = normSettings(d);
      settingsChanged();
      if (firstS && !snap.metadata.fromCache) { firstS = false; done(); }
      scheduleRender();
    }, function () { done(); });
  }
  var LOCAL_KEY = 'rd.store.v1';
  function localLoad() {
    var d = lsGet(LOCAL_KEY);
    if (!d || typeof d !== 'object') return;
    COLS.forEach(function (c) { state[c] = sortByDate(Array.isArray(d[c]) ? d[c].filter(function (x) { return x && typeof x.id === 'string'; }) : []); });
    state.settings = normSettings(d.settings);
    state.localCloudUser = d.cloudUser || null;
  }
  // In cloud mode this is the offline cache, tagged with the account it came from.
  function localSave() {
    if (state.mode !== 'local' && state.mode !== 'cloud') return;
    var ok = lsSet(LOCAL_KEY, { beans: state.beans, blends: state.blends, batches: state.batches, cuppings: state.cuppings, settings: state.settings, savedAt: Date.now(),
      cloudUser: state.mode === 'cloud' && state.cloud && state.cloud.userId ? state.cloud.userId : null });
    if (!ok && state.mode === 'local') { state.mode = 'memory'; toast('This browser is out of space or blocks saving. Download a backup now so you don\'t lose your data.', true); }
  }

  // ---------- cloud sync (Supabase). Only the GitHub site loads the client and config. ----------
  var cloudClient = null, cloudPending = {};
  // Writes that haven't reached the cloud yet survive a reload: they're kept per account and pushed before cloud data is applied.
  var PENDING_KEY = 'rd.cloud.pending.v1';
  function savePending() { lsSet(PENDING_KEY, { userId: state.cloud && state.cloud.userId, ops: cloudPending }); }
  function cloudAvailable() { return !!(window.RD_CLOUD && window.supabase && window.supabase.createClient); }
  function initCloud() {
    if (!cloudAvailable()) return;
    var saved = lsGet(PENDING_KEY);
    if (saved && saved.ops && typeof saved.ops === 'object') { cloudPending = saved.ops; state.pendingUser = saved.userId || null; }
    try {
      cloudClient = window.supabase.createClient(window.RD_CLOUD.url, window.RD_CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    } catch (e) { cloudClient = null; return; }
    state.cloud = { status: 'signed-out', email: '', userId: null, msg: '', busy: false, conflict: null };
    cloudClient.auth.onAuthStateChange(function (event, session) {
      // Never await Supabase calls inside this callback; defer them.
      if (event === 'SIGNED_OUT') setTimeout(leaveCloud, 0);
      else if (session && session.user && state.cloud.status === 'signed-out') {
        // Mark it now, synchronously, so a second auth event can't schedule another sign-in run.
        state.cloud.status = 'connecting';
        setTimeout(function () { enterCloud(session); }, 0);
      }
    });
    window.addEventListener('focus', cloudRefresh);
    window.addEventListener('online', cloudFlush);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) cloudRefresh(); });
    render();
  }
  function cloudErr(e) {
    var code = e && (e.code || e.error_code), msg = (e && (e.message || e.error_description)) || '';
    if (code === 'email_address_not_authorized' || /not authorized/i.test(msg)) return 'Supabase\'s free email service only sends to the email of your Supabase account. Sign up with that email.';
    if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) return 'Too many emails sent this hour. Wait an hour, then try again.';
    if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return 'Confirm your email first: open the confirmation email and tap the link, then sign in here.';
    if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'Wrong email or password.';
    return msg || code || 'unknown error';
  }
  async function cloudFetch() {
    var out = { beans: [], blends: [], batches: [], cuppings: [], settings: null }, from = 0;
    for (;;) {
      // A stable order is what makes range() paging safe: no row skipped or read twice.
      var r = await cloudClient.from('ratio_docs').select('collection,id,data').order('collection').order('id').range(from, from + 999);
      if (r.error) throw r.error;
      r.data.forEach(function (row) {
        if (row.collection === 'settings') out.settings = row.data;
        else if (out[row.collection]) out[row.collection].push(Object.assign({}, row.data, { id: row.id }));
      });
      if (r.data.length < 1000) break;
      from += 1000;
    }
    return out;
  }
  function applyRemote(remote) {
    COLS.forEach(function (c) { state[c] = sortByDate(remote[c]); });
    // The cloud copy replaces this device's settings entirely, so nothing leaks from another account or a local-only session.
    state.settings = normSettings(remote.settings || {});
    settingsChanged();
    localSave(); pruneMissingBeans();
  }
  // Drafts in Settings were copied from the old settings; drop them when settings arrive from elsewhere.
  function settingsChanged() { state.rulesDraft = null; state.srcDraft = null; }
  // Writes to one document go out one at a time, in order, so an older write can't land after a newer one.
  var writeChains = {};
  function cloudWrite(col, id, data) {
    var key = col + '/' + id;
    cloudPending[key] = { col: col, id: id, data: data };
    savePending();
    var run = function () { return cloudWriteNow(col, id, data); };
    var chain = (writeChains[key] || Promise.resolve()).then(run, run);
    writeChains[key] = chain;
    chain.then(function () { if (writeChains[key] === chain) delete writeChains[key]; });
    return chain;
  }
  async function cloudWriteNow(col, id, data) {
    var key = col + '/' + id;
    if (!cloudClient || !state.cloud || !state.cloud.userId) return;
    try {
      var r = data === null
        ? await cloudClient.from('ratio_docs').delete().eq('collection', col).eq('id', id)
        : await cloudClient.from('ratio_docs').upsert({ user_id: state.cloud.userId, collection: col, id: id, data: data, updated_at: new Date().toISOString() });
      if (r.error) throw r.error;
      if (cloudPending[key] && cloudPending[key].data === data) { delete cloudPending[key]; savePending(); }
      state.cloud.lastSync = Date.now();
    } catch (e) {
      toast('Saved on this device, but the cloud couldn\'t be reached. It will sync when you\'re back online.', true);
    }
  }
  async function cloudFlush() {
    if (state.mode !== 'cloud') return;
    var keys = Object.keys(cloudPending);
    for (var i = 0; i < keys.length; i++) { var p = cloudPending[keys[i]]; if (p) await cloudWrite(p.col, p.id, p.data); }
  }
  var refreshing = false;
  async function cloudRefresh() {
    if (state.mode !== 'cloud' || refreshing || Object.keys(cloudPending).length) { if (state.mode === 'cloud') cloudFlush(); return; }
    refreshing = true;
    try {
      var remote = await cloudFetch();
      // An edit made while the fetch was running wins: don't paint stale cloud data over it.
      if (!Object.keys(cloudPending).length) { applyRemote(remote); state.cloud.lastSync = Date.now(); scheduleRender(); }
    } catch (e) { /* keep the cached data */ }
    refreshing = false;
  }
  function localSnapshot() { var o = {}; COLS.forEach(function (c) { o[c] = state[c].slice(); }); o.settings = state.settings; return o; }
  async function cloudUploadAll(snap) {
    var rows = [];
    COLS.forEach(function (c) { snap[c].forEach(function (d) { rows.push({ user_id: state.cloud.userId, collection: c, id: d.id, data: strip(d), updated_at: new Date().toISOString() }); }); });
    rows.push({ user_id: state.cloud.userId, collection: 'settings', id: 'main', data: snap.settings, updated_at: new Date().toISOString() });
    for (var i = 0; i < rows.length; i += 200) {
      var r = await cloudClient.from('ratio_docs').upsert(rows.slice(i, i + 200));
      if (r.error) throw r.error;
    }
  }
  var entering = false;
  async function enterCloud(session) {
    var C = state.cloud;
    if (entering) return; // one sign-in at a time; auth events can fire in quick succession
    entering = true;
    C.status = 'connecting'; C.email = session.user.email || ''; C.userId = session.user.id; C.msg = ''; render();
    try {
      var claim = await cloudClient.rpc('ratio_claim');
      if (claim.error) throw claim.error;
      if (claim.data !== true) {
        C.msg = 'This sync space already belongs to another account, so you were signed out.';
        await cloudClient.auth.signOut();
        return;
      }
      var cacheIsThisAccount = state.localCloudUser === session.user.id;
      // Push edits left over from an earlier visit (offline, or the tab closed) before reading the cloud.
      if (Object.keys(cloudPending).length) {
        if (state.pendingUser && state.pendingUser !== session.user.id) { cloudPending = {}; savePending(); }
        else { state.mode = 'cloud'; await cloudFlush(); }
      }
      if (Object.keys(cloudPending).length) {
        // Still couldn't push: keep working from this device's copy; it retries on reconnect.
        state.mode = 'cloud'; C.status = 'signed-in'; C.msg = 'Some changes haven\'t reached the cloud yet. They will sync when the connection is back.';
        render(); return;
      }
      var remote = await cloudFetch();
      var remoteHas = COLS.some(function (c) { return remote[c].length; }) || !!remote.settings;
      var localHas = COLS.some(function (c) { return state[c].length; });
      if (!remoteHas && localHas) { state.mode = 'cloud'; await cloudUploadAll(localSnapshot()); C.msg = 'This device\'s data is now in the cloud.'; }
      else if (remoteHas && localHas && !cacheIsThisAccount) { C.conflict = remote; C.status = 'conflict'; render(); return; }
      else applyRemote(remote);
      state.mode = 'cloud'; C.status = 'signed-in'; C.lastSync = Date.now(); state.localCloudUser = session.user.id; localSave();
    } catch (e) {
      C.status = 'signed-out'; C.msg = 'Couldn\'t reach the cloud: ' + cloudErr(e) + '. Your data stays on this device.';
    } finally { entering = false; }
    render();
  }
  // Settings merge: the cloud wins on clashes, but this device's own words, origins, styles and countries are kept.
  function mergeSettings(remoteS, localS) {
    var r = normSettings(remoteS || {}), l = normSettings(localS || {});
    function byId(a, b) { var have = {}; a.forEach(function (x) { if (x && x.id) have[x.id] = true; }); return a.concat(b.filter(function (x) { return x && !(x.id && have[x.id]); })); }
    var bias = JSON.parse(JSON.stringify(l.brewBias));
    Object.keys(r.brewBias).forEach(function (k) { bias[k] = Object.assign({}, bias[k] || {}, r.brewBias[k]); });
    return normSettings({
      rules: Object.assign({}, l.rules, r.rules),
      customNotes: Object.assign({}, l.customNotes, r.customNotes),
      customOrigins: byId(r.customOrigins, l.customOrigins),
      customPresets: byId(r.customPresets, l.customPresets),
      sourceCountries: r.sourceCountries.concat(l.sourceCountries.filter(function (c) { return r.sourceCountries.indexOf(c) < 0; })),
      brewBias: bias
    });
  }
  async function resolveConflict(choice) {
    var C = state.cloud, remote = C.conflict;
    C.busy = true; render();
    try {
      state.mode = 'cloud'; C.status = 'signed-in';
      if (choice === 'merge') {
        var merged = {};
        COLS.forEach(function (c) {
          var have = {}; remote[c].forEach(function (d) { have[d.id] = true; });
          merged[c] = remote[c].concat(state[c].filter(function (d) { return !have[d.id]; }));
        });
        merged.settings = mergeSettings(remote.settings, state.settings);
        await cloudUploadAll(merged);
        applyRemote(merged);
        C.msg = 'Merged this device into the cloud.';
      } else { applyRemote(remote); C.msg = 'Using the cloud data.'; }
      C.conflict = null; C.lastSync = Date.now(); state.localCloudUser = C.userId; localSave();
    } catch (e) { state.mode = 'local'; C.status = 'signed-out'; C.msg = 'Couldn\'t sync: ' + cloudErr(e); }
    C.busy = false; render();
  }
  function leaveCloud() {
    if (!state.cloud) return;
    // Unsynced writes stay tagged with the account they belong to (pushed on its next sign-in, dropped for any other account).
    if (Object.keys(cloudPending).length) { state.pendingUser = state.cloud.userId || state.pendingUser; lsSet(PENDING_KEY, { userId: state.pendingUser, ops: cloudPending }); }
    else { cloudPending = {}; try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage blocked */ } }
    writeChains = {};
    state.cloud.status = 'signed-out'; state.cloud.userId = null; state.cloud.conflict = null;
    if (state.mode === 'cloud') { state.mode = 'local'; localSave(); }
    render();
  }
  // A remembered simulator draft can point at beans that no longer exist (deleted, or on another device).
  function pruneMissingBeans() {
    var before = sim.rows.length;
    sim.rows = sim.rows.filter(function (r) { return r.kind !== 'saved' || beanById(r.beanId); });
    if (sim.rows.length !== before) {
      if (!sim.rows.length) sim.rows = defaultSim().rows;
      sim.result = null; sim.pcts = null; saveSimDraft();
      setTimeout(function () { if (!sim.result && simReady()) runSolve(); }, 30);
    }
  }
  function writeError(e) {
    var code = e && e.code;
    var msg = code === 'quota_exceeded' ? 'Storage is full. Delete old batches or cupping entries, then try again.'
      : code === 'invalid_argument' ? 'Only the owner or an editor can save changes here.'
      : code === 'revoked' ? 'Access to saving was withdrawn. Reload the page.'
      : 'Couldn\'t save. Check your connection and try again.';
    toast(msg, true);
    throw e;
  }
  async function putDoc(col, id, data) {
    if (db) { try { await db.collection(col).doc(id).set(data); } catch (e) { writeError(e); } return; }
    var list = state[col].filter(function (x) { return x.id !== id; });
    list.push(Object.assign({ id: id }, data));
    state[col] = sortByDate(list); localSave(); scheduleRender();
    if (state.mode === 'cloud') await cloudWrite(col, id, data);
  }
  async function patchDoc(col, id, patch) {
    if (db) { try { await db.collection(col).doc(id).update(patch); } catch (e) { writeError(e); } return; }
    state[col] = state[col].map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; }); localSave(); scheduleRender();
    if (state.mode === 'cloud') { var d = state[col].filter(function (x) { return x.id === id; })[0]; if (d) await cloudWrite(col, id, strip(d)); }
  }
  async function delDoc(col, id) {
    if (db) { try { await db.collection(col).doc(id).delete(); } catch (e) { writeError(e); } return; }
    state[col] = state[col].filter(function (x) { return x.id !== id; }); localSave(); scheduleRender();
    if (state.mode === 'cloud') await cloudWrite(col, id, null);
  }
  async function saveSettings(patch) {
    var data = normSettings(Object.assign({}, state.settings, patch));
    if (db) { try { await db.doc('settings/main').set(data); } catch (e) { writeError(e); } return; }
    state.settings = data; localSave(); scheduleRender();
    if (state.mode === 'cloud') await cloudWrite('settings', 'main', data);
  }
  function strip(doc) { var o = Object.assign({}, doc); delete o.id; return o; }
  // Restore: write everything locally first, then push it to the cloud in one batched upload (not hundreds of parallel writes).
  async function restoreBackup(d) {
    var lists = {};
    COLS.forEach(function (c) {
      lists[c] = (Array.isArray(d[c]) ? d[c] : []).filter(function (x) { return x && typeof x.id === 'string' && /^[A-Za-z0-9_\-.~:@+]{1,120}$/.test(x.id); });
    });
    var hasSettings = d.settings && typeof d.settings === 'object';
    if (db) {
      for (var c = 0; c < COLS.length; c++) for (var i = 0; i < lists[COLS[c]].length; i++) await putDoc(COLS[c], lists[COLS[c]][i].id, strip(lists[COLS[c]][i]));
      if (hasSettings) await saveSettings(d.settings);
      return;
    }
    COLS.forEach(function (c) {
      var ids = {}; lists[c].forEach(function (x) { ids[x.id] = true; });
      state[c] = sortByDate(state[c].filter(function (x) { return !ids[x.id]; }).concat(lists[c].map(function (x) { return Object.assign({}, x); })));
    });
    if (hasSettings) { state.settings = normSettings(Object.assign({}, state.settings, d.settings)); settingsChanged(); }
    localSave(); scheduleRender();
    if (state.mode !== 'cloud') return;
    var snap = { settings: state.settings };
    COLS.forEach(function (c) { snap[c] = lists[c]; });
    try { await cloudUploadAll(snap); state.cloud.lastSync = Date.now(); }
    catch (e) {
      // Couldn't upload in one go: queue each document so it retries on reconnect.
      for (var k = 0; k < COLS.length; k++) for (var j = 0; j < lists[COLS[k]].length; j++) cloudPending[COLS[k] + '/' + lists[COLS[k]][j].id] = { col: COLS[k], id: lists[COLS[k]][j].id, data: strip(lists[COLS[k]][j]) };
      cloudPending['settings/main'] = { col: 'settings', id: 'main', data: state.settings };
      savePending();
      toast('Restored on this device. The cloud couldn\'t be reached; it will sync when you\'re back online.', true);
    }
  }

  // ---------------- rendering ----------------
  var renderQueued = false;
  // rAF pauses in background tabs, so a timer backs it up: data changes always reach the screen.
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    var done = false;
    function run() { if (done) return; done = true; renderQueued = false; render(); }
    requestAnimationFrame(run);
    setTimeout(run, 80);
  }
  function routeFromHash() {
    var h = (location.hash || '').replace('#', '');
    return ROUTES.some(function (r) { return r[0] === h; }) ? h : 'simulator';
  }
  function go(route) { if (location.hash !== '#' + route) location.hash = route; else render(); }
  window.addEventListener('hashchange', function () { state.route = routeFromHash(); render(); window.scrollTo(0, 0); });

  function renderTabs() {
    var nav = clear(byId('tabs'));
    var counts = { beans: state.beans.length, cupping: state.cuppings.length, blends: state.blends.length, batches: state.batches.length };
    ROUTES.forEach(function (r) {
      nav.appendChild(el('a', { class: 'tab', href: '#' + r[0], 'aria-current': state.route === r[0] ? 'page' : null },
        r[1], counts[r[0]] ? el('span', { class: 'count' }, counts[r[0]]) : null));
    });
  }
  function banner() {
    if (state.mode === 'memory') return el('div', { class: 'banner' }, 'This browser isn\'t letting the page save (private window or blocked site data). Anything you add is lost when you close it. Use a normal window, or download a backup under Settings before you leave.');
    if (state.mode === 'cloud') return el('p', { class: 'muted small', style: 'margin:0 0 12px' }, '☁ Synced to the cloud as ' + (state.cloud.email || 'you') + '. Changes appear on your other devices when you open or switch back to the page there.');
    if (state.cloud && state.cloud.status === 'conflict') return el('div', { class: 'banner' }, 'You signed in, and both this device and the cloud already have data. Choose what to keep under Settings → Cloud sync.');
    if (state.mode === 'local') return el('p', { class: 'muted small', style: 'margin:0 0 12px' }, 'Saved in this browser on this device. ' +
      (state.cloud ? 'Sign in under Settings → Cloud sync to use the same data on your phone and laptop.' : 'To use your data on another device, download a backup under Settings and restore it there.'));
    if (state.mode === 'slow') return el('div', { class: 'banner' }, 'Your saved beans can\'t be reached yet. What you see may be out of date. It will update by itself once the connection is back.');
    return null;
  }
  function render() {
    state.route = routeFromHash();
    renderTabs();
    var main = byId('main');
    var active = document.activeElement, aid = active && active.id, selS = null, selE = null;
    try { if (aid && active.selectionStart != null) { selS = active.selectionStart; selE = active.selectionEnd; } } catch (e) { /* not a text input */ }
    clear(main);
    var b = banner(); if (b) main.appendChild(b);
    if (state.mapper) main.appendChild(mapperCard());
    var view = { simulator: viewSimulator, beans: viewBeans, cupping: viewCupping, blends: viewBlends, sheet: viewSheet, batches: viewBatches, origins: viewOrigins, prefs: viewPrefs }[state.route];
    main.appendChild(view());
    if (aid) {
      var again = byId(aid);
      if (again) { again.focus({ preventScroll: true }); try { if (selS != null) again.setSelectionRange(selS, selE); } catch (e) { /* ignore */ } }
    }
  }

  // ---------------- shared bits ----------------
  function noteChips(text, opts) {
    opts = opts || {};
    var p = parse(text), nc = opts.noteCalib || {};
    var kids = p.known.map(function (n) {
      return el('span', { class: 'chip' + (n.defect ? ' defect' : ''), title: LEX.families[n.family].label + ' · ' + n.intensity + (nc[n.key] ? ' · learned from cupping' : '') },
        n.label, nc[n.key] ? el('i', null, '×' + nf(nc[n.key], 2)) : null);
    });
    p.unknown.forEach(function (u) {
      kids.push(el('button', { type: 'button', class: 'chip unknown', title: 'Not recognised. Tap to tell the tool what it is.', onclick: function () { openMapper(u); } }, u + ' ?'));
    });
    if (opts.showIgnored) p.ignored.forEach(function (w) { kids.push(el('span', { class: 'chip ignored', title: 'Texture or quality word, not a flavour' }, w)); });
    return kids.length ? el('div', { class: 'chips' }, kids) : null;
  }
  function originSelect(id, value, onchange, allowNone) {
    var byCountry = {};
    origins().forEach(function (o) { (byCountry[o.country] = byCountry[o.country] || []).push(o); });
    var countries = Object.keys(byCountry).sort(function (a, b) { return a === 'Indonesia' ? -1 : b === 'Indonesia' ? 1 : a.localeCompare(b); });
    return el('select', { id: id, value: value || '', onchange: onchange },
      allowNone ? opt('', 'No origin (custom)') : null,
      countries.map(function (c) {
        return el('optgroup', { label: c }, byCountry[c].map(function (o) { return opt(o.id, o.region + ' · ' + o.species, o.id === value); }));
      }));
  }
  function processSelect(id, value, onchange) {
    return el('select', { id: id, value: value, onchange: onchange }, PROCS.map(function (p) { return opt(p, procLabel(p)); }));
  }
  function roastSelect(id, value, onchange) {
    return el('select', { id: id, value: String(value), onchange: onchange }, [1, 2, 3, 4, 5].map(function (r) { var c = E.ROAST_COLOURS[r]; return opt(String(r), r + ' · ' + c.name + ' (Agtron ' + c.agtron + ')'); }));
  }
  function varietalSelect(id, value, onchange) {
    return el('select', { id: id, value: value || 'unknown', onchange: onchange }, Object.keys(E.VARIETALS).map(function (k) { return opt(k, E.VARIETALS[k].label); }));
  }
  function speciesBadge(s) { return el('span', { class: 'badge ' + s }, s); }
  function procBadge(p) { return el('span', { class: 'badge proc' }, (E.PROCESSES[p] || E.PROCESSES.full).short); }
  function scoreLine(scores, calib) {
    return el('span', { class: 'scorebar' }, ATTRS.map(function (a) {
      var base = scores && scores[a] != null ? scores[a] : 3, c = calib && calib[a] ? calib[a] : 0;
      return el('span', null, AL[a].slice(0, 4) + ' ', el('b', null, nf(Math.min(5, Math.max(1, base + c)), 1)),
        c ? el('span', { class: c > 0 ? 'delta-pos' : 'delta-neg', title: 'Adjusted by cupping' }, ' ' + (c > 0 ? '+' : '') + nf(c, 2)) : null);
    }));
  }
  function openMapper(word) {
    state.mapper = { word: word, family: 'fruity', intensity: 'medium', suggestion: null, busy: false };
    render();
    window.scrollTo(0, 0);
  }

  // ---------------- simulator: data ----------------
  function simBeans() {
    return sim.rows.map(function (row, i) {
      if (row.kind === 'saved') { var b = beanById(row.beanId); return b ? savedBean(b) : null; }
      return { id: null, quick: true, name: row.name || 'Quick bean ' + (i + 1), species: row.species, roast: row.roast, process: row.process, varietal: row.varietal || 'unknown', originId: row.originId,
        cupScore: row.cupScore === '' ? null : row.cupScore, scores: row.scores, notes: parse(row.notesText).known, bagNotes: row.notesText, stockG: null };
    });
  }
  function rangesFrom(src) {
    var ranges = {};
    TATTRS.forEach(function (a) { var r = (src || {})[a] || ['', '']; ranges[a] = [r[0] === '' || r[0] == null ? null : Number(r[0]), r[1] === '' || r[1] == null ? null : Number(r[1])]; });
    return ranges;
  }
  // The full target, from the simulator or from a saved blend (same field names).
  function targetOf(src) {
    var must = E.splitTerms(src.mustText);
    if (src.acidType) must.push('acid:' + src.acidType);
    return { ranges: rangesFrom(src.ranges), must: must, mustNot: E.splitTerms(src.notText), specialty: src.specialty && src.specialty.on ? src.specialty : null,
      robustaMax: src.robustaMax === '' || src.robustaMax == null ? null : Number(src.robustaMax) };
  }
  function simTarget() { return targetOf(sim); }
  function simLimits() { return sim.rows.map(function (r) { return { min: r.min === '' ? null : Number(r.min), max: r.max === '' ? null : Number(r.max) }; }); }
  function simBounds() {
    var R = rules(), n = sim.rows.length, lim = simLimits();
    return {
      mins: lim.map(function (l) { return n > 1 ? Math.max(R.minPct, l.min || 0) : 100; }),
      maxs: lim.map(function (l) { return l.max != null && isFinite(l.max) ? l.max : 100; })
    };
  }
  function solveOpts() {
    var useIdx = -1;
    sim.rows.forEach(function (r, i) { if (r.key === sim.useKey) useIdx = i; });
    var mode = sim.mode === 'useup' && useIdx < 0 ? 'taste' : sim.mode;
    return { brew: sim.brew, rules: rules(), index: noteIndex(), limits: simLimits(), mode: mode, useIdx: useIdx, bagG: 250 };
  }
  function simSig() {
    return JSON.stringify([sim.rows.map(function (r) { var b = r.kind === 'saved' ? beanById(r.beanId) : null; return [r, b && [b.scores, b.calib, b.noteCalib, b.bagNotes, b.roast, b.species, b.process, b.cupScore, b.varietal]]; }),
      sim.brew, sim.ranges, sim.mustText, sim.notText, sim.mode, sim.useKey, sim.acidType, sim.specialty, sim.robustaMax, state.settings]);
  }
  function simReady() { return sim.rows.length > 0 && simBeans().every(Boolean); }
  function currentEval() {
    if (!sim.pcts || sim.pcts.length !== sim.rows.length || !simReady()) return null;
    return E.evaluateMix(simBeans(), sim.pcts, simTarget(), solveOpts());
  }
  function runSolve() {
    if (!simReady()) { toast('Pick a bean for every row first.', true); return; }
    sim.busy = true; state.subs = null; render();
    setTimeout(function () {
      var res = E.solve(simBeans(), simTarget(), solveOpts());
      sim.result = res; sim.sig = simSig(); sim.busy = false; sim.manual = false; sim.cupping = null;
      sim.pcts = res.best ? res.best.pcts.slice() : null;
      saveSimDraft(); render();
    }, 30);
  }
  function simChanged(full) { saveSimDraft(); if (full) render(); else refreshResults(); }
  function clearMix() { sim.pcts = null; sim.result = null; state.subs = null; }

  // ---------------- flavour wheel (family · group · note) ----------------
  // [family, colour, [[group ('' = none), colour, [[note, colour], ...]], ...]]
  var WHEEL = [
    ['Floral', '#F06AA6', [['Floral', '#F06AA6', [['Lavender', '#A992D0'], ['Hibiscus', '#E8424B'], ['Jasmine', '#EFD08E'], ['Rose', '#C9566C']]]]],
    ['Fruit', '#A2486A', [
      ['Berry', '#4B4F8C', [['Strawberry', '#E2101E'], ['Raspberry', '#E33A5A'], ['Blueberry', '#4A7DB0'], ['Blackberry', '#4A1720']]],
      ['Dried', '#7A4A5E', [['Raisin', '#5E2E2A'], ['Prune', '#4E2F3A'], ['Date', '#8E1C1C']]],
      ['Melon', '#8DAA4F', [['Watermelon', '#C9474C'], ['Honeydew', '#F2C500']]],
      ['Pomes', '#A8B48A', [['Apple', '#7FA81A'], ['Pear', '#9C9A35']]],
      ['Citrus', '#E39B2E', [['Blood orange', '#AA0E14'], ['Orange', '#F28A10'], ['Lemon', '#F6C40E'], ['Lime', '#8FBF1E'], ['Grapefruit', '#F2747A']]],
      ['Tropical', '#E6CF6B', [['Banana', '#F7C81E'], ['Mango', '#F5B31A'], ['Passionfruit', '#F2943A'], ['Coconut', '#EDDCC5']]],
      ['Stone fruit', '#B8545E', [['Peach', '#F59E73'], ['Apricot', '#EE7A2E'], ['Plum', '#8E0C26'], ['Cherry', '#B40F2A']]]
    ]],
    ['Herbal', '#7FA34E', [
      ['Culinary', '#4F8A55', [['Sage', '#86B06D'], ['Mint', '#22C55E'], ['Oregano', '#4FA33A'], ['Dill', '#78B320'], ['Basil', '#2E7D1E'], ['Thyme', '#4B4B10']]],
      ['Tea', '#6A7B16', [['Green tea', '#9E9A50'], ['Black tea', '#5F5A55']]]
    ]],
    ['Vegetal', '#0F7F3E', [
      ['Woody', '#6B5E50', [['Cedar', '#72A86A'], ['Pine', '#2F6B57']]],
      ['Earthy', '#7F944C', [['Squash', '#E2B21E'], ['Sweet pea', '#A9B66E'], ['Hay', '#C2A98A'], ['Olive', '#B59A12']]]
    ]],
    ['Cocoa', '#4B3420', [['Chocolate', '#7A4E12', [['White chocolate', '#F1E3C8'], ['Milk chocolate', '#B5703A'], ['Dark chocolate', '#5A3A2A'], ['Cocoa butter', '#EFD27A']]]]],
    ['Nutty', '#8A6050', [
      ['Tree nuts', '#7B4A32', [['Brazil nut', '#C8743A'], ['Hazelnut', '#B0663A'], ['Almond', '#C75A12'], ['Pecan', '#8F3328'], ['Macadamia', '#EBCB52'], ['Walnut', '#D2A65E'], ['Pistachio', '#B9CF3A']]],
      ['Seeds', '#A8865A', [['Sesame', '#E2D3A8'], ['Poppy', '#6E7179']]]
    ]],
    ['Roasted', '#6E4228', [['', '#7A4A2E', [['Tobacco', '#C77E2E'], ['Toast', '#A74B12'], ['Caramel', '#9A2F12'], ['Treacle', '#4A1A12'], ['Smoked', '#C6A884']]]]],
    ['Spice', '#A8322E', [
      ['Pepper', '#8E7F72', [['Black pepper', '#6B4A48'], ['White pepper', '#E3DCCB']]],
      ['Brown spice', '#923F3F', [['Mace', '#D65E3E'], ['Clove', '#5A3626'], ['Cinnamon', '#C4651E'], ['Coriander', '#CF8C5A'], ['Ginger', '#F3C08A'], ['Nutmeg', '#C79A78'], ['Star anise', '#8A2C2E']]]
    ]],
    ['Fermented', '#9C6A55', [['', '#A47460', [['Whiskey', '#D9620A'], ['Ale', '#B52F12'], ['Red wine', '#991B2E']]]]],
    ['Savoury', '#C54C45', [['', '#CC5B53', [['Mushroom', '#D4C2B4'], ['Umami', '#C49A70'], ['Grain', '#E7C98F'], ['Malt', '#C17A10'], ['Soy sauce', '#5E0A0C'], ['Tomato', '#D91B1B']]]]],
    ['Sweet', '#E58A4A', [
      ['Syrup', '#D9A06E', [['Golden syrup', '#E58C10'], ['Honey', '#C26A1E'], ['Maple syrup', '#B86A3A'], ['Molasses', '#4A1414']]],
      ['Confectionery', '#8A6CC2', [['Marshmallow', '#EFBBC5'], ['Marzipan', '#D8C89A'], ['Bubble gum', '#8FC5BC'], ['Candy floss', '#E87F8E']]]
    ]]
  ];
  var wheelUI = { mode: 'must', big: false };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && wheelUI.big) { wheelUI.big = false; render(); } });
  function wheelInk(hex) {
    var n = parseInt(hex.slice(1), 16);
    var f = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255) > 0.36 ? '#1C1A17' : '#FFFFFF';
  }
  function termHas(text, name) { var k = name.toLowerCase(); return E.splitTerms(text).some(function (t) { return t.toLowerCase() === k; }); }
  function termToggle(text, name, on) {
    var k = name.toLowerCase(), list = E.splitTerms(text).filter(function (t) { return t.toLowerCase() !== k; });
    if (on) list.push(name.toLowerCase());
    return list.join(', ');
  }
  function wheelTap(name) {
    var key = wheelUI.mode === 'must' ? 'mustText' : 'notText', other = key === 'mustText' ? 'notText' : 'mustText';
    var on = !termHas(sim[key], name);
    sim[key] = termToggle(sim[key], name, on);
    if (on) sim[other] = termToggle(sim[other], name, false);
    simChanged(true);
  }
  function wheelEl(S) {
    var total = 0;
    WHEEL.forEach(function (f) { f[2].forEach(function (g) { total += g[2].length; }); });
    var step = 360 / total, gap = 0.25, a = 0, small = S < 500;
    var noteStops = [], subStops = [], catStops = [], rimStops = [], labels = [];
    function lab(deg, r, w, fs, fg, text, extra, onclick, aria, pressed) {
      var h = Math.max(fs + 6, 10), flip = deg > 180;
      return el('button', { type: 'button', class: 'wl', onclick: onclick, title: aria || text, 'aria-label': aria || text, 'aria-pressed': pressed,
        style: 'width:' + w + 'px;height:' + h + 'px;line-height:' + h + 'px;font-size:' + fs + 'px;color:' + fg + ';' +
          'transform:translate(-50%,-50%) rotate(' + (deg - 90) + 'deg) translateX(' + r + 'px)' + (flip ? ' rotate(180deg)' : '') + ';' + (extra || '') }, text);
    }
    WHEEL.forEach(function (fam) {
      var c0 = a;
      fam[2].forEach(function (grp) {
        var g0 = a;
        grp[2].forEach(function (nt) {
          var s0 = a, s1 = a + step, name = nt[0];
          var isMust = termHas(sim.mustText, name), isNot = termHas(sim.notText, name);
          noteStops.push(nt[1] + ' ' + s0 + 'deg ' + (s1 - gap) + 'deg', 'var(--bg) ' + (s1 - gap) + 'deg ' + s1 + 'deg');
          rimStops.push((isMust ? 'var(--ok)' : isNot ? 'var(--bad)' : 'transparent') + ' ' + s0 + 'deg ' + s1 + 'deg');
          var on = isMust || isNot;
          labels.push(lab((s0 + s1) / 2, S * 0.395, S * 0.18, small ? 6.5 : 11, on ? '#1C1A17' : wheelInk(nt[1]), (isMust ? '✓ ' : isNot ? '✕ ' : '') + name,
            on ? 'background:rgba(255,255,255,.94);box-shadow:0 1px 3px rgba(0,0,0,.3);' : '', function () { wheelTap(name); },
            name + (isMust ? ', must taste' : isNot ? ', must not taste' : ''), on ? 'true' : 'false'));
          a = s1;
        });
        subStops.push(grp[1] + ' ' + g0 + 'deg ' + (a - gap) + 'deg', 'var(--bg) ' + (a - gap) + 'deg ' + a + 'deg');
        if (grp[0]) labels.push(lab((g0 + a) / 2, S * 0.235, S * 0.12, small ? 6.5 : 12, wheelInk(grp[1]), grp[0], '', function () { wheelTap(grp[0]); }, grp[0] + ' (whole group)'));
      });
      catStops.push(fam[1] + ' ' + c0 + 'deg ' + (a - gap) + 'deg', 'var(--bg) ' + (a - gap) + 'deg ' + a + 'deg');
      labels.push(lab((c0 + a) / 2, S * 0.13, S * 0.1, small ? 7.5 : 15, wheelInk(fam[1]), fam[0], 'font-weight:700;', function () { wheelTap(fam[0]); }, fam[0] + ' (whole family)'));
    });
    function ring(f, bg) { return el('div', { class: 'wr', style: 'width:' + (S * f) + 'px;height:' + (S * f) + 'px;background:conic-gradient(' + bg.join(', ') + ')' }); }
    return el('div', { class: 'wheel', style: 'width:' + S + 'px;height:' + S + 'px' },
      ring(1, rimStops), ring(0.976, noteStops), ring(0.59, subStops), ring(0.35, catStops),
      labels,
      el('div', { class: 'wr wc', style: 'width:' + (S * 0.17) + 'px;height:' + (S * 0.17) + 'px;font-size:' + (small ? 8 : 13) + 'px' }, wheelUI.mode === 'must' ? 'Tap = must taste' : 'Tap = must not'));
  }
  function wheelModeSeg() {
    return el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'What a tap on the wheel does' },
      [['must', 'Must taste'], ['not', 'Must not taste']].map(function (o) {
        return el('label', null, el('input', { type: 'radio', name: 'wmode' + (wheelUI.big ? 'b' : ''), value: o[0], checked: wheelUI.mode === o[0], onchange: function () { wheelUI.mode = o[0]; render(); } }), el('span', null, o[1]));
      }));
  }
  function wheelCard() {
    var musts = E.splitTerms(sim.mustText), nots = E.splitTerms(sim.notText);
    return el('section', { class: 'card wheel-card', 'aria-labelledby': 'wh-h' },
      el('div', { class: 'row' }, el('h2', { id: 'wh-h' }, 'Flavour wheel'), el('span', { class: 'spacer' }),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { wheelUI.big = true; render(); } }, 'Open large')),
      el('p', { class: 'muted small' }, 'Family · group · note. Tap a note to add it to the cup you want; tap again to remove it.'),
      wheelModeSeg(),
      el('div', { class: 'wheel-wrap' }, wheelEl(Math.max(260, Math.min(320, window.innerWidth - 64)))),
      el('div', { class: 'chips' }, musts.map(function (t) { return el('span', { class: 'chip must' }, '✓ ' + t); }), nots.map(function (t) { return el('span', { class: 'chip not' }, '✕ ' + t); })));
  }
  function wheelOverlay() {
    if (!wheelUI.big) return null;
    var S = Math.max(320, Math.min(820, window.innerHeight - 150, window.innerWidth - 48));
    function close() { wheelUI.big = false; render(); }
    return el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Flavour wheel', onclick: function (e) { if (e.target === e.currentTarget) close(); },
      onkeydown: function (e) { if (e.key === 'Escape') close(); } },
      el('div', { class: 'overlay-box' },
        el('div', { class: 'row' }, el('h2', null, 'Flavour wheel'), wheelModeSeg(), el('span', { class: 'spacer' }),
          el('span', { class: 'muted small' }, E.splitTerms(sim.mustText).length + ' must · ' + E.splitTerms(sim.notText).length + ' must not'),
          el('button', { class: 'btn primary', type: 'button', id: 'wheel-close', onclick: close }, 'Done')),
        el('div', { class: 'wheel-wrap' }, wheelEl(S))));
  }

  // ---------------- simulator: view ----------------
  function viewSimulator() {
    return el('div', { class: 'sim' },
      el('div', { class: 'stack' }, targetCard(), mixCard(), pickerCard()),
      el('div', { class: 'stack', id: 'results' }, resultsContent()),
      el('aside', { class: 'stack sim-side' }, wheelCard()),
      wheelOverlay());
  }
  function refreshResults() { var r = byId('results'); if (r) { clear(r); append(r, [resultsContent()]); } }

  function applyPreset(id) {
    var p = E.PRESETS.concat(state.settings.customPresets || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    sim.brew = p.brew; sim.mustText = p.must || ''; sim.notText = p.mustNot || ''; sim.acidType = p.acidType || '';
    sim.robustaMax = p.robustaMax != null ? String(p.robustaMax) : (p.specialty && p.specialty.arabicaOnly ? '0' : '');
    sim.specialty = p.specialty ? Object.assign(defaultSpecialty(), JSON.parse(JSON.stringify(p.specialty))) : Object.assign(defaultSpecialty(), { on: false });
    sim.ranges = {};
    TATTRS.forEach(function (a) { var r = (p.ranges || {})[a] || ['', '']; sim.ranges[a] = [String(r[0] == null ? '' : r[0]), String(r[1] == null ? '' : r[1])]; });
    pickRes = null; state.subs = null;
    simChanged(true);
    toast('Loaded "' + p.name + '". Press Decide ratio, or let it pick the beans.');
  }
  function rangeSelect(id, value, onchange) {
    var vals = ['', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
    return el('select', { id: id, value: value, onchange: onchange, style: 'width:auto' }, vals.map(function (v) { return opt(v, v === '' ? 'any' : v.replace('.', ',')); }));
  }
  function targetCard() {
    var R = rules(), idx = noteIndex();
    var mine = state.settings.customPresets || [];
    var brewSeg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Brew style' }, Object.keys(E.BREWS).map(function (k) {
      return el('label', { title: E.BREWS[k].label }, el('input', { type: 'radio', name: 'brew', id: 'brew-' + k, value: k, checked: sim.brew === k, onchange: function () { sim.brew = k; simChanged(true); } }), el('span', null, BREW_SHORT[k] || k));
    }));
    var sp = sim.specialty;
    function spNum(id, key, attrs) {
      return el('input', Object.assign({ type: 'number', id: id, value: sp[key], oninput: function (e) { sp[key] = e.target.value === '' ? '' : Number(e.target.value); simChanged(false); } }, attrs || {}));
    }
    var gate = el('details', { class: 'gate', open: sp.on ? true : null },
      el('summary', null, el('label', { class: 'row tight', onclick: function (e) { e.stopPropagation(); } },
        el('input', { type: 'checkbox', id: 'sp-on', checked: sp.on, onchange: function (e) { sp.on = e.target.checked; simChanged(true); } }),
        el('b', null, 'High-end specialty check'))),
      el('div', { class: 'stack', style: 'gap:8px;margin-top:8px' },
        el('p', { class: 'muted small' }, 'For specialty cafés: the estimated cup score (from your beans\' cup scores) must reach the target, the cup must be clean, roast colour must fit, and balance and complexity must be high enough.'),
        el('div', { class: 'grid4' },
          field('Min cup score', spNum('sp-score', 'minScore', { min: 70, max: 95, step: 0.5 })),
          field('Robusta max %', spNum('sp-rob', 'robustaMax', { min: 0, max: 100 })),
          field('Min balance', spNum('sp-bal', 'minBalance', { min: 1, max: 5, step: 0.5 })),
          field('Min complexity', spNum('sp-cx', 'minComplexity', { min: 1, max: 5, step: 0.5 }))),
        el('div', { class: 'grid2' },
          el('label', { class: 'row tight small' }, el('input', { type: 'checkbox', id: 'sp-ara', checked: sp.arabicaOnly, onchange: function (e) { sp.arabicaOnly = e.target.checked; simChanged(true); } }), 'Arabica only'),
          el('div', { class: 'row tight small' }, el('span', { class: 'muted' }, 'Roast colour'),
            rangeSelect('sp-rlo', String((sp.roastWindow || [])[0] || ''), function (e) { sp.roastWindow = [e.target.value, (sp.roastWindow || [])[1] || '']; simChanged(true); }), '–',
            rangeSelect('sp-rhi', String((sp.roastWindow || [])[1] || ''), function (e) { sp.roastWindow = [(sp.roastWindow || [])[0] || '', e.target.value]; simChanged(true); })))));
    function termChips(text) {
      var terms = E.splitTerms(text);
      if (!terms.length) return null;
      return el('div', { class: 'chips' }, terms.map(function (t) {
        var r = E.resolveTerm(t, idx);
        return r ? el('span', { class: 'chip', title: r.kind === 'note' ? 'Single note' : r.kind === 'sub' ? 'Note group' : 'Flavour wheel family' }, r.label, el('i', null, r.kind === 'note' ? 'note' : r.kind === 'sub' ? 'group' : 'family'))
          : el('span', { class: 'chip unknown' }, t + ' ?');
      }));
    }
    var useOpts = sim.rows.map(function (r, i) { var b = r.kind === 'saved' ? beanById(r.beanId) : null; return opt(r.key, (b ? b.name : r.name) || 'Bean ' + (i + 1)); });
    return el('section', { class: 'card', 'aria-labelledby': 'tgt-h' },
      el('h2', { id: 'tgt-h' }, 'The cup you want'),
      el('div', { class: 'row' },
        el('div', { style: 'flex:1;min-width:200px' }, field('Start from a style', el('select', { id: 'preset', value: '', onchange: function (e) { applyPreset(e.target.value); } },
          opt('', 'Choose a style…'),
          ['SG', 'TH', 'ID'].map(function (rg) { return el('optgroup', { label: REGION_LABEL[rg] }, E.PRESETS.filter(function (p) { return p.region === rg; }).map(function (p) { return opt(p.id, p.name.replace(/^[A-Za-z]+: /, '')); })); }),
          el('optgroup', { label: 'Indonesian everyday styles' }, E.PRESETS.filter(function (p) { return !p.region; }).map(function (p) { return opt(p.id, p.name); })),
          mine.length ? el('optgroup', { label: 'My styles' }, mine.map(function (p) { return opt(p.id, p.name); })) : null)))),
      el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'label' }, 'Served as'), brewSeg),
      el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'label', id: 'rob-l' }, 'Robusta in the blend'),
        el('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': 'rob-l' }, [['0', 'None · 100% arabica'], ['20', 'Up to 20%'], ['40', 'Up to 40%'], ['', 'Style limit']].map(function (o) {
          return el('label', null, el('input', { type: 'radio', name: 'robmax', id: 'robmax-' + (o[0] || 'any'), value: o[0], checked: String(sim.robustaMax) === o[0], onchange: function () { sim.robustaMax = o[0]; simChanged(true); } }), el('span', null, o[1]));
        })),
        el('span', { class: 'muted small' }, 'Limit used: ' + Math.min(R.robustaCap[sim.brew], sim.robustaMax === '' ? 100 : Number(sim.robustaMax)) + '% robusta (' + (BREW_SHORT[sim.brew] || sim.brew) + ' style allows ' + R.robustaCap[sim.brew] + '%). Every result shows its arabica / robusta share.')),
      el('div', { class: 'tablewrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', null, 'As served'), el('th', null, 'From'), el('th', null, 'To'))),
        el('tbody', null, TATTRS.map(function (a) {
          var r = sim.ranges[a] || ['', ''];
          return el('tr', null, el('td', null, AL[a]),
            el('td', null, rangeSelect('rg-lo-' + a, r[0], function (e) { sim.ranges[a] = [e.target.value, (sim.ranges[a] || ['', ''])[1]]; simChanged(true); })),
            el('td', null, rangeSelect('rg-hi-' + a, r[1], function (e) { sim.ranges[a] = [(sim.ranges[a] || ['', ''])[0], e.target.value]; simChanged(true); })));
        })))),
      field('Must taste', el('input', { type: 'text', id: 'must', value: sim.mustText, placeholder: 'e.g. chocolate, citrus', oninput: function (e) { sim.mustText = e.target.value; simChanged(false); }, onchange: function () { render(); } }), 'Reaches at least Supporting in the cup. Name a note, a group (citrus, berry, chocolate) or a wheel family.'),
      termChips(sim.mustText),
      field('Must not taste', el('input', { type: 'text', id: 'mustnot', value: sim.notText, placeholder: 'e.g. earthy', oninput: function (e) { sim.notText = e.target.value; simChanged(false); }, onchange: function () { render(); } }), 'Stays at Faint or below.'),
      termChips(sim.notText),
      field('Acidity character wanted', el('select', { id: 'acidtype', value: sim.acidType, onchange: function (e) { sim.acidType = e.target.value; simChanged(true); } },
        opt('', 'Any'), Object.keys(E.ACID_TYPES).filter(function (k) { return k !== 'acetic'; }).map(function (k) { return opt(k, E.ACID_TYPES[k].label); })),
        'Must reach at least Supporting. Comes from notes like lemon (citric), apple and peach (malic), blackcurrant (phosphoric) or grape and wine (tartaric).'),
      gate,
      el('div', { class: 'grid2' },
        field('When several mixes fit', el('select', { id: 'mode', value: sim.mode, onchange: function (e) { sim.mode = e.target.value; if (sim.mode === 'useup' && !sim.useKey && sim.rows[0]) sim.useKey = sim.rows[0].key; simChanged(true); } },
          opt('taste', 'Choose the best-balanced cup'), opt('stock', 'Make the most 250 g bags from stock'), opt('useup', 'Use up as much as possible of…'))),
        sim.mode === 'useup' ? field('Bean to use up', el('select', { id: 'useup', value: sim.useKey, onchange: function (e) { sim.useKey = e.target.value; simChanged(true); } }, useOpts)) : el('span')),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary big', type: 'button', disabled: sim.busy, onclick: runSolve }, sim.busy ? 'Deciding…' : 'Decide ratio'),
        el('span', { class: 'spacer' }),
        el('input', { type: 'text', id: 'preset-name', placeholder: 'Name this style', value: state.presetName || '', style: 'width:150px', oninput: function (e) { state.presetName = e.target.value; } }),
        el('button', { class: 'btn ghost', type: 'button', onclick: async function () {
          var name = (state.presetName || '').trim();
          if (!name) { toast('Type a name for the style first.', true); return; }
          var p = { id: uid('p'), name: name, brew: sim.brew, ranges: JSON.parse(JSON.stringify(sim.ranges)), must: sim.mustText, mustNot: sim.notText, acidType: sim.acidType,
            robustaMax: sim.robustaMax === '' ? null : Number(sim.robustaMax),
            specialty: sim.specialty.on ? JSON.parse(JSON.stringify(sim.specialty)) : null };
          try { await saveSettings({ customPresets: (state.settings.customPresets || []).concat([p]) }); state.presetName = ''; toast('Saved style "' + name + '".'); } catch (e) { /* shown */ }
        } }, 'Save as my style')));
  }

  function mixCard() {
    var rows = sim.rows.map(function (row, i) { return beanRowEditor(row, i); });
    return el('section', { class: 'card', 'aria-labelledby': 'mix-h' },
      el('div', { class: 'row' }, el('h2', { id: 'mix-h' }, 'Beans in the mix'), el('span', { class: 'spacer' }), el('span', { class: 'muted small mono' }, sim.rows.length + ' of 5')),
      rows.length ? rows : el('div', { class: 'empty' }, el('p', null, 'Add 2–5 beans, or let the simulator pick them for you below.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', disabled: sim.rows.length >= 5, onclick: function () {
          var saved = state.beans.filter(function (b) { return !sim.rows.some(function (r) { return r.beanId === b.id; }); })[0];
          sim.rows.push(saved ? savedRow(saved.id) : quickRow('', 'id-gayo', 3, ''));
          clearMix(); simChanged(true);
        } }, '+ Add bean'),
        sim.rows.some(function (r) { return /^Example/.test(r.name || ''); }) ? el('span', { class: 'muted small' }, 'Examples are loaded so you can see how it works. Replace them with your own beans.') : null));
  }
  function beanRowEditor(row, i) {
    var color = BEAN_COLORS[i];
    var src = el('select', { id: 'row-src-' + row.key, onchange: function (e) {
      var v = e.target.value;
      if (v === '__quick') { var q = quickRow('', row.originId || 'id-gayo', 3, ''); q.key = row.key; Object.assign(row, q); }
      else if (sim.rows.some(function (r, j) { return j !== i && r.kind === 'saved' && r.beanId === v; })) { toast('That bean is already in the mix.', true); render(); return; }
      else { row.kind = 'saved'; row.beanId = v; }
      clearMix(); simChanged(true);
    } },
      opt('__quick', 'Quick bean (not saved)', row.kind === 'quick'),
      state.beans.length ? el('optgroup', { label: 'My beans' }, state.beans.map(function (b) {
        // A saved bean can only be in one row: its stock and calibration are per bean.
        var elsewhere = sim.rows.some(function (r, j) { return j !== i && r.kind === 'saved' && r.beanId === b.id; });
        return el('option', { value: b.id, selected: row.kind === 'saved' && row.beanId === b.id, disabled: elsewhere }, b.name + ' · ' + b.species + (elsewhere ? ' (already in the mix)' : ''));
      })) : null);
    var body;
    if (row.kind === 'saved') {
      var b = beanById(row.beanId);
      if (!b) body = el('p', { class: 'muted small' }, state.mode === 'connecting' ? 'Loading…' : 'This bean was deleted. Pick another.');
      else {
        var o = originById(b.originId);
        body = el('div', { class: 'stack', style: 'gap:6px' },
          el('div', { class: 'row tight small' }, speciesBadge(b.species), procBadge(beanProcess(b)), el('span', { class: 'muted' }, (o ? o.region : 'Custom origin') + ' · ' + E.roastColour(b.roast).name.toLowerCase() + ' roast' + (b.cupScore ? ' · cup ' + nf(b.cupScore, 2) : ' · no cup score') + ' · stock ' + fmtKg(b.stockG || 0))),
          noteChips(b.bagNotes, { noteCalib: b.noteCalib }), scoreLine(b.scores, b.calib));
      }
    } else {
      var rederive = function (prev) {
        var before = derived(prev.originId, prev.roast, prev.process, prev.varietal, prev.species);
        if (!before || sameScores(row.scores, before)) row.scores = derived(row.originId, row.roast, row.process, row.varietal, row.species) || row.scores;
        row.notesText = autoNotes(row.notesText, prev, row);
      };
      var snap = function () { return { originId: row.originId, roast: row.roast, process: row.process, varietal: row.varietal, species: row.species }; };
      body = el('div', { class: 'stack', style: 'gap:8px' },
        el('div', { class: 'grid2' },
          field('Name', el('input', { type: 'text', id: 'row-name-' + row.key, value: row.name, placeholder: 'e.g. Toraja from Roastery X', oninput: function (e) { row.name = e.target.value; simChanged(false); } })),
          field('Origin', originSelect('row-origin-' + row.key, row.originId, function (e) {
            var prev = snap(), o = originById(e.target.value);
            row.originId = e.target.value;
            if (o) { row.species = o.species; row.process = mainProcess(o); rederive(prev); }
            clearMix(); simChanged(true);
          }))),
        el('div', { class: 'grid4' },
          field('Species', el('select', { id: 'row-sp-' + row.key, value: row.species, onchange: function (e) {
            var prev = snap(), sib = siblingOrigin(originById(row.originId), e.target.value);
            row.species = e.target.value;
            if (sib && sib.id !== row.originId) { row.originId = sib.id; row.process = mainProcess(sib); }
            rederive(prev); clearMix(); simChanged(true);
          } }, SPECIES.map(function (s) { return opt(s, s); }))),
          field('Process', processSelect('row-proc-' + row.key, row.process, function (e) { var prev = snap(); row.process = e.target.value; rederive(prev); simChanged(true); })),
          field('Varietal', varietalSelect('row-var-' + row.key, row.varietal, function (e) { var prev = snap(); row.varietal = e.target.value; rederive(prev); simChanged(true); })),
          field('Roast colour', roastSelect('row-roast-' + row.key, row.roast, function (e) { var prev = snap(); row.roast = Number(e.target.value); rederive(prev); simChanged(true); }))),
        field('Cup score (optional, 0–100)', el('input', { type: 'number', id: 'row-cs-' + row.key, min: 0, max: 100, step: 0.25, value: row.cupScore == null ? '' : row.cupScore, placeholder: 'e.g. 85', oninput: function (e) { row.cupScore = e.target.value === '' ? '' : Number(e.target.value); simChanged(false); } }), 'From the roastery\'s spec sheet or your own cupping. Needed for the high-end score check.'),
        field('Notes on the bag', el('input', { type: 'text', id: 'row-notes-' + row.key, value: row.notesText, placeholder: 'e.g. dark chocolate, gula aren, orange', oninput: function (e) { row.notesText = e.target.value; simChanged(false); }, onchange: function () { render(); } })),
        noteChips(row.notesText, { showIgnored: true }),
        (function () {
          var typ = E.typicalNotes(originById(row.originId), row.species, row.process);
          return typ && typ !== row.notesText ? el('button', { class: 'btn ghost', type: 'button', style: 'justify-self:start', onclick: function () { row.notesText = typ; simChanged(true); } },
            'Use typical ' + row.species + ', ' + procLabel(row.process).toLowerCase() + ' notes: ' + typ) : null;
        })(),
        el('details', null, el('summary', { class: 'small' }, 'Taste scores (1–5)'),
          el('div', { class: 'grid4', style: 'margin-top:8px' }, ATTRS.map(function (a) {
            return field(AL[a], el('input', { type: 'number', id: 'row-sc-' + a + '-' + row.key, min: 1, max: 5, step: 0.5, value: row.scores[a], oninput: function (e) { var v = Number(e.target.value); if (v >= 1 && v <= 5) { row.scores[a] = v; simChanged(false); } } }));
          }))));
    }
    return el('div', { class: 'beanrow', style: 'border-left-color:' + color },
      el('div', { class: 'row tight' }, el('span', { class: 'dot', style: 'background:' + color }), el('div', { style: 'flex:1;min-width:0' }, src),
        el('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Remove bean', onclick: function () {
          var removed = sim.rows.splice(i, 1)[0];
          // "Use up" pointed at this row: move it to the first remaining row, or go back to best taste.
          if (removed && sim.useKey === removed.key) {
            if (sim.rows.length) sim.useKey = sim.rows[0].key; else { sim.useKey = ''; sim.mode = 'taste'; }
          }
          clearMix(); simChanged(true);
        } }, 'Remove')),
      body,
      sim.pcts && sim.pcts.length === sim.rows.length ? substituteBlock(i, row) : null,
      el('div', { class: 'row tight small' }, el('span', { class: 'muted' }, 'Share limits'),
        el('input', { type: 'number', id: 'row-min-' + row.key, min: 0, max: 100, placeholder: 'min %', value: row.min, style: 'width:90px', oninput: function (e) { row.min = e.target.value; simChanged(false); } }),
        el('input', { type: 'number', id: 'row-max-' + row.key, min: 0, max: 100, placeholder: 'max %', value: row.max, style: 'width:90px', oninput: function (e) { row.max = e.target.value; simChanged(false); } })));
  }

  // ---------------- bean picker ----------------
  // Saved beans with stock, as candidates for the picker and substitute search.
  function savedCandidates() {
    return state.beans.filter(function (b) { return (b.stockG || 0) > 0; }).map(function (b) {
      var sb = savedBean(b); sb.src = { kind: 'saved', beanId: b.id }; return sb;
    });
  }
  // Catalogue origins you can actually buy (Settings → Countries I can source from), in every process they're sold in.
  function catalogueCandidates(roast) {
    var idx = noteIndex(), out = [];
    roast = Number(roast) || 3;
    origins().filter(sourceable).forEach(function (o) {
      var procs = E.offeredProcesses(o.process);
      (procs.length ? procs : [mainProcess(o)]).forEach(function (p) {
        out.push({ id: null, quick: true, name: o.region + (procs.length > 1 ? ' · ' + E.PROCESSES[p].short.toLowerCase() : ''), species: o.species, roast: roast, process: p,
          scores: E.scoresFor(o, roast, p), notes: E.parseNotes(E.typicalNotes(o, o.species, p), idx).known, stockG: null, originKey: o.id, src: { kind: 'origin', originId: o.id, roast: roast, process: p } });
      });
    });
    return out;
  }
  function pickCandidates() {
    var P = sim.pick, out = [];
    if (P.source !== 'catalogue') out = out.concat(savedCandidates());
    if (P.source !== 'mine') {
      out = out.concat(catalogueCandidates(P.roast));
    }
    return out;
  }
  function sourcingNote() {
    var sc = state.settings.sourceCountries || [];
    return sc.length ? 'Catalogue limited to what you can source: ' + sc.join(', ') + '. Change it under Settings.' : 'Catalogue: all countries. Limit it to what you can actually buy under Settings → Countries I can source from.';
  }

  // ---------------- smart substitutes ----------------
  function runSubstitute(i) {
    if (!sim.pcts || sim.pcts.length !== sim.rows.length) { toast('Decide a ratio first, then look for a substitute.', true); return; }
    var beans = simBeans(), gone = beans[i];
    var roast = gone.roast || 3;
    // Never offer a bean that is already in the mix (the one being replaced included).
    function same(c, b) { return c.src.kind === 'saved' ? !!b.id && c.src.beanId === b.id : !b.id && c.src.originId === b.originId && c.process === b.process; }
    var cands = savedCandidates().concat(catalogueCandidates(roast)).filter(function (c) { return !beans.some(function (b) { return same(c, b); }); });
    state.subs = { key: sim.rows[i].key, busy: true, res: null };
    render();
    setTimeout(function () {
      var t = simTarget();
      state.subs.res = E.substitutes(beans, sim.pcts, i, cands, { brew: sim.brew, rules: rules(), index: noteIndex(), target: t, limit: 3, shortlist: 12 });
      state.subs.busy = false; render();
    }, 30);
  }
  function useSubstitute(i, opt) {
    var c = opt.candidate;
    var row = c.src.kind === 'saved' ? savedRow(c.src.beanId) : (function () { var o = originById(c.src.originId); return quickRow(o.region, o.id, c.src.roast, E.typicalNotes(o, o.species, c.src.process), c.src.process); })();
    if (sim.rows[i] && sim.useKey === sim.rows[i].key) sim.useKey = row.key;
    sim.rows[i] = row;
    sim.result = opt.result; sim.pcts = opt.result.best.pcts.slice(); sim.manual = false; sim.cupping = null; state.subs = null;
    sim.sig = simSig(); saveSimDraft(); render();
    toast('Swapped in ' + c.name + '. The ratio was re-solved to keep the same cup.');
  }
  function substituteBlock(i, row) {
    var S = state.subs;
    var btn = el('button', { class: 'btn ghost', type: 'button', onclick: function () { runSubstitute(i); } }, 'Find a substitute');
    if (!S || S.key !== row.key) return btn;
    if (S.busy) return el('p', { class: 'small muted' }, 'Looking for beans that keep the same cup…');
    var opts = S.res ? S.res.options : [];
    return el('div', { class: 'stack', style: 'gap:6px' },
      el('div', { class: 'row' }, el('span', { class: 'label' }, 'Substitutes that keep this cup'), el('span', { class: 'spacer' }),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.subs = null; render(); } }, 'Close')),
      el('p', { class: 'muted small' }, sourcingNote()),
      opts.length ? opts.map(function (o) {
        var c = o.candidate;
        return el('div', { class: 'alt' },
          el('div', { class: 'row' }, statusPill(o.result.status, o.result.headline), el('span', { class: 'spacer' }), el('span', { class: 'mono' }, 'new ratio ' + o.result.best.pcts.join(' : '))),
          el('div', { class: 'row tight small' }, el('b', null, c.name), speciesBadge(c.species), procBadge(c.process), el('span', { class: 'muted' }, c.src.kind === 'saved' ? 'in stock · ' + fmtKg(c.stockG || 0) : 'from the catalogue')),
          el('p', { class: 'small muted' }, o.result.best.notes.summary),
          el('button', { class: 'btn', type: 'button', onclick: function () { useSubstitute(i, o); } }, 'Use this substitute'));
      }) : el('p', { class: 'small' }, 'Nothing close enough. Widen your sourcing countries or add more beans.'));
  }
  function runPick() {
    var cands = pickCandidates();
    if (cands.length < 2) {
      toast(sim.pick.source === 'mine' ? 'You need at least 2 saved beans with stock. Choose the origin catalogue, or add beans first.' : 'Not enough beans to pick from.', true);
      return;
    }
    pickBusy = true; render();
    setTimeout(function () {
      pickRes = E.pickBeans(cands, simTarget(), { brew: sim.brew, rules: rules(), index: noteIndex(), maxBeans: Number(sim.pick.maxBeans) || 3, limit: 5 });
      pickBusy = false; render();
    }, 30);
  }
  function usePick(p) {
    sim.rows = p.beans.map(function (b) {
      if (b.src.kind === 'saved') return savedRow(b.src.beanId);
      var o = originById(b.src.originId);
      return quickRow(o.region, o.id, b.src.roast, E.typicalNotes(o, o.species, b.src.process), b.src.process);
    });
    state.subs = null;
    sim.result = p.result; sim.pcts = p.result.best.pcts.slice(); sim.manual = false; sim.cupping = null;
    sim.mode = 'taste'; sim.sig = simSig(); saveSimDraft(); render();
    toast('Loaded the mix. Check the result on the right, or below on a phone.');
  }
  function pickerCard() {
    var P = sim.pick;
    return el('section', { class: 'card', 'aria-labelledby': 'pk-h' },
      el('h2', { id: 'pk-h' }, 'Let it pick the beans'),
      el('p', { class: 'muted small' }, 'It uses the cup you described above, tries every combination of 2 to ' + P.maxBeans + ' beans, and returns the best mixes with exact ratios.'),
      el('div', { class: 'grid2' },
        field('Pick from', el('select', { id: 'pk-src', value: P.source, onchange: function (e) { P.source = e.target.value; pickRes = null; simChanged(true); } },
          opt('mine', 'My beans with stock'), opt('all', 'My beans and the origin catalogue'), opt('catalogue', 'Origin catalogue only'))),
        field('Up to', el('select', { id: 'pk-max', value: String(P.maxBeans), onchange: function (e) { P.maxBeans = Number(e.target.value); pickRes = null; simChanged(true); } },
          opt('2', '2 beans'), opt('3', '3 beans'), opt('4', '4 beans (slower)')))),
      P.source !== 'mine' ? field('Catalogue beans roasted at', roastSelect('pk-roast', P.roast, function (e) { P.roast = Number(e.target.value); pickRes = null; simChanged(true); }), 'Catalogue origins are tried in each process they are known for (full wash, semi wash, natural).') : null,
      P.source !== 'mine' ? el('p', { class: 'muted small' }, sourcingNote(), ' ', el('a', { href: '#prefs' }, 'Change')) : null,
      el('button', { class: 'btn primary', type: 'button', disabled: pickBusy, onclick: runPick }, pickBusy ? 'Searching…' : 'Find the best beans'),
      pickRes ? (pickRes.picks.length ? el('div', { class: 'list' },
        el('p', { class: 'muted small mono' }, 'Compared ' + pickRes.considered + ' promising beans · ' + nf(pickRes.evals) + ' mixes · ' + nf(pickRes.ms) + ' ms'),
        pickRes.picks.map(function (p, n) {
          var best = p.result.best;
          return el('div', { class: 'alt' },
            el('div', { class: 'row' }, el('b', null, '#' + (n + 1)),
              p.result.status === 'warn' && p.result.warnings.every(function (w) { return /^Add a cup score/.test(w); }) ? el('span', { class: 'pill ok', title: 'Fits the target. Add cup scores to confirm the high-end score.' }, '✓ Possible · needs cup scores') : statusPill(p.result.status, p.result.headline),
              shareBadge(p.beans, best.pcts), el('span', { class: 'spacer' }), el('span', { class: 'mono' }, best.pcts.join(' : '))),
            el('div', { class: 'legend' }, p.beans.map(function (b, i) { return el('span', null, el('span', { class: 'dot', style: 'background:' + BEAN_COLORS[i] }), b.name, ' ', speciesBadge(b.species), ' ', procBadge(b.process), ' ', el('b', { class: 'mono' }, best.pcts[i] + '%')); })),
            el('p', { class: 'small' }, best.notes.summary),
            el('p', { class: 'muted small' }, 'Balance ' + nf(best.form.balance, 1) + ' · ' + (best.robust === 1 ? 'holds within ±2% weighing error' : 'sensitive to weighing errors')),
            el('button', { class: 'btn', type: 'button', onclick: function () { usePick(p); } }, 'Use this mix'));
        })) : el('p', { class: 'small' }, 'No combination reached your target. Widen the ranges or pick from the origin catalogue.')) : null);
  }

  // ---------------- simulator: results ----------------
  function resultsContent() {
    if (sim.busy) return el('div', { class: 'empty' }, el('p', null, 'Trying every whole-percent mix…'));
    if (!sim.result) {
      if (!simReady()) return el('div', { class: 'empty' }, el('p', null, 'Pick your beans, describe the cup, then press Decide ratio.'));
      return el('div', { class: 'empty' }, el('p', null, 'Ready. Press Decide ratio to test every whole-percent mix of these beans.'), el('button', { class: 'btn primary', type: 'button', onclick: runSolve }, 'Decide ratio'));
    }
    var res = sim.result, stale = sim.sig !== simSig(), ev = currentEval(), parts = [];
    if (stale) parts.push(el('p', { class: 'stale' }, 'You changed the inputs. Press Decide ratio again to update the best mix.'));
    if (!res.best || !ev) {
      parts.push(el('div', { class: 'verdict fail' }, el('div', { class: 'row' }, el('span', { class: 'pill fail' }, '✕ Not possible')),
        el('ul', { class: 'reasons' }, (res.reasons || []).map(function (r) { return el('li', null, r); }))));
      return el('div', { class: 'stack' }, parts);
    }
    var beans = simBeans();
    parts.push(verdictBlock(ev, beans, res));
    parts.push(adjustBlock(beans));
    parts.push(cupBlock(ev));
    if ((res.alternatives || []).length && !sim.manual) parts.push(altsBlock(res.alternatives));
    parts.push(recipeBlock(ev));
    parts.push(cuppingBlock(res, beans));
    parts.push(makeBlock(beans));
    parts.push(saveBlock(ev));
    var ai = aiBlock(ev, beans);
    if (ai) parts.push(ai);
    return el('div', { class: 'stack' }, parts);
  }
  function statusPill(status, headline) {
    var icon = status === 'ok' ? '✓ ' : status === 'warn' ? '! ' : '✕ ';
    return el('span', { class: 'pill ' + status }, icon + headline);
  }
  function ratioText(pcts) {
    var kids = [];
    pcts.forEach(function (p, i) { if (i) kids.push(el('span', { class: 'sep' }, ':')); kids.push(el('span', { style: 'color:' + BEAN_COLORS[i] }, p)); });
    return el('div', { class: 'ratio-big', 'aria-label': 'Ratio ' + pcts.join(' to ') }, kids);
  }
  function ratioBar(pcts) {
    return el('div', { class: 'ratiobar', role: 'img', 'aria-label': 'Ratio bar' }, pcts.map(function (p, i) { return el('div', { style: 'width:' + p + '%;background:' + BEAN_COLORS[i] }); }));
  }
  function legend(beans, pcts) {
    return el('div', { class: 'legend' }, beans.map(function (b, i) { return el('span', null, el('span', { class: 'dot', style: 'background:' + BEAN_COLORS[i] }), b.name + ' ', speciesBadge(b.species), ' ', el('b', { class: 'mono' }, pcts[i] + '%')); }));
  }
  // Arabica / robusta share of a mix, always shown with a result.
  function shareBadge(beans, pcts) {
    var s = E.speciesShare(beans, pcts);
    return el('span', { class: 'pill species ' + (s.pure === 'arabica' ? 'ara' : 'mixed'), title: 'Species in this blend' }, s.label);
  }
  function shareBlock(beans, pcts) {
    var s = E.speciesShare(beans, pcts);
    var col = { arabica: 'var(--ara)', robusta: 'var(--rob)', liberica: 'var(--warn)', excelsa: 'var(--warn)' };
    return el('div', { class: 'species-box' },
      el('div', { class: 'row tight' }, el('span', { class: 'label' }, 'Species in this blend'), el('span', { class: 'spacer' }), shareBadge(beans, pcts)),
      el('div', { class: 'ratiobar thin', role: 'img', 'aria-label': s.label }, s.parts.map(function (k) { return el('div', { style: 'width:' + s.shares[k] + '%;background:' + (col[k] || 'var(--ink-2)') }); })),
      el('span', { class: 'muted small' }, s.robusta ? 'Contains robusta: ' + s.robusta + '% of the weight. Say so on the label.' : 'No robusta. You can sell it as 100% ' + (s.pure || 'arabica') + '.'));
  }
  function robustPill(r) {
    if (r === 1) return el('span', { class: 'pill ok', title: 'Every ±2% weighing error keeps the verdict' }, '✓ Holds within ±2% weighing error');
    if (r >= 0.5) return el('span', { class: 'pill warn', title: 'Some ±2% weighing errors change the verdict' }, 'Mostly holds within ±2%');
    return el('span', { class: 'pill fail', title: 'Most ±2% weighing errors change the verdict' }, 'Sensitive: weigh carefully');
  }
  function qualityPills(ev) {
    var out = [];
    if (ev.predicted) {
      var target = sim.specialty.on ? Number(sim.specialty.minScore) || 0 : 0;
      out.push(el('span', { class: 'pill ' + (!target || ev.predicted.value >= target ? 'ok' : 'fail'), title: 'Estimate from your beans\' cup scores (weighted by share, minus clashes and defects). Not an official SCA score.' },
        'Est. cup score ' + nf(ev.predicted.value, 1) + ' (' + nf(ev.predicted.low, 1) + '–' + nf(ev.predicted.high, 1) + ')'));
    }
    if (ev.specialty) out.push(el('span', { class: 'pill ' + (ev.status === 'fail' ? 'fail' : 'ok') }, ev.status === 'fail' ? '✕ High-end check' : '✓ High-end check'));
    return out;
  }
  function recipeBlock(ev) {
    var r = E.recipeFor(sim.brew, ev.values.roast), c = E.roastColour(ev.values.roast);
    var rows = [['Dose', r.dose], ['Output', r.yield], ['Ratio', r.ratio], ['Water temp', r.temp], ['Time', r.time], ['Grind', r.grind]];
    return el('section', { class: 'card', 'aria-labelledby': 'rc-h' },
      el('div', { class: 'row' }, el('h3', { id: 'rc-h' }, 'Recipe card: ' + r.title), el('span', { class: 'spacer' }), el('span', { class: 'muted small' }, c.name + ' roast (Agtron ' + c.agtron + ')')),
      el('div', { class: 'tablewrap' }, el('table', null, el('tbody', null, rows.map(function (x) { return el('tr', null, el('th', null, x[0]), el('td', { class: 'mono' }, x[1])); })))),
      el('p', { class: 'small' }, r.extra),
      el('p', { class: 'small mono' }, 'Targets: ' + r.targets),
      el('details', null, el('summary', { class: 'small' }, 'Water and resting'), el('p', { class: 'small', style: 'margin-top:6px' }, r.water), el('p', { class: 'small' }, 'Best served ' + r.rest + '.')),
      el('p', { class: 'muted small' }, 'Starting points based on SCA-style norms. Dial in on your own grinder and water.'),
      el('button', { class: 'btn primary', type: 'button', onclick: function () { openSheetFromSim(ev); } }, 'Make a café spec sheet'));
  }
  function verdictBlock(ev, beans, res) {
    var modeNote = sim.mode === 'stock' ? 'Tie-break: most bags from stock' : sim.mode === 'useup' ? 'Tie-break: use up the chosen bean' : null;
    var round = !sim.manual && res.round ? res.round : null;
    return el('section', { class: 'verdict ' + ev.status, 'aria-label': 'Verdict' },
      el('div', { class: 'row' }, statusPill(ev.status, ev.headline), ev.status !== 'fail' ? robustPill(ev.robust) : null, qualityPills(ev), el('span', { class: 'spacer' }),
        el('span', { class: 'muted small mono' }, sim.manual ? 'Your adjusted mix' : res.searched ? 'Best of ' + nf(res.searched) + ' mixes · ' + nf(res.ms) + ' ms' : 'From a saved blend or pick')),
      ratioText(sim.pcts), ratioBar(sim.pcts), legend(beans, sim.pcts), shareBlock(beans, sim.pcts),
      modeNote ? el('p', { class: 'muted small' }, modeNote) : null,
      round ? el('div', { class: 'row small' }, el('span', null, 'Rounder option: ', el('b', { class: 'mono' }, round.pcts.join(' : ')), ', also ' + round.headline.toLowerCase() + '. Easier to weigh.'),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { sim.pcts = round.pcts.slice(); sim.manual = true; simChanged(true); } }, 'Use ' + round.pcts.join(' : '))) : null,
      ev.reasons.length ? el('ul', { class: 'reasons' }, ev.reasons.map(function (r) { return el('li', null, r); })) : null,
      ev.warnings.length ? el('ul', { class: 'reasons muted small' }, ev.warnings.map(function (r) { return el('li', null, r); })) : null,
      ev.unresolved.length ? el('p', { class: 'muted small' }, 'Not recognised in your target: ' + ev.unresolved.join(', ') + '.') : null,
      ev.status === 'fail' && !sim.manual ? el('p', { class: 'small' }, 'This is the closest mix the simulator found.') : null);
  }
  function backToBest() { sim.pcts = sim.result.best.pcts.slice(); sim.manual = false; simChanged(true); }
  function adjustBlock(beans) {
    var bd = simBounds();
    return el('section', { class: 'card', 'aria-labelledby': 'adj-h' },
      el('div', { class: 'row' }, el('h3', { id: 'adj-h' }, 'Adjust by hand'), el('span', { class: 'spacer' }),
        el('button', { class: 'btn ghost', type: 'button', id: 'adj-back', hidden: !(sim.manual && sim.result && sim.result.best && sim.result.best.pcts), onclick: backToBest }, 'Back to best')),
      el('div', { class: 'adjust' }, beans.map(function (b, i) {
        function set(v) { sim.pcts = E.rebalance(sim.pcts, i, v, bd.mins, bd.maxs); sim.manual = true; saveSimDraft(); syncSliders(); refreshAfterManual(); }
        return el('div', { class: 'arow' },
          el('label', { class: 'field' }, el('span', null, b.name),
            el('input', { type: 'range', id: 'sl-' + i, min: 0, max: 100, step: 1, value: sim.pcts[i], style: 'accent-color:' + BEAN_COLORS[i], oninput: function (e) { set(Number(e.target.value)); } })),
          el('input', { type: 'number', id: 'sln-' + i, min: 0, max: 100, value: sim.pcts[i], 'aria-label': b.name + ' percent', onchange: function (e) { set(Number(e.target.value)); } }));
      })),
      el('p', { class: 'muted small' }, 'The other beans keep their proportions and never drop below their minimum share.'));
  }
  function syncSliders() {
    sim.pcts.forEach(function (p, i) { var s = byId('sl-' + i), n = byId('sln-' + i); if (s) s.value = p; if (n && document.activeElement !== n) n.value = p; });
    var back = byId('adj-back'); if (back) back.hidden = !sim.manual;
  }
  var manualTimer;
  function refreshAfterManual() {
    clearTimeout(manualTimer);
    manualTimer = setTimeout(function () {
      // Re-render the results around the slider card without ever detaching it, so the slider keeps focus and the drag continues.
      var r = byId('results'); if (!r) return;
      var old = r.firstElementChild, fresh = resultsContent();
      var adj = old && Array.prototype.filter.call(old.children, function (c) { return c.getAttribute('aria-labelledby') === 'adj-h'; })[0];
      var freshAdj = Array.prototype.filter.call(fresh.children, function (c) { return c.getAttribute('aria-labelledby') === 'adj-h'; })[0];
      if (!adj || !freshAdj) { clear(r); r.appendChild(fresh); return; }
      Array.prototype.slice.call(old.children).forEach(function (c) { if (c !== adj) old.removeChild(c); });
      var before = true;
      Array.prototype.slice.call(fresh.children).forEach(function (c) {
        if (c === freshAdj) { before = false; return; }
        if (before) old.insertBefore(c, adj); else old.appendChild(c);
      });
    }, 40);
  }
  function meter(label, v, range) {
    var pos = function (x) { return ((x - 1) / 4 * 100) + '%'; };
    var band = null;
    if (range && (range[0] != null || range[1] != null)) {
      var lo = range[0] != null ? range[0] : 1, hi = range[1] != null ? range[1] : 5;
      band = el('div', { class: 'band', style: 'left:' + pos(lo) + ';width:calc(' + pos(hi) + ' - ' + pos(lo) + ')' });
    }
    return el('div', { class: 'meter' }, el('span', null, label),
      el('div', { class: 'track', role: 'img', 'aria-label': label + ' ' + nf(v, 1) + ' of 5' },
        el('div', { class: 'ticks' }, [0, 1, 2, 3, 4].map(function () { return el('i'); })), band, el('div', { class: 'mark', style: 'left:' + pos(v) })),
      el('span', { class: 'mono' }, nf(v, 1)));
  }
  function cupBlock(ev) {
    var t = simTarget(), R = rules();
    var tiers = [['dominant', 'Dominant'], ['supporting', 'Supporting'], ['faint', 'Faint'], ['lost', 'Likely lost']];
    var fams = Object.keys(ev.notes.families).sort(function (a, b) { return ev.notes.families[b] - ev.notes.families[a]; });
    var maxF = Math.max.apply(null, fams.map(function (f) { return ev.notes.families[f]; }).concat([0.01]));
    var pr = ev.pairings;
    return el('section', { class: 'card', 'aria-labelledby': 'cup-h' },
      el('div', { class: 'row' }, el('h3', { id: 'cup-h' }, 'Predicted cup'), el('span', { class: 'spacer' }), el('span', { class: 'muted small' }, 'as ' + E.BREWS[sim.brew].label)),
      el('p', { style: 'font-size:1.05rem' }, ev.notes.summary),
      el('div', { class: 'meters' }, TATTRS.map(function (a) { return meter(AL[a], ev.values[a], t.ranges[a]); })),
      el('p', { class: 'muted small' }, 'The shaded band is your target. Robusta and darker roasts weigh more on body and bitterness, bitterness above 3 hides acidity, and sweet or fruity aromas lift perceived sweetness and acidity.'),
      el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'label' }, 'Cupping-form estimate'),
        el('div', { class: 'meters' }, meter('Balance', ev.form.balance), meter('Complexity', ev.form.complexity), meter('Finish', ev.form.finish))),
      pr.synergies.length || pr.clashes.length ? el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'label' }, 'Flavour pairing'),
        el('ul', { class: 'reasons small' },
          pr.synergies.map(function (s) { return el('li', null, el('b', { class: 'delta-pos' }, '✓ ' + s.name + ': '), s.text); }),
          pr.clashes.map(function (c) { return el('li', null, el('b', { class: c.strong ? 'delta-neg' : '' }, (c.strong ? '✕ ' : '! ') + c.name + ': '), c.text); }))) : null,
      el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'label' }, 'Acidity character'),
        el('p', { class: 'small' }, ev.acid.dominant ? 'Mostly ' + E.ACID_TYPES[ev.acid.dominant].label.toLowerCase() + '.' : 'No clear acidity character from the bag notes.',
          ' ', Object.keys(ev.acid.strength).filter(function (k) { return ev.acid.strength[k] >= R.tiers.faint; }).map(function (k) { return E.ACID_TYPES[k].label.split(' (')[0] + ' ' + nf(ev.acid.strength[k], 2); }).join(' · '))),
      el('div', { class: 'tiers' }, tiers.map(function (tt) {
        var ns = ev.notes.notes.filter(function (n) { return n.tier === tt[0]; });
        return el('div', { class: 'tier' }, el('span', { class: 'label' }, tt[1]),
          ns.length ? el('div', { class: 'chips' }, ns.map(function (n) { return el('span', { class: 'chip' + (n.defect ? ' defect' : ''), title: 'Strength ' + nf(n.strength, 2) + (n.masked ? ' · hidden by bolder notes' : '') }, n.label, el('i', null, nf(n.strength, 2))); })) : el('span', { class: 'muted small' }, '—'));
      })),
      ev.must.length || ev.mustNot.length ? el('div', { class: 'chips' },
        ev.must.map(function (m) { var okk = m.strength >= R.tiers.supporting; return el('span', { class: 'pill ' + (okk ? 'ok' : 'fail') }, (okk ? '✓ ' : '✕ ') + m.label + ' · ' + m.tier); }),
        ev.mustNot.map(function (m) { var okk = m.strength < R.tiers.supporting; return el('span', { class: 'pill ' + (okk ? 'ok' : 'fail') }, (okk ? '✓ no ' : '✕ ') + m.label + ' · ' + m.tier); })) : null,
      fams.length ? el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'label' }, 'By SCA flavour wheel family'),
        fams.map(function (f) { return el('div', { class: 'fam' }, el('span', null, LEX.families[f].label), el('div', null, el('div', { class: 'bar', style: 'width:' + Math.round(ev.notes.families[f] / maxF * 100) + '%' })), el('span', { class: 'mono small' }, nf(ev.notes.families[f], 2))); })) : null);
  }
  function altsBlock(alts) {
    var beans = simBeans();
    return el('section', { class: 'card', 'aria-labelledby': 'alt-h' },
      el('h3', { id: 'alt-h' }, 'Other mixes worth cupping'),
      el('div', { class: 'grid2' }, alts.map(function (a) {
        return el('div', { class: 'alt' }, el('div', { class: 'row' }, statusPill(a.status, a.headline), shareBadge(beans, a.pcts)),
          el('div', { class: 'mono', style: 'font-size:1.2rem;font-weight:600' }, a.pcts.join(' : ')), ratioBar(a.pcts),
          el('p', { class: 'small muted' }, a.notes.summary),
          el('p', { class: 'small muted' }, 'Balance ' + nf(a.form.balance, 1) + ' · finish ' + nf(a.form.finish, 1)),
          el('button', { class: 'btn', type: 'button', onclick: function () { sim.pcts = a.pcts.slice(); sim.manual = true; simChanged(true); } }, 'Use this mix'));
      })));
  }
  function cuppingBlock(res, beans) {
    var wrap = el('section', { class: 'card', 'aria-labelledby': 'cp-h' },
      el('div', { class: 'row' }, el('h3', { id: 'cp-h' }, 'Cupping table'), el('span', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', onclick: function () {
          var samples = [{ pcts: sim.pcts.slice(), label: sim.manual ? 'Your mix' : 'Best' }];
          (res.alternatives || []).forEach(function (a) { samples.push({ pcts: a.pcts, label: 'Alternative' }); });
          if (samples.length < 3) E.neighbours(sim.pcts).forEach(function (p) { if (samples.length < 3) samples.push({ pcts: p, label: 'Neighbour' }); });
          sim.cupping = E.cuppingPlan(samples, { brew: sim.brew });
          refreshResults();
        } }, sim.cupping ? 'New codes' : 'Plan the cupping table')),
      el('p', { class: 'muted small' }, 'Confirm the prediction before you pack. Three blind-coded samples follow SCA protocol: 8,25 g per 150 ml at 93 °C.'));
    var plan = sim.cupping;
    if (!plan) return wrap;
    wrap.appendChild(el('div', { class: 'samples' }, plan.samples.map(function (s) {
      return el('div', { class: 'sample' }, el('span', { class: 'label' }, s.label), el('span', { class: 'code' }, s.code),
        el('div', { class: 'mono small' }, s.pcts.join(' : ')),
        el('table', null, el('tbody', null, beans.map(function (b, i) { return el('tr', null, el('td', null, el('span', { class: 'dot', style: 'background:' + BEAN_COLORS[i] }), ' ', b.name), el('td', { class: 'num mono' }, fmtG(s.grams[i], 1))); }))),
        el('button', { class: 'btn', type: 'button', onclick: function () { startCupDraft(s.code, s.pcts); } }, 'Log results for ' + s.code));
    })));
    wrap.appendChild(el('ol', { class: 'steps small' }, plan.steps.map(function (s) { return el('li', null, s); })));
    if (plan.brewNote) wrap.appendChild(el('p', { class: 'small' }, plan.brewNote));
    return wrap;
  }
  function startCupDraft(code, pcts) {
    var beans = simBeans();
    var ev = E.evaluateMix(beans, pcts, simTarget(), solveOpts());
    state.cupDraft = {
      code: code || '', brew: sim.brew, blendName: sim.saveName || '',
      items: beans.map(function (b, i) { return { beanId: b.id || null, name: b.name, pct: pcts[i], quick: !!b.quick, species: b.species, roast: b.roast, process: b.process }; }),
      predicted: { body: ev.values.body, acidity: ev.values.acidity, sweetness: ev.values.sweetness, bitterness: ev.values.bitterness },
      predictedNotes: ev.notes.notes.filter(function (n) { return n.tier === 'dominant' || n.tier === 'supporting'; }).map(function (n) { return n.label; }),
      actual: { body: '', acidity: '', sweetness: '', bitterness: '' }, tastedNotes: '', clean: true, defects: '', overall: '', scaScore: '',
      form: 'simple', cva: { fragrance: '', aroma: '', flavour: '', aftertaste: '', acidity: '', sweetness: '', mouthfeel: '', bitterness: '', liking: '' }
    };
    go('cupping');
  }
  var planTimer;
  function makeBlock(beans) {
    var pw = E.planWeighOut(sim.pcts, BAGS.map(function (g) { return { bagG: g, count: sim.plan[g] || 0 }; }));
    var allSaved = beans.every(function (b) { return !b.quick; });
    // Stock is per saved bean, so add up every row that uses the same bean.
    var need = gramsByBean(beans, pw.perBean);
    var short = beans.map(function (b) { return b.stockG == null ? null : Math.max(0, (b.id ? need[b.id] : 0) - b.stockG); });
    var anyShort = short.some(function (s) { return s > 0; });
    var maxRows = BAGS.map(function (g) {
      var m = allSaved ? E.maxBags(sim.pcts, g, beans.map(function (b) { return b.stockG || 0; })) : null;
      var per = E.weighOut(sim.pcts, g);
      return el('tr', null, el('td', null, bagLabel(g)),
        beans.map(function (b, i) { return el('td', { class: 'num mono' }, fmtG(per[i])); }),
        el('td', { class: 'num mono' }, m && m.bags != null ? nf(m.bags) : '—'),
        el('td', null, m && m.limiting >= 0 ? beans[m.limiting].name : allSaved ? '' : 'Save the beans to check stock'));
    });
    return el('section', { class: 'card', 'aria-labelledby': 'mk-h' },
      el('h3', { id: 'mk-h' }, 'Make it'),
      el('div', { class: 'tablewrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', null, 'Per bag'), beans.map(function (b, i) { return el('th', { class: 'num' }, el('span', { class: 'dot', style: 'background:' + BEAN_COLORS[i] }), ' ', b.name); }), el('th', { class: 'num' }, 'Max bags'), el('th', null, 'Runs out first'))),
        el('tbody', null, maxRows))),
      el('div', { class: 'row' }, el('span', { class: 'label' }, 'Bag plan'), BAGS.map(function (g) {
        return el('label', { class: 'row tight small' }, el('input', { type: 'number', id: 'plan-' + g, min: 0, value: sim.plan[g] || 0, style: 'width:80px', oninput: function (e) {
          sim.plan[g] = Math.max(0, Math.floor(Number(e.target.value) || 0)); saveSimDraft();
          clearTimeout(planTimer); planTimer = setTimeout(render, 350);
        } }), '× ' + bagLabel(g));
      })),
      el('div', { class: 'tablewrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', null, 'Bean'), el('th', { class: 'num' }, 'Weigh out'), el('th', { class: 'num' }, 'In stock'), el('th', { class: 'num' }, 'Short by'))),
        el('tbody', null, beans.map(function (b, i) {
          return el('tr', null, el('td', null, b.name), el('td', { class: 'num mono' }, fmtG(pw.perBean[i])),
            el('td', { class: 'num mono' }, b.stockG == null ? '—' : fmtG(b.stockG)),
            el('td', { class: 'num mono' + (short[i] > 0 ? ' delta-neg' : '') }, short[i] == null ? '—' : short[i] > 0 ? fmtG(short[i]) : '0 g'));
        }), el('tr', null, el('td', null, el('b', null, 'Total')), el('td', { class: 'num mono' }, el('b', null, fmtKg(pw.totalG))), el('td'), el('td'))))),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', disabled: !allSaved || anyShort || !pw.totalG || !!busy.logBatch, onclick: function () { logBatch(beans, pw); } }, busy.logBatch ? 'Logging…' : 'Log this batch and deduct stock'),
        !allSaved ? el('span', { class: 'muted small' }, 'Quick beans have no stock. Save them under My beans to log batches.') : anyShort ? el('span', { class: 'small delta-neg' }, 'Not enough stock for this plan.') : null),
      anyShort ? el('div', { class: 'row small' }, el('span', null, 'Running short? '), beans.map(function (b, i) {
        return short[i] > 0 ? el('button', { class: 'btn ghost', type: 'button', onclick: function () { runSubstitute(i); toast('Substitutes for ' + b.name + ' are listed under that bean in the mix.'); } }, 'Find a substitute for ' + b.name) : null;
      })) : null);
  }
  function gramsByBean(items, grams) {
    var out = {};
    items.forEach(function (b, i) { var id = b.id || b.beanId; if (id) out[id] = (out[id] || 0) + (Number(grams[i]) || 0); });
    return out;
  }
  // Each stock change re-reads the bean's current stock, and a lock stops a double-click from deducting twice.
  async function adjustStock(byId, sign) {
    var ids = Object.keys(byId);
    for (var i = 0; i < ids.length; i++) {
      var b = beanById(ids[i]);
      if (!b) continue;
      await patchDoc('beans', b.id, { stockG: Math.max(0, (Number(b.stockG) || 0) + sign * byId[ids[i]]) });
    }
  }
  var busy = {};
  async function withLock(key, fn) {
    if (busy[key]) return;
    busy[key] = true; render();
    try { await fn(); } finally { delete busy[key]; render(); }
  }
  async function logBatch(beans, pw) {
    var live = beans.map(function (b) { return beanById(b.id); });
    if (live.some(function (b) { return !b; })) { toast('One of these beans was deleted. Pick another bean first.', true); return; }
    await withLock('logBatch', async function () {
    try {
      await adjustStock(gramsByBean(beans, pw.perBean), -1);
      await putDoc('batches', uid('t'), {
        blendName: sim.saveName || beans.map(function (b) { return b.name; }).join(' + '),
        items: beans.map(function (b, i) { return { beanId: b.id, name: b.name, grams: pw.perBean[i], pct: sim.pcts[i] }; }),
        plan: BAGS.map(function (g) { return { bagG: g, count: sim.plan[g] || 0 }; }).filter(function (p) { return p.count; }),
        totalG: pw.totalG, brew: sim.brew, createdAt: Date.now(), undone: false
      });
      toast('Batch logged. Stock deducted.');
    } catch (e) { /* toast already shown */ }
    });
  }
  function saveBlock(ev) {
    return el('section', { class: 'card', 'aria-labelledby': 'sv-h' },
      el('h3', { id: 'sv-h' }, 'Save this blend'),
      el('div', { class: 'row' },
        el('input', { type: 'text', id: 'save-name', placeholder: 'e.g. House Blend v2', value: sim.saveName, style: 'flex:1;min-width:160px', oninput: function (e) { sim.saveName = e.target.value; saveSimDraft(); } }),
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var name = (sim.saveName || '').trim();
          if (!name) { toast('Give the blend a name first.', true); return; }
          try {
            await putDoc('blends', uid('l'), {
              name: name, rows: sim.rows.map(function (r) { var c = Object.assign({}, r); delete c.key; return c; }),
              pcts: sim.pcts.slice(), brew: sim.brew, ranges: sim.ranges, mustText: sim.mustText, notText: sim.notText,
              acidType: sim.acidType || '', robustaMax: sim.robustaMax === '' || sim.robustaMax == null ? '' : String(sim.robustaMax),
              specialty: JSON.parse(JSON.stringify(sim.specialty || defaultSpecialty())),
              status: ev.status, summary: ev.notes.summary, createdAt: Date.now()
            });
            toast('Saved "' + name + '".');
          } catch (e) { /* toast shown */ }
        } }, 'Save blend')),
      el('button', { class: 'btn ghost', type: 'button', onclick: function () { startCupDraft('', sim.pcts); } }, 'Log a cupping for this mix'));
  }

  // ---------------- AI (optional, advisory) ----------------
  var aiCtl = null;
  var aiState = { text: '', busy: false, error: '' };
  function aiError(code) {
    if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed') { state.aiHidden = true; return ''; }
    if (code === 'rate_limited') return 'Claude is busy or you have hit a usage limit. Try again later.';
    if (code === 'session_expired') return 'Sign in to claude.ai again to use the assistant.';
    if (code === 'cancelled') return '';
    return 'The assistant couldn\'t answer. Try again.';
  }
  function describeForAI(ev, beans) {
    var lines = ['Brew style: ' + E.BREWS[sim.brew].label];
    beans.forEach(function (b, i) {
      lines.push('- ' + b.name + ': ' + sim.pcts[i] + '%, ' + b.species + ', ' + procLabel(b.process) + ', roast ' + b.roast + '/5, bag notes "' + b.notes.map(function (n) { return n.label; }).join(', ') + '", scores ' +
        ATTRS.map(function (a) { return a + ' ' + E.effScore(b, a); }).join(', '));
    });
    var t = simTarget();
    lines.push('Target ranges (as served): ' + TATTRS.map(function (a) { var r = t.ranges[a]; return r[0] == null && r[1] == null ? null : a + ' ' + (r[0] != null ? r[0] : 'any') + '–' + (r[1] != null ? r[1] : 'any'); }).filter(Boolean).join('; '));
    if (t.must.length) lines.push('Must taste: ' + t.must.join(', '));
    if (t.mustNot.length) lines.push('Must not taste: ' + t.mustNot.join(', '));
    lines.push('Predicted as served: ' + TATTRS.map(function (a) { return a + ' ' + ev.values[a]; }).join(', '));
    lines.push('Cupping-form estimate: balance ' + ev.form.balance + ', complexity ' + ev.form.complexity + ', finish ' + ev.form.finish);
    lines.push('Predicted notes: ' + ev.notes.summary);
    if (ev.pairings.synergies.length) lines.push('Pairings that work: ' + ev.pairings.synergies.map(function (s) { return s.name; }).join(', '));
    if (ev.pairings.clashes.length) lines.push('Clashes: ' + ev.pairings.clashes.map(function (s) { return s.name; }).join(', '));
    lines.push('Verdict: ' + ev.headline + (ev.reasons.length ? '. Reasons: ' + ev.reasons.join(' ') : '') + (ev.warnings.length ? '. Warnings: ' + ev.warnings.join(' ') : ''));
    return lines.join('\n');
  }
  async function askAI(kind, ev, beans) {
    if (!state.sample) return;
    if (aiCtl) aiCtl.abort();
    aiCtl = new AbortController();
    aiState = { text: '', busy: true, error: '' };
    renderAI(ev, beans);
    var data = describeForAI(ev, beans);
    var others = state.beans.filter(function (b) { return !beans.some(function (x) { return x.id === b.id; }); })
      .map(function (b) { return '- ' + b.name + ' (' + b.species + ', ' + procLabel(beanProcess(b)) + ', roast ' + b.roast + ', notes: ' + (b.bagNotes || '') + ')'; }).join('\n');
    var prompts = {
      explain: 'You are a licensed Q grader helping a coffee reseller in Indonesia who blends roasted beans bought from other roasteries. Explain this simulated blend in plain language, in at most 6 short bullet points: why the simulator chose this ratio, what the cup will likely taste like as served, the main risks, and what to check at the cupping table. Do not propose different numbers; the ratio and scores come from a deterministic simulator.\n\n' + data,
      suggest: 'You are a licensed Q grader. A reseller wants to reach the target below with a blend of already-roasted beans. Based on the verdict, suggest which ONE or TWO of their other saved beans (listed) could help, or what kind of bean (origin, species, process, roast level, notes) they should look for if none fit. Explain why in at most 5 short bullets. Do not invent exact ratios.\n\n' + data + '\n\nTheir other saved beans:\n' + (others || '(none)'),
      label: 'Write a short retail label description for this coffee blend: 2 sentences in English, then the same in Bahasa Indonesia. Mention the 2–3 strongest predicted notes and the best way to brew it. No exaggerated claims, no health claims, no ratio numbers.\n\n' + data
    };
    try {
      await state.sample(prompts[kind], { signal: aiCtl.signal, onText: function (u) { aiState.text = u.text; var o = byId('ai-out'); if (o) o.textContent = u.text; } });
      aiState.busy = false;
    } catch (e) {
      aiState.busy = false; aiState.text = (e && e.text) || aiState.text; aiState.error = aiError(e && e.code);
    }
    renderAI(ev, beans);
  }
  function renderAI(ev, beans) { var box = byId('ai-box'); if (box) box.replaceWith(aiBlock(ev, beans) || el('span')); }
  function aiBlock(ev, beans) {
    if (!state.sample || state.aiHidden) return null;
    return el('section', { class: 'card', id: 'ai-box', 'aria-labelledby': 'ai-h' },
      el('div', { class: 'row' }, el('h3', { id: 'ai-h' }, 'Ask the assistant'), el('span', { class: 'spacer' }), el('span', { class: 'muted small' }, 'Advice only. It never changes your ratio.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', disabled: aiState.busy, onclick: function () { askAI('explain', ev, beans); } }, 'Explain this result'),
        el('button', { class: 'btn', type: 'button', disabled: aiState.busy, onclick: function () { askAI('suggest', ev, beans); } }, 'Suggest a bean to add'),
        el('button', { class: 'btn', type: 'button', disabled: aiState.busy, onclick: function () { askAI('label', ev, beans); } }, 'Draft a label blurb'),
        aiState.busy ? el('button', { class: 'btn ghost', type: 'button', onclick: function () { if (aiCtl) aiCtl.abort(); } }, 'Stop') : null),
      aiState.busy || aiState.text ? el('div', { class: 'ai-out', id: 'ai-out' }, aiState.text || 'Thinking…') : null,
      aiState.error ? el('p', { class: 'small delta-neg' }, aiState.error) : null);
  }

  // ---------------- My beans ----------------
  function blankBeanForm(originId, process) {
    var o = originById(originId) || originById('id-gayo');
    var p = process || mainProcess(o);
    return { id: null, name: '', originId: o.id, roastery: '', species: o.species, roast: 3, process: p, varietal: 'unknown', producer: '', altitude: o.altitude || '', cupScore: '', bagNotes: '', scores: E.scoresFor(o, 3, p), stockG: 1000 };
  }
  function viewBeans() {
    var f = state.beanForm;
    var parts = [el('div', { class: 'row' }, el('h2', null, 'My beans'), el('span', { class: 'spacer' }),
      !f ? el('button', { class: 'btn primary', type: 'button', onclick: function () { state.beanForm = blankBeanForm(); render(); } }, '+ Add a bean') : null)];
    if (f) parts.push(beanForm(f));
    if (!state.beans.length && !f) {
      parts.push(el('div', { class: 'empty' },
        el('p', null, state.mode === 'connecting' ? 'Loading your beans…' : 'No beans yet. Add each roasted bean you buy, with the notes printed on its bag and how many grams you have.'),
        el('button', { class: 'btn primary', type: 'button', onclick: function () { state.beanForm = blankBeanForm(); render(); } }, 'Add your first bean')));
    }
    parts.push(el('div', { class: 'list' }, state.beans.map(beanCard)));
    return el('div', { class: 'stack' }, parts);
  }
  function beanCard(b) {
    var o = originById(b.originId);
    var confirming = state.confirm === 'bean:' + b.id;
    var learned = (b.calibCount || 0) > 0 || Object.keys(b.noteCalib || {}).length > 0;
    return el('article', { class: 'card' },
      el('div', { class: 'row' }, el('h3', null, b.name), speciesBadge(b.species), procBadge(beanProcess(b)), el('span', { class: 'spacer' }), el('span', { class: 'mono' }, fmtKg(b.stockG || 0))),
      el('p', { class: 'muted small' }, [o ? o.country + ' · ' + o.region : 'Custom origin', b.producer || null, b.varietal && b.varietal !== 'unknown' ? (E.VARIETALS[b.varietal] || {}).label : null,
        b.altitude || null, b.roastery ? 'from ' + b.roastery : null, procLabel(beanProcess(b)), E.roastColour(b.roast).name + ' roast', b.cupScore ? 'cup score ' + nf(b.cupScore, 2) : null].filter(Boolean).join(' · ')),
      noteChips(b.bagNotes, { noteCalib: b.noteCalib }), scoreLine(b.scores, b.calib),
      b.calibCount ? el('p', { class: 'small muted' }, 'Adjusted by ' + b.calibCount + ' cupping' + (b.calibCount > 1 ? 's' : '') + '.') : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', onclick: function () { state.beanForm = Object.assign({ varietal: 'unknown', producer: '', altitude: '', cupScore: '' }, b, { process: beanProcess(b), scores: Object.assign({}, b.scores) }); if (state.beanForm.cupScore == null) state.beanForm.cupScore = ''; render(); window.scrollTo(0, 0); } }, 'Edit'),
        el('button', { class: 'btn', type: 'button', onclick: function () { addToSim(b.id); } }, 'Use in simulator'),
        learned ? el('button', { class: 'btn ghost', type: 'button', onclick: async function () { try { await patchDoc('beans', b.id, { calib: {}, noteCalib: {}, calibCount: 0, calibResetAt: Date.now() }); toast('Cupping adjustments reset for ' + b.name + '.'); } catch (e) { /* shown */ } } }, 'Reset cupping adjustments') : null,
        el('span', { class: 'spacer' }),
        confirming ? el('span', { class: 'row tight' }, el('span', { class: 'small' }, 'Delete this bean?'),
          el('button', { class: 'btn danger', type: 'button', onclick: async function () { state.confirm = null; try { await delDoc('beans', b.id); toast('Deleted ' + b.name + '.'); } catch (e) { /* shown */ } } }, 'Delete'),
          el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.confirm = null; render(); } }, 'Keep'))
          : el('button', { class: 'btn ghost danger', type: 'button', onclick: function () { state.confirm = 'bean:' + b.id; render(); } }, 'Delete')));
  }
  function addToSim(beanId) {
    if (sim.rows.some(function (r) { return r.beanId === beanId; })) { go('simulator'); return; }
    sim.rows = sim.rows.filter(function (r) { return !/^Example/.test(r.name || ''); });
    if (sim.rows.length >= 5) { toast('The mix already has 5 beans. Remove one first.', true); go('simulator'); return; }
    sim.rows.push(savedRow(beanId));
    clearMix(); saveSimDraft(); go('simulator');
  }
  function beanForm(f) {
    function snap() { return { originId: f.originId, roast: f.roast, process: f.process, varietal: f.varietal, species: f.species }; }
    function rederive(prev) {
      var before = derived(prev.originId, prev.roast, prev.process, prev.varietal, prev.species);
      if (!before || sameScores(f.scores, before)) f.scores = derived(f.originId, f.roast, f.process, f.varietal, f.species) || f.scores;
      if (f.bagNotes) f.bagNotes = autoNotes(f.bagNotes, prev, f);
      render();
    }
    var current = derived(f.originId, f.roast, f.process, f.varietal, f.species);
    var typical = E.typicalNotes(originById(f.originId), f.species, f.process);
    var o = originById(f.originId);
    return el('section', { class: 'card', 'aria-labelledby': 'bf-h' },
      el('h3', { id: 'bf-h' }, f.id ? 'Edit ' + (f.name || 'bean') : 'Add a bean'),
      el('div', { class: 'grid2' },
        field('Name', el('input', { type: 'text', id: 'bf-name', value: f.name, placeholder: 'e.g. Gayo Wine from Roastery X', oninput: function (e) { f.name = e.target.value; } })),
        field('Roastery', el('input', { type: 'text', id: 'bf-roastery', value: f.roastery, oninput: function (e) { f.roastery = e.target.value; } }))),
      el('div', { class: 'grid2' },
        field('Origin', originSelect('bf-origin', f.originId, function (e) {
          var prev = snap(), no = originById(e.target.value);
          f.originId = e.target.value;
          if (no) { f.species = no.species; f.process = mainProcess(no); }
          rederive(prev);
        }, true)),
        field('Species', el('select', { id: 'bf-species', value: f.species, onchange: function (e) {
          var prev = snap(), sib = siblingOrigin(originById(f.originId), e.target.value);
          f.species = e.target.value;
          if (sib && sib.id !== f.originId) { f.originId = sib.id; f.process = mainProcess(sib); }
          rederive(prev);
        } }, SPECIES.map(function (s) { return opt(s, s); })))),
      el('div', { class: 'grid4' },
        field('Process', processSelect('bf-process', f.process, function (e) { var prev = snap(); f.process = e.target.value; rederive(prev); })),
        field('Varietal', varietalSelect('bf-varietal', f.varietal, function (e) { var prev = snap(); f.varietal = e.target.value; rederive(prev); })),
        field('Roast colour', roastSelect('bf-roast', f.roast, function (e) { var prev = snap(); f.roast = Number(e.target.value); rederive(prev); })),
        field('Stock (grams)', el('input', { type: 'number', id: 'bf-stock', min: 0, step: 50, value: f.stockG, oninput: function (e) { f.stockG = Math.max(0, Number(e.target.value) || 0); } }))),
      el('div', { class: 'grid4' },
        field('Producer / washing station', el('input', { type: 'text', id: 'bf-producer', value: f.producer || '', placeholder: 'e.g. Ketiara co-op', oninput: function (e) { f.producer = e.target.value; } })),
        field('Altitude', el('input', { type: 'text', id: 'bf-alt', value: f.altitude || '', placeholder: 'e.g. 1.400–1.600 m', oninput: function (e) { f.altitude = e.target.value; } })),
        field('Cup score (0–100)', el('input', { type: 'number', id: 'bf-cup', min: 0, max: 100, step: 0.25, value: f.cupScore == null ? '' : f.cupScore, placeholder: 'e.g. 85,5', oninput: function (e) { f.cupScore = e.target.value === '' ? '' : Number(e.target.value); } }), 'From the roastery or your own cupping'),
        el('span')),
      el('p', { class: 'muted small' }, (E.PROCESSES[f.process] || E.PROCESSES.full).note),
      field('Notes printed on the bag', el('textarea', { id: 'bf-notes', value: f.bagNotes, placeholder: typical ? 'Typical for this ' + f.species + ', ' + procLabel(f.process).toLowerCase() + ': ' + typical : 'e.g. dark chocolate, gula aren, orange zest', oninput: function (e) { f.bagNotes = e.target.value; }, onchange: function () { render(); } }), 'Type what the roastery printed, in English or Bahasa Indonesia, separated by commas.'),
      typical && f.bagNotes !== typical ? el('button', { class: 'btn ghost', type: 'button', onclick: function () { f.bagNotes = typical; render(); } }, 'Use the typical notes (' + f.species + ', ' + procLabel(f.process).toLowerCase() + ')') : null,
      noteChips(f.bagNotes, { showIgnored: true }),
      el('div', { class: 'grid4' }, ATTRS.map(function (a) {
        return field(AL[a] + ' (1–5)', el('input', { type: 'number', id: 'bf-sc-' + a, min: 1, max: 5, step: 0.5, value: f.scores[a], oninput: function (e) { var v = Number(e.target.value); if (v >= 1 && v <= 5) f.scores[a] = v; }, onchange: function () { render(); } }));
      })),
      el('div', { class: 'row' }, el('p', { class: 'muted small', style: 'flex:1' }, 'Scores start from the origin\'s typical values for this process and roast level. Change them to match what you taste; your changes are kept when you switch roast or process.'),
        current && !sameScores(f.scores, current) ? el('button', { class: 'btn ghost', type: 'button', onclick: function () { f.scores = current; render(); } }, 'Reset to origin scores') : null),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          if (!f.name.trim()) { toast('Give the bean a name.', true); return; }
          var data = { name: f.name.trim(), roastery: f.roastery || '', originId: f.originId || '', species: f.species, roast: f.roast, process: f.process, bagNotes: f.bagNotes || '', scores: f.scores, stockG: f.stockG || 0,
            varietal: f.varietal || 'unknown', producer: f.producer || '', altitude: f.altitude || '', cupScore: f.cupScore === '' || f.cupScore == null ? null : Number(f.cupScore),
            calib: f.calib || {}, noteCalib: f.noteCalib || {}, calibCount: f.calibCount || 0, createdAt: f.createdAt || Date.now() };
          try { await putDoc('beans', f.id || uid('b'), data); state.beanForm = null; toast('Saved ' + data.name + '.'); render(); } catch (e) { /* shown */ }
        } }, 'Save bean'),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.beanForm = null; render(); } }, 'Cancel')));
  }

  // ---------------- Cupping log ----------------
  function viewCupping() {
    var parts = [el('div', { class: 'row' }, el('h2', null, 'Cupping log'), el('span', { class: 'spacer' }),
      !state.cupDraft ? el('button', { class: 'btn', type: 'button', onclick: function () { if (!sim.pcts) { toast('Run the simulator first, then log a cupping for its mix.', true); go('simulator'); return; } startCupDraft('', sim.pcts); } }, '+ Log cupping for the current mix') : null)];
    if (state.cupDraft) parts.push(cupForm(state.cupDraft));
    if (!state.cuppings.length && !state.cupDraft) parts.push(el('div', { class: 'empty' }, el('p', null, 'No cupping entries yet. Plan a cupping table in the simulator, cup the coded samples blind, then log what you tasted here. Each entry can correct the simulator for your beans: their scores and which bag notes really come through.')));
    parts.push(el('div', { class: 'list' }, state.cuppings.map(cupCard)));
    return el('div', { class: 'stack' }, parts);
  }
  function scoreSelect(id, value, onchange) {
    var vals = ['', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
    return el('select', { id: id, value: String(value), onchange: onchange }, vals.map(function (v) { return opt(v, v === '' ? '—' : v.replace('.', ',')); }));
  }
  function cupForm(d) {
    return el('section', { class: 'card', 'aria-labelledby': 'cf-h' },
      el('h3', { id: 'cf-h' }, 'What did you taste?'),
      el('p', { class: 'muted small' }, 'Mix: ' + d.items.map(function (it) { return it.name + ' ' + it.pct + '%'; }).join(' · ') + ' · ' + E.BREWS[d.brew].label),
      el('div', { class: 'grid2' },
        field('Sample code', el('input', { type: 'text', id: 'cf-code', value: d.code, oninput: function (e) { d.code = e.target.value; } })),
        field('Blend name (optional)', el('input', { type: 'text', id: 'cf-name', value: d.blendName, oninput: function (e) { d.blendName = e.target.value; } }))),
      el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Cupping form' },
        el('label', null, el('input', { type: 'radio', name: 'cf-form', id: 'cf-form-s', checked: d.form !== 'cva', onchange: function () { d.form = 'simple'; render(); } }), el('span', null, 'Quick (1–5)')),
        el('label', null, el('input', { type: 'radio', name: 'cf-form', id: 'cf-form-c', checked: d.form === 'cva', onchange: function () { d.form = 'cva'; render(); } }), el('span', null, 'CVA-style (0–15 intensity)'))),
      d.form === 'cva' ? el('div', { class: 'stack', style: 'gap:8px' },
        el('p', { class: 'muted small' }, 'Descriptive part: score how strong each attribute is (0 = none, 15 = extremely intense), not how good it is. Mouthfeel, acidity and sweetness feed the learning.'),
        el('div', { class: 'grid4' }, ['fragrance', 'aroma', 'flavour', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel'].map(function (k) {
          return field(k.charAt(0).toUpperCase() + k.slice(1) + ' (0–15)', el('input', { type: 'number', id: 'cva-' + k, min: 0, max: 15, step: 0.5, value: d.cva[k], oninput: function (e) { d.cva[k] = e.target.value; } }),
            k === 'acidity' || k === 'sweetness' ? 'Predicted ' + nf((d.predicted[k] - 1) * 15 / 4, 1) : k === 'mouthfeel' ? 'Predicted ' + nf((d.predicted.body - 1) * 15 / 4, 1) : null);
        }), field('Bitterness (1–5)', scoreSelect('cva-bitterness', d.cva.bitterness, function (e) { d.cva.bitterness = e.target.value; }), 'Predicted ' + nf(d.predicted.bitterness, 1))),
        field('Affective: overall liking (1–9)', el('input', { type: 'number', id: 'cva-liking', min: 1, max: 9, step: 1, value: d.cva.liking, oninput: function (e) { d.cva.liking = e.target.value; } }), '1 = extremely low quality, 9 = extremely high quality'))
        : el('div', { class: 'grid4' }, ATTRS.map(function (a) {
          return field(AL[a], scoreSelect('cf-' + a, d.actual[a], function (e) { d.actual[a] = e.target.value; }), 'Predicted ' + nf(d.predicted[a], 1));
        })),
      field('Notes you tasted', el('input', { type: 'text', id: 'cf-notes', value: d.tastedNotes, placeholder: 'e.g. dark chocolate, palm sugar, orange', oninput: function (e) { d.tastedNotes = e.target.value; }, onchange: function () { render(); } }), 'Predicted strongest: ' + (d.predictedNotes.join(', ') || 'none') + '. List everything you tasted; the tool learns from what is missing too.'),
      noteChips(d.tastedNotes, { showIgnored: true }),
      el('div', { class: 'grid2' },
        el('label', { class: 'row tight' }, el('input', { type: 'checkbox', id: 'cf-clean', checked: d.clean, onchange: function (e) { d.clean = e.target.checked; render(); } }), 'Clean cup (no defects in any of the 5 cups)'),
        !d.clean ? field('Defects found', el('input', { type: 'text', id: 'cf-def', value: d.defects, placeholder: 'e.g. rubbery in 2 of 5 cups', oninput: function (e) { d.defects = e.target.value; } })) : el('span')),
      el('div', { class: 'grid2' },
        field('Overall (1–5)', scoreSelect('cf-overall', d.overall, function (e) { d.overall = e.target.value; })),
        field('SCA score (optional)', el('input', { type: 'number', id: 'cf-sca', min: 0, max: 100, step: 0.25, value: d.scaScore, placeholder: 'e.g. 82.5', oninput: function (e) { d.scaScore = e.target.value; } }))),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var actual = {}, any = false, cva = null;
          if (d.form === 'cva') {
            actual = E.cvaToModel(d.cva);
            cva = {}; Object.keys(d.cva).forEach(function (k) { if (d.cva[k] !== '' && d.cva[k] != null && isFinite(d.cva[k])) cva[k] = Number(d.cva[k]); });
            // Any CVA field counts (fragrance, aroma, flavour, aftertaste, liking…), not only the ones the model learns from.
            any = Object.keys(actual).length > 0 || Object.keys(cva).length > 0;
          } else {
            ATTRS.forEach(function (a) { if (d.actual[a] !== '') { actual[a] = Number(d.actual[a]); any = true; } });
          }
          if (!any && !d.tastedNotes.trim()) { toast('Score at least one attribute or list the notes you tasted.', true); return; }
          try {
            await putDoc('cuppings', uid('c'), {
              code: d.code || '', blendName: d.blendName || '', brew: d.brew, items: d.items, predicted: d.predicted, predictedNotes: d.predictedNotes,
              actual: actual, tastedNotes: d.tastedNotes || '', clean: !!d.clean, defects: d.clean ? '' : (d.defects || ''),
              overall: d.overall === '' ? null : Number(d.overall), scaScore: d.scaScore === '' ? null : Number(d.scaScore), cva: cva,
              applied: false, deltas: {}, createdAt: Date.now()
            });
            state.cupDraft = null; toast('Cupping saved. Review it below, then apply the learning if it looks right.'); render();
          } catch (e) { /* shown */ }
        } }, 'Save cupping'),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.cupDraft = null; render(); } }, 'Cancel')));
  }
  function cupBeans(c) {
    return c.items.map(function (it) {
      var b = it.beanId ? beanById(it.beanId) : null;
      return b ? savedBean(b) : { id: null, quick: true, name: it.name, species: it.species || 'arabica', roast: it.roast || 3, scores: {}, notes: [] };
    });
  }
  function getDeltas(c) {
    var d = c.deltas || {};
    if (d.attrs || d.notes) return { attrs: d.attrs || {}, notes: d.notes || {} };
    return { attrs: d, notes: {} };
  }
  function cupCard(c) {
    var tasted = parse(c.tastedNotes).known;
    var tastedLabels = tasted.map(function (n) { return n.label; });
    var missed = (c.predictedNotes || []).filter(function (n) { return tastedLabels.indexOf(n) < 0; });
    var surprise = tastedLabels.filter(function (n) { return (c.predictedNotes || []).indexOf(n) < 0; });
    var beans = cupBeans(c), pcts = c.items.map(function (i) { return i.pct; });
    var preview = c.applied ? getDeltas(c) : {
      // Compare with what the model predicts now (current bean calibration and auto-tune), so no error is learned twice.
      attrs: E.calibrate(beans, pcts, beans.every(function (b) { return !b.quick; }) ? E.profile(beans, pcts, c.brew, rules()) : c.predicted, c.actual || {}, rules()),
      // Only learn notes when at least one tasted word was recognised; a typo must not weaken every predicted note.
      notes: tasted.length ? E.calibrateNotes(beans, pcts, c.brew, tasted, rules()) : {}
    };
    var unrecognised = !c.applied && String(c.tastedNotes || '').trim() && !tasted.length;
    var ids = Object.keys(preview.attrs).concat(Object.keys(preview.notes)).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var confirming = state.confirm === 'cup:' + c.id;
    return el('article', { class: 'card' },
      el('div', { class: 'row' }, el('h3', null, (c.code ? 'Code ' + c.code : 'Cupping') + (c.blendName ? ' · ' + c.blendName : '')),
        c.clean ? el('span', { class: 'pill ok' }, 'Clean cup') : el('span', { class: 'pill fail' }, 'Defects'),
        el('span', { class: 'spacer' }), el('span', { class: 'muted small' }, dateStr(c.createdAt))),
      el('p', { class: 'muted small' }, c.items.map(function (it) { return it.name + ' ' + it.pct + '%'; }).join(' · ') + ' · ' + (E.BREWS[c.brew] || E.BREWS.filter).label +
        (c.overall != null ? ' · overall ' + c.overall + '/5' : '') + (c.scaScore != null ? ' · SCA ' + nf(c.scaScore, 2) : '')),
      el('div', { class: 'tablewrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', null, ''), ATTRS.map(function (a) { return el('th', { class: 'num' }, AL[a]); }))),
        el('tbody', null,
          el('tr', null, el('td', null, 'Predicted'), ATTRS.map(function (a) { return el('td', { class: 'num mono' }, nf(c.predicted[a], 1)); })),
          el('tr', null, el('td', null, 'Tasted'), ATTRS.map(function (a) { return el('td', { class: 'num mono' }, c.actual && c.actual[a] != null ? nf(c.actual[a], 1) : '—'); })),
          el('tr', null, el('td', null, 'Difference'), ATTRS.map(function (a) {
            if (!c.actual || c.actual[a] == null) return el('td', { class: 'num' }, '—');
            var d = c.actual[a] - c.predicted[a];
            return el('td', { class: 'num mono ' + (Math.abs(d) < 0.25 ? '' : d > 0 ? 'delta-pos' : 'delta-neg') }, (d > 0 ? '+' : '') + nf(d, 1));
          }))))),
      c.cva ? el('p', { class: 'small mono' }, 'CVA intensities: ' + Object.keys(c.cva).filter(function (k) { return k !== 'liking' && k !== 'bitterness'; }).map(function (k) { return k + ' ' + nf(c.cva[k], 1); }).join(' · ') +
        (c.cva.liking != null ? ' · liking ' + c.cva.liking + '/9' : '')) : null,
      missed.length ? el('p', { class: 'small' }, 'Predicted but not tasted: ' + missed.join(', ') + '.') : null,
      surprise.length ? el('p', { class: 'small' }, 'Tasted but not predicted: ' + surprise.join(', ') + '. If a bean really has this note, add it to that bean\'s bag notes.') : null,
      !c.clean && c.defects ? el('p', { class: 'small delta-neg' }, 'Defects: ' + c.defects) : null,
      unrecognised ? el('div', { class: 'stack', style: 'gap:4px' }, el('p', { class: 'small' }, 'None of the tasted notes were recognised, so note learning is skipped. Tap a word to tell the tool what it is.'), noteChips(c.tastedNotes)) : null,
      ids.length ? el('div', { class: 'small' }, el('span', { class: 'label' }, c.applied ? 'Learning applied' : 'Learning to apply'),
        el('ul', { class: 'reasons' }, ids.map(function (id) {
          var b = beanById(id), a = preview.attrs[id] || {}, n = preview.notes[id] || {};
          var bits = Object.keys(a).map(function (k) { return AL[k].toLowerCase() + ' ' + (a[k] > 0 ? '+' : '') + nf(a[k], 2); })
            .concat(Object.keys(n).map(function (k) { var note = noteIndex().notes[k]; return (note ? note.label.toLowerCase() : k) + ' note ×' + nf(n[k].to, 2) + (n[k].to < n[k].from ? ' (weaker)' : ' (stronger)'); }));
          return el('li', null, (b ? b.name : 'Deleted bean') + ': ' + bits.join(', '));
        }))) : el('p', { class: 'muted small' }, c.applied ? '' : 'Nothing to learn: the prediction matched, or the mix used quick beans that aren\'t saved.'),
      el('div', { class: 'row' },
        !c.applied && ids.length ? el('button', { class: 'btn primary', type: 'button', disabled: !!busy['learn:' + c.id], onclick: function () { applyLearning(c, preview, 1); } }, 'Apply learning') : null,
        c.applied ? el('button', { class: 'btn', type: 'button', disabled: !!busy['learn:' + c.id], onclick: function () { applyLearning(c, getDeltas(c), -1); } }, 'Undo learning') : null,
        el('span', { class: 'spacer' }),
        confirming ? el('span', { class: 'row tight' }, el('span', { class: 'small' }, c.applied ? 'Delete and keep the learning?' : 'Delete this entry?'),
          el('button', { class: 'btn danger', type: 'button', onclick: async function () { state.confirm = null; try { await delDoc('cuppings', c.id); } catch (e) { /* shown */ } } }, 'Delete'),
          el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.confirm = null; render(); } }, 'Keep'))
          : el('button', { class: 'btn ghost danger', type: 'button', onclick: function () { state.confirm = 'cup:' + c.id; render(); } }, 'Delete')));
  }
  async function applyLearning(c, deltas, sign) {
    await withLock('learn:' + c.id, async function () {
    try {
      var fresh = state.cuppings.filter(function (x) { return x.id === c.id; })[0];
      if (fresh && !!fresh.applied === sign > 0) return; // already applied / already undone (e.g. from another device)
      var appliedAt = (fresh && fresh.appliedAt) || c.appliedAt || c.createdAt || 0;
      var ids = Object.keys(deltas.attrs).concat(Object.keys(deltas.notes)).filter(function (v, i, a) { return a.indexOf(v) === i; });
      for (var i = 0; i < ids.length; i++) {
        var b = beanById(ids[i]);
        if (!b) continue;
        // This bean's adjustments were reset after the cupping was applied: there is nothing of it left to undo.
        if (sign < 0 && b.calibResetAt && b.calibResetAt >= appliedAt) continue;
        await patchDoc('beans', b.id, {
          calib: E.applyCalib(b.calib, deltas.attrs[b.id] || {}, sign),
          noteCalib: E.applyNoteCalib(b.noteCalib, deltas.notes[b.id] || {}, sign),
          calibCount: Math.max(0, (b.calibCount || 0) + sign)
        });
      }
      await patchDoc('cuppings', c.id, { applied: sign > 0, appliedAt: sign > 0 ? Date.now() : null, deltas: sign > 0 ? { attrs: deltas.attrs, notes: deltas.notes } : {} });
      toast(sign > 0 ? 'Learning applied. The simulator now uses the corrected scores and notes.' : 'Learning undone.');
    } catch (e) { /* shown */ }
    });
  }

  // ---------------- Blends ----------------
  function evalBlend(bl) {
    var beans = (bl.rows || []).map(function (r, i) {
      if (r.kind === 'saved') { var b = beanById(r.beanId); return b ? savedBean(b) : null; }
      return { quick: true, name: r.name || 'Quick bean ' + (i + 1), species: r.species, roast: r.roast, process: r.process, varietal: r.varietal, originId: r.originId, cupScore: r.cupScore === '' ? null : r.cupScore, scores: r.scores, notes: parse(r.notesText).known };
    });
    if (beans.some(function (b) { return !b; })) return null;
    return { beans: beans, ev: E.evaluateMix(beans, bl.pcts, blendTarget(bl), { brew: bl.brew, rules: rules(), index: noteIndex() }) };
  }
  // A saved blend's full target. Blends saved before this was stored have no high-end check, acidity type or robusta limit.
  function blendTarget(bl) {
    return targetOf({ ranges: bl.ranges, mustText: bl.mustText, notText: bl.notText, acidType: bl.acidType || '',
      specialty: bl.specialty || null, robustaMax: bl.robustaMax == null ? '' : bl.robustaMax });
  }
  function blendMissingBean(bl) { return (bl.rows || []).some(function (r) { return r.kind === 'saved' && !beanById(r.beanId); }); }
  function openBlend(bl, copy) {
    if (blendMissingBean(bl)) { toast('A bean in this blend was deleted, so it can\'t be opened. Re-create it from a new mix.', true); return; }
    sim.rows = (bl.rows || []).map(function (r) { return Object.assign({ min: '', max: '' }, r, { key: uid('r') }); });
    sim.brew = bl.brew || 'filter'; sim.ranges = JSON.parse(JSON.stringify(bl.ranges || {})); sim.mustText = bl.mustText || ''; sim.notText = bl.notText || '';
    sim.acidType = bl.acidType || '';
    sim.specialty = Object.assign(defaultSpecialty(), bl.specialty ? JSON.parse(JSON.stringify(bl.specialty)) : { on: false });
    sim.robustaMax = bl.robustaMax == null ? '' : String(bl.robustaMax);
    sim.useKey = ''; sim.mode = 'taste'; state.subs = null;
    TATTRS.forEach(function (a) { if (!sim.ranges[a]) sim.ranges[a] = ['', '']; });
    sim.pcts = bl.pcts.slice(); sim.manual = true; sim.saveName = copy ? bl.name + ' (copy)' : bl.name;
    sim.result = { best: { pcts: bl.pcts.slice() }, alternatives: [], reasons: [], searched: 0, ms: 0 };
    sim.sig = simSig(); sim.cupping = null; saveSimDraft(); go('simulator');
  }
  function viewBlends() {
    var parts = [el('h2', null, 'Saved blends')];
    if (!state.blends.length) parts.push(el('div', { class: 'empty' }, el('p', null, 'No saved blends yet. Decide a ratio in the simulator, then save it with a name.')));
    parts.push(el('div', { class: 'list' }, state.blends.map(function (bl) {
      var r = evalBlend(bl);
      var confirming = state.confirm === 'blend:' + bl.id;
      return el('article', { class: 'card' },
        el('div', { class: 'row' }, el('h3', null, bl.name), r ? statusPill(r.ev.status, r.ev.headline) : el('span', { class: 'pill fail' }, 'A bean was deleted'), el('span', { class: 'spacer' }), el('span', { class: 'muted small' }, dateStr(bl.createdAt))),
        el('div', { class: 'row' }, el('span', { class: 'mono', style: 'font-size:1.15rem;font-weight:600' }, bl.pcts.join(' : ')), r ? shareBadge(r.beans, bl.pcts) : null),
        r ? legend(r.beans, bl.pcts) : null, ratioBar(bl.pcts),
        el('p', { class: 'small muted' }, (E.BREWS[bl.brew] || E.BREWS.filter).label + ' · ' + (r ? r.ev.notes.summary : bl.summary || '')),
        bl.reference ? consistencyBlock(bl, r) : null,
        el('div', { class: 'row' },
          el('button', { class: 'btn', type: 'button', disabled: !r, title: r ? null : 'A bean in this blend was deleted', onclick: function () { openBlend(bl, false); } }, 'Open in simulator'),
          el('button', { class: 'btn', type: 'button', disabled: !r, title: r ? null : 'A bean in this blend was deleted', onclick: function () { openBlend(bl, true); } }, 'Duplicate'),
          r ? el('button', { class: 'btn ghost', type: 'button', onclick: async function () {
            var ref = { values: r.ev.values, must: r.ev.notes.notes.filter(function (n) { return n.tier === 'dominant' || n.tier === 'supporting'; }).map(function (n) { return n.label; }), setAt: Date.now() };
            try { await patchDoc('blends', bl.id, { reference: ref }); toast(bl.name + ' is now a reference blend. Use it to check new batches and lots.'); } catch (e) { /* shown */ }
          } }, bl.reference ? 'Update reference' : 'Set as reference') : null,
          el('span', { class: 'spacer' }),
          confirming ? el('span', { class: 'row tight' }, el('button', { class: 'btn danger', type: 'button', onclick: async function () { state.confirm = null; try { await delDoc('blends', bl.id); } catch (e) { /* shown */ } } }, 'Delete'),
            el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.confirm = null; render(); } }, 'Keep'))
            : el('button', { class: 'btn ghost danger', type: 'button', onclick: function () { state.confirm = 'blend:' + bl.id; render(); } }, 'Delete')));
    })));
    if (state.blends.length >= 2) parts.push(compareCard());
    return el('div', { class: 'stack' }, parts);
  }
  // ---------------- Lot consistency (reference, triangle test, re-match) ----------------
  var tri = {}, rematch = {};
  function refTarget(ref) { var t = E.referenceTarget({ values: ref.values, notes: { notes: [] } }); t.must = (ref.must || []).slice(); return t; }
  function consistencyBlock(bl, r) {
    var T = tri[bl.id], M = rematch[bl.id] || (rematch[bl.id] = { comp: 0, bean: '' });
    var rows = bl.rows || [];
    var hist = bl.triangles || [];
    var allPicked = T && T.picks.length === T.plan.length && T.picks.every(function (p) { return p != null; });
    var correct = allPicked ? T.plan.filter(function (rd, i) { return T.picks[i] === rd.odd; }).length : 0;
    var verdict = allPicked ? E.triangleVerdict(correct, T.plan.length) : null;
    return el('details', { class: 'consistency' },
      el('summary', null, el('span', { class: 'pill ok' }, 'Reference blend'), ' Consistency checks', hist.length ? el('span', { class: 'muted small' }, ' · last triangle test: ' + (hist[hist.length - 1].different ? 'different' : 'matches')) : null),
      el('div', { class: 'stack', style: 'margin-top:10px' },
        el('p', { class: 'muted small' }, 'Reference profile: ' + TATTRS.map(function (a) { return AL[a].toLowerCase() + ' ' + nf(bl.reference.values[a], 1); }).join(', ') + '. Key notes: ' + ((bl.reference.must || []).join(', ') || 'none') + '.'),
        el('h3', null, 'Triangle test: does a new batch match?'),
        el('p', { class: 'small' }, 'Each round has 3 cups: 2 are the same coffee and 1 is different. Ask a helper to prepare and code the cups from the prep list, then pick the odd cup blind. If you can\'t reliably find it, the new batch matches the reference.'),
        el('button', { class: 'btn', type: 'button', onclick: function () { tri[bl.id] = { plan: E.trianglePlan(3), picks: [null, null, null] }; render(); } }, T ? 'New triangle test' : 'Plan a triangle test (3 rounds)'),
        T ? el('details', null, el('summary', { class: 'small' }, 'Prep list for the helper (don\'t look if you are cupping)'),
          el('ul', { class: 'reasons small' }, T.plan.map(function (rd, i) {
            return el('li', null, 'Round ' + (i + 1) + ': ' + rd.codes.map(function (c, k) { return c + ' = ' + (rd.samples[k] === 'ref' ? 'reference' : 'new batch'); }).join(', '));
          }))) : null,
        T ? el('div', { class: 'list' }, T.plan.map(function (rd, i) {
          return el('div', { class: 'row small' }, el('b', null, 'Round ' + (i + 1)), el('span', { class: 'muted' }, 'Cups ' + rd.codes.join(' · ')),
            el('select', { id: 'tri-' + bl.id + '-' + i, value: T.picks[i] == null ? '' : String(T.picks[i]), onchange: function (e) { T.picks[i] = e.target.value === '' ? null : Number(e.target.value); render(); } },
              opt('', 'Odd cup is…'), rd.codes.map(function (c, k) { return opt(String(k), c); })));
        })) : null,
        verdict ? el('div', { class: 'row' }, el('span', { class: 'pill ' + (verdict.different ? 'fail' : 'ok') }, verdict.different ? '✕ Noticeably different' : '✓ Matches the reference'),
          el('span', { class: 'small muted' }, correct + ' of ' + T.plan.length + ' correct (chance of guessing this well: ' + nf(verdict.p * 100, 0) + '%)'),
          el('button', { class: 'btn ghost', type: 'button', onclick: async function () {
            try { await patchDoc('blends', bl.id, { triangles: hist.concat([{ date: Date.now(), rounds: T.plan.length, correct: correct, different: verdict.different, p: verdict.p }]) }); delete tri[bl.id]; toast('Triangle test saved.'); } catch (e) { /* shown */ }
          } }, 'Save result')) : null,
        hist.length ? el('ul', { class: 'reasons small muted' }, hist.slice(-5).reverse().map(function (h) { return el('li', null, dateStr(h.date) + ': ' + h.correct + '/' + h.rounds + ' correct, ' + (h.different ? 'different' : 'matches')); })) : null,
        el('h3', null, 'New lot from the roastery? Re-match the ratio'),
        el('p', { class: 'small' }, 'Replace one component with the new lot (save it under My beans first). The simulator then finds the ratio that lands back on the reference profile.'),
        el('div', { class: 'grid2' },
          field('Replace', el('select', { id: 'rm-comp-' + bl.id, value: String(M.comp), onchange: function (e) { M.comp = Number(e.target.value); M.res = null; render(); } },
            rows.map(function (rw, i) { var b = rw.kind === 'saved' ? beanById(rw.beanId) : null; return opt(String(i), (b ? b.name : rw.name || 'Bean ' + (i + 1)) + ' (' + bl.pcts[i] + '%)'); }))),
          field('With', el('select', { id: 'rm-bean-' + bl.id, value: M.bean, onchange: function (e) { M.bean = e.target.value; M.res = null; render(); } },
            opt('', 'Choose a saved bean…'), state.beans.map(function (b) { return opt(b.id, b.name); })))),
        el('button', { class: 'btn', type: 'button', disabled: !M.bean || !r, onclick: function () {
          var nb = beanById(M.bean); if (!nb || !r) return;
          var beans = r.beans.slice(); beans[M.comp] = savedBean(nb);
          // Land back on the reference profile while keeping the blend's own rules (must-not, high-end check, acidity type, robusta limit).
          var own = blendTarget(bl), rt = refTarget(bl.reference);
          rt.mustNot = own.mustNot; rt.specialty = own.specialty; rt.robustaMax = own.robustaMax;
          if (bl.acidType) rt.must.push('acid:' + bl.acidType);
          M.res = E.solve(beans, rt, { brew: bl.brew, rules: rules(), index: noteIndex() });
          M.beans = beans; render();
        } }, 'Re-match ratio'),
        M.res ? el('div', { class: 'alt' },
          el('div', { class: 'row' }, statusPill(M.res.status, M.res.headline), el('span', { class: 'mono' }, 'Old ' + bl.pcts.join(' : ') + ' → new ' + (M.res.best ? M.res.best.pcts.join(' : ') : '—'))),
          M.res.reasons.length ? el('ul', { class: 'reasons small' }, M.res.reasons.map(function (x) { return el('li', null, x); })) : el('p', { class: 'small' }, 'The new ratio lands inside the reference profile (±0,25 on each attribute, same key notes).'),
          M.res.best ? el('button', { class: 'btn', type: 'button', onclick: function () {
            var newRows = (bl.rows || []).map(function (rw, i) { return i === M.comp ? savedRow(M.bean) : Object.assign({ min: '', max: '' }, rw, { key: uid('r') }); });
            openBlend(Object.assign({}, bl, { rows: newRows, pcts: M.res.best.pcts, name: bl.name + ' (new lot)' }), false);
          } }, 'Open in simulator') : null) : null));
  }
  function compareCard() {
    var ids = state.blends.map(function (b) { return b.id; });
    state.cmp = (state.cmp || []).filter(function (id) { return ids.indexOf(id) >= 0; });
    if (state.cmp.length < 2) state.cmp = [ids[0], ids[1]];
    function pick(i) {
      return el('select', { id: 'cmp-' + i, value: state.cmp[i], onchange: function (e) { state.cmp[i] = e.target.value; render(); } }, state.blends.map(function (b) { return opt(b.id, b.name); }));
    }
    var cols = state.cmp.map(function (id, i) {
      var bl = state.blends.filter(function (b) { return b.id === id; })[0];
      var r = bl && evalBlend(bl);
      return el('div', { class: 'stack' }, pick(i),
        r ? [statusPill(r.ev.status, r.ev.headline), el('div', { class: 'mono' }, bl.pcts.join(' : ') + ' · ' + (E.BREWS[bl.brew] || E.BREWS.filter).label), shareBadge(r.beans, bl.pcts),
          el('div', { class: 'meters' }, TATTRS.map(function (a) { return meter(AL[a], r.ev.values[a], null); }),
            meter('Balance', r.ev.form.balance), meter('Complexity', r.ev.form.complexity), meter('Finish', r.ev.form.finish)),
          el('p', { class: 'small' }, r.ev.notes.summary)] : el('p', { class: 'muted small' }, 'Can\'t evaluate: a bean in this blend was deleted.'));
    });
    return el('section', { class: 'card', 'aria-labelledby': 'cmp-h' }, el('h3', { id: 'cmp-h' }, 'Compare two blends'), el('div', { class: 'cmp' }, cols));
  }

  // ---------------- Café spec sheet ----------------
  function openSheetFromSim(ev) {
    var beans = simBeans();
    state.sheet = {
      name: sim.saveName || 'Untitled blend', brew: sim.brew, pcts: sim.pcts.slice(),
      beans: beans.map(function (b, i) {
        var o = originById(b.originId);
        return { name: b.name, share: sim.pcts[i], origin: o ? o.country + ', ' + o.region : '', process: procLabel(b.process), varietal: b.varietal && b.varietal !== 'unknown' ? E.VARIETALS[b.varietal].label : '',
          producer: b.producer || '', altitude: b.altitude || (o ? o.altitude : ''), species: b.species, cupScore: b.cupScore };
      }),
      species: E.speciesShare(beans, sim.pcts).label,
      roast: E.roastColour(ev.values.roast), summary: ev.notes.summary,
      notes: ev.notes.notes.filter(function (n) { return n.tier === 'dominant' || n.tier === 'supporting'; }).map(function (n) { return n.label; }),
      values: ev.values, predicted: ev.predicted, acid: ev.acid.dominant ? E.ACID_TYPES[ev.acid.dominant].label : '',
      recipe: E.recipeFor(sim.brew, ev.values.roast), roastDate: '', lang: '', translation: null
    };
    lsSet('rd.sheet.v1', state.sheet);
    go('sheet');
  }
  function sheetRows(s) {
    var r = s.recipe;
    return {
      components: s.beans.map(function (b) { return [b.share + '%', b.name, [b.species ? b.species.charAt(0).toUpperCase() + b.species.slice(1) : '', b.origin, b.process, b.varietal, b.producer, b.altitude].filter(Boolean).join(' · ')]; }),
      profile: TATTRS.map(function (a) { return [AL[a], nf(s.values[a], 1) + ' / 5']; }),
      recipe: [['Dose', r.dose], ['Output', r.yield], ['Ratio', r.ratio], ['Water temp', r.temp], ['Time', r.time], ['Grind', r.grind]]
    };
  }
  function restLine(s) {
    if (!s.roastDate) return 'Best served ' + s.recipe.rest + '.';
    // "YYYY-MM-DD" from a date input is a local calendar day; new Date(string) would read it as UTC midnight.
    var ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s.roastDate));
    var d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(NaN);
    var m = /(\d+)\s*[–-]\s*(\d+)/.exec(s.recipe.rest || '');
    if (isNaN(d) || !m) return 'Best served ' + s.recipe.rest + '.';
    var from = new Date(d), to = new Date(d);
    from.setDate(from.getDate() + Number(m[1])); to.setDate(to.getDate() + Number(m[2]));
    return 'Roasted ' + dateStr(d) + '. Best served ' + dateStr(from) + ' to ' + dateStr(to) + ' (' + s.recipe.rest + ').';
  }
  function sheetHtml(s) {
    var rows = sheetRows(s), t = s.translation;
    function table(list) { return '<table>' + list.map(function (r) { return '<tr>' + r.map(function (c, i) { return (i ? '<td>' : '<th>') + esc(c) + (i ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') + '</table>'; }
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(s.name) + ' · spec sheet</title>' +
      '<style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1d1a17}h1{font-family:Georgia,serif;margin:0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#7a3e1d;margin:22px 0 6px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;vertical-align:top}.muted{color:#666;font-size:13px}.tag{display:inline-block;background:#f2e5db;color:#7a3e1d;border-radius:99px;padding:2px 10px;margin:2px;font-size:13px}</style></head><body>' +
      '<h1>' + esc(s.name) + '</h1><p class="muted">' + esc(s.species || E.speciesShare(s.beans, s.beans.map(function (b) { return b.share; })).label) + ' · ' + esc(E.BREWS[s.brew].label) + ' · ' + esc(s.roast.name) + ' roast (Agtron ' + esc(s.roast.agtron) + ')' +
      (s.predicted ? ' · estimated cup score ' + esc(nf(s.predicted.value, 1)) : '') + '</p>' +
      '<p>' + s.notes.map(function (n) { return '<span class="tag">' + esc(n) + '</span>'; }).join('') + '</p><p>' + esc(s.summary) + (s.acid ? ' Acidity: ' + esc(s.acid) + '.' : '') + '</p>' +
      (t && t.summary ? '<p><em>' + esc(t.summary) + '</em></p>' : '') +
      '<h2>Components</h2>' + table(rows.components) + '<h2>Profile (as served)</h2>' + table(rows.profile) +
      '<h2>Recipe: ' + esc(s.recipe.title) + '</h2>' + table(rows.recipe) + '<p>' + esc(s.recipe.extra) + '</p>' + (t && t.extra ? '<p><em>' + esc(t.extra) + '</em></p>' : '') +
      '<p class="muted">Targets: ' + esc(s.recipe.targets) + '</p>' +
      '<h2>Water and resting</h2><p>' + esc(s.recipe.water) + '</p>' + (t && t.water ? '<p><em>' + esc(t.water) + '</em></p>' : '') + '<p>' + esc(restLine(s)) + '</p>' +
      '<p class="muted">The estimated cup score is calculated from component cup scores and is not an official SCA grade.</p></body></html>';
  }
  function viewSheet() {
    var s = state.sheet || (state.sheet = lsGet('rd.sheet.v1'));
    if (!s) return el('div', { class: 'stack' }, el('h2', null, 'Café spec sheet'),
      el('div', { class: 'empty' }, el('p', null, 'Decide a ratio in the simulator, then press "Make a café spec sheet" on the recipe card. The sheet lists components, roast colour, notes, recipe, water and rest advice for café buyers.'),
        el('button', { class: 'btn primary', type: 'button', onclick: function () { go('simulator'); } }, 'Go to the simulator')));
    var rows = sheetRows(s), t = s.translation;
    function save() { lsSet('rd.sheet.v1', s); }
    function tbl(list) { return el('div', { class: 'tablewrap' }, el('table', null, el('tbody', null, list.map(function (r) { return el('tr', null, r.map(function (c, i) { return el(i ? 'td' : 'th', null, c); })); })))); }
    return el('div', { class: 'stack' },
      el('div', { class: 'row' }, el('h2', null, 'Café spec sheet'), el('span', { class: 'spacer' }),
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          if (await saveFile(E.slug(s.name || 'blend') + '-spec-sheet.html', sheetHtml(s))) toast('Spec sheet saved.');
        } }, 'Download sheet')),
      el('section', { class: 'card' },
        el('div', { class: 'grid4' },
          field('Blend name', el('input', { type: 'text', id: 'sheet-name', value: s.name, oninput: function (e) { s.name = e.target.value; save(); var h = byId('sheet-title'); if (h) h.textContent = s.name; } })),
          field('Roast date (optional)', el('input', { type: 'date', id: 'sheet-date', value: s.roastDate || '', onchange: function (e) { s.roastDate = e.target.value; save(); render(); } }), 'Only used for rest advice'),
          field('Second language', el('select', { id: 'sheet-lang', value: s.lang, onchange: function (e) { s.lang = e.target.value; s.translation = null; save(); render(); } },
            opt('', 'English only'), opt('th', 'Thai (ภาษาไทย)'), opt('id', 'Bahasa Indonesia'))),
          s.lang && state.sample && !state.aiHidden ? el('div', { class: 'field' }, el('span', null, ' '), el('button', { class: 'btn', type: 'button', disabled: s.busy, onclick: async function () {
            s.busy = true; render();
            try {
              var res = await state.sample.json('Translate these coffee spec-sheet texts into ' + (s.lang === 'th' ? 'Thai' : 'Bahasa Indonesia') + ' for café buyers. Keep every number, unit and coffee term accurate; do not add claims. Reply with only JSON with the same keys.\n\n' +
                JSON.stringify({ summary: s.summary, extra: s.recipe.extra, water: s.recipe.water }), { modelTier: 'quick' });
              s.translation = res && typeof res === 'object' ? { summary: String(res.summary || '').slice(0, 600), extra: String(res.extra || '').slice(0, 600), water: String(res.water || '').slice(0, 800) } : null;
              if (!s.translation) toast('The assistant didn\'t return a translation.', true);
            } catch (e) { var m = aiError(e && e.code); if (m) toast(m, true); }
            s.busy = false; save(); render();
          } }, s.busy ? 'Translating…' : 'Translate with the assistant')) : el('span'))),
      el('article', { class: 'card sheet' },
        el('h2', { id: 'sheet-title' }, s.name),
        el('p', { class: 'muted small' }, el('b', null, s.species || E.speciesShare(s.beans, s.beans.map(function (b) { return b.share; })).label), ' · ' + E.BREWS[s.brew].label + ' · ' + s.roast.name + ' roast (Agtron ' + s.roast.agtron + ')' + (s.predicted ? ' · estimated cup score ' + nf(s.predicted.value, 1) : '')),
        el('div', { class: 'chips' }, s.notes.map(function (n) { return el('span', { class: 'chip' }, n); })),
        el('p', null, s.summary + (s.acid ? ' Acidity: ' + s.acid + '.' : '')), t && t.summary ? el('p', { class: 'small' }, el('em', null, t.summary)) : null,
        el('span', { class: 'label' }, 'Components'), tbl(rows.components),
        el('span', { class: 'label' }, 'Profile as served'), tbl(rows.profile),
        el('span', { class: 'label' }, 'Recipe: ' + s.recipe.title), tbl(rows.recipe), el('p', { class: 'small' }, s.recipe.extra), t && t.extra ? el('p', { class: 'small' }, el('em', null, t.extra)) : null,
        el('p', { class: 'small mono' }, 'Targets: ' + s.recipe.targets),
        el('span', { class: 'label' }, 'Water and resting'), el('p', { class: 'small' }, s.recipe.water), t && t.water ? el('p', { class: 'small' }, el('em', null, t.water)) : null,
        el('p', { class: 'small' }, restLine(s)),
        el('p', { class: 'muted small' }, 'The estimated cup score is calculated from component cup scores and is not an official SCA grade.')));
  }

  // ---------------- Batches ----------------
  function viewBatches() {
    var parts = [el('h2', null, 'Batches')];
    if (!state.batches.length) parts.push(el('div', { class: 'empty' }, el('p', null, 'No batches logged yet. In the simulator\'s Make it section, enter how many bags you are packing and log the batch. The grams come off your stock.')));
    parts.push(el('div', { class: 'list' }, state.batches.map(function (t) {
      return el('article', { class: 'card' + (t.undone ? ' muted' : '') },
        el('div', { class: 'row' }, el('h3', null, t.blendName), t.undone ? el('span', { class: 'pill warn' }, 'Undone') : null, el('span', { class: 'spacer' }), el('span', { class: 'muted small' }, dateStr(t.createdAt))),
        el('p', { class: 'small' }, (t.plan || []).map(function (p) { return p.count + ' × ' + bagLabel(p.bagG); }).join(' + ') + ' = ' + fmtKg(t.totalG || 0)),
        el('div', { class: 'tablewrap' }, el('table', null, el('tbody', null, (t.items || []).map(function (it) { return el('tr', null, el('td', null, it.name), el('td', { class: 'num mono' }, (it.pct != null ? it.pct + '%' : '')), el('td', { class: 'num mono' }, fmtG(it.grams))); })))),
        !t.undone ? el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', disabled: !!busy['undo:' + t.id], onclick: function () {
          withLock('undo:' + t.id, async function () {
            try {
              var fresh = state.batches.filter(function (x) { return x.id === t.id; })[0];
              if (!fresh || fresh.undone) return; // already undone (double-click or another device)
              await adjustStock(gramsByBean(fresh.items || [], (fresh.items || []).map(function (it) { return it.grams; })), 1);
              await patchDoc('batches', t.id, { undone: true });
              toast('Batch undone. Stock restored.');
            } catch (e) { /* shown */ }
          });
        } }, busy['undo:' + t.id] ? 'Restoring…' : 'Undo and restore stock')) : null);
    })));
    return el('div', { class: 'stack' }, parts);
  }

  // ---------------- Origins (with process columns) ----------------
  function procCell(o, p) {
    var offered = E.offeredProcesses(o.process).indexOf(p) >= 0;
    var s = E.scoresFor(o, 3, p);
    return el('td', { class: 'proc-cell' + (offered ? '' : ' est'), title: offered ? 'Typical process for this origin' : 'Estimate: this origin is rarely sold with this process' },
      el('div', { class: 'proc-scores' }, ATTRS.map(function (a) { return el('span', null, AL[a].charAt(0) + (a === 'bitterness' ? 'i' : '') + ' ', el('b', null, nf(s[a], 1))); })),
      el('span', { class: 'small' }, offered ? '● typical' : 'estimate'));
  }
  function islandOf(o) {
    if (o.country !== 'Indonesia') return '';
    var r = o.region || '';
    if (/Sumatra|Aceh|Jambi|Bengkulu|Lampung|Riau/i.test(r)) return 'Sumatra';
    if (/Java/i.test(r)) return 'Java';
    if (/Bali|Lombok|Nusa Tenggara|Flores|Tambora|Sumbawa/i.test(r)) return 'Bali & Nusa Tenggara';
    if (/Sulawesi|Gorontalo/i.test(r)) return 'Sulawesi';
    if (/Papua/i.test(r)) return 'Papua';
    return 'Other islands';
  }
  function viewOrigins() {
    var q = state.oq = state.oq || { text: '', species: '', country: '', process: '' };
    q.island = q.island || ''; q.gi = !!q.gi; q.onlyNew = !!q.onlyNew;
    var all = origins();
    var countries = Array.from(new Set(all.map(function (o) { return o.country; }))).sort(function (a, b) { return a === 'Indonesia' ? -1 : b === 'Indonesia' ? 1 : a.localeCompare(b); });
    var t = q.text.toLowerCase();
    var list = all.filter(function (o) {
      return (!q.species || o.species === q.species) && (!q.country || o.country === q.country) &&
        (!q.process || E.offeredProcesses(o.process).indexOf(q.process) >= 0) &&
        (!q.island || islandOf(o) === q.island) && (!q.gi || o.gi) && (!q.onlyNew || o.isNew) &&
        (!t || (o.country + ' ' + o.region + ' ' + o.notes + ' ' + o.process + ' ' + (o.gi || '') + ' ' + (o.varietals || '')).toLowerCase().indexOf(t) >= 0);
    });
    var indo = all.filter(function (o) { return o.country === 'Indonesia'; });
    var islands = ['Sumatra', 'Java', 'Bali & Nusa Tenggara', 'Sulawesi', 'Papua'];
    var groups = {};
    list.forEach(function (o) { (groups[o.country] = groups[o.country] || []).push(o); });
    var counts = SPECIES.map(function (s) { return s + ' ' + all.filter(function (o) { return o.species === s; }).length; }).join(' · ');
    return el('div', { class: 'stack' },
      el('div', null, el('h2', null, 'Origin catalogue'), el('p', { class: 'muted small' }, all.length + ' origins · ' + counts + '. Scores are typical at medium roast (B body, A acidity, S sweetness, Bi bitterness). ● marks the processes an origin is usually sold in; other columns are estimates. Your own scores and cupping results override them.')),
      el('div', { class: 'row' },
        el('input', { type: 'search', id: 'o-q', placeholder: 'Search region, note or process', value: q.text, style: 'flex:2;min-width:180px', oninput: function (e) { q.text = e.target.value; render(); } }),
        el('select', { id: 'o-sp', value: q.species, style: 'flex:1;min-width:120px', onchange: function (e) { q.species = e.target.value; render(); } }, opt('', 'All species'), SPECIES.map(function (s) { return opt(s, s); })),
        el('select', { id: 'o-pr', value: q.process, style: 'flex:1;min-width:140px', onchange: function (e) { q.process = e.target.value; render(); } }, opt('', 'Any process'), PROCS.map(function (p) { return opt(p, procLabel(p)); })),
        el('select', { id: 'o-c', value: q.country, style: 'flex:1;min-width:140px', onchange: function (e) { q.country = e.target.value; render(); } }, opt('', 'All countries'), countries.map(function (c) { return opt(c, c); }))),
      el('div', { class: 'row' },
        el('span', { class: 'label' }, 'Indonesia: ' + indo.length + ' origins (' + indo.filter(function (o) { return o.species === 'arabica'; }).length + ' arabica · ' + indo.filter(function (o) { return o.species === 'robusta'; }).length + ' robusta)'),
        el('select', { id: 'o-isl', value: q.island, style: 'width:auto', onchange: function (e) { q.island = e.target.value; render(); } }, opt('', 'All islands'), islands.map(function (i) { return opt(i, i + ' (' + indo.filter(function (o) { return islandOf(o) === i; }).length + ')'); })),
        el('label', { class: 'row tight small' }, el('input', { type: 'checkbox', id: 'o-gi', checked: q.gi, onchange: function (e) { q.gi = e.target.checked; render(); } }), 'GI protected only'),
        el('label', { class: 'row tight small' }, el('input', { type: 'checkbox', id: 'o-new', checked: q.onlyNew, onchange: function (e) { q.onlyNew = e.target.checked; render(); } }), 'Newly added (' + all.filter(function (o) { return o.isNew; }).length + ')')),
      el('div', { class: 'grid4 small muted' }, PROCS.map(function (p) { return el('span', null, el('b', null, procLabel(p) + ': '), E.PROCESSES[p].note); })),
      list.length ? Object.keys(groups).sort(function (a, b) { return a === 'Indonesia' ? -1 : b === 'Indonesia' ? 1 : a.localeCompare(b); }).map(function (c) {
        return el('section', { class: 'card' }, el('div', { class: 'row' }, el('h3', null, c), el('span', { class: 'muted small mono' }, groups[c].length)),
          el('div', { class: 'tablewrap' }, el('table', { class: 'origins' },
            el('thead', null, el('tr', null, el('th', null, 'Region'), PROCS.map(function (p) { return el('th', null, procLabel(p)); }), el('th', null, ''))),
            el('tbody', null, groups[c].map(function (o) {
              return el('tr', null,
                el('td', { class: 'origin-cell' }, el('div', { class: 'row tight' }, el('b', null, o.region), speciesBadge(o.species),
                    o.gi ? el('span', { class: 'badge gi', title: 'Geographical Indication (Indikasi Geografis)' }, o.gi) : null, o.isNew ? el('span', { class: 'badge new' }, 'New') : null),
                  el('div', { class: 'oi' }, el('span', { class: 'mono' }, o.altitude), o.varietals ? el('span', null, 'Varietals: ' + o.varietals) : null, islandOf(o) ? el('span', null, islandOf(o)) : null),
                  noteChips(o.notes)),
                PROCS.map(function (p) { return procCell(o, p); }),
                el('td', null, el('div', { class: 'stack', style: 'gap:6px' },
                  el('button', { class: 'btn', type: 'button', onclick: function () { state.beanForm = blankBeanForm(o.id); go('beans'); } }, 'Add as my bean'),
                  el('button', { class: 'btn ghost', type: 'button', onclick: function () {
                    sim.rows = sim.rows.filter(function (r) { return !/^Example/.test(r.name || ''); });
                    if (sim.rows.length >= 5) { toast('The mix already has 5 beans.', true); return; }
                    sim.rows.push(quickRow(o.region, o.id, 3, o.notes)); clearMix(); saveSimDraft(); go('simulator');
                  } }, 'Try in simulator'))));
            })))));
      }) : el('div', { class: 'empty' }, el('p', null, 'No origins match. Clear the search or filters.')));
  }

  // ---------------- Settings ----------------
  function rulesProblem(d) {
    function okNum(v) { return typeof v === 'number' && isFinite(v); }
    var caps = Object.keys(E.BREWS);
    for (var i = 0; i < caps.length; i++) if (!okNum(d.robustaCap[caps[i]]) || d.robustaCap[caps[i]] < 0 || d.robustaCap[caps[i]] > 100) return 'Robusta max for ' + E.BREWS[caps[i]].label + ' must be a number from 0 to 100.';
    if (!okNum(d.minPct) || d.minPct < 0 || d.minPct > 20) return 'Min share per bean must be a number from 0 to 20.';
    if (!okNum(d.roastSpreadWarn) || d.roastSpreadWarn < 0 || d.roastSpreadWarn > 4) return 'The roast-difference warning must be a number from 0 to 4.';
    if (!okNum(d.libericaWarnPct) || d.libericaWarnPct < 0 || d.libericaWarnPct > 100) return 'The liberica/excelsa warning must be a number from 0 to 100.';
    if (!okNum(d.maskRatio) || d.maskRatio < 1) return 'Masking ratio must be 1 or more.';
    var t = d.tiers;
    if (!okNum(t.dominant) || !okNum(t.supporting) || !okNum(t.faint)) return 'Fill in all three note thresholds.';
    if (!(t.faint > 0 && t.supporting > t.faint && t.dominant > t.supporting)) return 'Note thresholds must go up: Faint above 0, Supporting above Faint, Dominant above Supporting.';
    return null;
  }
  function viewPrefs() {
    var R = rules();
    var draft = state.rulesDraft = state.rulesDraft || JSON.parse(JSON.stringify({ robustaCap: R.robustaCap, minPct: R.minPct, roastSpreadWarn: R.roastSpreadWarn, libericaWarnPct: R.libericaWarnPct, tiers: R.tiers, maskRatio: R.maskRatio }));
    // An emptied box is stored as NaN so Save can refuse it, instead of silently keeping the old number.
    function num(id, val, set, attrs) { return el('input', Object.assign({ type: 'number', id: id, value: val, oninput: function (e) { var t = e.target.value.trim(); set(t === '' ? NaN : Number(t)); } }, attrs || {})); }
    var parts = [el('h2', null, 'Settings')];
    parts.push(el('section', { class: 'card', 'aria-labelledby': 'rl-h' },
      el('h3', { id: 'rl-h' }, 'Blending rules'),
      el('div', { class: 'grid4' }, Object.keys(E.BREWS).map(function (k) { return field('Robusta max % · ' + E.BREWS[k].label.replace(' (with milk)', ''), num('rc-' + k, draft.robustaCap[k], function (v) { draft.robustaCap[k] = v; }, { min: 0, max: 100 })); })),
      el('div', { class: 'grid4' },
        field('Min share per bean (%)', num('r-min', draft.minPct, function (v) { draft.minPct = v; }, { min: 0, max: 20 })),
        field('Warn when roast levels differ by more than', num('r-spread', draft.roastSpreadWarn, function (v) { draft.roastSpreadWarn = v; }, { min: 0, max: 4 })),
        field('Warn when liberica/excelsa is above (%)', num('r-lib', draft.libericaWarnPct, function (v) { draft.libericaWarnPct = v; }, { min: 0, max: 100 })),
        field('Masking ratio (bold vs delicate)', num('r-mask', draft.maskRatio, function (v) { draft.maskRatio = v; }, { min: 1, max: 10, step: 0.5 }))),
      el('div', { class: 'grid4' },
        field('Dominant from', num('t-dom', draft.tiers.dominant, function (v) { draft.tiers.dominant = v; }, { step: 0.01, min: 0 })),
        field('Supporting from', num('t-sup', draft.tiers.supporting, function (v) { draft.tiers.supporting = v; }, { step: 0.01, min: 0 })),
        field('Faint from', num('t-faint', draft.tiers.faint, function (v) { draft.tiers.faint = v; }, { step: 0.01, min: 0 }))),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var bad = rulesProblem(draft);
          if (bad) { toast(bad, true); return; }
          try { await saveSettings({ rules: draft }); state.rulesDraft = null; toast('Rules saved.'); } catch (e) { /* shown */ }
        } }, 'Save rules'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async function () { try { await saveSettings({ rules: {} }); state.rulesDraft = null; toast('Rules reset to defaults.'); } catch (e) { /* shown */ } } }, 'Reset to defaults'))));
    parts.push(cloudCard(), sourcingCard(), tuneCard(), presetsCard(), notesWordsCard(), originsCard(), backupCard());
    parts.push(el('section', { class: 'card', 'aria-labelledby': 'md-h' },
      el('h3', { id: 'md-h' }, 'How the simulator thinks'),
      el('ul', { class: 'reasons small' },
        el('li', null, 'It tries every whole-percent ratio (about 1,5 million for 5 beans) and keeps the ones closest to your target as served.'),
        el('li', null, 'Robusta pulls body and bitterness about 2× harder than its share, and liberica and excelsa about 1,4×. Darker roasts pull harder too, up to 1,3× at roast 5.'),
        el('li', null, 'Process shifts the starting scores. Full wash adds acidity and clarity, semi wash (giling basah) adds body and lowers acidity, natural adds sweetness and body.'),
        el('li', null, 'Bitterness above 3 hides acidity, and above 3,5 it hides sweetness. Sweet aromas (caramel, palm sugar, vanilla) lift perceived sweetness and bright fruit lifts perceived acidity, by up to 0,3 each.'),
        el('li', null, 'Milk (kopi susu) takes 1 point off acidity and mutes delicate notes. Espresso adds body and bitterness. Tubruk adds body.'),
        el('li', null, 'Bag notes are weighted by share, intensity, roast, brew and what your cuppings taught it. A delicate note is likely lost when bold notes are 3× stronger.'),
        el('li', null, 'When several mixes hit your target, it prefers a clean verdict, better balance (pairings that work, no clashes, no single note drowning the rest) and ratios that still hold if your weighing is off by 2%.'),
        el('li', null, 'Cupping entries correct each bean\'s scores by half the error, in proportion to its share, and make bag notes stronger or weaker based on what you tasted. It\'s a planning model, so always confirm at the cupping table.'))));
    return el('div', { class: 'stack' }, parts);
  }
  function cloudCard() {
    var C = state.cloud;
    if (!C) return null;
    var f = state.cloudForm = state.cloudForm || { email: '', password: '' };
    async function doAuth(kind) {
      if (!f.email.trim() || f.password.length < 6) { toast('Enter your email and a password of at least 6 characters.', true); return; }
      C.busy = true; C.msg = ''; render();
      try {
        var r = kind === 'up'
          ? await cloudClient.auth.signUp({ email: f.email.trim(), password: f.password, options: { emailRedirectTo: location.origin + location.pathname } })
          : await cloudClient.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (r.error) throw r.error;
        if (kind === 'up' && !r.data.session) C.msg = 'Account created. Open the confirmation email and tap the link. It may open an unrelated or blank page; that\'s fine. Then come back here and sign in.';
        f.password = '';
      } catch (e) { C.msg = cloudErr(e); }
      C.busy = false; render();
    }
    var body;
    if (C.status === 'signed-in') {
      body = [el('p', { class: 'small' }, 'Signed in as ', el('b', null, C.email), '. Your beans, blends, batches, cuppings and settings sync between devices.'),
        C.lastSync ? el('p', { class: 'muted small' }, 'Last synced ' + new Date(C.lastSync).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '.') : null,
        el('div', { class: 'row' },
          el('button', { class: 'btn', type: 'button', onclick: async function () { await cloudFlush(); await cloudRefresh(); toast('Synced.'); } }, 'Sync now'),
          state.confirm === 'signout'
            ? el('span', { class: 'row tight' },
              el('span', { class: 'small' }, Object.keys(cloudPending).length + ' change(s) haven\'t reached the cloud. They stay on this device and sync the next time you sign in with this account.'),
              el('button', { class: 'btn danger', type: 'button', onclick: async function () { state.confirm = null; await cloudClient.auth.signOut(); } }, 'Sign out anyway'),
              el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.confirm = null; render(); } }, 'Stay signed in'))
            : el('button', { class: 'btn ghost', type: 'button', onclick: async function () {
              if (Object.keys(cloudPending).length) { await cloudFlush(); }
              if (Object.keys(cloudPending).length) { state.confirm = 'signout'; render(); return; }
              await cloudClient.auth.signOut();
            } }, 'Sign out'))];
    } else if (C.status === 'conflict') {
      var n = function (src) { return COLS.map(function (c) { return src[c].length + ' ' + c; }).join(', '); };
      body = [el('p', { class: 'small' }, 'Both this device and your cloud account already have data.'),
        el('p', { class: 'small muted' }, 'This device: ' + n(state) + '. Cloud: ' + n(C.conflict) + '.'),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'button', disabled: C.busy, onclick: function () { resolveConflict('merge'); } }, 'Merge this device into the cloud'),
          el('button', { class: 'btn', type: 'button', disabled: C.busy, onclick: function () { resolveConflict('cloud'); } }, 'Use the cloud data only'))];
    } else {
      body = [el('p', { class: 'small' }, 'Sign in to keep the same beans, blends and cuppings on your phone and laptop. Data is stored in your own Supabase project and only your account can read it.'),
        el('div', { class: 'grid2' },
          field('Email', el('input', { type: 'email', id: 'cl-email', autocomplete: 'email', value: f.email, oninput: function (e) { f.email = e.target.value; } })),
          field('Password', el('input', { type: 'password', id: 'cl-pass', autocomplete: 'current-password', value: f.password, oninput: function (e) { f.password = e.target.value; } }))),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'button', disabled: C.busy || C.status === 'connecting', onclick: function () { doAuth('in'); } }, C.status === 'connecting' ? 'Connecting…' : 'Sign in'),
          el('button', { class: 'btn', type: 'button', disabled: C.busy, onclick: function () { doAuth('up'); } }, 'Create account')),
        el('p', { class: 'muted small' }, 'First time? Press Create account using the same email as your Supabase account (the free email service only sends confirmation emails there). Only one account can own this sync space: the first one to sign in.')];
    }
    return el('section', { class: 'card', 'aria-labelledby': 'cl-h', id: 'cloud' },
      el('h3', { id: 'cl-h' }, 'Cloud sync'), body, C.msg ? el('p', { class: 'small' }, C.msg) : null);
  }
  function sourcingCard() {
    var all = Array.from(new Set(origins().map(function (o) { return o.country; }))).sort(function (a, b) { return a === 'Indonesia' ? -1 : b === 'Indonesia' ? 1 : a.localeCompare(b); });
    var cur = state.settings.sourceCountries || [];
    var d = state.srcDraft = state.srcDraft || cur.slice();
    var counts = {}; origins().forEach(function (o) { counts[o.country] = (counts[o.country] || 0) + 1; });
    var SEA = ['Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Malaysia', 'Laos', 'Myanmar', 'Timor-Leste'];
    function set(list) { state.srcDraft = list.slice(); render(); }
    return el('section', { class: 'card', 'aria-labelledby': 'sc-h' },
      el('h3', { id: 'sc-h' }, 'Countries I can source from'),
      el('p', { class: 'muted small' }, 'The bean picker and substitute finder only suggest catalogue origins from these countries. Your saved beans are always included. Leave everything unticked to allow all countries.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { set(['Indonesia']); } }, 'Indonesia only'),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { set(SEA.filter(function (c) { return all.indexOf(c) >= 0; })); } }, 'Southeast Asia'),
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { set([]); } }, 'All countries')),
      el('div', { class: 'chips' }, all.map(function (c) {
        var on = d.indexOf(c) >= 0;
        return el('label', { class: 'chip', style: on ? 'background:var(--accent-soft);color:var(--accent)' : null },
          el('input', { type: 'checkbox', id: 'src-' + E.slug(c), checked: on, onchange: function (e) {
            var i = d.indexOf(c); if (e.target.checked && i < 0) d.push(c); if (!e.target.checked && i >= 0) d.splice(i, 1); render();
          } }), c + ' ', el('i', null, counts[c]));
      })),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          try { await saveSettings({ sourceCountries: d.slice() }); state.srcDraft = null; pickRes = null; toast(d.length ? 'Sourcing limited to ' + d.length + ' countr' + (d.length > 1 ? 'ies' : 'y') + '.' : 'All countries allowed.'); } catch (e) { /* shown */ }
        } }, 'Save countries'),
        el('span', { class: 'muted small' }, d.length ? d.length + ' selected' : 'All countries')));
  }
  function tuneSamples() {
    return state.cuppings.map(function (c) {
      if (!c.actual || !Object.keys(c.actual).length || !c.items || !c.items.length) return null;
      var bs = c.items.map(function (it) { return it.beanId ? beanById(it.beanId) : null; });
      if (bs.some(function (b) { return !b; })) return null;
      return { beans: bs.map(savedBean), pcts: c.items.map(function (it) { return it.pct; }), brew: c.brew, actual: c.actual };
    }).filter(Boolean);
  }
  function tuneCard() {
    var samples = tuneSamples();
    var fit = E.fitBrewBias(samples, rulesNoBias());
    var cur = state.settings.brewBias || {};
    var brews = Object.keys(E.BREWS).filter(function (b) { return fit.counts[b] || cur[b]; });
    function cell(map, b, a) { var v = map[b] && map[b][a]; return v ? (v > 0 ? '+' : '') + nf(v, 2) : '0'; }
    var changed = JSON.stringify(fit.bias) !== JSON.stringify(cur);
    return el('section', { class: 'card', 'aria-labelledby': 'tu-h' },
      el('h3', { id: 'tu-h' }, 'Auto-tune from my cuppings'),
      el('p', { class: 'muted small' }, 'Compares what you tasted with what the simulator predicted, per way of serving, and corrects its rules for your palate (for example: "with my milk, acidity drops more than expected"). It uses only cuppings of saved beans, needs at least 2 per style, starts cautious and caps each correction at ±1. Bean-by-bean learning you already applied is taken into account, so nothing is counted twice.'),
      !samples.length ? el('p', { class: 'small' }, 'No usable cupping logs yet. Log cuppings of saved beans in the Cupping log first.') :
        el('div', { class: 'tablewrap' }, el('table', null,
          el('thead', null, el('tr', null, el('th', null, 'Served as'), el('th', { class: 'num' }, 'Cuppings'), ATTRS.map(function (a) { return el('th', { class: 'num' }, AL[a] + ' now → new'); }))),
          el('tbody', null, brews.map(function (b) {
            return el('tr', null, el('td', null, BREW_SHORT[b] || b), el('td', { class: 'num mono' }, fit.counts[b] || 0),
              ATTRS.map(function (a) { return el('td', { class: 'num mono' }, cell(cur, b, a) + ' → ' + cell(fit.bias, b, a)); }));
          })))),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', disabled: !samples.length || !changed, onclick: async function () {
          try { await saveSettings({ brewBias: fit.bias }); toast('Auto-tune applied. Predictions now include your palate corrections.'); } catch (e) { /* shown */ }
        } }, 'Apply auto-tune'),
        Object.keys(cur).length ? el('button', { class: 'btn ghost', type: 'button', onclick: async function () {
          try { await saveSettings({ brewBias: {} }); toast('Auto-tune reset to the standard rules.'); } catch (e) { /* shown */ }
        } }, 'Reset to standard rules') : null));
  }
  function presetsCard() {
    var mine = state.settings.customPresets || [];
    return el('section', { class: 'card', 'aria-labelledby': 'ps-h' },
      el('h3', { id: 'ps-h' }, 'My styles'),
      el('p', { class: 'muted small' }, 'Targets you saved from the simulator with "Save as my style".'),
      mine.length ? el('div', { class: 'list' }, mine.map(function (p) {
        return el('div', { class: 'row' }, el('b', null, p.name), el('span', { class: 'muted small' }, (E.BREWS[p.brew] || E.BREWS.filter).label + (p.must ? ' · must taste ' + p.must : '')), el('span', { class: 'spacer' }),
          el('button', { class: 'btn ghost', type: 'button', onclick: function () { applyPreset(p.id); go('simulator'); } }, 'Use'),
          el('button', { class: 'btn ghost danger', type: 'button', onclick: async function () { try { await saveSettings({ customPresets: mine.filter(function (x) { return x.id !== p.id; }) }); } catch (e) { /* shown */ } } }, 'Remove'));
      })) : el('p', { class: 'small muted' }, 'None yet.'));
  }
  function notesWordsCard() {
    var cn = state.settings.customNotes || {};
    return el('section', { class: 'card', 'aria-labelledby': 'cn-h' },
      el('h3', { id: 'cn-h' }, 'My note words'),
      el('p', { class: 'muted small' }, 'Words from bag labels that the tool didn\'t recognise, mapped to a flavour wheel family. Tap any unrecognised word (shown with a ?) to add it.'),
      Object.keys(cn).length ? el('div', { class: 'list' }, Object.keys(cn).map(function (w) {
        return el('div', { class: 'row' }, el('b', null, w), el('span', { class: 'muted small' }, LEX.families[cn[w].family] ? LEX.families[cn[w].family].label + ' · ' + cn[w].intensity : cn[w].family),
          el('span', { class: 'spacer' }), el('button', { class: 'btn ghost danger', type: 'button', onclick: async function () {
            var next = Object.assign({}, cn); delete next[w];
            try { await saveSettings({ customNotes: next }); } catch (e) { /* shown */ }
          } }, 'Remove'));
      })) : el('p', { class: 'small muted' }, 'None yet.'),
      el('button', { class: 'btn', type: 'button', onclick: function () { openMapper(''); } }, '+ Add a word'));
  }
  function originsCard() {
    var mine = state.settings.customOrigins || [];
    var f = state.originForm;
    return el('section', { class: 'card', 'aria-labelledby': 'og-h' },
      el('h3', { id: 'og-h' }, 'My origins'),
      el('p', { class: 'muted small' }, 'Add a farm, region or lot that isn\'t in the catalogue. It then appears in every origin list and in the bean picker.'),
      mine.length ? el('div', { class: 'list' }, mine.map(function (o) {
        return el('div', { class: 'row' }, el('b', null, o.region), el('span', { class: 'muted small' }, o.country + ' · ' + o.species + ' · ' + o.process), el('span', { class: 'spacer' }),
          el('button', { class: 'btn ghost danger', type: 'button', onclick: async function () { try { await saveSettings({ customOrigins: mine.filter(function (x) { return x.id !== o.id; }) }); } catch (e) { /* shown */ } } }, 'Remove'));
      })) : null,
      f ? el('div', { class: 'stack' },
        el('div', { class: 'grid2' },
          field('Country', el('input', { type: 'text', id: 'og-country', value: f.country, oninput: function (e) { f.country = e.target.value; } })),
          field('Region or farm', el('input', { type: 'text', id: 'og-region', value: f.region, oninput: function (e) { f.region = e.target.value; } }))),
        el('div', { class: 'grid4' },
          field('Species', el('select', { id: 'og-sp', value: f.species, onchange: function (e) { f.species = e.target.value; } }, SPECIES.map(function (s) { return opt(s, s); }))),
          field('Main process', processSelect('og-proc', f.proc, function (e) { f.proc = e.target.value; })),
          field('Altitude', el('input', { type: 'text', id: 'og-alt', value: f.altitude, placeholder: 'e.g. 1.300–1.600 m', oninput: function (e) { f.altitude = e.target.value; } }))),
        el('div', { class: 'grid4' }, ATTRS.map(function (a) { return field(AL[a] + ' (1–5)', el('input', { type: 'number', id: 'og-' + a, min: 1, max: 5, step: 0.5, value: f.scores[a], oninput: function (e) { var v = Number(e.target.value); if (v >= 1 && v <= 5) f.scores[a] = v; } })); })),
        field('Typical notes', el('input', { type: 'text', id: 'og-notes', value: f.notes, oninput: function (e) { f.notes = e.target.value; } })),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'button', onclick: async function () {
            if (!f.region.trim() || !f.country.trim()) { toast('Fill in the country and region.', true); return; }
            var procText = { full: 'Washed', semi: 'Wet-hulled', natural: 'Natural' }[f.proc];
            var o = { id: 'my-' + E.slug(f.region) + '-' + Date.now().toString(36), country: f.country.trim(), region: f.region.trim(), species: f.species, process: procText, altitude: f.altitude || '', scores: f.scores, notes: f.notes || '' };
            try { await saveSettings({ customOrigins: mine.concat([o]) }); state.originForm = null; toast('Added ' + o.region + '.'); } catch (e) { /* shown */ }
          } }, 'Save origin'),
          el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.originForm = null; render(); } }, 'Cancel')))
        : el('button', { class: 'btn', type: 'button', onclick: function () { state.originForm = { country: 'Indonesia', region: '', species: 'arabica', proc: 'full', altitude: '', scores: { body: 3, acidity: 3, sweetness: 3, bitterness: 2.5 }, notes: '' }; render(); } }, '+ Add an origin'));
  }
  function mapperCard() {
    var m = state.mapper;
    return el('section', { class: 'card', 'aria-labelledby': 'mp-h', style: 'border-color:var(--accent);margin-bottom:14px' },
      el('h3', { id: 'mp-h' }, m.word ? 'What is "' + m.word + '"?' : 'Add a note word'),
      el('div', { class: 'grid4' },
        field('Word', el('input', { type: 'text', id: 'mp-word', value: m.word, oninput: function (e) { m.word = e.target.value; } })),
        field('Flavour wheel family', el('select', { id: 'mp-fam', value: m.family, onchange: function (e) { m.family = e.target.value; } }, Object.keys(LEX.families).map(function (f) { return opt(f, LEX.families[f].label); }))),
        field('Intensity', el('select', { id: 'mp-int', value: m.intensity, onchange: function (e) { m.intensity = e.target.value; } }, ['delicate', 'medium', 'bold'].map(function (i) { return opt(i, i); })))),
      m.suggestion ? el('p', { class: 'small' }, 'Assistant suggests: ' + m.suggestion) : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var w = (m.word || '').trim().toLowerCase();
          if (!w) { toast('Type the word first.', true); return; }
          var next = Object.assign({}, state.settings.customNotes || {});
          next[w] = { family: m.family, sub: m.family, intensity: m.intensity };
          try { await saveSettings({ customNotes: next }); state.mapper = null; toast('"' + w + '" is now recognised.'); render(); } catch (e) { /* shown */ }
        } }, 'Save word'),
        state.sample && !state.aiHidden && m.word ? el('button', { class: 'btn', type: 'button', disabled: m.busy, onclick: async function () {
          m.busy = true; render();
          try {
            var res = await state.sample.json('A coffee bag label lists the tasting note "' + m.word + '" (it may be Indonesian or English). Classify it on the SCA Coffee Taster\'s Flavor Wheel. Reply with only JSON like {"family":"fruity","intensity":"medium","meaning":"jackfruit"} where family is one of ' + Object.keys(LEX.families).join(', ') + ' and intensity is delicate, medium or bold.', { modelTier: 'quick' });
            if (res && LEX.families[res.family]) { m.family = res.family; if (['delicate', 'medium', 'bold'].indexOf(res.intensity) >= 0) m.intensity = res.intensity; m.suggestion = LEX.families[res.family].label + ', ' + m.intensity + (res.meaning ? ' (' + String(res.meaning).slice(0, 60) + ')' : '') + '. Check it, then save.'; }
            else m.suggestion = 'No clear answer. Pick the family yourself.';
          } catch (e) { m.suggestion = aiError(e && e.code) || 'No answer.'; }
          m.busy = false; render();
        } }, m.busy ? 'Asking…' : 'Ask the assistant') : null,
        el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.mapper = null; render(); } }, 'Cancel')));
  }
  function backupCard() {
    var imp = state.importPreview;
    return el('section', { class: 'card', 'aria-labelledby': 'bk-h' },
      el('h3', { id: 'bk-h' }, 'Backup'),
      el('p', { class: 'muted small' }, 'Save a copy of your beans, blends, batches, cupping log and settings as a file, or bring one back.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', onclick: async function () {
          var data = { app: 'ratio-decider', version: 2, exportedAt: new Date().toISOString(), beans: state.beans, blends: state.blends, batches: state.batches, cuppings: state.cuppings, settings: state.settings };
          if (await saveFile('ratio-decider-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2))) toast('Backup saved.');
        } }, 'Download backup'),
        el('label', { class: 'btn' }, 'Restore from file', el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: function (e) {
          var file = e.target.files && e.target.files[0];
          e.target.value = ''; // so picking the same file again still triggers a change
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              var d = JSON.parse(reader.result);
              if (!d || d.app !== 'ratio-decider') throw new Error('not a backup');
              state.importPreview = d; render();
            } catch (err) { toast('That file isn\'t a Ratio Decider backup.', true); }
          };
          reader.readAsText(file);
        } }))),
      imp ? el('div', { class: 'stack', style: 'gap:8px' },
        el('p', { class: 'small' }, 'Restore ' + (imp.beans || []).length + ' beans, ' + (imp.blends || []).length + ' blends, ' + (imp.batches || []).length + ' batches and ' + (imp.cuppings || []).length + ' cupping entries? Items with the same ID are replaced; everything else stays.'),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var d = state.importPreview; state.importPreview = null;
            try { await restoreBackup(d); toast('Backup restored.'); } catch (e) { /* shown */ }
            render();
          } }, 'Restore'),
          el('button', { class: 'btn ghost', type: 'button', onclick: function () { state.importPreview = null; render(); } }, 'Cancel'))) : null);
  }

  // ---------------- boot ----------------
  state.route = routeFromHash();
  render();
  setTimeout(function () { if (!sim.result && simReady()) runSolve(); }, 60);
  initStore().then(render, function () { state.mode = 'memory'; render(); });
})();
