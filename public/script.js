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

  // Google OAuth Client ID for sign-in.
  // Get one at console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID.
  // Add your domain (e.g. https://awesome.elementthree.com) to Authorized JavaScript Origins.
  // Leave as 'YOUR_GOOGLE_CLIENT_ID_HERE' to fall back to the name-picker login during local dev.
  GOOGLE_CLIENT_ID: '628098551690-4manh4fk4tmubbh3caeimtljmsf9bte9.apps.googleusercontent.com',

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
  submissions: [],
  teamConfig: null,
  pointsLedger: {},
  cashMilestones: {},
};

/* ═══════════════════════════════════════════
   STORAGE HELPERS
   ═══════════════════════════════════════════ */
function loadSubmissions() {
  // data loaded at init via API
}

function saveSubmissions() {
  // submissions persisted via individual API calls
}

/* ═══════════════════════════════════════════
   POINTS LEDGER
   ═══════════════════════════════════════════ */
function loadPointsLedger() {
  return STATE.pointsLedger;
}

function savePointsLedger(ledger) {
  STATE.pointsLedger = ledger;
  fetch('/api/points-ledger', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ledger) })
    .catch(err => console.error('Failed to save points ledger:', err));
}

function loadCashMilestones() {
  return STATE.cashMilestones;
}

function saveCashMilestones(milestones) {
  STATE.cashMilestones = milestones;
  fetch('/api/cash-milestones', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(milestones) })
    .catch(err => console.error('Failed to save cash milestones:', err));
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
  return STATE.teamConfig || { members: CONFIG.TEAM_MEMBERS.map(name => ({ name, email: '', manager: '' })), adminRoles: [] };
}

let _saveConfigQueue = Promise.resolve();
function saveTeamConfig(config) {
  STATE.teamConfig = config;
  const snapshot = JSON.stringify(config);
  _saveConfigQueue = _saveConfigQueue.then(() =>
    fetch('/api/team-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot })
      .catch(err => console.error('Failed to save team config:', err))
  );
}

function getTeamMemberNames() {
  return getTeamConfig().members.map(m => m.name).filter(Boolean).sort();
}

function getFormerMemberNames() {
  return new Set(
    getTeamConfig().members
      .filter(m => m.status === 'former')
      .map(m => m.name)
  );
}

// Returns array of { name, role, email } for admins matching the given role (or all if role is omitted)
function getAdminsByRole(role) {
  const config = getTeamConfig();
  return (config.adminRoles || [])
    .filter(a => !role || a.role === role)
    .map(a => {
      const member = config.members.find(m => m.name === a.name) || {};
      return { name: a.name, role: a.role, email: member.email || '' };
    });
}

/* ═══════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════ */
function isLoggedIn() {
  return !!sessionStorage.getItem('ab_current_user');
}

function getCurrentUser() {
  return sessionStorage.getItem('ab_current_user') || '';
}

function login(name) {
  sessionStorage.setItem('ab_current_user', name);
  showApp();
}

function logout() {
  sessionStorage.removeItem('ab_current_user');
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
  showLogin();
}

/* ═══════════════════════════════════════════
   GOOGLE SIGN-IN
   ═══════════════════════════════════════════ */
function handleGoogleSignIn(response) {
  try {
    // Decode the JWT payload (middle segment, base64url encoded)
    const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const email = payload.email;
    if (!email.toLowerCase().endsWith('@elementthree.com')) {
      const errEl = document.getElementById('google-login-error');
      errEl.textContent = 'Only @elementthree.com accounts can access this app.';
      errEl.classList.remove('hidden');
      return;
    }
    const config = getTeamConfig();
    const member = config.members.find(
      m => m.email && m.email.toLowerCase() === email.toLowerCase() && m.status !== 'former'
    );
    if (member) {
      login(member.name);
    } else {
      const errEl = document.getElementById('google-login-error');
      errEl.textContent = `Your account (${email}) isn't linked to a team member. Ask an admin to check your email in Team Settings.`;
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    console.error('Google sign-in error:', e);
  }
}

function setupGoogleSignIn(clientId) {
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleSignIn,
    auto_select: true,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme: 'outline', size: 'large', width: 280, text: 'signin_with' }
  );
  google.accounts.id.prompt();
}

