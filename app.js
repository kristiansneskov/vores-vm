// World Cup sweepstake — static, data-driven scoreboard.
// No build step: this module reads the data (live from Firestore, or bundled
// data.json as fallback), aggregates each player's two teams, ranks them, and
// renders the scoreboard + player detail views.

import { stateDoc, onSnapshot, isConfigured } from './firebase-config.js';

const FLAG_DIR = 'assets/flags';
const PHOTO_DIR = 'assets/players';
const FALLBACK_FLAG = `${FLAG_DIR}/_unknown.svg`;
const FALLBACK_PHOTO = `${PHOTO_DIR}/placeholder.svg`;

// Stat columns shown on the scoreboard. `dir` is the natural "best first"
// direction. Add a stat to data.json + one line here to add a column.
const COLUMNS = [
  { key: 'points',       label: 'P',       full: 'Point',         dir: 'desc' },
  { key: 'goalsFor',     label: 'MF',      full: 'Mål for',       dir: 'desc' },
  { key: 'goalsAgainst', label: 'MI',      full: 'Mål imod',      dir: 'asc'  },
  { key: 'goalDiff',     label: 'Diff',    full: 'Målforskel',    dir: 'desc', signed: true },
  { key: 'yellow',       label: 'Gul',     full: 'Gule kort',     dir: 'asc'  },
  { key: 'red',          label: 'Rød',     full: 'Røde kort',     dir: 'asc'  },
];

// Columns for the full per-nation table (the "Lande" view).
const TEAM_COLUMNS = [
  { key: 'played',       label: 'K',    full: 'Kampe',      dir: 'desc' },
  { key: 'won',          label: 'V',    full: 'Vundne',     dir: 'desc' },
  { key: 'drawn',        label: 'U',    full: 'Uafgjorte',  dir: 'desc' },
  { key: 'lost',         label: 'T',    full: 'Tabte',      dir: 'asc'  },
  { key: 'goalsFor',     label: 'MF',   full: 'Mål for',    dir: 'desc' },
  { key: 'goalsAgainst', label: 'MI',   full: 'Mål imod',   dir: 'asc'  },
  { key: 'goalDiff',     label: 'Diff', full: 'Målforskel', dir: 'desc', signed: true },
  { key: 'yellow',       label: 'Gul',  full: 'Gule kort',  dir: 'asc'  },
  { key: 'red',          label: 'Rød',  full: 'Røde kort',  dir: 'asc'  },
  { key: 'points',       label: 'P',    full: 'Point',      dir: 'desc' },
];

// Canonical standings order used for tie-breaking everywhere.
const TIEBREAK = [['points', 'desc'], ['goalDiff', 'desc'], ['goalsFor', 'desc']];

const state = {
  data: null,
  rows: [],          // [{ player, totals, teamList }]
  sortKey: 'points',
  sortDir: 'desc',
  teams: [],         // [{ id, name, code, ...stats, points, goalDiff }]
  teamOwner: {},     // teamId -> owning player's name
  teamSortKey: 'points',
  teamSortDir: 'desc',
};

/* ---------- helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function flagImg(team, cls = 'flag') {
  const code = (team && team.code ? team.code : '').toLowerCase();
  const name = team ? team.name : 'Unknown';
  const src = code ? `${FLAG_DIR}/${esc(code)}.svg` : FALLBACK_FLAG;
  return `<img class="${cls}" src="${src}" alt="Flag for ${esc(name)}" loading="lazy"
    onerror="this.onerror=null;this.src='${FALLBACK_FLAG}'">`;
}

function photoImg(player, cls) {
  const file = player.photo || `${player.id}.png`;
  const src = `${PHOTO_DIR}/${esc(file)}`;
  return `<img class="${cls}" src="${src}" alt="${esc(player.name)}" loading="lazy"
    onerror="this.onerror=null;this.src='${FALLBACK_PHOTO}'">`;
}

function fmt(val, col) {
  if (col && col.signed && val > 0) return `+${val}`;
  return String(val);
}

function signClass(key, val) {
  if (key !== 'goalDiff' && key !== 'fantasy') return '';
  return val > 0 ? 'pos' : val < 0 ? 'neg' : '';
}

/* ---------- data ---------- */

