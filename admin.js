// Match editor — an editable table of ALL matches (the whole tournament program
// is pre-loaded as rows), stored in the single Firestore `state/current` doc.
//
// Each row is one match. A match only counts toward the standings when its
// "Spillet" (played) box is ticked, so upcoming fixtures can sit in the table
// with no score until they're played. The public board (app.js) derives every
// team's standings from the played rows. Sign-in (shared password) to save.

import {
  auth, stateDoc, isConfigured, SHARED_EMAIL,
  getDoc, setDoc,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence,
} from './firebase-config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const root = $('#admin');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'm' + Date.now() + Math.random().toString(36).slice(2, 7));

const state = { data: null, user: null };

/* ---------- rendering ---------- */

function notice(msg, kind = 'ok') {
  const el = $('#notice');
  if (el) el.innerHTML = msg ? `<p class="form-note ${kind}">${esc(msg)}</p>` : '';
}

// Map a typed team name back to a pool teamId (else it's an outside opponent).
function nameToId(text) {
  const key = (text || '').trim().toLowerCase();
  if (!key) return '';
  const hit = Object.entries(state.data.teams || {}).find(([, t]) => (t.name || '').trim().toLowerCase() === key);
  return hit ? hit[0] : '';
}

// One side of a match. Once a team is assigned it's LOCKED (read-only text) so
// countries can't be changed after seeding — only an empty side (a freshly added
// row) is an editable field. Pool teams are recognised by name on save.
function sideCell(side, m) {
  const id = m[side] || '';
  const name = id ? ((state.data.teams[id] || {}).name || '') : (m[side + 'Name'] || '');
  const locked = !!(id || (m[side + 'Name'] || '').trim());
  if (locked) return `<span class="team-name locked">${esc(name)}</span>`;
  return `<input class="team-name" name="${side}Name" type="text" value="${esc(name)}"
    placeholder="hold" aria-label="Hold ${side.toUpperCase()}">`;
}

function renderConfigNeeded() {
  root.innerHTML = `<p class="error">Firebase er ikke sat op endnu. Indsæt din
    <code>firebaseConfig</code> i <code>firebase-config.js</code> (se README), og genindlæs.</p>`;
}

