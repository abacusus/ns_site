const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage });

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'topsecretkey',
  resave: false,
  saveUninitialized: false
}));

// Initialize DB tables
(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      name TEXT,
      type TEXT,
      data BYTEA,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
})();

// Auth middleware
function isLoggedIn(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/ns', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', isLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Register (plain password for now)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id`,
      [username, password]
    );
    req.session.userId = result.rows[0].id;
    res.redirect('/login');
  } catch (err) {
    res.send("Username already taken.");
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    const user = result.rows[0];
    if (!user || user.password !== password) {
      return res.send("Invalid credentials");
    }
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (err) {
    res.send("Login failed.");
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Upload file
app.post('/upload', isLoggedIn, upload.single('file'), async (req, res) => {
  const { originalname, mimetype, buffer } = req.file;
  try {
    await db.query(
      `INSERT INTO files (user_id, name, type, data) VALUES ($1, $2, $3, $4)`,
      [req.session.userId, originalname, mimetype, buffer]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List files
app.get('/files', isLoggedIn, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        files.id, 
        files.name, 
        files.type, 
        OCTET_LENGTH(files.data) AS size,
        files.uploaded_at,
        users.username AS uploaded_by
      FROM files
      JOIN users ON files.user_id = users.id
      WHERE files.user_id = $1
    `, [req.session.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download file
app.get('/files/:id', isLoggedIn, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM files WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.session.userId]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).send('File not found');
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.send(file.data);
  } catch (err) {
    res.status(500).send("Error downloading file");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

