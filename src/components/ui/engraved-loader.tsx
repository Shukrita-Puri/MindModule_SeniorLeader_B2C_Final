/**
 * EngravedLoader — hand-drawn pencil/woodcut style loading indicator.
 * Aligns with the app's "Active Calm" B&W engraving visual language.
 * Use while the Brief or Plan is still being computed so the user knows
 * the system is working and they don't need to act.
 */
import { cn } from "@/lib/utils";

interface EngravedLoaderProps {
  /** Optional message under the bar. Defaults to "Loading…". */
  label?: string;
  /** Tighter vertical spacing for inline use inside cards. */
  compact?: boolean;
  className?: string;
}

const EngravedLoader = ({
  label = "Loading…",
  compact = false,
  className,
}: EngravedLoaderProps) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-foreground/75",
        compact ? "py-4" : "py-8",
        className
      )}
    >
      <svg
        viewBox="0 0 180 56"
        width="160"
        height="50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="select-none"
        aria-hidden="true"
      >
        <defs>
          {/* Diagonal hatch pattern — mimics engraving fill */}
          <pattern
            id="engraved-hatch"
            patternUnits="userSpaceOnUse"
            width="5"
            height="5"
            patternTransform="rotate(-45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </pattern>

          {/* Mask that grows left→right to "fill" the bar progressively */}
          <mask id="engraved-fill-mask">
            <rect x="0" y="0" width="180" height="56" fill="black" />
            <rect
              x="6"
              y="10"
              width="0"
              height="22"
              rx="2"
              fill="white"
            >
              <animate
                attributeName="width"
                values="0;156;156"
                keyTimes="0;0.85;1"
                dur="1.8s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="1;1;0"
                keyTimes="0;0.95;1"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </rect>
          </mask>
        </defs>

        {/* Outer hand-drawn bar — slight imperfections via two offset strokes */}
        <g
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M5 10 L167 9 L168 32 L6 33 Z" />
          <path
            d="M7 11 L165 10.5 L166 31 L8 31.5"
            opacity="0.45"
          />
        </g>

        {/* Engraved hatched fill, masked to grow */}
        <g mask="url(#engraved-fill-mask)" className="text-foreground/85">
          <rect
            x="6"
            y="10"
            width="162"
            height="22"
            fill="url(#engraved-hatch)"
          />
        </g>
      </svg>

      <p
        className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground/70"
        style={{ fontFamily: "Georgia, serif", letterSpacing: "0.22em" }}
      >
        {label}
      </p>
    </div>
  );
};

export default EngravedLoader;