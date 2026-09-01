const Database = require('better-sqlite3');
const db = new Database('database.db');

// Jadvallarni yaratish
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    lang TEXT DEFAULT 'uz',
    date TEXT
  )
`);

// Foydalanuvchini saqlash yoki yangilash
function saveUser(user) {
  if (!user) return;
  const stmt = db.prepare(`
    INSERT INTO users (id, first_name, last_name, username, date)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      username = excluded.username
  `);
  stmt.run(
    user.id,
    user.first_name || '',
    user.last_name || '',
    user.username ? `@${user.username}` : 'Mavjud emas',
    new Date().toISOString().split('T')[0]
  );
}

// Tilni saqlash
function setUserLanguage(userId, lang) {
  const stmt = db.prepare(`UPDATE users SET lang = ? WHERE id = ?`);
  stmt.run(lang, userId);
}

// Tilni olish
function getUserLanguage(userId) {
  const stmt = db.prepare(`SELECT lang FROM users WHERE id = ?`);
  const row = stmt.get(userId);
  return row ? row.lang : 'uz';
}

// Barcha foydalanuvchilarni olish
function getUsers() {
  const stmt = db.prepare(`SELECT * FROM users`);
  return stmt.all();
}

module.exports = { saveUser, setUserLanguage, getUserLanguage, getUsers };