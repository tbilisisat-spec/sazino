import { makeKey, payoutMultiplier, betWins, parseKey, type BetKey, type BetKind } from "./roulette";

export interface BotBet {
  name: string;
  avatar: string;
  key: BetKey;
  amt: number;
  at: number; // ms into betting window when it is placed
}

export interface Winner {
  name: string;
  avatar: string;
  amount: number; // net win (>0)
  isYou?: boolean;
}

const BOTS: { name: string; avatar: string }[] = [
  { name: "علی", avatar: "🧔" },
  { name: "سارا", avatar: "👩" },
  { name: "رضا", avatar: "🧑" },
  { name: "مریم", avatar: "👱‍♀️" },
  { name: "امیر", avatar: "🧑‍🦱" },
  { name: "نگار", avatar: "👩‍🦰" },
  { name: "کیان", avatar: "🧑‍🦳" },
  { name: "لیلا", avatar: "🧕" },
];

const OUTSIDE: BetKind[] = ["red", "black", "odd", "even", "low", "high", "dozen1", "dozen2", "dozen3", "col1", "col2", "col3"];
const AMTS = [5, 10, 10, 25, 25, 50, 100];

export function generateBotBets(windowMs: number): BotBet[] {
  const shuffled = [...BOTS].sort(() => Math.random() - 0.5);
  const count = 3 + Math.floor(Math.random() * 3);
  const out: BotBet[] = [];
  for (let i = 0; i < count; i++) {
    const b = shuffled[i];
    const n = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < n; j++) {
      const straight = Math.random() < 0.4;
      const key = straight
        ? makeKey("straight", Math.floor(Math.random() * 37))
        : OUTSIDE[Math.floor(Math.random() * OUTSIDE.length)];
      out.push({
        name: b.name,
        avatar: b.avatar,
        key,
        amt: AMTS[Math.floor(Math.random() * AMTS.length)],
        at: 800 + Math.random() * (windowMs - 3000),
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function settleBots(bets: BotBet[], result: number): Winner[] {
  const map = new Map<string, Winner>();
  for (const b of bets) {
    const { kind, number } = parseKey(b.key);
    if (betWins(kind, number, result)) {
      const w = map.get(b.name) || { name: b.name, avatar: b.avatar, amount: 0 };
      w.amount += b.amt * (payoutMultiplier(kind) + 1);
      map.set(b.name, w);
    }
  }
  return [...map.values()];
}
