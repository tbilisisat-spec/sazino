/**
 * TON Connect — اتصال کیف پول کاربر برای برداشت SAZ (Jetton).
 * کلاینت هیچ ارسالی انجام نمی‌دهد؛ فقط آدرس کیف پول کاربر را می‌گیرد و به سرور می‌دهد.
 */
import { TonConnectUI, type Wallet } from "@tonconnect/ui";

export const SAZ_DECIMALS = 9;
export const SAZ_MINTER = (import.meta.env.VITE_SAZ_MINTER as string | undefined) || "kQAvhLJ-mx4uTxTkDwBA_Q_HZsv_DZ2r3upggsxuLgjdfOtJ";
export const SAZ_TREASURY = (import.meta.env.VITE_SAZ_TREASURY as string | undefined) || "kQBqLZ-bNG_lAORgGicOb7zhwQNvkhhpBiHBqgaUiV9ru3b5";
export const TON_NETWORK = (import.meta.env.VITE_TON_NETWORK as string | undefined) === "mainnet" ? "mainnet" : "testnet";

let ui: TonConnectUI | null = null;

export function tonUI(): TonConnectUI {
  if (!ui) {
    const base = window.location.href.split("#")[0].replace(/[^/]*$/, "");
    ui = new TonConnectUI({
      manifestUrl: (import.meta.env.VITE_TON_MANIFEST as string | undefined) || `${base}tonconnect-manifest.json`,
      language: "en",
      uiPreferences: { theme: "DARK" as never },
    });
  }
  return ui;
}

export function connectedAddress(): string | null {
  try {
    return tonUI().account?.address || null;
  } catch {
    return null;
  }
}

/** Opens the wallet picker (Tonkeeper, Telegram Wallet, MyTonWallet…) and resolves with the raw address. */
export async function connectWallet(): Promise<string | null> {
  const u = tonUI();
  if (u.account?.address) return u.account.address;
  return new Promise((resolve) => {
    const unsub = u.onStatusChange((w: Wallet | null) => {
      if (w?.account?.address) {
        unsub();
        resolve(w.account.address);
      }
    });
    u.openModal().catch(() => {
      unsub();
      resolve(null);
    });
  });
}

export async function disconnectWallet() {
  try {
    await tonUI().disconnect();
  } catch {
    /* ignore */
  }
}

/** Short display form: EQAb…9ru8 */
export function shortAddr(a: string | null) {
  if (!a) return "";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Deposit deep-link: user sends SAZ to the treasury with comment `tg:<id>` so the server can credit them. */
export function depositLink(uid: string) {
  return `https://app.tonkeeper.com/transfer/${SAZ_TREASURY}?jetton=${SAZ_MINTER}&text=${encodeURIComponent(uid)}`;
}
