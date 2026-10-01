/**
 * Telegram Kino Bot
 * Node.js + grammY + SQLite
 *
 * Foydalanish:
 * 1. .env faylni to'ldiring:
 *    BOT_TOKEN=...
 *    ADMIN_ID=123456789   (bir nechta bo'lsa: 123,456)
 * 2. npm install
 * 3. npm start
 *
 * Admin — kino qo'shish:
 * - Botga SHAXSIY chatda video yuboring. Caption'ga (izohga) quyidagicha
 *   yozsangiz, bot avtomatik ma'lumotlarni ajratib oladi (barchasi ixtiyoriy,
 *   faqat "Nomi" bo'lmasa fayl nomi yoki "Kino" deb qo'yiladi):
 *
 *     Nomi: Titanik
 *     Til: Ingliz tilida (o'zbekcha subtitr)
 *     Janr: Drama, Romantika
 *     Reyting: 7.8 (IMDb)
 *     Tavsif: Qisqacha tavsif...
 *
 *   Caption shunday formatda bo'lmasa, caption'ning o'zi kino nomi sifatida olinadi.
 *
 * Admin — boshqa buyruqlar:
 * - /list — barcha kinolar ro'yxati
 * - /edit <raqam> nomi <yangi nom>
 * - /edit <raqam> til <yangi til>
 * - /edit <raqam> janr <yangi janr>
 * - /edit <raqam> reyting <yangi reyting>
 * - /edit <raqam> tavsif <yangi tavsif>
 * - /edit <raqam> — keyingi yuboriladigan video bilan faylni almashtirish
 * - /delete <raqam> — o'chirish
 * - /stats — statistika
 *
 * Foydalanuvchi:
 * - Faqat raqam yuboring (masalan: 3) → kino keladi
 */

require('dotenv').config();
const { Bot, InputFile } = require('grammy');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// ==================== ENV tekshiruvi ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = [7050156709,7058515430]
    ? process.env.ADMIN_ID.split(',').map(id => Number(id.trim())).filter(Boolean)
    : [];

if (!BOT_TOKEN || ADMIN_IDS.length === 0) {
    console.error('❌ .env faylida BOT_TOKEN va ADMIN_ID majburiy!');
    console.error('Misol:');
    console.error('BOT_TOKEN=123456:ABC...');
    console.error('ADMIN_ID=123456789');
    process.exit(1);
}

// ==================== Bot yaratish ====================
const bot = new Bot(BOT_TOKEN);

