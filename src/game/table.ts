/**
 * میز مشترک (shared live table).
 *
 * همهٔ بازیکن‌ها باید یک دور، یک تایمر و یک نتیجه ببینند.
 *  - حالت سرور: سرور هر دور را می‌سازد و نتیجه را می‌دهد (منبع حقیقت).
 *  - حالت دمو: دورها روی «ساعت جهانی» قفل‌اند: roundNo = floor(now / ROUND_MS).
 *    نتیجهٔ هر دور از هش دترمینیستیکِ شمارهٔ دور به‌دست می‌آید، پس دو دستگاه
 *    مختلف در یک لحظه دقیقاً همان عدد را می‌بینند (بدون شبکه).
 */
import { sazcoin, sazcoinEnabled } from "./sazcoin";

export const BET_WINDOW_MS = 20000;
export const SPIN_MS = 6000;
export const RESULT_MS = 4000;
export const ROUND_MS = BET_WINDOW_MS + SPIN_MS + RESULT_MS; // 30s

export type TablePhase = "betting" | "spinning" | "result";

export interface TableState {
  roundId: number; // شمارهٔ دور جهانی
  phase: TablePhase;
  phaseEndsAt: number; // ms (ساعت محلیِ تصحیح‌شده)
  result: number | null; // فقط وقتی phase !== "betting"
  serverOffset: number; // serverNow - localNow
}

// ---------- demo: deterministic per-round result ----------
const DEMO_SALT = "sazino-demo-v1";
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function demoResult(roundId: number): number {
  // دو دور هش برای پخش بهتر
  const a = fnv1a(`${DEMO_SALT}:${roundId}`);
  const b = fnv1a(`${a}:${roundId}`);
  return (a ^ b) % 37;
}

let offset = 0; // server clock - local clock
export const serverNow = () => Date.now() + offset;

export function computeState(nowMs: number, roundResult: (id: number) => number | null): TableState {
  const roundId = Math.floor(nowMs / ROUND_MS);
  const start = roundId * ROUND_MS;
  const t = nowMs - start;
  let phase: TablePhase;
  let phaseEndsAt: number;
  if (t < BET_WINDOW_MS) {
    phase = "betting";
    phaseEndsAt = start + BET_WINDOW_MS;
  } else if (t < BET_WINDOW_MS + SPIN_MS) {
    phase = "spinning";
    phaseEndsAt = start + BET_WINDOW_MS + SPIN_MS;
  } else {
    phase = "result";
    phaseEndsAt = start + ROUND_MS;
  }
  return { roundId, phase, phaseEndsAt: phaseEndsAt - offset, result: phase === "betting" ? null : roundResult(roundId), serverOffset: offset };
}

// ---------- server sync ----------
const serverResults = new Map<number, number>();

/** یک بار هنگام ورود: ساعت و نتایج اخیر را از سرور می‌گیرد. */
export async function syncWithServer(): Promise<void> {
  if (!sazcoinEnabled) return;
  const t0 = Date.now();
  const r = await sazcoin.table();
  const t1 = Date.now();
  const rtt = (t1 - t0) / 2;
  offset = r.now + rtt - t1;
  for (const [id, res] of Object.entries(r.results)) serverResults.set(Number(id), res);
}

/** نتیجهٔ یک دور: از سرور (اگر داریم) یا دمو. */
export function resultFor(roundId: number): number | null {
  if (sazcoinEnabled) return serverResults.has(roundId) ? serverResults.get(roundId)! : null;
  return demoResult(roundId);
}

export function rememberResult(roundId: number, result: number) {
  serverResults.set(roundId, result);
}

export const isServerTable = () => sazcoinEnabled;
