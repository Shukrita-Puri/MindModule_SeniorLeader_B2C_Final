/**
 * PriorityTagAffordance — inline "+ ADD TAG" affordance for a single priority.
 *
 * Three groups inside the popover:
 *  - Importance: high / medium / low (single-select)
 *  - Relationship: boss / colleague / junior / vendor / client / customer / board / leadership / team (single-select)
 *  - Custom tag: free-text input (multi-select via repeated entries)
 *
 * Selected values render as small dismissible pills next to the "+" trigger.
 * Parent owns persistence — this component is pure UI + onChange callback.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ImportanceTag = 'high' | 'medium' | 'low' | null;
export type RelationshipTag =
  | 'boss'
  | 'colleague'
  | 'junior'
  | 'vendor'
  | 'client'
  | 'customer'
  | 'board'
  | 'leadership'
  | 'team'
  | null;

export interface PriorityTagState {
  priorityTag: ImportanceTag;
  relationshipTag: RelationshipTag;
  customTags: string[];
}

const IMPORTANCE_OPTIONS: { value: NonNullable<ImportanceTag>; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const RELATIONSHIP_OPTIONS: { value: NonNullable<RelationshipTag>; label: string }[] = [
  { value: 'boss', label: 'Boss' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'junior', label: 'Junior' },
  { value: 'client', label: 'Client' },
  { value: 'customer', label: 'Customer' },
  { value: 'board', label: 'Board' },
  { value: 'leadership', label: 'Leadership' },
  { value: 'team', label: 'Team' },
  { value: 'vendor', label: 'Vendor' },
];

interface Props {
  value: PriorityTagState;
  onChange: (next: PriorityTagState) => void;
  /** Use compact light-on-dark styling (cancelled-card variant). */
  muted?: boolean;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PriorityTagAffordance = ({ value, onChange, muted = false }: Props) => {
  const [open, setOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const setImportance = (v: ImportanceTag) =>
    onChange({ ...value, priorityTag: value.priorityTag === v ? null : v });
  const setRelationship = (v: RelationshipTag) =>
    onChange({ ...value, relationshipTag: value.relationshipTag === v ? null : v });
  const addCustom = () => {
    const t = customDraft.trim();
    if (!t) return;
    if ((value.customTags || []).includes(t)) {
      setCustomDraft('');
      return;
    }
    onChange({ ...value, customTags: [...(value.customTags || []), t].slice(0, 5) });
    setCustomDraft('');
  };
  const removeCustom = (t: string) =>
    onChange({ ...value, customTags: (value.customTags || []).filter((x) => x !== t) });

  const selectedPills: { label: string; onRemove: () => void; tone: string }[] = [];
  if (value.priorityTag) {
    selectedPills.push({
      label: `${titleCase(value.priorityTag)}`,
      onRemove: () => setImportance(null),
      tone: 'bg-saffron/15 text-saffron border-saffron/30',
    });
  }
  if (value.relationshipTag) {
    selectedPills.push({
      label: titleCase(value.relationshipTag),
      onRemove: () => setRelationship(null),
      tone: muted
        ? 'bg-white/10 text-white/80 border-white/20'
        : 'bg-muted/40 text-foreground/80 border-border',
    });
  }
  for (const t of value.customTags || []) {
    selectedPills.push({
      label: t,
      onRemove: () => removeCustom(t),
      tone: muted
        ? 'bg-white/10 text-white/80 border-white/20'
        : 'bg-muted/40 text-foreground/80 border-border',
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedPills.map((p) => (
        <span
          key={p.label}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em]',
            p.tone,
          )}
        >
          {p.label}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onRemove();
            }}
            className="opacity-70 hover:opacity-100"
            aria-label={`Remove ${p.label} tag`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] transition-colors',
              muted
                ? 'border-white/20 text-white/70 hover:bg-white/10'
                : 'border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
            )}
            aria-label="Add tag"
          >
            <Plus size={10} />
            Add tag
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-3 space-y-3"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Importance</p>
            <div className="flex flex-wrap gap-1.5">
              {IMPORTANCE_OPTIONS.map(({ value: v, label }) => {
                const active = value.priorityTag === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setImportance(v)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                      active
                        ? 'border-saffron bg-saffron/15 text-saffron'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Relationship</p>
            <div className="flex flex-wrap gap-1.5">
              {RELATIONSHIP_OPTIONS.map(({ value: v, label }) => {
                const active = value.relationshipTag === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRelationship(v)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                      active
                        ? 'border-foreground bg-foreground/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Add your own tag</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="e.g. prep, follow-up…"
                maxLength={24}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/40"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customDraft.trim()}
                className="rounded-md border border-border bg-foreground text-background px-2 py-1 text-[11px] font-medium disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PriorityTagAffordance;