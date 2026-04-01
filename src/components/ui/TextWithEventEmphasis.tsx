import { Fragment } from 'react';

/**
 * Renders text with single-quoted segments as bold italic.
 * E.g. "You navigated 'Board Meeting' today" → "You navigated *Board Meeting* today"
 */
export function TextWithEventEmphasis({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  // Split on 'quoted text' patterns
  const parts = text.split(/('(?:[^']+)')/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (/^'([^']+)'$/.test(part)) {
          const inner = part.slice(1, -1);
          return <em key={i} className="font-semibold italic not-italic" style={{ fontStyle: 'italic' }}>{inner}</em>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
