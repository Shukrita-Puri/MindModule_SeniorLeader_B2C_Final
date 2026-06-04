/**
 * Shared time/date label helpers used by the Performance Readiness Brief
 * and the Today's Performance Priorities card so the eyebrow strings stay
 * identical.
 *
 * Perception-aware eyebrow (4 buckets). Server time windows stay on the
 * 3-bucket model (Morning 05–11 / Afternoon 12–17 / Evening 18–04:59).
 * The eyebrow uses a 4th "Early Hours" bucket between midnight and 05:00
 * so the post-midnight tail of Evening no longer reads as "Evening" when
 * the user perceives the day as already over.
 */
export const getTimeLabel = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  if (hour >= 18 && hour < 24) return 'Evening';
  return 'Early Hours';
};

export const getDateLabel = (): string => {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
};

/**
 * Plain-text markdown stripper — mirror of the server's stripBriefMarkdown
 * so client renderers never expose stray `*` / `**` characters when a
 * legacy cached payload bypassed the server sanitiser.
 */
export const stripBriefMarkdown = (input: string | null | undefined): string => {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s.,;:!?)]|$)/g, '$1$2');
  s = s.replace(/(^|[\s(])_(?!\s)([^_]+?)_(?=[\s.,;:!?)]|$)/g, '$1$2');
  s = s.replace(/(^|\s)\*+(\s)/g, '$1$2');
  s = s.replace(/(\s)\*+(\s|$)/g, '$1$2');
  s = s.replace(/\*+/g, '');
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\s+([.,;:!?])/g, '$1');
  return s.trim();
};