function initGoogleSignIn() {
  const clientId = CONFIG.GOOGLE_CLIENT_ID;
  if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID_HERE') return;

  if (typeof google !== 'undefined' && google.accounts) {
    setupGoogleSignIn(clientId);
  } else {
    window.onGoogleLibraryLoad = () => setupGoogleSignIn(clientId);
  }
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
  const name = getCurrentUser();
  document.getElementById('current-user-display').textContent = name ? `Hi, ${name.split(' ')[0]}` : '';
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
  const awardeeSel  = document.getElementById('awardee');
  const currentUser = getCurrentUser();
  const names       = getTeamConfig().members.filter(m => (m.status || 'current') === 'current').map(m => m.name).filter(Boolean).sort().filter(n => n !== currentUser);

  awardeeSel.innerHTML = '<option value="">Select recipient…</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    awardeeSel.appendChild(opt);
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

  const giver   = getCurrentUser();
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
  fetch('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  }).catch(err => console.error('Failed to save submission:', err));

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

      STATE.submissions.push({ id: Date.now() + i, timestamp: ts, giver, awardee, value, message, status: 'pending', imported: true });
      const sub = STATE.submissions[STATE.submissions.length - 1];
      fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
        .catch(err => console.error('Failed to save imported submission:', err));
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
  const config      = getTeamConfig();
  const find        = name => config.members.find(m => m.name === name) || {};
  const awardee     = find(submission.awardee);
  const giver       = find(submission.giver);
  const manager     = find(awardee.manager);
  const adminPeople = getAdminsByRole('admin');
  return {
    date:               new Date(submission.timestamp).toLocaleDateString(),
    time:               new Date(submission.timestamp).toLocaleTimeString(),
    giver:              submission.giver,
    giver_email:        giver.email        || '',
    awardee:            submission.awardee,
    awardee_email:      awardee.email      || '',
    manager_name:       awardee.manager    || '',
    manager_email:      manager.email      || '',
    talent_head_name:   adminPeople.map(a => a.name).join(','),
    talent_head_email:  adminPeople.map(a => a.email).filter(Boolean).join(','),
    company_value:      submission.value,
    message:            submission.message,
  };
}

async function sendMilestoneToZapier(awardeeName, totalAwards) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;
  const config     = getTeamConfig();
  const find       = name => config.members.find(m => m.name === name) || {};
  const awardee    = find(awardeeName);
  const manager    = find(awardee.manager);
  const allAdmins  = getAdminsByRole(); // both Admin and Finance roles
  const payload    = {
    type:           'milestone',
    awardee_name:   awardeeName,
    awardee_email:  awardee.email  || '',
    manager_name:   awardee.manager || '',
    manager_email:  manager.email  || '',
    admin_names:    allAdmins.map(a => a.name).join(','),
    admin_emails:   allAdmins.map(a => a.email).filter(Boolean).join(','),
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

async function sendCashBonusMilestone(awardeeName, thresholdPts, dollarAmount) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;
  const config        = getTeamConfig();
  const find          = name => config.members.find(m => m.name === name) || {};
  const awardee       = find(awardeeName);
  const manager       = find(awardee.manager);
  const financeAdmins = getAdminsByRole('finance');
  const adminAdmins   = getAdminsByRole('admin');
  const allRecipients = [...new Map(
    [...financeAdmins, ...adminAdmins, ...(manager.email ? [manager] : [])]
      .map(p => [p.email, p])
  ).values()].filter(p => p.email);
  if (!allRecipients.length) return;
  const payload = {
    type:             'cash_bonus_milestone',
    awardee_name:     awardeeName,
    awardee_email:    awardee.email   || '',
    manager_name:     awardee.manager || '',
    manager_email:    manager.email   || '',
    finance_emails:   allRecipients.map(p => p.email).join(','),
    threshold_points: thresholdPts,
    bonus_amount:     dollarAmount,
  };
  try {
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Cash bonus milestone send failed:', err);
  }
}

async function sendPointsMilestone(awardeeName, thresholdPts) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;
  const config        = getTeamConfig();
  const find          = name => config.members.find(m => m.name === name) || {};
  const awardee       = find(awardeeName);
  const manager       = find(awardee.manager);
  const financeAdmins = getAdminsByRole('finance');
  const adminAdmins   = getAdminsByRole('admin');
  const allRecipients = [...new Map(
    [...financeAdmins, ...adminAdmins, ...(manager.email ? [manager] : [])]
      .map(p => [p.email, p])
  ).values()].filter(p => p.email);
  if (!allRecipients.length) return;
  const payload = {
    type:             'points_milestone',
    awardee_name:     awardeeName,
    awardee_email:    awardee.email   || '',
    manager_name:     awardee.manager || '',
    manager_email:    manager.email   || '',
    finance_emails:   allRecipients.map(p => p.email).join(','),
    threshold_points: thresholdPts,
  };
  try {
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Points milestone send failed:', err);
  }
}

