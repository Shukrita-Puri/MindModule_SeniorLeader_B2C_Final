/**
 * Guard: the payment page and iOS paywall must never render USD fallback
 * pricing. GBP is the canonical base currency.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const PAYMENT_SOURCES = [
  'src/pages/onboarding/stages/Stage6Payment.tsx',
  'src/components/subscription/ApplePaywall.tsx',
];

describe('payment surfaces use GBP as canonical base currency', () => {
  it.each(PAYMENT_SOURCES)('%s contains no USD price literal', (file) => {
    const src = read(file);
    // Reject $-prefixed amounts (e.g. $29, $299.99)
    expect(/\$\d/.test(src)).toBe(false);
  });

  it('Stage6Payment price map uses the canonical GBP amounts', () => {
    const src = read('src/pages/onboarding/stages/Stage6Payment.tsx');
    expect(src).toContain("monthly: '£34.99'");
    expect(src).toContain("annualTotal: '£299.99'");
  });
});
