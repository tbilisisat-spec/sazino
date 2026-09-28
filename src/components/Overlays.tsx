import { useState } from "react";
import { fa } from "../game/roulette";
import type { ScoreEntry } from "../game/storage";

function Backdrop({ children, onClose, z = "z-40" }: { children: React.ReactNode; onClose?: () => void; z?: string }) {
  return (
    <div className={`absolute inset-0 ${z} flex items-center justify-center bg-[#04100b]/85 p-4 backdrop-blur-sm`} onClick={onClose}>
      <div
        className="pop-in scroll-thin max-h-[94vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#f5c542]/40 bg-gradient-to-b from-[#12321f] to-[#071410] p-6 shadow-[0_30px_80px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function HighScoreTable({ scores, compact = false }: { scores: ScoreEntry[]; compact?: boolean }) {
  if (scores.length === 0) return <p className="py-3 text-center text-sm text-white/50">هنوز رکوردی ثبت نشده. اولین نفر باش!</p>;
  return (
    <div className={`scroll-thin overflow-y-auto ${compact ? "max-h-40" : "max-h-56"}`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#0b2317] text-xs text-[#f5c542]">
          <tr>
            <th className="py-1 text-right font-semibold">#</th>
            <th className="py-1 text-right font-semibold">بازیکن</th>
            <th className="py-1 text-left font-semibold">اوج سکه</th>
            <th className="py-1 text-left font-semibold">بزرگ‌ترین برد</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, i) => (
            <tr key={s.date + i} className="border-t border-white/5">
              <td className="py-1.5 text-right">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : fa(i + 1)}</td>
              <td className="py-1.5 text-right font-semibold">{s.name}</td>
              <td className="font-num py-1.5 text-left text-[#ffe680]">{fa(s.peak)}</td>
              <td className="font-num py-1.5 text-left text-emerald-300">+{fa(s.biggestWin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StartScreen({
  name,
  uid,
  telegram,
  giftAvailable,
  savedBalance,
  busy,
  scores,
  onEnter,
  onHelp,
}: {
  name: string;
  uid: string;
  telegram: boolean;
  giftAvailable: boolean;
  savedBalance: number | null;
  busy: boolean;
  scores: ScoreEntry[];
  onEnter: () => void;
  onHelp: () => void;
}) {
  return (
    <Backdrop>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-[#1fa855] to-[#0b3324] text-5xl shadow-[0_0_30px_rgba(245,197,66,.4)] ring-4 ring-[#f5c542]">
          🎡
        </div>
        <h1 className="gold-text text-4xl font-black leading-tight">سازینو</h1>
        <p className="mt-1 text-sm text-white/60">رولت زندهٔ سازینو · بخت با توست</p>

        {/* identity */}
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
          <span className="text-lg">{telegram ? "✈️" : "👤"}</span>
          <div className="text-right">
            <div className="font-bold text-white/90">{telegram ? `ورود با تلگرام: ${name}` : `مهمان (خارج از تلگرام)`}</div>
            <div className="font-num text-[10px] text-white/45" dir="ltr">
              {uid}
            </div>
          </div>
        </div>

        {giftAvailable ? (
          <div className="pulse-glow mt-3 rounded-2xl border border-[#f5c542]/50 bg-[#f5c542]/10 p-3">
            <p className="text-xs text-[#ffe680]">🎁 هدیهٔ خوش‌آمد برای این آیدی — فقط یک بار</p>
            <p className="font-num text-3xl font-black text-[#ffe680]">۱۰۰ سازکوین</p>
            <p className="text-[11px] text-white/50">قابل بازی، غیرقابل برداشت · بردهات قابل برداشته</p>
          </div>
        ) : savedBalance !== null ? (
          <div className="mt-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-3">
            <p className="text-xs text-emerald-200">حساب تو با این آیدی ذخیره شده</p>
            <p className="font-num text-3xl font-black text-emerald-300">{fa(savedBalance)} سازکوین</p>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">
            هدیهٔ این آیدی قبلاً دریافت شده. برای ادامه از سازتیک شارژ کن.
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button onClick={onEnter} disabled={busy} className="btn-gold w-full rounded-2xl py-3.5 text-lg font-black">
            {busy ? "در حال اتصال…" : giftAvailable ? "دریافت هدیه و ورود به میز" : "ورود به میز"}
          </button>
          <button onClick={onHelp} className="w-full rounded-2xl py-2 text-sm font-bold text-[#ffe680]/80 underline-offset-4 hover:underline">
            📖 راهنمای بازی
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/60">
          <div className="rounded-xl bg-white/5 p-2">
            <div className="text-lg">🪙</div>ژتون رو بردار
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <div className="text-lg">🎯</div>روی میز بذار
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <div className="text-lg">⏱</div>هر ۲۰ ثانیه یه دور
          </div>
        </div>

        <div className="mt-4 text-right">
          <h3 className="mb-1 text-xs font-bold text-[#f5c542]">🏆 جدول رکوردها</h3>
          <HighScoreTable scores={scores} compact />
        </div>
        <p className="mt-3 text-[10px] text-white/40">🎲 نتیجهٔ هر دور کاملاً تصادفی است (crypto RNG) · میز هر ۲۰ ثانیه خودکار می‌چرخد</p>
        <p className="mt-1 hidden text-[10px] text-white/40 sm:block">کیبورد: ←/→ ژتون · R تکرار · U برگشت · C پاک · D دوبرابر · P توقف · H راهنما</p>
      </div>
    </Backdrop>
  );
}

export function PauseScreen({
  onResume,
  onQuit,
  muted,
  onToggleMute,
}: {
  onResume: () => void;
  onQuit: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <Backdrop>
      <div className="text-center">
        <h2 className="gold-text text-3xl font-black">منو</h2>
        <p className="mt-1 text-sm text-white/60">میز زنده است و برای همه ادامه دارد؛ تا برنگردی شرطی بسته نمی‌شود. موجودی‌ات ذخیره است.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={onResume} className="btn-gold w-full rounded-2xl py-3.5 text-lg font-black">
            ادامه
          </button>
          <button onClick={onToggleMute} className="btn-dark w-full rounded-2xl py-3 font-bold text-[#ffe680]">
            {muted ? "🔇 صدا خاموش" : "🔊 صدا روشن"}
          </button>
          <button onClick={onQuit} className="w-full rounded-2xl py-2 text-sm text-white/50">
            بازگشت به صفحهٔ اصلی
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

export function GameOverScreen({
  peak,
  biggestWin,
  spins,
  bestStreak,
  totalWithdrawn,
  scores,
  rank,
  onTopup,
  onRequestCoins,
  requestBusy,
  onMenu,
}: {
  peak: number;
  biggestWin: number;
  spins: number;
  bestStreak: number;
  totalWithdrawn: number;
  scores: ScoreEntry[];
  rank: number;
  onTopup: () => void;
  onRequestCoins?: () => void;
  requestBusy?: boolean;
  onMenu: () => void;
}) {
  return (
    <Backdrop>
      <div className="text-center">
        <div className="text-5xl">💸</div>
        <h2 className="mt-1 text-3xl font-black text-red-300">سکه‌هات تموم شد!</h2>
        {rank >= 0 && rank < 3 && <p className="mt-1 text-sm font-bold text-[#ffe680]">🏆 رتبهٔ {fa(rank + 1)} جدول رکوردها!</p>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/5 p-2">
            <div className="text-[11px] text-white/50">اوج سکه</div>
            <div className="font-num text-xl font-black text-[#ffe680]">{fa(peak)}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <div className="text-[11px] text-white/50">بزرگ‌ترین برد</div>
            <div className="font-num text-xl font-black text-emerald-300">+{fa(biggestWin)}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <div className="text-[11px] text-white/50">چرخش‌ها</div>
            <div className="font-num text-xl font-black">{fa(spins)}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/60">
          بهترین استریک: <span className="font-num font-bold text-orange-300">🔥 {fa(bestStreak)}</span>
          {totalWithdrawn > 0 && (
            <>
              {" "}
              · برداشت‌شده: <span className="font-num font-bold text-emerald-300">{fa(totalWithdrawn)}</span>
            </>
          )}
        </p>
        <div className="mt-3 rounded-2xl border border-[#f5c542]/40 bg-[#f5c542]/10 p-3 text-xs text-white/70">
          هدیهٔ ۱۰۰ سازکوینی فقط یک بار به هر آیدی تلگرام داده می‌شود. برای ادامه، از کیف پول TON خودت <span className="font-bold text-[#ffe680]">SAZ</span> واریز کن یا از ادمین درخواست سکه بده.
        </div>
        <button onClick={onTopup} className="btn-gold pulse-glow mt-3 w-full rounded-2xl py-3.5 text-lg font-black">
          💎 شارژ با SAZ
        </button>
        {onRequestCoins && (
          <button
            onClick={onRequestCoins}
            disabled={requestBusy}
            className="mt-2 w-full rounded-2xl border border-emerald-400/50 bg-emerald-500/15 py-3 text-base font-bold text-emerald-200 disabled:opacity-50"
          >
            {requestBusy ? "در حال ارسال…" : "🆘 درخواست سازکوین از ادمین"}
          </button>
        )}
        <button onClick={onMenu} className="mt-2 w-full rounded-2xl py-2 text-sm text-white/50">
          بازگشت به صفحهٔ اصلی
        </button>
        <div className="mt-4 text-right">
          <h3 className="mb-1 text-xs font-bold text-[#f5c542]">🏆 جدول رکوردها</h3>
          <HighScoreTable scores={scores} compact />
        </div>
      </div>
    </Backdrop>
  );
}

export function WithdrawScreen({
  cash,
  bonus,
  min,
  busy,
  totalWithdrawn,
  tonAddress,
  network,
  treasury,
  uid,
  onConnect,
  onDisconnect,
  onWithdraw,
  onDeposit,
  onCheckDeposit,
  onClose,
}: {
  cash: number;
  bonus: number;
  min: number;
  busy: boolean;
  totalWithdrawn: number;
  tonAddress: string | null;
  network: string;
  treasury: string;
  uid: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onWithdraw: (amount: number, address: string) => void;
  onDeposit: () => void;
  onCheckDeposit: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"withdraw" | "deposit">("withdraw");
  const [amount, setAmount] = useState(cash >= min ? cash : min);
  const [agree, setAgree] = useState(false);
  const can = !!tonAddress && cash >= min && amount >= min && amount <= cash && agree;
  const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
  return (
    <Backdrop onClose={onClose} z="z-[60]">
      <div className="text-right">
        <div className="flex items-center justify-between">
          <h2 className="gold-text text-2xl font-black">کیف پول SAZ</h2>
          <button onClick={onClose} className="btn-dark h-9 w-9 rounded-xl text-[#ffe680]">
            ✕
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
          <span className="font-num" dir="ltr">
            {uid}
          </span>
          <span>{network === "mainnet" ? "🟢 TON mainnet" : "🟡 TON testnet (آزمایشی)"}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-3">
            <div className="text-[11px] text-emerald-200">💵 قابل برداشت (بردها)</div>
            <div className="font-num text-2xl font-black text-emerald-300">{fa(cash)}</div>
          </div>
          <div className="rounded-2xl border border-[#f5c542]/40 bg-[#f5c542]/10 p-3">
            <div className="text-[11px] text-[#ffe680]">🎁 هدیه (فقط برای بازی)</div>
            <div className="font-num text-2xl font-black text-[#ffe680]">{fa(bonus)}</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/55">
          سکه‌های هدیه قابل برداشت نیستند و همیشه اول از آن‌ها شرط بسته می‌شود. سود بردها به «قابل برداشت» می‌رود و به‌صورت توکن <b>SAZ</b> روی شبکهٔ TON به کیف پولت واریز می‌شود.
        </p>

        {/* tabs */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1 text-sm font-bold">
          <button onClick={() => setTab("withdraw")} className={`rounded-lg py-2 ${tab === "withdraw" ? "bg-[#f5c542] text-[#2a1d00]" : "text-white/60"}`}>
            💵 برداشت
          </button>
          <button onClick={() => setTab("deposit")} className={`rounded-lg py-2 ${tab === "deposit" ? "bg-[#f5c542] text-[#2a1d00]" : "text-white/60"}`}>
            ➕ شارژ
          </button>
        </div>

        {/* wallet connection (registration happens here, once) */}
        <div className="mt-3 rounded-2xl bg-white/5 p-3">
          <div className="text-xs font-bold text-white/80">۱) کیف پول TON</div>
          {tonAddress ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-num rounded-lg bg-emerald-400/15 px-2 py-1 text-xs text-emerald-300" dir="ltr">
                ✅ {short(tonAddress)}
              </span>
              <button onClick={onDisconnect} className="text-[11px] text-white/50 underline">
                قطع اتصال
              </button>
            </div>
          ) : (
            <>
              <button onClick={onConnect} className="btn-gold mt-2 w-full rounded-xl py-2.5 text-sm font-black">
                💎 اتصال کیف پول (Tonkeeper / Wallet تلگرام)
              </button>
              <p className="mt-1 text-[10px] text-white/45">یک بار وصل می‌کنی؛ آدرس به آیدی تلگرامت ثبت می‌شود. چیزی تایپ نمی‌کنی.</p>
            </>
          )}
        </div>

        {tab === "withdraw" ? (
          <div className="mt-2 rounded-2xl bg-white/5 p-3">
            <div className="text-xs font-bold text-white/80">۲) مبلغ برداشت (حداقل {fa(min)} SAZ)</div>
            <div className="mt-1 flex items-center gap-2" dir="ltr">
              <input
                type="number"
                min={min}
                max={cash}
                value={amount}
                onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))}
                className="font-num w-full rounded-xl border border-[#f5c542]/40 bg-black/40 px-3 py-2 text-lg font-black text-[#ffe680] outline-none focus:border-[#f5c542]"
              />
              <button onClick={() => setAmount(cash)} className="btn-dark shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-[#ffe680]">
                همه
              </button>
            </div>
            <label className="mt-2 flex items-start gap-2 text-[11px] text-white/60">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[#f5c542]" />
              <span>قوانین را می‌پذیرم: هر نفر فقط یک حساب؛ برداشت‌های بزرگ ممکن است تا ۲۴ ساعت بررسی شوند.</span>
            </label>
            <button onClick={() => tonAddress && onWithdraw(amount, tonAddress)} disabled={!can || busy} className="btn-gold mt-3 w-full rounded-2xl py-3 text-lg font-black">
              {busy ? "در حال ارسال…" : !tonAddress ? "اول کیف پول را وصل کن" : cash < min ? `حداقل ${fa(min)} SAZ برد لازم است` : `برداشت ${fa(amount)} SAZ`}
            </button>
            {totalWithdrawn > 0 && (
              <p className="mt-2 text-center text-[11px] text-white/50">
                مجموع برداشت‌های قبلی: <span className="font-num text-emerald-300">{fa(totalWithdrawn)} SAZ</span>
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl bg-white/5 p-3 text-xs leading-relaxed text-white/70">
            <div className="font-bold text-white/85">۲) ارسال SAZ به خزانهٔ سازینو</div>
            <p className="mt-1">
              از کیف پولت هر مقدار <b>SAZ</b> به آدرس زیر بفرست و در قسمت <b>کامنت/Memo</b> حتماً این را بنویس:
            </p>
            <div className="font-num mt-1 rounded-lg bg-black/40 px-2 py-1 text-center text-sm font-black text-[#ffe680]" dir="ltr">
              {uid}
            </div>
            <div className="font-num mt-1 break-all rounded-lg bg-black/40 px-2 py-1 text-[10px] text-white/70" dir="ltr">
              {treasury}
            </div>
            <button onClick={onDeposit} className="btn-gold mt-2 w-full rounded-xl py-2.5 text-sm font-black">
              🚀 باز کردن Tonkeeper با اطلاعات آماده
            </button>
            <button onClick={onCheckDeposit} disabled={busy} className="btn-dark mt-2 w-full rounded-xl py-2.5 text-sm font-bold text-[#ffe680]">
              {busy ? "در حال بررسی…" : "🔄 واریز کردم — موجودی را به‌روز کن"}
            </button>
            <p className="mt-1 text-[10px] text-white/45">تأیید شبکه معمولاً کمتر از ۱ دقیقه است. ۱ SAZ = ۱ سکهٔ بازی.</p>
          </div>
        )}
      </div>
    </Backdrop>
  );
}

export function HelpScreen({ onClose }: { onClose: () => void }) {
  const Row = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
    <div className="flex gap-3 rounded-xl bg-white/5 p-2.5">
      <span className="text-2xl leading-none">{icon}</span>
      <div>
        <div className="text-sm font-bold text-[#ffe680]">{title}</div>
        <div className="text-xs leading-relaxed text-white/70">{text}</div>
      </div>
    </div>
  );
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#04100b]/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="pop-in flex max-h-[92vh] w-full max-w-md flex-col rounded-3xl border border-[#f5c542]/40 bg-gradient-to-b from-[#12321f] to-[#071410] shadow-[0_30px_80px_rgba(0,0,0,.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="gold-text text-2xl font-black">راهنمای سازینو</h2>
          <button onClick={onClose} className="btn-dark h-9 w-9 rounded-xl text-[#ffe680]">
            ✕
          </button>
        </div>
        <div className="scroll-thin flex flex-col gap-2 overflow-y-auto p-4">
          <Row icon="✈️" title="ورود با تلگرام" text="حسابت به آیدی تلگرامت وصل است؛ هر بار وارد شوی موجودی و آمارت همان‌جاست." />
          <Row icon="🎁" title="هدیهٔ ۱۰۰ سازکوین — فقط یک بار" text="هر آیدی تلگرام فقط یک بار هدیه می‌گیرد. سکه‌های هدیه برای بازی‌اند و قابل برداشت نیستند." />
          <Row icon="💵" title="بردها قابل برداشت" text="هر سودی که ببری به بخش «قابل برداشت» می‌رود. از دکمهٔ «برداشت» (یا کلیک روی موجودی) با حداقل ۵۰ سکه درخواست بده. شرط همیشه اول از هدیه کم می‌شود تا بردهایت دست‌نخورده بمانند." />
          <Row icon="⏱" title="میز زنده — هر ۲۰ ثانیه" text="بعد از هر دور، ۲۰ ثانیه فرصت شرط داری. در ۵ ثانیهٔ آخر بوق هشدار می‌زند. با اتمام زمان شرط‌ها بسته و گوی خودکار رها می‌شود." />
          <Row icon="🪙" title="ژتون بردار" text="از ردیف پایین یک ژتون (۱ تا ۱۰۰) انتخاب کن. هر بار روی میز بزنی همان مقدار اضافه می‌شود." />
          <Row icon="🎯" title="روی میز بگذار" text="روی یک عدد (۰ تا ۳۶)، رنگ، زوج/فرد، کم/زیاد، دوجین یا ستون بزن. چند شرط هم‌زمان مجاز است." />
          <Row icon="💰" title="ضرایب پرداخت" text="عدد تکی ۳۵ به ۱ · دوجین و ستون ۲ به ۱ · قرمز/مشکی، زوج/فرد، ۱–۱۸/۱۹–۳۶ یک به یک. صفر همهٔ شرط‌های بیرونی را می‌بازد." />
          <Row icon="↩" title="ابزارها" text="برگشت: آخرین ژتون · پاک: همهٔ شرط‌ها · ×۲: دوبرابر · تکرار: شرط‌های دور قبل." />
          <Row icon="👥" title="بازیکن‌های دیگر" text="بعد از نشستن گوی، مجموع برد دور و ۵ برندهٔ اول به‌ترتیب نمایش داده می‌شود." />
          <Row icon="🎲" title="عدالت بازی" text="نتیجهٔ هر دور با مولد تصادفی رمزنگاری (crypto RNG) و مستقل از شرط و موجودی تو انتخاب می‌شود. اعداد داغ/سرد فقط آمارند." />
          <Row icon="💳" title="شارژ" text="وقتی سکه‌ات تمام شد، از saztik.com حسابت را شارژ کن؛ شارژ به همین آیدی تلگرام واریز می‌شود." />
          <Row icon="⌨️" title="کیبورد" text="←/→ یا ۱ تا ۶ ژتون · U برگشت · C پاک · D دوبرابر · R تکرار · P توقف · M صدا · H راهنما" />
        </div>
        <div className="p-4 pt-0">
          <button onClick={onClose} className="btn-gold w-full rounded-2xl py-3 text-lg font-black">
            فهمیدم، بریم!
          </button>
        </div>
      </div>
    </div>
  );
}