// ==================== Yordamchi funksiyalar ====================
function isAdmin(ctx) {
    return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

function isPrivate(ctx) {
    return ctx.chat && ctx.chat.type === 'private';
}

/**
 * Caption'dan "Nomi:", "Til:", "Janr:", "Reyting:", "Tavsif:" kabi
 * strukturalangan maydonlarni ajratib oladi. Topilmagan maydonlar bo'sh qoladi.
 * Agar "Nomi:" yozilmagan bo'lsa, caption'dagi birinchi qatorni nom sifatida oladi.
 */
function parseMovieCaption(caption) {
    const result = { title: null, language: '', genre: '', rating: '', description: '' };
    if (!caption) return result;

    const fieldMap = {
        nomi: 'title', nom: 'title',
        til: 'language', tili: 'language',
        janr: 'genre', janri: 'genre',
        reyting: 'rating', baho: 'rating',
        tavsif: 'description', izoh: 'description',
    };

    const lines = caption.split('\n');
    const leftover = [];

    for (const line of lines) {
        const m = line.match(/^\s*(nomi|nom|til|tili|janr|janri|reyting|baho|tavsif|izoh)\s*:\s*(.+)$/i);
        if (m) {
            const dbField = fieldMap[m[1].toLowerCase()];
            result[dbField] = m[2].trim();
        } else if (line.trim()) {
            leftover.push(line.trim());
        }
    }

    if (!result.title && leftover.length > 0) {
        result.title = leftover[0];
    }

    return result;
}

// ==================== /start ====================
bot.command('start', async (ctx) => {
    console.log(`➡️  /start qabul qilindi. Foydalanuvchi: ${ctx.from?.id} (@${ctx.from?.username || '—'}), chat turi: ${ctx.chat?.type}`);

    if (!isPrivate(ctx)) return;

    const firstName = ctx.from.first_name || 'Kinosevar';

    // Fayl src/ ichida ham, loyiha tepasida ham bo'lishi mumkin — ikkalasini ham tekshiramiz
    const candidatePaths = [
        path.join(__dirname, 'KinoDropLogo.png'),
        path.join(__dirname, '..', 'KinoDropLogo.png'),
    ];
    const logoPath = candidatePaths.find((p) => fs.existsSync(p));

    // Yangi foydalanuvchi bo'lsa — adminlarga xabar beramiz (o'zi admin bo'lmasa)
    try {
        const isNew = await db.registerUserIfNew(ctx.from.id, ctx.from.username, ctx.from.first_name);
        if (isNew && !isAdmin(ctx)) {
            const total = await db.userCount();
            const uname = ctx.from.username ? `@${ctx.from.username}` : '(username yo\'q)';
            const notifyText =
                `🆕 *Yangi foydalanuvchi botga qo'shildi!*\n\n` +
                `👤 Ism: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n` +
                `🔗 Username: ${uname}\n` +
                `🆔 ID: \`${ctx.from.id}\`\n` +
                `📊 Jami foydalanuvchilar: ${total} ta`;
            for (const adminId of ADMIN_IDS) {
                try {
                    await bot.api.sendMessage(adminId, notifyText, { parse_mode: 'Markdown' });
                } catch (e) {
                    console.error(`Adminga (${adminId}) xabar yuborishda xato:`, e.message);
                }
            }
        }
    } catch (err) {
        console.error('Foydalanuvchini ro\'yxatga olishda xato:', err.message);
    }

    // 1) Avval rasmni (captionsiz) yuboramiz
    console.log('🖼️  Logotip qidirilmoqda. Tekshirilgan yo\'llar:', candidatePaths);
    try {
        if (logoPath) {
            console.log('✅ Logotip topildi:', logoPath, '— yuborilmoqda...');
            await ctx.replyWithPhoto(new InputFile(logoPath));
            console.log('✅ Logotip muvaffaqiyatli yuborildi.');
        } else {
            console.warn('⚠️  Logotip hech qaysi joyda topilmadi.');
        }
    } catch (err) {
        console.error('❌ /start rasm yuborishda xato:', err.message);
    }

    // 2) Keyin alohida xabar sifatida salomlashamiz
    const greeting =
        `🎬 *Assalomu alaykum, ${firstName}!* 👋\n\n` +
        `Xush kelibsiz — bu yerda **KinoDrop** sizni kutib turibdi! 🍿✨\n\n` +
        `🎞️ Minglab janr, ming xil kayfiyat — drama, komediya, jangari, romantika, fantastika... nimani xohlasangiz, shu yerda bor.\n` +
        `⚡️ Hech qanday reklama, hech qanday kutish — faqat raqamni yuboring, kino zumda sizniki!\n` +
        `🔔 Bot doimo yangilanib boradi — yangi kinolar tez-tez qo'shib turiladi, shuning uchun tez-tez qaytib turing 😉\n\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🔍 *Qanday foydalanish kerak?*\n` +
        `Kino raqamini yuboring — tamom!\n` +
        `Masalan: \`5\`\n` +
        `━━━━━━━━━━━━━━━\n\n` +
        `🎬 Xo'sh, bugun qaysi kinoni tomosha qilamiz? 😊`;

    try {
        await ctx.reply(greeting, { parse_mode: 'Markdown' });
        console.log(`✅ /start javobi yuborildi: ${ctx.from.id}`);
    } catch (err) {
        console.error('/start matn yuborishda xato:', err.message);
    }
});

// ==================== /help ====================
bot.command('help', async (ctx) => {
    if (!isPrivate(ctx)) return;

    let text =
        `📖 *Yordam*\n\n` +
        `• Kino olish: raqam yuboring (masalan \`5\`)\n` +
        `• /start — boshlang'ich xabar\n` +
        `• /help — ushbu yordam`;

    if (isAdmin(ctx)) {
        text +=
            `\n\n*Kino qo'shish:*\n` +
            `Video yuboring, caption'ga (ixtiyoriy) shunday yozing:\n` +
            '```\n' +
            `Nomi: Titanik\n` +
            `Til: Ingliz tilida\n` +
            `Janr: Drama, Romantika\n` +
            `Reyting: 7.8\n` +
            `Tavsif: Qisqacha tavsif...\n` +
            '```\n' +
            `\n*Admin buyruqlari:*\n` +
            `• /list — barcha kinolar ro'yxati\n` +
            `• /edit <raqam> nomi <yangi nom>\n` +
            `• /edit <raqam> til <yangi til>\n` +
            `• /edit <raqam> janr <yangi janr>\n` +
            `• /edit <raqam> reyting <yangi reyting>\n` +
            `• /edit <raqam> tavsif <yangi tavsif>\n` +
            `• /edit <raqam> — keyingi video bilan faylni almashtirish\n` +
            `• /delete <raqam> — o'chirish (masalan: /delete 5)\n` +
            `• /stats — jami kinolar soni`;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ==================== Admin: /list ====================
bot.command('list', async (ctx) => {
    if (!isPrivate(ctx) || !isAdmin(ctx)) return;

    try {
        const movies = await db.getAll();

        if (!movies || movies.length === 0) {
            return ctx.reply('📭 Hozircha hech qanday kino yo\'q.');
        }

        let text = `📋 *Kinolar ro'yxati* (${movies.length} ta):\n\n`;
        for (const m of movies) {
            text += `*${m.id}.* ${m.title}`;
            if (m.genre) text += ` — ${m.genre}`;
            text += `\n`;
        }

        if (text.length > 4000) {
            const chunks = text.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) {
                await ctx.reply(chunk, { parse_mode: 'Markdown' });
            }
        } else {
            await ctx.reply(text, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        console.error('/list xato:', err);
        await ctx.reply('❌ Ro\'yxatni olishda xatolik.');
    }
});

// ==================== Admin: /edit ====================
// /edit <raqam> nomi|til|janr|reyting|tavsif <yangi qiymat>
// /edit <raqam>   → keyingi video bilan faylni almashtirish
const pendingFileEdits = new Map(); // adminId -> movieId

const EDIT_FIELD_MAP = {
    'nomi': { db: 'title', label: 'Nomi' },
    'asl_nomi': { db: 'original_title', label: 'Asl nomi' }, // Mana bu yerda 'asl_nomi' borligiga e'tibor bering
    'yil': { db: 'year', label: 'Chiqqan yili' },
    'reyting': { db: 'rating', label: 'Reyting' },
    'janr': { db: 'genre', label: 'Janri' },
    'davlat': { db: 'country', label: 'Davlati' },
    'til': { db: 'language', label: 'Tili' },
    'tavsif': { db: 'description', label: 'Tavsif' }
};
bot.command('edit', async (ctx) => {
    if (!isPrivate(ctx) || !isAdmin(ctx)) return;

    const text = (ctx.message.text || '').trim();

    const matchFileOnly = text.match(/^\/edit\s+(\d+)\s*$/);
    const matchField = text.match(/^\/edit\s+(\d+)\s+(\S+)\s+([\s\S]+)$/);

    if (matchFileOnly) {
        const id = Number(matchFileOnly[1]);
        const movie = await db.getByNumber(id);
        if (!movie) return ctx.reply(`❌ ${id}-raqamli kino topilmadi.`);

        pendingFileEdits.set(ctx.from.id, id);
        return ctx.reply(
            `📌 *${id}*-raqamli kino (${movie.title}) uchun endi YANGI videoni yuboring — u eski faylni almashtiradi.`,
            { parse_mode: 'Markdown' }
        );
    }

    if (matchField) {
        const id = Number(matchField[1]);
        const fieldKey = matchField[2].toLowerCase();
        const value = matchField[3].trim();

        const fieldInfo = EDIT_FIELD_MAP[fieldKey];
        if (!fieldInfo) {
            return ctx.reply(
                '❌ Noma\'lum maydon. Quyidagilardan birini ishlating:\n' +
                '`nomi`, `asl_nomi`, `yil`, `reyting`, `janr`, `davlat`, `til`, `tavsif`',
                { parse_mode: 'Markdown' }
            );
        }

        const movie = await db.getByNumber(id);
        if (!movie) return ctx.reply(`❌ ${id}-raqamli kino topilmadi.`);

        const ok = await db.update(id, { [fieldInfo.db]: value });
        if (ok) {
            await ctx.reply(
                `✅ *${id}*-raqamli kinoning *${fieldInfo.label}* maydoni yangilandi:\n${value}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply('❌ Yangilashda xatolik.');
        }
        return;
    }

    await ctx.reply(
        '❌ Foydalanish:\n' +
        '`/edit <raqam> nomi <yangi nom>`\n' +
        '`/edit <raqam> asl_nomi <yangi asl nomi>`\n' +
        '`/edit <raqam> yil <yangi yil>`\n' +
        '`/edit <raqam> reyting <yangi reyting>`\n' +
        '`/edit <raqam> janr <yangi janr>`\n' +
        '`/edit <raqam> davlat <yangi davlat>`\n' +
        '`/edit <raqam> til <yangi til>`\n' +
        '`/edit <raqam> tavsif <yangi tavsif>`\n' +
        '`/edit <raqam>` — keyingi video bilan faylni almashtirish',
        { parse_mode: 'Markdown' }
    );
});

// ==================== Admin: /delete ====================
bot.command('delete', async (ctx) => {
    if (!isPrivate(ctx) || !isAdmin(ctx)) return;

    const parts = (ctx.message.text || '').split(/\s+/);
    const number = parts[1];

    if (!number || isNaN(Number(number))) {
        return ctx.reply('❌ Foydalanish: /delete <raqam>\nMasalan: /delete 5');
    }

    try {
        const ok = await db.remove(Number(number));
        if (ok) {
            await ctx.reply(`✅ ${number}-raqamli kino o'chirildi.`);
        } else {
            await ctx.reply(`❌ ${number}-raqamli kino topilmadi.`);
        }
    } catch (err) {
        console.error('/delete xato:', err);
        await ctx.reply('❌ O\'chirishda xatolik.');
    }
});

// ==================== Admin: /stats ====================
bot.command('stats', async (ctx) => {
    if (!isPrivate(ctx) || !isAdmin(ctx)) return;

    try {
        const total = await db.count();
        const users = await db.userCount();
        await ctx.reply(`📊 Jami kinolar: ${total} ta\n👥 Jami foydalanuvchilar: ${users} ta`);
    } catch (err) {
        console.error('/stats xato:', err);
        await ctx.reply('❌ Statistika olishda xatolik.');
    }
});


bot.command('users', async (ctx) => {
    if (!isPrivate(ctx)) return;

    // Faylda allaqachon mavjud bo'lgan ADMIN_IDS ni tekshiramiz
    if (!ADMIN_IDS.includes(ctx.from.id)) {
        return ctx.reply('❌ Bu buyruq faqat adminlar uchun!');
    }

    try {
        const totalUsers = await db.userCount();
        const active24h = await db.getActiveUserCount(24);
        const active7d = await db.getActiveUserCount(24 * 7);

        let message = `👥 **Foydalanuvchilar statistikasi**\n\n`;
        message += `📊 **Jami:** ${totalUsers} ta\n`;
        message += `🟢 **Oxirgi 24 soatda faol:** ${active24h} ta\n`;
        message += `🟡 **Oxirgi 7 kunda faol:** ${active7d} ta\n\n`;

        message += `🆕 **Oxirgi qo'shilgan foydalanuvchi:**\n`;
        message += `- ${ctx.from.first_name} — @${ctx.from.username || 'yoq'} — \`${ctx.from.id}\`\n`;
        message += `📅 ${new Date().toLocaleString()}\n`;

        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (err) {
        console.error('/users xatosi:', err.message);
        await ctx.reply('❌ Statistikani olishda xatolik yuz berdi.');
    }
});

// ==================== Admin: Video qo'shish ====================
async function saveMovie(ctx, movieData) {
    try {
        const movieId = await db.add(movieData);

        let info =
            `✅ *Kino muvaffaqiyatli qo'shildi!*\n\n` +
            `📌 **Raqami (Kodi):** \`${movieId}\`\n` +
            `🎬 **Nomi:** ${movieData.title}`;
        if (movieData.language) info += `\n🌐 **Til:** ${movieData.language}`;
        if (movieData.genre) info += `\n🎭 **Janr:** ${movieData.genre}`;
        if (movieData.rating) info += `\n⭐ **Reyting:** ${movieData.rating}`;
        if (movieData.description) info += `\n📝 **Tavsif:** ${movieData.description}`;

        await ctx.reply(info, { parse_mode: 'Markdown' });
        console.log(`✅ Yangi kino qo'shildi: #${movieId} - ${movieData.title}`);
    } catch (err) {
        console.error('Bazaga saqlashda xato:', err);
        await ctx.reply('❌ Bazaga saqlashda xatolik yuz berdi.');
    }
}

bot.on('message:video', async (ctx) => {
    if (!isPrivate(ctx) || !isAdmin(ctx)) return;

    const video = ctx.message.video;
    if (!video || !video.file_id) {
        return ctx.reply('❌ Video topilmadi.');
    }

    // Agar admin oldin /edit <raqam> yuborgan bo'lsa — faqat faylni almashtiramiz
    if (pendingFileEdits.has(ctx.from.id)) {
        const id = pendingFileEdits.get(ctx.from.id);
        pendingFileEdits.delete(ctx.from.id);

        const ok = await db.update(id, { fileId: video.file_id });
        if (ok) {
            await ctx.reply(`✅ *${id}*-raqamli kinoning video fayli yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ Faylni yangilashda xatolik (kino topilmadi).');
        }
        return;
    }

    const caption = (ctx.message.caption || '').trim();
    const parsed = parseMovieCaption(caption);

    await saveMovie(ctx, {
        title: parsed.title || 'Kino',
        fileId: video.file_id,
        language: parsed.language,
        genre: parsed.genre,
        rating: parsed.rating,
        description: parsed.description,
    });
});

bot.on('message:document', async (ctx) => {
    if (!isPrivate(ctx) || !isAdmin(ctx)) return;

    const doc = ctx.message.document;
    if (!doc) return;

    const mime = (doc.mime_type || '').toLowerCase();
    if (!mime.startsWith('video/')) {
        return ctx.reply('❌ Faqat video fayllar qabul qilinadi (mp4, mkv va h.k.).');
    }

    // Agar admin oldin /edit <raqam> yuborgan bo'lsa — faqat faylni almashtiramiz
    if (pendingFileEdits.has(ctx.from.id)) {
        const id = pendingFileEdits.get(ctx.from.id);
        pendingFileEdits.delete(ctx.from.id);

        const ok = await db.update(id, { fileId: doc.file_id });
        if (ok) {
            await ctx.reply(`✅ *${id}*-raqamli kinoning video fayli yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ Faylni yangilashda xatolik (kino topilmadi).');
        }
        return;
    }

    const caption = (ctx.message.caption || '').trim();
    const parsed = parseMovieCaption(caption);

    await saveMovie(ctx, {
        title: parsed.title || doc.file_name || 'Kino',
        fileId: doc.file_id,
        language: parsed.language,
        genre: parsed.genre,
        rating: parsed.rating,
        description: parsed.description,
    });
});

// ==================== Foydalanuvchi: raqam yuboradi ====================
bot.on('message:text', async (ctx) => {
    if (!isPrivate(ctx)) return;

    const text = (ctx.message.text || '').trim();

    if (text.startsWith('/')) return;

    if (!/^\d+$/.test(text)) {
        return ctx.reply(
            '❓ Iltimos, faqat *kino raqamini* yuboring.\nMasalan: `3`',
            { parse_mode: 'Markdown' }
        );
    }

    const number = Number(text);

    try {
        const movie = await db.getByNumber(number);

        if (!movie) {
            const total = await db.count();
            return ctx.reply(
                `😔 *${number}*-raqamli kino topilmadi.\n\n` +
                `Mavjud kinolar soni: ${total} ta.\n` +
                `Boshqa raqamni sinab ko'ring.`,
                { parse_mode: 'Markdown' }
            );
        }

        let caption = `🎬 ${movie.title}\n📌 Raqam: ${movie.id}`;
        if (movie.language) caption += `\n🌐 Til: ${movie.language}`;
        if (movie.genre) caption += `\n🎭 Janr: ${movie.genre}`;
        if (movie.rating) caption += `\n⭐ Reyting: ${movie.rating}`;
        if (movie.description) caption += `\n📝 ${movie.description}`;

        await ctx.replyWithVideo(movie.fileId, {
            caption,
            supports_streaming: true,
        });
    } catch (err) {
        console.error('Kino yuborishda xato:', err);
        await ctx.reply(
            `❌ Kino yuborishda xato yuz berdi.\n` +
            `Ehtimol fayl o'chirilgan yoki botga ruxsat yo'q.`
        );
    }
});

// ==================== Xatolarni tutish ====================
bot.catch((err) => {
    console.error(`Bot xatosi [${err.ctx?.update?.update_id}]:`, err.error);
});

// ==================== Ishga tushirish ====================
console.log('⏳ Telegram serverlariga ulanilmoqda...');

const launchTimeout = setTimeout(() => {
    console.error('❌ 15 soniya ichida Telegram API ga ulanib bo\'lmadi!');
    console.error('Tekshiring:');
    console.error('  1. Boshqa terminalda shu botning eski nusxasi ishlab turganmi?');
    console.error('  2. Internet / VPN ishlayaptimi?');
    console.error('  3. BOT_TOKEN to\'g\'rimi?');
}, 15000);

bot.start({
    onStart: async (botInfo) => {
        clearTimeout(launchTimeout);
        const total = await db.count();
        console.log('🚀 Kino bot muvaffaqiyatli ishga tushdi!');
        console.log(`🤖 Bot: @${botInfo.username}`);
        console.log(`📊 Hozirgi kinolar: ${total} ta`);
        console.log(`👤 Adminlar: ${ADMIN_IDS.join(', ')}`);
    },
}).catch((err) => {
    clearTimeout(launchTimeout);
    console.error('❌ Bot ishga tushmadi:', err.message || err);
    process.exit(1);
});

// Graceful stop
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());