// Add one rostered side of a match into the running team-stat object.
function addSide(teams, id, gf, ga, yellow, red) {
  const t = teams[id];
  if (!t) return;                       // non-rostered opponent → ignored
  t.played++;
  t.goalsFor += gf; t.goalsAgainst += ga;
  t.yellow += yellow; t.red += red;
  if (gf > ga) t.won++; else if (gf === ga) t.drawn++; else t.lost++;
}

// The matches list is the source of truth: derive every team's raw stats from
// it. Until the first save migrates the seed (matches still empty), fall back to
// the stored per-team aggregates so the board keeps working.
function teamStatsFrom(data) {
  const teams = data.teams || {};
  const matches = data.matches || [];
  if (!matches.length) {
    const out = {};
    for (const [id, t] of Object.entries(teams)) out[id] = { ...t };
    return out;
  }
  const n = () => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, yellow: 0, red: 0 });
  const out = {};
  for (const [id, t] of Object.entries(teams)) out[id] = { name: t.name, code: t.code, ...n() };
  for (const m of matches) {
    if (!m.played) continue;            // fixtures (not yet played) don't count
    addSide(out, m.a, +m.ga || 0, +m.gb || 0, +m.ya || 0, +m.ra || 0);
    addSide(out, m.b, +m.gb || 0, +m.ga || 0, +m.yb || 0, +m.rb || 0);
  }
  return out;
}

function aggregate(player, teams, w) {
  const teamList = (player.teams || []).map(id => teams[id]).filter(Boolean);
  const sum = f => teamList.reduce((a, t) => a + (Number(f(t)) || 0), 0);
  const totals = {
    played:       sum(t => t.played),
    won:          sum(t => t.won),
    drawn:        sum(t => t.drawn),
    lost:         sum(t => t.lost),
    goalsFor:     sum(t => t.goalsFor),
    goalsAgainst: sum(t => t.goalsAgainst),
    yellow:       sum(t => t.yellow),
    red:          sum(t => t.red),
  };
  totals.points = totals.won * 3 + totals.drawn;
  totals.goalDiff = totals.goalsFor - totals.goalsAgainst;
  totals.fantasy = fantasyScore(totals, w);
  return { player, totals, teamList };
}

function fantasyScore(t, w) {
  return t.won * w.win + t.drawn * w.draw +
         t.goalsFor * w.goalFor + t.goalsAgainst * w.goalAgainst +
         t.yellow * w.yellow + t.red * w.red;
}

function compare(a, b, key, dir) {
  const m = dir === 'asc' ? 1 : -1;
  if (a.totals[key] !== b.totals[key]) return (a.totals[key] - b.totals[key]) * m;
  for (const [k, d] of TIEBREAK) {
    if (a.totals[k] !== b.totals[k]) return (a.totals[k] - b.totals[k]) * (d === 'asc' ? 1 : -1);
  }
  return a.player.name.localeCompare(b.player.name);
}

function sortedRows() {
  return [...state.rows].sort((a, b) => compare(a, b, state.sortKey, state.sortDir));
}

// Same idea as compare(), but for flat team objects (team.points, not team.totals).
function compareTeams(a, b, key, dir) {
  const m = dir === 'asc' ? 1 : -1;
  if (a[key] !== b[key]) return (a[key] - b[key]) * m;
  for (const [k, d] of TIEBREAK) {
    if (a[k] !== b[k]) return (a[k] - b[k]) * (d === 'asc' ? 1 : -1);
  }
  return a.name.localeCompare(b.name);
}

