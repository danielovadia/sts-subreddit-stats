'use strict';

/* ─── Colors ────────────────────────────────────────────────── */

const CHAR_COLORS = {
  Ironclad:    '#c0392b',
  Silent:      '#27ae60',
  Defect:      '#2980b9',
  Regent:      '#8e44ad',
  Necrobinder: '#16a085',
  Colorless:   '#8899aa',
  Curse:       '#7f8c8d',
  Unknown:     '#555577',
};

const RARITY_COLORS = {
  Basic:    '#777777',
  Common:   '#999999',
  Uncommon: '#2ecc71',
  Rare:     '#e74c3c',
  Curse:    '#7f8c8d',
};

const PALETTE = [
  '#d4a937','#c0392b','#27ae60','#2980b9','#8e44ad',
  '#16a085','#e67e22','#e91e63','#00bcd4','#8bc34a',
  '#ff5722','#9c27b0','#f39c12','#1abc9c',
];

/* ─── Sample data (file:// fallback) ────────────────────────── */

const SAMPLE_DATA = (() => {
  const dates = [];
  for (let i = 33; i >= 0; i--) {
    const d = new Date('2026-04-07');
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return {
    generated_at: '2026-04-07T18:00:00Z',
    date_range: { start: dates[0], end: dates[dates.length - 1] },
    dates,
    total_comments_by_date: dates.map(() => 100 + Math.floor(Math.random() * 200)),
    cards: {
      defect_hyperbeam:    { name: 'Hyperbeam',     character: 'Defect',   rarity: 'Rare',     type: 'Attack', counts: [5,3,4,6,4,5,3,4,5,4,3,5,4,5,4,3,4,5,4,3,4,5,6,9,12,20,35,45,55,62,68,72,66,70] },
      silent_backstab:     { name: 'Backstab',      character: 'Silent',   rarity: 'Uncommon', type: 'Attack', counts: [1,2,1,2,1,1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,1,1,1,1,2,1,0,1,0,1,5,14,24] },
      ironclad_exhume:     { name: 'Exhume',        character: 'Ironclad', rarity: 'Rare',     type: 'Skill',  counts: [0,1,0,1,0,1,0,1,0,1,0,1,0,0,1,0,1,0,0,0,1,0,0,1,0,0,0,1,0,1,3,4,9,17] },
      defect_echo_form:    { name: 'Echo Form',     character: 'Defect',   rarity: 'Rare',     type: 'Power',  counts: [18,20,22,19,21,24,22,20,23,25,22,24,26,23,21,24,22,20,23,21,19,22,20,18,22,20,18,21,19,17,18,20,19,18] },
      ironclad_corruption: { name: 'Corruption',    character: 'Ironclad', rarity: 'Rare',     type: 'Power',  counts: [15,17,14,16,18,15,17,16,14,18,15,17,16,14,16,15,17,14,16,15,13,15,14,12,14,13,11,13,12,10,11,10,9,8] },
      regent_slither:      { name: 'Slither',       character: 'Regent',   rarity: 'Uncommon', type: 'Skill',  counts: [2,3,2,3,2,3,2,3,2,3,2,3,2,3,2,3,2,4,5,6,8,10,12,14,18,22,28,30,35,40,38,36,37,40] },
      defect_thunder:      { name: 'Thunder Strike', character: 'Defect',  rarity: 'Rare',     type: 'Attack', counts: [3,4,5,4,5,6,5,4,6,5,4,6,5,7,6,5,7,6,8,7,8,9,10,8,9,10,8,9,6,5,3,2,1,0] },
      silent_catalyst:     { name: 'Catalyst',      character: 'Silent',   rarity: 'Uncommon', type: 'Skill',  counts: [10,12,11,13,12,14,13,12,14,13,12,14,13,12,14,13,12,14,13,11,13,12,10,12,11,9,11,10,8,9,7,8,6,5] },
      necrobinder_entropy: { name: 'Entropy',       character: 'Necrobinder', rarity: 'Rare',  type: 'Power',  counts: [5,6,7,6,7,8,7,6,8,7,6,8,7,6,8,7,6,8,7,8,9,10,11,12,13,14,15,17,18,19,16,12,8,2] },
      regent_blade_dance:  { name: 'Blade Dance',   character: 'Regent',   rarity: 'Common',   type: 'Skill',  counts: [3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,3,4,5,9,16,25,32,36] },
    },
  };
})();

/* ─── App state ─────────────────────────────────────────────── */

let appData    = null;
let chartInst  = null;
let activeIds  = [];
let colorMap   = {};
let defaultIds = [];
let activePreset = null;

let useRollingAvg   = false;
let useShareOfVoice = false;
let dateStartIdx    = 0;
let dateEndIdx      = Infinity;
let hiddenChars     = new Set();
let rarityFilter    = '';
let browserQuery    = '';

/* ─── Series abstraction ────────────────────────────────────── */
/* Series IDs are either a raw card id (e.g. "ironclad_exhume")
   or a char-aggregate id prefixed with "__char:" (e.g. "__char:Ironclad"). */

const CHAR_PREFIX = '__char:';
const isCharId  = id => typeof id === 'string' && id.startsWith(CHAR_PREFIX);
const charOfId  = id => id.slice(CHAR_PREFIX.length);
const charIdOf  = name => CHAR_PREFIX + name;

function seriesOf(id, data) {
  if (isCharId(id)) {
    const char = charOfId(id);
    const len  = data.dates.length;
    const counts = new Array(len).fill(0);
    for (const c of Object.values(data.cards)) {
      if (c.character !== char) continue;
      for (let i = 0; i < len; i++) counts[i] += c.counts[i] || 0;
    }
    return { name: char + ' (all cards)', counts, character: char, rarity: null, type: null, isChar: true };
  }
  const card = data.cards[id];
  if (!card) return null;
  return { name: card.name, counts: card.counts, character: card.character, rarity: card.rarity, type: card.type, isChar: false };
}

/* ─── Math helpers ──────────────────────────────────────────── */

const sum    = arr => arr.reduce((a, b) => a + b, 0);
const last7  = c   => sum(c.counts.slice(-7));
const prev7  = c   => sum(c.counts.slice(-14, -7));
const prev14 = c   => sum(c.counts.slice(-21, -7));

function rollingAvg(counts, w = 7) {
  return counts.map((_, i) => {
    const sl = counts.slice(Math.max(0, i - w + 1), i + 1);
    return Math.round(sum(sl) / sl.length * 10) / 10;
  });
}

/* ─── Formatting ────────────────────────────────────────────── */

function fmtDate(str) {
  const d = new Date(str + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }

function ccOf(char)   { return CHAR_COLORS[char]  || CHAR_COLORS.Unknown; }
function rcOf(rarity) { return RARITY_COLORS[rarity] || '#888'; }

function ensureColor(id) {
  if (isCharId(id)) {
    return CHAR_COLORS[charOfId(id)] || CHAR_COLORS.Unknown;
  }
  if (!colorMap[id]) {
    const used = Object.keys(colorMap).length;
    colorMap[id] = PALETTE[used % PALETTE.length];
  }
  return colorMap[id];
}

/* ─── SVG Sparkline ─────────────────────────────────────────── */

/**
 * Generates an inline SVG sparkline with a smooth bezier path.
 * @param {number[]} counts  Data points
 * @param {number}   w       ViewBox width
 * @param {number}   h       ViewBox height
 * @param {string}   color   Stroke color
 * @param {boolean}  fill    Whether to draw an area fill under the line
 */
function makeSpark(counts, w, h, color, fill = false) {
  if (!counts || counts.length < 2) return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  const max = Math.max(...counts, 1);
  const n   = counts.length;
  const pad = 2;

  const toX = i => ((i / (n - 1)) * (w - pad * 2) + pad);
  const toY = v => (h - pad - ((v / max) * (h - pad * 2)));

  const pts = counts.map((v, i) => ({ x: toX(i), y: toY(v) }));

  // Smooth bezier curve
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    const mx = ((p.x + c.x) / 2).toFixed(1);
    d += ` C${mx},${p.y.toFixed(1)} ${mx},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="none">`;

  if (fill) {
    svg += `<path d="${d} L${last.x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z" fill="${color}" opacity="0.12"/>`;
  }

  svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  svg += `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2" fill="${color}"/>`;
  svg += `</svg>`;
  return svg;
}

/* ─── Data loading ──────────────────────────────────────────── */

async function loadData() {
  for (const path of ['data.json', '../data/summary.json']) {
    try {
      const r = await fetch(path);
      if (r.ok) return r.json();
    } catch (_) {}
  }
  console.warn('Using sample data');
  document.getElementById('devBanner').hidden = false;
  return SAMPLE_DATA;
}

/* ─── Header stats ──────────────────────────────────────────── */

function renderHeaderStats(data) {
  const cards = Object.values(data.cards);
  document.getElementById('totalCards').textContent    = fmtNum(cards.length);
  document.getElementById('totalComments').textContent = fmtNum(sum(data.total_comments_by_date));

  if (data.date_range.start && data.date_range.end) {
    document.getElementById('dateRange').textContent =
      `${fmtDate(data.date_range.start)} – ${fmtDate(data.date_range.end)}`;
  }
  if (data.generated_at) {
    const d = new Date(data.generated_at);
    document.getElementById('lastUpdated').textContent =
      'Updated ' + d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'UTC', timeZoneName: 'short',
      });
  }
}

