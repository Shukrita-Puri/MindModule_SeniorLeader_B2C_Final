import { describe, it, expect } from 'vitest';
import {
  hasRenderableBriefCopy,
  hasRenderableBriefScore,
  isTrueAwaitingBrief,
} from '../DecisionReadinessBrief';

describe('Sprint A — Brief renderability helpers', () => {
  it('copy-only payload (phrase+body present, score null) is renderable copy', () => {
    const p = { phrase: 'Signal read', bodyText: 'Body text here', innerReadinessScore: null };
    expect(hasRenderableBriefCopy(p)).toBe(true);
    expect(hasRenderableBriefScore(p)).toBe(false);
    expect(isTrueAwaitingBrief(p)).toBe(false);
  });

  it('score-only payload (score present, no copy) is renderable score', () => {
    const p = { innerReadinessScore: 72, innerReadinessState: 'baseline' };
    expect(hasRenderableBriefCopy(p)).toBe(false);
    expect(hasRenderableBriefScore(p)).toBe(true);
    expect(isTrueAwaitingBrief(p)).toBe(false);
  });

  it('explicit awaiting state is true-awaiting even with a score', () => {
    const p = { innerReadinessScore: 60, innerReadinessState: 'awaiting' };
    expect(hasRenderableBriefScore(p)).toBe(false);
    expect(isTrueAwaitingBrief(p)).toBe(true);
  });

  it('cold-start briefMode is true-awaiting', () => {
    const p = { briefMode: 'cold-start', phrase: '', bodyText: '' };
    expect(isTrueAwaitingBrief(p)).toBe(true);
  });

  it('null payload is true-awaiting', () => {
    expect(isTrueAwaitingBrief(null)).toBe(true);
    expect(isTrueAwaitingBrief(undefined)).toBe(true);
  });

  it('empty phrase/body is not renderable copy', () => {
    expect(hasRenderableBriefCopy({ phrase: '   ', bodyText: 'x' })).toBe(false);
    expect(hasRenderableBriefCopy({ phrase: 'x', bodyText: '' })).toBe(false);
  });

  it('valid baseline payload (score+copy) is fully renderable, not awaiting', () => {
    const p = {
      phrase: 'Steady day',
      bodyText: 'Body content',
      innerReadinessScore: 70,
      innerReadinessState: 'baseline',
      briefMode: 'baseline',
    };
    expect(hasRenderableBriefCopy(p)).toBe(true);
    expect(hasRenderableBriefScore(p)).toBe(true);
    expect(isTrueAwaitingBrief(p)).toBe(false);
  });
});