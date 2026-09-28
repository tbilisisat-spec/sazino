import { fa } from "../game/roulette";

const chipStyle = (v: number) => {
  if (v >= 100) return { bg: "#2b2b2b", ring: "#f5c542", text: "#ffe680" };
  if (v >= 50) return { bg: "#7c3aed", ring: "#fff", text: "#fff" };
  if (v >= 25) return { bg: "#16a34a", ring: "#fff", text: "#fff" };
  if (v >= 10) return { bg: "#2563eb", ring: "#fff", text: "#fff" };
  if (v >= 5) return { bg: "#dc2626", ring: "#fff", text: "#fff" };
  return { bg: "#f1f1f1", ring: "#444", text: "#222" };
};

export default function Chip({
  value,
  size = 40,
  selected = false,
  animate = true,
}: {
  value: number;
  size?: number;
  selected?: boolean;
  animate?: boolean;
}) {
  const s = chipStyle(value);
  const dash = size * 0.22;
  return (
    <span
      className={`${animate ? "chip-bounce" : ""} font-num relative inline-flex items-center justify-center rounded-full font-black`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), transparent 45%), ${s.bg}`,
        border: `${Math.max(2, size * 0.09)}px dashed ${s.ring}`,
        boxShadow: selected
          ? `0 0 0 3px #071410, 0 0 0 5px #ffe680, 0 6px 14px rgba(0,0,0,.6)`
          : `0 3px 6px rgba(0,0,0,.55), inset 0 -2px 4px rgba(0,0,0,.35)`,
        color: s.text,
        fontSize: size * (value >= 1000 ? 0.26 : value >= 100 ? 0.32 : 0.42),
        lineHeight: 1,
        transform: selected ? "translateY(-6px) scale(1.1)" : undefined,
        transition: "transform .15s, box-shadow .15s",
      }}
    >
      <span
        className="absolute rounded-full"
        style={{ inset: dash * 0.55, border: `1px solid ${s.ring}`, opacity: 0.7 }}
      />
      <span className="relative">{fa(value)}</span>
    </span>
  );
}
