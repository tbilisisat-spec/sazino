import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Wheel, { type SpinRequest } from "./components/Wheel";
import BettingTable from "./components/BettingTable";
import Chip from "./components/Chip";
import Particles, { type ParticleAPI } from "./components/Particles";
import { GameOverScreen, HelpScreen, PauseScreen, StartScreen, WithdrawScreen } from "./components/Overlays";
import { CHIP_VALUES, colorOf, fa, parseKey, payoutMultiplier, settle, BET_LABELS, type BetKey } from "./game/roulette";
import {
  BET_WINDOW_MS,
  RESULT_MS,
  SPIN_MS,
  computeState,
  rememberResult,
  resultFor,
  serverNow,
  syncWithServer,
  type TablePhase,
} from "./game/table";
import { sfx, setMuted, unlockAudio } from "./game/audio";
import {
  giftClaimed,
  loadPlayer,
  loadScores,
  markGiftClaimed,
  savePlayer,
  saveScore,
  type ScoreEntry,
  type Wallet,
} from "./game/storage";
import { haptic, initTelegram, isTelegram, openTelegramLink, playerId, playerName } from "./game/telegram";
import { sazcoin, sazcoinEnabled } from "./game/sazcoin";
import { SAZ_TREASURY, TON_NETWORK, connectWallet, connectedAddress, depositLink, disconnectWallet } from "./game/ton";
type Phase = "start" | "betting" | "spinning" | "result" | "gameover";
const GIFT_COINS = 100;
const MIN_WITHDRAW = 50;

interface Float {
  id: number;
  text: string;
  color: string;
}
/** How much of each bet was funded from bonus vs cash (bonus is always spent first). */
type Fund = Record<BetKey, { bonus: number; cash: number }>;
interface StackItem {
  key: BetKey;
  bonus: number;
  cash: number;
}
interface Winner {
  name: string;
  avatar: string;
  amount: number;
  isYou?: boolean;
}

