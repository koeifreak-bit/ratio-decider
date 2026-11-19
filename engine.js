/* The Ratio Decider: pure engine (no DOM). Source of truth for formulas: SPEC.md v5, D2–D11. */
(function (root) {
  'use strict';

  var ATTRS = ['body', 'acidity', 'sweetness', 'bitterness'];
  var TARGET_ATTRS = ['body', 'acidity', 'sweetness', 'bitterness', 'roast'];
  var ATTR_LABEL = { body: 'Body', acidity: 'Acidity', sweetness: 'Sweetness', bitterness: 'Bitterness', roast: 'Roast level' };

  var DEFAULTS = {
    minPct: 5,
    robustaCap: { filter: 10, espresso: 40, kopisusu: 100, tubruk: 100, flatwhite: 20, icedmilk: 30, coldbrew: 30, tonic: 10 },
    roastSpreadWarn: 2,
    libericaWarnPct: 30,
    tiers: { dominant: 0.35, supporting: 0.15, faint: 0.07 },
    maskRatio: 3,
    intensity: { delicate: 0.6, medium: 1.0, bold: 1.4 },
    speciesImpact: { arabica: 1, robusta: 2, liberica: 1.4, excelsa: 1.4 },
    roastImpact: [1, 0.9, 0.95, 1, 1.15, 1.3],
    acidMask: { from: 3, k: 0.4 },
    sweetMask: { from: 3.5, k: 0.2 },
    nudge: { sweet: 0.25, acid: 0.2, cap: 0.3 },
    notePenalty: 4,
    learnRate: 0.5,
    noteLearn: { down: 0.8, up: 1.25, min: 0.3, max: 2 },
    robustStep: 2,
    cupping: { sampleG: 60, cups: 5, doseG: 8.25, waterMl: 150, waterC: 93 },
    brewBias: {}
  };

  var BREWS = {
    filter: { label: 'Filter', add: { body: 0, acidity: 0, sweetness: 0, bitterness: 0 } },
    espresso: { label: 'Espresso', add: { body: 0.5, acidity: 0.2, sweetness: 0, bitterness: 0.3 } },
    kopisusu: { label: 'Kopi susu (with milk)', add: { body: 0, acidity: -1, sweetness: 0.5, bitterness: -0.5 } },
    tubruk: { label: 'Tubruk', add: { body: 0.7, acidity: -0.3, sweetness: 0, bitterness: 0.3 } },
    flatwhite: { label: 'Flat white (milk espresso)', add: { body: 0.3, acidity: -0.5, sweetness: 0.5, bitterness: -0.2 } },
    icedmilk: { label: 'Iced milk (iced latte, es kopi susu)', add: { body: -0.3, acidity: -1.1, sweetness: 0.4, bitterness: -0.6 } },
    coldbrew: { label: 'Cold brew', add: { body: 0.2, acidity: -1.2, sweetness: 0.5, bitterness: -0.8 } },
    tonic: { label: 'Espresso tonic / orange', add: { body: -0.5, acidity: 0.3, sweetness: 0, bitterness: 0.6 } }
  };

  // Varietal tendencies, applied after process and before roast (small shifts on the 1–5 scale).
  var VARIETALS = {
    unknown: { label: 'Unknown / mixed', add: {} },
    typica: { label: 'Typica', add: { acidity: 0.1, sweetness: 0.1 } },
    bourbon: { label: 'Bourbon', add: { sweetness: 0.3 } },
    caturra: { label: 'Caturra', add: { acidity: 0.1 } },
    catuai: { label: 'Catuaí', add: {} },
    pacamara: { label: 'Pacamara', add: { body: 0.2, acidity: 0.2 } },
    gesha: { label: 'Gesha / Geisha', add: { body: -0.4, acidity: 0.4, sweetness: 0.3, bitterness: -0.2 } },
    sl28: { label: 'SL28', add: { body: 0.1, acidity: 0.5 } },
    sl34: { label: 'SL34', add: { body: 0.2, acidity: 0.3 } },
    landrace: { label: 'Ethiopian landrace (heirloom)', add: { body: -0.2, acidity: 0.3, sweetness: 0.2 } },
    pinkbourbon: { label: 'Pink Bourbon', add: { acidity: 0.3, sweetness: 0.3 } },
    castillo: { label: 'Castillo', add: {} },
    catimor: { label: 'Catimor', add: { body: 0.2, acidity: -0.2, sweetness: -0.2, bitterness: 0.2 } },
    ateng: { label: 'Ateng (Super / Jaluk)', add: { body: 0.2, acidity: -0.2, sweetness: -0.1, bitterness: 0.2 } },
    sigarar: { label: 'Sigarar Utang', add: { body: 0.2, acidity: 0.1 } },
    andungsari: { label: 'Andungsari', add: { body: 0.1, sweetness: 0.1 } },
    s795: { label: 'S795 (Lini S)', add: { body: 0.2, sweetness: 0.1 } },
    abyssinia: { label: 'Abyssinia', add: { acidity: 0.2, sweetness: 0.1 } }
  };

  // Roast colour (approximate Agtron ranges) for the 1–5 roast level.
  var ROAST_COLOURS = [null,
    { name: 'Light filter', agtron: '≈75–85' }, { name: 'Filter', agtron: '≈65–75' }, { name: 'Omni', agtron: '≈55–65' },
    { name: 'Espresso', agtron: '≈45–55' }, { name: 'Dark', agtron: '<45' }];

  // Acidity character (what kind of acidity, not how much).
  var ACID_TYPES = {
    citric: { label: 'Citric (bright: lemon, orange)', subs: ['citrus'], keys: ['citric-acidity'] },
    malic: { label: 'Malic (apple, pear, stone fruit)', subs: ['stone'], keys: ['apple', 'pear', 'malic'] },
    phosphoric: { label: 'Phosphoric (sparkling, Kenya-style)', subs: [], keys: ['blackcurrant', 'grapefruit', 'phosphoric', 'tomato'] },
    tartaric: { label: 'Tartaric (grape, wine)', subs: [], keys: ['grape', 'winey', 'raisin', 'tartaric'] },
    acetic: { label: 'Acetic (vinegar, a fault)', subs: [], keys: ['vinegar', 'overripe', 'fermented'] }
  };

  // Starting recipes per brew style (SCA-style norms; dial in on your own grinder and water).
  var WATER = 'SCA water guide (approximate): total dissolved solids about 150 mg/L (75–250), calcium hardness about 68 mg/L, alkalinity about 40 mg/L, pH about 7. Tap water in Singapore, Bangkok and Indonesian cities varies, so filter it and, if needed, remineralise to these targets.';

  // Ready-made targets for Indonesian coffee styles. Ranges are "as served".
  var PRESETS = [
    { id: 'kopisusu-aren', name: 'Kopi susu gula aren (house blend)', brew: 'kopisusu',
      ranges: { body: ['4', '5'], acidity: ['', '2.5'], sweetness: ['3', ''], bitterness: ['2.5', '4'], roast: ['3', '5'] }, must: 'chocolate', mustNot: 'sour' },
    { id: 'kopisusu-fruity', name: 'Kopi susu, modern and fruity', brew: 'kopisusu',
      ranges: { body: ['3.5', '4.5'], acidity: ['', '3'], sweetness: ['3.5', ''], bitterness: ['', '3'], roast: ['', '3.5'] }, must: 'caramel', mustNot: 'earthy' },
    { id: 'espresso-classic', name: 'Espresso, classic chocolate and nut', brew: 'espresso',
      ranges: { body: ['3.5', '4.5'], acidity: ['2', '3'], sweetness: ['3', ''], bitterness: ['', '3.5'], roast: ['3', '4'] }, must: 'chocolate, nutty', mustNot: '' },
    { id: 'espresso-bright', name: 'Espresso, bright and fruity', brew: 'espresso',
      ranges: { body: ['3', '4'], acidity: ['3', '4'], sweetness: ['3.5', ''], bitterness: ['', '3'], roast: ['', '3'] }, must: 'fruity', mustNot: 'smoky, earthy' },
    { id: 'manual-clean', name: 'Manual brew (V60), clean and bright', brew: 'filter',
      ranges: { body: ['2.5', '3.5'], acidity: ['3.5', ''], sweetness: ['3.5', ''], bitterness: ['', '2.5'], roast: ['', '3'] }, must: 'citrus', mustNot: 'earthy, smoky' },
    { id: 'tubruk-bold', name: 'Tubruk, bold and traditional', brew: 'tubruk',
      ranges: { body: ['4.5', ''], acidity: ['', '2'], sweetness: ['', ''], bitterness: ['3.5', ''], roast: ['4', ''] }, must: 'chocolate', mustNot: 'sour' },
    // High-end specialty café styles (region + specialty gate).
    { id: 'sg-omakase', region: 'SG', name: 'Singapore: light-roast pour-over (omakase filter)', brew: 'filter',
      ranges: { body: ['2.5', '3.5'], acidity: ['4', ''], sweetness: ['4', ''], bitterness: ['', '2'], roast: ['', '2'] }, must: 'floral, fruity', mustNot: 'earthy, smoky, roasted',
      specialty: { on: true, minScore: 86, arabicaOnly: true, robustaMax: 0, roastWindow: ['1', '2'], minBalance: 4, minComplexity: 3 } },
    { id: 'sg-flatwhite', region: 'SG', name: 'Singapore: flat white espresso', brew: 'flatwhite',
      ranges: { body: ['3.5', '4.5'], acidity: ['2', '3.5'], sweetness: ['4', ''], bitterness: ['', '2.5'], roast: ['2', '3.5'] }, must: 'chocolate, fruity', mustNot: 'earthy, smoky',
      specialty: { on: true, minScore: 84, arabicaOnly: true, robustaMax: 0, roastWindow: ['2', '3'], minBalance: 4, minComplexity: 3 } },
    { id: 'sg-icedwhite', region: 'SG', name: 'Singapore: iced white for the tropics', brew: 'icedmilk',
      ranges: { body: ['4', ''], acidity: ['', '3'], sweetness: ['4', ''], bitterness: ['', '3'], roast: ['2.5', '4'] }, must: 'chocolate', mustNot: 'earthy',
      specialty: { on: true, minScore: 84, arabicaOnly: true, robustaMax: 0, roastWindow: ['3', '4'], minBalance: 4, minComplexity: 2 } },
    { id: 'th-pourover', region: 'TH', name: 'Thailand: specialty single-origin pour-over (Doi Chang / Pangkhon style)', brew: 'filter',
      ranges: { body: ['3', '4'], acidity: ['3.5', ''], sweetness: ['4', ''], bitterness: ['', '2'], roast: ['', '2.5'] }, must: 'honey, stone fruit', mustNot: 'earthy, smoky',
      specialty: { on: true, minScore: 85, arabicaOnly: true, robustaMax: 0, roastWindow: ['1', '2'], minBalance: 4, minComplexity: 3 } },
    { id: 'th-tonic', region: 'TH', name: 'Thailand: espresso orange / espresso tonic', brew: 'tonic',
      ranges: { body: ['', ''], acidity: ['3.5', ''], sweetness: ['3.5', ''], bitterness: ['', '3.5'], roast: ['', '3'] }, must: 'citrus', mustNot: 'earthy, smoky',
      specialty: { on: true, minScore: 84, arabicaOnly: true, robustaMax: 0, roastWindow: ['1', '3'], minBalance: 3.5, minComplexity: 2 } },
    { id: 'th-icedlatte', region: 'TH', name: 'Thailand: premium iced latte', brew: 'icedmilk',
      ranges: { body: ['4', ''], acidity: ['', '3'], sweetness: ['4', ''], bitterness: ['', '3.5'], roast: ['3', '4'] }, must: 'caramel, chocolate', mustNot: 'earthy',
      specialty: { on: true, minScore: 83, arabicaOnly: false, robustaMax: 15, roastWindow: ['3', '4'], minBalance: 4, minComplexity: 2 } },
    { id: 'id-thirdwave', region: 'ID', name: 'Indonesia: Jakarta / Bali third-wave filter', brew: 'filter',
      ranges: { body: ['3', '4'], acidity: ['3.5', ''], sweetness: ['4', ''], bitterness: ['', '2'], roast: ['', '2'] }, must: 'fruity, sweet', mustNot: 'earthy, smoky',
      specialty: { on: true, minScore: 85, arabicaOnly: true, robustaMax: 0, roastWindow: ['1', '2'], minBalance: 4, minComplexity: 3 } },
    { id: 'id-premium-kopisusu', region: 'ID', name: 'Indonesia: premium es kopi susu (specialty grade)', brew: 'icedmilk',
      ranges: { body: ['4', ''], acidity: ['', '2.5'], sweetness: ['4', ''], bitterness: ['', '3.5'], roast: ['3', '4'] }, must: 'chocolate, caramel', mustNot: 'sour',
      specialty: { on: true, minScore: 83, arabicaOnly: false, robustaMax: 20, roastWindow: ['3', '4'], minBalance: 4, minComplexity: 2 } }
  ];

  // Flavour pairing knowledge (Q-grader rules). Groups are "family:<key>" or "sub:<key>".
  var PAIRINGS = {
    synergy: [
      ['sub:cocoa', 'sub:citrus', 'Chocolate and orange', 'Citrus brightens the chocolate, like a chocolate-orange bar.'],
      ['sub:cocoa', 'sub:nut', 'Chocolate and nut', 'A classic, crowd-pleasing base for espresso and kopi susu.'],
      ['sub:sugar', 'sub:nut', 'Praline', 'Caramel and nuts read as praline and sweeten the finish.'],
      ['sub:cocoa', 'sub:berry', 'Black forest', 'Berries over chocolate add depth without tasting sour.'],
      ['sub:sugar', 'sub:spice', 'Spiced sugar', 'Brown sugar and spice, like gula aren with rempah, is warm and long.'],
      ['sub:tropical', 'family:sweet', 'Ripe tropical', 'Sweetness makes tropical fruit taste ripe instead of tart.'],
      ['sub:tea', 'sub:citrus', 'Tea and citrus', 'Clean, tea-like clarity that suits manual brew.'],
      ['sub:dried', 'sub:cocoa', 'Fruit and nut', 'Dried fruit with chocolate gives a rum-raisin richness.'],
      ['sub:cocoa', 'sub:spice', 'Chocolate and spice', 'Spice lengthens a chocolate finish.'],
      ['sub:stone', 'sub:honey', 'Stone fruit and honey', 'Soft, juicy sweetness.']
    ],
    clash: [
      ['family:floral', 'sub:burnt', 'Smoke over flowers', 'Smoky notes flatten floral aromatics.'],
      ['family:floral', 'sub:earthy', 'Earth over flowers', 'Earthy notes muddy delicate florals.'],
      ['sub:citrus', 'sub:earthy', 'Citrus and earth', 'This pairing often reads as dirty or sour.'],
      ['sub:ferment', 'sub:earthy', 'Ferment and earth', 'Funky plus earthy can come across as a defect.'],
      ['family:green', 'family:fruity', 'Green and fruit', 'Vegetal notes make fruit taste under-ripe.'],
      ['sub:soured', 'sub:burnt', 'Sour and ashy', 'Sourness and burnt notes make each other harsher.']
    ]
  };

  // ---------- small helpers ----------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clampRoast(r) { var n = Math.round(Number(r)); return isFinite(n) ? clamp(n, 1, 5) : 3; }
  function round(v, dp) { var f = Math.pow(10, dp || 0); return Math.round(v * f) / f; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function fmt1(v) { return round(v, 1).toFixed(1).replace('.', ','); } // Indonesian decimal comma
  function joinAnd(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function withRules(overrides) {
    var o = overrides || {};
    var r = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var d = DEFAULTS[k];
      if (Array.isArray(d)) r[k] = d.slice();
      else if (d && typeof d === 'object') r[k] = Object.assign({}, d, o[k] || {});
      else r[k] = o[k] != null && isFinite(o[k]) ? Number(o[k]) : d;
    });
    return r;
  }
  function brewOf(b) { return BREWS[b] ? b : 'filter'; }

  // ---------- notes: lexicon index + parsing ----------
  function cleanPhraseKeep(p) { return lc(p).replace(/[.!?()\[\]"“”:*]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function cleanPhrase(p) {
    var s = cleanPhraseKeep(p);
    var prefix = /^(notes? of|hints? of|a hint of|touch of|a touch of|tones? of|sedikit|rasa|aroma|nuansa|catatan|some|a|an|light|subtle|slight|soft|ripe|fresh|juicy|sweet|candied|baked|stewed)\s+/;
    var guard = 0;
    while (prefix.test(s) && guard++ < 4) {
      var next = s.replace(prefix, '');
      if (!next) break;
      s = next;
    }
    return s;
  }

  function buildIndex(lex, customNotes) {
    var notes = {}, alias = {}, famAlias = {}, subAlias = {};
    function addAlias(a, key) { var k = cleanPhraseKeep(a); if (k && !(k in alias)) alias[k] = key; }
    lex.notes.forEach(function (row) {
      var key = slug(row[0]);
      notes[key] = { key: key, label: row[0], family: row[1], sub: row[2], intensity: row[3], defect: !!row[5] };
      addAlias(row[0], key);
      (row[4] || []).forEach(function (a) { addAlias(a, key); });
    });
    Object.keys(customNotes || {}).forEach(function (word) {
      var c = customNotes[word] || {};
      var w = cleanPhraseKeep(word);
      if (!w || !lex.families[c.family]) return;
      var key = 'custom-' + slug(w);
      notes[key] = { key: key, label: cap1(w), family: c.family, sub: c.sub || c.family, intensity: c.intensity || 'medium', defect: !!c.defect, custom: true };
      alias[w] = key;
    });
    Object.keys(lex.families).forEach(function (f) {
      lex.families[f].aliases.forEach(function (a) { famAlias[cleanPhraseKeep(a)] = f; });
      famAlias[cleanPhraseKeep(lex.families[f].label)] = f;
    });
    Object.keys(lex.subs).forEach(function (s) {
      var sub = lex.subs[s];
      sub.aliases.forEach(function (a) { subAlias[cleanPhraseKeep(a)] = s; });
      subAlias[cleanPhraseKeep(sub.label)] = s;
    });
    var aliasList = Object.keys(alias).sort(function (a, b) { return b.length - a.length; });
    var ignore = {};
    lex.ignore.forEach(function (w) { ignore[cleanPhraseKeep(w)] = true; });
    var ignoreList = Object.keys(ignore).sort(function (a, b) { return b.length - a.length; });
    return { lex: lex, notes: notes, alias: alias, aliasList: aliasList, famAlias: famAlias, subAlias: subAlias, ignore: ignore, ignoreList: ignoreList };
  }

  function isWordChar(c) { return !!c && /[a-z0-9À-ɏ]/.test(c); }
  function findWord(hay, needle, from) {
    var pos = hay.indexOf(needle, from || 0);
    while (pos >= 0) {
      if (!isWordChar(hay.charAt(pos - 1)) && !isWordChar(hay.charAt(pos + needle.length))) return pos;
      pos = hay.indexOf(needle, pos + 1);
    }
    return -1;
  }
  var SPLIT_RE = /[,;\/\n&+•·|]|\s-\s|\band\b|\bdan\b|\bwith\b|\bdengan\b|\bserta\b/;

  function parseNotes(text, index) {
    var known = [], unknown = [], ignored = [], seen = {};
    function add(key) { if (!seen[key]) { seen[key] = true; known.push(index.notes[key]); } }
    String(text || '').split(SPLIT_RE).forEach(function (raw) {
      if (raw == null) return;
      var original = raw.trim();
      var p = cleanPhrase(raw);
      if (!p) return;
      var full = cleanPhraseKeep(raw);
      if (index.alias[full]) { add(index.alias[full]); return; }
      if (index.alias[p]) { add(index.alias[p]); return; }
      if (index.ignore[full] || index.ignore[p]) { ignored.push(original); return; }
      var covered = [], matched = false;
      index.aliasList.forEach(function (a) {
        var from = 0, pos;
        while ((pos = findWord(p, a, from)) >= 0) {
          var end = pos + a.length;
          var overlap = covered.some(function (r) { return pos < r[1] && end > r[0]; });
          if (!overlap) { covered.push([pos, end]); add(index.alias[a]); matched = true; }
          from = end;
        }
      });
      if (matched) return;
      var isIgnorable = index.ignoreList.some(function (w) { return findWord(p, w, 0) >= 0; });
      if (isIgnorable) ignored.push(original); else unknown.push(original);
    });
    return { known: known, unknown: unknown, ignored: ignored };
  }

  function resolveTerm(term, index) {
    var t = cleanPhraseKeep(term);
    if (!t) return null;
    var am = /^acid:(\w+)$/.exec(String(term).trim().toLowerCase());
    if (am && ACID_TYPES[am[1]]) return { kind: 'acid', key: am[1], label: ACID_TYPES[am[1]].label.split(' (')[0] + ' acidity', term: term };
    if (index.famAlias[t]) { var f = index.famAlias[t]; return { kind: 'family', key: f, label: index.lex.families[f].label, term: term }; }
    if (index.subAlias[t]) { var s = index.subAlias[t]; return { kind: 'sub', key: s, label: index.lex.subs[s].label, term: term }; }
    if (index.alias[t]) { var n = index.notes[index.alias[t]]; return { kind: 'note', key: n.key, label: n.label, term: term }; }
    var parsed = parseNotes(t, index);
    if (parsed.known.length === 1 && !parsed.unknown.length) {
      var k = parsed.known[0];
      return { kind: 'note', key: k.key, label: k.label, term: term };
    }
    return null;
  }
  function acidMatches(type, note) {
    var a = ACID_TYPES[type];
    return !!a && (a.subs.indexOf(note.sub) >= 0 || a.keys.indexOf(note.key) >= 0);
  }
  function termMatches(rt, note) {
    if (rt.kind === 'acid') return acidMatches(rt.key, note);
    if (rt.kind === 'family') return note.family === rt.key;
    if (rt.kind === 'sub') return note.sub === rt.key;
    return note.key === rt.key;
  }
  function splitTerms(text) {
    return String(text || '').split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // ---------- taste model ----------
  function effScore(bean, a) {
    var base = bean.scores && bean.scores[a] != null && isFinite(bean.scores[a]) ? Number(bean.scores[a]) : 3;
    var off = bean.calib && bean.calib[a] ? Number(bean.calib[a]) : 0;
    return clamp(base + off, 1, 5);
  }
  function impact(bean, a, R) {
    if (a === 'body' || a === 'bitterness') return (R.speciesImpact[bean.species] || 1) * R.roastImpact[clampRoast(bean.roast)];
    return 1;
  }
  function scoresForRoast(scores, roast) {
    var d = clampRoast(roast) - 3;
    return {
      body: round(clamp(scores.body + 0.2 * d, 1, 5), 1),
      acidity: round(clamp(scores.acidity - 0.4 * d, 1, 5), 1),
      sweetness: round(clamp(scores.sweetness, 1, 5), 1),
      bitterness: round(clamp(scores.bitterness + 0.5 * d, 1, 5), 1)
    };
  }
  // Post-harvest process. Origin typical scores are for the origin's main process (the first one listed);
  // switching process shifts them by the difference between the two process effects (Q-grader tendencies).
  var PROCESSES = {
    full: { label: 'Full wash', short: 'Full', add: { body: -0.3, acidity: 0.4, sweetness: 0, bitterness: -0.1 },
      note: 'Clean and bright: more acidity and clarity, lighter body.' },
    semi: { label: 'Semi wash (giling basah)', short: 'Semi', add: { body: 0.5, acidity: -0.5, sweetness: 0, bitterness: 0.2 },
      note: 'Heavy and low in acidity, with earthy, herbal and spice tones (classic Sumatra and Sulawesi).' },
    natural: { label: 'Natural', short: 'Natural', add: { body: 0.3, acidity: -0.1, sweetness: 0.4, bitterness: 0 },
      note: 'Fruit-forward and sweet, with more body; can turn winey or fermented.' }
  };
  var PROCESS_KEYS = ['full', 'semi', 'natural'];
  function processOf(text) {
    var t = lc(text);
    if (/wet-hulled|giling|semi|honey|pulped/.test(t)) return 'semi';
    if (/natural|dry|monsoon/.test(t)) return 'natural';
    if (/wash/.test(t)) return 'full';
    return 'full';
  }
  function offeredProcesses(text) {
    var out = {};
    String(text || '').split(/[,;]/).forEach(function (p) { if (p.trim()) out[processOf(p)] = true; });
    return PROCESS_KEYS.filter(function (k) { return out[k]; });
  }
  function scoresForProcess(scores, fromP, toP) {
    var f = (PROCESSES[fromP] || PROCESSES.full).add, t = (PROCESSES[toP] || PROCESSES.full).add, out = {};
    ATTRS.forEach(function (a) { out[a] = round(clamp(Number(scores[a]) + t[a] - f[a], 1, 5), 1); });
    return out;
  }
  function scoresForVarietal(scores, varietal) {
    var add = (VARIETALS[varietal] || VARIETALS.unknown).add, out = {};
    ATTRS.forEach(function (a) { out[a] = round(clamp(Number(scores[a]) + (add[a] || 0), 1, 5), 1); });
    return out;
  }
  // Typical scores for an origin at a given roast level, process and varietal.
  function scoresFor(origin, roast, process, varietal) {
    var main = processOf(String(origin.process || '').split(/[,;]/)[0]);
    var s = scoresForProcess(origin.scores, main, process || main);
    if (varietal) s = scoresForVarietal(s, varietal);
    return scoresForRoast(s, roast == null ? 3 : roast);
  }

  function shares(beans, pcts, a, rules) {
    var R = rules || DEFAULTS;
    var w = beans.map(function (b, i) { return pcts[i] * impact(b, a, R); });
    var t = sum(w) || 1;
    return w.map(function (x) { return x / t; });
  }

  // ---------- note model ----------
  function roastFactor(family, roast) {
    var r = clampRoast(roast);
    if (family === 'fruity' || family === 'floral' || family === 'sour') return [1, 1, 1, 0.85, 0.6, 0.4][r];
    if (family === 'roasted') return [1, 0.6, 0.8, 1, 1.2, 1.4][r];
    return 1;
  }
  function speciesNoteFactor(species, family) {
    return species === 'robusta' && (family === 'roasted' || family === 'nutty' || family === 'other') ? 1.3 : 1;
  }
  function brewNoteFactor(brew, note) {
    brew = brewOf(brew);
    if (brew === 'espresso') return note.intensity === 'bold' ? 1.15 : 1;
    if (brew === 'kopisusu') {
      if (note.intensity === 'delicate') return 0.4;
      if (note.family === 'fruity' || note.family === 'floral' || note.family === 'sour') return 0.6;
      if (note.family === 'nutty' || note.family === 'sweet') return 1.1;
      return 1;
    }
    if (brew === 'tubruk') return note.family === 'roasted' ? 1.1 : 1;
    if (brew === 'flatwhite') {
      if (note.intensity === 'delicate') return 0.6;
      if (note.family === 'fruity' || note.family === 'floral' || note.family === 'sour') return 0.8;
      if (note.family === 'nutty' || note.family === 'sweet') return 1.1;
      return 1;
    }
    if (brew === 'icedmilk') {
      if (note.intensity === 'delicate') return 0.3;
      if (note.family === 'fruity' || note.family === 'floral' || note.family === 'sour') return 0.5;
      if (note.family === 'nutty' || note.family === 'sweet') return 1;
      if (note.family === 'roasted') return 0.9;
      return 0.85;
    }
    if (brew === 'coldbrew') {
      if (note.intensity === 'delicate') return 0.5;
      if (note.family === 'fruity' || note.family === 'floral') return 0.7;
      if (note.family === 'nutty' || note.family === 'sweet') return 1.1;
      if (note.family === 'roasted') return 0.8;
      return 1;
    }
    if (brew === 'tonic') {
      if (note.sub === 'citrus' || note.sub === 'berry') return 1.2;
      if (note.sub === 'earthy' || note.family === 'roasted') return 1.2;
      return 1;
    }
    return 1;
  }
  function noteLearned(bean, key) { var f = bean.noteCalib && bean.noteCalib[key]; return f > 0 ? f : 1; }
  function noteCoef(bean, note, brew, R) {
    return R.intensity[note.intensity] * roastFactor(note.family, bean.roast) * speciesNoteFactor(bean.species, note.family) * brewNoteFactor(brew, note) * noteLearned(bean, note.key);
  }
  // Aroma-driven perception: sweet aromatics raise perceived sweetness, bright fruit raises perceived acidity.
  function nudgeCoefs(bean, brew, R) {
    var s = 0, a = 0;
    (bean.notes || []).forEach(function (n) {
      var c = noteCoef(bean, n, brew, R);
      if (n.family === 'sweet') s += c * R.nudge.sweet;
      if (n.sub === 'citrus' || n.sub === 'berry' || n.sub === 'soured' || n.sub === 'acidtype') a += c * R.nudge.acid;
    });
    return [s, a];
  }
  function tierOf(s, R) {
    var t = (R || DEFAULTS).tiers;
    return s >= t.dominant ? 'dominant' : s >= t.supporting ? 'supporting' : s >= t.faint ? 'faint' : 'lost';
  }
  function simulateNotes(beans, pcts, brew, rules) {
    var R = rules || DEFAULTS;
    var map = {}, order = [];
    beans.forEach(function (b, i) {
      var share = pcts[i] / 100;
      if (!(share > 0)) return;
      (b.notes || []).forEach(function (n) {
        var s = share * noteCoef(b, n, brew, R);
        var cur = map[n.key];
        if (!cur) {
          cur = map[n.key] = { key: n.key, label: n.label, family: n.family, sub: n.sub, intensity: n.intensity, defect: !!n.defect, strength: 0, from: [] };
          order.push(n.key);
        }
        cur.strength += s;
        if (cur.from.indexOf(i) < 0) cur.from.push(i);
      });
    });
    var list = order.map(function (k) { return map[k]; });
    var boldTotal = 0;
    list.forEach(function (n) { if (n.intensity === 'bold') boldTotal += n.strength; });
    list.forEach(function (n) {
      n.strength = round(n.strength, 4);
      n.tier = tierOf(n.strength, R);
      n.masked = false;
      if (n.intensity === 'delicate' && n.strength < R.tiers.supporting && boldTotal >= R.maskRatio * n.strength) {
        n.masked = n.tier !== 'lost';
        n.tier = 'lost';
      }
    });
    list.sort(function (a, b) { return b.strength - a.strength; });
    var families = {}, groups = {};
    list.forEach(function (n) {
      if (n.tier === 'lost') return;
      families[n.family] = round((families[n.family] || 0) + n.strength, 4);
      groups[n.sub] = round((groups[n.sub] || 0) + n.strength, 4);
    });
    return { notes: list, families: families, groups: groups, summary: describeCup(list) };
  }
  function describeCup(list) {
    function by(t) { return list.filter(function (n) { return n.tier === t; }).map(function (n) { return n.label.toLowerCase(); }); }
    var D = by('dominant'), S = by('supporting'), F = by('faint'), L = by('lost');
    var parts = [];
    if (D.length) parts.push(joinAnd(D) + ' up front');
    if (S.length) parts.push(joinAnd(S) + ' in support');
    if (F.length) parts.push('a hint of ' + joinAnd(F));
    var s = parts.join(', ');
    if (L.length) s += (s ? '; ' : '') + joinAnd(L) + ' likely lost';
    return s ? cap1(s) + '.' : 'No recognised flavour notes yet.';
  }

  // ---------- pairing + cupping-form estimates ----------
  function groupStrength(sim, g) {
    var p = g.split(':');
    return p[0] === 'family' ? (sim.families[p[1]] || 0) : (sim.groups[p[1]] || 0);
  }
  function pairings(sim, rules) {
    var R = rules || DEFAULTS, faint = R.tiers.faint, sup = R.tiers.supporting;
    var syn = [], clash = [];
    PAIRINGS.synergy.forEach(function (p) {
      if (Math.min(groupStrength(sim, p[0]), groupStrength(sim, p[1])) >= faint) syn.push({ name: p[2], text: p[3] });
    });
    PAIRINGS.clash.forEach(function (p) {
      var m = Math.min(groupStrength(sim, p[0]), groupStrength(sim, p[1]));
      if (m >= faint) clash.push({ name: p[2], text: p[3], strong: m >= sup });
    });
    return { synergies: syn, clashes: clash };
  }
  function cupForm(values, sim, pair, rules) {
    var R = rules || DEFAULTS;
    var fams = Object.keys(sim.families);
    var famSup = fams.filter(function (f) { return sim.families[f] >= R.tiers.supporting; }).length;
    var famFaint = fams.length;
    var live = sim.notes.filter(function (n) { return n.tier !== 'lost'; });
    var total = 0, top = 0;
    live.forEach(function (n) { total += n.strength; if (n.strength > top) top = n.strength; });
    var dominance = total > 0 ? top / total : 0;
    var strong = pair.clashes.filter(function (c) { return c.strong; }).length;
    var weak = pair.clashes.length - strong;
    var balance = 5
      - 0.5 * Math.max(0, Math.abs(values.acidity - values.sweetness) - 1.5)
      - 0.6 * Math.max(0, values.bitterness - values.sweetness - 1)
      - 0.4 * Math.max(0, Math.abs(values.body - (values.acidity + values.sweetness) / 2) - 2)
      - (live.length > 1 ? 1.2 * Math.max(0, dominance - 0.6) : 0)
      - 0.6 * strong - 0.3 * weak + 0.2 * Math.min(2, pair.synergies.length);
    var complexity = live.length ? 1 + 0.6 * famSup + 0.2 * (famFaint - famSup) : 1;
    var depth = (sim.families.nutty || 0) + (sim.families.sweet || 0) + (sim.families.roasted || 0);
    var finish = 0.5 + 0.45 * (values.body - 1) + 0.35 * (values.sweetness - 1) - 0.4 * Math.max(0, values.bitterness - 3.5) + 0.6 * Math.min(1, depth / 1.5);
    return { balance: round(clamp(balance, 1, 5), 1), complexity: round(clamp(complexity, 1, 5), 1), finish: round(clamp(finish, 1, 5), 1) };
  }

  // ---------- mix evaluation context ----------
  function prepare(beans, target, opts) {
    opts = opts || {};
    var R = opts.rules || DEFAULTS;
    var brew = brewOf(opts.brew);
    var index = opts.index;
    var t = target || {};
    var ranges = {};
    TARGET_ATTRS.forEach(function (a) {
      var r = (t.ranges || {})[a] || [];
      var lo = r[0] == null || r[0] === '' || !isFinite(r[0]) ? null : Number(r[0]);
      var hi = r[1] == null || r[1] === '' || !isFinite(r[1]) ? null : Number(r[1]);
      if (lo != null && hi != null && lo > hi) { var x = lo; lo = hi; hi = x; }
      ranges[a] = [lo, hi];
    });
    var unresolved = [];
    function terms(list) {
      var out = [];
      (list || []).forEach(function (term) {
        var rt = index ? resolveTerm(term, index) : null;
        if (!rt) { unresolved.push(term); return; }
        rt.coef = beans.map(function (b) {
          var c = 0;
          (b.notes || []).forEach(function (n) { if (termMatches(rt, n)) c += noteCoef(b, n, brew, R); });
          return c;
        });
        out.push(rt);
      });
      return out;
    }
    var must = terms(t.must), mustNot = terms(t.mustNot);
    // High-end specialty gate: roast window narrows the roast range, robusta max narrows the cap.
    var sp = t.specialty && t.specialty.on ? t.specialty : null;
    var cap = R.robustaCap[brew] != null ? R.robustaCap[brew] : 100;
    var minScore = null;
    // Owner's own robusta limit for this blend (0 = arabica only), on top of the brew-style cap.
    var ownerCap = t.robustaMax != null && t.robustaMax !== '' && isFinite(t.robustaMax) ? Number(t.robustaMax) : null;
    if (ownerCap != null) cap = Math.min(cap, ownerCap);
    if (sp) {
      var rw = sp.roastWindow || [];
      var wlo = rw[0] === '' || rw[0] == null ? null : Number(rw[0]), whi = rw[1] === '' || rw[1] == null ? null : Number(rw[1]);
      if (wlo != null) ranges.roast[0] = ranges.roast[0] == null ? wlo : Math.max(ranges.roast[0], wlo);
      if (whi != null) ranges.roast[1] = ranges.roast[1] == null ? whi : Math.min(ranges.roast[1], whi);
      if (sp.robustaMax != null && sp.robustaMax !== '' && isFinite(sp.robustaMax)) cap = Math.min(cap, Number(sp.robustaMax));
      if (sp.minScore != null && sp.minScore !== '' && isFinite(sp.minScore)) minScore = Number(sp.minScore);
    }
    var cupScores = beans.map(function (b) { return b.cupScore != null && b.cupScore !== '' && isFinite(b.cupScore) ? Number(b.cupScore) : null; });
    var scoreKnown = beans.length > 0 && cupScores.every(function (s) { return s != null; });
    var w = {}, ws = {};
    ATTRS.forEach(function (a) {
      w[a] = beans.map(function (b) { return impact(b, a, R); });
      ws[a] = beans.map(function (b, i) { return w[a][i] * effScore(b, a); });
    });
    var nud = beans.map(function (b) { return nudgeCoefs(b, brew, R); });
    var mode = opts.mode || 'taste';
    var useIdx = mode === 'useup' ? Number(opts.useIdx) : -1;
    return {
      beans: beans, n: beans.length, R: R, brew: brew, ranges: ranges, must: must, mustNot: mustNot, unresolved: unresolved,
      w: w, ws: ws, nS: nud.map(function (x) { return x[0]; }), nA: nud.map(function (x) { return x[1]; }),
      roast: beans.map(function (b) { return clampRoast(b.roast); }),
      isRob: beans.map(function (b) { return b.species === 'robusta'; }),
      cap: cap, ownerCap: ownerCap, sp: sp, minScore: minScore, cupScores: cupScores, scoreKnown: scoreKnown,
      mode: mode, useIdx: useIdx, bagG: opts.bagG || 250,
      stock: beans.map(function (b) { return b.stockG != null && isFinite(b.stockG) ? Number(b.stockG) : null; })
    };
  }

  // Shared finishing step: base averages + aroma nudges + brew + masking + clamp.
  function finishValues(v, nS, nA, ctx) {
    var R = ctx.R, add = BREWS[ctx.brew].add;
    v.sweetness += Math.min(R.nudge.cap, nS);
    v.acidity += Math.min(R.nudge.cap, nA);
    // Brew effect + the owner's auto-tuned bias for this brew (learned from cupping logs).
    var bias = (R.brewBias && R.brewBias[ctx.brew]) || {};
    for (var k = 0; k < 4; k++) v[ATTRS[k]] += add[ATTRS[k]] + (Number(bias[ATTRS[k]]) || 0);
    var b = clamp(v.bitterness, 1, 5);
    if (b > R.acidMask.from) v.acidity -= R.acidMask.k * (b - R.acidMask.from);
    if (b > R.sweetMask.from) v.sweetness -= R.sweetMask.k * (b - R.sweetMask.from);
    for (k = 0; k < 4; k++) v[ATTRS[k]] = clamp(v[ATTRS[k]], 1, 5);
  }
  function modeKey(ctx, pcts) {
    if (ctx.mode === 'useup' && ctx.useIdx >= 0) return -pcts[ctx.useIdx];
    if (ctx.mode === 'stock') {
      var best = Infinity;
      for (var i = 0; i < ctx.n; i++) {
        if (!(pcts[i] > 0) || ctx.stock[i] == null) continue;
        var b = Math.floor(ctx.stock[i] * 100 / (ctx.bagG * pcts[i]));
        if (b < best) best = b;
      }
      return best === Infinity ? 0 : -best;
    }
    return 0;
  }
  function scoreInto(ctx, pcts, out) {
    var R = ctx.R, n = ctx.n, v = out.values, i, k;
    for (k = 0; k < 4; k++) {
      var a = ATTRS[k], num = 0, den = 0, wa = ctx.w[a], wsa = ctx.ws[a];
      for (i = 0; i < n; i++) { num += pcts[i] * wsa[i]; den += pcts[i] * wa[i]; }
      v[a] = den > 0 ? num / den : 3;
    }
    var nS = 0, nA = 0, rs = 0, tot = 0;
    for (i = 0; i < n; i++) { nS += pcts[i] / 100 * ctx.nS[i]; nA += pcts[i] / 100 * ctx.nA[i]; rs += pcts[i] * ctx.roast[i]; tot += pcts[i]; }
    finishValues(v, nS, nA, ctx);
    v.roast = rs / (tot || 100);
    var dist = 0, center = 0;
    for (k = 0; k < 5; k++) {
      var at = TARGET_ATTRS[k], rg = ctx.ranges[at], val = v[at];
      if (rg[0] != null && val < rg[0]) dist += rg[0] - val;
      if (rg[1] != null && val > rg[1]) dist += val - rg[1];
      if (rg[0] != null && rg[1] != null) center += Math.abs(val - (rg[0] + rg[1]) / 2);
    }
    var sup = R.tiers.supporting, pen = 0, j, s;
    for (j = 0; j < ctx.must.length; j++) {
      s = 0; for (i = 0; i < n; i++) s += pcts[i] / 100 * ctx.must[j].coef[i];
      if (s < sup) pen += (sup - s) * R.notePenalty;
    }
    for (j = 0; j < ctx.mustNot.length; j++) {
      s = 0; for (i = 0; i < n; i++) s += pcts[i] / 100 * ctx.mustNot[j].coef[i];
      if (s >= sup) pen += (s - sup + 0.01) * R.notePenalty;
    }
    if (ctx.minScore != null && ctx.scoreKnown) {
      s = 0; for (i = 0; i < n; i++) s += pcts[i] / 100 * ctx.cupScores[i];
      if (s < ctx.minScore) pen += (ctx.minScore - s) * 0.5;
    }
    var mx = 0, mn = 100;
    for (i = 0; i < n; i++) { if (pcts[i] > mx) mx = pcts[i]; if (pcts[i] < mn) mn = pcts[i]; }
    out.score = Math.round((dist + pen) * 1e6) / 1e6;
    out.center = Math.round(center * 1e6) / 1e6;
    out.spread = mx - mn;
    out.mode = modeKey(ctx, pcts);
    return out;
  }
  function compare(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    if (a.mode !== b.mode) return a.mode - b.mode;
    if (a.center !== b.center) return a.center - b.center;
    return a.spread - b.spread;
  }

  function profile(beans, pcts, brew, rules) {
    var ctx = prepare(beans, {}, { brew: brew, rules: rules || DEFAULTS });
    return scoreInto(ctx, pcts, { values: {} }).values;
  }

  function fmtRange(rg) {
    if (rg[0] != null && rg[1] != null) return rg[0] === rg[1] ? fmt1(rg[0]) : fmt1(rg[0]) + '–' + fmt1(rg[1]);
    if (rg[0] != null) return fmt1(rg[0]) + '+';
    return 'at most ' + fmt1(rg[1]);
  }

  function hardViolations(ctx, pcts, limits) {
    var out = [], R = ctx.R, n = ctx.n, rob = 0, i;
    for (i = 0; i < n; i++) if (ctx.isRob[i]) rob += pcts[i];
    if (rob > ctx.cap) out.push('Robusta is ' + rob + '% of this mix. The robusta limit for ' + BREWS[ctx.brew].label + ' is ' + ctx.cap + '%.');
    if (n > 1) {
      for (i = 0; i < n; i++) {
        var lim = (limits || [])[i] || {};
        var mn = Math.max(R.minPct, lim.min || 0);
        var mx = lim.max != null && lim.max !== '' ? Number(lim.max) : 100;
        var nm = ctx.beans[i].name || 'Bean ' + (i + 1);
        if (pcts[i] < mn) out.push(nm + ' is at ' + pcts[i] + '%, below its minimum of ' + mn + '%.');
        if (pcts[i] > mx) out.push(nm + ' is at ' + pcts[i] + '%, above its maximum of ' + mx + '%.');
      }
    }
    if (sum(pcts) !== 100) out.push('The ratio adds up to ' + sum(pcts) + '%, not 100%.');
    return out;
  }

  function explainMisses(ctx, values, pcts) {
    var reasons = [], R = ctx.R, singles = null;
    TARGET_ATTRS.forEach(function (a) {
      var rg = ctx.ranges[a], v = values[a];
      var low = rg[0] != null && v < rg[0] - 1e-9, high = rg[1] != null && v > rg[1] + 1e-9;
      if (!low && !high) return;
      singles = singles || ctx.beans.map(function (b) { return profile([b], [100], ctx.brew, ctx.R); });
      var vals = singles.map(function (p) { return p[a]; });
      var best = low ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
      var bi = vals.indexOf(best);
      var nm = ctx.beans[bi].name || 'one bean';
      if (low && best < rg[0] - 1e-9) {
        reasons.push(ATTR_LABEL[a] + ' ' + fmtRange(rg) + ' is unreachable: the highest any of these beans reaches is ' + fmt1(best) + ' (' + nm + ', as ' + BREWS[ctx.brew].label + ').');
      } else if (high && best > rg[1] + 1e-9) {
        reasons.push(ATTR_LABEL[a] + ' ' + fmtRange(rg) + ' is unreachable: the lowest any of these beans reaches is ' + fmt1(best) + ' (' + nm + ', as ' + BREWS[ctx.brew].label + ').');
      } else if (ctx.isRob[bi] && ctx.cap < 100 && pcts[bi] >= ctx.cap) {
        reasons.push(ATTR_LABEL[a] + ' lands at ' + fmt1(v) + ', outside your target of ' + fmtRange(rg) + '. It needs more of ' + nm + ', but robusta is capped at ' + ctx.cap + '% for ' + BREWS[ctx.brew].label + '.');
      } else {
        reasons.push(ATTR_LABEL[a] + ' lands at ' + fmt1(v) + ', outside your target of ' + fmtRange(rg) + '. It can\'t be met together with your other targets and limits.');
      }
    });
    var sup = R.tiers.supporting;
    ctx.must.forEach(function (t) {
      var s = 0; for (var i = 0; i < ctx.n; i++) s += pcts[i] / 100 * t.coef[i];
      if (s >= sup) return;
      var maxC = Math.max.apply(null, t.coef);
      if (maxC <= 0) reasons.push('None of these beans lists ' + t.label.toLowerCase() + ' on its bag notes.');
      else if (maxC < sup) reasons.push(t.label + ' is too faint in these beans to reach Supporting, even at 100%.');
      else {
        var robOnly = t.coef.every(function (c, i2) { return c <= 0 || ctx.isRob[i2]; });
        reasons.push(t.label + ' can\'t reach Supporting within your limits' + (robOnly && ctx.cap < 100 ? ': it only comes from robusta, which is capped at ' + ctx.cap + '% for ' + BREWS[ctx.brew].label + '.' : '.'));
      }
    });
    ctx.mustNot.forEach(function (t) {
      var s = 0; for (var i = 0; i < ctx.n; i++) s += pcts[i] / 100 * t.coef[i];
      if (s >= sup) reasons.push(t.label + ' still comes through at ' + tierOf(s, R) + ' strength.');
    });
    return reasons;
  }

  function warningsFor(ctx, pcts, sim, pair) {
    var R = ctx.R, out = [];
    var used = ctx.roast.filter(function (r, i) { return pcts[i] > 0; });
    if (used.length > 1) {
      var lo = Math.min.apply(null, used), hi = Math.max.apply(null, used);
      if (hi - lo > R.roastSpreadWarn) out.push('Roast levels run from ' + lo + ' to ' + hi + '. Beans this far apart grind and extract unevenly; check it in a test cup.');
    }
    var lib = 0;
    ctx.beans.forEach(function (b, i) { if (b.species === 'liberica' || b.species === 'excelsa') lib += pcts[i]; });
    if (lib > R.libericaWarnPct) out.push('Liberica/excelsa is ' + lib + '% of the mix. Above ' + R.libericaWarnPct + '% its jackfruit and woody character tends to take over.');
    sim.notes.filter(function (n) { return n.defect && n.tier !== 'lost'; }).forEach(function (n) {
      var who = n.from.map(function (i) { return ctx.beans[i].name || 'a bean'; }).join(', ');
      out.push('Possible defect: "' + n.label.toLowerCase() + '" from ' + who + '. Cup that bean on its own before blending.');
    });
    pair.clashes.filter(function (c) { return c.strong; }).forEach(function (c) { out.push('Flavour clash, ' + c.name.toLowerCase() + ': ' + c.text); });
    if (ctx.brew === 'tonic' && (sim.groups.earthy || 0) + (sim.families.roasted || 0) >= R.tiers.supporting)
      out.push('Earthy and roasted notes clash with tonic or orange: they turn medicinal and harsh. Use brighter, fruit-led beans for this drink.');
    var acetic = acidProfile(sim).strength.acetic;
    if (acetic >= R.tiers.supporting) out.push('Acetic (vinegar-like) acidity at ' + tierOf(acetic, R) + ' strength reads as a fault to specialty cuppers.');
    var lost = sim.notes.filter(function (n) { return n.tier === 'lost'; }).map(function (n) { return n.label.toLowerCase(); });
    if (lost.length) out.push('Likely lost in the cup: ' + joinAnd(lost) + '.');
    return out;
  }

  // Fraction of ±step weighing errors (moving `step` points between any two beans) that keep the score.
  function robustness(ctx, pcts, baseScore) {
    var n = ctx.n, step = ctx.R.robustStep, ok = 0, tried = 0, p = pcts.slice(), out = { values: {} };
    if (n < 2) return 1;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if (i === j || pcts[j] - step < 0) continue;
      p[i] = pcts[i] + step; p[j] = pcts[j] - step;
      scoreInto(ctx, p, out);
      tried++;
      if (out.score <= baseScore + (baseScore > 0 ? 0.05 : 1e-9)) ok++;
      p[i] = pcts[i]; p[j] = pcts[j];
    }
    return tried ? round(ok / tried, 2) : 1;
  }

  function acidProfile(sim) {
    var strength = {}, best = null;
    Object.keys(ACID_TYPES).forEach(function (t) {
      var s = 0;
      sim.notes.forEach(function (n) { if (n.tier !== 'lost' && acidMatches(t, n)) s += n.strength; });
      strength[t] = round(s, 3);
      if (t !== 'acetic' && s >= DEFAULTS.tiers.faint && (!best || s > strength[best])) best = t;
    });
    return { strength: strength, dominant: best };
  }
  // Estimate from the owner's component cup scores; never presented as a real SCA score.
  function predictedScore(ctx, pcts, sim, pair, form) {
    if (!ctx.scoreKnown) return null;
    var base = 0, top = 0;
    for (var i = 0; i < ctx.n; i++) { base += pcts[i] / 100 * ctx.cupScores[i]; if (pcts[i] > 0 && ctx.cupScores[i] > top) top = ctx.cupScores[i]; }
    var pen = pair.clashes.filter(function (c) { return c.strong; }).length
      + 2 * sim.notes.filter(function (n) { return n.defect && n.tier !== 'lost'; }).length
      + (form.balance < 3.5 ? 0.5 : 0);
    var v = round(Math.min(base - pen, top), 1);
    return { value: v, low: round(v - 1, 1), high: round(v + 1, 1), base: round(base, 1), penalty: pen };
  }
  function gateCheck(ctx, pcts, sim, form, predicted) {
    var sp = ctx.sp, R = ctx.R, reasons = [], warnings = [];
    if (!sp) return { reasons: reasons, warnings: warnings };
    if (sp.minScore) {
      if (!predicted) {
        var missing = ctx.beans.filter(function (b, i) { return ctx.cupScores[i] == null; }).map(function (b) { return b.name || 'a bean'; });
        warnings.push('Add a cup score for ' + joinAnd(missing) + ' to check the ' + sp.minScore + '+ high-end target.');
      } else if (predicted.value < Number(sp.minScore)) {
        reasons.push('Predicted cup score ' + fmt1(predicted.value) + ' is below the high-end target of ' + sp.minScore + '. Use higher-scoring beans, or fix the clashes and defects that cost ' + fmt1(predicted.penalty) + ' points.');
      }
    }
    sim.notes.filter(function (n) { return n.defect && n.tier !== 'lost'; }).forEach(function (n) {
      reasons.push('High-end check: the defect note "' + n.label.toLowerCase() + '" must not be in a specialty cup.');
    });
    var acetic = acidProfile(sim).strength.acetic;
    if (acetic >= R.tiers.faint) reasons.push('High-end check: acetic (vinegar-like) acidity is noticeable. Specialty cafés will reject it.');
    if (sp.minBalance && form.balance < Number(sp.minBalance)) reasons.push('High-end check: balance estimate ' + fmt1(form.balance) + ' is below ' + fmt1(Number(sp.minBalance)) + '.');
    if (sp.minComplexity && form.complexity < Number(sp.minComplexity)) reasons.push('High-end check: complexity estimate ' + fmt1(form.complexity) + ' is below ' + fmt1(Number(sp.minComplexity)) + '. Add a bean that brings another flavour family.');
    return { reasons: reasons, warnings: warnings };
  }

  function evaluateWithCtx(ctx, pcts, limits) {
    var tmp = scoreInto(ctx, pcts, { values: {} });
    var values = {};
    TARGET_ATTRS.forEach(function (a) { values[a] = round(tmp.values[a], 2); });
    var sim = simulateNotes(ctx.beans, pcts, ctx.brew, ctx.R);
    var pair = pairings(sim, ctx.R);
    var form = cupForm(values, sim, pair, ctx.R);
    var predicted = predictedScore(ctx, pcts, sim, pair, form);
    var gate = gateCheck(ctx, pcts, sim, form, predicted);
    var hard = hardViolations(ctx, pcts, limits);
    var reasons = hard.length ? hard : tmp.score > 0 ? explainMisses(ctx, tmp.values, pcts) : [];
    reasons = reasons.concat(gate.reasons);
    var warnings = warningsFor(ctx, pcts, sim, pair).concat(gate.warnings);
    var status = reasons.length ? 'fail' : warnings.length ? 'warn' : 'ok';
    var termStrength = function (t) { var s = 0; for (var i = 0; i < ctx.n; i++) s += pcts[i] / 100 * t.coef[i]; return { label: t.label, strength: round(s, 3), tier: tierOf(s, ctx.R) }; };
    return {
      pcts: pcts.slice(), values: values, notes: sim, pairings: pair, form: form,
      predicted: predicted, acid: acidProfile(sim), specialty: !!ctx.sp,
      robust: robustness(ctx, pcts, tmp.score), score: tmp.score, status: status,
      headline: status === 'ok' ? 'Possible' : status === 'warn' ? 'Possible with warnings' : 'Not possible',
      reasons: reasons, warnings: warnings, unresolved: ctx.unresolved.slice(),
      must: ctx.must.map(termStrength), mustNot: ctx.mustNot.map(termStrength), brew: ctx.brew
    };
  }
  function evaluateMix(beans, pcts, target, opts) {
    opts = opts || {};
    var ctx = prepare(beans, target, opts);
    return evaluateWithCtx(ctx, pcts.map(function (p) { return Math.round(Number(p) || 0); }), opts.limits);
  }

  // ---------- solver ----------
  function bounds(beans, R, limits) {
    var n = beans.length, mins = [], maxs = [];
    for (var i = 0; i < n; i++) {
      var lim = (limits || [])[i] || {};
      var mx = lim.max != null && lim.max !== '' && isFinite(lim.max) ? clamp(Math.round(lim.max), 0, 100) : 100;
      var mn = n === 1 ? 100 : Math.max(R.minPct, lim.min != null && lim.min !== '' && isFinite(lim.min) ? Math.round(lim.min) : 0);
      mins.push(mn); maxs.push(n === 1 ? 100 : mx);
    }
    return { mins: mins, maxs: maxs };
  }
  function preChecks(ctx, mins, maxs) {
    var pre = [], n = ctx.n, label = BREWS[ctx.brew].label, i;
    if (sum(mins) > 100) pre.push('The minimum shares add up to ' + sum(mins) + '%, more than 100%.');
    if (sum(maxs) < 100) pre.push('The maximum shares add up to only ' + sum(maxs) + '%.');
    var robMin = 0, allRob = true;
    for (i = 0; i < n; i++) { if (ctx.isRob[i]) robMin += mins[i]; else allRob = false; }
    var robNames = ctx.beans.filter(function (b, k) { return ctx.isRob[k]; }).map(function (b) { return b.name || 'robusta'; });
    if (ctx.ownerCap != null && ctx.cap === ctx.ownerCap && robMin > ctx.cap) pre.push(ctx.cap === 0
      ? 'You chose no robusta (100% arabica), but ' + joinAnd(robNames) + (robNames.length > 1 ? ' are' : ' is') + ' robusta. Remove ' + (robNames.length > 1 ? 'them' : 'it') + ', or allow some robusta.'
      : 'You allowed up to ' + ctx.cap + '% robusta, but the robusta beans need at least ' + robMin + '% at their minimums.');
    else if (allRob && ctx.cap < 100) pre.push('Robusta limit ' + ctx.cap + '% for ' + label + ': every bean in this mix is robusta. Add an arabica, or change the brew style.');
    else if (robMin > ctx.cap) pre.push('Robusta limit ' + ctx.cap + '% for ' + label + ': the robusta beans need at least ' + robMin + '% at their minimums.');
    for (i = 0; i < n; i++) if (mins[i] > maxs[i]) pre.push((ctx.beans[i].name || 'Bean ' + (i + 1)) + ' has a minimum above its maximum.');
    if (ctx.sp && ctx.sp.arabicaOnly) {
      var non = ctx.beans.filter(function (b) { return b.species !== 'arabica'; }).map(function (b) { return b.name || b.species; });
      if (non.length) pre.push('This high-end style is arabica only. Remove ' + joinAnd(non) + ', or turn off "arabica only" in the high-end check.');
    }
    return pre;
  }

  function solve(beans, target, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var ctx = prepare(beans, target, opts);
    var R = ctx.R, n = ctx.n, limits = opts.limits || [], i;
    var label = BREWS[ctx.brew].label;
    var fail = function (reasons) {
      return { status: 'fail', headline: 'Not possible', reasons: reasons, warnings: [], best: null, alternatives: [], round: null, searched: 0, ms: Date.now() - t0, unresolved: ctx.unresolved };
    };
    if (!n) return fail(['Add at least one bean to the mix.']);
    var bd = bounds(beans, R, limits), mins = bd.mins, maxs = bd.maxs;
    var pre = preChecks(ctx, mins, maxs);
    if (pre.length) return fail(pre);

    var sufMin = new Array(n + 1), sufMax = new Array(n + 1);
    sufMin[n] = 0; sufMax[n] = 0;
    for (i = n - 1; i >= 0; i--) { sufMin[i] = sufMin[i + 1] + mins[i]; sufMax[i] = sufMax[i + 1] + maxs[i]; }

    // Incremental sums: each bean adds p × coef[j] to every accumulated quantity.
    var nm = ctx.must.length, nn = ctx.mustNot.length, M = 12 + nm + nn, SC = M - 1;
    var useScore = ctx.minScore != null && ctx.scoreKnown;
    var coef = beans.map(function (b, bi) {
      var c = new Float64Array(M);
      for (var k = 0; k < 4; k++) { c[k] = ctx.ws[ATTRS[k]][bi]; c[4 + k] = ctx.w[ATTRS[k]][bi]; }
      c[8] = ctx.roast[bi]; c[9] = ctx.nS[bi] / 100; c[10] = ctx.nA[bi] / 100;
      for (k = 0; k < nm; k++) c[11 + k] = ctx.must[k].coef[bi] / 100;
      for (k = 0; k < nn; k++) c[11 + nm + k] = ctx.mustNot[k].coef[bi] / 100;
      c[SC] = useScore ? ctx.cupScores[bi] / 100 : 0;
      return c;
    });
    var acc = [];
    for (i = 0; i <= n; i++) acc.push(new Float64Array(M));
    var sup = R.tiers.supporting, rg = ctx.ranges, scratch = { values: {} }, vv = {};
    function leafScore(A, mx, mn) {
      for (var k = 0; k < 4; k++) vv[ATTRS[k]] = A[4 + k] > 0 ? A[k] / A[4 + k] : 3;
      finishValues(vv, A[9], A[10], ctx);
      vv.roast = A[8] / 100;
      var dist = 0, center = 0;
      for (k = 0; k < 5; k++) {
        var r = rg[TARGET_ATTRS[k]], v = vv[TARGET_ATTRS[k]];
        if (r[0] != null && v < r[0]) dist += r[0] - v;
        if (r[1] != null && v > r[1]) dist += v - r[1];
        if (r[0] != null && r[1] != null) center += Math.abs(v - (r[0] + r[1]) / 2);
      }
      var pen = 0, s;
      for (k = 0; k < nm; k++) { s = A[11 + k]; if (s < sup) pen += (sup - s) * R.notePenalty; }
      for (k = 0; k < nn; k++) { s = A[11 + nm + k]; if (s >= sup) pen += (s - sup + 0.01) * R.notePenalty; }
      if (useScore && A[SC] < ctx.minScore) pen += (ctx.minScore - A[SC]) * 0.5;
      scratch.score = Math.round((dist + pen) * 1e6) / 1e6;
      scratch.center = Math.round(center * 1e6) / 1e6;
      scratch.spread = mx - mn;
      scratch.mode = ctx.mode === 'taste' ? 0 : modeKey(ctx, pcts);
    }
    var K = 60, top = [], count = 0, pcts = new Array(n), leafMx = 0, leafMn = 100, roundBest = null;
    function consider() {
      leafScore(acc[n], leafMx, leafMn);
      count++;
      var isRound = true;
      for (var r = 0; r < n; r++) if (pcts[r] % 5) { isRound = false; break; }
      if (isRound && (!roundBest || compare(scratch, roundBest) < 0)) roundBest = { score: scratch.score, center: scratch.center, spread: scratch.spread, mode: scratch.mode, pcts: pcts.slice() };
      if (top.length === K && compare(scratch, top[K - 1]) >= 0) return;
      var item = { score: scratch.score, center: scratch.center, spread: scratch.spread, mode: scratch.mode, pcts: pcts.slice() };
      var j = top.length < K ? top.length : K - 1;
      if (top.length < K) top.push(item); else top[j] = item;
      while (j > 0 && compare(top[j], top[j - 1]) < 0) { var tmp = top[j]; top[j] = top[j - 1]; top[j - 1] = tmp; j--; }
    }
    function push(idx, p) {
      var from = acc[idx], to = acc[idx + 1], c = coef[idx];
      for (var j = 0; j < M; j++) to[j] = from[j] + p * c[j];
    }
    function rec(idx, remaining, rob, mx, mn) {
      if (idx === n - 1) {
        if (remaining < mins[idx] || remaining > maxs[idx]) return;
        if (rob + (ctx.isRob[idx] ? remaining : 0) > ctx.cap) return;
        pcts[idx] = remaining;
        push(idx, remaining);
        leafMx = remaining > mx ? remaining : mx;
        leafMn = remaining < mn ? remaining : mn;
        consider();
        return;
      }
      var lo = Math.max(mins[idx], remaining - sufMax[idx + 1]);
      var hi = Math.min(maxs[idx], remaining - sufMin[idx + 1]);
      for (var p = lo; p <= hi; p++) {
        var r = rob + (ctx.isRob[idx] ? p : 0);
        if (r > ctx.cap) break;
        pcts[idx] = p;
        push(idx, p);
        rec(idx + 1, remaining - p, r, p > mx ? p : mx, p < mn ? p : mn);
      }
    }
    rec(0, 100, 0, 0, 100);
    if (!count) return fail(['No whole-percent mix fits your per-bean limits and the robusta limit of ' + ctx.cap + '% for ' + label + '.']);

    // Among mixes that hit the target equally well, rank the way a cupper would:
    // clean verdict first, then better balance plus tolerance to weighing error, then fewest lost notes.
    var rank = { ok: 0, warn: 1, fail: 2 };
    var ranked = top.map(function (p, order) {
      // Full evaluation is costly; the 24 best ties are plenty to choose a clean, balanced, robust mix.
      var tie = order < 24 && p.score === top[0].score && p.mode === top[0].mode;
      var ev = tie ? evaluateWithCtx(ctx, p.pcts, limits) : null;
      return {
        p: p, ev: ev, order: order, r: ev ? rank[ev.status] : 3,
        q: ev ? ev.form.balance + ev.robust : 0,
        lost: ev ? ev.notes.notes.filter(function (x) { return x.tier === 'lost'; }).length : 0
      };
    });
    ranked.sort(function (a, b) { return a.r - b.r || b.q - a.q || a.lost - b.lost || a.order - b.order; });
    var picked = [ranked[0]];
    for (i = 1; i < ranked.length && picked.length < 3; i++) {
      var cand = ranked[i];
      var distinct = picked.every(function (p) {
        var d = 0; for (var k = 0; k < n; k++) d = Math.max(d, Math.abs(p.p.pcts[k] - cand.p.pcts[k]));
        return d >= 5;
      });
      if (distinct) picked.push(cand);
    }
    var results = picked.map(function (x) { return x.ev || evaluateWithCtx(ctx, x.p.pcts, limits); });
    var best = results[0];
    var roundEv = null;
    if (best.status !== 'fail' && roundBest && roundBest.score <= best.score + 1e-9 && roundBest.pcts.join() !== best.pcts.join()) {
      roundEv = evaluateWithCtx(ctx, roundBest.pcts, limits);
      if (rank[roundEv.status] > rank[best.status]) roundEv = null;
    }
    return {
      status: best.status, headline: best.headline, reasons: best.reasons, warnings: best.warnings,
      best: best, alternatives: results.slice(1), round: roundEv,
      searched: count, ms: Date.now() - t0, unresolved: ctx.unresolved, mode: ctx.mode
    };
  }

  // ---------- bean picker ----------
  function combos(n, k, cb) {
    var idx = [];
    (function go(start, depth) {
      if (depth === k) { cb(idx.slice()); return; }
      for (var i = start; i <= n - (k - depth); i++) { idx[depth] = i; go(i + 1, depth + 1); }
    })(0, 0);
  }
  // Best mix of one subset on a coarse grid (multiples of `step`).
  function coarseBest(ctx, step) {
    var n = ctx.n, R = ctx.R, best = null, p = new Array(n), out = { values: {} }, evals = 0;
    var mn = Math.max(step, Math.ceil(R.minPct / step) * step);
    (function rec(i, remaining, rob) {
      if (i === n - 1) {
        if (remaining < mn) return;
        if (rob + (ctx.isRob[i] ? remaining : 0) > ctx.cap) return;
        p[i] = remaining;
        scoreInto(ctx, p, out); evals++;
        if (!best || compare(out, best) < 0) best = { score: out.score, center: out.center, spread: out.spread, mode: out.mode, pcts: p.slice() };
        return;
      }
      for (var v = mn; v <= remaining - mn * (n - 1 - i); v += step) {
        var r = rob + (ctx.isRob[i] ? v : 0);
        if (r > ctx.cap) break;
        p[i] = v;
        rec(i + 1, remaining - v, r);
      }
    })(0, 100, 0);
    return { best: best, evals: evals };
  }
  function pickBeans(cands, target, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var R = opts.rules || DEFAULTS;
    var maxK = clamp(opts.maxBeans || 3, 2, 4), minK = clamp(opts.minBeans || 2, 1, maxK);
    var o1 = Object.assign({}, opts, { mode: 'taste' });
    if (!cands.length) return { picks: [], considered: 0, evals: 0, ms: 0 };
    // 1) Pre-filter: keep beans that fit alone, extremes in the direction the target needs, and carriers of must-taste notes.
    var singles = cands.map(function (c, i) {
      var cx = prepare([c], target, o1);
      var s = scoreInto(cx, [100], { values: {} });
      return { i: i, score: s.score, values: Object.assign({}, s.values), mustC: cx.must.map(function (t) { return t.coef[0]; }) };
    });
    var keep = {};
    function addTop(list, n) { list.slice(0, n).forEach(function (x) { keep[x.i] = true; }); }
    addTop(singles.slice().sort(function (a, b) { return a.score - b.score; }), 10);
    var tctx = prepare([], target, o1);
    TARGET_ATTRS.forEach(function (a) {
      var r = tctx.ranges[a];
      if (r[0] != null) addTop(singles.slice().sort(function (x, y) { return y.values[a] - x.values[a]; }), 3);
      if (r[1] != null) addTop(singles.slice().sort(function (x, y) { return x.values[a] - y.values[a]; }), 3);
    });
    (singles[0] ? singles[0].mustC : []).forEach(function (_, k) {
      addTop(singles.filter(function (x) { return x.mustC[k] > 0; }).sort(function (x, y) { return y.mustC[k] - x.mustC[k]; }), 3);
    });
    var pool = Object.keys(keep).map(Number).slice(0, 26);
    // 2) Coarse search over every subset of the pool.
    var subsets = [], evals = 0;
    for (var k = minK; k <= Math.min(maxK, pool.length); k++) {
      var step = k <= 2 ? 1 : k === 3 ? 5 : 10;
      combos(pool.length, k, function (ix) {
        var beans = ix.map(function (j) { return cands[pool[j]]; });
        var cx = prepare(beans, target, o1);
        if (preChecks(cx, beans.map(function () { return k === 1 ? 100 : R.minPct; }), beans.map(function () { return 100; })).length) return;
        var cb = k === 1 ? { best: Object.assign(scoreInto(cx, [100], { values: {} }), { pcts: [100] }), evals: 1 } : coarseBest(cx, step);
        evals += cb.evals;
        if (cb.best) subsets.push({ ids: ix.map(function (j) { return pool[j]; }), k: k, best: cb.best });
      });
    }
    subsets.sort(function (a, b) { return a.best.score - b.best.score || a.k - b.k || a.best.center - b.best.center; });
    // 3) Full 1% solve on the most promising subsets, then rank like a cupper.
    var rank = { ok: 0, warn: 1, fail: 2 };
    // The same origin in another process is nearly the same pick, so keep only the best per origin set.
    var seenSet = {}, chosen = [];
    for (var si = 0; si < subsets.length && chosen.length < (opts.refine || 30); si++) {
      var keyName = subsets[si].ids.map(function (j) { return cands[j].originKey || cands[j].id || cands[j].name; }).sort().join('|');
      if (seenSet[keyName]) continue;
      seenSet[keyName] = true;
      chosen.push(subsets[si]);
    }
    var picks = chosen.map(function (s) {
      var beans = s.ids.map(function (j) { return cands[j]; });
      var res = solve(beans, target, Object.assign({}, opts, { limits: null, mode: 'taste' }));
      return { ids: s.ids, beans: beans, result: res, k: s.k };
    }).filter(function (p) { return p.result.best; });
    // Missing cup scores are expected for catalogue candidates; don't let that warning decide the ranking.
    function realWarnings(p) { return p.result.warnings.filter(function (w) { return !/^Add a cup score/.test(w); }).length; }
    function effRank(p) { return p.result.status === 'warn' && !realWarnings(p) ? 0 : rank[p.result.status]; }
    picks.sort(function (a, b) {
      return a.result.best.score - b.result.best.score || effRank(a) - effRank(b) ||
        realWarnings(a) - realWarnings(b) || a.k - b.k ||
        (b.result.best.form.balance + b.result.best.robust) - (a.result.best.form.balance + a.result.best.robust);
    });
    return { picks: picks.slice(0, opts.limit || 5), considered: pool.length, evals: evals, ms: Date.now() - t0 };
  }

  // ---------- weigh-out, stock, ratio editing ----------
  function weighOut(pcts, total, step) {
    var unit = Math.round(1 / (step || 1));
    var T = Math.round(total * unit);
    var arr = pcts.map(function (p) { return Math.round(T * p / 100); });
    var gap = T - sum(arr);
    if (gap !== 0 && arr.length) {
      var li = 0;
      for (var i = 1; i < pcts.length; i++) if (pcts[i] > pcts[li]) li = i;
      arr[li] += gap;
    }
    return arr.map(function (x) { return x / unit; });
  }
  function planWeighOut(pcts, plan) {
    var totals = pcts.map(function () { return 0; }), totalG = 0;
    (plan || []).forEach(function (row) {
      var c = Math.max(0, Math.floor(Number(row.count) || 0));
      if (!c || !(row.bagG > 0)) return;
      weighOut(pcts, row.bagG, 1).forEach(function (x, i) { totals[i] += x * c; });
      totalG += row.bagG * c;
    });
    return { perBean: totals, totalG: totalG };
  }
  function maxBags(pcts, bagG, stocks) {
    var g = weighOut(pcts, bagG, 1), best = Infinity, lim = -1;
    for (var i = 0; i < g.length; i++) {
      if (!(g[i] > 0)) continue;
      var s = stocks[i];
      if (s == null || !isFinite(s)) continue;
      var b = Math.floor(Number(s) / g[i]);
      if (b < best) { best = b; lim = i; }
    }
    return { bags: lim < 0 ? null : best, limiting: lim, perBag: g };
  }
  // Set one bean's share; the others keep their proportions above their minimums and stay within their maximums.
  function rebalance(pcts, idx, value, mins, maxs) {
    var n = pcts.length;
    if (n === 1) return [100];
    mins = mins || pcts.map(function () { return 0; });
    maxs = maxs || pcts.map(function () { return 100; });
    var others = [], i;
    for (i = 0; i < n; i++) if (i !== idx) others.push(i);
    var oMin = 0, oMax = 0;
    others.forEach(function (j) { oMin += mins[j]; oMax += maxs[j]; });
    var v = clamp(Math.round(Number(value) || 0), Math.max(mins[idx], 100 - oMax), Math.min(maxs[idx], 100 - oMin));
    var out = new Array(n);
    out[idx] = v;
    var rest = 100 - v, oldSum = 0;
    others.forEach(function (j) { oldSum += pcts[j]; });
    var target = others.map(function (j) { return oldSum > 0 ? rest * pcts[j] / oldSum : rest / others.length; });
    var raw = target.slice();
    // Keep the old proportions, then push anything outside a bean's min/max onto the beans that still have room.
    for (var guard = 0; guard < 12; guard++) {
      raw = raw.map(function (x, k) { return clamp(x, mins[others[k]], maxs[others[k]]); });
      var diff = rest - sum(raw);
      if (Math.abs(diff) < 1e-9) break;
      var free = others.map(function (j, k) { return diff > 0 ? raw[k] < maxs[j] - 1e-9 : raw[k] > mins[j] + 1e-9; });
      var wsum = 0, cnt = 0;
      free.forEach(function (f, k) { if (f) { wsum += target[k]; cnt++; } });
      if (!cnt) break;
      raw = raw.map(function (x, k) { return free[k] ? x + diff * (wsum > 0 ? target[k] / wsum : 1 / cnt) : x; });
    }
    var fl = raw.map(Math.floor), left = 100 - v - sum(fl);
    var order = raw.map(function (r, k) { return [r - fl[k], k]; }).sort(function (a, b) { return b[0] - a[0]; });
    for (var k2 = 0; k2 < left; k2++) fl[order[k2 % order.length][1]]++;
    others.forEach(function (j, k3) { out[j] = fl[k3]; });
    return out;
  }
  function neighbours(pcts, step) {
    step = step || 5;
    var li = 0;
    for (var i = 1; i < pcts.length; i++) if (pcts[i] > pcts[li]) li = i;
    var out = [];
    [step, -step].forEach(function (d) {
      var v = pcts[li] + d;
      if (v > 0 && v < 100) out.push(rebalance(pcts, li, v));
    });
    return out;
  }

  // ---------- cupping plan (SCA protocol) ----------
  function cuppingPlan(samples, opts) {
    opts = opts || {};
    var C = Object.assign({}, DEFAULTS.cupping, opts.cupping || {});
    var rand = opts.rand || Math.random;
    var used = {};
    function code() {
      for (var tries = 0; tries < 1000; tries++) {
        var c = String(100 + Math.floor(rand() * 900));
        if (!used[c]) { used[c] = true; return c; }
      }
      return String(Object.keys(used).length + 100);
    }
    var brew = brewOf(opts.brew);
    var list = samples.slice(0, 3).map(function (s) {
      return { code: code(), pcts: s.pcts.slice(), label: s.label || '', grams: weighOut(s.pcts, C.sampleG, 0.1) };
    });
    var steps = [
      'Weigh each sample to ' + C.sampleG + ' g and mix it well. That covers ' + C.cups + ' cups plus a grinder purge.',
      'Grind each sample slightly coarser than for paper filter, within 15 minutes of pouring. Purge the grinder with a little of the next sample first.',
      'Dose ' + String(C.doseG).replace('.', ',') + ' g into each cup, ' + C.cups + ' cups per sample, and smell the dry fragrance.',
      'Pour water at ' + C.waterC + ' °C to ' + C.waterMl + ' ml per cup, wetting all the grounds.',
      'Steep for 4 minutes, then break the crust with three stirs and smell the aroma.',
      'Skim off the foam and grounds. Start tasting at about 71 °C and keep going as the cups cool.',
      'Score body, acidity, sweetness and bitterness for each code before you look at which mix it is. Then log the results.'
    ];
    var brewNote = brew === 'filter' ? '' :
      'You plan to serve this as ' + BREWS[brew].label + '. Cupping shows the coffee itself; also brew the winning code as ' + BREWS[brew].label + ' before you commit, because ' +
      (brew === 'kopisusu' ? 'milk mutes acidity and delicate notes.' : brew === 'espresso' ? 'pressure amplifies body and bitterness.' : 'unfiltered fines add body and bitterness.');
    return { samples: list, cups: C.cups, doseG: C.doseG, waterMl: C.waterMl, waterC: C.waterC, sampleG: C.sampleG, steps: steps, brewNote: brewNote };
  }

  // ---------- calibration ----------
  function calibrate(beans, pcts, predicted, actual, rules) {
    var R = rules || DEFAULTS, deltas = {};
    ATTRS.forEach(function (a) {
      if (actual[a] == null || actual[a] === '' || predicted[a] == null) return;
      var err = Number(actual[a]) - Number(predicted[a]);
      if (!isFinite(err) || err === 0) return;
      var sh = shares(beans, pcts, a, R);
      beans.forEach(function (b, i) {
        if (!b.id || b.quick || !(sh[i] > 0)) return;
        var eff = effScore(b, a);
        var d = round(clamp(eff + R.learnRate * err * sh[i], 1, 5) - eff, 2);
        if (d !== 0) { deltas[b.id] = deltas[b.id] || {}; deltas[b.id][a] = d; }
      });
    });
    return deltas;
  }
  function applyCalib(calib, delta, sign) {
    var out = Object.assign({}, calib || {});
    Object.keys(delta || {}).forEach(function (a) { out[a] = round((out[a] || 0) + sign * delta[a], 2); if (out[a] === 0) delete out[a]; });
    return out;
  }
  // Note learning: strong predicted notes that weren't tasted get weaker for the beans that carry them;
  // tasted notes the model under-predicted get stronger. Returns {beanId: {noteKey: {from, to}}}.
  function calibrateNotes(beans, pcts, brew, tastedKnown, rules) {
    var R = rules || DEFAULTS, L = R.noteLearn, out = {};
    var sim = simulateNotes(beans, pcts, brew, R);
    var tastedKeys = {}, tastedSubs = {};
    (tastedKnown || []).forEach(function (n) { tastedKeys[n.key] = true; tastedSubs[n.sub] = true; });
    function set(bi, key, factor) {
      var b = beans[bi];
      if (!b || !b.id || b.quick) return;
      var from = noteLearned(b, key);
      var to = round(clamp(from * factor, L.min, L.max), 2);
      if (to === from) return;
      out[b.id] = out[b.id] || {};
      out[b.id][key] = { from: from, to: to };
    }
    sim.notes.forEach(function (n) {
      var tasted = tastedKeys[n.key] || tastedSubs[n.sub];
      if ((n.tier === 'dominant' || n.tier === 'supporting') && !tasted) n.from.forEach(function (bi) { set(bi, n.key, L.down); });
      if ((n.tier === 'faint' || n.tier === 'lost') && tastedKeys[n.key]) n.from.forEach(function (bi) { set(bi, n.key, L.up); });
    });
    return out;
  }
  function applyNoteCalib(noteCalib, delta, sign) {
    var out = Object.assign({}, noteCalib || {});
    Object.keys(delta || {}).forEach(function (k) {
      var v = sign > 0 ? delta[k].to : delta[k].from;
      if (v === 1) delete out[k]; else out[k] = v;
    });
    return out;
  }

  // ---------- recipe card ----------
  function recipeFor(brew, roast) {
    var r = clampRoast(Math.round(Number(roast) || 3)), light = r <= 2, dark = r >= 4;
    var espTemp = light ? '94–95 °C' : dark ? '90–92 °C' : '92–94 °C';
    var shot = { dose: '18 g', yield: light ? '40–45 g' : '36 g', ratio: light ? '1:2,2–1:2,5' : '1:2', time: '25–32 s', temp: espTemp, grind: 'Fine; adjust so the shot runs in the time window' };
    var espTargets = 'Espresso TDS 8–12% · extraction 18–22%';
    var R = {
      filter: { title: 'Pour-over (V60 / Kalita)', dose: '15 g', yield: '250 g water', ratio: light ? '1:16,7' : '1:15', time: '2:45–3:30 min',
        temp: light ? '94–96 °C' : dark ? '88–91 °C' : '92–94 °C', grind: 'Medium-fine, like table salt',
        extra: 'Bloom with 40 g water for 40 s, then pour in 2–3 slow pulses.', targets: 'TDS 1,15–1,45% · extraction 18–22%' },
      espresso: Object.assign({ title: 'Espresso', extra: 'Taste for sweetness first; grind finer if sour, coarser if bitter or dry.', targets: espTargets }, shot),
      flatwhite: Object.assign({}, shot, { title: 'Flat white', yield: '32–36 g', extra: 'Add 120–140 ml milk steamed to 55–60 °C with thin, glossy microfoam.', targets: espTargets }),
      kopisusu: Object.assign({}, shot, { title: 'Kopi susu', yield: '40 g', extra: 'Add 120 ml fresh milk and 20–25 ml gula aren syrup; serve over ice if you like.', targets: espTargets }),
      icedmilk: Object.assign({}, shot, { title: 'Iced latte / es kopi susu', yield: '34 g', ratio: '1:1,9', extra: 'Pull slightly stronger. Add 150 ml cold milk over 120 g ice, then the espresso on top.', targets: espTargets }),
      coldbrew: { title: 'Cold brew (concentrate)', dose: '100 g', yield: '800 g filtered water', ratio: '1:8', time: '16–20 hours', temp: '4–8 °C (fridge)', grind: 'Coarse, like raw sugar',
        extra: 'Filter, then dilute 1:1 with water or milk. Keeps 5–7 days chilled.', targets: 'Ready-to-drink TDS about 1,3–1,6%' },
      tonic: Object.assign({}, shot, { title: 'Espresso tonic / espresso orange', extra: 'Fill a glass with ice and 120 ml chilled tonic (or 100 ml fresh orange juice). Pour the espresso slowly on top so it doesn\'t foam over.', targets: espTargets }),
      tubruk: { title: 'Tubruk', dose: '10–12 g', yield: '150 ml water', ratio: '1:12–1:15', time: '4 min, then let it settle', temp: '93–96 °C', grind: 'Fine-medium',
        extra: 'Stir, wait 4 minutes and let the grounds settle before drinking. Add gula aren to taste.', targets: 'Unfiltered: expect heavy body and some sediment' }
    };
    var out = R[brewOf(brew)] || R.filter;
    out.water = WATER;
    out.rest = /^(espresso|flatwhite|kopisusu|icedmilk|tonic)$/.test(brewOf(brew)) ? '7–21 days after the roast date' : '5–10 days after the roast date';
    return out;
  }
  function roastColour(roast) { return ROAST_COLOURS[clampRoast(roast)]; }

  // ---------- lot consistency ----------
  function referenceTarget(ev, tol) {
    tol = tol == null ? 0.25 : tol;
    var ranges = {};
    TARGET_ATTRS.forEach(function (a) {
      var t = a === 'roast' ? 0.5 : tol, v = ev.values[a];
      ranges[a] = [round(clamp(v - t, 1, 5), 2), round(clamp(v + t, 1, 5), 2)];
    });
    var must = ev.notes.notes.filter(function (n) { return n.tier === 'dominant' || n.tier === 'supporting'; }).map(function (n) { return n.label; });
    return { ranges: ranges, must: must, mustNot: [] };
  }
  function trianglePlan(rounds, rand) {
    rand = rand || Math.random;
    var used = {}, out = [];
    function code() { for (var t = 0; t < 1000; t++) { var c = String(100 + Math.floor(rand() * 900)); if (!used[c]) { used[c] = true; return c; } } return String(Date.now() % 900 + 100); }
    for (var r = 0; r < (rounds || 3); r++) {
      var oddIsNew = rand() < 0.5;
      var samples = oddIsNew ? ['ref', 'ref', 'new'] : ['new', 'new', 'ref'];
      for (var i = samples.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var tmp = samples[i]; samples[i] = samples[j]; samples[j] = tmp; }
      var oddLabel = oddIsNew ? 'new' : 'ref';
      out.push({ codes: [code(), code(), code()], samples: samples, odd: samples.indexOf(oddLabel) });
    }
    return out;
  }
  function binomTail(k, n, p) {
    var s = 0;
    for (var i = k; i <= n; i++) {
      var c = 1; for (var j = 0; j < i; j++) c = c * (n - j) / (j + 1);
      s += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
    }
    return s;
  }
  function triangleVerdict(correct, rounds) {
    var p = binomTail(correct, rounds, 1 / 3);
    return { p: round(p, 3), different: p < 0.05 };
  }

  // ---------- CVA-style cupping form ----------
  function cvaToModel(cva) {
    function map(i) { return i == null || i === '' || !isFinite(i) ? null : round(1 + 4 * clamp(Number(i), 0, 15) / 15, 2); }
    var out = {};
    var b = map(cva.mouthfeel), a = map(cva.acidity), s = map(cva.sweetness);
    if (b != null) out.body = b;
    if (a != null) out.acidity = a;
    if (s != null) out.sweetness = s;
    if (cva.bitterness != null && cva.bitterness !== '' && isFinite(cva.bitterness)) out.bitterness = clamp(Number(cva.bitterness), 1, 5);
    return out;
  }

  // ---------- sourcing limits ----------
  // countries: list of country names the owner can buy from; empty or missing = no limit.
  function originAllowed(origin, countries) {
    if (!countries || !countries.length) return true;
    return countries.indexOf(origin.country) >= 0;
  }

  // ---------- auto-tune from cupping logs ----------
  // samples: [{beans, pcts, brew, actual:{attr:value}}]. Beans carry their current calibration, so errors
  // already fixed per bean are not learned twice. Returns a per-brew bias, shrunk toward 0 for small samples.
  function fitBrewBias(samples, rules, opts) {
    opts = opts || {};
    var minN = opts.minN || 2, shrink = opts.shrink == null ? 2 : opts.shrink, lim = opts.clamp || 1;
    var R0 = Object.assign({}, rules || DEFAULTS, { brewBias: {} });
    var acc = {};
    (samples || []).forEach(function (s) {
      if (!s || !s.beans || !s.beans.length || !s.actual) return;
      var brew = brewOf(s.brew);
      var pred = profile(s.beans, s.pcts, brew, R0);
      ATTRS.forEach(function (a) {
        var v = s.actual[a];
        if (v == null || v === '' || !isFinite(v)) return;
        acc[brew] = acc[brew] || {};
        var c = acc[brew][a] = acc[brew][a] || { sum: 0, n: 0 };
        c.sum += Number(v) - pred[a]; c.n++;
      });
    });
    var bias = {}, counts = {};
    Object.keys(acc).forEach(function (brew) {
      Object.keys(acc[brew]).forEach(function (a) {
        var c = acc[brew][a];
        counts[brew] = Math.max(counts[brew] || 0, c.n);
        if (c.n < minN) return;
        var v = round(clamp((c.sum / c.n) * c.n / (c.n + shrink), -lim, lim) / 0.05, 0) * 0.05;
        v = round(v, 2);
        if (v !== 0) { bias[brew] = bias[brew] || {}; bias[brew][a] = v; }
      });
    });
    return { bias: bias, counts: counts };
  }

  // ---------- smart substitutes ----------
  function similarity(a, b) {
    var d = 0;
    ATTRS.forEach(function (k) { d += Math.abs(effScore(a, k) - effScore(b, k)); });
    d += 0.5 * Math.abs(clampRoast(a.roast) - clampRoast(b.roast));
    if (a.species !== b.species) d += 1.5;
    var fa = {}, shared = 0;
    (a.notes || []).forEach(function (n) { fa[n.sub] = true; });
    var seen = {};
    (b.notes || []).forEach(function (n) { if (fa[n.sub] && !seen[n.sub]) { shared++; seen[n.sub] = true; } });
    return d - 0.4 * shared;
  }
  // Replace beans[idx] with each candidate and re-solve so the cup stays as close as possible to the current one.
  function substitutes(beans, pcts, idx, candidates, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var cur = evaluateMix(beans, pcts, opts.target || {}, opts);
    var ref = referenceTarget(cur);
    var t = opts.target || {};
    var target = { ranges: ref.ranges, must: ref.must, mustNot: t.mustNot || [], specialty: t.specialty || null };
    var gone = beans[idx];
    var shortlist = (candidates || []).filter(function (c) {
      return beans.every(function (b, i) { return i === idx || !(b.id && c.id && b.id === c.id) && b !== c; });
    }).map(function (c) { return { c: c, sim: similarity(gone, c) }; })
      .sort(function (x, y) { return x.sim - y.sim; }).slice(0, opts.shortlist || 10);
    var rank = { ok: 0, warn: 1, fail: 2 };
    var out = shortlist.map(function (s) {
      var nb = beans.slice(); nb[idx] = s.c;
      var res = solve(nb, target, Object.assign({}, opts, { limits: null, mode: 'taste' }));
      return { candidate: s.c, similarity: round(s.sim, 2), result: res };
    }).filter(function (x) { return x.result.best; });
    out.sort(function (a, b) {
      return a.result.best.score - b.result.best.score || rank[a.result.status] - rank[b.result.status] || a.similarity - b.similarity;
    });
    return { options: out.slice(0, opts.limit || 3), reference: cur, ms: Date.now() - t0 };
  }

  // Share of each species in a mix, e.g. { arabica: 69, robusta: 31 }, plus a plain label.
  function speciesShare(beans, pcts) {
    var by = {}, order = ['arabica', 'robusta', 'liberica', 'excelsa'];
    (beans || []).forEach(function (b, i) {
      var s = String((b && b.species) || 'arabica').toLowerCase();
      by[s] = (by[s] || 0) + (Number(pcts && pcts[i]) || 0);
    });
    var parts = Object.keys(by).filter(function (k) { return by[k] > 0; })
      .sort(function (a, b) { return (order.indexOf(a) < 0 ? 9 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 9 : order.indexOf(b)); });
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    var label = parts.length === 1 ? '100% ' + parts[0] : parts.map(function (k) { return cap(k) + ' ' + by[k] + '%'; }).join(' · ');
    return { shares: by, robusta: by.robusta || 0, arabica: by.arabica || 0, label: label, pure: parts.length === 1 ? parts[0] : null, parts: parts };
  }

  root.RatioEngine = {
    speciesShare: speciesShare,
    originAllowed: originAllowed, fitBrewBias: fitBrewBias, substitutes: substitutes, similarity: similarity,
    VARIETALS: VARIETALS, ROAST_COLOURS: ROAST_COLOURS, ACID_TYPES: ACID_TYPES, WATER: WATER,
    scoresForVarietal: scoresForVarietal, acidProfile: acidProfile, recipeFor: recipeFor, roastColour: roastColour,
    referenceTarget: referenceTarget, trianglePlan: trianglePlan, triangleVerdict: triangleVerdict, cvaToModel: cvaToModel,
    ATTRS: ATTRS, TARGET_ATTRS: TARGET_ATTRS, ATTR_LABEL: ATTR_LABEL, DEFAULTS: DEFAULTS, BREWS: BREWS, PRESETS: PRESETS, PAIRINGS: PAIRINGS,
    PROCESSES: PROCESSES, PROCESS_KEYS: PROCESS_KEYS, processOf: processOf, offeredProcesses: offeredProcesses, scoresForProcess: scoresForProcess, scoresFor: scoresFor,
    withRules: withRules, buildIndex: buildIndex, parseNotes: parseNotes, resolveTerm: resolveTerm, splitTerms: splitTerms,
    effScore: effScore, scoresForRoast: scoresForRoast, profile: profile, shares: shares,
    simulateNotes: simulateNotes, describeCup: describeCup, tierOf: tierOf, pairings: pairings, cupForm: cupForm,
    evaluateMix: evaluateMix, solve: solve, pickBeans: pickBeans,
    weighOut: weighOut, planWeighOut: planWeighOut, maxBags: maxBags, rebalance: rebalance, neighbours: neighbours,
    cuppingPlan: cuppingPlan, calibrate: calibrate, applyCalib: applyCalib, calibrateNotes: calibrateNotes, applyNoteCalib: applyNoteCalib,
    slug: slug, fmt1: fmt1
  };
})(typeof window !== 'undefined' ? window : this);
