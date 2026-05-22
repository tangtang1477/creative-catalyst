import { useEffect, useRef } from "react";

/**
 * Global cursor-following dot-grid background.
 * Mounted once at the app root; sits behind everything via z-0.
 * Window-level mouse listeners + lerp easing so movement feels alive.
 */
export function DotGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: -9999, y: -9999 });
  const cur = useRef({ x: -9999, y: -9999, intensity: 0, targetIntensity: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      cur.current.targetIntensity = 1;
    };
    const onLeave = () => {
      cur.current.targetIntensity = 0;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) onLeave();
    });

    // Parse accent (oklch / rgb / hex) once; fall back to #71F0F6.
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "113 240 246";
    // Try to read R G B from common patterns; default to known cyan.
    let accentRGB: [number, number, number] = [113, 240, 246];
    const rgbMatch = accent.match(/(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (rgbMatch) accentRGB = [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];

    const isDark = () =>
      !document.documentElement.classList.contains("light");

    const spacing = 14;
    const glowRadius = 120;
    let raf = 0;

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      if (cur.current.x === -9999) {
        cur.current.x = target.current.x;
        cur.current.y = target.current.y;
      } else {
        cur.current.x += (target.current.x - cur.current.x) * 0.18;
        cur.current.y += (target.current.y - cur.current.y) * 0.18;
      }
      cur.current.intensity += (cur.current.targetIntensity - cur.current.intensity) * 0.08;

      const mx = cur.current.x;
      const my = cur.current.y;
      const baseAlpha = isDark() ? 0.035 : 0.055;
      const baseRGB = isDark() ? "255,255,255" : "15,23,42";
      const i = cur.current.intensity;

      for (let y = 0; y < h + spacing; y += spacing) {
        for (let x = 0; x < w + spacing; x += spacing) {
          let opacity = baseAlpha;
          let radius = 0.7;
          let fill = `rgba(${baseRGB},${opacity})`;

          if (i > 0.01) {
            const dx = x - mx;
            const dy = y - my;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < glowRadius) {
              const t = (1 - dist / glowRadius) * i;
              const intensity = t * t;
              opacity = baseAlpha + intensity * 0.45;
              radius = 0.7 + intensity * 0.9;
              fill = `rgba(${accentRGB[0]},${accentRGB[1]},${accentRGB[2]},${opacity})`;
            }
          }

          ctx.beginPath();
          ctx.fillStyle = fill;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        maskImage:
          "radial-gradient(ellipse at center, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 95%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at center, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 95%)",
      }}
    />
  );
}