async function sendPendingNotification(submission) {
  if (!CONFIG.GOOGLE_SCRIPT_URL || CONFIG.GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) return;
  const adminPeople = getAdminsByRole('admin').filter(a => a.email);
  if (!adminPeople.length) return;
  const payload = {
    type:          'pending_notification',
    admin_emails:  adminPeople.map(a => a.email).join(','),
    admin_names:   adminPeople.map(a => a.name).join(','),
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
  const config       = getTeamConfig();
  const members      = config.members;
  const currentNames = members.filter(m => (m.status || 'current') === 'current').map(m => m.name).filter(Boolean);

  // Admin roles table
  const rolesTbody = document.getElementById('admin-roles-tbody');
  const adminRoles = config.adminRoles || [];
  if (adminRoles.length) {
    rolesTbody.innerHTML = adminRoles.map(a => {
      const nameOpts = currentNames
        .map(n => `<option value="${escHtml(n)}" ${n === a.name ? 'selected' : ''}>${escHtml(n)}</option>`)
        .join('');
      return `
        <tr>
          <td><select class="admin-input admin-role-name"><option value="">Select person…</option>${nameOpts}</select></td>
          <td><select class="admin-input admin-role-type">
            <option value="admin"   ${a.role === 'admin'   ? 'selected' : ''}>Admin</option>
            <option value="finance" ${a.role === 'finance' ? 'selected' : ''}>Finance</option>
          </select></td>
          <td><button class="admin-remove-btn admin-role-remove-btn" type="button" title="Remove">✕</button></td>
        </tr>`;
    }).join('');
  } else {
    rolesTbody.innerHTML = '<tr><td colspan="3" class="admin-note" style="padding:12px 0">No admins configured yet. Click "+ Add Admin" to add one.</td></tr>';
  }

  // Members table
  const tbody = document.getElementById('admin-tbody');

  function memberRow(m) {
    const managerOpts = currentNames
      .filter(n => n !== m.name)
      .map(n => `<option value="${escHtml(n)}" ${n === m.manager ? 'selected' : ''}>${escHtml(n)}</option>`)
      .join('');
    return `
      <tr>
        <td><input type="text"  class="admin-input admin-name"    value="${escHtml(m.name)}"        placeholder="Full Name" /></td>
        <td><select class="admin-input admin-manager"><option value="">N/A</option>${managerOpts}</select></td>
        <td><button class="admin-remove-btn" type="button" title="Mark as former employee">✕</button></td>
      </tr>`;
  }

  const currentRows = members
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => (m.status || 'current') === 'current' && m.name)
    .sort((a, b) => a.m.name.localeCompare(b.m.name))
    .map(({ m }) => memberRow(m))
    .join('');

  tbody.innerHTML = currentRows;

  // Populate restore dropdown with former employees
  const restoreSel = document.getElementById('restore-former-select');
  if (restoreSel) {
    const formerNames = members.filter(m => m.status === 'former').map(m => m.name).sort();
    restoreSel.innerHTML = '<option value="">Restore a former employee…</option>' +
      formerNames.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  }
}

function saveAdminChanges(silent = false) {
  const members = [];
  document.querySelectorAll('#admin-tbody tr').forEach(row => {
    const nameEl = row.querySelector('.admin-name');
    if (!nameEl) return; // skip toggle row
    const name    = nameEl.value.trim();
    const manager = row.querySelector('.admin-manager').value;
    if (name) {
      const existing  = getTeamConfig().members.find(m => m.name === name);
      const parts     = name.trim().split(/\s+/);
      const autoEmail = parts.length >= 2 ? `${parts[0].toLowerCase()}.${parts[parts.length - 1].toLowerCase()}@elementthree.com` : '';
      members.push({ name, email: existing?.email || autoEmail, manager, status: 'current' });
    }
  });
  const config = getTeamConfig();
  const formerMembers = config.members.filter(m => m.status === 'former');
  saveTeamConfig({ ...config, members: [...members, ...formerMembers] });
  populateTeamDropdowns();
  populateDashboardFilters();
  renderAdminPage();
  if (!silent) {
    const status = document.getElementById('admin-save-status');
    status.textContent = `✓ Saved — ${members.length} team members`;
    status.className = 'import-status import-ok';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 4000);
  }
}

