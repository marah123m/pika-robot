const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const SENDER_EMAIL = 'robopikapika@gmail.com';
const APP_PASSWORD = 'sdpz hysz ggfi rctj';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SENDER_EMAIL,
    pass: APP_PASSWORD
  }
});

const verificationCodes = {};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const db = new sqlite3.Database('./database.db', function(err) {
  if (err) console.error('Database Error:', err.message);
  else console.log('Connected to SQLite database.');
});

db.serialize(function() {
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
    'age INTEGER, ' +
    'religion TEXT, ' +
    'persona TEXT, ' +
    'health TEXT, ' +
    'behavior TEXT, ' +
    'voice_status TEXT, ' +
    'avatar TEXT, ' +
    'FOREIGN KEY(serial_id) REFERENCES users(serial_id)' +
    ')'
  );
});

app.post('/api/send-code', function(req, res) {
  const email = req.body.email;
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  verificationCodes[email] = code;

  const mailOptions = {
    from: '"Pika Robot" <' + SENDER_EMAIL + '>',
    to: email,
    subject: 'Pika - Email Verification Code',
    text: 'Welcome to Pika! Your verification code is: ' + code
  };

  transporter.sendMail(mailOptions, function(err) {
    if (err) {
      console.error('Email Error:', err);
      return res.status(500).json({ success: false, message: 'Failed to send verification email!' });
    }
    res.json({ success: true });
  });
});

app.post('/api/register', function(req, res) {
  const b = req.body;
  if (verificationCodes[b.email] !== b.code) {
    return res.status(400).json({ success: false, message: 'Wrong verification code!' });
  }

  const sql = 'INSERT INTO users (serial_id, username, email, password) VALUES (?, ?, ?, ?)';
  db.run(sql, [b.serial_id, b.username, b.email, b.password], function(err) {
    if (err) return res.status(400).json({ success: false, message: 'Email or Serial already exists!' });
    delete verificationCodes[b.email];
    res.json({ success: true, serial_id: b.serial_id });
  });
});

app.post('/api/login', function(req, res) {
  const b = req.body;
  db.get('SELECT * FROM users WHERE email = ? AND password = ?', [b.email, b.password], function(err, row) {
    if (err || !row) return res.status(401).json({ success: false, message: 'Invalid email or password!' });
    res.json({ success: true, user: row });
  });
});

app.post('/api/robot-config', function(req, res) {
  const b = req.body;
  db.run(
    'UPDATE users SET robot_name = ?, default_persona = ? WHERE serial_id = ?',
    [b.robot_name, b.default_persona, b.serial_id],
    function(err) {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true });
    }
  );
});

app.post('/api/members', function(req, res) {
  const b = req.body;
  const sql = 'INSERT INTO family_members (serial_id, name, age, religion, persona, health, behavior, voice_status, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [b.serial_id, b.name, b.age, b.religion, b.persona, b.health, b.behavior, b.voice_status, b.avatar], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

app.get('/api/robot-data/:serial_id', function(req, res) {
  const serial_id = req.params.serial_id;
  db.get('SELECT serial_id, username, robot_name, default_persona FROM users WHERE serial_id = ?', [serial_id], function(err, user) {
    if (!user) return res.status(404).json({ success: false, message: 'Robot Serial not found' });

    db.all('SELECT * FROM family_members WHERE serial_id = ?', [serial_id], function(err, members) {
      res.json({
        success: true,
        robot: user,
        family_members: members || []
      });
    });
  });
});

app.delete('/api/members/:id', function(req, res) {
  db.run('DELETE FROM family_members WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

app.listen(PORT, function() {
  console.log('Server is running on http://localhost:' + PORT);
});