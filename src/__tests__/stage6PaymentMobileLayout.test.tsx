/**
 * Regression: mobile Payment/Upgrade page must be scrollable, apply iOS
 * safe-area insets, and expose a visible Back control.
 *
 * The page (Stage6Payment) is used at `/upgrade` as a standalone route with
 * no shared layout, so the fix must live on the component itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../pages/onboarding/stages/Stage6Payment.tsx'),
  'utf8',
);

describe('Stage6Payment mobile layout guardrails', () => {
  it('uses min-h-dvh (dynamic viewport) not a fixed 100vh height', () => {
    expect(SRC).toMatch(/min-h-dvh/);
    // Guard: the shell must not lock the whole viewport to a rigid height.
    expect(SRC).not.toMatch(/h-screen(?!-)/);
    expect(SRC).not.toMatch(/height:\s*100vh/);
  });

  it('enables vertical scrolling and never disables overflow at the shell', () => {
    expect(SRC).toMatch(/overflow-y-auto/);
    // The shell wrapper itself must not set overflow-hidden — that would trap
    // the user on tall content.
    const shellMatch = SRC.match(/data-testid="payment-page-shell"[\s\S]*?>/);
    expect(shellMatch, 'payment-page-shell root not found').toBeTruthy();
    expect(shellMatch![0]).not.toMatch(/overflow-hidden/);
  });

  it('applies iOS safe-area insets to top and bottom of the shell', () => {
    expect(SRC).toMatch(/env\(safe-area-inset-top/);
    expect(SRC).toMatch(/env\(safe-area-inset-bottom/);
  });

  it('renders a visible, labelled Back control with a history-aware fallback', () => {
    expect(SRC).toMatch(/data-testid="payment-back-button"/);
    expect(SRC).toMatch(/aria-label="Back"/);
    // Fallback destination when there is no history to pop back to.
    expect(SRC).toMatch(/navigate\('\/executive-home'/);
    expect(SRC).toMatch(/window\.history\.length/);
  });

  it('wraps every render path in the shared PaymentPageShell', () => {
    // One shell definition + at least one usage per render branch (main,
    // best-plan, checkout-processing, checkout-fallback, access-pending).
    const openings = SRC.match(/<PaymentPageShell/g) ?? [];
    expect(openings.length).toBeGreaterThanOrEqual(5);
  });
});