function renderPendingQueue() {
  const pending = STATE.submissions.filter(s => s.status === 'pending');
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
          ${s.imported ? `<button class="btn btn-secondary pending-approve-silent-btn" data-id="${s.id}">Approve (no email)</button>` : ''}
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
  fetch(`/api/submissions/${sub.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  }).catch(err => console.error('Failed to update submission:', err));

  // Now send to Google Script (logs to sheet + sends email)
  sendToZapier(sub);

  // Check 50-award milestone
  const awardeeTotal = STATE.submissions.filter(s => s.awardee === sub.awardee && s.status === 'approved').length;
  if (awardeeTotal % 50 === 0) sendMilestoneToZapier(sub.awardee, awardeeTotal);

  // Check point milestones — every 50pts, with cash bonuses at 300/500/750/1000
  const CASH_BONUSES    = { 300: 100, 500: 150, 750: 200, 1000: 250 };
  const approvedCount   = STATE.submissions.filter(s => s.awardee === sub.awardee && s.status === 'approved').length;
  const newTotalPts     = approvedCount * 5;
  const prevTotalPts    = newTotalPts - 5;
  const firedMilestones = loadCashMilestones();
  const alreadyFired    = new Set(firedMilestones[sub.awardee] || []);
  let newlyFired        = false;

  for (let pts = 50; pts <= newTotalPts; pts += 50) {
    if (prevTotalPts < pts && !alreadyFired.has(pts)) {
      alreadyFired.add(pts);
      newlyFired = true;
      const dollars = CASH_BONUSES[pts];
      if (dollars) sendCashBonusMilestone(sub.awardee, pts, dollars);
      else         sendPointsMilestone(sub.awardee, pts);
    }
  }

  if (newlyFired) {
    firedMilestones[sub.awardee] = [...alreadyFired];
    saveCashMilestones(firedMilestones);
  }

  renderPendingQueue();
  renderDashboard();
  renderFeed();
}

function approveSubmissionSilent(id) {
  const sub = STATE.submissions.find(s => s.id === id);
  if (!sub) return;
  sub.status = 'approved';
  saveSubmissions();
  fetch(`/api/submissions/${sub.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  }).catch(err => console.error('Failed to update submission:', err));
  // Update milestone tracking without sending any emails
  const approvedCount   = STATE.submissions.filter(s => s.awardee === sub.awardee && s.status === 'approved').length;
  const newTotalPts     = approvedCount * 5;
  const firedMilestones = loadCashMilestones();
  const alreadyFired    = new Set(firedMilestones[sub.awardee] || []);
  let changed = false;
  for (let pts = 50; pts <= newTotalPts; pts += 50) {
    if (!alreadyFired.has(pts)) { alreadyFired.add(pts); changed = true; }
  }
  if (changed) { firedMilestones[sub.awardee] = [...alreadyFired]; saveCashMilestones(firedMilestones); }
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
  fetch(`/api/submissions/${sub.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  }).catch(err => console.error('Failed to update submission:', err));
  renderPendingQueue();
}

/* ═══════════════════════════════════════════
   FEED PAGE
   ═══════════════════════════════════════════ */
function renderFeed() {
  const list        = document.getElementById('feed-list');
  const searchVal   = document.getElementById('feed-search').value.toLowerCase();
  const filterValue = document.getElementById('feed-filter-value').value;
  const formerNames = getFormerMemberNames();

  let items = STATE.submissions.filter(s => {
    if (s.status === 'pending' || s.status === 'rejected') return false;
    if (formerNames.has(s.awardee)) return false;
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
  const currentNames = getTeamConfig().members.filter(m => (m.status || 'current') === 'current').map(m => m.name).filter(Boolean).sort();
  ['filter-received-by', 'filter-given-by'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = `<option value="">Everyone</option>`;
    currentNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = cur;
  });
}

function renderDashboard() {
  const formerNames = getFormerMemberNames();
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
  const rangeEnd = DATE_RANGE.end || DATE_RANGE.start;
  const inDateRange = s => {
    if (!DATE_RANGE.start) return true;
    const ds = dateToStr(new Date(s.timestamp));
    return ds >= DATE_RANGE.start && ds <= rangeEnd;
  };
  const receivedSubs = subs.filter(s =>
    (!filterTo  || s.awardee === filterTo) &&
    (!filterVal || s.value   === filterVal) &&
    inDateRange(s) &&
    !formerNames.has(s.awardee)
  );
  document.getElementById('stat-received').textContent      = receivedSubs.length;
  document.getElementById('stat-points').textContent        = receivedSubs.length * 5;
  document.getElementById('stat-received-month').textContent = receivedSubs.filter(isThisMonth).length;
  document.getElementById('stat-recognized-by').textContent = new Set(receivedSubs.map(s => s.giver)).size;

  // ── Given card stats (independent of filterTo) ──
  const givenSubs = subs.filter(s =>
    (!filterFrom || s.giver  === filterFrom) &&
    (!filterVal  || s.value  === filterVal) &&
    inDateRange(s)
  );
  document.getElementById('stat-given').textContent       = givenSubs.length;
  document.getElementById('stat-given-month').textContent = givenSubs.filter(isThisMonth).length;
  document.getElementById('stat-recognized').textContent  = new Set(givenSubs.map(s => s.awardee)).size;

  // ── Charts + table: apply all filters combined ──
  let filtered = subs.filter(s =>
    (!filterTo   || s.awardee === filterTo) &&
    (!filterFrom || s.giver   === filterFrom) &&
    (!filterVal  || s.value   === filterVal) &&
    inDateRange(s) &&
    !formerNames.has(s.awardee)
  ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Chart titles
  document.getElementById('chart-recipients-title').textContent =
    filterFrom ? `Recognized by ${filterFrom.split(' ')[0]}` : 'Top Recipients';
  document.getElementById('chart-givers-title').textContent =
    filterTo ? `Who recognized ${filterTo.split(' ')[0]}` : 'Top Givers';

  const currentNames = new Set(getTeamConfig().members.filter(m => (m.status || 'current') === 'current').map(m => m.name));
  const chartFiltered = filtered.filter(s => currentNames.has(s.awardee) && currentNames.has(s.giver));
  renderBarChart('chart-top-recipients', countBy(chartFiltered, 'awardee'), 5);
  const jan2026 = new Date('2026-01-29').getTime();
  renderBarChart('chart-by-value',       countBy(filtered.filter(s => new Date(s.timestamp).getTime() >= jan2026), 'value'), 6);
  renderBarChart('chart-top-givers',     countBy(chartFiltered, 'giver'),   5);
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

  const maxVal = Math.max(...top.map(([, v]) => v), 1);
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
        <td class="msg" title="Click to expand">${escHtml(s.message)}</td>
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
  fetch(`/api/submissions/${sub.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  }).catch(err => console.error('Failed to update submission:', err));
  closeEditModal();
  renderPendingQueue();
  renderDashboard();
  renderFeed();
}

