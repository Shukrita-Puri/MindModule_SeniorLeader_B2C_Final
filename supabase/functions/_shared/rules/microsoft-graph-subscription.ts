/**
 * Pure builders for Microsoft Graph webhook subscriptions on
 * `me/events`. Kept side-effect free so they can be unit-tested
 * without touching Microsoft Graph or the database.
 *
 * Lifecycle mirrored from the Google watch-channel pattern
 * (register-calendar-watch + calendar-webhook), but adapted to
 * Graph's own quirks:
 *
 *   1. Subscription creation is a POST to /subscriptions.
 *   2. Graph performs a synchronous validation handshake against
 *      the notificationUrl BEFORE the POST completes — the endpoint
 *      must echo the `validationToken` query param as text/plain
 *      within 10 seconds.
 *   3. Subscriptions on `me/events` may live at most ~4230 minutes
 *      (~70h). We cap ours at 4200 minutes to leave slack.
 *   4. Renewal is a PATCH to /subscriptions/{id} with a fresh
 *      expirationDateTime — the subscription id stays stable.
 *   5. Delete is DELETE /subscriptions/{id}.
 */

/** Maximum lifetime Graph accepts for `me/events`. */
export const MS_GRAPH_SUB_MAX_MINUTES = 4200; // ~70h, under the 4230 hard cap

/** Renew if a subscription expires within this window. */
export const MS_GRAPH_RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MicrosoftSubscriptionCreatePayload {
  changeType: string;
  notificationUrl: string;
  resource: 'me/events';
  expirationDateTime: string;
  clientState: string;
  lifecycleNotificationUrl?: string;
}

export interface MicrosoftSubscriptionRenewPayload {
  expirationDateTime: string;
}

export function computeSubscriptionExpiration(
  now: Date = new Date(),
  minutes: number = MS_GRAPH_SUB_MAX_MINUTES,
): string {
  const t = new Date(now.getTime() + minutes * 60_000);
  return t.toISOString();
}

export function buildMicrosoftSubscriptionCreatePayload(input: {
  notificationUrl: string;
  clientState: string;
  now?: Date;
  lifecycleNotificationUrl?: string;
}): MicrosoftSubscriptionCreatePayload {
  return {
    changeType: 'created,updated,deleted',
    notificationUrl: input.notificationUrl,
    resource: 'me/events',
    expirationDateTime: computeSubscriptionExpiration(input.now),
    clientState: input.clientState,
    ...(input.lifecycleNotificationUrl
      ? { lifecycleNotificationUrl: input.lifecycleNotificationUrl }
      : {}),
  };
}

export function buildMicrosoftSubscriptionRenewPayload(
  now: Date = new Date(),
): MicrosoftSubscriptionRenewPayload {
  return { expirationDateTime: computeSubscriptionExpiration(now) };
}

/**
 * Classify a Graph subscription API error. Kept separate from Google's
 * classifier so provider quirks (429/5xx retry, invalid clientState,
 * expired subscription 404) don't blur together.
 */
export type MicrosoftSubscriptionErrorKind =
  | 'auth_failed'      // 401 or true 403 permission failure → user reconnect
  | 'rate_limited'     // 429 / 503 / 504 → keep polling, retry later
  | 'not_found'        // 404 on renew → subscription gone, must re-create
  | 'other_error';     // anything else — surface but do NOT disconnect

export function classifyMicrosoftSubscriptionError(
  status: number,
): MicrosoftSubscriptionErrorKind {
  if (status === 401) return 'auth_failed';
  if (status === 403) return 'auth_failed';
  if (status === 404) return 'not_found';
  if (status === 429 || status === 503 || status === 504) return 'rate_limited';
  if (status >= 500) return 'rate_limited';
  return 'other_error';
}

/**
 * Extract the Graph validation token from a webhook request URL, if any.
 * Graph sends `?validationToken=<token>` as part of the handshake and
 * expects an HTTP 200 response with `Content-Type: text/plain` echoing
 * the token verbatim within 10 seconds.
 */
export function extractGraphValidationToken(url: string | URL): string | null {
  const u = typeof url === 'string' ? new URL(url) : url;
  return u.searchParams.get('validationToken');
}

export interface GraphNotification {
  subscriptionId: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
}

export interface GraphNotificationEnvelope {
  value: GraphNotification[];
}

/**
 * Parse a Graph notification POST body and return the array of
 * notifications. Returns [] on malformed input rather than throwing so
 * the webhook endpoint can still ack Graph and avoid retry storms.
 */
export function parseGraphNotificationEnvelope(body: unknown): GraphNotification[] {
  if (!body || typeof body !== 'object') return [];
  const value = (body as { value?: unknown }).value;
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is GraphNotification =>
      !!n && typeof n === 'object' && typeof (n as GraphNotification).subscriptionId === 'string',
    )
    .map((n) => ({
      subscriptionId: n.subscriptionId,
      clientState: typeof n.clientState === 'string' ? n.clientState : undefined,
      changeType: typeof n.changeType === 'string' ? n.changeType : undefined,
      resource: typeof n.resource === 'string' ? n.resource : undefined,
    }));
}
