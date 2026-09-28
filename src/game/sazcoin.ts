/**
 * Sazcoin wallet integration layer (client side).
 *
 * The browser NEVER holds authority over real balances. Every call goes to YOUR
 * backend (e.g. https://saztik.com/api/sazino), which verifies the Telegram
 * `initData` signature and keeps the wallet in a database.
 *
 * Wallet model (mirrored on the server):
 *   bonus – the one-time 100 welcome coins. Can be bet, can NOT be withdrawn.
 *   cash  – winnings. Withdrawable.
 *
 * If VITE_SAZCOIN_API is not set, the game runs in local demo mode.
 *
 * Endpoints (JSON; header  Authorization: tma <initData>):
 *   POST /auth                         -> { wallet:{bonus,cash}, giftGranted, stats }
 *   POST /round/open  { roundId, bets } -> { wallet }            (debits bonus first, then cash)
 *   POST /round/close { roundId, result } -> { wallet, won }     (credits winnings to cash)
 *   POST /withdraw    { amount, address } -> { wallet, txId }    (only from cash)
 *   GET  /wallet                        -> { wallet }
 */

const API = (import.meta.env.VITE_SAZCOIN_API as string | undefined)?.replace(/\/$/, "");

export const sazcoinEnabled = !!API;

export interface ServerWallet {
  bonus: number;
  cash: number;
}

function initData(): string {
  return (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "";
}

async function call<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (!API) throw new Error("Sazcoin API not configured");
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `tma ${initData()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const sazcoin = {
  auth: () =>
    call<{
      wallet: ServerWallet;
      giftGranted: boolean;
      stats?: { peak: number; biggestWin: number; spins: number; totalWithdrawn: number };
    }>("/auth"),
  wallet: () => call<{ wallet: ServerWallet }>("/wallet", undefined, "GET"),
  /** Place bets on the shared round (must be called while the round is still in betting phase). */
  openRound: (roundId: string, bets: Record<string, number>) =>
    call<{ wallet: ServerWallet }>("/round/open", { roundId, bets }),
  /** Settle my bets for the shared round; server uses the round's single global result. */
  closeRound: (roundId: string) =>
    call<{ wallet: ServerWallet; won: number; result: number }>("/round/close", { roundId }),
  /** address = user's TON wallet (from TON Connect). Server sends SAZ jettons from treasury. */
  withdraw: (amount: number, address: string) =>
    call<{ wallet: ServerWallet; txId: string; status: "sent" | "pending" }>("/withdraw", { amount, address }),
  /** Shared table clock + recent results (roundId -> 0..36). */
  table: () => call<{ now: number; roundMs: number; results: Record<string, number> }>("/table", undefined, "GET"),
  /** Result of a specific round (available once betting closed). */
  roundResult: (roundId: number) => call<{ roundId: number; result: number | null }>(`/table/${roundId}`, undefined, "GET"),
  /** Save the connected TON wallet + optional phone once (registration at first withdrawal). */
  profile: (data: { tonAddress?: string; phone?: string }) => call<{ ok: true }>("/profile", data),
  /** Ask server to scan the treasury for a deposit with comment tg:<id> and credit cash. */
  checkDeposit: () => call<{ wallet: ServerWallet; credited: number }>("/deposit/check"),
  /** Notify admin that this player needs coins (optional message). */
  requestCoins: (message?: string) =>
    call<{ ok: true; queued: boolean }>("/request-coins", { message: message || "" }),
  /** Real leaderboard aggregated server-side across every player (not just this device). */
  leaderboard: () => call<{ scores: import("./storage").ScoreEntry[] }>("/leaderboard", undefined, "GET"),
};
