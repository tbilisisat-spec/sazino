# راهنمای کامل: از لپ‌تاپ تا گروه تلگرام

> بازی همیشه در **مینی‌اپ** (تمام‌صفحه و خصوصی برای هر نفر) اجرا می‌شود. در گروه فقط یک پیام با دکمه ارسال می‌شود.

---

## بخش A — روی لپ‌تاپ (یک بار)

### A1. نصب ابزارها
- **Node.js** (نسخهٔ 18 یا بالاتر): از https://nodejs.org دانلود و نصب کن (LTS).
- بررسی: ترمینال/CMD را باز کن → `node -v` باید چیزی مثل `v20.x` نشان دهد.

### A2. پروژه را بگیر و بیلد کن
```bash
cd مسیر/پوشهٔ/پروژه
npm install
```
فایل `.env` بساز (کنار `package.json`) با این یک خط:
```
VITE_SAZCOIN_API=https://saztik.com/api/sazino
```
سپس:
```bash
npm run build
```
خروجی: **`dist/index.html`** (کل بازی در یک فایل).

> تست سریع روی لپ‌تاپ: `npm run dev` → مرورگر `http://localhost:5173` (حالت دمو، بدون تلگرام).

---

## بخش B — ساخت بات در تلگرام (۵ دقیقه)

1. در تلگرام **@BotFather** را باز کن.
2. `/newbot` → نام نمایشی: `سازینو` → یوزرنیم: مثلاً `SazinoBot` (باید به bot ختم شود).
3. **توکن** را کپی کن؛ شبیه `7123456789:AAH...` است. ⚠️ به کسی نده.
4. `/newapp` → بات را انتخاب کن →
   - Title: `سازینو`
   - Description: `رولت زندهٔ سازینو`
   - Photo: یک عکس 640×360 بفرست
   - GIF: `/empty`
   - **Web App URL:** `https://saztik.com/sazino/`
   - **Short name:** `play`
5. حالا لینک بازی داری: **`https://t.me/SazinoBot/play`**

---

## بخش C — روی سرور saztik.com

(با SSH وارد سرور شو. اگر هاست اشتراکی بدون Node داری، بخش «جایگزین» پایین را ببین.)

### C1. آپلود بازی
```bash
sudo mkdir -p /var/www/sazino
# از لپ‌تاپ:
scp dist/index.html user@saztik.com:/var/www/sazino/index.html
```

### C2. بک‌اند کیف پول + بات
```bash
sudo mkdir -p /var/www/sazino-api && cd /var/www/sazino-api
# فایل‌های server/index.js و server/bot.js را اینجا کپی کن (scp)
npm init -y && npm i express
sudo npm i -g pm2

# کیف پول
BOT_TOKEN='توکن-بات' ADMIN_KEY='یک-رمز-طولانی-تصادفی' CORS_ORIGIN='https://saztik.com' PORT=8787 \
  pm2 start index.js --name sazino-api

# بات (پاسخ به /play در گروه و خصوصی)
BOT_TOKEN='توکن-بات' GAME_URL='https://saztik.com/sazino/' APP_SHORT='play' \
  pm2 start bot.js --name sazino-bot

pm2 save && pm2 startup   # بعد از ریستارت سرور خودکار بالا بیاید
```

### C3. Nginx
در فایل کانفیگ `saztik.com` داخل بلوک `server { ... }` (نسخهٔ 443/https) اضافه کن:
```nginx
location /sazino/ {
    alias /var/www/sazino/;
    try_files $uri /sazino/index.html;
    add_header Cache-Control "no-cache";
}
location /api/sazino/ {
    proxy_pass http://127.0.0.1:8787/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### C4. تست
- `https://saztik.com/api/sazino/health` → `{"ok":true}`
- `https://saztik.com/sazino/` → صفحهٔ بازی باز می‌شود و در هدر **«🔗 سازکوین»** می‌بینی.
- در تلگرام لینک `https://t.me/SazinoBot/play` را بزن → بازی داخل تلگرام باز می‌شود، اسم و آیدی‌ات را نشان می‌دهد و ۱۰۰ سکه می‌گیری. ببند و دوباره باز کن → دیگر هدیه نمی‌دهد و موجودی‌ات همان است ✅

