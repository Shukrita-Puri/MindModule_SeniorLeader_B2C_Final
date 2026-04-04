import { cn } from '@/lib/utils';

interface CoachOrbProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Dynamic animated orb for the Mind Performance Coach.
 * Swirling engraved lines converge to a still dark centre —
 * the coach as the calm at the centre of complexity.
 * Slow, meditative rotation inspired by "active calm" positioning.
 */
const CoachOrb = ({ size = 'lg', className }: CoachOrbProps) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-14 h-14',
    lg: 'w-32 h-32 md:w-40 md:h-40',
  };

  const strokeWidth = size === 'sm' ? 0.8 : size === 'md' ? 0.6 : 0.4;

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      {/* Outer glow */}
      <div className="absolute inset-[-12%] rounded-full blur-xl" style={{
        background: 'radial-gradient(circle, hsla(30, 10%, 50%, 0.15) 0%, transparent 70%)',
      }} />

      {/* Main orb container */}
      <div className="relative w-full h-full rounded-full overflow-hidden">
        {/* Dark centre — the still point */}
        <div className="absolute inset-0 bg-gradient-radial from-stone-950 via-stone-900/95 to-stone-800/80 z-10" />

        {/* Swirling engraved line layers — each rotates at different speeds */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full z-20 animate-[spin_45s_linear_infinite]"
          style={{ opacity: 0.35 }}
        >
          {/* Spiral engraved lines converging to centre */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 15) * (Math.PI / 180);
            const r1 = 95;
            const r2 = 12;
            const cx = 100;
            const cy = 100;
            const x1 = cx + r1 * Math.cos(angle);
            const y1 = cy + r1 * Math.sin(angle);
            const x2 = cx + r2 * Math.cos(angle + 0.8);
            const y2 = cy + r2 * Math.sin(angle + 0.8);
            // Control points for the curve
            const cpx = cx + (r1 * 0.5) * Math.cos(angle + 0.4);
            const cpy = cy + (r1 * 0.5) * Math.sin(angle + 0.4);

            return (
              <path
                key={`line-a-${i}`}
                d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
                fill="none"
                stroke="hsl(30, 10%, 65%)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Second layer — counter-rotating, finer lines */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full z-20 animate-[spin_60s_linear_infinite_reverse]"
          style={{ opacity: 0.25 }}
        >
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10) * (Math.PI / 180);
            const r1 = 90;
            const r2 = 18;
            const cx = 100;
            const cy = 100;
            const x1 = cx + r1 * Math.cos(angle);
            const y1 = cy + r1 * Math.sin(angle);
            const x2 = cx + r2 * Math.cos(angle - 0.6);
            const y2 = cy + r2 * Math.sin(angle - 0.6);
            const cpx = cx + (r1 * 0.55) * Math.cos(angle - 0.25);
            const cpy = cy + (r1 * 0.55) * Math.sin(angle - 0.25);

            return (
              <path
                key={`line-b-${i}`}
                d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
                fill="none"
                stroke="hsl(30, 15%, 55%)"
                strokeWidth={strokeWidth * 0.7}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Third layer — slowest, densest engraving arcs */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full z-20 animate-[spin_90s_linear_infinite]"
          style={{ opacity: 0.18 }}
        >
          {Array.from({ length: 48 }).map((_, i) => {
            const angle = (i * 7.5) * (Math.PI / 180);
            const r1 = 85;
            const r2 = 25;
            const cx = 100;
            const cy = 100;
            const x1 = cx + r1 * Math.cos(angle);
            const y1 = cy + r1 * Math.sin(angle);
            const x2 = cx + r2 * Math.cos(angle + 1.2);
            const y2 = cy + r2 * Math.sin(angle + 1.2);
            const cpx = cx + (r1 * 0.45) * Math.cos(angle + 0.6);
            const cpy = cy + (r1 * 0.45) * Math.sin(angle + 0.6);

            return (
              <path
                key={`line-c-${i}`}
                d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
                fill="none"
                stroke="hsl(25, 20%, 50%)"
                strokeWidth={strokeWidth * 0.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Concentric engraved rings */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full z-20"
          style={{ opacity: 0.12 }}
        >
          {[75, 60, 45, 30].map((r) => (
            <circle
              key={`ring-${r}`}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="hsl(30, 8%, 60%)"
              strokeWidth={strokeWidth * 0.4}
            />
          ))}
        </svg>

        {/* Centre void — deep darkness, the still point */}
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="w-[18%] h-[18%] rounded-full bg-stone-950 shadow-[0_0_20px_8px_rgba(12,10,9,0.8)]" />
        </div>

        {/* Subtle warm edge highlight */}
        <div className="absolute inset-0 z-30 rounded-full" style={{
          background: 'radial-gradient(circle at 35% 30%, hsla(30, 60%, 70%, 0.08) 0%, transparent 50%)',
        }} />

        {/* Glass rim */}
        <div className="absolute inset-0 z-30 rounded-full border border-stone-600/20" />
      </div>

      {/* Pulsing ambient aura — very slow breathing */}
      <div
        className="absolute inset-[-6%] rounded-full border border-stone-500/10 animate-[pulse_6s_ease-in-out_infinite]"
        style={{ opacity: 0.4 }}
      />
    </div>
  );
};

export default CoachOrb;
