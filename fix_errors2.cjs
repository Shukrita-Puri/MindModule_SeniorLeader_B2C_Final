const fs = require('fs');
const path = './supabase/functions/generate-mastery-plan/index.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/modules: todModules,/g, 'modules: [],');
content = content.replace(/coachCard: todCoachCard,/g, 'coachCard: null,');
content = content.replace(/totalDuration,/g, 'totalDuration: 0,');
content = content.replace(/jitPriority,/g, 'jitPriority: false,');

fs.writeFileSync(path, content);
console.log('Fixed errors successfully');
