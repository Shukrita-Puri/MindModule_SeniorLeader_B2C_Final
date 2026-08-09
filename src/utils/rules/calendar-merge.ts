export type CalendarProviderName = 'apple' | 'google' | 'microsoft' | string;

export interface MergeAttendee {
  displayName?: string | null;
  email?: string | null;
  responseStatus?: string | null;
  isOrganizer?: boolean | null;
  isSelf?: boolean | null;
}

export interface MergeOrganizer {
  displayName?: string | null;
  email?: string | null;
  isSelf?: boolean | null;
}

export interface CalendarMergeInput {
  id?: string | null;
  external_id?: string | null;
  title?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  start_time?: string | Date | null;
  end_time?: string | Date | null;
  provider?: CalendarProviderName | null;
  source?: CalendarProviderName | null;
  sourceCalendar?: string | null;
  source_calendar?: string | null;
  sourceCalendarId?: string | null;
  calendar_id?: string | null;
  attendeesCount?: number | null;
  attendees_count?: number | null;
  isOrganizer?: boolean | null;
  is_organizer?: boolean | null;
  isRecurring?: boolean | null;
  is_recurring?: boolean | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  updatedAt?: string | Date | null;
  updated_at?: string | Date | null;
  status?: string | null;
  event_metadata?: Record<string, unknown> | null;
  eventMetadata?: Record<string, unknown> | null;
  organizer?: MergeOrganizer | null;
  attendees?: MergeAttendee[] | null;
  location?: string | null;
  description?: string | null;
  body?: string | null;
  conferenceUrl?: string | null;
  meetingUrl?: string | null;
  onlineMeetingUrl?: string | null;
  webLink?: string | null;
  [key: string]: unknown;
}

export interface MergedCalendarAttendee {
  displayName: string | null;
  email: string | null;
  responseStatus: string | null;
  isOrganizer: boolean;
  isSelf: boolean;
}

export interface MergedCalendarOrganizer {
  displayName: string | null;
  email: string | null;
  isSelf: boolean;
}

export interface MergedCalendarEvent extends CalendarMergeInput {
  id: string;
  canonicalEventId: string;
  mergedEventId: string;
  identityKey: string;
  mergedFromCount: number;
  sourceCalendars: string[];
  providerEventIds: Record<string, string[]>;
  rawEventIds: string[];
  attendees: MergedCalendarAttendee[];
  organizer: MergedCalendarOrganizer | null;
  attendeesCount: number | null;
  isOrganizer: boolean | null;
  isRecurring: boolean | null;
  status: string | null;
  statusUpdatedAt: string | null;
  location: string | null;
  description: string | null;
  conferenceUrl: string | null;
  eventMetadata: Record<string, unknown> | null;
  isBusyBlock: boolean;
  isSoftHold: boolean;
  isSuppressedMirror: boolean;
}

const PLATFORM_PROVIDER_PRECEDENCE: Record<'ios' | 'web' | 'unknown', string[]> = {
  ios: ['apple', 'google', 'microsoft'],
  web: ['google', 'microsoft', 'apple'],
  unknown: ['apple', 'google', 'microsoft'],
};

const BUSY_TITLE_RX = /^(busy|occupied|blocked|hold|placeholder|tentative|no meetings?|do not book|dnb|buffer)$/i;
const PROVIDER_NOISE_RX = /^(accepted|tentative|declined|fwd?|fw)\s*[:\-]\s*/i;
const TRAILING_TZ_RX = /\s*(?:\(|\[)?(?:gmt[+-]?\d{0,2}|utc|bst|cet|cest|est|edt|pst|pdt|ist|jst)(?:\)|\])?\s*$/i;

function toMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  const ms = new Date(v as string).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