function deleteSubmission(id) {
  if (!confirm('Delete this Awesome Block Submission? This cannot be undone.')) return;
  const sub = STATE.submissions.find(s => s.id === id);
  STATE.submissions = STATE.submissions.filter(s => s.id !== id);
  saveSubmissions();
  fetch(`/api/submissions/${id}`, { method: 'DELETE' })
    .catch(err => console.error('Failed to delete submission:', err));
  // Clear any cash milestones the person has now dropped below
  if (sub) {
    const approvedCount = STATE.submissions.filter(s => s.awardee === sub.awardee && s.status === 'approved').length;
    const newTotalPts = approvedCount * 5;
    const firedMilestones = loadCashMilestones();
    const fired = new Set(firedMilestones[sub.awardee] || []);
    for (let pts = 50; pts <= newTotalPts + 50; pts += 50) { if (newTotalPts < pts) fired.delete(pts); }
    firedMilestones[sub.awardee] = [...fired];
    saveCashMilestones(firedMilestones);
  }
  renderDashboard();
  renderFeed();
}

/* ═══════════════════════════════════════════
   DATE RANGE PICKER
   ═══════════════════════════════════════════ */
const DATE_RANGE = { start: null, end: null };

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function strToDisplay(s) {
  // 'YYYY-MM-DD' → 'Mon D, YYYY'  (e.g. 'Mar 1, 2025')
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initDatePicker() {
  let activePreset = null;
  let calOpen      = false;
  let calViewYear  = new Date().getFullYear();
  let calViewMonth = new Date().getMonth();
  let calSelStart  = null; // 'YYYY-MM-DD'
  let calSelEnd    = null;
  let calHover     = null;

  const presetsEl  = document.getElementById('date-presets');
  const popover    = document.getElementById('cal-popover');
  const customBtn  = document.getElementById('custom-range-btn');
  const hintEl     = document.getElementById('cal-range-hint');
  const MONTHS     = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  // ── Open / close ──────────────────────────────────────────────
  function openCal() {
    calOpen = true;
    customBtn.classList.add('active');
    popover.classList.remove('hidden');
    renderCal();
  }

  function closeCal() {
    calOpen = false;
    popover.classList.add('hidden');
    if (!DATE_RANGE.start) customBtn.classList.remove('active');
  }

  // ── Apply selection classes to a single day button ────────────
  function applyDayClasses(btn, ds, hoverDs) {
    btn.classList.remove('cal-day-start', 'cal-day-end', 'cal-day-in-range', 'cal-day-hover');
    let rStart = calSelStart;
    let rEnd   = calSelEnd !== null ? calSelEnd : hoverDs;
    if (rStart && rEnd && rEnd < rStart) { [rStart, rEnd] = [rEnd, rStart]; }
    if      (rStart && ds === rStart && rEnd && ds !== rEnd) btn.classList.add('cal-day-start');
    else if (rStart && ds === rStart)                        btn.classList.add('cal-day-start');
    else if (rStart && rEnd && ds === rEnd)                  btn.classList.add('cal-day-end');
    else if (rStart && rEnd && ds > rStart && ds < rEnd)     btn.classList.add('cal-day-in-range');
  }

  function updateHint() {
    if (!calSelStart)      hintEl.textContent = 'Click a start date';
    else if (!calSelEnd)   hintEl.textContent = 'Click an end date';
    else hintEl.textContent = `${strToDisplay(calSelStart)} – ${strToDisplay(calSelEnd)}`;
  }

  // ── Render calendar grid (only called on open / month nav / day click) ──
  function renderCal() {
    document.getElementById('cal-month-label').textContent =
      `${MONTHS[calViewMonth]} ${calViewYear}`;

    const grid = document.getElementById('cal-days-grid');
    grid.innerHTML = '';

    const firstDay    = new Date(calViewYear, calViewMonth, 1).getDay();
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(document.createElement('div'));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds  = `${calViewYear}-${String(calViewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const btn = document.createElement('button');
      btn.type         = 'button';
      btn.className    = 'cal-day';
      btn.textContent  = d;
      btn.dataset.date = ds;
      applyDayClasses(btn, ds, null);
      grid.appendChild(btn);
    }

    updateHint();
  }

  // ── Month navigation ───────────────────────────────────────────
  document.getElementById('cal-prev').addEventListener('click', e => {
    e.stopPropagation();
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCal();
  });

  document.getElementById('cal-next').addEventListener('click', e => {
    e.stopPropagation();
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCal();
  });

  // ── Day click ──────────────────────────────────────────────────
  document.getElementById('cal-days-grid').addEventListener('click', e => {
    e.stopPropagation(); // prevent document outside-click handler from closing calendar
    const btn = e.target.closest('.cal-day');
    if (!btn || !btn.dataset.date) return;
    const ds = btn.dataset.date;

    if (!calSelStart || calSelEnd) {
      // Start a fresh selection
      calSelStart = ds;
      calSelEnd   = null;
      calHover    = null;
    } else {
      // Second click = end date
      if (ds === calSelStart) {
        calSelStart = null;
      } else if (ds < calSelStart) {
        calSelEnd   = calSelStart;
        calSelStart = ds;
      } else {
        calSelEnd = ds;
      }

      if (calSelStart && calSelEnd) {
        DATE_RANGE.start = calSelStart;
        DATE_RANGE.end   = calSelEnd;
        activePreset     = null;
        document.querySelectorAll('.date-preset-btn:not(#custom-range-btn)')
          .forEach(b => b.classList.remove('active'));
        customBtn.classList.add('active');
        closeCal();
        renderDashboard();
        return;
      }
    }
    // Re-render to update selection styles (no hover active during click)
    calHover = null;
    renderCal();
  });

  // ── Hover preview: update classes only — never replace DOM ────
  const grid = document.getElementById('cal-days-grid');

  grid.addEventListener('mouseover', e => {
    if (!calSelStart || calSelEnd) return;
    const btn = e.target.closest('.cal-day');
    if (!btn || !btn.dataset.date) return;
    const hoverDs = btn.dataset.date;
    if (hoverDs === calHover) return; // no change
    calHover = hoverDs;
    grid.querySelectorAll('.cal-day').forEach(b => applyDayClasses(b, b.dataset.date, calHover));
  });

  grid.addEventListener('mouseleave', () => {
    if (!calSelStart || calSelEnd || !calHover) return;
    calHover = null;
    grid.querySelectorAll('.cal-day').forEach(b => applyDayClasses(b, b.dataset.date, null));
  });

  // ── Preset buttons ─────────────────────────────────────────────
  presetsEl.addEventListener('click', e => {
    const btn = e.target.closest('.date-preset-btn');
    if (!btn) return;
    const preset = btn.dataset.preset;

    if (preset === 'custom-range') {
      calOpen ? closeCal() : openCal();
      return;
    }

    // Any preset closes the calendar and clears custom selection
    calSelStart = calSelEnd = calHover = null;
    closeCal();

    if (activePreset === preset) {
      activePreset = null;
      DATE_RANGE.start = DATE_RANGE.end = null;
      document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
    } else {
      activePreset = preset;
      document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const today = new Date();
      if (preset === '7') {
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
    }
    renderDashboard();
  });

  // ── Outside click closes ───────────────────────────────────────
  document.addEventListener('click', e => {
    if (!calOpen) return;
    if (!popover.contains(e.target) && !customBtn.contains(e.target)) {
      closeCal();
    }
  });

  // ── Reset button also clears calendar state ────────────────────
  document.getElementById('dashboard-reset-btn').addEventListener('click', () => {
    calSelStart = calSelEnd = calHover = null;
    activePreset = null;
    closeCal();
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
async function init() {
  // Load all data from API
  try {
    const [teamConfig, submissions, pointsLedger, cashMilestones] = await Promise.all([
      fetch('/api/team-config').then(r => r.json()),
      fetch('/api/submissions').then(r => r.json()),
      fetch('/api/points-ledger').then(r => r.json()),
      fetch('/api/cash-milestones').then(r => r.json()),
    ]);
    STATE.teamConfig = Object.keys(teamConfig).length ? teamConfig : null;
    STATE.submissions = Array.isArray(submissions) ? submissions : [];
    STATE.pointsLedger = pointsLedger || {};
    STATE.cashMilestones = cashMilestones || {};
  } catch (err) {
    console.error('Failed to load data from API:', err);
  }

  // If no team config yet, seed from hardcoded list
  if (!STATE.teamConfig) {
    const def = {
      members: CONFIG.TEAM_MEMBERS.map(name => ({ name, email: '', manager: '' })),
      adminRoles: [],
    };
    saveTeamConfig(def);
  }

  populateTeamDropdowns();
  initCharCounter();

  // Check session
  if (isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }

  // Initialize Google Sign-In (shows Google button and hides name picker if CLIENT_ID is set)
  initGoogleSignIn();

  // Populate login name dropdown (fallback / local dev)
  const loginNameSel = document.getElementById('login-name');
  getTeamMemberNames().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    loginNameSel.appendChild(opt);
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('login-name').value;
    if (name) {
      login(name);
    } else {
      document.getElementById('login-error').classList.remove('hidden');
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
    document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
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

  document.getElementById('restore-former-btn').addEventListener('click', () => {
    const sel  = document.getElementById('restore-former-select');
    const name = sel.value;
    if (!name) return;
    const config = getTeamConfig();
    const member = config.members.find(m => m.name === name);
    if (member) {
      member.status = 'current';
      saveTeamConfig(config);
      sel.value = '';
      populateTeamDropdowns();
      populateDashboardFilters();
      renderAdminPage();
    }
  });
  document.getElementById('pending-list').addEventListener('click', e => {
    const approveBtn       = e.target.closest('.pending-approve-btn');
    const approveSilentBtn = e.target.closest('.pending-approve-silent-btn');
    const rejectBtn        = e.target.closest('.pending-reject-btn');
    const editBtn          = e.target.closest('.pending-edit-btn');
    if (approveBtn)       approveSubmission(Number(approveBtn.dataset.id));
    if (approveSilentBtn) approveSubmissionSilent(Number(approveSilentBtn.dataset.id));
    if (rejectBtn)        rejectSubmission(Number(rejectBtn.dataset.id));
    if (editBtn)          openEditSubmission(Number(editBtn.dataset.id));
  });
  document.getElementById('admin-add-btn').addEventListener('click', () => {
    const names = getTeamMemberNames();
    const tr = document.createElement('tr');
    const managerOpts = names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    tr.innerHTML = `
      <td><input type="text"  class="admin-input admin-name"    value="" placeholder="Full Name" /></td>
      <td><select class="admin-input admin-manager"><option value="">N/A</option>${managerOpts}</select></td>
      <td><button class="admin-remove-btn" type="button" title="Mark as former employee">✕</button></td>`;
    document.getElementById('admin-tbody').appendChild(tr);
    tr.querySelector('.admin-name').focus();
  });
  document.getElementById('admin-tbody').addEventListener('click', e => {
    if (e.target.classList.contains('admin-remove-btn') && !e.target.classList.contains('admin-role-remove-btn')) {
      const name = e.target.closest('tr').querySelector('.admin-name').value.trim();
      if (name) {
        const config = getTeamConfig();
        const member = config.members.find(m => m.name === name);
        if (member) member.status = 'former';
        else config.members.push({ name, email: '', manager: '', status: 'former' });
        saveTeamConfig(config);
        e.target.closest('tr').remove();
        populateTeamDropdowns();
        populateDashboardFilters();
        renderAdminPage();
      }
    }
  });

  document.getElementById('admin-add-role-btn').addEventListener('click', () => {
    const names    = getTeamConfig().members.filter(m => (m.status || 'current') === 'current').map(m => m.name).filter(Boolean);
    const nameOpts = names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    const tr       = document.createElement('tr');
    tr.innerHTML = `
      <td><select class="admin-input admin-role-name"><option value="">Select person…</option>${nameOpts}</select></td>
      <td><select class="admin-input admin-role-type">
        <option value="admin" selected>Admin</option>
        <option value="finance">Finance</option>
      </select></td>
      <td><button class="admin-remove-btn admin-role-remove-btn" type="button" title="Remove">✕</button></td>`;
    document.getElementById('admin-roles-tbody').appendChild(tr);
    tr.querySelector('.admin-role-name').focus();
  });

  document.getElementById('admin-roles-tbody').addEventListener('click', e => {
    if (e.target.classList.contains('admin-role-remove-btn')) e.target.closest('tr').remove();
  });

  document.getElementById('admin-roles-save-btn').addEventListener('click', () => {
    const adminRoles = [];
    document.querySelectorAll('#admin-roles-tbody tr').forEach(row => {
      const nameEl = row.querySelector('.admin-role-name');
      const roleEl = row.querySelector('.admin-role-type');
      if (nameEl && roleEl && nameEl.value) {
        adminRoles.push({ name: nameEl.value, role: roleEl.value });
      }
    });
    const config = getTeamConfig();
    saveTeamConfig({ ...config, adminRoles });
    const status = document.getElementById('admin-roles-save-status');
    status.textContent = `✓ Saved — ${adminRoles.length} ${adminRoles.length === 1 ? 'admin' : 'admins'}`;
    status.className = 'import-status import-ok';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 4000);
  });

  // Edit submission buttons (admin only)
  document.getElementById('dashboard-tbody').addEventListener('click', e => {
    const editBtn   = e.target.closest('.edit-sub-btn');
    const deleteBtn = e.target.closest('.delete-sub-btn');
    const msgCell   = e.target.closest('td.msg');
    if (editBtn)   openEditSubmission(Number(editBtn.dataset.id));
    if (deleteBtn) deleteSubmission(Number(deleteBtn.dataset.id));
    if (msgCell)   msgCell.classList.toggle('msg-expanded');
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

  // Export team config
  document.getElementById('export-team-config-btn').addEventListener('click', () => {
    const config = getTeamConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'team-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Import team config
  const importTeamConfigFile = document.getElementById('import-team-config-file');
  document.getElementById('import-team-config-btn').addEventListener('click', () => importTeamConfigFile.click());
  importTeamConfigFile.addEventListener('change', () => {
    const file = importTeamConfigFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const config = JSON.parse(e.target.result);
        saveTeamConfig(config);
        showImportStatus('✓ Team config imported.');
        renderAdminPage();
      } catch {
        showImportStatus('✗ Invalid JSON file.', true);
      }
    };
    reader.readAsText(file);
    importTeamConfigFile.value = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