---

## بخش D — ارسال در گروه

1. بات را به گروه اضافه کن (نیازی به ادمین بودن نیست؛ فقط برای خواندن دستورها کافی است. اگر جواب نداد، در BotFather `/setprivacy` → Disable).
2. در گروه بنویس **`/play`** → بات پیامی با دکمهٔ **«🎡 شروع بازی سازینو»** می‌فرستد.
3. هر عضو دکمه را بزند، مینی‌اپ **فقط برای خودش** باز می‌شود (تمام‌صفحه، با آیدی خودش، کیف پول خودش). هیچ‌چیز در گروه اجرا یا نمایش داده نمی‌شود.
4. برای سنجاق: پیام بات را **Pin** کن تا همیشه بالای گروه باشد.

> راه دوم بدون بات: خودت در گروه پیام بده و لینک `https://t.me/SazinoBot/play` را بگذار؛ تلگرام خودش آن را به دکمهٔ باز کردن مینی‌اپ تبدیل می‌کند.

---

## جایگزین: هاست اشتراکی بدون Node (cPanel)
- `dist/index.html` را در پوشهٔ `public_html/sazino/` آپلود کن → بازی در حالت **دمو** کار می‌کند (سکه‌ها در مرورگر، بدون برداشت واقعی).
- برای کیف پول واقعی، بک‌اند را روی یک VPS ارزان یا سرویس رایگان مثل **Render.com / Railway** بالا بیاور و در `.env` آدرس همان را بگذار (مثلاً `https://sazino-api.onrender.com`).

---

## چک‌لیست خطاهای رایج
| مشکل | علت / راه‌حل |
|---|---|
| در هدر «🎮 حالت دمو» است | `.env` ساخته نشده یا بعد از ساختن `npm run build` نزده‌ای |
| «ورود نامعتبر — فقط از داخل تلگرام» | بازی را از مرورگر معمولی باز کرده‌ای؛ از لینک t.me باز کن. یا BOT_TOKEN سرور اشتباه است |
| بات در گروه جواب نمی‌دهد | BotFather → `/setprivacy` → Disable، بعد بات را از گروه حذف و دوباره اضافه کن |
| صفحهٔ سفید در تلگرام | آدرس باید https باشد و گواهی معتبر داشته باشد |
| بعد از آپدیت بازی تغییر نمی‌کند | کش تلگرام؛ در تنظیمات تلگرام → Data → Clear cache، یا در BotFather آدرس را دوباره ست کن |

---

## بخش E — درخواست سکه و شارژ دستی (ادمین)

وقتی سکه‌ی بازیکن تمام شود، در صفحهٔ «سکه‌هات تموم شد» دکمهٔ **«🆘 درخواست سازکوین از ادمین»** را می‌بیند. با زدن آن:

1. درخواست در سرور ثبت می‌شود.
2. اگر در env سرور `ADMIN_CHAT_ID` (آیدی عددی تلگرام خودت) و `BOT_TOKEN` تنظیم باشد، یک پیام تلگرامی با مشخصات بازیکن برایت می‌آید.

**تنظیم:** در env سرور اضافه کن:
```
ADMIN_CHAT_ID=123456789
```
(آیدی عددی خودت را از @userinfobot بگیر.)

**شارژ دستی یک بازیکن:**
```bash
curl -X POST https://آدرس-api/admin/topup \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid":"tg:123456789","amount":100}'
```

لیست درخواست‌ها:
```bash
curl -H "x-admin-key: $ADMIN_KEY" https://آدرس-api/admin/coin-requests
```
