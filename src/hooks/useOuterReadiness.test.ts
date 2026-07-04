import { describe, expect, it } from 'vitest';
import { normalizeOuterReadinessPayload } from '@/hooks/useOuterReadiness';

describe('normalizeOuterReadinessPayload', () => {
  it('keeps Apple Health HRV/RHR data when sleep is missing', () => {
    const result = normalizeOuterReadinessPayload({
      phrase: 'Ready.',
      context: 'Context',
      leanOn: 'Lean',
      watchFor: 'Watch',
      driver: 'state',
      wearableStatus: {
        isConnected: true,
        hasTodayData: true,
        hasRecentData: true,
        metricsAvailable: { hrv: true, sleep: false, rhr: true },
        sourceRowDate: '2026-07-04',
        dataSource: 'apple-healthkit',
      },
      hrvValue: 42,
      rhrValue: 58,
      sleepDuration: undefined,
      sleepScore: undefined,
      signalPills: [{ key: 'decision_readiness', label: 'Decision', tier: 'green' }],
    });

    expect(result.wearableStatus?.isConnected).toBe(true);
    expect(result.wearableStatus?.metricsAvailable).toEqual({ hrv: true, sleep: false, rhr: true });
    expect(result.hrvValue).toBe(42);
    expect(result.rhrValue).toBe(58);
    expect(result.sleepDuration).toBeNull();
    expect(result.sleepScore).toBeNull();
    expect(result.signalPills).toHaveLength(1);
  });

  it('normalizes connected wearable with no usable today samples', () => {
    const result = normalizeOuterReadinessPayload({
      wearableStatus: {
        isConnected: true,
        hasTodayData: 'yes',
        hasRecentData: false,
        isStale: true,
        sourceRowDate: 'not-a-date',
      },
      integrationStatus: {
        wearable: {
          connectionStatus: 'connected_but_waiting_for_data',
          syncStatus: 'waiting_for_data',
          hasHistoricalData: true,
          lastSyncAt: 'bad',
          lastSampleAt: '2026-07-04T08:00:00.000Z',
        },
      },
    });

    expect(result.wearableStatus?.hasTodayData).toBe(false);
    expect(result.wearableStatus?.sourceRowDate).toBeNull();
    expect(result.integrationStatus?.wearable?.connectionStatus).toBe('connected_but_waiting_for_data');
    expect(result.integrationStatus?.wearable?.lastSyncAt).toBeNull();
    expect(result.integrationStatus?.wearable?.lastSampleAt).toBe('2026-07-04T08:00:00.000Z');
  });

  it('drops malformed pill payloads and invalid numeric fields safely', () => {
    const result = normalizeOuterReadinessPayload({
      signalPills: [
        { key: 'decision_readiness', label: 'Decision', tier: 'amber' },
        { key: 'bad', label: 'Broken', tier: 'green' },
        'oops',
      ],
      hrvValue: 'NaN',
      innerReadinessScore: '67',
      nextHighStakesEvent: { title: 'Board', minutesUntil: '45' },
    });

    expect(result.signalPills).toEqual([
      { key: 'decision_readiness', label: 'Decision', tier: 'amber', tierLabel: undefined, coldStartLabel: null, contributors: undefined, qualifiers: undefined },
    ]);
    expect(result.hrvValue).toBeNull();
    expect(result.innerReadinessScore).toBe(67);
    expect(result.nextHighStakesEvent).toEqual({ title: 'Board', minutesUntil: 45 });
  });

  it('handles Oura-like and disconnected payloads without crashing', () => {
    const oura = normalizeOuterReadinessPayload({
      wearableStatus: {
        isConnected: true,
        hasTodayData: false,
        hasRecentData: true,
        metricsAvailable: { sleep: true },
        sourceRowDate: '2026-07-03',
        dataSource: 'oura',
      },
      dataSources: ['wearable', 7, null],
    });
    const disconnected = normalizeOuterReadinessPayload(null);

    expect(oura.wearableStatus?.metricsAvailable).toEqual({ hrv: false, sleep: true, rhr: false });
    expect(oura.dataSources).toEqual(['wearable']);
    expect(disconnected.phrase).toBe('');
    expect(disconnected.dataSources).toEqual([]);
    expect(disconnected.wearableStatus).toBeUndefined();
  });
});
