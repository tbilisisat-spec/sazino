export interface ScoreEntry {
  name: string;
  peak: number; // highest total balance reached
  biggestWin: number;
  spins: number;
  date: number;
}

const SCORES_KEY = "sazino-scores-v2";
const PLAYER_PREFIX = "sazino-player-v2:";
const GIFT_PREFIX = "sazino-gift-claimed:";

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const list = [...loadScores(), entry]
    .sort((a, b) => b.peak - a.peak || b.biggestWin - a.biggestWin)
    .slice(0, 10);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

/** Wallet split: bonus = welcome coins (cannot be withdrawn), cash = winnings (withdrawable). */
export interface Wallet {
  bonus: number;
  cash: number;
}

export interface PlayerState {
  wallet: Wallet;
  peak: number;
  biggestWin: number;
  spins: number;
  totalWithdrawn: number;
  history: number[];
}

export function loadPlayer(uid: string): PlayerState | null {
  try {
    const raw = localStorage.getItem(PLAYER_PREFIX + uid);
    return raw ? (JSON.parse(raw) as PlayerState) : null;
  } catch {
    return null;
  }
}

export function savePlayer(uid: string, p: PlayerState) {
  try {
    localStorage.setItem(PLAYER_PREFIX + uid, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Has this Telegram ID already received the one-time 100-coin gift? */
export function giftClaimed(uid: string): boolean {
  try {
    return localStorage.getItem(GIFT_PREFIX + uid) === "1";
  } catch {
    return false;
  }
}

export function markGiftClaimed(uid: string) {
  try {
    localStorage.setItem(GIFT_PREFIX + uid, "1");
  } catch {
    /* ignore */
  }
}
