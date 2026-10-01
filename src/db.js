const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Jadval yaratish + eski bazani yangi ustunlar bilan migratsiya qilish
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        fileId TEXT NOT NULL,
        language TEXT DEFAULT '',
        genre TEXT DEFAULT '',
        rating TEXT DEFAULT '',
        description TEXT DEFAULT ''
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        firstName TEXT,
        joinedAt TEXT,
        lastActiveAt TEXT
    )`);

    // Eski "users" jadvalida "lastActiveAt" bo'lmasligi mumkin — bor-yo'qligini tekshiramiz
    db.all(`PRAGMA table_info(users)`, [], (err, columns) => {
        if (err) return console.error('PRAGMA (users) xato:', err.message);
        const existing = columns.map((c) => c.name);
        if (!existing.includes('lastActiveAt')) {
            db.run(`ALTER TABLE users ADD COLUMN lastActiveAt TEXT DEFAULT ''`, (e) => {
                if (e) console.error('"lastActiveAt" ustunini qo\'shishda xato:', e.message);
                else console.log('🛠️  Baza yangilandi: "lastActiveAt" ustuni qo\'shildi.');
            });
        }
    });

    // Eski (avvalgi) bazada bu ustunlar bo'lmasligi mumkin — bor-yo'qligini
    // tekshirib, yo'q bo'lganlarini qo'shamiz (mavjud ma'lumotlar saqlanib qoladi)
    db.all(`PRAGMA table_info(movies)`, [], (err, columns) => {
        if (err) {
            console.error('PRAGMA table_info xato:', err.message);
            return;
        }
        const existing = columns.map((c) => c.name);
        const newColumns = {
            language: `ALTER TABLE movies ADD COLUMN language TEXT DEFAULT ''`,
            genre: `ALTER TABLE movies ADD COLUMN genre TEXT DEFAULT ''`,
            rating: `ALTER TABLE movies ADD COLUMN rating TEXT DEFAULT ''`,
            description: `ALTER TABLE movies ADD COLUMN description TEXT DEFAULT ''`,
        };
        for (const [col, sql] of Object.entries(newColumns)) {
            if (!existing.includes(col)) {
                db.run(sql, (e) => {
                    if (e) console.error(`"${col}" ustunini qo'shishda xato:`, e.message);
                    else console.log(`🛠️  Baza yangilandi: "${col}" ustuni qo'shildi.`);
                });
            }
        }
    });
});

// Promise wrapper
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Yangi kino qo'shish.
 * @param {{ title: string, fileId: string, language?: string, genre?: string, rating?: string, description?: string }} movie
 * @returns {number} yangi ID
 */
async function add({ title, fileId, language = '', genre = '', rating = '', description = '' }) {
    const result = await runAsync(
        `INSERT INTO movies (title, fileId, language, genre, rating, description) VALUES (?, ?, ?, ?, ?, ?)`,
        [title, fileId, language, genre, rating, description]
    );
    return result.lastID;
}

// Barcha kinolarni olish
async function getAll() {
    return await allAsync(`SELECT * FROM movies ORDER BY id ASC`);
}

// Raqam bo'yicha kino olish
async function getByNumber(id) {
    return await getAsync(`SELECT * FROM movies WHERE id = ?`, [id]);
}

// O'chirish
async function remove(id) {
    const result = await runAsync(`DELETE FROM movies WHERE id = ?`, [id]);
    return result.changes > 0;
}

/**
 * Tahrirlash: berilgan maydonlarnigina yangilaydi, qolganlari o'zgarmaydi.
 * @param {number} id
 * @param {{ title?: string, fileId?: string, language?: string, genre?: string, rating?: string, description?: string }} fields
 * @returns {boolean}
 */
async function update(id, fields = {}) {
    const existing = await getByNumber(id);
    if (!existing) return false;

   const merged = {
    title: fields.title !== undefined ? fields.title : existing.title,
    fileId: fields.fileId !== undefined ? fields.fileId : existing.fileId,
    language: fields.language !== undefined ? fields.language : existing.language,
    genre: fields.genre !== undefined ? fields.genre : existing.genre,
    rating: fields.rating !== undefined ? fields.rating : existing.rating,
    description: fields.description !== undefined ? fields.description : existing.description,
};

    const result = await runAsync(
        `UPDATE movies SET title = ?, fileId = ?, language = ?, genre = ?, rating = ?, description = ? WHERE id = ?`,
        [merged.title, merged.fileId, merged.language, merged.genre, merged.rating, merged.description, id]
    );
    return result.changes > 0;
}


// Jami soni
async function count() {
    const row = await getAsync(`SELECT COUNT(*) as cnt FROM movies`);
    return row ? row.cnt : 0;
}
// Foydalanuvchini bazaga qo'shish yoki oxirgi faol vaqtini yangilash
async function registerUserIfNew(user) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO users (id, username, firstName, joinedAt, lastActiveAt) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(id) DO UPDATE SET 
             username = excluded.username,
             firstName = excluded.firstName,
             lastActiveAt = excluded.lastActiveAt`,
            [user.id, user.username || null, user.first_name || null, now, now],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

/**
 * Foydalanuvchini ro'yxatga oladi (agar yangi bo'lsa) yoki faollik vaqtini yangilaydi.
 * @returns {boolean} true bo'lsa — bu foydalanuvchi ENDI birinchi marta ko'rindi (yangi)
 */
async function touchUser(id, username, firstName) {
    const now = new Date().toISOString();
    const existing = await getAsync(`SELECT id FROM users WHERE id = ?`, [id]);

    if (existing) {
        await runAsync(
            `UPDATE users SET username = ?, firstName = ?, lastActiveAt = ? WHERE id = ?`,
            [username || '', firstName || '', now, id]
        );
        return false;
    }

    await runAsync(
        `INSERT INTO users (id, username, firstName, joinedAt, lastActiveAt) VALUES (?, ?, ?, ?, ?)`,
        [id, username || '', firstName || '', now, now]
    );
    return true;
}

async function userCount() {
    const row = await getAsync(`SELECT COUNT(*) as cnt FROM users`);
    return row ? row.cnt : 0;
}

/**
 * Berilgan soat ichida faol bo'lgan foydalanuvchilar sonini qaytaradi.
 */
async function getActiveUserCount(hours) {
    return new Promise((resolve, reject) => {
        const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        db.get(`SELECT COUNT(*) as cnt FROM users WHERE lastActiveAt >= ?`, [cutoff], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.cnt : 0);
        });
    });
}
async function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Eng oxirgi qo'shilgan foydalanuvchilar ro'yxati.
 */
async function getRecentUsers(limit = 10) {
    return await allAsync(`SELECT * FROM users ORDER BY joinedAt DESC LIMIT ?`, [limit]);
}

module.exports = {
    add,
    getAll,
    getByNumber,
    remove,
    update,
    count,
    touchUser,
    userCount,
    getActiveUserCount,
    getRecentUsers,
    getAllUsers,
    registerUserIfNew
};