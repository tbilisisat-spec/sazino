interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}
interface TgWebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  initDataUnsafe?: { user?: TgUser };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function tg(): TgWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.();
    w.setHeaderColor?.("#071410");
    w.setBackgroundColor?.("#071410");
  } catch {
    /* ignore */
  }
}

export function playerName(): string {
  const u = tg()?.initDataUnsafe?.user;
  if (u?.first_name) return u.first_name;
  return "مهمان";
}

export function isTelegram(): boolean {
  return !!tg()?.initDataUnsafe?.user;
}

/** Stable player id: Telegram user id, or a persistent guest id for browser testing. */
export function playerId(): string {
  const u = tg()?.initDataUnsafe?.user;
  if (u?.id) return `tg:${u.id}`;
  try {
    let g = localStorage.getItem("sazino-guest-id");
    if (!g) {
      g = `guest:${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("sazino-guest-id", g);
    }
    return g;
  } catch {
    return "guest:anon";
  }
}

export function openTelegramLink(url: string) {
  const w = tg() as unknown as { openTelegramLink?: (u: string) => void; openLink?: (u: string) => void } | undefined;
  if (w?.openTelegramLink && url.startsWith("https://t.me/")) w.openTelegramLink(url);
  else if (w?.openLink) w.openLink(url);
  else window.open(url, "_blank");
}

export const haptic = {
  light() {
    try {
      tg()?.HapticFeedback?.impactOccurred("light");
    } catch {
      /* ignore */
    }
    if (navigator.vibrate) navigator.vibrate(8);
  },
  heavy() {
    try {
      tg()?.HapticFeedback?.impactOccurred("heavy");
    } catch {
      /* ignore */
    }
    if (navigator.vibrate) navigator.vibrate(30);
  },
  success() {
    try {
      tg()?.HapticFeedback?.notificationOccurred("success");
    } catch {
      /* ignore */
    }
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  },
  error() {
    try {
      tg()?.HapticFeedback?.notificationOccurred("error");
    } catch {
      /* ignore */
    }
    if (navigator.vibrate) navigator.vibrate(60);
  },
};