function useWindowSize() {
  const [s, setS] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setS({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return s;
}

export default function App() {
  const name = useMemo(() => playerName(), []);
  const uid = useMemo(() => playerId(), []);
  const [phase, setPhase] = useState<Phase>("start");
  const [paused, setPaused] = useState(false);
  const [wallet, setWallet] = useState<Wallet>({ bonus: 0, cash: 0 });
  const [fund, setFund] = useState<Fund>({});
  const [peak, setPeak] = useState(0);
  const [biggestWin, setBiggestWin] = useState(0);
  const [spins, setSpins] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [bets, setBets] = useState<Record<BetKey, number>>({});
  const [betStack, setBetStack] = useState<StackItem[]>([]);
  const [lastBets, setLastBets] = useState<Record<BetKey, number>>({});
  const [chipIdx, setChipIdx] = useState(1);
  const [spinReq, setSpinReq] = useState<SpinRequest | null>(null);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [winningKeys, setWinningKeys] = useState<BetKey[]>([]);
  const [banner, setBanner] = useState<{ result: number; won: number; bet: number } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [shakeStrong, setShakeStrong] = useState(false);
  const [floats, setFloats] = useState<Float[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  // real, shared leaderboard from the server (every player), not just this device's localStorage
  useEffect(() => {
    if (!sazcoinEnabled) return;
    if (phase !== "start" && phase !== "gameover") return; // these are the only screens showing it
    let cancelled = false;
    sazcoin
      .leaderboard()
      .then((r) => {
        if (!cancelled) setScores(r.scores);
      })
      .catch(() => {
        /* fall back silently to whatever local scores we already have */
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);
  const [rank, setRank] = useState(-1);
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(BET_WINDOW_MS);
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [bigWin, setBigWin] = useState<{ amount: number; mult: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [tonAddr, setTonAddr] = useState<string | null>(null);
  // restore a previously connected TON wallet (TON Connect persists sessions)
  useEffect(() => {
    if (!showWithdraw) return;
    const a = connectedAddress();
    if (a) setTonAddr(a);
  }, [showWithdraw]);
  const [giftAvailable, setGiftAvailable] = useState(() => !giftClaimed(playerId()));
  const [saved, setSaved] = useState(() => loadPlayer(playerId()));
  const [busy, setBusy] = useState(false);

  const lastBeepSec = useRef(-1);
  const curRound = useRef(-1);
  const curPhase = useRef<TablePhase | null>(null);
  /** Track which round we've already launched a spin for (prevents double-start). */
  const spunForRound = useRef<number>(-1);
  const fetchingResult = useRef<number>(-1);
  const timers = useRef<number[]>([]);
  /** Snapshot of bets/fund locked when the shared round leaves "betting" — used for settle so late network clears or re-renders can't wipe a win. */
  const lockedRound = useRef<{
    roundId: number;
    bets: Record<BetKey, number>;
    fund: Fund;
    totalBet: number;
  } | null>(null);
  const particles = useRef<ParticleAPI | null>(null);
  /**
   * Server wallet replies can arrive out of order (auth / round-open / round-close / withdraw
   * all race on a slow or overloaded connection). Without a guard, a *late* reply from an
   * earlier call can land after a newer one and silently stomp a win/loss the player already
   * saw applied — this was the "bet gets allowed but then isn't applied" bug. Every call that
   * will setWallet() from a server response takes a ticket first; a reply is only applied if
   * its ticket is still the newest one issued, or newer than the last one actually applied.
   */
  const walletTicket = useRef(0);
  const appliedWalletTicket = useRef(0);
  const nextWalletTicket = useCallback(() => ++walletTicket.current, []);
  const applyServerWallet = useCallback((ticket: number, w: Wallet) => {
    if (ticket < appliedWalletTicket.current) return; // a newer reply already landed
    appliedWalletTicket.current = ticket;
    setWallet(w);
  }, []);
  const balanceRef = useRef<HTMLDivElement>(null);
  const wheelWrapRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({
    spin: (_force?: boolean) => {},
    undo: () => {},
    clearBets: () => {},
    rebet: () => {},
    doubleBets: () => {},
    togglePause: () => {},
    enter: () => {},
  });

  const { w, h } = useWindowSize();
  const isWide = w >= 1024;
  const reserved = w < 640 ? 400 : 470;
  const wheelSize = isWide ? Math.min(460, h - 150) : Math.max(170, Math.min(w - 48, h - reserved, 360));

  useEffect(() => {
    initTelegram();
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const balance = wallet.bonus + wallet.cash;
  const totalBet = useMemo(() => Object.values(bets).reduce((a, b) => a + b, 0), [bets]);
  const EMPTY_HOT = useMemo<number[]>(() => [], []);
  const chip = CHIP_VALUES[chipIdx];

  const hotCold = useMemo(() => {
    const cnt = new Map<number, number>();
    history.forEach((n) => cnt.set(n, (cnt.get(n) || 0) + 1));
    const hot = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    const seen = new Set(history);
    const cold: number[] = [];
    for (let n = 0; n <= 36 && cold.length < 3; n++) if (!seen.has(n)) cold.push(n);
    return { hot, cold };
  }, [history]);
  const hotForTable = history.length >= 3 ? hotCold.hot : EMPTY_HOT;

  // ---------- persistence (per Telegram ID) ----------
  useEffect(() => {
    if (phase !== "betting" && phase !== "result" && phase !== "gameover") return;
    // refund outstanding stakes into the saved wallet so a reload never loses coins
    const stakedBonus = Object.values(fund).reduce((a, f) => a + f.bonus, 0);
    const stakedCash = Object.values(fund).reduce((a, f) => a + f.cash, 0);
    const p = {
      wallet: { bonus: wallet.bonus + stakedBonus, cash: wallet.cash + stakedCash },
      peak,
      biggestWin,
      spins,
      totalWithdrawn,
      history,
    };
    savePlayer(uid, p);
    setSaved(p);
  }, [wallet, fund, peak, biggestWin, spins, totalWithdrawn, history, phase, uid]);

  const showToast = useCallback(
    (t: string) => {
      setToast(t);
      later(() => setToast(null), 1500);
    },
    [later],
  );

  const addFloat = useCallback(
    (text: string, color: string) => {
      const id = Date.now() + Math.random();
      setFloats((f) => [...f, { id, text, color }]);
      later(() => setFloats((f) => f.filter((x) => x.id !== id)), 1300);
    },
    [later],
  );

  const clearRound = useCallback(() => {
    setBets({});
    setBetStack([]);
    setFund({});
    setLastResult(null);
    setWinningKeys([]);
    setBanner(null);
    setWinners(null);
    setBigWin(null);
    setPaused(false);
  }, []);

  // ---------- entering the table ----------
  const enterTable = useCallback(async () => {
    if (busy) return;
    unlockAudio();
    setBusy(true);
    curRound.current = -1;
    curPhase.current = null;
    spunForRound.current = -1;
    fetchingResult.current = -1;
    setSpinReq(null);
    try {
      if (sazcoinEnabled) {
        await syncWithServer().catch(() => showToast("هم‌گام‌سازی ساعت میز ناموفق بود"));
        const ticket = nextWalletTicket();
        const r = await sazcoin.auth(); // server decides gift eligibility by Telegram ID
        clearRound();
        applyServerWallet(ticket, r.wallet);
        setPeak(Math.max(r.stats?.peak ?? 0, r.wallet.bonus + r.wallet.cash));
        setBiggestWin(r.stats?.biggestWin ?? 0);
        setSpins(r.stats?.spins ?? 0);
        setTotalWithdrawn(r.stats?.totalWithdrawn ?? 0);
        setHistory([]);
        setGiftAvailable(false);
        markGiftClaimed(uid);
        sfx.start();
        haptic.success();
        // enter with the real current table phase so we don't briefly show a fake betting window
        const bal = r.wallet.bonus + r.wallet.cash;
        if (bal <= 0) {
          setPhase("gameover");
        } else {
          const st = computeState(serverNow(), resultFor);
          curRound.current = st.roundId;
          curPhase.current = st.phase;
          setPhase(st.phase === "result" ? "result" : st.phase === "spinning" ? "spinning" : "betting");
          if (st.phase === "result" && st.result !== null) setLastResult(st.result);
        }
        if (r.giftGranted) {
          later(() => {
            const rc = balanceRef.current?.getBoundingClientRect();
            particles.current?.burst(rc ? rc.left + rc.width / 2 : w / 2, rc ? rc.bottom : 60, 40, "coins");
            addFloat(`+${fa(GIFT_COINS)} 🎁`, "#ffe680");
          }, 150);
        }
        return;
      }

      // ---- local / demo mode ----
      const p = loadPlayer(uid);
      clearRound();
      if (p) {
        setWallet(p.wallet);
        setPeak(p.peak);
        setBiggestWin(p.biggestWin);
        setSpins(p.spins);
        setTotalWithdrawn(p.totalWithdrawn || 0);
        setHistory(p.history || []);
        sfx.start();
        if (p.wallet.bonus + p.wallet.cash <= 0) {
          setPhase("gameover");
        } else {
          const st = computeState(serverNow(), resultFor);
          curRound.current = st.roundId;
          curPhase.current = st.phase;
          setPhase(st.phase === "result" ? "result" : st.phase === "spinning" ? "spinning" : "betting");
          if (st.phase === "result" && st.result !== null) setLastResult(st.result);
        }
        return;
      }
      if (!giftClaimed(uid)) {
        markGiftClaimed(uid);
        setGiftAvailable(false);
        setWallet({ bonus: GIFT_COINS, cash: 0 });
        setPeak(GIFT_COINS);
        setBiggestWin(0);
        setSpins(0);
        setTotalWithdrawn(0);
        setHistory([]);
        sfx.start();
        haptic.success();
        const st = computeState(serverNow(), resultFor);
        curRound.current = st.roundId;
        curPhase.current = st.phase;
        setPhase(st.phase === "result" ? "result" : st.phase === "spinning" ? "spinning" : "betting");
        later(() => {
          const rc = balanceRef.current?.getBoundingClientRect();
          particles.current?.burst(rc ? rc.left + rc.width / 2 : w / 2, rc ? rc.bottom : 60, 40, "coins");
          addFloat(`+${fa(GIFT_COINS)} 🎁`, "#ffe680");
        }, 150);
        return;
      }
      // gift already used and nothing saved → no coins
      setWallet({ bonus: 0, cash: 0 });
      setPhase("gameover");
    } catch (e) {
      showToast(`خطا در اتصال به سازکوین: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [busy, clearRound, uid, later, addFloat, w, showToast, nextWalletTicket, applyServerWallet]);

  // ---------- betting ----------
  const takeStake = useCallback(
    (amount: number): { bonus: number; cash: number } | null => {
      if (amount <= 0 || amount > balance) return null;
      const b = Math.min(wallet.bonus, amount);
      const c = amount - b;
      setWallet({ bonus: wallet.bonus - b, cash: wallet.cash - c });
      return { bonus: b, cash: c };
    },
    [balance, wallet],
  );

  const placeBet = useCallback(
    (key: BetKey) => {
      if (phase !== "betting" || paused) return;
      // close client-side 1.2s before server window so openRound never arrives late
      if (timeLeft < 1200) {
        showToast("زمان شرط‌بندی تمام شد");
        return;
      }
      const amt = Math.min(chip, balance);
      const part = takeStake(amt);
      if (!part) {
        sfx.lose();
        haptic.error();
        showToast(balance === 0 ? "سکه‌ای نداری — شارژ کن" : "سکه کافی نداری!");
        return;
      }
      sfx.chip();
      haptic.light();
      setBets((b) => ({ ...b, [key]: (b[key] || 0) + amt }));
      setFund((f) => ({ ...f, [key]: { bonus: (f[key]?.bonus || 0) + part.bonus, cash: (f[key]?.cash || 0) + part.cash } }));
      setBetStack((s) => [...s, { key, ...part }]);
      setWinningKeys([]);
    },
    [phase, paused, chip, balance, takeStake, showToast, timeLeft],
  );
  const placeBetRef = useRef(placeBet);
  placeBetRef.current = placeBet;
  const stablePlaceBet = useCallback((key: BetKey) => placeBetRef.current(key), []);

  const undo = useCallback(() => {
    if (phase !== "betting" || paused || betStack.length === 0) return;
    const last = betStack[betStack.length - 1];
    sfx.undo();
    haptic.light();
    setBetStack((s) => s.slice(0, -1));
    setBets((b) => {
      const n = { ...b };
      n[last.key] -= last.bonus + last.cash;
      if (n[last.key] <= 0) delete n[last.key];
      return n;
    });
    setFund((f) => {
      const n = { ...f };
      const cur = n[last.key];
      if (cur) {
        const nb = cur.bonus - last.bonus;
        const nc = cur.cash - last.cash;
        if (nb + nc <= 0) delete n[last.key];
        else n[last.key] = { bonus: nb, cash: nc };
      }
      return n;
    });
    setWallet((wl) => ({ bonus: wl.bonus + last.bonus, cash: wl.cash + last.cash }));
  }, [phase, paused, betStack]);

  const clearBets = useCallback(() => {
    if (phase !== "betting" || paused || totalBet === 0) return;
    sfx.undo();
    haptic.light();
    const rb = Object.values(fund).reduce((a, f) => a + f.bonus, 0);
    const rc = Object.values(fund).reduce((a, f) => a + f.cash, 0);
    setWallet((wl) => ({ bonus: wl.bonus + rb, cash: wl.cash + rc }));
    setBets({});
    setFund({});
    setBetStack([]);
  }, [phase, paused, totalBet, fund]);

  const rebet = useCallback(() => {
    if (phase !== "betting" || paused || totalBet > 0) return;
    const need = Object.values(lastBets).reduce((a, b) => a + b, 0);
    if (need === 0) return showToast("شرط قبلی وجود نداره");
    if (need > balance) return showToast("سکه کافی نداری!");
    sfx.chip();
    haptic.light();
    // fund each bet in order: bonus first
    let bonusLeft = wallet.bonus;
    const nf: Fund = {};
    const stack: StackItem[] = [];
    for (const [key, amt] of Object.entries(lastBets)) {
      const b = Math.min(bonusLeft, amt);
      bonusLeft -= b;
      nf[key] = { bonus: b, cash: amt - b };
      stack.push({ key, bonus: b, cash: amt - b });
    }
    setWallet({ bonus: bonusLeft, cash: wallet.cash - (need - (wallet.bonus - bonusLeft)) });
    setBets({ ...lastBets });
    setFund(nf);
    setBetStack(stack);
  }, [phase, paused, totalBet, lastBets, balance, wallet, showToast]);

  const doubleBets = useCallback(() => {
    if (phase !== "betting" || paused || totalBet === 0) return;
    if (totalBet > balance) return showToast("سکه کافی نداری!");
    sfx.chip();
    haptic.light();
    let bonusLeft = wallet.bonus;
    const nf: Fund = { ...fund };
    const add: StackItem[] = [];
    for (const [key, amt] of Object.entries(bets)) {
      const b = Math.min(bonusLeft, amt);
      bonusLeft -= b;
      nf[key] = { bonus: (nf[key]?.bonus || 0) + b, cash: (nf[key]?.cash || 0) + (amt - b) };
      add.push({ key, bonus: b, cash: amt - b });
    }
    setWallet({ bonus: bonusLeft, cash: wallet.cash - (totalBet - (wallet.bonus - bonusLeft)) });
    setBets((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v * 2])));
    setFund(nf);
    setBetStack((s) => [...s, ...add]);
  }, [phase, paused, totalBet, balance, wallet, fund, bets, showToast]);

  // ---------- shared table driver ----------
  // One global round clock for everyone (server clock when connected, wall clock in demo).
  // Betting closes → bets are locked to the round → wheel spins with the round's single result.
  const spin = useCallback(
    (_force = false) => {
      /* kept for keyboard handler compatibility; the table now spins itself */
    },
    [],
  );

  const lockBets = useCallback(
    (roundId: number) => {
      // called exactly once when the shared round leaves "betting"
      unlockAudio();
      sfx.betsClosed();
      later(() => sfx.launch(), 250);
      haptic.heavy();
      setWinningKeys([]);
      setBanner(null);
      setWinners(null);
      // Freeze bets/fund for this round so settle is correct even if UI state is cleared later
      const snapBets = { ...bets };
      const snapFund: Fund = {};
      for (const [k, v] of Object.entries(fund)) snapFund[k as BetKey] = { ...v };
      const snapTotal = Object.values(snapBets).reduce((a, b) => a + b, 0);
      lockedRound.current = { roundId, bets: snapBets, fund: snapFund, totalBet: snapTotal };
      if (snapTotal > 0) {
        setLastBets(snapBets);
        if (sazcoinEnabled) {
          const ticket = nextWalletTicket();
          sazcoin
            .openRound(String(roundId), snapBets)
            .then((r) => applyServerWallet(ticket, r.wallet))
            .catch((e: Error) => {
              showToast(`ثبت شرط ناموفق: ${e.message}`);
              const rb = Object.values(snapFund).reduce((a, f) => a + f.bonus, 0);
              const rc = Object.values(snapFund).reduce((a, f) => a + f.cash, 0);
              setWallet((wl) => ({ bonus: wl.bonus + rb, cash: wl.cash + rc }));
              setBets({});
              setFund({});
              setBetStack([]);
              // Mark as no stake so we don't pay out on a rejected open
              if (lockedRound.current?.roundId === roundId) {
                lockedRound.current = { roundId, bets: {}, fund: {}, totalBet: 0 };
              }
            });
        }
      }
    },
    [bets, fund, later, showToast, nextWalletTicket, applyServerWallet],
  );
  const lockBetsRef = useRef(lockBets);
  lockBetsRef.current = lockBets;

  const tableActive = phase === "betting" || phase === "spinning" || phase === "result";

  useEffect(() => {
    if (!tableActive) return;
    const startSpin = (roundId: number, result: number, phaseEndsAt: number) => {
      if (spunForRound.current === roundId) return;
      spunForRound.current = roundId;
      const spinStart = performance.now() - (Date.now() - (phaseEndsAt - SPIN_MS));
      setSpinReq({ id: roundId, result, startAt: spinStart });
      setPhase("spinning");
    };

    const tick = () => {
      const st = computeState(serverNow(), resultFor);
      const roundChanged = st.roundId !== curRound.current;
      const phaseChanged = st.phase !== curPhase.current;

      if (roundChanged) {
        curRound.current = st.roundId;
        lastBeepSec.current = -1;
        setBanner(null);
        setWinningKeys([]);
        // Drop any leftover lock from a previous round so settle can't mix rounds
        if (lockedRound.current && lockedRound.current.roundId !== st.roundId) {
          lockedRound.current = null;
        }
        if (st.phase === "betting") {
          setPhase("betting");
          spunForRound.current = -1;
        }
      }

      if (st.phase === "betting") {
        const left = Math.max(0, st.phaseEndsAt - Date.now());
        setTimeLeft(Math.ceil(left / 200) * 200);
        const sec = Math.ceil(left / 1000);
        if (sec <= 5 && sec >= 1 && sec !== lastBeepSec.current) {
          lastBeepSec.current = sec;
          sfx.countdown(sec <= 3);
          if (sec <= 3) haptic.light();
        }
        if (phaseChanged) setPhase("betting");
      } else if (st.phase === "spinning") {
        // betting just closed (or we joined mid-spin)
        if (phaseChanged && curPhase.current === "betting") {
          lockBetsRef.current(st.roundId);
        }
        setTimeLeft(0);

        const result = st.result;
        if (result !== null) {
          startSpin(st.roundId, result, st.phaseEndsAt);
        } else if (sazcoinEnabled && fetchingResult.current !== st.roundId) {
          // server result may not be in local cache yet — keep polling until we have it
          fetchingResult.current = st.roundId;
          sazcoin
            .roundResult(st.roundId)
            .then((r) => {
              if (r.result !== null) {
                rememberResult(st.roundId, r.result);
                // re-read phaseEndsAt from current clock so late arrivals stay in sync
                const nowSt = computeState(serverNow(), resultFor);
                startSpin(st.roundId, r.result, nowSt.phaseEndsAt);
              } else {
                // still null — allow another fetch on next tick
                fetchingResult.current = -1;
              }
            })
            .catch(() => {
              fetchingResult.current = -1;
              showToast("ارتباط با میز قطع شد — در حال تلاش مجدد…");
            });
        }
      } else if (st.phase === "result") {
        // joined mid-result or spin finished: ensure phase is result and we have lastResult
        if (phaseChanged) {
          setTimeLeft(0);
          if (st.result !== null && spunForRound.current !== st.roundId) {
            // missed the whole spin (joined very late) — jump to result without animation
            spunForRound.current = st.roundId;
            setLastResult(st.result);
            setPhase("result");
          }
        }
      }
      curPhase.current = st.phase;
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [tableActive, showToast]);

  // ---------- landing ----------
  const onLanded = useCallback(
    (result: number, id: number) => {
      // Prefer the snapshot taken at lock time so a delayed openRound failure / clear
      // cannot erase a legitimate win (was the main cause of "no points when 26 hits").
      const locked = lockedRound.current?.roundId === id ? lockedRound.current : null;
      const useBets = locked?.bets ?? bets;
      const useFund = locked?.fund ?? fund;
      const res = settle(useBets, result);
      // stake returns to its source (bonus stays bonus); profit → cash (withdrawable)
      let backBonus = 0;
      let backCash = 0;
      let profit = 0;
      for (const key of res.winningKeys) {
        const f = useFund[key] || { bonus: 0, cash: 0 };
        backBonus += f.bonus;
        backCash += f.cash;
        profit += (useBets[key] || 0) * payoutMultiplier(parseKey(key).kind);
      }
      const newWallet: Wallet = { bonus: wallet.bonus + backBonus, cash: wallet.cash + backCash + profit };
      const newBalance = newWallet.bonus + newWallet.cash;
      const newPeak = Math.max(peak, newBalance);
      const newBiggest = Math.max(biggestWin, res.totalReturn);

      setLastResult(result);
      setWinningKeys(res.winningKeys);
      setHistory((hst) => [result, ...hst].slice(0, 12));
      setSpins((s) => s + 1);
      setWallet(newWallet);
      setPeak(newPeak);
      setBiggestWin(newBiggest);
      setBanner({ result, won: res.totalReturn, bet: res.totalBet });
      setPhase("result");
      if (sazcoinEnabled && res.totalBet > 0) {
        const ticket = nextWalletTicket();
        // one retry with a short delay: if round/open is still in flight (slow network/server)
        // the very first round/close can 404 because the server hasn't registered the bet yet.
        const tryClose = (attempt = 0): void => {
          sazcoin
            .closeRound(String(id))
            .then((r) => applyServerWallet(ticket, r.wallet))
            .catch((e: Error) => {
              if (attempt < 2) later(() => tryClose(attempt + 1), 700);
              else showToast(`هم‌گام‌سازی نتیجه ناموفق بود: ${e.message}`);
            });
        };
        tryClose();
      }

      const all: Winner[] = [];
      if (res.totalReturn > 0) all.push({ name, avatar: "⭐", amount: res.totalReturn, isYou: true });
      setWinners(all);
      setShaking(true);
      later(() => setShaking(false), 700);

      const wr = wheelWrapRef.current?.getBoundingClientRect();
      const cx = wr ? wr.left + wr.width / 2 : w / 2;
      const cy = wr ? wr.top + wr.height / 2 : h / 3;

      if (res.totalReturn > 0) {
        setStreak((st) => {
          const n = st + 1;
          setBestStreak((b) => Math.max(b, n));
          return n;
        });
        const big = res.totalReturn >= 100 || res.totalReturn >= res.totalBet * 5;
        setFlash(true);
        later(() => setFlash(false), 500);
        if (big) {
          setBigWin({ amount: res.totalReturn, mult: Math.round(res.totalReturn / Math.max(1, res.totalBet)) });
          later(() => setBigWin(null), 2600);
        }
        setShakeStrong(big);
        sfx.win(big);
        haptic.success();
        particles.current?.burst(cx, cy, big ? 90 : 45, "coins");
        particles.current?.burst(cx, cy, big ? 80 : 30, "confetti");
        particles.current?.burst(cx, cy, 40, "sparks");
        addFloat(`+${fa(res.totalReturn)}`, "#4ade80");
        for (let i = 0; i < 6; i++) later(() => sfx.coin(i), 200 + i * 70);
      } else {
        if (res.totalBet > 0) setStreak(0);
        setShakeStrong(false);
        if (res.totalBet > 0) {
          sfx.lose();
          haptic.error();
          particles.current?.burst(cx, cy, 25, "sparks");
          addFloat(`-${fa(res.totalBet)}`, "#f87171");
        }
      }

      // clear the table shortly before the shared clock opens the next round
      // Guard with round id so a lagging clear never wipes the *next* round's bets
      const clearForRound = id;
      later(() => {
        if (lockedRound.current?.roundId === clearForRound) lockedRound.current = null;
        setBets({});
        setBetStack([]);
        setFund({});
        setBanner(null);
        if (newBalance <= 0) {
          sfx.gameOver();
          const entry: ScoreEntry = { name, peak: newPeak, biggestWin: newBiggest, spins: spins + 1, date: Date.now() };
          if (sazcoinEnabled) {
            // the server already tracks peak/biggestWin per player; the shared-leaderboard
            // effect (keyed on phase) refetches it the moment we flip to "gameover" below.
            // rank here is a same-tick best-effort estimate against whatever board we last loaded.
            setRank(scores.filter((s) => s.peak > newPeak).length);
          } else {
            const list = saveScore(entry);
            setScores(list);
            setRank(list.findIndex((e) => e.date === entry.date));
          }
          setPhase("gameover");
        }
        // otherwise the table driver flips us to "betting" exactly when the global round starts
      }, RESULT_MS - 400);
      later(() => setWinners(null), 5600);
    },
    [bets, fund, wallet, peak, biggestWin, spins, name, w, h, later, addFloat, showToast, nextWalletTicket, applyServerWallet, scores],
  );

  // ---------- withdraw ----------
  const withdraw = useCallback(
    async (amount: number, address: string) => {
      if (amount < MIN_WITHDRAW || amount > wallet.cash) return showToast("مبلغ نامعتبر");
      setBusy(true);
      try {
        if (sazcoinEnabled) {
          const ticket = nextWalletTicket();
          const r = await sazcoin.withdraw(amount, address);
          applyServerWallet(ticket, r.wallet);
          showToast(`✅ برداشت ثبت شد — کد پیگیری ${r.txId}`);
        } else {
          setWallet((wl) => ({ ...wl, cash: wl.cash - amount }));
          showToast("✅ درخواست برداشت ثبت شد (حالت دمو)");
        }
        setTotalWithdrawn((t) => t + amount);
        haptic.success();
        sfx.win(false);
        setShowWithdraw(false);
        if (balance - amount <= 0 && phase === "betting" && totalBet === 0) setPhase("gameover");
      } catch (e) {
        showToast(`برداشت ناموفق: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [wallet.cash, balance, phase, totalBet, showToast, nextWalletTicket, applyServerWallet],
  );

  const quitToMenu = useCallback(() => {
    if (spins > 0 && !sazcoinEnabled) setScores(saveScore({ name, peak, biggestWin, spins, date: Date.now() }));
    // refund outstanding stakes
    const rb = Object.values(fund).reduce((a, f) => a + f.bonus, 0);
    const rc = Object.values(fund).reduce((a, f) => a + f.cash, 0);
    setWallet((wl) => ({ bonus: wl.bonus + rb, cash: wl.cash + rc }));
    clearRound();
    setPhase("start");
  }, [spins, name, peak, biggestWin, fund, clearRound]);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  }, []);

  const togglePause = useCallback(() => {
    if (phase === "betting" || phase === "spinning" || phase === "result") {
      sfx.click();
      setPaused((p) => !p);
    }
  }, [phase]);

  const enter = useCallback(() => {
    if (phase === "start") void enterTable();
  }, [phase, enterTable]);

  handlers.current = { spin, undo, clearBets, rebet, doubleBets, togglePause, enter };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hnd = handlers.current;
      if (e.repeat) return;
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      switch (e.code) {
        case "Space":
        case "Enter":
          e.preventDefault();
          if (phase === "start") hnd.enter();
          else if (paused) setPaused(false);
          break;
        case "ArrowRight":
        case "ArrowUp":
          setChipIdx((i) => Math.min(CHIP_VALUES.length - 1, i + 1));
          sfx.click();
          break;
        case "ArrowLeft":
        case "ArrowDown":
          setChipIdx((i) => Math.max(0, i - 1));
          sfx.click();
          break;
        case "KeyR":
          hnd.rebet();
          break;
        case "KeyU":
        case "Backspace":
          hnd.undo();
          break;
        case "KeyC":
          hnd.clearBets();
          break;
        case "KeyD":
        case "KeyX":
          hnd.doubleBets();
          break;
        case "KeyP":
        case "Escape":
          if (showHelp) setShowHelp(false);
          else if (showWithdraw) setShowWithdraw(false);
          else hnd.togglePause();
          break;
        case "KeyM":
          toggleMute();
          break;
        case "KeyH":
        case "F1":
          e.preventDefault();
          setShowHelp((v) => !v);
          break;
        default:
          if (/^Digit[1-6]$/.test(e.code)) setChipIdx(Number(e.code[5]) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, paused, toggleMute, showHelp, showWithdraw]);

  // auto pause when tab hidden
  useEffect(() => {
    const f = () => {
      if (document.hidden && (phase === "betting" || phase === "spinning")) setPaused(true);
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [phase]);

  const canBet = phase === "betting" && !paused && timeLeft >= 1200;
  const inGame = phase !== "start";
  const resultColor = (n: number) =>
    colorOf(n) === "red" ? "bg-[#c8102e]" : colorOf(n) === "black" ? "bg-[#161616]" : "bg-[#0f8a3c]";

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,#14503a_0%,#0a2a1d_45%,#050f0b_100%)]">
      <Particles apiRef={particles} />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[140%] -translate-x-1/2 rounded-full bg-[#f5c542]/10 blur-3xl" />

      <div className={`flex h-full flex-col ${shaking ? "shake" : ""}`} style={shakeStrong ? { animationDuration: ".6s" } : undefined}>
        {/* header */}
        <header className="relative z-20 flex items-center justify-between gap-2 px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={togglePause}
              disabled={!inGame || phase === "gameover"}
              className="btn-dark flex h-10 w-10 items-center justify-center rounded-xl text-lg text-[#ffe680] disabled:opacity-40"
              aria-label="pause"
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button onClick={toggleMute} className="btn-dark flex h-10 w-10 items-center justify-center rounded-xl text-lg text-[#ffe680]" aria-label="mute">
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={() => {
                sfx.click();
                setShowHelp(true);
              }}
              className="btn-dark flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-[#ffe680]"
              aria-label="help"
            >
              ؟
            </button>
          </div>

          <div ref={balanceRef} className="relative flex flex-col items-center">
            <button
              onClick={() => {
                if (!inGame) return;
                sfx.click();
                setShowWithdraw(true);
              }}
              className="flex items-stretch overflow-hidden rounded-2xl border border-[#f5c542]/60 bg-gradient-to-b from-[#12321f] to-[#04100b] text-start shadow-[0_0_24px_rgba(245,197,66,.25),inset_0_1px_0_rgba(255,255,255,.12)]"
            >
              <div className="flex flex-col items-center px-3 py-1">
                <span className="text-[9px] leading-none text-white/50">موجودی</span>
                <span className="font-num text-xl font-black leading-tight text-[#ffe680]">🪙 {fa(balance)}</span>
                <span className="font-num text-[9px] leading-none text-white/45">
                  <span className="text-emerald-300">💵 {fa(wallet.cash)}</span> · 🎁 {fa(wallet.bonus)}
                </span>
              </div>
              <div className="w-px bg-[#f5c542]/30" />
              <div className={`flex flex-col items-center justify-center px-3 py-1 transition-colors ${totalBet > 0 ? "bg-[#f5c542]/10" : ""}`}>
                <span className="text-[9px] leading-none text-white/50">{phase === "spinning" || phase === "result" ? "شرط بسته‌شده" : "شرط این دور"}</span>
                <span className={`font-num text-xl font-black leading-tight ${totalBet > 0 ? "text-emerald-300" : "text-white/40"}`}>🎯 {fa(totalBet)}</span>
              </div>
            </button>
            {floats.map((f) => (
              <span
                key={f.id}
                className="float-up font-num pointer-events-none absolute left-1/2 top-0 text-2xl font-black drop-shadow-[0_2px_6px_rgba(0,0,0,.8)]"
                style={{ color: f.color }}
              >
                {f.text}
              </span>
            ))}
          </div>

          <div className="flex min-w-[84px] flex-col items-end text-[11px] leading-tight text-white/60">
            <span className="text-[9px] text-white/40">{sazcoinEnabled ? "🔗 سازکوین" : "🎮 حالت دمو"}</span>
            <span className="flex items-center gap-1 font-bold text-white/90">
              {streak >= 2 && (
                <span className="pop-in rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-1.5 text-[10px] font-black text-white shadow">
                  🔥 {fa(streak)} برد پیاپی
                </span>
              )}
              {name}
            </span>
            <span className="font-num text-[9px] text-white/40" dir="ltr">
              {isTelegram() ? uid.replace("tg:", "ID ") : "guest"}
            </span>
          </div>
        </header>

        {/* history strip */}
        <div dir="ltr" className="relative z-10 flex h-7 items-center justify-center gap-1 px-3">
          {history.length === 0 ? (
            <span className="text-[11px] text-white/40">اولین دور سازینو — بخت با توست ✨</span>
          ) : (
            history.map((n, i) => (
              <span
                key={i}
                className={`font-num flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ring-1 ring-white/30 ${resultColor(n)} ${
                  i === 0 ? "pop-in scale-110 ring-[#ffe680]" : "opacity-80"
                }`}
              >
                {n}
              </span>
            ))
          )}
          {history.length >= 3 && (
            <span className="ms-2 hidden items-center gap-1 text-[10px] text-white/50 sm:flex">
              <span>🔥</span>
              {hotCold.hot.map((n) => (
                <span key={n} className="font-num text-orange-300">
                  {n}
                </span>
              ))}
              <span className="ms-1">❄️</span>
              {hotCold.cold.map((n) => (
                <span key={n} className="font-num text-sky-300">
                  {n}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* main */}
        <main className="scroll-thin relative z-10 flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 pb-2 lg:flex-row lg:items-center lg:justify-center lg:gap-8 lg:overflow-visible lg:px-8">
          <div ref={wheelWrapRef} className="relative z-10 flex shrink-0 items-center justify-center py-1">
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                width: wheelSize * 1.15,
                height: wheelSize * 1.15,
                background: `radial-gradient(circle, rgba(245,197,66,${phase === "spinning" ? 0.35 : 0.15}) 0%, rgba(245,197,66,0) 70%)`,
                transition: "background .6s",
                animation: phase === "spinning" ? "pulseGlowSoft 1s ease-in-out infinite" : undefined,
              }}
            />
            <Wheel
              size={wheelSize}
              spin={spinReq}
              paused={false /* shared table never stops; pause is just a menu */}
              zoom={phase === "spinning" || phase === "result"}
              onTick={sfx.tick}
              onDrop={sfx.drop}
              onLanded={onLanded}
            />
            {banner && (
              <div className="pop-in pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className={`flex h-[34%] w-[34%] flex-col items-center justify-center rounded-full ${resultColor(banner.result)} shadow-[0_0_40px_rgba(0,0,0,.7),0_0_0_4px_#ffe680]`}>
                  <span className="font-num text-[min(9vw,44px)] font-black leading-none text-white drop-shadow">{banner.result}</span>
                </div>
                <div
                  className={`font-num mt-2 rounded-xl px-4 py-1 text-xl font-black shadow-lg ${
                    banner.won > 0 ? "bg-emerald-400 text-emerald-950" : banner.bet === 0 ? "bg-white/90 text-black" : "bg-red-500 text-white"
                  }`}
                >
                  {banner.won > 0 ? `بردی! +${fa(banner.won)} 🪙` : banner.bet === 0 ? "این دور تماشا کردی" : "این دور نشد"}
                </div>
              </div>
            )}
            {phase === "betting" && !paused && totalBet === 0 && timeLeft < 8000 && balance > 0 && (
              <div
                className="pointer-events-none absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#f5c542] px-3 py-0.5 text-[11px] font-black text-[#2a1d00] shadow"
                style={{ animation: "popIn .3s both" }}
              >
                ⏳ هنوز شرط نبستی — {fa(Math.ceil(timeLeft / 1000))} ثانیه مونده
              </div>
            )}
            {phase === "spinning" && !paused && (
              <div className="pointer-events-none absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-0.5 text-[11px] font-bold text-[#ffe680] ring-1 ring-[#f5c542]/50">
                🚫 شرط‌ها بسته شد — گوی در حرکت…
              </div>
            )}
            {winners && (
              <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-0.5 flex h-7 w-[min(94vw,360px)] -translate-x-1/2 items-center justify-center">
                <span
                  className="font-num absolute whitespace-nowrap rounded-full bg-gradient-to-r from-[#b8860b] via-[#f5c542] to-[#b8860b] px-3 py-0.5 text-xs font-black text-[#2a1d00] shadow-lg"
                  style={{ animation: "subtitle 1.4s both" }}
                >
                  {winners.length === 0
                    ? "این دور کسی نبرد 🎰"
                    : `💰 مجموع برد این دور: ${fa(winners.reduce((a, b) => a + b.amount, 0))} · ${fa(winners.length)} برنده`}
                </span>
                {winners.slice(0, 5).map((wn, i) => (
                  <span
                    key={wn.name + i}
                    className={`font-num absolute whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow ${
                      wn.isYou ? "bg-[#f5c542] text-[#2a1d00]" : "bg-black/80 text-emerald-300 ring-1 ring-white/10"
                    }`}
                    style={{ animation: `subtitle 0.9s ${1.4 + i * 0.75}s both`, opacity: 0 }}
                  >
                    {i + 1}. {wn.avatar} {wn.isYou ? "تو" : wn.name} +{fa(wn.amount)} 🪙
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto flex w-full max-w-2xl shrink-0 flex-col gap-2 lg:mt-0 lg:flex-none lg:justify-center">
            {/* live table status */}
            <div className="flex items-center gap-2 rounded-xl border border-[#f5c542]/30 bg-[#04100b]/60 px-2 py-1">
              <div className={`relative h-9 w-9 shrink-0 ${timeLeft < 5000 && phase === "betting" ? "urgent-pulse" : ""}`}>
                <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke={timeLeft < 5000 && phase === "betting" ? "#f87171" : "#f5c542"}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(phase === "betting" ? timeLeft / BET_WINDOW_MS : 0) * 94.2} 94.2`}
                    style={{ transition: "stroke-dasharray .1s linear" }}
                  />
                </svg>
                <span className={`font-num absolute inset-0 flex items-center justify-center text-xs font-black ${timeLeft < 5000 && phase === "betting" ? "text-red-300" : "text-[#ffe680]"}`}>
                  {phase === "betting" ? fa(Math.ceil(timeLeft / 1000)) : phase === "spinning" ? "🌀" : "🎯"}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-[11px] leading-tight">
                <div className="font-bold text-white/90">
                  {phase === "betting" ? (timeLeft < 5000 ? "⚠️ شرط‌ها داره بسته می‌شه!" : "🟢 میز زندهٔ مشترک — شرط ببند") : phase === "spinning" ? "🔴 چرخ در حال چرخش…" : "نتیجهٔ دور"}
                  <span className="font-num ms-1 text-[9px] text-white/35">#{fa(curRound.current % 100000)}</span>
                </div>
                <div className="truncate text-white/55" dir="rtl">
                  {phase === "betting"
                    ? totalBet > 0
                      ? `شرط تو: ${fa(totalBet)} سازکوین`
                      : "چیپ را انتخاب کن و روی میز بزن"
                    : phase === "spinning"
                      ? "منتظر نتیجه باش…"
                      : lastResult !== null
                        ? `عدد ${fa(lastResult)}`
                        : ""}
                </div>
              </div>
            </div>

            <BettingTable bets={bets} winningKeys={winningKeys} lastResult={lastResult} hot={hotForTable} disabled={!canBet} onBet={stablePlaceBet} />

            <div className="flex flex-col gap-2 rounded-2xl border border-[#f5c542]/30 bg-[#04100b]/60 p-2 backdrop-blur-sm">
              <div dir="ltr" className="flex items-end justify-center gap-2 pt-1">
                {CHIP_VALUES.map((v, i) => (
                  <button
                    key={v}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setChipIdx(i);
                      sfx.click();
                      haptic.light();
                    }}
                    className="rounded-full"
                  >
                    <Chip value={v} size={w < 380 ? 36 : 42} selected={i === chipIdx} animate={false} />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={undo} disabled={!canBet || betStack.length === 0} className="btn-dark flex-1 rounded-xl py-2.5 text-xs font-bold text-[#ffe680] disabled:opacity-40">
                  ↩ برگشت
                </button>
                <button onClick={clearBets} disabled={!canBet || totalBet === 0} className="btn-dark flex-1 rounded-xl py-2.5 text-xs font-bold text-[#ffe680] disabled:opacity-40">
                  ✕ پاک
                </button>
                <button onClick={doubleBets} disabled={!canBet || totalBet === 0 || totalBet > balance} className="btn-dark flex-1 rounded-xl py-2.5 text-xs font-bold text-[#ffe680] disabled:opacity-40">
                  ×۲ دوبرابر
                </button>
                <button
                  onClick={rebet}
                  disabled={!canBet || Object.keys(lastBets).length === 0 || totalBet > 0}
                  className="btn-dark flex-1 rounded-xl py-2.5 text-xs font-bold text-[#ffe680] disabled:opacity-40"
                >
                  ↻ تکرار
                </button>
                <button
                  onClick={() => {
                    sfx.click();
                    setShowWithdraw(true);
                  }}
                  disabled={!inGame}
                  className="btn-gold flex-1 rounded-xl py-2.5 text-xs font-black disabled:opacity-40"
                >
                  💵 برداشت
                </button>
              </div>
              {totalBet > 0 && (
                <div className="flex flex-wrap justify-center gap-1 text-[10px] text-white/60">
                  {Object.entries(bets)
                    .slice(0, 6)
                    .map(([k, v]) => {
                      const p = parseKey(k);
                      return (
                        <span key={k} className="rounded-md bg-white/5 px-1.5 py-0.5">
                          {p.kind === "straight" ? `عدد ${fa(p.number!)}` : BET_LABELS[p.kind]}: <span className="font-num text-[#ffe680]">{fa(v)}</span>
                        </span>
                      );
                    })}
                  {Object.keys(bets).length > 6 && <span>+{fa(Object.keys(bets).length - 6)}</span>}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {flash && <div className="pointer-events-none absolute inset-0 z-30 bg-[#ffe680]/25" style={{ animation: "fadeOut .5s both" }} />}
      {bigWin && (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
          <div className="pop-in flex flex-col items-center rounded-3xl border-2 border-[#ffe680] bg-[#04100b]/85 px-8 py-5 shadow-[0_0_80px_rgba(245,197,66,.6)]">
            <span className="text-5xl">🎉</span>
            <span className="gold-text text-4xl font-black">برد بزرگ!</span>
            <span className="font-num mt-1 text-3xl font-black text-emerald-300">+{fa(bigWin.amount)} 🪙</span>
            <span className="text-xs text-[#ffe680]/80">×{fa(bigWin.mult)} شرطت</span>
          </div>
        </div>
      )}
      {toast && (
        <div className="pop-in pointer-events-none absolute left-1/2 top-1/3 z-[70] -translate-x-1/2 rounded-xl bg-black/85 px-4 py-2 text-center text-sm font-bold text-[#ffe680] ring-1 ring-[#f5c542]/50">
          {toast}
        </div>
      )}

      {showHelp && <HelpScreen onClose={() => setShowHelp(false)} />}
      {showWithdraw && (
        <WithdrawScreen
          cash={wallet.cash}
          bonus={wallet.bonus}
          min={MIN_WITHDRAW}
          busy={busy}
          totalWithdrawn={totalWithdrawn}
          tonAddress={tonAddr}
          network={TON_NETWORK}
          treasury={SAZ_TREASURY}
          uid={uid}
          onConnect={() => {
            sfx.click();
            void connectWallet().then((a) => {
              if (!a) return;
              setTonAddr(a);
              haptic.success();
              showToast("✅ کیف پول وصل شد");
              if (sazcoinEnabled) sazcoin.profile({ tonAddress: a }).catch(() => {});
            });
          }}
          onDisconnect={() => {
            void disconnectWallet();
            setTonAddr(null);
          }}
          onWithdraw={withdraw}
          onDeposit={() => openTelegramLink(depositLink(uid))}
          onCheckDeposit={() => {
            if (!sazcoinEnabled) return showToast("در حالت دمو واریز واقعی نداریم");
            setBusy(true);
            const ticket = nextWalletTicket();
            sazcoin
              .checkDeposit()
              .then((r) => {
                applyServerWallet(ticket, r.wallet);
                if (r.credited > 0) {
                  haptic.success();
                  sfx.win(true);
                  addFloat(`+${fa(r.credited)} SAZ`, "#4ade80");
                  showToast(`✅ ${fa(r.credited)} SAZ به حسابت اضافه شد`);
                } else showToast("هنوز واریزی پیدا نشد — چند ثانیه بعد دوباره بزن");
              })
              .catch((e: Error) => showToast(`خطا: ${e.message}`))
              .finally(() => setBusy(false));
          }}
          onClose={() => setShowWithdraw(false)}
        />
      )}
      {phase === "start" && (
        <StartScreen
          name={name}
          uid={uid}
          telegram={isTelegram()}
          giftAvailable={giftAvailable && !saved}
          savedBalance={saved ? saved.wallet.bonus + saved.wallet.cash : null}
          busy={busy}
          scores={scores}
          onEnter={() => void enterTable()}
          onHelp={() => setShowHelp(true)}
        />
      )}
      {paused && inGame && phase !== "gameover" && (
        <PauseScreen
          onResume={() => {
            sfx.click();
            setPaused(false);
          }}
          onQuit={quitToMenu}
          muted={muted}
          onToggleMute={toggleMute}
        />
      )}
      {phase === "gameover" && (
        <GameOverScreen
          peak={peak}
          biggestWin={biggestWin}
          spins={spins}
          bestStreak={bestStreak}
          totalWithdrawn={totalWithdrawn}
          scores={scores}
          rank={rank}
          onTopup={() => {
            sfx.click();
            setShowWithdraw(true);
          }}
          onRequestCoins={
            sazcoinEnabled
              ? () => {
                  if (busy) return;
                  setBusy(true);
                  sazcoin
                    .requestCoins("سکه‌هام تموم شد، لطفاً شارژ کنید")
                    .then(() => {
                      haptic.success();
                      showToast("✅ درخواستت به ادمین ارسال شد");
                    })
                    .catch((e: Error) => showToast(e.message || "ارسال ناموفق"))
                    .finally(() => setBusy(false));
                }
              : undefined
          }
          requestBusy={busy}
          onMenu={quitToMenu}
        />
      )}
    </div>
  );
}
