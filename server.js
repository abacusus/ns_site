const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const db = new sqlite3.Database('./database.db');
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'topsecretkey',
  resave: false,
  saveUninitialized: false
}));

// Create DB tables if not exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT,
      type TEXT,
      data BLOB,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

// Auth middleware
function isLoggedIn(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

// Route: Home redirects to login or dashboard
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Register page
app.get('/naman14113114', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Dashboard (protected)
app.get('/dashboard', isLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Register handler (no hashing)
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function (err) {
    if (err) return res.send("Username already taken.");
    req.session.userId = this.lastID;
    res.redirect('/login');
  });
});

// Login handler (plain password check)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user || user.password !== password) {
      return res.send("Invalid credentials");
    }
    req.session.userId = user.id;
    res.redirect('/dashboard');
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Upload file
app.post('/upload', isLoggedIn, upload.single('file'), (req, res) => {
  const { originalname, mimetype, buffer } = req.file;
  db.run(`INSERT INTO files (user_id, name, type, data) VALUES (?, ?, ?, ?)`,
    [req.session.userId, originalname, mimetype, buffer],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// Get file list
app.get('/files', isLoggedIn, (req, res) => {
  db.all(`
    SELECT 
      files.id, 
      files.name, 
      files.type, 
      LENGTH(files.data) AS size, 
      files.uploaded_at, 
      users.username AS uploaded_by
    FROM files
    JOIN users ON files.user_id = users.id
    WHERE files.user_id = ?
  `, [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});




// Download file
app.get('/files/:id', isLoggedIn, (req, res) => {
  db.get(`SELECT * FROM files WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, row) => {
    if (!row) return res.status(404).send('File not found');
    res.setHeader('Content-Type', row.type);
    res.setHeader('Content-Disposition', `attachment; filename="${row.name}"`);
    res.send(row.data);
  });
});

// Start the server
app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