/* ─── Trend computation ─────────────────────────────────────── */

function computeSleeper(data) {
  const candidates = Object.entries(data.cards).map(([id, c]) => {
    const l7     = last7(c);
    const p14v   = prev14(c);
    const p14len = c.counts.slice(-21, -7).length || 1;
    const p14daily = p14v / p14len;

    if (l7 < 5)          return null;   // not enough recent signal
    if (p14daily >= 3)   return null;   // was already active — not a sleeper
    const ratio = l7 / Math.max(p14daily * 7, 0.5);
    if (ratio < 2)       return null;   // didn't actually spike

    const score = ratio * Math.log(l7 + 1);
    return { id, ...c, score, l7, p14: p14v, p14daily };
  }).filter(Boolean);

  if (!candidates.length) {
    // Fallback: biggest relative gainer overall
    const all = Object.entries(data.cards).map(([id, c]) => {
      const l7v  = last7(c);
      const p7v  = prev7(c);
      const pct  = p7v > 0 ? (l7v - p7v) / p7v : (l7v > 0 ? 10 : 0);
      return { id, ...c, score: pct, l7: l7v, p14: p7v * 2, p14daily: p7v / 7 };
    }).filter(x => x.l7 > 2);
    if (!all.length) return null;
    all.sort((a, b) => b.score - a.score);
    return all[0];
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function computeSurging(data, excludeIds = []) {
  return Object.entries(data.cards)
    .map(([id, c]) => {
      const l7v = last7(c);
      const p7v = prev7(c);
      if (l7v < 3) return null;
      const pct = p7v > 0 ? (l7v - p7v) / p7v : (l7v > 0 ? Infinity : 0);
      if (pct <= 0.1) return null;
      return { id, ...c, l7: l7v, p7: p7v, pct };
    })
    .filter(x => x && !excludeIds.includes(x.id))
    .sort((a, b) => {
      if (a.pct === Infinity && b.pct === Infinity) return b.l7 - a.l7;
      if (a.pct === Infinity) return -1;
      if (b.pct === Infinity) return 1;
      return b.pct - a.pct;
    })
    .slice(0, 6);
}

function computeFading(data, excludeIds = []) {
  return Object.entries(data.cards)
    .map(([id, c]) => {
      const l7v = last7(c);
      const p7v = prev7(c);
      if (p7v < 5) return null;   // wasn't significant before
      const pct = (l7v - p7v) / p7v;
      if (pct >= -0.1) return null;
      return { id, ...c, l7: l7v, p7: p7v, pct };
    })
    .filter(x => x && !excludeIds.includes(x.id))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6);
}

/* ─── Presets ───────────────────────────────────────────────── */

const PRESETS = {
  breakouts: {
    label: 'Breakouts',
    sub:   "this week's biggest jumps",
    compute: data => computeSurging(data).slice(0, 5).map(x => x.id),
  },
  newcomers: {
    label: 'Newly Discovered',
    sub:   'first seen in the last 2 weeks',
    compute: data => {
      const n      = data.dates.length;
      const cutoff = Math.max(0, n - 14);
      return Object.entries(data.cards).map(([id, c]) => {
        const firstIdx = c.counts.findIndex(v => v > 0);
        if (firstIdx < 0 || firstIdx < cutoff) return null;
        const recent = sum(c.counts.slice(cutoff));
        if (recent < 2) return null;
        return { id, recent };
      }).filter(Boolean)
        .sort((a, b) => b.recent - a.recent)
        .slice(0, 5)
        .map(x => x.id);
    },
  },
  climbers: {
    label: 'Long Climbers',
    sub:   '30-day upward trend',
    compute: data => {
      const n    = data.dates.length;
      const winS = Math.max(0, n - 30);
      return Object.entries(data.cards).map(([id, c]) => {
        const arr = c.counts.slice(winS);
        if (arr.length < 7) return null;
        const total = sum(arr);
        if (total < 15) return null;
        const len   = arr.length;
        const meanX = (len - 1) / 2;
        const meanY = total / len;
        let num = 0, den = 0;
        for (let i = 0; i < len; i++) {
          num += (i - meanX) * (arr[i] - meanY);
          den += (i - meanX) ** 2;
        }
        const slope = den > 0 ? num / den : 0;
        if (slope <= 0) return null;
        return { id, slope };
      }).filter(Boolean)
        .sort((a, b) => b.slope - a.slope)
        .slice(0, 5)
        .map(x => x.id);
    },
  },
  showdown: {
    label: 'Character Showdown',
    sub:   'each class aggregated',
    compute: data => {
      const seen = new Set();
      for (const c of Object.values(data.cards)) seen.add(c.character);
      return [...seen]
        .filter(c => c && c !== 'Unknown')
        .sort()
        .map(charIdOf);
    },
  },
  alltime: {
    label: 'All-Time Top',
    sub:   'most discussed overall',
    compute: data => Object.entries(data.cards)
      .map(([id, c]) => ({ id, total: sum(c.counts) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(x => x.id),
  },
};

function setActivePreset(name) {
  activePreset = name;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('preset-btn--active', btn.dataset.preset === name);
  });
}

function applyPreset(name, data) {
  const def = PRESETS[name];
  if (!def) return;
  const ids = def.compute(data);
  if (!ids.length) return;
  colorMap  = {};
  activeIds = ids;
  activeIds.forEach(id => ensureColor(id));
  refreshChart(data);
  syncAll();
  setActivePreset(name);
}

function setupPresetBar(data) {
  const bar = document.getElementById('presetBar');
  if (!bar) return;
  bar.innerHTML = '';
  Object.entries(PRESETS).forEach(([key, def]) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.preset = key;
    btn.setAttribute('role', 'tab');
    btn.innerHTML = `
      <span class="preset-label">${def.label}</span>
      <span class="preset-sub">${def.sub}</span>
    `;
    btn.addEventListener('click', () => applyPreset(key, data));
    bar.appendChild(btn);
  });
}

/* ─── Card detail modal ─────────────────────────────────────── */

function wikiUrlFor(name) {
  const slug = name.trim().replace(/\s+/g, '_');
  return `https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:${encodeURIComponent(slug)}`;
}

function computeCardStats(id, data) {
  const card    = data.cards[id];
  if (!card) return null;
  const counts  = card.counts;
  const totals  = data.total_comments_by_date || [];
  const total   = sum(counts);

  let peakVal = 0, peakIdx = -1;
  counts.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakIdx = i; } });

  const firstIdx = counts.findIndex(v => v > 0);
  const daysSinceFirst = firstIdx >= 0 ? counts.length - 1 - firstIdx : null;

  const l7v = last7(card);
  const p7v = prev7(card);
  const pct = p7v > 0 ? Math.round(((l7v - p7v) / p7v) * 100)
                      : (l7v > 0 ? null : 0);

  const sovWin   = 7;
  const cSlice   = counts.slice(-sovWin);
  const tSlice   = totals.slice(-sovWin);
  const cSum     = sum(cSlice);
  const tSum     = tSlice.reduce((a, b) => a + (b || 0), 0);
  const sov7     = tSum > 0 ? (cSum / tSum) * 100 : 0;

  const ranked = Object.entries(data.cards)
    .map(([rid, rc]) => ({ id: rid, l7: last7(rc) }))
    .filter(x => x.l7 > 0)
    .sort((a, b) => b.l7 - a.l7);
  const rankIdx = ranked.findIndex(r => r.id === id);
  const rank    = rankIdx >= 0 ? rankIdx + 1 : null;
  const rankedTotal = ranked.length;

  return { card, counts, total, peakVal, peakIdx, firstIdx, daysSinceFirst, l7v, p7v, pct, sov7, rank, rankedTotal };
}

