# 🎬 KinoDrop (Node.js + Telegraf)

100% ishlaydigan, production-ready Telegram kino boti.

## ✨ Imkoniyatlar

- Foydalanuvchi kino raqamini yuboradi → yopiq kanaldan kino `copyMessage` orqali keladi.
- Admin botga **video va shablon** yuboradi → bot avtomatik raqam berib, kanalga saqlaydi.
- SQLite ma'lumotlar bazasi (`db.js`) orqali foydalanuvchilar va kinolarni to'liq boshqarish.
- `/edit` komandasi yordamida kino ma'lumotlarini (nomi, yili, janri, reytingi va h.k.) oson o'zgartirish imkoniyati.
- Foydalanuvchilar statistikasini kuzatish (`/users` va `/stats`).

## 📋 Talablar

- Node.js >= 18
- Telegram Bot Token (@BotFather)
- Yopiq kanal (botni admin qilib qo'shing!)
- O'z user ID ingiz (`ADMIN_ID`)

## 🚀 O'rnatish

```bash
# 1. Loyihani oching
cd telegram-kino-bot

# 2. Paketlarni o'rnating
npm install

# 3. .env fayl yarating va to'ldiring
# BOT_TOKEN=...
# ADMIN_ID=...
# CHANNEL_ID=-100...

# 4. Botni ishga tushiring
npm start