import { useMemo } from "react";
import { Check, Clock3, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { collapseDuplicateEvents, periodFor } from "@/utils/rules/calendarEvents";

export interface CalendarReplacementEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  provider?: string | null;
  attendeesCount?: number | null;
  isOrganizer?: boolean | null;
  isRecurring?: boolean | null;
  /** Optional hint from the edge function. Falls back to local computation. */
  dayBucket?: 'today' | 'tomorrow';
  period?: 'morning' | 'afternoon' | 'evening';
}

interface CalendarReplacementPickerInlineProps {
  slotTitle: string;
  slotNumber: number;
  events: CalendarReplacementEvent[];
  selectedIds: string[];
  onToggleEvent: (eventId: string) => void;
  onApply: () => void;
  onClose: () => void;
  isLoading?: boolean;
  error?: string | null;
}

type EventGroup = { label: 'Today' | 'Tomorrow'; items: CalendarReplacementEvent[] };

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function localDayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function groupTodayTomorrow(events: CalendarReplacementEvent[]): EventGroup[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayKey = localDayKey(today);
  const tomorrowKey = localDayKey(tomorrow);
  const nowMs = today.getTime();
  const todayItems: CalendarReplacementEvent[] = [];
  const tomorrowItems: CalendarReplacementEvent[] = [];
  for (const event of events) {
    let bucket: 'today' | 'tomorrow' | null = event.dayBucket ?? null;
    if (!bucket) {
      const key = localDayKey(new Date(event.startTime));
      if (key === todayKey) bucket = 'today';
      else if (key === tomorrowKey) bucket = 'tomorrow';
    }
    if (bucket === 'today') {
      // Only show events still ahead of (or currently running through) "now".
      const endMs = new Date(event.endTime).getTime();
      if (Number.isFinite(endMs) && endMs > nowMs) todayItems.push(event);
    } else if (bucket === 'tomorrow') {
      tomorrowItems.push(event);
    }
  }
  const groups: EventGroup[] = [];
  if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
  if (tomorrowItems.length) groups.push({ label: 'Tomorrow', items: tomorrowItems });
  return groups;
}

const PERIOD_LABEL: Record<'morning' | 'afternoon' | 'evening', string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const CalendarReplacementPickerInline = ({
  slotTitle,
  slotNumber,
  events,
  selectedIds,
  onToggleEvent,
  onApply,
  onClose,
  isLoading = false,
  error = null,
}: CalendarReplacementPickerInlineProps) => {
  // Same event across calendars => keep one row (shared rule).
  const dedupedEvents = useMemo(() => collapseDuplicateEvents(events), [events]);
  const groupedEvents = useMemo(() => groupTodayTomorrow(dedupedEvents), [dedupedEvents]);
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
            Today &amp; tomorrow · pick 1 event to replace this priority
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

          <div className="flex items-center justify-end gap-2">
            <p className="text-[11px] text-muted-foreground">{selectedCount === 1 ? '1 selected' : 'None selected'}</p>
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
              No calendar events found for today or tomorrow.
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
                      const toggleDisabled = false;
                      const start = new Date(event.startTime);
                      const end = new Date(event.endTime);
                      const period = event.period ?? periodFor(start);

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
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>{TIME_FORMAT.format(start)} – {TIME_FORMAT.format(end)}</span>
                                <span className="inline-flex items-center rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80">
                                  {PERIOD_LABEL[period]}
                                </span>
                              </div>
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
              disabled={selectedCount !== 1 || isLoading}
              className="text-xs bg-taupe hover:bg-taupe-rich text-taupe-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </Button>
          </div>
      </div>
    </div>
  );
};

export default CalendarReplacementPickerInline;