function renderLogin() {
  root.innerHTML = `
    <form id="login" class="entry-card" autocomplete="off">
      <h2>Log ind</h2>
      <p class="form-note">Skriv adgangskoden for at redigere kampe.</p>
      <label class="field"><span>Adgangskode</span>
        <input id="pw" type="password" autocomplete="current-password" required /></label>
      <div id="notice"></div>
      <button class="primary-btn" type="submit">Log ind</button>
    </form>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    notice('');
    try { await signInWithEmailAndPassword(auth, SHARED_EMAIL, $('#pw').value); }
    catch { notice('Forkert adgangskode.', 'bad'); }
  });
}

function rowHtml(m, i) {
  const card = (val, name, label) =>
    `<td data-label="${label}"><input class="kort" name="${name}" type="number" min="0"
       inputmode="numeric" value="${esc(val ?? 0)}" aria-label="${label}"></td>`;
  return `<tr data-i="${i}" data-id="${esc(m.id || '')}" class="${m.played ? 'is-played' : ''}"
    data-a-id="${esc(m.a || '')}" data-a-name="${esc(m.aName || '')}"
    data-b-id="${esc(m.b || '')}" data-b-name="${esc(m.bName || '')}">
    <td data-label="Dato" data-date="${esc(m.date || '')}">${m.date
      ? `<span class="date locked">${esc(m.date)}</span>`
      : `<input class="date" name="date" type="text" value="" placeholder="åååå-mm-dd" aria-label="Dato">`}</td>
    <td data-label="Hold A" class="side">${sideCell('a', m)}</td>
    <td data-label="Mål A"><input class="goal" name="ga" type="number" min="0" inputmode="numeric" value="${esc(m.ga ?? 0)}" aria-label="Mål A"></td>
    <td class="dash" aria-hidden="true">–</td>
    <td data-label="Mål B"><input class="goal" name="gb" type="number" min="0" inputmode="numeric" value="${esc(m.gb ?? 0)}" aria-label="Mål B"></td>
    <td data-label="Hold B" class="side">${sideCell('b', m)}</td>
    ${card(m.ya, 'ya', 'Gul A')}
    ${card(m.ra, 'ra', 'Rød A')}
    ${card(m.yb, 'yb', 'Gul B')}
    ${card(m.rb, 'rb', 'Rød B')}
    <td data-label="Spillet" class="played-cell">
      <input class="played" name="played" type="checkbox" ${m.played ? 'checked' : ''} aria-label="Spillet"></td>
    <td><button type="button" class="del ghost-btn" data-i="${i}" aria-label="Slet kamp">✕</button></td>
  </tr>`;
}

function renderTable() {
  const matches = state.data.matches || [];
  // Show fixtures in date order. Stable sort keeps same-day matches in their
  // existing order; sorting the stored array keeps row indices aligned for
  // delete/save (syncFromDom rebuilds from DOM order anyway).
  matches.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const played = matches.filter(m => m.played).length;

  const body = matches.length
    ? matches.map(rowHtml).join('')
    : `<tr class="empty"><td colspan="16">Ingen kampe endnu.</td></tr>`;

  const loadBtn = matches.length ? '' :
    `<button id="loadprog" class="primary-btn" type="button">Indlæs hele kampprogrammet</button>`;

  root.innerHTML = `
    <div class="entry-card wide">
      <div class="editor-head">
        <h2>Alle kampe <span class="count">${played}/${matches.length} spillet</span></h2>
        <button id="signout" class="ghost-btn" type="button">Log ud</button>
      </div>
      <p class="form-note">Skriv mål og kort ind, og sæt flueben i <strong>Spillet</strong>
        (det sættes automatisk, når du retter et resultat). Kun spillede kampe tæller i
        stillingen. Sejr/uafgjort/tab og point beregnes ud fra målene.</p>

      <div class="table-scroll">
        <table class="matches-table">
          <thead><tr>
            <th>Dato</th><th>Hold A</th><th>Mål</th><th></th><th>Mål</th><th>Hold B</th>
            <th>Gul A</th><th>Rød A</th><th>Gul B</th><th>Rød B</th><th>Spillet</th><th></th>
          </tr></thead>
          <tbody id="rows">${body}</tbody>
        </table>
      </div>

      <div id="notice"></div>
      <div class="editor-foot">
        ${loadBtn}
        <button id="reseed" class="ghost-btn danger" type="button">Nulstil alt fra data.json</button>
        <button id="add" class="ghost-btn" type="button">＋ Tilføj kamp</button>
        <button id="save" class="primary-btn" type="button">Gem ændringer</button>
      </div>
    </div>`;

  $('#signout').addEventListener('click', () => signOut(auth));
  $('#add').addEventListener('click', onAdd);
  $('#save').addEventListener('click', onSave);
  const lb = $('#loadprog'); if (lb) lb.addEventListener('click', loadProgram);
  $('#reseed').addEventListener('click', reseedAll);
  $$('.del').forEach(b => b.addEventListener('click', () => onDelete(+b.dataset.i)));

  // Editing any score/card auto-marks the row as played.
  $$('input.goal, input.kort').forEach(inp =>
    inp.addEventListener('input', () => {
      const cb = $('input.played', inp.closest('tr'));
      if (cb) cb.checked = true;
    }));
}

/* ---------- read the table back into state ---------- */

// Locked sides keep their team from the row's data-* attributes; an editable
// (empty/new) side reads its text input and resolves the name to a pool teamId.
function readSide(tr, side) {
  const inp = $(`input[name="${side}Name"]`, tr);   // present only when editable
  if (inp) {
    const id = nameToId(inp.value);
    return { id, name: id ? '' : inp.value.trim() };
  }
  return { id: tr.dataset[side + 'Id'] || '', name: tr.dataset[side + 'Name'] || '' };
}

function syncFromDom() {
  const rowsEl = $('#rows');
  if (!rowsEl) return;
  state.data.matches = $$('tr[data-i]', rowsEl).map(tr => {
    const val = name => { const el = $(`[name="${name}"]`, tr); return el ? el.value : ''; };
    const n = name => Math.max(0, Math.trunc(Number(val(name)) || 0));
    const a = readSide(tr, 'a'), b = readSide(tr, 'b');
    const dateInp = $('input[name="date"]', tr);          // present only when editable
    const dateCell = $('td[data-date]', tr);
    return {
      id: tr.dataset.id || uid(),
      date: dateInp ? dateInp.value.trim() : (dateCell ? dateCell.dataset.date : ''),
      a: a.id, aName: a.name,
      b: b.id, bName: b.name,
      ga: n('ga'), gb: n('gb'),
      ya: n('ya'), ra: n('ra'), yb: n('yb'), rb: n('rb'),
      played: $('input.played', tr).checked,
    };
  });
}

function onAdd() {
  syncFromDom();
  state.data.matches.push({
    id: uid(), date: today(), a: '', aName: '', b: '', bName: '',
    ga: 0, gb: 0, ya: 0, ra: 0, yb: 0, rb: 0, played: false,
  });
  renderTable();
}

function onDelete(i) {
  syncFromDom();
  state.data.matches.splice(i, 1);
  renderTable();
}

async function onSave() {
  syncFromDom();
  notice('');
  for (const m of state.data.matches) {
    if (m.a && m.a === m.b) return notice('En kamp kan ikke have det samme hold på begge sider.', 'bad');
  }
  state.data.lastUpdated = today();
  const btn = $('#save');
  btn.disabled = true;
  try {
    await setDoc(stateDoc, state.data);
    renderTable();
    const played = state.data.matches.filter(m => m.played).length;
    notice(`Gemt ✓ — ${played} spillet kamp${played === 1 ? '' : 'e'}. Stillingen er opdateret.`);
  } catch (err) {
    btn.disabled = false;
    notice('Kunne ikke gemme: ' + err.message, 'bad');
  }
}

// Full reseed: overwrite the entire Firestore document with data.json.
// Destructive — wipes any match results already entered. Confirm first.
async function reseedAll() {
  if (!confirm('Genindlæs ALT fra data.json? Dette overskriver hele dokumentet, '
    + 'inkl. eventuelle indtastede resultater. Kan ikke fortrydes.')) return;
  notice('Genindlæser alt fra data.json…');
  const btn = $('#reseed');
  btn.disabled = true;
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const seed = await res.json();
    seed.lastUpdated = today();
    await setDoc(stateDoc, seed);
    state.data = seed;
    renderTable();
    notice('Alt genindlæst fra data.json ✓');
  } catch (err) {
    btn.disabled = false;
    notice('Kunne ikke genindlæse: ' + err.message, 'bad');
  }
}

// One-time: pull the full fixture list from data.json into Firestore.
async function loadProgram() {
  notice('Indlæser kampprogram…');
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const seed = await res.json();
    state.data.matches = seed.matches || [];
    // Stats are now derived from matches; clear any legacy stored aggregates.
    for (const t of Object.values(state.data.teams || {})) {
      Object.assign(t, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, yellow: 0, red: 0 });
    }
    state.data.lastUpdated = today();
    await setDoc(stateDoc, state.data);
    renderTable();
    notice(`Kampprogram indlæst — ${state.data.matches.length} kampe.`);
  } catch (err) {
    notice('Kunne ikke indlæse: ' + err.message, 'bad');
  }
}

/* ---------- orchestration ---------- */

async function load() {
  if (!state.user) return renderLogin();
  try {
    const snap = await getDoc(stateDoc);
    if (!snap.exists()) {
      root.innerHTML = `<p class="error">Der er ingen data i Firestore endnu (se README).</p>`;
      return;
    }
    state.data = snap.data();
    state.data.matches = state.data.matches || [];
    renderTable();
  } catch (err) {
    root.innerHTML = `<p class="error">Kunne ikke hente data: ${esc(err.message)}</p>`;
  }
}

function boot() {
  if (!isConfigured) return renderConfigNeeded();
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  onAuthStateChanged(auth, user => { state.user = user; load(); });
}

boot();
