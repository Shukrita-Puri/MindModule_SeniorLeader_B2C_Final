import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';
import { Download } from 'lucide-react';

const COLUMNS = [
  'index', 'id', 'title', 'description', 'location', 'start_time', 'end_time',
  'durationMinutes', 'is_recurring', 'recurring_event_id', 'attendees_count',
  'attendee_domains', 'legacy_category', 'legacy_subtype',
  'shukrita_correct_category', 'shukrita_correct_subtype',
  'shukrita_difficulty', 'shukrita_notes',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','));
  // BOM so Excel / Google Sheets read UTF-8 correctly.
  return '\uFEFF' + lines.join('\r\n');
}

const CalendarLabelingExport = () => {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-export-calendar-events`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { rows: Record<string, unknown>[]; count: number };
      if (!body.rows.length) {
        toast.info('No calendar events found for this user.');
        return;
      }
      const blob = new Blob([toCsv(body.rows)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calendar-events-for-labeling-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${body.count} events`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calendar labeling export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Downloads the latest 350 calendar events for shukrita@mindmodule.me as a CSV with blank
          columns for hand-labeling. Read-only.
        </p>
        <Button onClick={handleExport} disabled={busy}>
          <Download className="h-4 w-4 mr-2" aria-hidden />
          {busy ? 'Exporting…' : 'Export 300 Calendar Events for Labeling'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CalendarLabelingExport;