function sortedTeams() {
  return [...state.teams].sort((a, b) => compareTeams(a, b, state.teamSortKey, state.teamSortDir));
}

/* ---------- routing ---------- */

function currentRoute() {
  const m = location.hash.match(/^#\/player\/(.+)$/);
  if (m) return { view: 'player', id: decodeURIComponent(m[1]) };
  if (location.hash === '#/lande') return { view: 'teams' };
  return { view: 'board' };
}

function render() {
  const route = currentRoute();
  if (route.view === 'player') {
    const row = state.rows.find(r => r.player.id === route.id);
    if (row) return renderDetail(row);
    location.hash = '';   // unknown id → back to board
  }
  if (route.view === 'teams') return renderTeams();
  renderBoard();
}

// Top-of-page switch between the player board and the full nations table.
function viewTabs(active) {
  const tab = (id, href, label) =>
    `<a class="view-tab ${active === id ? 'is-active' : ''}" href="${href}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="view-tabs" aria-label="Visning">${tab('spillere', '#', 'Spillere')}${tab('lande', '#/lande', 'Lande')}</nav>`;
}

/* ---------- scoreboard ---------- */

function renderBoard() {
  const rows = sortedRows();
  const app = $('#app');

  const options = COLUMNS.map(c =>
    `<option value="${c.key}" ${c.key === state.sortKey ? 'selected' : ''}>${esc(c.full)}</option>`).join('');

  const head = `<tr>
    <th class="col-player">Spiller</th>
    ${COLUMNS.map(c => {
      const isSort = c.key === state.sortKey;
      const arrow = isSort ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
      return `<th class="sortable ${isSort ? 'is-sort' : ''}" data-key="${c.key}" title="${esc(c.full)}">
        ${esc(c.label)} <span class="arrow">${arrow}</span></th>`;
    }).join('')}
  </tr>`;

  const body = rows.map((r, i) => {
    const rank = i + 1;
    const rankCls = rank <= 3 ? `rank-${rank}` : '';
    const cells = COLUMNS.map(c => {
      const v = r.totals[c.key];
      const isSort = c.key === state.sortKey;
      return `<td class="stat ${isSort ? 'is-sort' : ''} ${signClass(c.key, v)}" data-label="${esc(c.full)}">
        <span class="v">${fmt(v, c)}</span></td>`;
    }).join('');
    return `<tr class="${rankCls}" data-id="${esc(r.player.id)}" tabindex="0" role="button"
      aria-label="Se ${esc(r.player.name)}">
      <td class="cell-player">
        <span class="rank-badge">${rank}</span>
        ${photoImg(r.player, 'avatar')}
        <span class="who">
          <span class="pname">${esc(r.player.name)}</span>
          <span class="pflags">${r.teamList.map(t => flagImg(t)).join('')}</span>
        </span>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  app.innerHTML = `
    ${viewTabs('spillere')}
    <div class="toolbar">
      <span class="label">Sortér efter</span>
      <select id="sort-select" aria-label="Sortér efter">${options}</select>
      <button class="dir-btn" id="dir-btn" aria-label="Skift sorteringsretning">
        ${state.sortDir === 'asc' ? '▲ Stigende' : '▼ Faldende'}
      </button>
    </div>
    <div class="scoreboard">
      <table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  // events
  $('#sort-select').addEventListener('change', e => {
    const col = COLUMNS.find(c => c.key === e.target.value);
    setSort(col.key, col.dir);
  });
  $('#dir-btn').addEventListener('click', () => {
    setSort(state.sortKey, state.sortDir === 'asc' ? 'desc' : 'asc');
  });
  app.querySelectorAll('thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (key === state.sortKey) {
        setSort(key, state.sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        setSort(key, COLUMNS.find(c => c.key === key).dir);
      }
    });
  });
  app.querySelectorAll('tbody tr').forEach(tr => {
    const go = () => { location.hash = `#/player/${encodeURIComponent(tr.dataset.id)}`; };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  window.scrollTo(0, 0);
}

function setSort(key, dir) {
  state.sortKey = key;
  state.sortDir = dir;
  renderBoard();
}

/* ---------- nations table (Lande) ---------- */

function renderTeams() {
  const rows = sortedTeams();
  const app = $('#app');

  const options = TEAM_COLUMNS.map(c =>
    `<option value="${c.key}" ${c.key === state.teamSortKey ? 'selected' : ''}>${esc(c.full)}</option>`).join('');

  const head = `<tr>
    <th class="col-player">Land</th>
    ${TEAM_COLUMNS.map(c => {
      const isSort = c.key === state.teamSortKey;
      const arrow = isSort ? (state.teamSortDir === 'asc' ? '▲' : '▼') : '';
      return `<th class="sortable ${isSort ? 'is-sort' : ''}" data-key="${c.key}" title="${esc(c.full)}">
        ${esc(c.label)} <span class="arrow">${arrow}</span></th>`;
    }).join('')}
  </tr>`;

  const body = rows.map((team, i) => {
    const owner = state.teamOwner[team.id];
    const cells = TEAM_COLUMNS.map(c => {
      const v = team[c.key];
      const isSort = c.key === state.teamSortKey;
      return `<td class="stat ${isSort ? 'is-sort' : ''} ${signClass(c.key, v)}" data-label="${esc(c.full)}">
        <span class="v">${fmt(v, c)}</span></td>`;
    }).join('');
    return `<tr>
      <td class="cell-player">
        <span class="rank-badge">${i + 1}</span>
        ${flagImg(team, 'flag flag-lg')}
        <span class="who">
          <span class="pname">${esc(team.name)}</span>
          ${owner ? `<span class="owner">Holder: ${esc(owner)}</span>` : ''}
        </span>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  app.innerHTML = `
    ${viewTabs('lande')}
    <div class="toolbar">
      <span class="label">Sortér efter</span>
      <select id="sort-select" aria-label="Sortér efter">${options}</select>
      <button class="dir-btn" id="dir-btn" aria-label="Skift sorteringsretning">
        ${state.teamSortDir === 'asc' ? '▲ Stigende' : '▼ Faldende'}
      </button>
    </div>
    <div class="scoreboard static">
      <table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  $('#sort-select').addEventListener('change', e => {
    const col = TEAM_COLUMNS.find(c => c.key === e.target.value);
    setTeamSort(col.key, col.dir);
  });
  $('#dir-btn').addEventListener('click', () => {
    setTeamSort(state.teamSortKey, state.teamSortDir === 'asc' ? 'desc' : 'asc');
  });
  app.querySelectorAll('thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (key === state.teamSortKey) {
        setTeamSort(key, state.teamSortDir === 'asc' ? 'desc' : 'asc');
      } else {
        setTeamSort(key, TEAM_COLUMNS.find(c => c.key === key).dir);
      }
    });
  });

  window.scrollTo(0, 0);
}

