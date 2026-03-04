/* ═══════════════════════════════════════════
   AWESOME BLOCKS – SCRIPT
   ═══════════════════════════════════════════
   CONFIG – update these before deploying
   ═══════════════════════════════════════════ */

const CONFIG = {
  // Password to access the app
  PASSWORD: 'awesomeblocks2024',

  // Paste your Zapier Webhook URL here.
  // In Zapier: New Zap → Trigger: Webhooks by Zapier (Catch Hook)
  //            Action:  Google Sheets → Create Spreadsheet Row
  ZAPIER_WEBHOOK: 'https://hooks.zapier.com/hooks/catch/YOUR_HOOK_ID/YOUR_HOOK_KEY/',

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
}

/* ═══════════════════════════════════════════
   POPULATE DROPDOWNS
   ═══════════════════════════════════════════ */
function populateTeamDropdowns() {
  const giverSel   = document.getElementById('giver');
  const awardeeSel = document.getElementById('awardee');

  CONFIG.TEAM_MEMBERS.forEach(name => {
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
  };

  // Send to Zapier (Google Sheets)
  const zapOk = await sendToZapier(submission);

  // Always save locally regardless of Zapier result
  STATE.submissions.unshift(submission);
  saveSubmissions();

  setSubmitLoading(false);

  if (zapOk) {
    showFormSuccess('🎉 Award submitted and saved to Google Sheets!');
  } else {
    showFormSuccess('✅ Award saved locally. (Check your Zapier webhook URL in CONFIG.)');
  }

  // Reset form
  e.target.reset();
  document.getElementById('char-remaining').textContent = '500';
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

/* ═══════════════════════════════════════════
   ZAPIER INTEGRATION
   ═══════════════════════════════════════════ */
async function sendToZapier(submission) {
  if (!CONFIG.ZAPIER_WEBHOOK || CONFIG.ZAPIER_WEBHOOK.includes('YOUR_HOOK')) {
    console.warn('Zapier webhook not configured. Set CONFIG.ZAPIER_WEBHOOK in script.js.');
    return false;
  }
  try {
    await fetch(CONFIG.ZAPIER_WEBHOOK, {
      method: 'POST',
      // NOTE: Zapier catch-hooks don't require Content-Type application/json
      // but some browsers block CORS preflight on custom headers, so we use
      // no-cors mode. Data still arrives in Zapier correctly.
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date:          new Date(submission.timestamp).toLocaleDateString(),
        time:          new Date(submission.timestamp).toLocaleTimeString(),
        giver:         submission.giver,
        awardee:       submission.awardee,
        company_value: submission.value,
        award_type:    submission.type,
        message:       submission.message,
      }),
    });
    return true;
  } catch (err) {
    console.error('Zapier send failed:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════
   FEED PAGE
   ═══════════════════════════════════════════ */
function renderFeed() {
  const list        = document.getElementById('feed-list');
  const searchVal   = document.getElementById('feed-search').value.toLowerCase();
  const filterValue = document.getElementById('feed-filter-value').value;

  let items = STATE.submissions.filter(s => {
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
            <span class="tag tag-value">🏆 ${escHtml(s.value)}</span>
          </div>
        </div>
        <div class="feed-date">${date}</div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════ */
function renderDashboard() {
  const subs = STATE.submissions;

  // Stats
  const now       = new Date();
  const thisMonth = subs.filter(s => {
    const d = new Date(s.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const uniqueGivers   = new Set(subs.map(s => s.giver)).size;
  const uniqueAwardees = new Set(subs.map(s => s.awardee)).size;

  document.getElementById('stat-total').textContent      = subs.length;
  document.getElementById('stat-this-month').textContent = thisMonth.length;
  document.getElementById('stat-givers').textContent     = uniqueGivers;
  document.getElementById('stat-awardees').textContent   = uniqueAwardees;

  // Charts
  renderBarChart('chart-top-recipients', countBy(subs, 'awardee'), 5);
  renderBarChart('chart-by-value',       countBy(subs, 'value'),   6);
  renderBarChart('chart-top-givers',     countBy(subs, 'giver'),   5);
  renderMonthlyChart();

  // Table
  renderDashboardTable(subs);
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

function renderMonthlyChart() {
  const subs = STATE.submissions;
  const map  = {};

  subs.forEach(s => {
    const d   = new Date(s.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key]  = (map[key] || 0) + 1;
  });

  // Last 6 months
  const months = [];
  const now    = new Date();
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    months.push([label, map[key] || 0]);
  }

  renderBarChart('chart-monthly', months, 6);
}

function renderDashboardTable(subs) {
  const tbody = document.getElementById('dashboard-tbody');
  if (!subs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No submissions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = subs.map(s => {
    const date = new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <tr>
        <td style="white-space:nowrap">${date}</td>
        <td>${escHtml(s.giver)}</td>
        <td>${escHtml(s.awardee)}</td>
        <td><span class="tag tag-value" style="font-size:11px">${escHtml(s.value)}</span></td>
        <td class="msg" title="${escHtml(s.message)}">${escHtml(s.message)}</td>
      </tr>`;
  }).join('');
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

  // Feed filters
  document.getElementById('feed-search').addEventListener('input', renderFeed);
  document.getElementById('feed-filter-value').addEventListener('change', renderFeed);
}

document.addEventListener('DOMContentLoaded', init);
