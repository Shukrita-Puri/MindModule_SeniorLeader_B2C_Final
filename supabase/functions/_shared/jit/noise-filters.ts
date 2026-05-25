// JIT v2 noise filter. Extends the existing `isNoiseEvent` /
// `isEducationalTitle` gates with a personal/non-work lexicon. Aim of
// the app is to prepare the user for cognitive peak AT WORK — personal
// life events get zero weight and never enter the candidate list.

const PERSONAL_NOISE = [
  'walk dog', 'dog walk', 'walk the dog',
  'gym', 'workout', 'work out', ' run ', 'running', 'yoga class', 'pilates',
  'school run', 'school pickup', 'school drop', 'school drop-off', 'pickup kids', 'kids ',
  'dentist', 'doctor', 'gp appointment', 'optician', 'physio', 'therapy session',
  'haircut', 'salon', 'barber',
  'grocery', 'groceries', 'shopping', 'errand',
  'lunch with family', 'dinner with family', 'family dinner', 'family lunch',
  'birthday', 'anniversary', 'date night',
  'holiday', 'vacation', 'pto', 'time off',
  'personal', 'errands', 'laundry', 'cleaner', 'plumber', 'electrician',
];

/** Returns a reason string if the title is personal noise, else null. */
export function classifyPersonalNoise(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = ` ${title.toLowerCase()} `;
  for (const w of PERSONAL_NOISE) {
    if (t.includes(w)) return 'personal_noise';
  }
  return null;
}

/** True iff the title should be hard-excluded from JIT v2 selection. */
export function isPersonalNoise(title: string | null | undefined): boolean {
  return classifyPersonalNoise(title) !== null;
}