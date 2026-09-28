/**
 * بات تلگرام سازینو — بدون وابستگی (فقط fetch داخلی Node 18+)
 * اجرا:  BOT_TOKEN=123:ABC GAME_URL=https://saztik.com/sazino/ node server/bot.js
 *
 * کار بات:
 *  - /start و /play (در چت خصوصی یا گروه) → پیام با دکمهٔ «🎡 بازی»
 *  - در گروه: دکمهٔ url به لینک t.me/<bot>/<shortname> → مینی‌اپ برای همان کاربر باز می‌شود (نه در گروه)
 *  - در خصوصی: دکمهٔ web_app → مستقیم مینی‌اپ باز می‌شود
 */
const TOKEN = process.env.BOT_TOKEN;
const GAME_URL = process.env.GAME_URL || "https://saztik.com/sazino/";
const APP_SHORT = process.env.APP_SHORT || "play"; // همان short name که در /newapp دادی
if (!TOKEN) {
  console.error("BOT_TOKEN لازم است");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;
let me = null;

async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

function playKeyboard(isPrivate) {
  const deepLink = `https://t.me/${me.username}/${APP_SHORT}`;
  return {
    inline_keyboard: [
      [isPrivate ? { text: "🎡 شروع بازی سازینو", web_app: { url: GAME_URL } } : { text: "🎡 شروع بازی سازینو", url: deepLink }],
      [{ text: "🎁 ۱۰۰ سازکوین هدیهٔ ورود", url: deepLink }],
    ],
  };
}

async function sendPlay(chat, isPrivate) {
  await tg("sendMessage", {
    chat_id: chat.id,
    text:
      "🎰 <b>سازینو — رولت زنده</b>\n" +
      "هر ۲۰ ثانیه یک دور · ۱۰۰ سازکوین هدیهٔ ورود (یک بار برای هر آیدی)\n" +
      "بردهات قابل برداشته 💵\n\n" +
      (isPrivate ? "دکمه را بزن تا بازی باز شود 👇" : "دکمه را بزن؛ بازی <b>برای خودت</b> به‌صورت خصوصی باز می‌شود 👇"),
    parse_mode: "HTML",
    reply_markup: playKeyboard(isPrivate),
  });
}

async function handle(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const isPrivate = msg.chat.type === "private";
  const cmd = msg.text.split(/[\s@]/)[0].toLowerCase();
  if (cmd === "/start" || cmd === "/play" || cmd === "/game" || cmd === "/بازی") {
    await sendPlay(msg.chat, isPrivate);
  }
}

async function main() {
  me = (await tg("getMe")).result;
  console.log(`بات @${me.username} روشن شد. لینک بازی: https://t.me/${me.username}/${APP_SHORT}`);
  await tg("setMyCommands", {
    commands: [
      { command: "play", description: "🎡 شروع بازی سازینو" },
      { command: "start", description: "شروع" },
    ],
  });
  // دکمهٔ منوی کنار چت (در چت خصوصی)
  await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "🎡 بازی", web_app: { url: GAME_URL } } });

  let offset = 0;
  for (;;) {
    try {
      const res = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
      for (const u of res.result || []) {
        offset = u.update_id + 1;
        handle(u).catch((e) => console.error(e));
      }
    } catch (e) {
      console.error("polling error", e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
main();
