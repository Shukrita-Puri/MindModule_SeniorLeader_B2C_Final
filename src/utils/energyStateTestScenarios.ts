/**
 * Energy State Test Scenarios
 * Use this to verify recommendation priority logic works correctly
 */

import type { CurrentEnergyState } from './energyStateEngine';

export interface TestScenario {
  name: string;
  checkInOutcome: string;
  balance: number;
  hour: number;
  calendarDensity: number;
  expectedPriority: string;
  expectedInsightKeywords: string[];
}

export const testScenarios: TestScenario[] = [
  // SCENARIO 1: Morning + Scattered (any calendar)
  {
    name: "Morning 9am + Scattered Focus",
    checkInOutcome: "scattered",
    balance: 50,
    hour: 9,
    calendarDensity: 0,
    expectedPriority: "center_focus",
    expectedInsightKeywords: ["scattered", "centering", "focus", "morning"]
  },
  
  // SCENARIO 2: Morning + Overwhelmed + Low Calendar
  {
    name: "Morning 9am + Overwhelmed + No Meetings",
    checkInOutcome: "overwhelmed",
    balance: 40,
    hour: 9,
    calendarDensity: 0,
    expectedPriority: "calm_cool",
    expectedInsightKeywords: ["overwhelmed", "calming", "grounding", "system"]
  },
  
  // SCENARIO 3: Morning + Tired + No Calendar (Pro User)
  {
    name: "Morning 9am + Tired + No Calendar (Pro)",
    checkInOutcome: "tired",
    balance: 35,
    hour: 9,
    calendarDensity: 0,
    expectedPriority: "restore",
    expectedInsightKeywords: ["tired", "low energy", "restoration", "morning"]
  },
  
  // SCENARIO 4: Morning + Tired + High Calendar (Super Pro)
  {
    name: "Morning 9am + Tired + 4 Meetings (Super Pro)",
    checkInOutcome: "tired",
    balance: 35,
    hour: 9,
    calendarDensity: 4,
    expectedPriority: "restore_energize",
    expectedInsightKeywords: ["tired", "meetings", "energizing", "calendar"]
  },
  
  // SCENARIO 5: Afternoon + Tired
  {
    name: "Afternoon 3pm + Tired",
    checkInOutcome: "tired",
    balance: 35,
    hour: 15,
    calendarDensity: 1,
    expectedPriority: "rest",
    expectedInsightKeywords: ["tired", "afternoon", "restoration", "dip"]
  },
  
  // SCENARIO 6: Evening + Ready (High Balance)
  {
    name: "Evening 9pm + Ready + High Balance",
    checkInOutcome: "ready",
    balance: 85,
    hour: 21,
    calendarDensity: 0,
    expectedPriority: "ground",
    expectedInsightKeywords: ["evening", "grounding", "transition", "consolidate"]
  },
  
  // SCENARIO 7: Evening + Scattered
  {
    name: "Evening 9pm + Scattered",
    checkInOutcome: "scattered",
    balance: 50,
    hour: 21,
    calendarDensity: 0,
    expectedPriority: "center_focus",
    expectedInsightKeywords: ["scattered", "centering", "evening"]
  },
  
  // SCENARIO 8: Afternoon + Overwhelmed + High Calendar
  {
    name: "Afternoon 3pm + Overwhelmed + 3 Meetings",
    checkInOutcome: "overwhelmed",
    balance: 40,
    hour: 15,
    calendarDensity: 3,
    expectedPriority: "calm_cool",
    expectedInsightKeywords: ["overwhelmed", "calming", "calendar", "meetings"]
  }
];

/**
 * Run test scenario and log results
 */
export function logTestScenario(scenario: TestScenario, actualState: CurrentEnergyState, actualInsight: string) {
  console.group(`🧪 TEST: ${scenario.name}`);
  console.log('📊 Input:', {
    checkInOutcome: scenario.checkInOutcome,
    balance: scenario.balance,
    hour: scenario.hour,
    calendarDensity: scenario.calendarDensity
  });
  console.log('🎯 Expected Priority:', scenario.expectedPriority);
  console.log('✅ Actual Priority:', actualState.recommendationPriority);
  console.log('🔍 Priority Match:', actualState.recommendationPriority === scenario.expectedPriority ? '✅ PASS' : '❌ FAIL');
  console.log('💬 LLM Insight:', actualInsight);
  
  const keywordMatches = scenario.expectedInsightKeywords.filter(keyword => 
    actualInsight.toLowerCase().includes(keyword.toLowerCase())
  );
  console.log('🔤 Keyword Matches:', `${keywordMatches.length}/${scenario.expectedInsightKeywords.length}`, keywordMatches);
  console.log('📝 Expected Keywords:', scenario.expectedInsightKeywords);
  console.groupEnd();
  
  return {
    passed: actualState.recommendationPriority === scenario.expectedPriority,
    keywordMatchRate: keywordMatches.length / scenario.expectedInsightKeywords.length,
    actualPriority: actualState.recommendationPriority,
    actualInsight
  };
}

/**
 * Summary of test results
 */
export function logTestSummary(results: Array<{ passed: boolean; keywordMatchRate: number }>) {
  const passCount = results.filter(r => r.passed).length;
  const avgKeywordMatch = results.reduce((sum, r) => sum + r.keywordMatchRate, 0) / results.length;
  
  console.group('📊 TEST SUMMARY');
  console.log(`Priority Logic: ${passCount}/${results.length} tests passed (${Math.round(passCount/results.length * 100)}%)`);
  console.log(`LLM Insight Keywords: ${Math.round(avgKeywordMatch * 100)}% average match rate`);
  console.log(passCount === results.length ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED');
  console.groupEnd();
}
