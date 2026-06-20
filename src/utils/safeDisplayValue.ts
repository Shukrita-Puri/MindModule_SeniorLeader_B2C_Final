/**
 * Shared safe display helpers — guarantees no object/JSON/[object Object]
 * ever leaks into the UI from dynamic backend payloads.
 */

const DISPLAY_KEYS = [
  'displayText',
  'valueText',
  'label',
  'title',
  'name',
  'summary',
  'description',
  'text',
  'copy',
  'status',
  'state',
  'reason',
  'trend',
  'direction',
] as const;

const UNSAFE_PATTERNS = [
  /\[object\s+\w+\]/i, // [object Object], [object Promise], ...
  /^undefined$/i,
  /^null$/i,
  /^NaN$/i,
];

export function isUnsafeObjectText(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (UNSAFE_PATTERNS.some((re) => re.test(trimmed))) return true;
  // Bare JSON-looking strings (object/array) shouldn't be shown to users.
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return true;
    } catch {
      /* not JSON — leave as-is */
    }
  }
  return false;
}

/**
 * Format any unknown backend value into a display-safe string.
 * Returns '' when the value cannot be safely surfaced.
 */
export function formatDisplayValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    return isUnsafeObjectText(t) ? '' : t;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const joined = value
      .map((v) => formatDisplayValue(v))
      .filter(Boolean)
      .join(' · ');
    return isUnsafeObjectText(joined) ? '' : joined;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of DISPLAY_KEYS) {
      const candidate = formatDisplayValue(obj[key]);
      if (candidate && !isUnsafeObjectText(candidate)) return candidate;
    }
    return '';
  }
  return '';
}

/**
 * Final-mile guard for JSX. Always pass user-facing dynamic backend values
 * through this helper to guarantee no `[object Object]` (or similar) ever
 * reaches the DOM. Returns '' (caller hides) when the value isn't safe.
 */
export function safeText(value: unknown): string {
  const out = formatDisplayValue(value);
  return isUnsafeObjectText(out) ? '' : out;
}