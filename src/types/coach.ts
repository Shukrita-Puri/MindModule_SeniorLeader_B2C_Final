export interface EntryContext {
  entryPoint: 'jit' | 'tod_plan' | 'check_in' | 'direct' | 'nudge' | 'insights' | 'practice_complete' | 'compass' | 'reset_studio';
  lastAction: string | null;
  triggeredBy: string | null;
}
