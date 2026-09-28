# راه‌اندازی سازینو روی saztik.com + تلگرام

## معماری
```
کاربر ──تلگرام──▶ https://saztik.com/sazino/        (فایل dist/index.html — بازی)
                         │  Authorization: tma <initData>
                         ▼
                  https://saztik.com/api/sazino/     (server/index.js — کیف پول سازکوین)
```

## مرحله ۱ — بات تلگرام
1. در تلگرام به **@BotFather** پیام بده: `/newbot` → نام: `Sazino` → یوزرنیم: `SazinoBot`
2. **توکن** را کپی کن (مثل `123456:ABC-DEF…`). این توکن هم برای سرور لازم است.

## مرحله ۲ — بک‌اند روی سرور saztik.com
```bash
# روی سرور (Node 18+)
mkdir -p /var/www/sazino-api && cd /var/www/sazino-api
# فایل server/index.js را اینجا کپی کن
npm init -y && npm i express
# اجرا با pm2
npm i -g pm2
BOT_TOKEN='123456:ABC-DEF…' ADMIN_KEY='یک-رمز-طولانی' CORS_ORIGIN='https://saztik.com' PORT=8787 \
  pm2 start index.js --name sazino-api
pm2 save && pm2 startup
```
تست: `curl https://saztik.com/api/sazino/health` باید `{"ok":true}` بدهد.

### Nginx (به کانفیگ saztik.com اضافه کن)
```nginx
location /api/sazino/ {
    proxy_pass http://127.0.0.1:8787/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
location /sazino/ {
    alias /var/www/sazino/;
    try_files $uri /sazino/index.html;
}
```
سپس `nginx -t && systemctl reload nginx`.

## مرحله ۳ — بیلد و آپلود بازی
```bash
# روی کامپیوتر خودت، در پوشهٔ پروژه
cp .env.example .env            # VITE_SAZCOIN_API=https://saztik.com/api/sazino
npm run build                   # خروجی: dist/index.html (یک فایل)
scp dist/index.html user@saztik.com:/var/www/sazino/index.html
```
باز کن: `https://saztik.com/sazino/` — باید در هدر «🔗 سازکوین» ببینی (نه «حالت دمو»).

## مرحله ۴ — اتصال Mini App در تلگرام
در @BotFather:
1. `/newapp` → بات `SazinoBot` → عنوان: `سازینو` → توضیح کوتاه → عکس 640×360 → GIF (رد کن) →
   **Web App URL:** `https://saztik.com/sazino/` → **short name:** `play`
2. `/setmenubutton` → بات را انتخاب کن → URL: `https://saztik.com/sazino/` → متن دکمه: `🎡 بازی`

لینک عمومی بازی: **https://t.me/SazinoBot/play**
هر کس بزند، بازی داخل تلگرام باز می‌شود، با آیدی تلگرامش وارد می‌شود و فقط بار اول ۱۰۰ سازکوین می‌گیرد.

## مرحله ۵ — شارژ و برداشت (اتصال به سازکوین سازتیک)
- **شارژ:** وقتی کاربر در بازی روی «شارژ حساب از سازتیک» می‌زند به
  `https://saztik.com/sazino/topup?uid=tg:123456` می‌رود. این صفحه را در سایتت بساز (پرداخت/کسر از کیف پول سازکوین)
  و بعد از موفقیت، از سرور سایتت این را صدا بزن:
  ```bash
  curl -X POST https://saztik.com/api/sazino/admin/topup \
       -H 'X-Admin-Key: یک-رمز-طولانی' -H 'Content-Type: application/json' \
       -d '{"uid":"tg:123456","amount":500}'
  ```
- **برداشت:** درخواست‌های کاربران در `GET /admin/withdrawals` (با همان X-Admin-Key) لیست می‌شوند.
  در `server/index.js` تابع `/withdraw` یک `TODO` دارد؛ همان‌جا واریز به کیف پول سازکوین کاربر را وصل کن.

## قوانین کیف پول (سمت سرور اجرا می‌شود)
| بخش | منبع | قابل شرط | قابل برداشت |
|---|---|---|---|
| 🎁 bonus | هدیهٔ ۱۰۰ سکه (یک بار به هر آیدی) | ✅ (اول از این کم می‌شود) | ❌ |
| 💵 cash | سود بردها + شارژ | ✅ | ✅ (حداقل ۵۰) |

نتیجهٔ هر دور را **سرور** با `crypto.randomInt` می‌سازد؛ مرورگر فقط نمایش می‌دهد.

## تست محلی بدون تلگرام
```bash
DEV_ALLOW_GUEST=1 BOT_TOKEN=x node server/index.js
```
(در این حالت هدر `X-Dev-Uid: guest:test` به‌جای تلگرام قبول می‌شود. در سرور واقعی این متغیر را نگذار.)
