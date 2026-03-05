/* ═══════════════════════════════════════════
   AWESOME BLOCKS – SCRIPT
   ═══════════════════════════════════════════
   CONFIG – update these before deploying
   ═══════════════════════════════════════════ */

const CONFIG = {
  // Password to access the app
  PASSWORD: 'awesomeblocks2024',

  // Separate password to access the Settings page (share only with HR/admins)
  ADMIN_PASSWORD: 'e3admin',

  // Paste your Google Apps Script web app URL here (see setup instructions).
  // This single URL handles both submission logging and milestone emails.
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbynhKUt8irMs2HjratCFnAfgaUvd_zzS13hhDaBXhJknsTvIe8zjOQ6SKNmZpBJ-37A/exec',

  // List all team members here
  TEAM_MEMBERS: [
    'Abby Hines',
    'Allison Hunt',
    'Amy Burklow',
    'Ashley Booth',
    'Bennett Clark',
    'Brian Cole',
    'Cade Jones',
    'Carrie Marsteller',
    'Charlie May',
    'Colton Angel',
    'Dom Dippel',
    'Elijah VanDine',
    'Heather Hoerr',
    'Jess Ferguson',
    'JoAnna Keilman',
    'John Gough',
    'Karen Seketa',
    'Kay Manary',
    'Kayla Searles',
    'Kyler Mason',
    'Lehla Kisor',
    'Madie Lutzke',
    'Noah Gregg',
    'Rachel Young',
    'Reid Morris',
    'Roman Smith',
    'Sarah Riggio',
    'Steven Hileman',
    'Theresa Behrens Goodall',
    'Tiffany Sauder',
    'Victoria Shaw',
  ],
};

/* ═══════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════ */
const STATE = {
  submissions: [],  // loaded from localStorage
};

/* ═══════════════════════════════════════════
   STORAGE HELPERS
   ═══════════════════════════════════════════ */
function loadSubmissions() {
  try {
    const raw = localStorage.getItem('ab_submissions');
    STATE.submissions = raw ? JSON.parse(raw) : [];
  } catch {
    STATE.submissions = [];
  }
}

function saveSubmissions() {
  localStorage.setItem('ab_submissions', JSON.stringify(STATE.submissions));
}

/* ═══════════════════════════════════════════
   SEED DATA  (historical points as of Jan 2026)
   ═══════════════════════════════════════════ */
const SEED_POINTS = {
  'Colton Angel':           100,
  'Ashley Booth':           570,
  'Amy Burklow':            735,
  'Bennett Clark':          475,
  'Brian Cole':             810,
  'Jess Ferguson':         1130,
  'Theresa Behrens Goodall': 965,
  'John Gough':             300,
  'Noah Gregg':             595,
  'Heather Hoerr':            5,
  'Steven Hileman':          30,
  'Abby Hines':             595,
  'Allison Hunt':            75,
  'Cade Jones':             610,
  'JoAnna Keilman':          10,
  'Madie Lutzke':           220,
  'Carrie Marsteller':     1060,
  'Kyler Mason':            290,
  'Charlie May':              5,
  'Reid Morris':            705,
  'Sarah Riggio':           195,
  'Kayla Searles':          585,
  'Karen Seketa':           140,
  'Victoria Shaw':          260,
  'Roman Smith':             55,
  'Rachel Young':           275,
};

/* ═══════════════════════════════════════════
   POINTS LEDGER (historical balances)
   ═══════════════════════════════════════════ */
function loadPointsLedger() {
  try {
    const raw = localStorage.getItem('ab_points_ledger');
    if (raw) return JSON.parse(raw);
    // First load — seed from historical data and persist it
    savePointsLedger(SEED_POINTS);
    return { ...SEED_POINTS };
  } catch { return { ...SEED_POINTS }; }
}

function savePointsLedger(ledger) {
  localStorage.setItem('ab_points_ledger', JSON.stringify(ledger));
}

/* ═══════════════════════════════════════════
   CSV PARSER
   ═══════════════════════════════════════════ */
function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1)
    .map(line => {
      const vals = parseCSVRow(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    })
    .filter(row => Object.values(row).some(v => v));
}

function parseImportDate(str) {
  if (!str) return null;
  // Try direct parse (handles ISO, "Mar 5, 2026", "1/15/2026", etc.)
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString();
  return null;
}

/* ═══════════════════════════════════════════
   TEAM CONFIG (admin-managed roster)
   ═══════════════════════════════════════════ */
function getTeamConfig() {
  try {
    const raw = localStorage.getItem('ab_team_config');
    if (raw) return JSON.parse(raw);
    // Seed from hardcoded list on first load
    const def = {
      members: CONFIG.TEAM_MEMBERS.map(name => ({ name, email: '', manager: '' })),
      talentHead: '',
    };
    saveTeamConfig(def);
    return def;
  } catch {
    return { members: CONFIG.TEAM_MEMBERS.map(name => ({ name, email: '', manager: '' })), talentHead: '' };
  }
}

function saveTeamConfig(config) {
  localStorage.setItem('ab_team_config', JSON.stringify(config));
}

function getTeamMemberNames() {
  return getTeamConfig().members.map(m => m.name).filter(Boolean).sort();
}

