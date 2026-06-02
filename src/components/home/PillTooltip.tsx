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

  // Merge: associate each qualifier with a matching contributor by key/substring.
  const qualMap = new Map<string, string>(qualifiers.map(([d, s]) => [d.toLowerCase(), s]));
  const usedQuals = new Set<string>();
  const rows: Array<{ k: string; v?: string; pattern?: string }> = contributors.map(([k, v]) => {
    const kl = k.toLowerCase();
    let pattern: string | undefined;
    if (qualMap.has(kl)) { pattern = qualMap.get(kl); usedQuals.add(kl); }
    else {
      for (const [dim] of qualMap) {
        if (dim && (kl.includes(dim) || dim.includes(kl))) {
          pattern = qualMap.get(dim); usedQuals.add(dim); break;
        }
      }
    }
    return { k, v: String(v), pattern };
  });
  // Append orphan qualifiers as their own rows so no pattern data is lost.
  for (const [dim, summary] of qualifiers) {
    if (!usedQuals.has(dim.toLowerCase())) rows.push({ k: dim, pattern: summary });
  }
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
      {rows.length > 0 && (
        <div className="border-t border-border/40 pt-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70 mb-1.5">
            Contributors
          </div>
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.k} className="text-[15px] leading-snug text-foreground/85 font-body">
                <span className="text-muted-foreground">{row.k}</span>
                {row.v != null && <>: <span>{row.v}</span></>}
                {row.pattern && (
                  <span className="ml-1.5 text-[13px] italic text-muted-foreground/70 font-body">
                    ({row.pattern})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}