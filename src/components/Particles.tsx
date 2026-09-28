import { useEffect, useRef } from "react";

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  shape: "coin" | "rect" | "spark";
}

export interface ParticleAPI {
  burst(x: number, y: number, count: number, kind: "coins" | "confetti" | "sparks"): void;
}

const COLORS = ["#f5c542", "#ffe680", "#ff5c5c", "#ffffff", "#4ade80", "#60a5fa", "#c084fc", "#fb923c"];

export default function Particles({ apiRef }: { apiRef: React.MutableRefObject<ParticleAPI | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let running = false;

    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const arr = parts.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt;
        if (p.life <= 0 || p.y > window.innerHeight + 40) {
          arr[i] = arr[arr.length - 1];
          arr.pop();
          continue;
        }
        p.vy += (p.shape === "spark" ? 300 : 900) * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const a = Math.min(1, p.life / (p.max * 0.35));
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === "coin") {
          const sx = Math.abs(Math.cos(p.rot * 2));
          ctx.scale(Math.max(0.15, sx), 1);
          const g = ctx.createRadialGradient(-p.size * 0.3, -p.size * 0.3, 1, 0, 0, p.size);
          g.addColorStop(0, "#fff3b0");
          g.addColorStop(0.6, "#f5c542");
          g.addColorStop(1, "#a8740a");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#8a6408";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (p.shape === "rect") {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          // sparks: no shadowBlur (very slow on mobile GPUs) — draw a soft halo circle instead
          ctx.fillStyle = p.color;
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 2.2 * (p.life / p.max), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (p.life / p.max), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (arr.length > 0) raf.current = requestAnimationFrame(loop);
      else running = false;
    };

    apiRef.current = {
      burst(x, y, count, kind) {
        const arr = parts.current;
        // fewer particles on phones / low-end devices
        const cores = navigator.hardwareConcurrency || 4;
        const scale = window.innerWidth < 700 ? (cores <= 4 ? 0.45 : 0.65) : 1;
        count = Math.max(8, Math.round(count * scale));
        for (let i = 0; i < count; i++) {
          const ang = kind === "sparks" ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          const sp = kind === "sparks" ? 80 + Math.random() * 260 : 250 + Math.random() * 500;
          const max = kind === "sparks" ? 0.4 + Math.random() * 0.5 : 1.6 + Math.random() * 1.2;
          arr.push({
            x,
            y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: max,
            max,
            size: kind === "coins" ? 6 + Math.random() * 6 : kind === "confetti" ? 8 + Math.random() * 6 : 3 + Math.random() * 3,
            color: COLORS[(Math.random() * COLORS.length) | 0],
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 12,
            shape: kind === "coins" ? "coin" : kind === "confetti" ? "rect" : "spark",
          } as P);
        }
        if (arr.length > 600) arr.splice(0, arr.length - 600);
        if (!running) {
          running = true;
          last = performance.now();
          raf.current = requestAnimationFrame(loop);
        }
      },
    };

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, [apiRef]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />;
}
