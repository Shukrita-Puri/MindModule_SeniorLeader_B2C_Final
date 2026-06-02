/**
 * PillDetailContent — Signal Pills v3 inline detail panel.
 *
 * Lists raw contributors + bracketed qualifiers + a one-line "why this tier"
 * sentence for a single pill. Rendered inline inside the pill's expanded
 * glass box (no longer a HoverCard). Tier reasoning is read off the
 * server-built `signalPills` payload echoed by compute-outer-readiness.
 */

type PillTier = 'green' | 'amber' | 'red' | 'neutral';

export interface PillTooltipPill {
  key: 'decision_readiness' | 'physical_reserves' | 'resilience_capacity';
  label: string;
  tier: PillTier;
  tierLabel?: string;
  contributors?: Record<string, unknown>;
  qualifiers?: Record<string, unknown>;
}

const TIER_REASON: Record<PillTier, string> = {
  green: 'Today\u2019s signals sit at or above your baseline.',
  amber: 'One or more inputs are below baseline — proceed with awareness.',
  red: 'A primary signal breached its baseline — protect the day.',
  neutral: 'Not enough current-period data to call this pill.',
};

function fmtNum(n: unknown, suffix = ''): string | null {
  if (typeof n !== 'number' || Number.isNaN(n)) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}${suffix}`;
}

function flattenContributors(c: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!c) return [];
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(c)) {
    if (v == null) continue;
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      out.push([k, String(v)]);
    }
  }
  return out.slice(0, 6);
}

function flattenQualifiers(q: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!q) return [];
  const out: Array<[string, string]> = [];
  for (const [dim, val] of Object.entries(q)) {
    if (!val || typeof val !== 'object') continue;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (typeof v === 'number') {
        const suffix = k.toLowerCase().includes('pct') ? '%' : '';
        const s = fmtNum(v, suffix);
        if (s) parts.push(`${k}: ${s}`);
      }
    }
    if (parts.length) out.push([dim, parts.join(' \u00b7 ')]);
  }
  return out;
}

export default function PillDetailContent({
  pill,
}: {
  pill: PillTooltipPill | null | undefined;
}) {
  if (!pill) {
    return (
      <span className="text-xs text-muted-foreground/55 font-body italic">
        No signal detail yet
      </span>
    );
  }
  const contributors = flattenContributors(pill.contributors);
  const qualifiers = flattenQualifiers(pill.qualifiers);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 pr-7">
        <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-body">
          {pill.label}
        </span>
        {pill.tierLabel && (
          <span className="text-[11px] uppercase tracking-[0.08em] text-foreground/70 font-body">
            {pill.tierLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-foreground/80 font-body leading-snug">
        {TIER_REASON[pill.tier]}
      </p>
      {qualifiers.length > 0 && (
        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 mb-1">
            Qualifiers
          </div>
          <ul className="space-y-0.5">
            {qualifiers.map(([dim, summary]) => (
              <li key={dim} className="text-[11px] text-foreground/75 font-body">
                <span className="font-medium">{dim}</span>{' '}
                <span className="text-muted-foreground/80">{summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contributors.length > 0 && (
        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 mb-1">
            Contributors
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {contributors.map(([k, v]) => (
              <li key={k} className="text-[11px] text-foreground/70 font-body truncate">
                <span className="text-muted-foreground/70">{k}:</span> {v}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}