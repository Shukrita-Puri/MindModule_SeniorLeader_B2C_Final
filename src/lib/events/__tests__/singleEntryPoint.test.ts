// Architectural guard: exactly ONE A–H entry point.
//
// Every feature surface (Brief, Plan, JIT v2, Week Ahead, Smart Nudges,
// Insights, signal engine, frontend) must resolve categories through
// `_shared/events/resolve-event-category.ts` (or `enrich-event.ts`), so user overrides,
// learned tokens and persisted categories apply everywhere. Importing the
// keyword-only `classifyEvent` outside `_shared/events/` bypasses the
// learning loop and is a regression.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase/functions');
const EVENTS_DIR = join(FUNCTIONS_DIR, '_shared/events');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, acc);
    } else if (full.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = walk(FUNCTIONS_DIR).filter((f) => !f.startsWith(EVENTS_DIR));

describe('single A–H entry point', () => {
  it('the canonical resolver exists and re-exports the full struct', () => {
    const src = readFileSync(join(EVENTS_DIR, 'resolve-event.ts'), 'utf8');
    expect(src).toContain('export function resolveEvent');
    expect(src).toContain('enrichEvent(');
  });

  it('the legacy executive-state-taxonomy shim is deleted', () => {
    expect(existsSync(join(FUNCTIONS_DIR, '_shared/executive-state-taxonomy.ts'))).toBe(false);
  });

  it('nothing imports from executive-state-taxonomy', () => {
    const offenders = FILES.filter((f) =>
      /from\s+["'][^"']*executive-state-taxonomy\.ts["']/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('no surface imports the keyword-only classifyEvent directly', () => {
    const offenders = FILES.filter((f) => {
      const src = readFileSync(f, 'utf8');
      const importBlocks = src.match(
        /import\s*\{[^}]*\}\s*from\s*["'][^"']*event-classifier\.ts["']/g,
      ) ?? [];
      return importBlocks.some((b) => /\bclassifyEvent\b(?!Bucket)/.test(b));
    });
    expect(offenders).toEqual([]);
  });
});
