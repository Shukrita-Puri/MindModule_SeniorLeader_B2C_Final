const fs = require('fs');
const path = './supabase/functions/generate-mastery-plan/index.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/practice\.title/g, '(practice as any).title');
content = content.replace(/practice\.duration/g, '(practice as any).duration');
content = content.replace(/practice\.thumbnail_url/g, '(practice as any).thumbnail_url');
content = content.replace(/practice\.content_type/g, '(practice as any).content_type');

const returnBlock = `  const periodLabels: Record<string, string> = {
    morning: "Morning Practice",
    afternoon: "Afternoon Reset",
    evening: "Evening Close",
  };

  return {
    timeOfDayPlan: {
      label: periodLabels[timeOfDay],
      period: timeOfDay,
      modules: [],
      coachCard: null,
      totalDuration: 0,
      progressTracked: true,
      planBrief: planBrief || undefined,
    },
    calendarPills,
    preEventPlan: null,
    jitPriority: false,
    horizonModules: finalHorizonModules,
    ledger: ledgerMeta,
    promptVersion: BRIEF_PROMPT_VERSION,
    meta: {`;

content = content.replace(/  const periodLabels: Record<string, string> = \{\n    morning: "Morning Practice",\n    afternoon: "Afternoon Reset",\n    evening: "Evening Close",\n  \};\n\n  return \{\n    timeOfDayPlan: \{\n      label: periodLabels\[timeOfDay\],\n      period: timeOfDay,\n      modules: \[\],\n      coachCard: null,\n      totalDuration: 0,\n      progressTracked: true,\n      planBrief: planBrief \|\| undefined,\n    \},\n    calendarPills,\n    preEventPlan: null,\n    jitPriority: false,\n    horizonModules: finalHorizonModules,\n    ledger: ledgerMeta,\n    promptVersion: BRIEF_PROMPT_VERSION,\n    meta: \{/g, returnBlock);

fs.writeFileSync(path, content);
console.log('Fixed errors successfully');