function lower(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : '';
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function stripBracketNoise(s: string): string {
  return s
    .replace(/\[(external|ext|calendar|invite|meeting)\]/gi, ' ')
    .replace(/\((external|ext|calendar|invite|meeting)\)/gi, ' ');
}

export function normalizeForClassify(title: string | null | undefined): string {
  let out = (title || '').toLowerCase().trim();
  if (!out) return '';
  out = out
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(PROVIDER_NOISE_RX, '')
    .replace(/^\s*\[external\]\s*/i, '')
    .replace(/^\s*[\[(]?(accepted|tentative|declined)[\])]?[:\-]\s*/i, '')
    .replace(/^\s*(re|fwd?|fw)\s*[:\-]\s*/i, '')
    .replace(TRAILING_TZ_RX, '')
    .replace(/\s*[-–—]\s*(?:gmt[+-]?\d{0,2}|utc|bst|cet|cest|est|edt|pst|pdt|ist|jst)\s*$/i, '')
    .replace(/[.,:;!?'"`~_\\/|]+/g, ' ')
    .replace(/[\(\)\[\]{}<>]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ');
  out = stripBracketNoise(out);
  return normalizeWhitespace(out);
}

/**
 * Write-time identity key for cross-provider dedupe.
 *
 * Conservative EXACT-match key intended for the sync insert path:
 *   normalizedTitle | roundedStartMinute | durationMinutes
 *
 * NOT a replacement for mergeCalendarEvents() at read time. The read-side
 * merger applies fuzzy ±5min / ±10min tolerance, attendee-overlap gates and
 * status resolution; this key intentionally omits those so it can be
 * computed once per row at insert with no cross-row context.
 *
 * Returns null when we can't build a stable key (missing title / bad times),
 * in which case callers should leave identity_key NULL rather than fall back
 * to a lossy value that could collide across unrelated events.
 */
export function computeIdentityKey(input: CalendarMergeInput): string | null {
  const title = normalizeForClassify(input.title as string | null | undefined);
  if (!title) return null;
  const startMs = toMs(input.startTime ?? input.start_time);
  const endMs = toMs(input.endTime ?? input.end_time);
  if (startMs == null || endMs == null) return null;
  const startMinute = Math.round(startMs / 60000);
  const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  return `${title}|${startMinute}|${durationMinutes}`;
}

function isBusyTitle(title: string | null | undefined): boolean {
  const t = normalizeForClassify(title);
  if (!t) return true;
  return BUSY_TITLE_RX.test(t) || /\bbusy\b/.test(t) || /\bout of office\b/.test(t);
}

function providerRank(provider: string | null | undefined, platform: 'ios' | 'web' | 'unknown'): number {
  const list = PLATFORM_PROVIDER_PRECEDENCE[platform];
  const idx = list.indexOf(lower(provider));
  return idx === -1 ? 99 : idx;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function normalizedProvider(raw: CalendarMergeInput): string | null {
  return str(raw.provider) ?? str(raw.source) ?? null;
}

function readEventMetadata(raw: CalendarMergeInput): Record<string, unknown> | null {
  const meta = (raw.event_metadata ?? raw.eventMetadata) as Record<string, unknown> | null | undefined;
  return meta && typeof meta === 'object' ? meta : null;
}

function extractAttendeeEmail(attendee: MergeAttendee | string | null | undefined): string | null {
  if (!attendee) return null;
  if (typeof attendee === 'string') {
    const trimmed = attendee.trim().toLowerCase();
    return trimmed.includes('@') ? trimmed.replace(/^mailto:/, '') : null;
  }
  const email = str(attendee.email);
  return email ? email.toLowerCase().replace(/^mailto:/, '') : null;
}

function attendeeKey(attendee: MergeAttendee | string | null | undefined): string | null {
  if (!attendee) return null;
  if (typeof attendee === 'string') {
    return normalizeForClassify(attendee) || attendee.toLowerCase().trim();
  }
  return (
    extractAttendeeEmail(attendee) ??
    normalizeForClassify(attendee.displayName) ??
    null
  );
}

function readAttendees(raw: CalendarMergeInput): MergedCalendarAttendee[] {
  const meta = readEventMetadata(raw);
  const attendeeSignals = Array.isArray((meta as any)?.attendeeSignals?.attendees)
    ? ((meta as any).attendeeSignals.attendees as Array<Record<string, unknown>>)
    : [];
  const sourceAttendees = Array.isArray(raw.attendees) ? raw.attendees : [];
  const combined = [...sourceAttendees, ...attendeeSignals];
  const out = new Map<string, MergedCalendarAttendee>();
  for (const attendee of combined) {
    const email = extractAttendeeEmail(attendee as MergeAttendee);
    const displayName = typeof attendee === 'string'
      ? normalizeForClassify(attendee) || (attendee as string).trim()
      : pickFirstString((attendee as MergeAttendee).displayName, email);
    const responseStatus = typeof attendee === 'string'
      ? null
      : str((attendee as MergeAttendee).responseStatus) ?? null;
    const isOrganizer = typeof attendee === 'string'
      ? false
      : (attendee as MergeAttendee).isOrganizer === true;
    const isSelf = typeof attendee === 'string'
      ? false
      : (attendee as MergeAttendee).isSelf === true;
    const key = attendeeKey(attendee as MergeAttendee);
    if (!key) continue;
    const existing = out.get(key);
    if (existing) {
      existing.responseStatus = existing.responseStatus ?? responseStatus;
      existing.isOrganizer = existing.isOrganizer || isOrganizer;
      existing.isSelf = existing.isSelf || isSelf;
      existing.displayName = existing.displayName ?? displayName ?? null;
      existing.email = existing.email ?? email;
      continue;
    }
    out.set(key, {
      displayName: displayName ?? null,
      email,
      responseStatus,
      isOrganizer,
      isSelf,
    });
  }
  return Array.from(out.values());
}

function readOrganizer(raw: CalendarMergeInput): MergedCalendarOrganizer | null {
  const organizer = raw.organizer;
  const meta = readEventMetadata(raw);
  const org = (meta as any)?.organizer ?? (meta as any)?.attendeeSignals?.organizer ?? null;
  const displayName = pickFirstString(
    organizer?.displayName,
    org?.displayName,
    org?.name,
    org?.emailAddress?.name,
  );
  const email = pickFirstString(
    organizer?.email,
    org?.email,
    org?.emailAddress?.address,
  );
  const isSelf = organizer?.isSelf === true || org?.self === true || org?.isCurrentUser === true;
  if (!displayName && !email && !isSelf) return null;
  return {
    displayName,
    email,
    isSelf,
  };
}

function readStatusCandidates(raw: CalendarMergeInput): Array<{ status: string; updatedAtMs: number | null; source: string }> {
  const meta = readEventMetadata(raw);
  const candidates = [
    raw.status,
    (meta as any)?.status,
    (meta as any)?.eventStatus,
    (meta as any)?.showAs,
    (meta as any)?.responseStatus,
  ];
  const attendeeStatuses = Array.isArray((meta as any)?.attendeeSignals?.attendees)
    ? ((meta as any).attendeeSignals.attendees as Array<Record<string, unknown>>)
        .map((attendee) => str(attendee.responseStatus))
        .filter((status): status is string => Boolean(status))
    : [];
  const updatedAt = toMs(raw.updatedAt ?? raw.updated_at ?? (meta as any)?.updatedAt ?? (meta as any)?.lastModified);
  return [...candidates, ...attendeeStatuses]
    .map((status, i) => {
      const s = lower(status);
      if (!s) return null;
      return { status: s, updatedAtMs: updatedAt, source: `candidate_${i}` };
    })
    .filter((v): v is { status: string; updatedAtMs: number | null; source: string } => v != null);
}

function statusRank(status: string): number {
  switch (status) {
    case 'cancelled':
    case 'canceled':
      return 4;
    case 'declined':
      return 3;
    case 'tentative':
      return 2;
    case 'busy':
      return 2;
    case 'confirmed':
      return 1;
    default:
      return 0;
  }
}

function resolveStatus(rows: CalendarMergeInput[]): { status: string | null; suppressed: boolean; statusUpdatedAt: string | null } {
  const statuses = rows.flatMap((row) => readStatusCandidates(row));
  if (!statuses.length) return { status: null, suppressed: false, statusUpdatedAt: null };

  statuses.sort((a, b) => {
    const aMs = a.updatedAtMs ?? 0;
    const bMs = b.updatedAtMs ?? 0;
    if (bMs !== aMs) return bMs - aMs;
    return statusRank(b.status) - statusRank(a.status);
  });

  const top = statuses[0];
  const suppressed = ['cancelled', 'canceled', 'declined'].includes(top.status);
  return {
    status: top.status,
    suppressed,
    statusUpdatedAt: top.updatedAtMs ? new Date(top.updatedAtMs).toISOString() : null,
  };
}

function attendeeKeys(row: CalendarMergeInput): Set<string> {
  const keys = new Set<string>();
  for (const attendee of readAttendees(row)) {
    const key = attendee.email ?? attendee.displayName;
    if (key) keys.add(normalizeForClassify(key) || key.toLowerCase().trim());
  }
  const organizer = readOrganizer(row);
  const orgKey = organizer?.email ?? organizer?.displayName;
  if (orgKey) keys.add(normalizeForClassify(orgKey) || orgKey.toLowerCase().trim());
  return keys;
}

function hasPeopleSignals(row: CalendarMergeInput): boolean {
  const attendees = readAttendees(row);
  return attendees.length > 0 || readOrganizer(row) != null || (row.attendeesCount ?? row.attendees_count ?? 0) > 0;
}

function looksGenericBusy(row: CalendarMergeInput): boolean {
  return isBusyTitle(row.title);
}

function startMsFor(row: CalendarMergeInput): number | null {
  return toMs(row.startTime ?? row.start_time);
}

function endMsFor(row: CalendarMergeInput): number | null {
  return toMs(row.endTime ?? row.end_time);
}

function durationMinutes(row: CalendarMergeInput): number | null {
  const start = startMsFor(row);
  const end = endMsFor(row);
  if (start == null || end == null) return null;
  return Math.max(0, (end - start) / 60000);
}

function providerSourceKey(row: CalendarMergeInput): string | null {
  return normalizedProvider(row) ?? str(row.sourceCalendar) ?? str(row.source_calendar) ?? str(row.calendar_id) ?? str(row.sourceCalendarId) ?? null;
}

function providerEventIdFor(row: CalendarMergeInput): string | null {
  return str(row.external_id) ?? str(row.id) ?? null;
}

function rawEventIdFor(row: CalendarMergeInput): string | null {
  return str(row.id) ?? str(row.external_id) ?? null;
}

function mergeMetadata(rows: CalendarMergeInput[]): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};
  let saw = false;
  for (const row of rows) {
    const meta = readEventMetadata(row);
    if (!meta) continue;
    saw = true;
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined && value !== null && merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }
  return saw ? merged : null;
}

interface CanonicalGroup {
  rows: CalendarMergeInput[];
  representative: CalendarMergeInput;
  normalizedTitle: string;
  startMs: number;
  durationMin: number;
  peopleKeys: Set<string>;
}

/**
 * Travel-title clustering.
 *
 * Providers (and iOS in particular) mirror the same flight under drifting
 * titles — "Flight: BA 183 from LHR to JFK", "Flight to JFK (BA 183)",
 * "Flight to New York (BA 183)". Exact normalized-title equality splits those
 * into three "meetings". We anchor on the flight/train code when present, and
 * otherwise allow high token overlap for travel-shaped titles only. Non-travel
 * titles keep the strict exact-match rule: a false merge is worse than a
 * false split.
 */
const TRAVEL_TITLE_RX =
  /\b(flight|flights|fly|flying|depart|departure|departing|arrive|arrival|arriving|train|eurostar|ferry|transfer)\b/;

const TRANSPORT_CODE_RX = /\b([a-z]{2}[a-z0-9]?)\s?(\d{1,4})\b/g;

const TITLE_STOPWORDS = new Set([
  'to', 'from', 'the', 'a', 'an', 'and', 'with', 'at', 'on', 'for', 'of', 'in', 'via', 'my',
]);

function isTravelTitle(title: string): boolean {
  return TRAVEL_TITLE_RX.test(title);
}

function transportCodes(title: string): Set<string> {
  const out = new Set<string>();
  if (!isTravelTitle(title)) return out;
  for (const match of title.matchAll(TRANSPORT_CODE_RX)) {
    const carrier = match[1];
    if (/^\d/.test(carrier)) continue;
    out.add(`${carrier}${match[2]}`);
  }
  return out;
}

function contentTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const token of title.split(' ')) {
    if (!token || token.length < 2) continue;
    if (TITLE_STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return out;
}

function titleOverlap(a: string, b: string): number {
  const left = contentTokens(a);
  const right = contentTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

export function titlesMatch(rowTitle: string, groupTitle: string): boolean {
  if (rowTitle === groupTitle) return true;

  const rowCodes = transportCodes(rowTitle);
  const groupCodes = transportCodes(groupTitle);
  if (rowCodes.size > 0 && groupCodes.size > 0) {
    for (const code of rowCodes) if (groupCodes.has(code)) return true;
    // Both sides name a transport code and they disagree: distinct journeys.
    return false;
  }

  if (!isTravelTitle(rowTitle) || !isTravelTitle(groupTitle)) return false;
  return titleOverlap(rowTitle, groupTitle) >= 0.6;
}

function canMergeIntoGroup(row: CalendarMergeInput, group: CanonicalGroup): boolean {
  const rowTitle = normalizeForClassify(row.title);
  if (!rowTitle) return false;
  if (!titlesMatch(rowTitle, group.normalizedTitle)) return false;

  const start = startMsFor(row);
  const duration = durationMinutes(row);
  if (start == null || duration == null) return false;

  const startDiff = Math.abs(start - group.startMs);
  const durationDiff = Math.abs(duration - group.durationMin);
  if (startDiff > 5 * 60 * 1000) return false;
  if (durationDiff > 10) return false;

  const rowBusy = looksGenericBusy(row);
  const groupBusy = looksGenericBusy(group.representative);
  if (rowBusy !== groupBusy && (rowBusy || groupBusy)) {
    return false;
  }

  const rowPeople = attendeeKeys(row);
  const groupPeople = group.peopleKeys;
  if (rowPeople.size > 0 && groupPeople.size > 0) {
    let overlap = false;
    for (const key of rowPeople) {
      if (groupPeople.has(key)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      // False merge is worse than false split.
      return false;
    }
  }

  return true;
}

function chooseRepresentative(rows: CalendarMergeInput[], platform: 'ios' | 'web' | 'unknown'): CalendarMergeInput {
  const ranked = [...rows].sort((a, b) => {
    const aScore =
      (a.isOrganizer ?? a.is_organizer ? 10 : 0) +
      ((a.attendeesCount ?? a.attendees_count ?? 0) > 0 ? 4 : 0) +
      ((readEventMetadata(a) ? Object.keys(readEventMetadata(a)!).length : 0) / 10) +
      (looksGenericBusy(a) ? -8 : 0) +
      (providerRank(providerSourceKey(a), platform) === 0 ? 1 : 0);
    const bScore =
      (b.isOrganizer ?? b.is_organizer ? 10 : 0) +
      ((b.attendeesCount ?? b.attendees_count ?? 0) > 0 ? 4 : 0) +
      ((readEventMetadata(b) ? Object.keys(readEventMetadata(b)!).length : 0) / 10) +
      (looksGenericBusy(b) ? -8 : 0) +
      (providerRank(providerSourceKey(b), platform) === 0 ? 1 : 0);
    if (bScore !== aScore) return bScore - aScore;
    const bCreated = toMs(b.createdAt ?? b.created_at) ?? 0;
    const aCreated = toMs(a.createdAt ?? a.created_at) ?? 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return providerRank(providerSourceKey(a), platform) - providerRank(providerSourceKey(b), platform);
  });
  return ranked[0];
}

function buildCanonicalEvent(group: CanonicalGroup, platform: 'ios' | 'web' | 'unknown'): MergedCalendarEvent {
  const rows = group.rows;
  const representative = chooseRepresentative(rows, platform);
  const start = Math.min(...rows.map((row) => startMsFor(row) ?? group.startMs));
  const end = Math.max(...rows.map((row) => endMsFor(row) ?? (start + group.durationMin * 60000)));
  const allAttendees = new Map<string, MergedCalendarAttendee>();
  for (const row of rows) {
    for (const attendee of readAttendees(row)) {
      const key = normalizeForClassify(attendee.email ?? attendee.displayName) || attendee.email || attendee.displayName || '';
      if (!key) continue;
      const existing = allAttendees.get(key);
      if (existing) {
        existing.responseStatus = existing.responseStatus ?? attendee.responseStatus;
        existing.isOrganizer = existing.isOrganizer || attendee.isOrganizer;
        existing.isSelf = existing.isSelf || attendee.isSelf;
        continue;
      }
      allAttendees.set(key, { ...attendee });
    }
  }

  const mergedMeta = mergeMetadata(rows);
  const statusResolution = resolveStatus(rows);
  const sourceCalendars = Array.from(new Set(rows.map((row) => providerSourceKey(row)).filter((v): v is string => Boolean(v))));
  const providerEventIds: Record<string, string[]> = {};
  const rawEventIds = Array.from(new Set(rows.map((row) => rawEventIdFor(row)).filter((v): v is string => Boolean(v))));

  for (const row of rows) {
    const provider = providerSourceKey(row) ?? 'unknown';
    const eventId = providerEventIdFor(row);
    if (!eventId) continue;
    const bucket = providerEventIds[provider] ?? [];
    if (!bucket.includes(eventId)) bucket.push(eventId);
    providerEventIds[provider] = bucket;
  }

  const identityKey = `${group.normalizedTitle}|${Math.round(group.startMs / 300000) * 300000}|${Math.round(group.durationMin / 10)}`;
  const organizer = readOrganizer(representative) ?? readOrganizer(rows.find((row) => readOrganizer(row) != null) ?? representative);
  const chosenLocation = pickFirstString(
    representative.location,
    ...rows.map((row) => row.location).filter((v): v is string => Boolean(v)),
    ...(rows.map((row) => (readEventMetadata(row) as any)?.location).filter(Boolean) as string[]),
  );
  const chosenDescription = pickFirstString(
    representative.description,
    representative.body,
    ...rows.map((row) => row.description),
    ...rows.map((row) => row.body),
    ...(rows.map((row) => (readEventMetadata(row) as any)?.description).filter(Boolean) as string[]),
  );
  const conferenceUrl = pickFirstString(
    representative.conferenceUrl,
    representative.meetingUrl,
    representative.onlineMeetingUrl,
    representative.webLink,
    ...rows.map((row) => row.conferenceUrl),
    ...rows.map((row) => row.meetingUrl),
    ...rows.map((row) => row.onlineMeetingUrl),
    ...rows.map((row) => row.webLink),
  );

  const merged: MergedCalendarEvent = {
    ...representative,
    id: `canonical:${identityKey}`,
    canonicalEventId: `canonical:${identityKey}`,
    mergedEventId: `canonical:${identityKey}`,
    identityKey,
    mergedFromCount: rows.length,
    sourceCalendars,
    providerEventIds,
    rawEventIds,
    attendees: Array.from(allAttendees.values()),
    organizer: organizer ?? null,
    attendeesCount: Array.from(allAttendees.values()).length || null,
    isOrganizer: rows.some((row) => row.isOrganizer === true || row.is_organizer === true),
    isRecurring: rows.some((row) => row.isRecurring === true || row.is_recurring === true),
    status: statusResolution.status,
    statusUpdatedAt: statusResolution.statusUpdatedAt,
    location: chosenLocation,
    description: chosenDescription,
    conferenceUrl,
    eventMetadata: mergedMeta,
    isBusyBlock: looksGenericBusy(representative),
    isSoftHold: looksGenericBusy(representative) && rows.length === 1,
    isSuppressedMirror: statusResolution.suppressed,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
  };

  return merged;
}

function mergeClusters(events: CalendarMergeInput[], platform: 'ios' | 'web' | 'unknown'): MergedCalendarEvent[] {
  const clusters: CanonicalGroup[] = [];
  for (const row of events) {
    const start = startMsFor(row);
    const end = endMsFor(row);
    if (start == null || end == null) continue;
    const title = normalizeForClassify(row.title);
    if (!title) continue;
    const prepared: CanonicalGroup = {
      rows: [row],
      representative: row,
      normalizedTitle: title,
      startMs: start,
      durationMin: Math.max(0, (end - start) / 60000),
      peopleKeys: attendeeKeys(row),
    };

    let merged = false;
    for (const cluster of clusters) {
      if (!canMergeIntoGroup(row, cluster)) continue;
      cluster.rows.push(row);
      const clusterStart = Math.min(cluster.startMs, start);
      const clusterEnd = Math.max(
        cluster.rows.reduce((max, current) => Math.max(max, endMsFor(current) ?? end), end),
        end,
      );
      cluster.startMs = clusterStart;
      cluster.durationMin = Math.max(cluster.durationMin, Math.round((clusterEnd - clusterStart) / 60000));
      for (const key of attendeeKeys(row)) cluster.peopleKeys.add(key);
      cluster.representative = chooseRepresentative(cluster.rows, platform);
      merged = true;
      break;
    }
    if (!merged) clusters.push(prepared);
  }

  const mergedEvents = clusters.map((cluster) => buildCanonicalEvent(cluster, platform));

  // Busy mirrors are suppressed when a titled canonical event already exists
  // on the same slot. Standalone Busy blocks remain as soft holds.
  const titledEvents = mergedEvents.filter((event) => !looksGenericBusy(event));
  return mergedEvents.filter((event) => {
    if (!event.isBusyBlock) return true;
    if (titledEvents.length === 0) return true;
    const start = new Date(event.startTime).getTime();
    const end = new Date(event.endTime).getTime();
    const overlaps = titledEvents.some((other) => {
      const otherStart = new Date(other.startTime).getTime();
      const otherEnd = new Date(other.endTime).getTime();
      return start < otherEnd && otherStart < end;
    });
    return !overlaps;
  }).map((event) => {
    if (event.isBusyBlock) {
      return { ...event, isSoftHold: true };
    }
    return event;
  });
}

/**
 * Merge multiple provider/calendar copies of the same real-world event into a
 * single canonical row. This is the only upstream dedupe entry point.
 */
export function mergeCalendarEvents<T extends CalendarMergeInput>(
  events: T[],
  platform: 'ios' | 'web' | 'unknown' = 'web',
): Array<T & MergedCalendarEvent> {
  if (!Array.isArray(events) || events.length === 0) return [];
  const prepared = events
    .filter((event) => event && (event.startTime ?? event.start_time) && (event.endTime ?? event.end_time))
    .map((event) => {
      const merged = {
        ...event,
        startTime: event.startTime ?? event.start_time,
        endTime: event.endTime ?? event.end_time,
        provider: normalizedProvider(event),
        isOrganizer: event.isOrganizer ?? event.is_organizer ?? null,
        isRecurring: event.isRecurring ?? event.is_recurring ?? null,
        attendeesCount: event.attendeesCount ?? event.attendees_count ?? null,
      } satisfies CalendarMergeInput;
      return merged;
    });

  const merged = mergeClusters(prepared, platform);
  return merged
    .filter((event) => !event.isSuppressedMirror)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((event) => event as T & MergedCalendarEvent);
}