/* ═══════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════ */
function isLoggedIn() {
  return sessionStorage.getItem('ab_auth') === 'true';
}

function login() {
  sessionStorage.setItem('ab_auth', 'true');
  showApp();
}

function logout() {
  sessionStorage.removeItem('ab_auth');
  showLogin();
}

/* ═══════════════════════════════════════════
   PAGE ROUTING
   ═══════════════════════════════════════════ */
function showLogin() {
  document.getElementById('page-login').classList.add('active');
  document.getElementById('page-login').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('page-login').classList.remove('active');
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  navigateTo('page-give');
}

function navigateTo(targetId) {
  // Update app pages
  document.querySelectorAll('.app-page').forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  const target = document.getElementById(targetId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === targetId);
  });

  // Refresh page-specific content
  if (targetId === 'page-feed')      renderFeed();
  if (targetId === 'page-dashboard') renderDashboard();
  if (targetId === 'page-admin')     renderAdminGate();
}

/* ═══════════════════════════════════════════
   POPULATE DROPDOWNS
   ═══════════════════════════════════════════ */
function populateTeamDropdowns() {
  const giverSel   = document.getElementById('giver');
  const awardeeSel = document.getElementById('awardee');
  const names = getTeamMemberNames();

  giverSel.innerHTML   = '<option value="">Select your name…</option>';
  awardeeSel.innerHTML = '<option value="">Select recipient…</option>';

  names.forEach(name => {
    [giverSel, awardeeSel].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });
}

/* ═══════════════════════════════════════════
   CHARACTER COUNTER
   ═══════════════════════════════════════════ */
function initCharCounter() {
  const textarea  = document.getElementById('award-message');
  const remaining = document.getElementById('char-remaining');
  textarea.addEventListener('input', () => {
    const left = 500 - textarea.value.length;
    remaining.textContent = left;
    remaining.style.color = left < 50 ? '#EF4444' : '';
  });
}

/* ═══════════════════════════════════════════
   SUBMIT AWARD FORM
   ═══════════════════════════════════════════ */
async function handleAwardSubmit(e) {
  e.preventDefault();

  const giver   = document.getElementById('giver').value;
  const awardee = document.getElementById('awardee').value;
  const value   = document.getElementById('company-value').value;
  const message = document.getElementById('award-message').value.trim();

  const errorEl   = document.getElementById('form-error');
  const successEl = document.getElementById('form-success');

  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  // Validation
  if (giver === awardee) {
    showFormError("You can't give an award to yourself!");
    return;
  }

  // UI – loading state
  setSubmitLoading(true);

  const submission = {
    id:        Date.now(),
    timestamp: new Date().toISOString(),
    giver,
    awardee,
    value,
    message,
    status:    'pending',
  };

  // Save locally — email + feed publish happen only after admin approves
  STATE.submissions.unshift(submission);
  saveSubmissions();

  // Notify admin that there's a pending submission to review
  sendPendingNotification(submission);

  setSubmitLoading(false);

  // Reset form
  e.target.reset();
  document.getElementById('char-remaining').textContent = '500';

  // Show thank-you card
  showThankYou(giver, awardee, value);
}

function setSubmitLoading(loading) {
  const btn     = document.getElementById('submit-btn');
  const label   = document.getElementById('submit-label');
  const spinner = document.getElementById('submit-spinner');
  btn.disabled = loading;
  label.textContent = loading ? 'Submitting…' : 'Submit Award';
  spinner.classList.toggle('hidden', !loading);
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showFormSuccess(msg) {
  const el = document.getElementById('form-success');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function showThankYou(giver, awardee, value) {
  document.getElementById('award-form').classList.add('hidden');
  document.getElementById('thank-you-subtext').textContent =
    `${giver} recognized ${awardee} for "${value}". That's what Awesome Blocks is all about!`;
  document.getElementById('thank-you-card').classList.remove('hidden');
}

/* ═══════════════════════════════════════════
   CSV IMPORT HANDLERS
   ═══════════════════════════════════════════ */
function showImportStatus(msg, isError) {
  const el = document.getElementById('import-status');
  el.textContent = msg;
  el.className = 'import-status' + (isError ? ' import-error' : ' import-ok');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function handlePointsImport(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    const ledger = loadPointsLedger();
    let count = 0;

    rows.forEach(row => {
      // Accept "name", "full name", OR "first name" + "last name" columns
      let name = row['name'] || row['full name'] || row['fullname'];
      if (!name) {
        const first = row['first name'] || row['firstname'] || row['first'] || '';
        const last  = row['last name']  || row['lastname']  || row['last']  || '';
        if (first) name = `${first} ${last}`.trim();
      }
      const pts = parseInt(row['points'] || row['point'] || row['total points'] || row['total'] || '0', 10);
      if (name && !isNaN(pts) && pts > 0) {
        ledger[name] = pts;   // set (not add) — so re-importing replaces value
        count++;
      }
    });

    savePointsLedger(ledger);
    showImportStatus(`✓ Imported points for ${count} ${count === 1 ? 'person' : 'people'}.`);
    renderDashboard();
  };
  reader.readAsText(file);
}

function handleSubmissionsImport(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    let count = 0;

    rows.forEach((row, i) => {
      const giver   = row['from'] || row['giver'] || row['given by'] || row['sender'] || '';
      const awardee = row['to']   || row['awardee'] || row['recipient'] || row['received by'] || '';
      if (!giver || !awardee) return;

      const value   = row['value'] || row['company value'] || row['award value'] || '';
      const message = row['message'] || row['notes'] || row['note'] || row['recognition'] || '';
      const dateStr = row['date'] || '';
      const ts      = parseImportDate(dateStr) || new Date().toISOString();

      STATE.submissions.push({ id: Date.now() + i, timestamp: ts, giver, awardee, value, message });
      count++;
    });

    STATE.submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    saveSubmissions();
    showImportStatus(`✓ Imported ${count} ${count === 1 ? 'Awesome Block Submission' : 'Awesome Block Submissions'}.`);
    renderDashboard();
  };
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════
   ZAPIER INTEGRATION
   ═══════════════════════════════════════════ */
async function sendToZapier(submission) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
    console.warn('Google Script URL not configured. Set CONFIG.GOOGLE_SCRIPT_URL in script.js.');
    return false;
  }
  try {
    // text/plain avoids CORS preflight while Apps Script still receives the JSON body
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'submission', ...buildZapierPayload(submission) }),
    });
    return true;
  } catch (err) {
    console.error('Google Script send failed:', err);
    return false;
  }
}

