import { useMemo, useState } from "react";
import { Check, Clock3, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CalendarReplacementEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  provider?: string | null;
  attendeesCount?: number | null;
  isOrganizer?: boolean | null;
  isRecurring?: boolean | null;
}

interface CalendarReplacementPickerInlineProps {
  slotTitle: string;
  slotNumber: number;
  events: CalendarReplacementEvent[];
  selectedIds: string[];
  onToggleEvent: (eventId: string) => void;
  onApply: () => void;
  onClose: () => void;
  priorityTag: 'high' | 'medium' | 'low' | null;
  relationshipTag: 'boss' | 'colleague' | 'junior' | 'vendor' | 'client' | null;
  onPriorityTagChange: (tag: 'high' | 'medium' | 'low' | null) => void;
  onRelationshipTagChange: (tag: 'boss' | 'colleague' | 'junior' | 'vendor' | 'client' | null) => void;
  isLoading?: boolean;
  error?: string | null;
}

type GroupMode = 'day' | 'period';
type EventGroup = { label: string; items: CalendarReplacementEvent[] };

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function localDayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function groupByDay(events: CalendarReplacementEvent[]): EventGroup[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayKey = localDayKey(today);
  const tomorrowKey = localDayKey(tomorrow);
  const groups = new Map<string, CalendarReplacementEvent[]>();

  for (const event of events) {
    const start = new Date(event.startTime);
    const key = localDayKey(start);
    const label =
      key === todayKey
        ? "Today"
        : key === tomorrowKey
          ? "Tomorrow"
          : DAY_FORMAT.format(start);
    const bucket = groups.get(label) || [];
    bucket.push(event);
    groups.set(label, bucket);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function groupByPeriod(events: CalendarReplacementEvent[]): EventGroup[] {
  // Standard windows: Morning 05–12, Afternoon 12–18, Evening 18–05.
  const buckets: Record<'Morning' | 'Afternoon' | 'Evening', CalendarReplacementEvent[]> = {
    Morning: [],
    Afternoon: [],
    Evening: [],
  };
  for (const event of events) {
    const h = new Date(event.startTime).getHours();
    if (h >= 5 && h < 12) buckets.Morning.push(event);
    else if (h >= 12 && h < 18) buckets.Afternoon.push(event);
    else buckets.Evening.push(event);
  }
  return (['Morning', 'Afternoon', 'Evening'] as const)
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ label: k, items: buckets[k] }));
}

const CalendarReplacementPickerInline = ({
  slotTitle,
  slotNumber,
  events,
  selectedIds,
  onToggleEvent,
  onApply,
  onClose,
  priorityTag,
  relationshipTag,
  onPriorityTagChange,
  onRelationshipTagChange,
  isLoading = false,
  error = null,
}: CalendarReplacementPickerInlineProps) => {
  const [groupMode, setGroupMode] = useState<GroupMode>('day');
  // Dedupe by id so the same event never renders in two groups/cards.
  const dedupedEvents = useMemo(() => {
    const byId = new Map<string, CalendarReplacementEvent>();
    for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
    return Array.from(byId.values());
  }, [events]);
  const groupedEvents = useMemo(
    () => (groupMode === 'day' ? groupByDay(dedupedEvents) : groupByPeriod(dedupedEvents)),
    [dedupedEvents, groupMode],
  );
  const selectedCount = selectedIds.length;

  return (
    <div className="rounded-xl card-standard px-3 py-3">
      <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/40">
        <div className="space-y-0.5 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-body font-medium">
            Priority {slotNumber}
          </p>
          <h3 className="text-[15px] md:text-[16px] font-semibold leading-tight text-foreground">
            Pick replacement events
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-1">{slotTitle}</p>
          <p className="text-[11px] text-muted-foreground/80 font-body">
            Next 24 hours · up to 3 events
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/40 flex-shrink-0"
          aria-label="Close replacement picker"
        >
          <X size={16} />
        </button>
      </div>

      <div className="pt-3 space-y-3">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-foreground">
              {error}
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Priority tag</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ] as const).map(({ value, label }) => {
                  const active = priorityTag === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onPriorityTagChange(active ? null : value)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-medium border transition-all",
                        active
                          ? "border-taupe bg-taupe/15 text-taupe-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Relationship tag</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'boss', label: 'Boss' },
                  { value: 'colleague', label: 'Colleague' },
                  { value: 'junior', label: 'Junior' },
                  { value: 'vendor', label: 'Vendor' },
                  { value: 'client', label: 'Client' },
                ] as const).map(({ value, label }) => {
                  const active = relationshipTag === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onRelationshipTagChange(active ? null : value)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-medium border transition-all",
                        active
                          ? "border-taupe bg-taupe/15 text-taupe-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Grouping toggle — Day vs Period */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-border bg-background p-0.5">
              {([
                { value: 'day', label: 'By day' },
                { value: 'period', label: 'By period' },
              ] as const).map(({ value, label }) => {
                const active = groupMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGroupMode(value)}
                    className={cn(
                      "px-3 py-1 text-[11px] font-medium rounded-full transition-colors",
                      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{selectedCount}/3 selected</p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="rounded-xl border border-border bg-muted/30 px-3 py-3 animate-pulse"
                >
                  <div className="h-3 w-24 rounded bg-muted-foreground/15" />
                  <div className="mt-2 h-3 w-3/4 rounded bg-muted-foreground/15" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted-foreground/15" />
                </div>
              ))}
            </div>
          ) : groupedEvents.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              No calendar events found in the next 24 hours.
            </div>
          ) : (
            <div className="max-h-[44vh] overflow-y-auto pr-1 space-y-3">
              {groupedEvents.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <CalendarDays size={11} />
                    <span>{group.label}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((event) => {
                      const isSelected = selectedIds.includes(event.id);
                      const toggleDisabled = !isSelected && selectedCount >= 3;
                      const start = new Date(event.startTime);
                      const end = new Date(event.endTime);
                      const metaBits: string[] = [];
                      if (typeof event.attendeesCount === "number" && event.attendeesCount > 0) {
                        metaBits.push(`${event.attendeesCount} attendees`);
                      }
                      if (event.isRecurring) metaBits.push("recurring");

                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => !toggleDisabled && onToggleEvent(event.id)}
                          disabled={toggleDisabled}
                          className={cn(
                            "w-full rounded-xl border px-3 py-2 text-left transition-all",
                            isSelected
                              ? "border-taupe bg-taupe/10"
                              : "border-border bg-background hover:border-foreground/30 hover:bg-muted/30",
                            toggleDisabled && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={cn(
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                              isSelected ? "border-taupe bg-taupe text-white" : "border-border bg-background text-muted-foreground",
                            )}>
                              {isSelected ? <Check size={12} className="stroke-[3]" /> : <Clock3 size={12} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium leading-tight text-foreground">{event.title}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {TIME_FORMAT.format(start)} – {TIME_FORMAT.format(end)}
                                {metaBits.length > 0 ? ` · ${metaBits.join(' · ')}` : ''}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onApply}
              disabled={selectedCount === 0 || isLoading}
              className="text-xs bg-taupe hover:bg-taupe-rich text-taupe-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply ({selectedCount})
            </Button>
          </div>
      </div>
    </div>
  );
};

export default CalendarReplacementPickerInline;
