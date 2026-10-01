# 🎬 Telegram Kino Bot (Node.js + Telegraf)

100% ishlaydigan, production-ready kino bot.

## ✨ Imkoniyatlar

- Foydalanuvchi raqam yuboradi → yopiq kanaldan kino `copyMessage` orqali keladi
- Admin botga **video** yuboradi → bot avtomatik raqam berib, kanalga saqlaydi
- JSON fayl bazasi (keyinchalik MongoDB ga o'tish oson)
- Toza arxitektura, izohlar bilan

## 📋 Talablar

- Node.js >= 18
- Telegram Bot Token (@BotFather)
- Yopiq kanal (botni admin qilib qo'shing!)
- O'z user ID ingiz (ADMIN_ID)

## 🚀 O'rnatish

```bash
# 1. Loyihani oching
cd telegram-kino-bot

# 2. Paketlarni o'rnating
npm install

# 3. .env fayl yarating
cp .env.example .env
# .env ni o'zingizning ma'lumotlaringiz bilan to'ldiring

# 4. Botni ishga tushiring
npm start
```

## ⚙️ .env sozlamalari

```env
BOT_TOKEN=...          # BotFather tokeni
ADMIN_ID=123456789     # Sizning Telegram ID
CHANNEL_ID=-100...     # Yopiq kanal ID
```

### CHANNEL_ID ni qanday olish?

1. Kanalni yarating (yopiq)
2. Botni kanalga **admin** sifatida qo'shing (xabar yuborish huquqi bilan)
3. Kanalga biror xabar yozing
4. Xabarni forward qilib @userinfobot ga yuboring yoki kanal ID sini boshqa botlar orqali oling

## 👤 Foydalanuvchi

Oddiy raqam yuboring:

```
3
```

Bot yopiq kanaldan o'sha kinoni yuboradi.

## 🛠 Admin buyruqlari

| Buyruq / Harakat          | Natija                                      |
|---------------------------|---------------------------------------------|
| **Video yuborish**        | Avtomatik raqam beriladi, kanalga saqlanadi |
| `/list`                   | Barcha kinolar ro'yxati                     |
| `/delete 5`               | 5-raqamli kinoni o'chirish                  |
| `/stats`                  | Jami kinolar soni                           |
| `/help`                   | Yordam                                      |

> Video yuborayotganda **caption** qo'shsangiz — u kino nomi bo'ladi.

## 📁 Loyiha tuzilishi

```
telegram-kino-bot/
├── package.json
├── .env.example
├── README.md
├── data/
│   └── movies.json      # Avtomatik yaratiladi
└── src/
    ├── index.js         # Asosiy bot logikasi
    └── db.js            # JSON baza (MongoDB ga o'tish oson)
```

## 🔄 MongoDB ga o'tish

`src/db.js` dagi funksiyalar interfeysi o'zgarmaydi. Faqat ichki implementatsiyani MongoDB driver bilan almashtiring:

- `getByNumber(number)`
- `add(title, messageId)`
- `remove(number)`
- `getAll()`, `count()`

## ⚠️ Muhim eslatmalar

1. Bot **yopiq kanalda admin** bo'lishi shart (xabar yuborish huquqi).
2. `CHANNEL_ID` to'g'ri bo'lishi kerak (`-100` bilan boshlanadi).
3. Bot faqat **private** chatda ishlaydi (guruhlarda e'tiborsiz).
4. `data/movies.json` faylini backup qilib turing.

## 📄 Litsenziya

MIT
