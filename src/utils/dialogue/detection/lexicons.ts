// Dialogue Room - Shared Lexicons for Detection

export const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'wonderful', 'amazing', 'fantastic', 'love',
  'happy', 'glad', 'pleased', 'excited', 'thrilled', 'delighted', 'confident',
  'sure', 'certain', 'passionate', 'interested', 'curious', 'fascinated',
  'appreciate', 'grateful', 'thankful', 'enjoy', 'like', 'admire', 'respect',
  'agree', 'understand', 'clear', 'helpful', 'useful', 'valuable', 'important',
  'success', 'achieve', 'accomplish', 'proud', 'strong', 'capable', 'ready'
]);

export const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry', 'upset',
  'frustrated', 'annoyed', 'irritated', 'worried', 'anxious', 'nervous',
  'scared', 'afraid', 'fearful', 'sad', 'unhappy', 'disappointed', 'confused',
  'uncertain', 'unsure', 'doubt', 'struggle', 'difficult', 'hard', 'problem',
  'issue', 'concern', 'fail', 'wrong', 'mistake', 'error', 'stupid', 'dumb',
  'cant', "can't", 'unable', 'impossible', 'never', 'nothing', 'nobody'
]);

export const INTENSIFIERS = new Set([
  'very', 'really', 'extremely', 'incredibly', 'absolutely', 'totally',
  'completely', 'utterly', 'highly', 'deeply', 'strongly', 'particularly',
  'especially', 'definitely', 'certainly', 'surely', 'truly', 'genuinely'
]);

export const NEGATORS = new Set([
  'not', "n't", 'no', 'never', 'neither', 'nor', 'nothing', 'nobody',
  'nowhere', 'hardly', 'barely', 'scarcely', 'rarely', 'seldom'
]);

export const EMPATHY_INDICATORS = [
  'i understand', 'i see', 'i appreciate', 'that makes sense',
  'i can imagine', 'i hear you', 'from your perspective',
  'it sounds like', 'you must feel', 'i recognize'
];

export const SELF_REGULATION_INDICATORS = [
  'let me think', 'i need to consider', 'on reflection',
  'i should pause', 'taking a breath', 'let me rephrase',
  'actually', 'to be fair', 'on second thought'
];

export const PERSPECTIVE_TAKING_INDICATORS = [
  'from your point of view', 'in your position', 'if i were you',
  'considering your situation', 'looking at it from', 'another way to see',
  'i can see why', 'that perspective', 'your side'
];

export const DEFENSIVE_PATTERNS = [
  'thats not what i meant', "that's not what i meant",
  'you misunderstood', 'i never said', 'thats not fair',
  "that's not fair", 'but i', 'no but', 'yes but',
  'its not my fault', "it's not my fault", 'you always', 'you never'
];

export const ESCALATION_INDICATORS = [
  'this is ridiculous', 'im done', "i'm done", 'forget it',
  'whatever', 'fine then', 'i give up', 'whats the point',
  "what's the point", 'you dont understand', "you don't understand"
];

export const CURIOSITY_INDICATORS = [
  'how does', 'why do', 'what if', 'could you explain',
  'tell me more', 'im curious', "i'm curious", 'interested to know',
  'can you elaborate', 'what do you mean', 'how would'
];

export const AGREEMENT_INDICATORS = [
  'i agree', 'exactly', 'precisely', 'thats right', "that's right",
  'absolutely', 'definitely', 'certainly', 'of course', 'yes',
  'good point', 'well said', 'i think so too'
];
