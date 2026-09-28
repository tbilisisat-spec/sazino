export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
export const POCKETS = WHEEL_ORDER.length; // 37

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type Color = "red" | "black" | "green";
export function colorOf(n: number): Color {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

export type BetKind =
  | "straight"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high"
  | "dozen1"
  | "dozen2"
  | "dozen3"
  | "col1"
  | "col2"
  | "col3";

export type BetKey = string; // e.g. "straight:17" or "red"

export interface Bet {
  key: BetKey;
  kind: BetKind;
  number?: number;
  amount: number;
}

export function makeKey(kind: BetKind, number?: number): BetKey {
  return kind === "straight" ? `straight:${number}` : kind;
}

export function parseKey(key: BetKey): { kind: BetKind; number?: number } {
  if (key.startsWith("straight:")) return { kind: "straight", number: Number(key.split(":")[1]) };
  return { kind: key as BetKind };
}

export function payoutMultiplier(kind: BetKind): number {
  switch (kind) {
    case "straight":
      return 35;
    case "dozen1":
    case "dozen2":
    case "dozen3":
    case "col1":
    case "col2":
    case "col3":
      return 2;
    default:
      return 1;
  }
}

export function betWins(kind: BetKind, number: number | undefined, result: number): boolean {
  const r = Number(result);
  if (r === 0) return kind === "straight" && Number(number) === 0;
  switch (kind) {
    case "straight":
      return Number(number) === r;
    case "red":
      return colorOf(r) === "red";
    case "black":
      return colorOf(r) === "black";
    case "odd":
      return r % 2 === 1;
    case "even":
      return r % 2 === 0;
    case "low":
      return r >= 1 && r <= 18;
    case "high":
      return r >= 19 && r <= 36;
    case "dozen1":
      return r >= 1 && r <= 12;
    case "dozen2":
      return r >= 13 && r <= 24;
    case "dozen3":
      return r >= 25 && r <= 36;
    case "col1":
      return r % 3 === 1;
    case "col2":
      return r % 3 === 2;
    case "col3":
      return r % 3 === 0;
  }
}

export interface SettleResult {
  totalBet: number;
  totalReturn: number; // stake + winnings for winning bets
  net: number;
  winningKeys: BetKey[];
}

export function settle(bets: Record<BetKey, number>, result: number): SettleResult {
  const r = Number(result);
  let totalBet = 0;
  let totalReturn = 0;
  const winningKeys: BetKey[] = [];
  for (const [key, amount] of Object.entries(bets)) {
    const amt = Number(amount) || 0;
    if (amt <= 0) continue;
    totalBet += amt;
    const { kind, number } = parseKey(key);
    if (betWins(kind, number, r)) {
      totalReturn += amt * (payoutMultiplier(kind) + 1);
      winningKeys.push(key);
    }
  }
  return { totalBet, totalReturn, net: totalReturn - totalBet, winningKeys };
}

export const BET_LABELS: Record<BetKind, string> = {
  straight: "عدد",
  red: "قرمز",
  black: "مشکی",
  odd: "فرد",
  even: "زوج",
  low: "۱ تا ۱۸",
  high: "۱۹ تا ۳۶",
  dozen1: "دوجین ۱",
  dozen2: "دوجین ۲",
  dozen3: "دوجین ۳",
  col1: "ستون ۱",
  col2: "ستون ۲",
  col3: "ستون ۳",
};

export const CHIP_VALUES = [1, 5, 10, 25, 50, 100];

export function randomResult(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % POCKETS;
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export function fa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
