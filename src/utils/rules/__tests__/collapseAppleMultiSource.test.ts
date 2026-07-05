import { describe, it, expect } from 'vitest';
import { collapseAppleMultiSource } from '../apple-source-collapse';
import { computeIdentityKey, mergeCalendarEvents } from '../calendar-merge';

describe('collapseAppleMultiSource', () => {
  const start = '2026-06-21T00:00:00.000Z';
  const end = '2026-06-22T00:00:00.000Z';
  const identity_key = computeIdentityKey({ title: "Father's Day", start_time: start, end_time: end });

  it("collapses Apple multi-source mirrors of the same holiday down to one row", () => {
    // Reproduces the production case: 5 Apple rows for "Father's Day" from
    // 5 distinct Apple sourceUUIDs, all sharing one identity_key.
    const rows = [
      { external_id: '6095B462:20260621_a@google.com', identity_key, provider: 'apple' as const },
      { external_id: '1837FB1F:20260621_a@google.com', identity_key, provider: 'apple' as const },
      { external_id: '38092BCB:20260621_b@google.com', identity_key, provider: 'apple' as const },
      { external_id: '7F03A993:20260621_b@google.com', identity_key, provider: 'apple' as const },
      { external_id: '12B6D13D:20260621_a@google.com', identity_key, provider: 'apple' as const },
    ];
    const out = collapseAppleMultiSource(rows);
    expect(out).toHaveLength(1);
    expect(out[0].external_id).toBe('12B6D13D:20260621_a@google.com');
  });

  it('passes through rows whose identity_key is null', () => {
    const rows = [
      { external_id: 'src1:evt', identity_key: null, provider: 'apple' as const },
      { external_id: 'src2:evt', identity_key: null, provider: 'apple' as const },
    ];
    expect(collapseAppleMultiSource(rows)).toHaveLength(2);
  });

  it('leaves distinct identity_keys untouched (different events)', () => {
    const k1 = computeIdentityKey({ title: 'A', start_time: start, end_time: end });
    const k2 = computeIdentityKey({ title: 'B', start_time: start, end_time: end });
    const rows = [
      { external_id: 'srcX:1', identity_key: k1, provider: 'apple' as const },
      { external_id: 'srcY:2', identity_key: k2, provider: 'apple' as const },
    ];
    expect(collapseAppleMultiSource(rows)).toHaveLength(2);
  });

  it("preserves cross-provider mirror fusion — mergeCalendarEvents still fuses Apple + Google", () => {
    const collapsedApple = collapseAppleMultiSource([
      { external_id: 'appleSrcA:evt-x', identity_key, provider: 'apple' as const,
        title: "Father's Day", start_time: start, end_time: end },
      { external_id: 'appleSrcB:evt-x', identity_key, provider: 'apple' as const,
        title: "Father's Day", start_time: start, end_time: end },
    ]);
    const googleRow = { external_id: 'g-evt-x', identity_key, provider: 'google',
      title: "Father's Day", start_time: start, end_time: end };
    const merged = mergeCalendarEvents([...collapsedApple, googleRow] as any, 'web');
    expect(collapsedApple).toHaveLength(1);
    expect(merged).toHaveLength(1);
  });
});