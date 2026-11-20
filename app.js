const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.db');

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz8lASoWALg7oTee6WM4TG6D5oWoR-PGRtoiAiUFdv97xKO3yvJHfr_Yr3L2gG56F8v/exec';

const verificationCodes = {};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let db = null;

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(
    'CREATE TABLE IF NOT EXISTS users (' +
    'serial_id TEXT PRIMARY KEY, ' +
    'username TEXT, ' +
    'email TEXT UNIQUE, ' +
    'password TEXT, ' +
    'robot_name TEXT DEFAULT "Pika", ' +
    'default_persona TEXT DEFAULT "Cute & Gentle 🥰"' +
    ')'
  );

  db.run(
    'CREATE TABLE IF NOT EXISTS family_members (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'serial_id TEXT, ' +
    'name TEXT, ' +
    'gender TEXT, ' +
    'age INTEGER, ' +
    'religion TEXT, ' +
    'persona TEXT, ' +
    'health TEXT, ' +
    'behavior TEXT, ' +
    'voice_status TEXT, ' +
    'avatar TEXT' +
    ')'
  );

  saveDatabase();
  console.log('Connected to SQLite (sql.js) database.');
}

app.post('/api/send-code', async function(req, res) {
  const email = req.body.email;
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  verificationCodes[email] = code;

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ email: email, code: code })
    });

    const text = await response.text();
    console.log('Google Script Response:', text);
    res.json({ success: true });
  } catch (err) {
    console.error('Email Error:', err);
    res.status(500).json({ success: false, message: 'Failed to send verification email!' });
  }
});

app.post('/api/register', function(req, res) {
  const b = req.body;
  if (verificationCodes[b.email] !== b.code) {
    return res.status(400).json({ success: false, message: 'Wrong verification code!' });
  }

  try {
    const check = db.prepare('SELECT serial_id FROM users WHERE email = ? OR serial_id = ?');
    check.bind([b.email, b.serial_id]);
    if (check.step()) {
      check.free();
      return res.status(400).json({ success: false, message: 'Email or Serial already exists!' });
    }
    check.free();

    db.run(
      'INSERT INTO users (serial_id, username, email, password, robot_name, default_persona) VALUES (?, ?, ?, ?, ?, ?)',
      [b.serial_id, b.username, b.email, b.password, 'Pika', 'Cute & Gentle 🥰']
    );
    delete verificationCodes[b.email];
    saveDatabase();
    res.json({ success: true, serial_id: b.serial_id });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Email or Serial already exists!' });
  }
});

app.post('/api/login', function(req, res) {
  const b = req.body;
  const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?');
  stmt.bind([b.email, b.password]);

  if (stmt.step()) {
    const user = stmt.getAsObject();
    stmt.free();
    res.json({ success: true, user: user });
  } else {
    stmt.free();
    res.status(401).json({ success: false, message: 'Invalid email or password!' });
  }
});

app.post('/api/robot-config', function(req, res) {
  const b = req.body;
  try {
    db.run(
      'UPDATE users SET robot_name = ?, default_persona = ? WHERE serial_id = ?',
      [b.robot_name, b.default_persona, b.serial_id]
    );
    saveDatabase();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/members', function(req, res) {
  const b = req.body;
  try {
    db.run(
      'INSERT INTO family_members (serial_id, name, gender, age, religion, persona, health, behavior, voice_status, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [b.serial_id, b.name, b.gender || 'Member', b.age, b.religion, b.persona, b.health, b.behavior, b.voice_status, b.avatar]
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    const lastId = idRes[0].values[0][0];
    saveDatabase();
    res.json({ success: true, id: lastId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/robot-data/:serial_id', function(req, res) {
  const serial_id = req.params.serial_id;
  const userStmt = db.prepare('SELECT serial_id, username, robot_name, default_persona FROM users WHERE serial_id = ?');
  userStmt.bind([serial_id]);

  if (!userStmt.step()) {
    userStmt.free();
    return res.status(404).json({ success: false, message: 'Robot Serial not found' });
  }
  const user = userStmt.getAsObject();
  userStmt.free();

  const memStmt = db.prepare('SELECT * FROM family_members WHERE serial_id = ?');
  memStmt.bind([serial_id]);
  const members = [];
  while (memStmt.step()) {
    members.push(memStmt.getAsObject());
  }
  memStmt.free();

  res.json({
    success: true,
    robot: user,
    family_members: members
  });
});

app.delete('/api/members/:id', function(req, res) {
  try {
    db.run('DELETE FROM family_members WHERE id = ?', [req.params.id]);
    saveDatabase();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

initDatabase().then(function() {
  app.listen(PORT, function() {
    console.log('Server is running on port ' + PORT);
  });
});