const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TEAM_MEMBERS = [
  'Abby Hines', 'Allison Hunt', 'Amy Burklow', 'Ashley Booth', 'Bennett Clark',
  'Brian Cole', 'Cade Jones', 'Carrie Marsteller', 'Charlie May', 'Colton Angel',
  'Dom Dippel', 'Elijah VanDine', 'Heather Hoerr', 'Jess Ferguson', 'JoAnna Keilman',
  'John Gough', 'Karen Seketa', 'Kay Manary', 'Kayla Searles', 'Kyler Mason',
  'Lehla Kisor', 'Madie Lutzke', 'Noah Gregg', 'Rachel Young', 'Reid Morris',
  'Roman Smith', 'Sarah Riggio', 'Steven Hileman', 'Theresa Behrens Goodall',
  'Tiffany Sauder', 'Victoria Shaw',
];

const SEED_POINTS = {
  'Colton Angel': 100, 'Ashley Booth': 570, 'Amy Burklow': 735, 'Bennett Clark': 475,
  'Brian Cole': 810, 'Jess Ferguson': 1130, 'Theresa Behrens Goodall': 965,
  'John Gough': 300, 'Noah Gregg': 595, 'Heather Hoerr': 5, 'Steven Hileman': 30,
  'Abby Hines': 595, 'Allison Hunt': 75, 'Cade Jones': 610, 'JoAnna Keilman': 10,
  'Madie Lutzke': 220, 'Carrie Marsteller': 1060, 'Kyler Mason': 290,
  'Charlie May': 5, 'Reid Morris': 705, 'Sarah Riggio': 195, 'Kayla Searles': 585,
  'Karen Seketa': 140, 'Victoria Shaw': 260, 'Roman Smith': 55, 'Rachel Young': 275,
};

// Initialize tables and seed if empty
async function initDb() {
  const fs = require('fs');
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Seed team config if empty
  const configResult = await pool.query('SELECT id FROM team_config WHERE id = 1');
  if (!configResult.rows.length) {
    const defaultConfig = {
      members: TEAM_MEMBERS.map(name => ({ name, email: '', manager: '' })),
      adminRoles: [],
    };
    await pool.query(
      'INSERT INTO team_config (id, data) VALUES (1, $1)',
      [JSON.stringify(defaultConfig)]
    );
    console.log('Seeded team config with', TEAM_MEMBERS.length, 'members.');
  }

  // Seed points ledger if empty
  const ledgerResult = await pool.query('SELECT COUNT(*) FROM points_ledger');
  if (parseInt(ledgerResult.rows[0].count) === 0) {
    const entries = Object.entries(SEED_POINTS);
    if (entries.length) {
      const values = entries.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(', ');
      await pool.query(`INSERT INTO points_ledger (name, points) VALUES ${values}`, entries.flat());
      console.log('Seeded points ledger for', entries.length, 'people.');
    }
  }
}

/* ── TEAM CONFIG ── */
app.get('/api/team-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM team_config WHERE id = 1');
    res.json(result.rows[0]?.data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/team-config', async (req, res) => {
  try {
    const data = req.body;
    const current = (data.members || []).filter(m => (m.status || 'current') === 'current');
    const former  = (data.members || []).filter(m => m.status === 'former');
    const noManager = current.filter(m => !m.manager).length;
    const adminRoles = (data.adminRoles || []).length;
    console.log(`[team-config PUT] ${new Date().toISOString()} | current=${current.length} former=${former.length} adminRoles=${adminRoles} noManager=${noManager}`);
    await pool.query(
      'INSERT INTO team_config (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1',
      [JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── SUBMISSIONS ── */
app.get('/api/submissions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM submissions ORDER BY timestamp DESC');
    res.json(result.rows.map(r => ({
      id: Number(r.id),
      timestamp: r.timestamp,
      giver: r.giver,
      awardee: r.awardee,
      value: r.value,
      message: r.message,
      status: r.status,
      imported: r.imported,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/submissions', async (req, res) => {
  const { id, timestamp, giver, awardee, value, message, status, imported } = req.body;
  try {
    await pool.query(
      'INSERT INTO submissions (id, timestamp, giver, awardee, value, message, status, imported) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, timestamp, giver, awardee, value, message, status || 'pending', imported || false]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/submissions/:id', async (req, res) => {
  const { giver, awardee, value, message, status, imported } = req.body;
  try {
    await pool.query(
      'UPDATE submissions SET giver=$1, awardee=$2, value=$3, message=$4, status=$5, imported=$6 WHERE id=$7',
      [giver, awardee, value, message, status, imported, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/submissions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM submissions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POINTS LEDGER ── */
app.get('/api/points-ledger', async (req, res) => {
  try {
    const result = await pool.query('SELECT name, points FROM points_ledger');
    const ledger = {};
    result.rows.forEach(r => { ledger[r.name] = r.points; });
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/points-ledger', async (req, res) => {
  const ledger = req.body; // { name: points, ... }
  try {
    await pool.query('DELETE FROM points_ledger');
    const entries = Object.entries(ledger);
    if (entries.length) {
      const values = entries.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(', ');
      const flat = entries.flat();
      await pool.query(`INSERT INTO points_ledger (name, points) VALUES ${values}`, flat);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── CASH MILESTONES ── */
app.get('/api/cash-milestones', async (req, res) => {
  try {
    const result = await pool.query('SELECT name, fired_thresholds FROM cash_milestones');
    const milestones = {};
    result.rows.forEach(r => { milestones[r.name] = r.fired_thresholds; });
    res.json(milestones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cash-milestones', async (req, res) => {
  const milestones = req.body; // { name: [pts, ...], ... }
  try {
    const entries = Object.entries(milestones);
    for (const [name, fired] of entries) {
      await pool.query(
        'INSERT INTO cash_milestones (name, fired_thresholds) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET fired_thresholds = $2',
        [name, fired]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── CATCH-ALL: serve index.html for any non-API route ── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Awesome Blocks running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