function buildZapierPayload(submission) {
  const config  = getTeamConfig();
  const find    = name => config.members.find(m => m.name === name) || {};
  const awardee = find(submission.awardee);
  const giver   = find(submission.giver);
  const manager = find(awardee.manager);
  const talent  = find(config.talentHead);
  return {
    date:               new Date(submission.timestamp).toLocaleDateString(),
    time:               new Date(submission.timestamp).toLocaleTimeString(),
    giver:              submission.giver,
    giver_email:        giver.email        || '',
    awardee:            submission.awardee,
    awardee_email:      awardee.email      || '',
    manager_name:       awardee.manager    || '',
    manager_email:      manager.email      || '',
    talent_head_name:   config.talentHead  || '',
    talent_head_email:  talent.email       || '',
    company_value:      submission.value,
    message:            submission.message,
  };
}

async function sendMilestoneToZapier(awardeeName, totalAwards) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;
  const config   = getTeamConfig();
  const find     = name => config.members.find(m => m.name === name) || {};
  const awardee  = find(awardeeName);
  const manager  = find(awardee.manager);
  const admin    = find(config.talentHead);
  const payload  = {
    type:           'milestone',
    awardee_name:   awardeeName,
    awardee_email:  awardee.email      || '',
    manager_name:   awardee.manager    || '',
    manager_email:  manager.email      || '',
    admin_name:     config.talentHead  || '',
    admin_email:    admin.email        || '',
    total_awards:   totalAwards,
  };
  try {
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Milestone send failed:', err);
  }
}

async function sendPendingNotification(submission) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;
  const config  = getTeamConfig();
  const admin   = config.members.find(m => m.name === config.talentHead) || {};
  if (!admin.email) return;
  const payload = {
    type:          'pending_notification',
    admin_email:   admin.email,
    admin_name:    config.talentHead || 'Admin',
    giver:         submission.giver,
    awardee:       submission.awardee,
    company_value: submission.value,
    message:       submission.message,
  };
  try {
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Pending notification failed:', err);
  }
}

/* ═══════════════════════════════════════════
   ADMIN / SETTINGS PAGE
   ═══════════════════════════════════════════ */
function isAdminUnlocked() {
  return sessionStorage.getItem('ab_admin_auth') === 'true';
}

function renderAdminGate() {
  const content = document.getElementById('admin-content');
  const gate    = document.getElementById('admin-gate');
  if (isAdminUnlocked()) {
    gate.classList.add('hidden');
    content.classList.remove('hidden');
    renderAdminPage();
  } else {
    content.classList.add('hidden');
    gate.classList.remove('hidden');
    document.getElementById('admin-gate-error').classList.add('hidden');
    document.getElementById('admin-gate-password').value = '';
    setTimeout(() => document.getElementById('admin-gate-password').focus(), 50);
  }
}

function renderAdminPage() {
  renderPendingQueue();
  const config  = getTeamConfig();
  const members = config.members;
  const names   = members.map(m => m.name).filter(Boolean);

  // Talent head select
  const talentSel = document.getElementById('admin-talent-head');
  talentSel.innerHTML = '<option value="">Select person…</option>';
  names.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    if (n === config.talentHead) opt.selected = true;
    talentSel.appendChild(opt);
  });

  // Members table
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = members.map((m, i) => {
    const managerOpts = names
      .filter((_, j) => j !== i)
      .map(n => `<option value="${escHtml(n)}" ${n === m.manager ? 'selected' : ''}>${escHtml(n)}</option>`)
      .join('');
    return `
      <tr>
        <td><input type="text"  class="admin-input admin-name"    value="${escHtml(m.name)}"        placeholder="Full Name" /></td>
        <td><input type="email" class="admin-input admin-email"   value="${escHtml(m.email || '')}" placeholder="name@elementthree.com" /></td>
        <td><select class="admin-input admin-manager"><option value="">No manager</option>${managerOpts}</select></td>
        <td><button class="admin-remove-btn" type="button" title="Remove">✕</button></td>
      </tr>`;
  }).join('');
}