function openCardDetail(id, data) {
  if (isCharId(id)) return; // char aggregates don't have a detail view
  const s = computeCardStats(id, data);
  if (!s) return;

  const { card, counts, total, peakVal, peakIdx, firstIdx, daysSinceFirst, l7v, p7v, pct, sov7, rank, rankedTotal } = s;
  const cc = ccOf(card.character);
  const rc = rcOf(card.rarity);
  const sparkSVG  = makeSpark(counts, 560, 88, cc, true);
  const sparkDates = data.dates;

  const pctClass = pct === null ? '' : (pct >= 0 ? 'surge' : 'fade');
  const pctLabel = pct === null
    ? (l7v > 0 ? 'new this week' : '—')
    : (pct >= 0 ? '+' : '') + pct + '% vs last week';

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="modal-head">
      <div class="modal-title" id="modalTitle">${card.name}</div>
      <div class="modal-meta">
        <span class="char-pill" style="color:${cc};border-color:${cc}">${card.character}</span>
        <span class="rarity-label" style="color:${rc}">${card.rarity}${card.type ? ' · ' + card.type : ''}</span>
      </div>
    </div>

    <div class="modal-spark">
      ${sparkSVG}
      <div class="modal-spark-axis">
        <span>${sparkDates.length ? fmtDate(sparkDates[0]) : ''}</span>
        <span>full history</span>
        <span>${sparkDates.length ? fmtDate(sparkDates[sparkDates.length - 1]) : ''}</span>
      </div>
    </div>

    <div class="modal-stats">
      <div class="mstat">
        <div class="mstat-lbl">This week</div>
        <div class="mstat-val ${pctClass}">${l7v}</div>
        <div class="mstat-sub">${pctLabel}</div>
      </div>
      <div class="mstat">
        <div class="mstat-lbl">All-time peak</div>
        <div class="mstat-val">${peakVal}</div>
        <div class="mstat-sub">${peakIdx >= 0 ? 'on ' + fmtDate(data.dates[peakIdx]) : '—'}</div>
      </div>
      <div class="mstat">
        <div class="mstat-lbl">First seen</div>
        <div class="mstat-val">${firstIdx >= 0 ? fmtDate(data.dates[firstIdx]) : '—'}</div>
        <div class="mstat-sub">${daysSinceFirst !== null ? daysSinceFirst + ' days ago' : 'not yet mentioned'}</div>
      </div>
      <div class="mstat">
        <div class="mstat-lbl">Share of voice</div>
        <div class="mstat-val">${sov7.toFixed(2)}%</div>
        <div class="mstat-sub">of comments this week</div>
      </div>
      <div class="mstat">
        <div class="mstat-lbl">Total mentions</div>
        <div class="mstat-val">${total}</div>
        <div class="mstat-sub">all time</div>
      </div>
      <div class="mstat">
        <div class="mstat-lbl">Current rank</div>
        <div class="mstat-val">${rank ? '#' + rank : '—'}</div>
        <div class="mstat-sub">${rank ? 'of ' + rankedTotal + ' active' : 'no mentions this week'}</div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="modal-btn modal-btn--primary" id="modalToggleBtn" data-id="${id}">
        ${activeIds.includes(id) ? '✓ Remove from chart' : '+ Add to chart'}
      </button>
      <a class="modal-btn modal-btn--wiki" href="${wikiUrlFor(card.name)}" target="_blank" rel="noopener">
        View on wiki ↗
      </a>
    </div>
  `;

  body.querySelector('#modalToggleBtn').addEventListener('click', () => {
    toggleChart(id);
    syncAll();
    const btn = body.querySelector('#modalToggleBtn');
    btn.textContent = activeIds.includes(id) ? '✓ Remove from chart' : '+ Add to chart';
  });

  const modal = document.getElementById('cardModal');
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeCardModal() {
  const modal = document.getElementById('cardModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function setupModal() {
  const modal = document.getElementById('cardModal');
  if (!modal) return;
  modal.addEventListener('click', e => {
    const t = e.target;
    if (t === modal || (t.dataset && t.dataset.close !== undefined) || t.closest('[data-close]')) {
      closeCardModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeCardModal();
  });
}

/* ─── Spotlight ─────────────────────────────────────────────── */

function renderSpotlight(data, sleeper) {
  const body = document.getElementById('spotlightBody');

  if (!sleeper) {
    body.innerHTML = '<p style="padding:2rem;color:var(--text-dim);font-style:italic">Not enough history yet to identify a sleeper.</p>';
    return;
  }

  const cc    = ccOf(sleeper.character);
  const rc    = rcOf(sleeper.rarity);
  const p7v   = prev7(sleeper);
  const pct   = p7v > 0 ? Math.round(((sleeper.l7 - p7v) / p7v) * 100) : null;
  const badge = pct !== null ? `+${pct}%` : 'NEW';

  const sparkCounts = sleeper.counts.slice(-28);
  const sparkSVG    = makeSpark(sparkCounts, 500, 90, cc, true);
  const sparkDates  = data.dates.slice(-28);

  body.innerHTML = `
    <div class="spotlight-info">
      <div class="spotlight-name">${sleeper.name}</div>
      <div class="spotlight-meta">
        <span class="char-pill" style="color:${cc};border-color:${cc}">${sleeper.character}</span>
        <span class="rarity-label" style="color:${rc}">${sleeper.rarity} ${sleeper.type}</span>
      </div>
      <div class="spotlight-stats">
        <div class="ss-row">
          <span class="ss-lbl">Last week</span>
          <span class="ss-val">${p7v} mention${p7v !== 1 ? 's' : ''}</span>
        </div>
        <div class="ss-row">
          <span class="ss-lbl">This week</span>
          <span class="ss-val big">${sleeper.l7} mentions</span>
        </div>
      </div>
      <div class="spotlight-badge">${badge}</div>
    </div>
    <div class="spotlight-viz" data-id="${sleeper.id}" tabindex="0" role="button" aria-label="Add ${sleeper.name} to chart">
      <div class="viz-label">28-day mention history</div>
      <div class="spotlight-spark">${sparkSVG}</div>
      <div class="viz-axis">
        <span>${fmtDate(sparkDates[0])}</span>
        <span>${fmtDate(sparkDates[sparkDates.length - 1])}</span>
      </div>
    </div>
  `;

  const viz = body.querySelector('.spotlight-viz');
  if (activeIds.includes(sleeper.id)) body.classList.add('in-chart');

  viz.addEventListener('click', () => openCardDetail(sleeper.id, data));
  viz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      viz.click();
    }
  });
}

/* ─── Trend rows ────────────────────────────────────────────── */

function renderTrends(data, surging, fading) {
  renderTrendList('surgingList', data, surging, 'surge');
  renderTrendList('fadingList',  data, fading,  'fade');
}

function renderTrendList(containerId, data, cards, dir) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';

  if (!cards.length) {
    wrap.innerHTML = '<p style="color:var(--text-dim);font-style:italic;font-size:.82rem;padding:.5rem 0">Nothing notable this week.</p>';
    return;
  }

  cards.forEach(card => {
    const cc    = ccOf(card.character);
    const spark = makeSpark(card.counts.slice(-14), 60, 28, cc);

    const pctLabel = card.pct === Infinity
      ? 'NEW'
      : (dir === 'surge' ? '+' : '') + Math.round(card.pct * 100) + '%';

    const row = document.createElement('div');
    row.className = 'trend-row' + (activeIds.includes(card.id) ? ' in-chart' : '');
    row.dataset.id = card.id;

    row.innerHTML = `
      <div class="trend-spark">${spark}</div>
      <div class="trend-info">
        <span class="trend-name">${card.name}</span>
        <span class="trend-char" style="color:${cc}">${card.character}</span>
      </div>
      <div class="trend-right">
        <span class="trend-pct ${dir}">${pctLabel}</span>
        <span class="trend-counts">${card.l7} ← ${card.p7}</span>
      </div>
    `;

    row.addEventListener('click', () => openCardDetail(card.id, data));
    wrap.appendChild(row);
  });
}

/* ─── Chart ─────────────────────────────────────────────────── */

function getDateSlice(data) {
  const end   = Math.min(dateEndIdx, data.dates.length - 1);
  const start = Math.max(0, dateStartIdx);
  return { start, end: end + 1 };
}

function toShareOfVoice(counts, totals) {
  return counts.map((v, i) => {
    const t = totals[i] || 0;
    return t > 0 ? (v / t) * 100 : 0;
  });
}

function buildDataset(id, data) {
  const series = seriesOf(id, data);
  if (!series) return null;
  const color = ensureColor(id);

  let raw = series.counts;
  if (useShareOfVoice) {
    raw = toShareOfVoice(raw, data.total_comments_by_date || []);
  }
  const full = useRollingAvg ? rollingAvg(raw) : raw;
  const { start, end } = getDateSlice(data);
  let yData = full.slice(start, end);
  if (useShareOfVoice) {
    yData = yData.map(v => Math.round(v * 100) / 100);
  }
  if (yData.every(v => v === 0)) return null;

  return {
    label:           series.name,
    data:            yData,
    borderColor:     color,
    backgroundColor: color + '20',
    borderWidth:     series.isChar ? 2.5 : 2,
    pointRadius:     yData.length > 60 ? 0 : 3,
    pointHoverRadius: 5,
    tension:         0.35,
    fill:            false,
    _id:             id,
  };
}

function initChart(data, initialIds) {
  const ctx   = document.getElementById('mainChart').getContext('2d');
  activeIds   = [...initialIds];
  activeIds.forEach(id => ensureColor(id));
  dateEndIdx  = data.dates.length - 1;

  const { start, end } = getDateSlice(data);
  const labels   = data.dates.slice(start, end).map(fmtDate);
  const datasets = activeIds.map(id => buildDataset(id, data)).filter(Boolean);

  chartInst = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 768 ? 1.6 : 2.8,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111122',
          borderColor:     '#343465',
          borderWidth:     1,
          titleColor:      '#c8a030',
          bodyColor:       '#b0b0cc',
          titleFont: { family: "'Cinzel', serif", size: 11 },
          bodyFont:  { family: "'Crimson Pro', serif", size: 13 },
          padding: 10,
          callbacks: {
            label: item => ` ${item.dataset.label}: ${item.raw}${useShareOfVoice ? '%' : ''}`,
          },
        },
      },
      scales: {
        x: {
          grid:   { color: 'rgba(34,34,64,.5)' },
          border: { color: '#222240' },
          ticks:  { color: '#5a5a7a', font: { family: "'Cinzel', serif", size: 9 }, maxTicksLimit: 12, maxRotation: 35 },
        },
        y: {
          beginAtZero: true,
          grid:   { color: 'rgba(34,34,64,.5)' },
          border: { color: '#222240' },
          ticks:  {
            color: '#5a5a7a',
            font:  { family: "'Cinzel', serif", size: 9 },
            callback: v => useShareOfVoice ? v + '%' : v,
          },
          title:  { display: true, text: 'Mentions', color: '#5a5a7a', font: { family: "'Cinzel', serif", size: 9 } },
        },
      },
    },
  });

  renderActiveTags(data);
}

function refreshChart(data) {
  if (!chartInst) return;
  const { start, end } = getDateSlice(data);
  chartInst.data.labels   = data.dates.slice(start, end).map(fmtDate);
  chartInst.data.datasets = activeIds.map(id => buildDataset(id, data)).filter(Boolean);
  chartInst.options.scales.y.title.text = useShareOfVoice ? 'Share of voice (%)' : 'Mentions';
  chartInst.update();
  renderActiveTags(data);
}

function toggleChart(id) {
  if (activeIds.includes(id)) {
    activeIds = activeIds.filter(x => x !== id);
  } else {
    if (!seriesOf(id, appData)) return;
    ensureColor(id);
    activeIds.push(id);
  }
  // Clicking a card breaks out of a preset into custom mode
  if (activePreset) setActivePreset(null);
  refreshChart(appData);
}

function renderActiveTags(data) {
  const wrap = document.getElementById('activeTags');
  wrap.innerHTML = '';
  activeIds.forEach(id => {
    const series = seriesOf(id, data);
    if (!series) return;
    const color = ensureColor(id);
    const tag   = document.createElement('div');
    tag.className = 'tag';
    tag.style.setProperty('--lc', color);
    tag.innerHTML = `
      <span class="tag-line" aria-hidden="true"></span>
      <span class="tag-name">${series.name}</span>
      <button class="tag-remove" title="Remove ${series.name}" aria-label="Remove ${series.name}">✕</button>
    `;
    tag.querySelector('.tag-remove').addEventListener('click', e => {
      e.stopPropagation();
      toggleChart(id);
      syncTrends();
      syncBrowser();
    });
    wrap.appendChild(tag);
  });
}

/* ─── UI sync ───────────────────────────────────────────────── */

function syncTrends() {
  document.querySelectorAll('.trend-row').forEach(row => {
    row.classList.toggle('in-chart', activeIds.includes(row.dataset.id));
  });
}

function syncBrowser() {
  document.querySelectorAll('.browser-tile').forEach(tile => {
    tile.classList.toggle('in-chart', activeIds.includes(tile.dataset.id));
  });
}

function syncAll() {
  syncTrends();
  syncBrowser();
  const sb = document.getElementById('spotlightBody');
  const viz = sb?.querySelector('.spotlight-viz');
  if (viz) sb.classList.toggle('in-chart', activeIds.includes(viz.dataset.id));
}

/* ─── Chart search ──────────────────────────────────────────── */

function setupChartSearch(data) {
  const inp  = document.getElementById('cardSearch');
  const drop = document.getElementById('searchDropdown');
  const all  = Object.entries(data.cards).map(([id, c]) => ({ id, ...c }));

  function showDrop() {
    const q = inp.value.trim().toLowerCase();
    if (!q) { drop.classList.remove('open'); return; }

    const hits = all.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
    if (!hits.length) { drop.classList.remove('open'); return; }

    drop.innerHTML = '';
    hits.forEach(card => {
      const added = activeIds.includes(card.id);
      const cc    = ccOf(card.character);
      const item  = document.createElement('div');
      item.className = 'sd-item' + (added ? ' added' : '');
      item.innerHTML = `
        <span class="sd-dot" style="background:${cc}"></span>
        <span>${card.name}</span>
        <span class="sd-char">${card.character}</span>
        ${added ? '<span style="font-size:.65rem">✓</span>' : ''}
      `;
      if (!added) {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          toggleChart(card.id);
          syncAll();
          inp.value = '';
          drop.classList.remove('open');
        });
      }
      drop.appendChild(item);
    });
    drop.classList.add('open');
  }

  inp.addEventListener('input',  showDrop);
  inp.addEventListener('focus',  showDrop);
  inp.addEventListener('blur',   () => setTimeout(() => drop.classList.remove('open'), 150));
}

/* ─── Chart controls (zoom, avg, reset) ─────────────────────── */

function setupChartControls(data) {
  document.getElementById('rollingAvg').addEventListener('change', e => {
    useRollingAvg = e.target.checked;
    refreshChart(data);
  });

  document.getElementById('shareOfVoice').addEventListener('change', e => {
    useShareOfVoice = e.target.checked;
    refreshChart(data);
  });

  document.getElementById('resetChart').addEventListener('click', () => {
    colorMap     = {};
    dateStartIdx = 0;
    dateEndIdx   = data.dates.length - 1;
    useRollingAvg = false;
    useShareOfVoice = false;
    document.getElementById('rollingAvg').checked = false;
    document.getElementById('shareOfVoice').checked = false;
    setZoomActive(0);
    applyPreset('breakouts', data);
  });

  function setZoomActive(days) {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.classList.toggle('zoom-btn--active', parseInt(btn.dataset.days) === days);
    });
  }

  document.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days);
      dateEndIdx  = data.dates.length - 1;
      dateStartIdx = days === 0 ? 0 : Math.max(0, data.dates.length - days);
      setZoomActive(days);
      refreshChart(data);
    });
  });
}

/* ─── All Cards Browser ─────────────────────────────────────── */

function renderBrowser(data) {
  const grid = document.getElementById('browserGrid');

  const filtered = Object.entries(data.cards).filter(([, c]) => {
    if (hiddenChars.has(c.character))            return false;
    if (rarityFilter && c.rarity !== rarityFilter) return false;
    if (browserQuery && !c.name.toLowerCase().includes(browserQuery)) return false;
    return true;
  });

  // Sort by this-week mentions (most active first)
  filtered.sort(([, a], [, b]) => last7(b) - last7(a));

  grid.innerHTML = '';

  if (!filtered.length) {
    grid.innerHTML = '<p class="browser-empty">No cards match the current filters.</p>';
    return;
  }

  filtered.forEach(([id, c]) => {
    const cc     = ccOf(c.character);
    const l7v    = last7(c);
    const spark  = makeSpark(c.counts.slice(-7), 50, 24, cc);
    const inChart = activeIds.includes(id);

    const tile = document.createElement('div');
    tile.className = 'browser-tile' + (inChart ? ' in-chart' : '');
    tile.dataset.id = id;
    tile.style.setProperty('--char-c', cc);
    tile.title = `${c.name} · ${c.character} · ${c.rarity}`;

    tile.innerHTML = `
      <div class="bt-name">${c.name}</div>
      <div class="bt-spark">${spark}</div>
      <div class="bt-meta">${c.character} · ${l7v > 0 ? `${l7v} this week` : 'quiet'}</div>
    `;

    tile.addEventListener('click', () => openCardDetail(id, data));
    grid.appendChild(tile);
  });
}

function setupBrowserFilters(data) {
  // Character pills
  const chars = [...new Set(Object.values(data.cards).map(c => c.character))].sort();
  const wrap  = document.getElementById('charFilters');

  chars.forEach(char => {
    const cc  = ccOf(char);
    const uid = `cf_${char.toLowerCase().replace(/\W/g, '_')}`;

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.id   = uid;
    inp.className = 'char-chk';
    inp.checked   = true;

    const lbl = document.createElement('label');
    lbl.htmlFor   = uid;
    lbl.className = 'char-lbl';
    lbl.style.setProperty('--cc', cc);
    lbl.innerHTML = `<span class="char-dot"></span>${char}`;

    inp.addEventListener('change', () => {
      inp.checked ? hiddenChars.delete(char) : hiddenChars.add(char);
      renderBrowser(data);
    });

    wrap.appendChild(inp);
    wrap.appendChild(lbl);
  });

  // Rarity filter
  document.getElementById('rarityFilter').addEventListener('change', e => {
    rarityFilter = e.target.value;
    renderBrowser(data);
  });

  // Browser text search
  document.getElementById('browserSearch').addEventListener('input', e => {
    browserQuery = e.target.value.trim().toLowerCase();
    renderBrowser(data);
  });
}

/* ─── Boot ──────────────────────────────────────────────────── */

async function init() {
  const data = await loadData();
  appData = data;

  if (!Object.keys(data.cards).length) {
    document.querySelector('main').innerHTML =
      '<p style="color:var(--text-dim);font-style:italic;padding:4rem;text-align:center">No card data yet.</p>';
    return;
  }

  renderHeaderStats(data);

  // Compute trends
  const sleeper     = computeSleeper(data);
  const excludeIds  = sleeper ? [sleeper.id] : [];
  const surging     = computeSurging(data, excludeIds);
  const fadingExcl  = excludeIds.concat(surging.map(s => s.id));
  const fading      = computeFading(data, fadingExcl);

  renderSpotlight(data, sleeper);
  renderTrends(data, surging, fading);

  // Chart starts with the Breakouts preset
  defaultIds = PRESETS.breakouts.compute(data);
  if (!defaultIds.length && sleeper) defaultIds = [sleeper.id];

  initChart(data, defaultIds);
  setActivePreset('breakouts');
  setupPresetBar(data);
  setupChartSearch(data);
  setupChartControls(data);
  setupBrowserFilters(data);
  setupModal();
  renderBrowser(data);
  syncAll();
}

document.addEventListener('DOMContentLoaded', init);
