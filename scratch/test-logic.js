const briefWearableUsable = false;
const hasCalendarConnected = true;

const briefHasCurrentPersonalSignal = briefWearableUsable && hasCalendarConnected;
const briefAwaitingSignals = !briefHasCurrentPersonalSignal;

const awaitingSignals = true;
const innerStateIsAwaiting = false;
const hasDeterministicBrief = false;
const canonicalInnerScore = 80;

const briefMustAwait = briefAwaitingSignals ||
  ((awaitingSignals || innerStateIsAwaiting) &&
    !hasDeterministicBrief &&
    typeof canonicalInnerScore !== "number");

const briefSource = briefMustAwait ? "awaiting" : "llm";
const responsePhrase = briefMustAwait ? null : "Some LLM phrase";
const responseBody = briefMustAwait ? null : "Some LLM body";

const hasAcceptedBriefCopy =
  (briefSource === "llm" || briefSource === "deterministic") &&
  typeof responsePhrase === "string" && responsePhrase.length > 0 &&
  typeof responseBody === "string" && responseBody.length > 0;

const briefIsAwaiting = briefMustAwait;
const suppressBriefCopy = !hasAcceptedBriefCopy && (
  briefIsAwaiting || awaitingSignals || innerStateIsAwaiting
);

console.log({
  briefHasCurrentPersonalSignal,
  briefAwaitingSignals,
  briefMustAwait,
  briefSource,
  hasAcceptedBriefCopy,
  suppressBriefCopy,
});
