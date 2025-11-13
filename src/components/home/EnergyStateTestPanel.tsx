import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { buildUserContext } from '@/utils/llmContextBuilder';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { testScenarios, logTestScenario, logTestSummary } from '@/utils/energyStateTestScenarios';

const EnergyStateTestPanel = () => {
  const { user } = useAuth();
  const [testMode, setTestMode] = useState<'manual' | 'automated'>('manual');
  
  // Manual test controls
  const [checkInOutcome, setCheckInOutcome] = useState('scattered');
  const [hour, setHour] = useState(9);
  const [calendarDensity, setCalendarDensity] = useState(0);
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runManualTest = async () => {
    setIsLoading(true);
    try {
      // Store test check-in temporarily
      localStorage.setItem('dailyCheckIn', JSON.stringify({
        outcome: checkInOutcome,
        timestamp: new Date().toISOString(),
        note: 'Test scenario'
      }));

      // Override hour for testing
      const originalDate = Date;
      (global as any).Date = class extends Date {
        getHours() { return hour; }
      };

      const energyState = await computeEnergyState(user?.id);
      
      // Restore original Date
      (global as any).Date = originalDate;

      // Get LLM insight
      const userContext = await buildUserContext(energyState, user?.id);
      const { data } = await supabase.functions.invoke('generate-energy-insight', {
        body: userContext
      });

      setTestResult({
        energyState,
        insight: data?.insight || 'No insight generated',
        context: userContext
      });

      console.group('🧪 MANUAL TEST RESULT');
      console.log('Input:', { checkInOutcome, hour, calendarDensity });
      console.log('Energy State:', energyState);
      console.log('User Context:', userContext);
      console.log('LLM Insight:', data?.insight);
      console.groupEnd();

    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runAutomatedTests = async () => {
    setIsLoading(true);
    console.log('🚀 Starting automated test suite...');
    
    const results = [];
    
    for (const scenario of testScenarios) {
      // Store test check-in
      localStorage.setItem('dailyCheckIn', JSON.stringify({
        outcome: scenario.checkInOutcome,
        timestamp: new Date().toISOString(),
        note: `Test: ${scenario.name}`
      }));

      // Override hour
      const originalDate = Date;
      (global as any).Date = class extends Date {
        getHours() { return scenario.hour; }
      };

      // Simulate calendar density by storing mock calendar data
      if (scenario.calendarDensity > 0) {
        const mockEvents = Array.from({ length: scenario.calendarDensity }, (_, i) => ({
          id: `test-${i}`,
          start: new Date(Date.now() + (i * 30 * 60 * 1000)).toISOString(),
          title: `Test Meeting ${i + 1}`
        }));
        localStorage.setItem('calendarEvents', JSON.stringify({ upcomingEvents: mockEvents }));
      } else {
        localStorage.removeItem('calendarEvents');
      }

      const energyState = await computeEnergyState(user?.id);
      (global as any).Date = originalDate;

      // Get LLM insight
      const userContext = await buildUserContext(energyState, user?.id);
      const { data } = await supabase.functions.invoke('generate-energy-insight', {
        body: userContext
      });

      const result = logTestScenario(scenario, energyState, data?.insight || 'No insight');
      results.push(result);

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logTestSummary(results);
    
    setIsLoading(false);
    alert(`Test complete! Check console for results.\n${results.filter(r => r.passed).length}/${results.length} tests passed.`);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8 border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🧪 Energy State Test Panel
          <span className="text-sm font-normal text-muted-foreground">(Dev Tool)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Test Mode Selector */}
        <div className="flex gap-2">
          <Button
            variant={testMode === 'manual' ? 'default' : 'outline'}
            onClick={() => setTestMode('manual')}
            className="flex-1"
          >
            Manual Test
          </Button>
          <Button
            variant={testMode === 'automated' ? 'default' : 'outline'}
            onClick={() => setTestMode('automated')}
            className="flex-1"
          >
            Automated Suite
          </Button>
        </div>

        {testMode === 'manual' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in Outcome</Label>
                <Select value={checkInOutcome} onValueChange={setCheckInOutcome}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scattered">Scattered</SelectItem>
                    <SelectItem value="overwhelmed">Overwhelmed</SelectItem>
                    <SelectItem value="tired">Tired</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time of Day (Hour)</Label>
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={hour}
                  onChange={(e) => setHour(parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  9=morning, 15=afternoon, 21=evening
                </p>
              </div>

              <div className="space-y-2">
                <Label>Calendar Density</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={calendarDensity}
                  onChange={(e) => setCalendarDensity(parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Events in next 3 hours
                </p>
              </div>
            </div>

            <Button onClick={runManualTest} disabled={isLoading} className="w-full">
              {isLoading ? 'Testing...' : 'Run Test'}
            </Button>

            {testResult && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm"><strong>Priority:</strong> {testResult.energyState.recommendationPriority}</p>
                <p className="text-sm"><strong>Balance:</strong> {testResult.energyState.overallBalance}/100</p>
                <p className="text-sm"><strong>State:</strong> {testResult.energyState.state}</p>
                <p className="text-sm"><strong>Insight:</strong> {testResult.insight}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will run all {testScenarios.length} test scenarios and log results to the console.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {testScenarios.map((scenario, i) => (
                <li key={i}>✓ {scenario.name}</li>
              ))}
            </ul>
            <Button onClick={runAutomatedTests} disabled={isLoading} className="w-full">
              {isLoading ? 'Running Tests...' : `Run All ${testScenarios.length} Tests`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyStateTestPanel;
