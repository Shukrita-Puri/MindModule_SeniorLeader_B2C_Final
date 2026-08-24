import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHAPE_LABELS,
  SHAPE_TOOLTIPS,
  LAUNCH_READY_SHAPES,
  isLaunchReadyShape,
  shapeIdFromSnapshot,
  shapeQualifier,
} from '../loadShape';

const BACKEND_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/load-shape/types.ts'),
  'utf8',
);

function backendConfig(): Record<string, { label: string; tooltip: string; launchReady: boolean }> {
  const out: Record<string, { label: string; tooltip: string; launchReady: boolean }> = {};
  const re =
    /shapeId:\s*"([a-z_]+)",\s*\n\s*label:\s*"([^"]+)",\s*\n\s*tooltip:\s*\n?\s*"([^"]+)",[\s\S]*?launchReady:\s*(true|false)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(BACKEND_SRC)) !== null) {
    out[m[1]] = { label: m[2], tooltip: m[3], launchReady: m[4] === 'true' };
  }
  return out;
}

describe('Load Shape frontend mirror stays in sync with the backend SSOT', () => {
  const backend = backendConfig();

  it('parses all seven shapes from the backend config', () => {
    expect(Object.keys(backend).sort()).toEqual(Object.keys(SHAPE_LABELS).sort());
  });

  it('mirrors every label verbatim', () => {
    for (const [id, cfg] of Object.entries(backend)) {
      expect(SHAPE_LABELS[id as keyof typeof SHAPE_LABELS]).toBe(cfg.label);
    }
  });

  it('mirrors every tooltip verbatim', () => {
    for (const [id, cfg] of Object.entries(backend)) {
      expect(SHAPE_TOOLTIPS[id as keyof typeof SHAPE_TOOLTIPS]).toBe(cfg.tooltip);
    }
  });

  it('agrees on which shapes are launch-ready', () => {
    const backendLaunch = Object.entries(backend)
      .filter(([, c]) => c.launchReady)
      .map(([id]) => id)
      .sort();
    expect(backendLaunch).toEqual([...LAUNCH_READY_SHAPES].sort());
    expect(backendLaunch).toEqual(['back_to_back', 'switching']);
  });

  it('exposes copy only for launch-ready shapes', () => {
    expect(isLaunchReadyShape('back_to_back')).toBe(true);
    expect(shapeQualifier('switching')).toBe('mode-switching');
    expect(shapeQualifier('light')).toBeNull();
    expect(shapeQualifier('travel_adjacent')).toBeNull();
  });

  it('reads the snapshot column null-safely', () => {
    expect(shapeIdFromSnapshot(null)).toBeNull();
    expect(shapeIdFromSnapshot(undefined)).toBeNull();
    expect(shapeIdFromSnapshot({})).toBeNull();
    expect(shapeIdFromSnapshot({ shapeId: 'nope' })).toBeNull();
    expect(shapeIdFromSnapshot({ shapeId: 'switching' })).toBe('switching');
  });
});

describe('Load Shape single entry point', () => {
  const SHAPE_TYPES = ['LoadShape', 'ShapeId', 'DemandMode', 'EventSubcategory'];

  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
    }
    return acc;
  }

  const files = [
    ...walk(join(process.cwd(), 'supabase/functions')),
    ...walk(join(process.cwd(), 'src')),
  ];

  it('only _shared/load-shape defines or re-exports the shape primitives', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes('/_shared/load-shape/')) continue;
      if (file.endsWith('src/lib/loadShape.ts')) continue; // documented FE mirror
      if (file.endsWith('src/lib/__tests__/loadShape.test.ts')) continue;
      const src = readFileSync(file, 'utf8');
      for (const t of SHAPE_TYPES) {
        if (new RegExp(`(type|interface)\\s+${t}\\b`).test(src)) {
          offenders.push(`${file}: declares ${t}`);
        }
      }
      if (/(const|function)\s+CATEGORY_TO_MODE\b/.test(src)) {
        offenders.push(`${file}: declares CATEGORY_TO_MODE`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every backend import of the shape primitives resolves to load-shape/types.ts', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes('/_shared/load-shape/')) continue;
      const src = readFileSync(file, 'utf8');
      const re = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const named = m[1];
        const from = m[2];
        const usesShapeType = SHAPE_TYPES.some((t) =>
          new RegExp(`\\b${t}\\b`).test(named),
        ) || /\bCATEGORY_TO_MODE\b/.test(named);
        if (!usesShapeType) continue;
        const ok = /load-shape\/(types|modes)\.ts$/.test(from) || from === '@/lib/loadShape';
        if (!ok) offenders.push(`${file}: imports {${named.trim()}} from ${from}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
