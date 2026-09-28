import { memo, useEffect, useRef } from "react";
import { WHEEL_ORDER, POCKETS, colorOf } from "../game/roulette";

export interface SpinRequest {
  id: number;
  result: number;
  /** performance.now()-based start time; lets late joiners see the ball mid-flight in sync */
  startAt?: number;
}

interface Props {
  size: number;
  spin: SpinRequest | null;
  paused: boolean;
  zoom?: boolean;
  onTick: () => void;
  onLanded: (result: number, id: number) => void;
  onDrop: () => void;
}

const SPIN_DURATION = 6000;
const POCKET_ANGLE = (Math.PI * 2) / POCKETS;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function renderStatic(size: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size * dpr;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cx = size / 2;
  const R = size / 2;

  // outer wood rim
  const wood = ctx.createRadialGradient(cx, cx, R * 0.78, cx, cx, R);
  wood.addColorStop(0, "#5a2d0c");
  wood.addColorStop(0.5, "#8a4a1c");
  wood.addColorStop(0.85, "#5e2f0e");
  wood.addColorStop(1, "#2e1505");
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.arc(cx, cx, R, 0, Math.PI * 2);
  ctx.fill();

  // gold outer ring
  ctx.lineWidth = R * 0.025;
  const gold = ctx.createLinearGradient(0, 0, size, size);
  gold.addColorStop(0, "#b8860b");
  gold.addColorStop(0.5, "#ffe680");
  gold.addColorStop(1, "#b8860b");
  ctx.strokeStyle = gold;
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.985, 0, Math.PI * 2);
  ctx.stroke();

  // ball track
  const track = ctx.createRadialGradient(cx, cx, R * 0.8, cx, cx, R * 0.93);
  track.addColorStop(0, "#1a0c04");
  track.addColorStop(0.5, "#3a1f0c");
  track.addColorStop(1, "#1a0c04");
  ctx.fillStyle = track;
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.93, 0, Math.PI * 2);
  ctx.arc(cx, cx, R * 0.8, 0, Math.PI * 2, true);
  ctx.fill();

  // diamonds (deflectors)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R * 0.865, cx + Math.sin(a) * R * 0.865);
    ctx.rotate(a);
    const dg = ctx.createLinearGradient(-6, -6, 6, 6);
    dg.addColorStop(0, "#fff4c2");
    dg.addColorStop(1, "#a8740a");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.03);
    ctx.lineTo(R * 0.014, 0);
    ctx.lineTo(0, R * 0.03);
    ctx.lineTo(-R * 0.014, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = gold;
  ctx.lineWidth = R * 0.012;
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

function renderWheel(size: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size * dpr;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cx = size / 2;
  const R = size / 2;
  const rOut = R * 0.79;
  const rIn = R * 0.56;

  for (let i = 0; i < POCKETS; i++) {
    const n = WHEEL_ORDER[i];
    const a0 = i * POCKET_ANGLE - POCKET_ANGLE / 2 - Math.PI / 2;
    const a1 = a0 + POCKET_ANGLE;
    const col = colorOf(n);
    const base = col === "red" ? "#c8102e" : col === "black" ? "#161616" : "#0f8a3c";
    const light = col === "red" ? "#ff3b55" : col === "black" ? "#3a3a3a" : "#2fc266";
    const g = ctx.createRadialGradient(cx, cx, rIn, cx, cx, rOut);
    g.addColorStop(0, base);
    g.addColorStop(0.7, light);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cx, rOut, a0, a1);
    ctx.arc(cx, cx, rIn, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,225,140,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // number
    const am = (a0 + a1) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(am) * rOut * 0.9, cx + Math.sin(am) * rOut * 0.9);
    ctx.rotate(am + Math.PI / 2);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(9, R * 0.075)}px Vazirmatn, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 2;
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  // pocket separators (metal frets)
  for (let i = 0; i < POCKETS; i++) {
    const a = i * POCKET_ANGLE - POCKET_ANGLE / 2 - Math.PI / 2;
    ctx.strokeStyle = "#e6c766";
    ctx.lineWidth = R * 0.012;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rIn, cx + Math.sin(a) * rIn);
    ctx.lineTo(cx + Math.cos(a) * (rOut - R * 0.02), cx + Math.sin(a) * (rOut - R * 0.02));
    ctx.stroke();
  }

  // inner cone
  const cone = ctx.createRadialGradient(cx - R * 0.15, cx - R * 0.15, R * 0.05, cx, cx, rIn);
  cone.addColorStop(0, "#7a4a1c");
  cone.addColorStop(0.6, "#4a2a0d");
  cone.addColorStop(1, "#2a1506");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.arc(cx, cx, rIn, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e6c766";
  ctx.lineWidth = R * 0.015;
  ctx.stroke();

  // hub
  const hub = ctx.createRadialGradient(cx - R * 0.08, cx - R * 0.08, 2, cx, cx, R * 0.24);
  hub.addColorStop(0, "#fff2b8");
  hub.addColorStop(0.4, "#f5c542");
  hub.addColorStop(1, "#8a6408");
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.24, 0, Math.PI * 2);
  ctx.fill();
  // spokes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.save();
    ctx.translate(cx, cx);
    ctx.rotate(a);
    const sg = ctx.createLinearGradient(0, -R * 0.03, 0, R * 0.03);
    sg.addColorStop(0, "#ffe680");
    sg.addColorStop(0.5, "#f5c542");
    sg.addColorStop(1, "#9c7410");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.roundRect(R * 0.1, -R * 0.028, rIn - R * 0.14, R * 0.056, R * 0.02);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#1a1206";
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const knob = ctx.createRadialGradient(cx - R * 0.02, cx - R * 0.02, 1, cx, cx, R * 0.055);
  knob.addColorStop(0, "#ffe680");
  knob.addColorStop(1, "#a8740a");
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.055, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function Wheel({ size, spin, paused, zoom = false, onTick, onLanded, onDrop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    wheelAngle: 0,
    ballAngle: 0,
    ballR: 0,
    spinStart: 0,
    spinId: -1,
    spinning: false,
    landed: false,
    dropped: false,
    winIdx: -1,
    wheelStart: 0,
    wheelTotal: 0,
    ballStart: 0,
    ballTotal: 0,
    lastPocket: -1,
    pauseAt: 0,
  });
  const cb = useRef({ onTick, onLanded, onDrop });
  cb.current = { onTick, onLanded, onDrop };

  // start spin when request changes
  useEffect(() => {
    if (!spin) return;
    const s = state.current;
    if (s.spinId === spin.id) return;
    s.spinId = spin.id;
    s.spinning = true;
    s.landed = false;
    s.dropped = false;
    s.spinStart = spin.startAt ?? performance.now();
    // if we joined late, the deterministic path below still lands exactly on the result
    s.winIdx = WHEEL_ORDER.indexOf(Number(spin.result));
    if (s.winIdx < 0) {
      // defensive: never land on garbage if result is somehow out of range
      s.winIdx = Math.abs(Number(spin.result) || 0) % POCKETS;
    }
    s.wheelStart = s.wheelAngle;
    // deterministic per round id → same visual spin on every device
    const seed = ((spin.id * 2654435761) >>> 0) / 4294967296;
    s.wheelTotal = Math.PI * 2 * (3 + seed);
    const wheelEnd = s.wheelStart + s.wheelTotal;
    const target = wheelEnd + s.winIdx * POCKET_ANGLE - Math.PI / 2;
    s.ballStart = s.ballAngle;
    let diff = (s.ballStart - target) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    s.ballTotal = diff + Math.PI * 2 * 9;
    s.lastPocket = -1;
  }, [spin]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true })!;
    // cap pixel density: 2x on desktop, 1.5x on phones — invisible difference, ~45% fewer pixels
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const staticLayer = renderStatic(size, dpr);
    const wheelLayer = renderWheel(size, dpr);
    // pre-rendered glass sheen (was a gradient rebuilt every frame)
    const sheenLayer = document.createElement("canvas");
    sheenLayer.width = sheenLayer.height = size * dpr;
    {
      const sc = sheenLayer.getContext("2d")!;
      sc.scale(dpr, dpr);
      const g = sc.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, "rgba(255,255,255,.10)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,.04)");
      sc.fillStyle = g;
      sc.beginPath();
      sc.arc(size / 2, size / 2, (size / 2) * 0.985, 0, Math.PI * 2);
      sc.fill();
    }
    const cx = size / 2;
    const R = size / 2;
    const s = state.current;
    if (!s.ballR) s.ballR = R * 0.865;
    let raf = 0;
    let last = performance.now();
    let pausedFlag = false;

    let idleAcc = 0;
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      // when idle (slow drift only) render at ~30fps to save battery/CPU
      if (!s.spinning && !pausedFlag) {
        idleAcc += dt;
        if (idleAcc < 1 / 30) {
          s.wheelAngle += dt * 0.25;
          if (s.landed) s.ballAngle = s.wheelAngle + s.winIdx * POCKET_ANGLE - Math.PI / 2;
          else s.ballAngle -= dt * 0.25;
          raf = requestAnimationFrame(draw);
          return;
        }
        idleAcc = 0;
      }

      if (!pausedFlag) {
        if (s.spinning) {
          const p = Math.min(1, (t - s.spinStart) / SPIN_DURATION);
          s.wheelAngle = s.wheelStart + s.wheelTotal * easeOutCubic(p);
          const free = s.ballStart - s.ballTotal * easeOutQuart(p);
          const locked = s.wheelAngle + s.winIdx * POCKET_ANGLE - Math.PI / 2;
          const k = smooth(0.72, 0.9, p);
          // shortest blend
          let d = (locked - free) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          s.ballAngle = free + d * k;
          // radius: track -> pocket with bounce
          const drop = smooth(0.7, 0.86, p);
          let r = R * 0.865 - (R * 0.865 - R * 0.68) * drop;
          if (p > 0.7 && p < 0.92) {
            const bp = (p - 0.7) / 0.22;
            r += Math.abs(Math.sin(bp * Math.PI * 3)) * (1 - bp) * R * 0.05;
          }
          s.ballR = r;
          if (p > 0.7 && !s.dropped) {
            s.dropped = true;
            cb.current.onDrop();
          }
          // ticks
          if (p < 0.9) {
            const rel = s.ballAngle - s.wheelAngle;
            const idx = Math.floor(rel / POCKET_ANGLE);
            if (idx !== s.lastPocket) {
              s.lastPocket = idx;
              cb.current.onTick();
            }
          }
          if (p >= 1) {
            s.spinning = false;
            s.landed = true;
            cb.current.onLanded(WHEEL_ORDER[s.winIdx], s.spinId);
          }
        } else {
          // idle drift; ball stays with wheel if landed
          s.wheelAngle += dt * 0.25;
          if (s.landed) s.ballAngle = s.wheelAngle + s.winIdx * POCKET_ANGLE - Math.PI / 2;
          else s.ballAngle -= dt * 0.25;
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(staticLayer, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(s.wheelAngle);
      ctx.drawImage(wheelLayer, -cx, -cx, size, size);
      ctx.restore();

      // winning glow
      if (s.landed && !s.spinning) {
        const a0 = s.wheelAngle + s.winIdx * POCKET_ANGLE - POCKET_ANGLE / 2 - Math.PI / 2;
        const pulse = 0.5 + 0.5 * Math.sin(t / 150);
        ctx.strokeStyle = `rgba(255,240,170,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ffe680";
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.beginPath();
        ctx.arc(cx, cx, R * 0.79, a0, a0 + POCKET_ANGLE);
        ctx.arc(cx, cx, R * 0.56, a0 + POCKET_ANGLE, a0, true);
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ball
      const bx = cx + Math.cos(s.ballAngle) * s.ballR;
      const by = cx + Math.sin(s.ballAngle) * s.ballR;
      const br = R * 0.045;
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.beginPath();
      ctx.arc(bx + br * 0.4, by + br * 0.6, br, 0, Math.PI * 2);
      ctx.fill();
      const bg = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.5, "#e8e8e8");
      bg.addColorStop(1, "#8a8a8a");
      // soft halo (cheap: a second larger translucent circle instead of shadowBlur)
      if (s.spinning) {
        ctx.fillStyle = "rgba(255,255,255,.22)";
        ctx.beginPath();
        ctx.arc(bx, by, br * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();

      ctx.drawImage(sheenLayer, 0, 0, size, size);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const obs = { set: (v: boolean) => (pausedFlag = v) };
    (state.current as unknown as { obs: typeof obs }).obs = obs;

    return () => cancelAnimationFrame(raf);
  }, [size]);

  // pause handling: freeze timing
  useEffect(() => {
    const s = state.current as unknown as { obs?: { set: (v: boolean) => void } } & typeof state.current;
    s.obs?.set(paused);
    if (paused) s.pauseAt = performance.now();
    else if (s.pauseAt) {
      const delta = performance.now() - s.pauseAt;
      s.spinStart += delta;
      s.pauseAt = 0;
    }
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        // box-shadow on a round element is far cheaper than a per-frame drop-shadow filter
        borderRadius: "50%",
        boxShadow: "0 18px 30px rgba(0,0,0,.6)",
        transform: zoom ? "scale(1.18) translateZ(0)" : "scale(1) translateZ(0)",
        transition: "transform .7s cubic-bezier(.2,.8,.2,1)",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    />
  );
}

export default memo(Wheel);