function setTeamSort(key, dir) {
  state.teamSortKey = key;
  state.teamSortDir = dir;
  renderTeams();
}

/* ---------- player detail ---------- */

function teamStatRows(t) {
  const pts = t.won * 3 + t.drawn;
  const gd = t.goalsFor - t.goalsAgainst;
  const rows = [
    ['Kampe', t.played],
    ['V–U–T', `${t.won}–${t.drawn}–${t.lost}`],
    ['Point', pts],
    ['Mål', `${t.goalsFor} : ${t.goalsAgainst}`],
    ['Målforskel', (gd > 0 ? '+' : '') + gd],
    ['Gule kort', t.yellow],
    ['Røde kort', t.red],
  ];
  return rows.map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="vv">${esc(v)}</span></div>`).join('');
}

function renderDetail(row) {
  const rank = sortedRows4Rank(row);
  const t = row.totals;
  const app = $('#app');
  app.innerHTML = `
    <a class="detail-back" href="#">← Tilbage til stillingen</a>
    <div class="detail-card">
      <div class="detail-hero">
        ${photoImg(row.player, 'avatar-lg')}
        <div>
          <h2 class="pname">${esc(row.player.name)}</h2>
          <p class="rank-line">I øjeblikket nr. <strong>${rank}</strong> af ${state.rows.length} ·
            ${esc(row.teamList.map(x => x.name).join(' og '))}</p>
        </div>
      </div>
      <div class="totals">
        <div class="tcell"><div class="tnum">${t.points}</div><div class="tlbl">Point</div></div>
        <div class="tcell"><div class="tnum ${signClass('goalDiff', t.goalDiff)}">${fmt(t.goalDiff, { signed: true })}</div><div class="tlbl">Målforskel</div></div>
      </div>
      <div class="detail-teams">
        ${row.teamList.map(team => `
          <div class="team-card">
            <div class="thead">${flagImg(team)}<span class="tname">${esc(team.name)}</span></div>
            <div class="team-stats">${teamStatRows(team)}</div>
          </div>`).join('')}
      </div>
    </div>`;
  window.scrollTo(0, 0);
}

// Rank by canonical standings (points → GD → GF), independent of current sort.
function sortedRows4Rank(row) {
  const ranked = [...state.rows].sort((a, b) => compare(a, b, 'points', 'desc'));
  return ranked.findIndex(r => r.player.id === row.player.id) + 1;
}

/* ---------- boot ---------- */

// Populate state from a data object (same shape as data.json / the Firestore
// `state/current` doc) and refresh the static header bits. Called on every
// Firestore snapshot, so the board updates live when a match is saved.
function applyData(data) {
  state.data = data;

  const w = data.fantasyWeights || { win: 3, draw: 1, goalFor: 1, goalAgainst: -1, yellow: -1, red: -3 };
  const teamStats = teamStatsFrom(data);
  state.rows = (data.players || []).map(p => aggregate(p, teamStats, w));

  state.teams = Object.entries(teamStats).map(([id, t]) => ({
    id, ...t,
    points: t.won * 3 + t.drawn,
    goalDiff: t.goalsFor - t.goalsAgainst,
  }));
  state.teamOwner = {};
  (data.players || []).forEach(p => (p.teams || []).forEach(tid => { state.teamOwner[tid] = p.name; }));

  if (data.title) {
    document.title = data.title;
    $('#site-title').textContent = data.title;
  }
  $('#site-subtitle').textContent = data.subtitle || '';
  if (data.lastUpdated) $('#last-updated').textContent = `Opdateret ${data.lastUpdated}`;
  $('#player-count').textContent = `${state.rows.length} spiller${state.rows.length === 1 ? '' : 'e'}`;
}

function showError(err) {
  $('#app').innerHTML = `<p class="error">Kunne ikke indlæse data — ${esc(err.message)}.
    Hvis du åbnede filen direkte, så kør en lokal server i mappen (se README).</p>`;
}

// Bundled data.json is the seed source and the offline/last-resort fallback.
async function loadFallback() {
  const res = await fetch('data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function useFallback(originalErr) {
  loadFallback()
    .then(data => { applyData(data); render(); })
    .catch(() => showError(originalErr));
}

async function boot() {
  window.addEventListener('hashchange', render);

  // Without a real Firebase config, just run off bundled data.json.
  if (!isConfigured) {
    try { applyData(await loadFallback()); render(); }
    catch (err) { showError(err); }
    return;
  }

  // Live-subscribe to the single state document. Each change re-renders the
  // current view, so a saved match appears within seconds with no reload.
  onSnapshot(stateDoc, snap => {
    if (!snap.exists()) return useFallback(new Error('Firestore er ikke seedet endnu'));
    applyData(snap.data());
    render();
  }, err => useFallback(err));
}

boot();
