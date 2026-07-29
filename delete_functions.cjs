const fs = require('fs');
const path = './supabase/functions/generate-mastery-plan/index.ts';
let content = fs.readFileSync(path, 'utf8');

function removeFunction(name) {
  const regex = new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}\\n`, 'g');
  content = content.replace(regex, '');
}

removeFunction('buildSnapshotFallbackHorizonModules');
removeFunction('topUpHorizonModulesToThree');
removeFunction('determineAllocationPattern');
removeFunction('buildSequenceReasoning');
removeFunction('buildRecommendedAction');
removeFunction('buildHorizonModules');
removeFunction('buildSlotContext');

fs.writeFileSync(path, content);
console.log('Deleted functions successfully');