function saveAdminChanges() {
  const talentHead = document.getElementById('admin-talent-head').value;
  const members = [];
  document.querySelectorAll('#admin-tbody tr').forEach(row => {
    const name    = row.querySelector('.admin-name').value.trim();
    const email   = row.querySelector('.admin-email').value.trim();
    const manager = row.querySelector('.admin-manager').value;
    if (name) members.push({ name, email, manager });
  });
  saveTeamConfig({ members, talentHead });
  populateTeamDropdowns();
  populateDashboardFilters();
  renderAdminPage();
  const status = document.getElementById('admin-save-status');
  status.textContent = `✓ Saved — ${members.length} team members`;
  status.className = 'import-status import-ok';
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 4000);
}

function renderPendingQueue() {
  const pending = STATE.submissions.filter(s => s.status === 'pending');
  const card    = document.getElementById('pending-queue-card');
  const badge   = document.getElementById('pending-badge');
  const list    = document.getElementById('pending-list');

  badge.textContent = pending.length || '';
  badge.classList.toggle('hidden', pending.length === 0);

  if (!pending.length) {
    list.innerHTML = '<p class="admin-note" style="padding:12px 0">No pending submissions — you\'re all caught up!</p>';
    return;
  }

  list.innerHTML = pending.map(s => {
    const date = new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="pending-item" data-id="${s.id}">
        <div class="pending-meta">
          <span class="pending-from">${escHtml(s.giver)}</span>
          <span class="pending-arrow">→</span>
          <span class="pending-to">${escHtml(s.awardee)}</span>
          <span class="tag tag-value" style="font-size:11px">${escHtml(s.value)}</span>
          <span class="pending-date">${date}</span>
        </div>
        <p class="pending-message">"${escHtml(s.message)}"</p>
        <div class="pending-actions">
          <button class="btn btn-primary pending-approve-btn" data-id="${s.id}">Approve</button>
          <button class="btn btn-secondary pending-reject-btn" data-id="${s.id}">Reject</button>
          <button class="btn btn-secondary pending-edit-btn" data-id="${s.id}">Edit</button>
        </div>
      </div>`;
  }).join('');
}

async function approveSubmission(id) {
  const sub = STATE.submissions.find(s => s.id === id);
  if (!sub) return;
  sub.status = 'approved';
  saveSubmissions();

  // Now send to Google Script (logs to sheet + sends email)
  sendToZapier(sub);

  // Check milestone
  const awardeeTotal = STATE.submissions.filter(s => s.awardee === sub.awardee && s.status === 'approved').length;
  if (awardeeTotal % 50 === 0) sendMilestoneToZapier(sub.awardee, awardeeTotal);

  renderPendingQueue();
  renderDashboard();
  renderFeed();
}

function rejectSubmission(id) {
  if (!confirm('Reject this submission? It will not be published.')) return;
  const sub = STATE.submissions.find(s => s.id === id);
  if (!sub) return;
  sub.status = 'rejected';
  saveSubmissions();
  renderPendingQueue();
}

/* ═══════════════════════════════════════════
   FEED PAGE
   ═══════════════════════════════════════════ */
function renderFeed() {
  const list        = document.getElementById('feed-list');
  const searchVal   = document.getElementById('feed-search').value.toLowerCase();
  const filterValue = document.getElementById('feed-filter-value').value;

  let items = STATE.submissions.filter(s => {
    if (s.status === 'pending' || s.status === 'rejected') return false;
    const matchSearch = !searchVal ||
      s.giver.toLowerCase().includes(searchVal) ||
      s.awardee.toLowerCase().includes(searchVal) ||
      s.message.toLowerCase().includes(searchVal) ||
      s.value.toLowerCase().includes(searchVal);
    const matchValue = !filterValue || s.value === filterValue;
    return matchSearch && matchValue;
  });

  if (!items.length) {
    list.innerHTML = '<p class="empty-state">No recognitions found.</p>';
    return;
  }

  list.innerHTML = items.map(s => {
    const initials = s.awardee.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const date     = new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="feed-card">
        <div class="feed-avatar">${initials}</div>
        <div class="feed-body">
          <div class="feed-header">
            <span class="giver">${escHtml(s.giver)}</span>
            recognized
            <span class="awardee">${escHtml(s.awardee)}</span>
          </div>
          <div class="feed-message">${escHtml(s.message)}</div>
          <div class="feed-tags">
            <span class="tag tag-value">${escHtml(s.value)}</span>
          </div>
        </div>
        <div class="feed-date">${date}</div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════ */
let lastFilteredSubs = [];

function downloadCSV() {
  const rows = [['Date', 'From', 'To', 'Value', 'Message']];
  lastFilteredSubs.forEach(s => {
    const date = new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    rows.push([date, s.giver, s.awardee, s.value, s.message]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `awesome-blocks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function populateDashboardFilters() {
  const names = getTeamMemberNames();
  ['filter-received-by', 'filter-given-by'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = `<option value="">Everyone</option>`;
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = cur;
  });
}

function renderDashboard() {
  const subs       = STATE.submissions.filter(s => s.status !== 'pending' && s.status !== 'rejected');
  const filterTo   = document.getElementById('filter-received-by').value;
  const filterFrom = document.getElementById('filter-given-by').value;
  const filterVal  = document.getElementById('filter-value').value;
  const isFiltered = filterTo || filterFrom || filterVal || DATE_RANGE.start;

  populateDashboardFilters();

  document.getElementById('dashboard-reset-btn').classList.toggle('hidden', !isFiltered);

  const now = new Date();
  const isThisMonth = s => {
    const d = new Date(s.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  // ── Received card stats (independent of filterFrom) ──
  const receivedSubs = subs.filter(s =>
    (!filterTo  || s.awardee === filterTo) &&
    (!filterVal || s.value   === filterVal)
  );
  const ledger = loadPointsLedger();
  const historicalPts = filterTo
    ? (ledger[filterTo] || 0)
    : Object.values(ledger).reduce((a, b) => a + b, 0);
  document.getElementById('stat-received').textContent      = receivedSubs.length;
  document.getElementById('stat-points').textContent        = historicalPts + receivedSubs.length * 5;
  document.getElementById('stat-received-month').textContent = receivedSubs.filter(isThisMonth).length;
  document.getElementById('stat-recognized-by').textContent = new Set(receivedSubs.map(s => s.giver)).size;

  // ── Given card stats (independent of filterTo) ──
  const givenSubs = subs.filter(s =>
    (!filterFrom || s.giver  === filterFrom) &&
    (!filterVal  || s.value  === filterVal)
  );
  document.getElementById('stat-given').textContent       = givenSubs.length;
  document.getElementById('stat-given-month').textContent = givenSubs.filter(isThisMonth).length;
  document.getElementById('stat-recognized').textContent  = new Set(givenSubs.map(s => s.awardee)).size;

  // ── Charts + table: apply all filters combined ──
  const rangeEnd = DATE_RANGE.end || DATE_RANGE.start;
  let filtered = subs.filter(s => {
    if (filterTo   && s.awardee !== filterTo)   return false;
    if (filterFrom && s.giver   !== filterFrom) return false;
    if (filterVal  && s.value   !== filterVal)  return false;
    if (DATE_RANGE.start) {
      const ds = s.timestamp.slice(0, 10);
      if (ds < DATE_RANGE.start || ds > rangeEnd) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Chart titles
  document.getElementById('chart-recipients-title').textContent =
    filterFrom ? `Recognized by ${filterFrom.split(' ')[0]}` : 'Top Recipients';
  document.getElementById('chart-givers-title').textContent =
    filterTo ? `Who recognized ${filterTo.split(' ')[0]}` : 'Top Givers';

  renderBarChart('chart-top-recipients', countBy(filtered, 'awardee'), 5);
  renderBarChart('chart-by-value',       countBy(filtered, 'value'),   6);
  renderBarChart('chart-top-givers',     countBy(filtered, 'giver'),   5);
  renderMonthlyChart(filtered);

  // Table title
  const parts = [];
  if (filterTo)        parts.push(`received by ${filterTo}`);
  if (filterFrom)      parts.push(`given by ${filterFrom}`);
  if (filterVal)       parts.push(`for "${filterVal}"`);
  if (DATE_RANGE.start) {
    const label = DATE_RANGE.start === rangeEnd
      ? strToDisplay(DATE_RANGE.start)
      : `${strToDisplay(DATE_RANGE.start)} – ${strToDisplay(rangeEnd)}`;
    parts.push(label);
  }
  document.getElementById('table-title').textContent =
    parts.length ? `Awards · ${parts.join(' · ')}` : 'All Awesome Block Submissions';

  lastFilteredSubs = filtered;
  renderDashboardTable(filtered);
}

function countBy(arr, key) {
  const map = {};
  arr.forEach(item => {
    const k = item[key] || 'Unknown';
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function renderBarChart(containerId, entries, maxItems) {
  const el = document.getElementById(containerId);
  const top = entries.slice(0, maxItems);

  if (!top.length) {
    el.innerHTML = '<p class="no-data">No data yet.</p>';
    return;
  }

  const maxVal = top[0][1];
  el.innerHTML = top.map(([label, count]) => `
    <div class="bar-row">
      <div class="bar-label" title="${escHtml(label)}">${escHtml(label)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.round((count / maxVal) * 100)}%"></div>
      </div>
      <div class="bar-count">${count}</div>
    </div>`).join('');
}

function renderMonthlyChart(subs = STATE.submissions) {
  const map = {};

  subs.forEach(s => {
    const d   = new Date(s.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key]  = (map[key] || 0) + 1;
  });

  // Jan 2026 → current month
  const months = [];
  const now    = new Date();
  const end    = new Date(now.getFullYear(), now.getMonth(), 1);

  for (let d = new Date(2026, 0, 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    months.push([label, map[key] || 0]);
  }

  renderBarChart('chart-monthly', months, months.length);
}

function renderDashboardTable(subs) {
  const tbody     = document.getElementById('dashboard-tbody');
  const adminMode = isAdminUnlocked();
  const colSpan   = adminMode ? 6 : 5;
  if (!subs.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state">No Awesome Block Submissions yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = subs.map(s => {
    const date    = new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const editBtn = adminMode ? `<td class="sub-admin-actions"><button class="edit-sub-btn" data-id="${s.id}" title="Edit submission">✏</button><button class="delete-sub-btn" data-id="${s.id}" title="Delete submission">✕</button></td>` : '';
    return `
      <tr>
        <td style="white-space:nowrap">${date}</td>
        <td>${escHtml(s.giver)}</td>
        <td>${escHtml(s.awardee)}</td>
        <td><span class="tag tag-value" style="font-size:11px">${escHtml(s.value)}</span></td>
        <td class="msg" title="${escHtml(s.message)}">${escHtml(s.message)}</td>
        ${editBtn}
      </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   EDIT SUBMISSION MODAL
   ═══════════════════════════════════════════ */
const COMPANY_VALUES = ['Decide Business First', 'Hit the Mark', 'Go For It', 'Make It Easy', 'Keep It Real'];

let editingSubId = null;

function initEditModal() {
  const modal = document.createElement('div');
  modal.id        = 'edit-sub-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `
    <div class="modal-box">
      <h3 class="modal-title">Edit Awesome Block Submission</h3>
      <div class="modal-field">
        <label class="modal-label">From</label>
        <select id="edit-giver" class="admin-input"></select>
      </div>
      <div class="modal-field">
        <label class="modal-label">To</label>
        <select id="edit-awardee" class="admin-input"></select>
      </div>
      <div class="modal-field">
        <label class="modal-label">Company Value</label>
        <select id="edit-value" class="admin-input">
          ${COMPANY_VALUES.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-field">
        <label class="modal-label">Message</label>
        <textarea id="edit-message" class="admin-input edit-textarea" rows="4" maxlength="500"></textarea>
      </div>
      <div class="modal-actions">
        <button id="edit-cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="edit-save-btn" class="btn btn-primary">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-save-btn').addEventListener('click', saveEditSubmission);
  modal.addEventListener('click', e => { if (e.target === modal) closeEditModal(); });
}

function openEditSubmission(id) {
  const sub = STATE.submissions.find(s => s.id === id);
  if (!sub) return;
  editingSubId = id;

  const names = getTeamMemberNames();
  const nameOpts = names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  document.getElementById('edit-giver').innerHTML   = nameOpts;
  document.getElementById('edit-awardee').innerHTML = nameOpts;

  document.getElementById('edit-giver').value   = sub.giver;
  document.getElementById('edit-awardee').value = sub.awardee;
  document.getElementById('edit-value').value   = sub.value;
  document.getElementById('edit-message').value = sub.message;

  document.getElementById('edit-sub-modal').classList.remove('hidden');
  document.getElementById('edit-message').focus();
}

function closeEditModal() {
  editingSubId = null;
  document.getElementById('edit-sub-modal').classList.add('hidden');
}

function saveEditSubmission() {
  const sub = STATE.submissions.find(s => s.id === editingSubId);
  if (!sub) return;

  sub.giver   = document.getElementById('edit-giver').value;
  sub.awardee = document.getElementById('edit-awardee').value;
  sub.value   = document.getElementById('edit-value').value;
  sub.message = document.getElementById('edit-message').value.trim();

  saveSubmissions();
  closeEditModal();
  renderPendingQueue();
  renderDashboard();
  renderFeed();
}

function deleteSubmission(id) {
  if (!confirm('Delete this Awesome Block Submission? This cannot be undone.')) return;
  STATE.submissions = STATE.submissions.filter(s => s.id !== id);
  saveSubmissions();
  renderDashboard();
  renderFeed();
}

/* ═══════════════════════════════════════════
   DATE RANGE PICKER
   ═══════════════════════════════════════════ */
const DATE_RANGE = { start: null, end: null };
let calPickingEnd = false;
let calViewYear, calViewMonth;

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function strToDisplay(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function updateDateRangeDisplay() {
  const el = document.getElementById('date-range-display');
  if (!DATE_RANGE.start) {
    el.textContent = 'Date Range';
    el.classList.remove('has-value');
  } else {
    const end = DATE_RANGE.end || DATE_RANGE.start;
    el.textContent = DATE_RANGE.start === end
      ? strToDisplay(DATE_RANGE.start)
      : `${strToDisplay(DATE_RANGE.start)} – ${strToDisplay(end)}`;
    el.classList.add('has-value');
  }
}

function renderCalendar(hoverDate) {
  const label = document.getElementById('cal-month-label');
  const grid  = document.getElementById('cal-days');
  if (!label || !grid) return;

  const d = new Date(calViewYear, calViewMonth, 1);
  label.textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const startDow    = d.getDay();
  let html = '';

  for (let i = 0; i < startDow; i++) html += '<span></span>';

  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${calViewYear}-${String(calViewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    const rangeStart = DATE_RANGE.start;
    const rangeEnd   = DATE_RANGE.end || DATE_RANGE.start;

    // When user is mid-selection, compute dynamic range with hover
    let lo = rangeStart, hi = rangeEnd;
    if (calPickingEnd && rangeStart && hoverDate) {
      lo = hoverDate < rangeStart ? hoverDate : rangeStart;
      hi = hoverDate > rangeStart ? hoverDate : rangeStart;
    }

    const isStart    = ds === lo && lo;
    const isEnd      = ds === hi && hi && hi !== lo;
    const inRange    = lo && hi && ds > lo && ds < hi;
    const isHover    = calPickingEnd && hoverDate && ds === hoverDate && !DATE_RANGE.end;

    const cls = ['cal-day',
      isStart ? 'cal-day-start' : '',
      isEnd   ? 'cal-day-end'   : '',
      inRange ? 'cal-day-in-range' : '',
      isHover ? 'cal-day-hover' : '',
    ].filter(Boolean).join(' ');

    html += `<button class="${cls}" data-date="${ds}">${day}</button>`;
  }
  grid.innerHTML = html;
}

function initDatePicker() {
  const now    = new Date();
  calViewYear  = now.getFullYear();
  calViewMonth = now.getMonth();

  const wrapper = document.getElementById('date-range-wrapper');
  const input   = document.getElementById('date-range-input');

  // Build popover
  const popover = document.createElement('div');
  popover.id        = 'date-range-popover';
  popover.className = 'cal-popover hidden';
  popover.innerHTML = `
    <div class="cal-presets">
      <div class="cal-preset-label">Quick Select</div>
      <button class="cal-preset" data-preset="today">Today</button>
      <button class="cal-preset" data-preset="7">Last 7 days</button>
      <button class="cal-preset" data-preset="30">Last 30 days</button>
      <button class="cal-preset" data-preset="this-month">This month</button>
      <button class="cal-preset" data-preset="last-month">Last month</button>
    </div>
    <div class="cal-main">
      <div class="cal-header">
        <button class="cal-nav" id="cal-prev">&#8249;</button>
        <span class="cal-month-label" id="cal-month-label"></span>
        <button class="cal-nav" id="cal-next">&#8250;</button>
      </div>
      <div class="cal-weekdays">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>
      <div class="cal-days" id="cal-days"></div>
    </div>`;
  wrapper.appendChild(popover);

  // Prevent any click inside the popover from bubbling to the document close handler
  popover.addEventListener('click', e => e.stopPropagation());

  // Open / close
  input.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !popover.classList.contains('hidden');
    popover.classList.toggle('hidden', isOpen);
    input.classList.toggle('open', !isOpen);
    if (!isOpen) {
      calViewYear  = now.getFullYear();
      calViewMonth = now.getMonth();
      calPickingEnd = !!DATE_RANGE.start && !DATE_RANGE.end;
      renderCalendar();
    }
  });

  // Month navigation
  document.getElementById('cal-prev').addEventListener('click', e => {
    e.stopPropagation();
    if (--calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', e => {
    e.stopPropagation();
    if (++calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });

  // Day clicks
  document.getElementById('cal-days').addEventListener('click', e => {
    const btn = e.target.closest('.cal-day');
    if (!btn) return;
    e.stopPropagation();
    const ds = btn.dataset.date;
    if (!DATE_RANGE.start || (DATE_RANGE.start && DATE_RANGE.end)) {
      // First click — pick start, keep calendar open
      DATE_RANGE.start = ds;
      DATE_RANGE.end   = null;
      calPickingEnd    = true;
      renderCalendar();
      updateDateRangeDisplay();
    } else {
      // Second click — pick end, close calendar, refresh dashboard
      if (ds < DATE_RANGE.start) {
        DATE_RANGE.end   = DATE_RANGE.start;
        DATE_RANGE.start = ds;
      } else {
        DATE_RANGE.end = ds;
      }
      calPickingEnd = false;
      popover.classList.add('hidden');
      input.classList.remove('open');
      renderCalendar();
      updateDateRangeDisplay();
      renderDashboard();
    }
  });

  // Hover preview
  document.getElementById('cal-days').addEventListener('mouseover', e => {
    const btn = e.target.closest('.cal-day');
    if (btn && calPickingEnd) renderCalendar(btn.dataset.date);
  });
  document.getElementById('cal-days').addEventListener('mouseleave', () => {
    if (calPickingEnd) renderCalendar();
  });

  // Preset buttons
  popover.querySelectorAll('.cal-preset').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const today = new Date();
      const preset = btn.dataset.preset;
      if (preset === 'today') {
        DATE_RANGE.start = DATE_RANGE.end = dateToStr(today);
      } else if (preset === '7') {
        const s = new Date(today); s.setDate(s.getDate() - 6);
        DATE_RANGE.start = dateToStr(s); DATE_RANGE.end = dateToStr(today);
      } else if (preset === '30') {
        const s = new Date(today); s.setDate(s.getDate() - 29);
        DATE_RANGE.start = dateToStr(s); DATE_RANGE.end = dateToStr(today);
      } else if (preset === 'this-month') {
        DATE_RANGE.start = dateToStr(new Date(today.getFullYear(), today.getMonth(), 1));
        DATE_RANGE.end   = dateToStr(today);
      } else if (preset === 'last-month') {
        DATE_RANGE.start = dateToStr(new Date(today.getFullYear(), today.getMonth()-1, 1));
        DATE_RANGE.end   = dateToStr(new Date(today.getFullYear(), today.getMonth(), 0));
      }
      calPickingEnd = false;
      popover.classList.add('hidden');
      input.classList.remove('open');
      updateDateRangeDisplay();
      renderDashboard();
    });
  });

  // Close on outside click — treat single-date click as single-day range
  document.addEventListener('click', e => {
    if (popover.contains(e.target) || input.contains(e.target)) return;
    if (!popover.classList.contains('hidden')) {
      if (DATE_RANGE.start && !DATE_RANGE.end) DATE_RANGE.end = DATE_RANGE.start;
      popover.classList.add('hidden');
      input.classList.remove('open');
      updateDateRangeDisplay();
      renderDashboard();
    }
  });
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════ */
function init() {
  loadSubmissions();
  populateTeamDropdowns();
  initCharCounter();

  // Check session
  if (isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw = document.getElementById('login-password').value;
    if (pw === CONFIG.PASSWORD) {
      login();
    } else {
      document.getElementById('login-error').classList.remove('hidden');
      document.getElementById('login-password').value = '';
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Award form
  document.getElementById('award-form').addEventListener('submit', handleAwardSubmit);

  // Thank-you card — reset back to form
  document.getElementById('give-another-btn').addEventListener('click', () => {
    document.getElementById('thank-you-card').classList.add('hidden');
    document.getElementById('award-form').classList.remove('hidden');
  });

  // Feed filters
  document.getElementById('feed-search').addEventListener('input', renderFeed);
  document.getElementById('feed-filter-value').addEventListener('change', renderFeed);

  // Dashboard filters
  ['filter-received-by', 'filter-given-by', 'filter-value'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderDashboard);
  });
  document.getElementById('dashboard-reset-btn').addEventListener('click', () => {
    document.getElementById('filter-received-by').value = '';
    document.getElementById('filter-given-by').value = '';
    document.getElementById('filter-value').value = '';
    DATE_RANGE.start = null;
    DATE_RANGE.end   = null;
    updateDateRangeDisplay();
    renderDashboard();
  });

  // Admin gate
  document.getElementById('admin-gate-form').addEventListener('submit', e => {
    e.preventDefault();
    const pw = document.getElementById('admin-gate-password').value;
    if (pw === CONFIG.ADMIN_PASSWORD) {
      sessionStorage.setItem('ab_admin_auth', 'true');
      renderAdminGate();
    } else {
      document.getElementById('admin-gate-error').classList.remove('hidden');
      document.getElementById('admin-gate-password').value = '';
    }
  });

  // Admin page
  document.getElementById('admin-save-btn').addEventListener('click', saveAdminChanges);
  document.getElementById('pending-list').addEventListener('click', e => {
    const approveBtn = e.target.closest('.pending-approve-btn');
    const rejectBtn  = e.target.closest('.pending-reject-btn');
    const editBtn    = e.target.closest('.pending-edit-btn');
    if (approveBtn) approveSubmission(Number(approveBtn.dataset.id));
    if (rejectBtn)  rejectSubmission(Number(rejectBtn.dataset.id));
    if (editBtn)    openEditSubmission(Number(editBtn.dataset.id));
  });
  document.getElementById('admin-add-btn').addEventListener('click', () => {
    const names = getTeamMemberNames();
    const tr = document.createElement('tr');
    const managerOpts = names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    tr.innerHTML = `
      <td><input type="text"  class="admin-input admin-name"    value="" placeholder="Full Name" /></td>
      <td><input type="email" class="admin-input admin-email"   value="" placeholder="name@elementthree.com" /></td>
      <td><select class="admin-input admin-manager"><option value="">No manager</option>${managerOpts}</select></td>
      <td><button class="admin-remove-btn" type="button" title="Remove">✕</button></td>`;
    document.getElementById('admin-tbody').appendChild(tr);
    tr.querySelector('.admin-name').focus();
  });
  document.getElementById('admin-tbody').addEventListener('click', e => {
    if (e.target.classList.contains('admin-remove-btn')) e.target.closest('tr').remove();
  });

  // Edit submission buttons (admin only)
  document.getElementById('dashboard-tbody').addEventListener('click', e => {
    const editBtn   = e.target.closest('.edit-sub-btn');
    const deleteBtn = e.target.closest('.delete-sub-btn');
    if (editBtn)   openEditSubmission(Number(editBtn.dataset.id));
    if (deleteBtn) deleteSubmission(Number(deleteBtn.dataset.id));
  });

  initEditModal();
  initDatePicker();

  // CSV download
  document.getElementById('download-csv-btn').addEventListener('click', downloadCSV);

  // CSV import — points balance
  const importPointsFile = document.getElementById('import-points-file');
  document.getElementById('import-points-btn').addEventListener('click', () => importPointsFile.click());
  importPointsFile.addEventListener('change', () => {
    if (importPointsFile.files[0]) {
      handlePointsImport(importPointsFile.files[0]);
      importPointsFile.value = '';
    }
  });

  // CSV import — submissions
  const importSubsFile = document.getElementById('import-submissions-file');
  document.getElementById('import-submissions-btn').addEventListener('click', () => importSubsFile.click());
  importSubsFile.addEventListener('change', () => {
    if (importSubsFile.files[0]) {
      handleSubmissionsImport(importSubsFile.files[0]);
      importSubsFile.value = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
