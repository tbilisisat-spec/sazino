import { memo } from "react";
import { colorOf, makeKey, type BetKey, type BetKind, fa } from "../game/roulette";
import Chip from "./Chip";

interface Props {
  bets: Record<BetKey, number>;
  winningKeys: BetKey[];
  lastResult: number | null;
  hot?: number[];
  disabled: boolean;
  onBet: (key: BetKey) => void;
}

const cellColor = (n: number) => {
  const c = colorOf(n);
  return c === "red"
    ? "bg-gradient-to-b from-[#e0203f] to-[#a30d26]"
    : c === "black"
      ? "bg-gradient-to-b from-[#2b2b2b] to-[#0d0d0d]"
      : "bg-gradient-to-b from-[#1fa855] to-[#0b7a38]";
};

interface CellProps {
  kind: BetKind;
  number?: number;
  className?: string;
  amt: number;
  win: boolean;
  disabled: boolean;
  onBet: (key: BetKey) => void;
  children: React.ReactNode;
}

/** Stable, memoized cell: only re-renders when its own amount/win/disabled changes,
 *  so the chip stays perfectly still and only "bumps" once when more coins are added. */
const Cell = memo(function Cell({ kind, number, className = "", amt, win, disabled, onBet, children }: CellProps) {
  const key = makeKey(kind, number);
  return (
    <button
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        onBet(key);
      }}
      className={`cell relative flex items-center justify-center overflow-visible rounded-md border border-[#e6c766]/60 font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_-2px_3px_rgba(0,0,0,.35)] ${className} ${
        win ? "win-flash" : ""
      } ${disabled ? "opacity-90" : ""}`}
    >
      {children}
      {amt > 0 && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-[#ffe680] ring-inset" />
          <span className="pointer-events-none absolute -right-1 -top-1 z-10 flex items-center justify-center drop-shadow-[0_2px_3px_rgba(0,0,0,.8)]">
            <span key={amt} className="chip-bump inline-flex">
              <Chip value={amt} size={kind === "straight" ? 22 : 24} animate={false} />
            </span>
          </span>
        </>
      )}
    </button>
  );
});

function BettingTable({ bets, winningKeys, lastResult, hot = [], disabled, onBet }: Props) {
  const hotSet = new Set(hot);
  const winSet = new Set(winningKeys);
  const p = (kind: BetKind, number?: number) => {
    const key = makeKey(kind, number);
    return { kind, number, amt: bets[key] || 0, win: winSet.has(key), disabled, onBet };
  };
  const rows = [3, 2, 1];
  const outside = "h-7 bg-[#0b3324]/70 text-xs sm:h-10 sm:text-sm";

  return (
    <div dir="ltr" className="felt select-none rounded-2xl border-2 border-[#e6c766]/70 p-2 shadow-[0_10px_30px_rgba(0,0,0,.5),inset_0_0_40px_rgba(0,0,0,.35)]">
      <div className="flex gap-1">
        <Cell {...p("straight", 0)} className={`${cellColor(0)} w-9 text-base sm:w-11`}>
          <span className={lastResult === 0 ? "text-[#ffe680]" : ""}>0</span>
        </Cell>
        <div className="grid flex-1 grid-cols-12 gap-1">
          {rows.map((r) =>
            Array.from({ length: 12 }, (_, i) => {
              const n = i * 3 + r;
              return (
                <Cell key={n} {...p("straight", n)} className={`${cellColor(n)} h-8 text-[12px] sm:h-11 sm:text-base`}>
                  <span className={lastResult === n ? "text-[#ffe680] drop-shadow-[0_0_6px_#ffe680]" : ""}>{n}</span>
                  {hotSet.has(n) && lastResult !== n && !bets[makeKey("straight", n)] && (
                    <span className="pointer-events-none absolute right-0.5 top-0 text-[8px] leading-none">🔥</span>
                  )}
                </Cell>
              );
            }),
          )}
        </div>
        <div className="flex w-9 flex-col gap-1 sm:w-11">
          {(["col3", "col2", "col1"] as BetKind[]).map((k) => (
            <Cell key={k} {...p(k)} className="h-8 bg-[#0b3324]/70 text-[10px] sm:h-11 sm:text-xs">
              2:1
            </Cell>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-1">
        <div className="w-9 sm:w-11" />
        <div className="grid flex-1 grid-cols-3 gap-1">
          {(["dozen1", "dozen2", "dozen3"] as BetKind[]).map((k, i) => (
            <Cell key={k} {...p(k)} className={outside}>
              {["1st 12", "2nd 12", "3rd 12"][i]} <span className="ms-1 text-[#ffe680]/80">{fa(`${i * 12 + 1}-${i * 12 + 12}`)}</span>
            </Cell>
          ))}
        </div>
        <div className="w-9 sm:w-11" />
      </div>
      <div className="mt-1 flex gap-1">
        <div className="w-9 sm:w-11" />
        <div className="grid flex-1 grid-cols-6 gap-1">
          <Cell {...p("low")} className={outside}>
            1-18
          </Cell>
          <Cell {...p("even")} className={outside}>
            زوج
          </Cell>
          <Cell {...p("red")} className="h-7 bg-gradient-to-b from-[#e0203f] to-[#a30d26] text-xs sm:h-10 sm:text-sm">
            <span className="inline-block h-4 w-4 rotate-45 rounded-sm bg-white/90 shadow" />
          </Cell>
          <Cell {...p("black")} className="h-7 bg-gradient-to-b from-[#2b2b2b] to-[#0d0d0d] text-xs sm:h-10 sm:text-sm">
            <span className="inline-block h-4 w-4 rotate-45 rounded-sm bg-black ring-1 ring-white/60" />
          </Cell>
          <Cell {...p("odd")} className={outside}>
            فرد
          </Cell>
          <Cell {...p("high")} className={outside}>
            19-36
          </Cell>
        </div>
        <div className="w-9 sm:w-11" />
      </div>
    </div>
  );
}

export default memo(BettingTable);
