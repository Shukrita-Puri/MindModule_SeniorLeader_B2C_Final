import { useMemo } from "react";
import { Check, Clock3, CalendarDays } from "lucide-react";
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

interface CalendarReplacementPickerModalProps {
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

type EventGroup = {
  label: string;
  items: CalendarReplacementEvent[];
};

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

function groupEvents(events: CalendarReplacementEvent[]): EventGroup[] {
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

const CalendarReplacementPickerModal = ({
  slotTitle,
  slotNumber,
  events,
  selectedIds,
  onToggleEvent,
  onApply,
  onClose,
  isLoading = false,
  error = null,
}: CalendarReplacementPickerModalProps) => {
  const groupedEvents = useMemo(() => groupEvents(events), [events]);
  const selectedCount = selectedIds.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-3xl border border-white/40 bg-white/15 backdrop-blur-md shadow-xl">
        <div className="px-5 pt-5 pb-3 space-y-1.5 border-b border-white/10">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/60 font-body font-medium">
            Priority {slotNumber}
          </p>
          <h2 className="text-[22px] md:text-[26px] font-headline tracking-tight text-white">
            Pick a replacement event
          </h2>
          <p className="text-sm text-white/70 line-clamp-2">{slotTitle}</p>
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50 font-body">
            Select up to 3 events from the next 24 hours
          </p>
        </div>

        <div className="px-5 py-4 max-h-[62vh] overflow-y-auto space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm text-white/85">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 animate-pulse"
                >
                  <div className="h-3 w-24 rounded bg-white/15" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-white/15" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-white/15" />
                </div>
              ))}
            </div>
          ) : groupedEvents.length === 0 ? (
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm text-white/70">
              No calendar events found in the next 24 hours.
            </div>
          ) : (
            groupedEvents.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/50">
                  <CalendarDays size={12} />
                  <span>{group.label}</span>
                </div>
                <div className="space-y-2">
                  {group.items.map((event) => {
                    const isSelected = selectedIds.includes(event.id);
                    const toggleDisabled = !isSelected && selectedCount >= 3;
                    const start = new Date(event.startTime);
                    const end = new Date(event.endTime);
                    const metaBits: string[] = [];
                    if (event.provider) metaBits.push(event.provider);
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
                          "w-full rounded-2xl border px-4 py-3 text-left transition-all",
                          isSelected
                            ? "border-taupe bg-taupe/18 text-white shadow-[0_0_0_3px_hsl(var(--taupe)/0.20)]"
                            : "border-white/15 bg-white/10 text-white/85 hover:border-white/30 hover:bg-white/14",
                          toggleDisabled && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
                            {isSelected ? <Check size={14} className="text-white" /> : <Clock3 size={14} className="text-white/70" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium leading-tight">{event.title}</p>
                                <p className="mt-1 text-[11px] text-white/55">
                                  {TIME_FORMAT.format(start)} - {TIME_FORMAT.format(end)}
                                </p>
                              </div>
                              {isSelected && (
                                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/80">
                                  Selected
                                </span>
                              )}
                            </div>
                            {metaBits.length > 0 && (
                              <p className="mt-2 text-[11px] text-white/55">
                                {metaBits.join(" • ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/60">
            {selectedCount}/3 active priorities selected
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-sm text-white/70 hover:text-white hover:bg-white/10"
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={onApply}
              disabled={selectedCount === 0 || isLoading}
              className="text-sm bg-taupe hover:bg-taupe-rich text-taupe-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Regenerate plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarReplacementPickerModal;
