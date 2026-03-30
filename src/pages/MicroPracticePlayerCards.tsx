import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselApi,
} from "@/components/ui/carousel";
import CardProgress from "@/components/practice/CardProgress";
import PracticeRatingModal from "@/components/PracticeRatingModal";
import TopNavigation from "@/components/simulation/TopNavigation";
import PracticeQueueProgress from "@/components/PracticeQueueProgress";
import { getAllContent } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating, isLastPracticeInPlan, setPlanFeedbackFlag } from "@/utils/relevanceFeedback";
import { updateRitualCompletion } from "@/utils/dailyRituals";
import { trackSanctuaryEvent } from "@/utils/sanctuaryEventTracking";
import { toast } from "sonner";
import { useSwipeHandler } from "@/hooks/useSwipeHandler";
import phoenixResilienceHero from "@/assets/recalibrate/power-up/phoenix-resilience-hero.png";
import courageFutureHero from "@/assets/recalibrate/power-up/courage-future-hero.png";
import confidenceEvidenceHero from "@/assets/recalibrate/power-up/confidence-evidence-hero.png";
import energyReframeHero from "@/assets/recalibrate/power-up/energy-reframe-hero.png";
import energyCompletionHero from "@/assets/recalibrate/power-up/energy-completion-hero.png";
import braveActionHero from "@/assets/recalibrate/power-up/brave-action-hero.png";
import singleThreadFocusHero from "@/assets/recalibrate/presence/single-thread-focus-hero.png";
import firstMoveMomentumHero from "@/assets/recalibrate/presence/first-move-momentum-hero.png";
import depthSubtractionHero from "@/assets/recalibrate/presence/depth-subtraction-hero.png";
import eternalNowPresenceHero from "@/assets/recalibrate/presence/eternal-now-presence-hero.png";
import rhythmPulseHero from "@/assets/recalibrate/power-up/rhythm-pulse-hero.png";
import masteryConstraintHero from "@/assets/recalibrate/presence/mastery-constraint-hero.png";
import wuWeiFlowHero from "@/assets/recalibrate/presence/wu-wei-flow-hero.png";
import mushinFlowHero from "@/assets/recalibrate/presence/mushin-flow-hero.png";
import jobsSimplicityHero from "@/assets/recalibrate/presence/jobs-simplicity-hero.png";
import ikigaiPurposeHero from "@/assets/recalibrate/presence/ikigai-purpose-hero.png";
import stoicReflectionHero from "@/assets/recalibrate/presence/stoic-reflection-hero.png";
import fudoshinHero from "@/assets/recalibrate/presence/fudoshin-immovable-mind.jpg";
import presenceGroundingHero from "@/assets/recalibrate/presence/presence-grounding.jpg";
import releaseExhaleHero from "@/assets/recalibrate/pause/release-exhale.jpg";
import clarityEyeStormHero from "@/assets/recalibrate/presence/clarity-eye-of-storm.jpg";
import stillnessGapHero from "@/assets/recalibrate/pause/stillness-gap.jpg";
import detachmentObserverHero from "@/assets/recalibrate/presence/detachment-observer.jpg";
import softnessReleaseHero from "@/assets/recalibrate/pause/softness-release.jpg";

// Buddhist Phoenix practice card content
const BUDDHIST_PHOENIX_CARDS = [
  {
    type: "overview" as const,
    title: "Resilience Through The Phoenix",
    subtitle: "Reframe setbacks into strength and clarity",
    source: "Growth through adversity — a pattern observed across millennia — Stoic Amor Fati (love of fate) + Growth Mindset Research (Dweck)",
    duration: "3 min",
    steps: "4 Steps",
    trigger: "Setbacks, failures, rejection, unexpected obstacles, moments when you feel defeated",
    whenToUse: "After any loss/rejection/failures/mistakes — big or small. When you need to move from 'what happened to me' to 'what I do next.'",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "State What Happened",
    duration: "40 sec",
    instruction: "Write one sentence: What occurred? No interpretation, no 'should have,' no blame. Just the event.",
    examples: [
      '"I didn\'t get selected"',
      '"The project failed"',
      '"They said no"',
    ],
    insight: {
      text: "Separating event from story reduces emotional intensity by 40%",
      source: "Lieberman, 2007",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Find What It Revealed",
    duration: "50 sec",
    instruction: "Write down your own: \"This showed me I need to develop [specific capability or knowledge].\"",
    question: "What's the skill gap or blind spot this exposed?",
    reframing: {
      from: "\"I'm not good enough\"",
      to: "\"I need to learn X\" / \"I noticed I need to be more Y\"",
    },
    insight: {
      text: "Reframing failure as information activates growth mindset circuitry",
      source: "Dweck, 2006",
      quote: {
        text: "It freed me to enter one of the most creative periods of my life.",
        author: "Jobs after being fired from Apple",
      },
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Name What Remains Strong",
    duration: "40 sec",
    instruction: "List three things this setback didn't touch: capabilities, relationships, or values still intact.",
    examples: [
      '"My work ethic"',
      '"My curiosity"',
      '"My ability to start again"',
    ],
    insight: {
      text: "Anchoring to stable identity prevents learned helplessness",
      source: "Seligman, 1972",
      quote: {
        text: "You have power over your mind, not outside events.",
        author: "Marcus Aurelius",
      },
    },
    closingWisdom: "Your foundation is larger than this moment. Failure tests methods, not worth.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Commit to One Move Forward",
    duration: "40 sec",
    instruction: "Write down your own: \"The next action I take is [specific behavior] by [specific time].\"",
    guidance: "Make it small. Make it soon. Make it specific.",
    reframingNote: "Every comeback starts with one deliberate step forward.",
    insight: {
      wisdom: "Amor fati — Practice of loving all events in one's life, good or bad.",
      wisdomSource: "Ancient Wisdom",
      quote: {
        text: "We will make it work. Failure is an option here. If things are not failing, you are not innovating enough.",
        author: "Musk after SpaceX's third rocket failure",
      },
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "Your brain rewires most dramatically during stress and recovery. You're building new neural pathways through adversity.",
      "Hormetic stress (the right dose of challenge) makes you antifragile — stronger than before.",
    ],
    closing: "Find the upgrade hiding in the rubble. Every failure is tuition paid toward mastery.",
  },
];

// Energy Through Reframe practice card content
const ENERGY_REFRAME_CARDS = [
  {
    type: "overview" as const,
    title: "Energy Through Reframe",
    subtitle: "Rapid activation when energy runs low",
    source: "Cognitive reappraisal + Yerkes-Dodson arousal curve + Polyvagal Theory (Porges) — Physiological state-shifting techniques observed in athletes, performers and special forces for pre-mission.",
    duration: "1.5 min",
    steps: "3 Steps",
    trigger: "Mental fatigue, low motivation, feeling 'too tired'",
    whenToUse: "When energy is low but demands are high. Before important tasks when you feel resistance.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Question the Narrative",
    duration: "30 sec",
    instruction: "Ask yourself: \"Am I actually exhausted, or am I bored/anxious/avoiding?\"",
    examples: [
      "True fatigue = body & mind needs rest",
      "False fatigue = mind needs reengagement",
    ],
    insight: {
      text: "Name which you're experiencing. Often what feels like exhaustion is actually avoidance in disguise.",
      source: "Cognitive Reappraisal Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Reframe the Task",
    duration: "30 sec",
    instruction: "If false fatigue: Change how you think about what's next.",
    reframing: {
      from: "\"I have to...\"",
      to: "\"I choose to...\" or \"I get to...\"",
    },
    insight: {
      text: "Autonomy restores energy faster than caffeine",
      source: "Self-Determination Theory",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Set a Micro-Win",
    duration: "30 sec",
    instruction: "Commit to 10 minutes only. \"I'll work for 10 min, then reassess.\"",
    guidance: "Momentum generates energy. You'll likely continue.",
    insight: {
      text: "Small starts beat perfect conditions",
      source: "Behavioral Momentum",
    },
    closingWisdom: "Pattern: Small starts beat perfect conditions.",
  },
];

// Courage Through The Future Self practice card content
const COURAGE_FUTURE_SELF_CARDS = [
  {
    type: "overview" as const,
    title: "Courage Through The Future Self",
    subtitle: "Act with courage to choose growth over comfort in key moments that matter",
    source: "Perspective-taking across time horizons — Stoic philosophy (Memento Mori), Regret Minimisation Framework (Bezos), Fear-Setting (Ferriss)",
    duration: "3 min",
    steps: "4 Steps",
    trigger: "Afraid to act, stuck in comfort zone, procrastinating on meaningful risk, choosing safety over growth",
    whenToUse: "When facing a significant choice where fear of failure or judgment keeps you frozen — big conversations, tryouts, applications, career moves, creative risks.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Project Forward in Time",
    duration: "45 sec",
    instruction: "Close your eyes. Imagine your future self looking back at this exact moment from far ahead — next month, 1 year, or 5 years.",
    question: "Will I regret NOT taking this action?",
    examples: [
      "Usually, regret comes from never trying — not from trying and failing",
      "Fear fades. Wondering \"what if\" never does",
    ],
    insight: {
      text: "Those who take risks regret some outcomes. Those who avoid risks regret the absence of experiences.",
      source: "Regret Minimization Research",
    },
    closingWisdom: "Which version feels more like who you want to become — the one who tried, or the one who stayed safe?",
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Name What You're Actually Afraid Of",
    duration: "45 sec",
    instruction: "Complete this sentence: \"What I'm actually afraid of is [specific outcome].\" Not \"failure\" — that's too vague. Get precise.",
    examples: [
      '"Being judged by people who matter to me"',
      '"Losing the security I have now"',
      '"Discovering I\'m not as capable as I think"',
      '"Being rejected publicly"',
      '"Any other fear not mentioned here — name yours"',
    ],
    insight: {
      text: "Labeling emotions activates prefrontal cortex and dampens the amygdala. Precision reduces intensity by ~40%.",
      source: "Lieberman, 2007",
    },
    closingWisdom: "Is this fear protecting you from real danger, or just discomfort?",
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Plan for the Worst Case",
    duration: "45 sec",
    instruction: "If the worst outcome happens, what would you actually do? Write one sentence: \"If it doesn't work, I will [specific action].\"",
    examples: [
      '"If I don\'t make the team, I\'ll train harder and try again next year"',
      '"If the pitch fails, I\'ll learn what didn\'t land and refine my approach"',
      '"If they say no, I\'ll ask someone else or adjust my ask"',
    ],
    insight: {
      text: "Fear-setting: define, prevent, repair. When you see you can handle the worst case, the risk becomes manageable.",
      source: "Tim Ferriss",
    },
    closingWisdom: "You're more resilient than your fear believes. Having a recovery plan removes the paralyzing fear of the unknown.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Commit to One Brave Step",
    duration: "45 sec",
    instruction: "No more \"maybe\" or \"someday.\" Complete this: \"The action I will take is [specific behavior] by [specific time].\"",
    examples: [
      '"I will send the message by tomorrow night"',
      '"I will sign up for auditions by Friday"',
      '"I will have the conversation this week"',
    ],
    guidance: "Make it small if you need to. Make it soon. Courage builds through action, not waiting.",
    insight: {
      text: "Fear doesn't go away before you act. Courage is acting while afraid.",
      source: "Every person you admire who did something brave felt the fear and moved anyway",
    },
    closingWisdom: "What's the smallest version of this brave action you can take in the next 24 hours?",
  },
];

// Confidence & Readiness Through Evidence practice card content
const CONFIDENCE_EVIDENCE_CARDS = [
  {
    type: "overview" as const,
    title: "Confidence & Readiness Through Evidence",
    subtitle: "Rebuild self-belief with your own proof",
    source: "CBT (Beck) + Athlete Mental Training + Satya Nadella's \"Learn-It-All\" mindset",
    duration: "2 min",
    steps: "3 Steps",
    trigger: "Self-doubt, imposter feelings, pre-performance anxiety, comparing yourself to others",
    whenToUse: "Before high-stakes moments — presentations, tough conversations, interviews, or any moment when you need to remember your own capability.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Recall Three Wins",
    duration: "40 sec",
    instruction: "Name three times you succeeded at something hard. Be specific — not \"I'm good at speaking,\" but \"I convinced 10 people to join my idea in 5 minutes.\"",
    question: "When have you already done something like this?",
    examples: [
      '"I closed the deal when everyone said it was impossible"',
      '"I presented to 50 people and held their attention"',
      '"I learned a new skill in half the expected time"',
    ],
    insight: {
      text: "Serena Williams reviews footage of her best games before Grand Slams.",
      source: "High Performer Pattern",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Identify the Transferable Skill",
    duration: "40 sec",
    instruction: "For each win, name one capability you used.",
    examples: [
      '"I stayed calm under questioning"',
      '"I simplified complexity"',
      '"I read what people needed"',
    ],
    insight: {
      text: "Skill transfer recognition makes future performance seem more achievable and less intimidating.",
      source: "CBT Principle",
    },
    closingWisdom: "The skills that got you here are the same skills that will carry you forward.",
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "State Your Readiness",
    duration: "40 sec",
    instruction: "Complete: \"I am ready because I have [skill 1], [skill 2], and [skill 3].\" Say it once out loud.",
    guidance: "Evidence-based confidence doesn't waver. You're not hoping you're capable — you're remembering you already proved it.",
    insight: {
      text: "Competence remembered becomes confidence available.",
      source: "Performance Psychology",
    },
    closingWisdom: "You've done hard things before. This is the next one.",
  },
];

// Resilience Through Brave Action practice card content
const COURAGE_ARENA_CARDS = [
  {
    type: "overview" as const,
    title: "Resilience Through Brave Action",
    subtitle: "Step into visibility knowing you might fail — and choose to show up anyway",
    source: "Brené Brown's \"Daring Greatly\" + Athlete pre-game rituals + Marcus Aurelius (simplified)",
    duration: "2 min",
    steps: "3 Steps",
    trigger: "Afraid to speak up, try out, take social risk, be seen, choose authenticity over fitting in",
    whenToUse: "When fear of judgment or rejection is holding you back from action you know matters.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Name What You're Avoiding",
    duration: "40 sec",
    instruction: "Complete: \"I'm avoiding [trying out / speaking up / asking them / showing my work] because I'm afraid of [being rejected / looking stupid / being alone].\" Say it clearly. Fear named is fear tamed.",
    insight: {
      wisdom: "I learned that courage was not the absence of fear, but the triumph over it. The brave man is not he who does not feel afraid, but he who conquers that fear.",
      wisdomSource: "Nelson Mandela",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Remember Who You Admire",
    duration: "40 sec",
    instruction: "Think of someone you respect — friend, athlete, artist, character. Did they play it safe? No. They stepped into the arena knowing they might fail. You're doing what they did.",
    examples: [
      "Your favorite artist posted their first song knowing people might hate it. They did it anyway.",
    ],
    insight: {
      text: "Every person you admire took a risk you can see, and a hundred more you can't.",
      source: "Pattern Recognition",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Commit to 10 Seconds of Courage",
    duration: "40 sec",
    instruction: "You don't need to be brave forever. Just 10 seconds: raise your hand, send the message, walk up to the group. After 10 seconds, momentum takes over.",
    guidance: "Every athlete, before the big play, commits to the first move. Then instinct kicks in.",
    insight: {
      text: "Courage is a muscle. Small brave acts make bigger brave acts possible.",
      source: "Behavioral Psychology",
    },
    closingWisdom: "10 seconds. That's all. The rest will follow.",
  },
];

// Energy Through Completion practice card content
const ENERGY_COMPLETION_CARDS = [
  {
    type: "overview" as const,
    title: "Restore Energy Through Completion",
    subtitle: "Close open loops, reclaim mental bandwidth and regain energy.",
    source: "Zeigarnik Effect (psychology) + GTD \"Mind Sweep\" (David Allen) + Hemingway's \"Stop mid-sentence\" technique",
    duration: "2 min",
    steps: "3 Steps",
    trigger: "Open loops, unfinished tasks, feeling scattered, decision fatigue, mental exhaustion",
    whenToUse: "When you feel overwhelmed not by what you're doing, but by all the things you're NOT doing. When your mind is a cluttered browser with 47 open tabs.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Brain Dump the Loops",
    duration: "45 sec",
    instruction: "List every unfinished commitment swirling in your head. Don't organize, just capture: \"Email Sarah, fix bug, buy gift, schedule dentist...\" Externalize to free RAM.",
    examples: [
      "\"Reply to client\"",
      "\"Book appointment\"",
      "\"Research that thing\"",
    ],
    insight: {
      text: "Unfinished tasks create intrusive thoughts. Writing them down reduces cognitive load by 20%.",
      source: "Zeigarnik Effect (Bluma Zeigarnik, 1927)",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Decide: Do, Defer, or Delete",
    duration: "60 sec",
    instruction: "For each item, choose one action:",
    examples: [
      "Do now (< 2 min): Email Boss, quick reply",
      "Defer (schedule it): Interview prep → Calendar, Friday 2pm",
      "Delete (let it go): That \"someday\" project sitting for 6 months",
    ],
    insight: {
      text: "\"Your mind is for having ideas, not holding them.\"",
      source: "David Allen, GTD methodology",
    },
    closingWisdom: "Every unprocessed item is a tiny weight. Process it to release it.",
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Declare What's Closed",
    duration: "15 sec",
    instruction: "Speak aloud: \"These loops are closed. My mind is clear.\" Physical act of closing notebook or app.",
    guidance: "Hemingway stopped writing mid-sentence so he always knew where to restart — create closure on YOUR terms.",
    insight: {
      text: "Jeff Bezos uses \"two-pizza teams\" to limit cognitive load — small, self-contained projects that finish.",
      source: "High Performer Pattern",
    },
    closingWisdom: "A clear mind is a powerful mind. Close the tabs to open the focus.",
  },
];

// Single Thread Focus practice cards
const SINGLE_THREAD_CARDS = [
  {
    type: "overview" as const,
    title: "Entry Through The Single Thread",
    subtitle: "Lock attention by choosing one anchor",
    source: "Zen monk single-pointed concentration (zazen) + Flow research (Csikszentmihalyi) + Cal Newport's \"Deep Work\"",
    duration: "2 min",
    steps: "4 Steps",
    trigger: "Before entering deep work, when attention keeps fragmenting, starting sessions with scattered focus, task-switching exhaustion",
    whenToUse: "At the threshold of focus sessions—before writing, studying, coding, creating, or any work requiring sustained attention.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Name the single target",
    duration: "30 sec",
    instruction: "Complete: \"For the next [time block], the only thing that exists is [specific task].\" Not \"work on project\"—be surgical: \"Write the introduction\" or \"Solve equations 12-15\" or \"Draft slide 3.\"",
    guidance: "The brain can't multitask; it context-switches. Each switch costs 23 minutes of refocus time (Leroy, 2009). Single-threading eliminates the tax.",
    insight: {
      text: "Neuroscience: The brain can't multitask; it context-switches. Each switch costs 23 minutes of refocus time. Single-threading eliminates the tax.",
      source: "Research (Leroy, 2009)",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Eliminate competing threads",
    duration: "30 sec",
    instruction: "Physically remove distractions: Close tabs/apps, silence phone, clear desk, face away from movement. Your environment is an extension of your attention. What's visible competes for focus.",
    guidance: "Ancient wisdom: Zen masters face blank walls during meditation. The eyes lead the mind.",
    insight: {
      text: "Your environment is an extension of your attention. What's visible competes for focus.",
      source: "Environmental Psychology",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Set the re-entry condition",
    duration: "30 sec",
    instruction: "Declare when you'll surface: \"I emerge when [specific milestone] or [specific time].\" Examples: \"After 3 paragraphs\" / \"At 4:00pm\" / \"When I solve this problem.\" Commitment before entry prevents premature exit.",
    guidance: "High performer: Hemingway stopped writing mid-sentence so he always knew where to re-enter. Define your exit before you dive.",
    insight: {
      text: "Commitment before entry prevents premature exit.",
      source: "Hemingway's Technique",
    },
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Speak the intention",
    duration: "30 sec",
    instruction: "Say aloud: \"I am here. This is enough. I begin.\" Verbal declaration activates motor commitment. Your brain treats spoken words as contracts.",
    guidance: "The pattern: Attention follows intention. State where you're going, then go.",
    insight: {
      text: "Verbal declaration activates motor commitment. Your brain treats spoken words as contracts.",
      source: "Behavioral Psychology",
    },
  },
];

// First Move Momentum practice cards
const FIRST_MOVE_CARDS = [
  {
    type: "overview" as const,
    title: "Momentum Through The First Move",
    subtitle: "Overcome inertia with the smallest possible start",
    source: "Newton's First Law (physics) + Atomic Habits (James Clear) + Hemingway's \"one true sentence\"",
    duration: "1.5 min",
    steps: "3 Steps",
    trigger: "Procrastination, task paralysis, perfectionism preventing start, feeling overwhelmed by scope, resistance to beginning",
    whenToUse: "When you know what to do but can't start—staring at blank page, avoiding the first step, waiting for \"the right time.\"",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Shrink the start to absurd",
    duration: "30 sec",
    instruction: "What's the smallest first action? Not \"write the essay\"—just \"Write one sentence.\" Not \"study for test\"—just \"Read one page.\" Not \"clean room\"—just \"Put away one item.\" The brain resists big. It can't resist tiny.",
    guidance: "Physics: Objects at rest stay at rest. Objects in motion stay in motion. Your first move creates momentum.",
    insight: {
      text: "The brain resists big. It can't resist tiny.",
      source: "Newton's First Law Applied",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Commit to 2 minutes only",
    duration: "30 sec",
    instruction: "Set a timer. Tell yourself: \"I'll do this for 2 minutes, then stop if I want.\" You'll rarely stop. Starting is the hard part. Continuing is automatic once in motion.",
    guidance: "Neuroscience: The anterior cingulate cortex (your \"effort center\") quiets after 2-3 minutes of sustained action. Resistance fades once you're moving.",
    insight: {
      text: "Resistance fades once you're moving. The anterior cingulate cortex quiets after 2-3 minutes.",
      source: "Neuroscience Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Execute the first move now",
    duration: "30 sec",
    instruction: "Not in 5 minutes. Now. Open the document. Pick up the book. Write the word. Momentum exists only in the present tense.",
    guidance: "High performer: Hemingway's rule—\"Write one true sentence. The truest sentence you know.\" Then the next. Then the next. Books are built from first sentences.",
    insight: {
      text: "Momentum exists only in the present tense.",
      source: "Hemingway's Method",
    },
  },
];

// Depth Subtraction practice cards
const DEPTH_SUBTRACTION_CARDS = [
  {
    type: "overview" as const,
    title: "Depth Through Subtraction",
    subtitle: "Achieve clarity by removing, not adding",
    source: "Michelangelo's \"sculpture inside the marble\" + Essentialism (Greg McKeown) + Dieter Rams's design principle",
    duration: "2 min",
    steps: "4 Steps",
    trigger: "Overwhelmed by options, multitasking temptation, unclear priorities, decision fatigue, doing many things poorly",
    whenToUse: "When your to-do list feels impossible, when quality suffers from quantity, when you need to choose what NOT to do.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "List what's demanding attention",
    duration: "30 sec",
    instruction: "Write every task, project, or commitment pulling at you. Don't filter. Just capture. Visibility precedes choice.",
    guidance: "Ancient wisdom: Before the sculptor carves, they see the stone completely.",
    insight: {
      text: "Visibility precedes choice.",
      source: "Michelangelo's Process",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Ask the essential question",
    duration: "45 sec",
    instruction: "For each item: \"If I could only do ONE thing today, would this be it?\" If no, cross it out or defer it. Repeat until one remains. Essential means \"if you don't do this, nothing else matters.\"",
    guidance: "High performer: Warren Buffett's 5/25 rule—List 25 goals. Circle top 5. Avoid the other 20 at all costs. They're distractions disguised as priorities.",
    insight: {
      text: "Avoid distractions disguised as priorities.",
      source: "Warren Buffett's 5/25 Rule",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Eliminate or automate the rest",
    duration: "30 sec",
    instruction: "For non-essential items: Delete, delegate, or schedule for later (not today). Your energy is finite. Depth requires saying no to good things to say yes to great things.",
    guidance: "Design principle: Dieter Rams—\"Good design is as little design as possible.\" Good work is as few priorities as necessary.",
    insight: {
      text: "Depth requires saying no to good things to say yes to great things.",
      source: "Essentialism",
    },
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Commit the next hour to the essential",
    duration: "15 sec",
    instruction: "Block time. Protect it. Do the one thing that matters most.",
    guidance: "The pattern: Mastery comes from depth, not breadth. Do less. Do it better.",
    insight: {
      text: "Mastery comes from depth, not breadth.",
      source: "Cal Newport, Deep Work",
    },
  },
];

// Eternal Now practice cards
const ETERNAL_NOW_CARDS = [
  {
    type: "overview" as const,
    title: "Presence Through The Eternal Now",
    subtitle: "Anchor in this moment, the only one that exists",
    source: "Buddhist mindfulness + Eckhart Tolle's \"The Power of Now\" + Flow state research",
    duration: "1.5 min",
    steps: "3 Steps",
    trigger: "Mental time-traveling (ruminating on past, anxious about future), distracted during work, mind wandering, feeling disconnected from task",
    whenToUse: "Mid-session when focus drifts, when past mistakes or future worries intrude, when you catch yourself physically present but mentally absent.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Notice where your mind went",
    duration: "30 sec",
    instruction: "Pause. Ask: \"Where was I just now?\" Past (replaying)? Future (rehearsing)? Judging? Planning? Name it without judgment. \"I was worrying about tomorrow.\"",
    guidance: "Neuroscience: The default mode network activates during mind-wandering. Awareness of mind-wandering deactivates it (Brewer, 2011).",
    insight: {
      text: "Awareness of mind-wandering deactivates the default mode network.",
      source: "Neuroscience (Brewer, 2011)",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Return to sensory present",
    duration: "30 sec",
    instruction: "Name three immediate sensations: What you see, hear, or feel right now. \"I see the screen. I hear the fan. I feel the chair.\" Sensation only exists now. Your senses are an anchor to the present.",
    guidance: "Ancient wisdom: Zen teaching—\"When you eat, eat. When you walk, walk.\" The present moment is the only moment.",
    insight: {
      text: "Your senses are an anchor to the present moment.",
      source: "Zen Mindfulness",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Re-engage the task",
    duration: "30 sec",
    instruction: "Return to what's in front of you. Ask: \"What's the next smallest action?\" Do that. Then the next. Flow lives in sequential now-moments.",
    guidance: "Flow research: Csikszentmihalyi—Flow occurs when attention is fully absorbed in the present challenge. Past and future disappear.",
    insight: {
      text: "Flow lives in sequential now-moments.",
      source: "Csikszentmihalyi, Flow Research",
    },
  },
];

// Rhythm Pulse practice cards
const RHYTHM_PULSE_CARDS = [
  {
    type: "overview" as const,
    title: "Rhythm Through The Pulse",
    subtitle: "Sustain performance through strategic oscillation",
    source: "Ultradian rhythms (biology) + Pomodoro Technique + Tony Schwartz's \"The Way We're Working Isn't Working\"",
    duration: "2 min",
    steps: "4 Steps",
    trigger: "Energy crash mid-session, diminishing returns despite more hours, forcing focus past exhaustion, guilt about taking breaks",
    whenToUse: "When planning a long work session, when feeling guilty about breaks, when pushing through diminishing returns, before multi-hour focus blocks.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Accept the biological truth",
    duration: "30 sec",
    instruction: "Your brain operates in 90-minute cycles (ultradian rhythms). After 90 minutes, performance drops sharply. Fighting biology creates burnout, not productivity. Work with your rhythm, not against it.",
    guidance: "Neuroscience: The brain's prefrontal cortex (focus center) depletes glucose after 90 minutes. Breaks replenish it (Baumeister, 2007).",
    insight: {
      text: "Work with your rhythm, not against it.",
      source: "Ultradian Rhythm Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Design your pulse",
    duration: "45 sec",
    instruction: "Choose your sprint/recovery ratio: 25 min work / 5 min break (Pomodoro), 50 min work / 10 min break (standard), 90 min work / 20 min break (ultradian). Write it: \"I will work [X] minutes, then recover [Y] minutes.\"",
    guidance: "High performer: Elite musicians practice in 60-90 minute blocks with mandatory breaks. More isn't better. Recovery enables repetition.",
    insight: {
      text: "Recovery enables repetition.",
      source: "Elite Performance Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Define true recovery",
    duration: "30 sec",
    instruction: "Recovery ≠ scrolling social media (that depletes). Recovery = Movement, nature, hydration, stillness, or social connection. Ask: \"Does this replenish or distract?\" Choose replenishment.",
    guidance: "Ancient wisdom: Greek philosophers walked between thinking sessions. Movement restores the mind.",
    insight: {
      text: "Movement restores the mind.",
      source: "Ancient Greek Philosophy",
    },
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Honor the break as training",
    duration: "15 sec",
    instruction: "Breaks aren't weakness. They're part of the protocol. Marathon runners don't sprint the full 26 miles. Neither can your brain.",
    guidance: "The pattern: Sustainable intensity beats heroic exhaustion. Pulse, don't push.",
    insight: {
      text: "Sustainable intensity beats heroic exhaustion.",
      source: "Sports Psychology",
    },
  },
];

// Mastery Constraint practice cards
const MASTERY_CONSTRAINT_CARDS = [
  {
    type: "overview" as const,
    title: "Mastery Through Constraint",
    subtitle: "Accelerate learning by limiting options",
    source: "Theory of Constraints (Goldratt) + Deliberate Practice (Ericsson) + Haiku poetry structure",
    duration: "2.5 min",
    steps: "4 Steps",
    trigger: "Skill plateau, learning feels scattered, overwhelmed by what to practice, slow progress despite effort, trying to improve everything at once",
    whenToUse: "When planning practice sessions, feeling stuck at current skill level, when improvement feels impossible, designing training routines.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Identify the bottleneck",
    duration: "40 sec",
    instruction: "What ONE skill, if improved, would unlock everything else? Not five things. One. Your weakest link limits the whole chain.",
    guidance: "Theory of Constraints: Every system has one bottleneck. Improve it first. Everything else becomes easier.",
    insight: {
      text: "Your weakest link limits the whole chain.",
      source: "Theory of Constraints (Goldratt)",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Isolate and exaggerate",
    duration: "50 sec",
    instruction: "Practice ONLY that skill in isolation. Remove everything else. If it's \"asking clarifying questions,\" practice 20 questions with no other goals. If it's \"thesis statements,\" write 10 thesis statements and nothing else. Constraint forces mastery. Abundance creates mediocrity.",
    guidance: "High performer: Basketball players practice free throws (one skill) for 30 minutes daily. Not \"playing games\"—drilling the constraint.",
    insight: {
      text: "Constraint forces mastery. Abundance creates mediocrity.",
      source: "Deliberate Practice Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Set the micro-boundary",
    duration: "40 sec",
    instruction: "How long? How many reps? Define completion. \"I will practice [skill] for [15 minutes] or [10 repetitions], then stop.\" Bounded practice prevents burnout and measures progress.",
    guidance: "Ancient wisdom: Haiku has 17 syllables. The constraint creates the art. Limits liberate creativity.",
    insight: {
      text: "Limits liberate creativity.",
      source: "Japanese Haiku Tradition",
    },
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Return tomorrow to the same constraint",
    duration: "40 sec",
    instruction: "Don't switch to a new skill yet. Return to the bottleneck for 3-5 sessions. Progress comes from depth, not variety. When the bottleneck breaks, the whole system levels up.",
    guidance: "Deliberate practice: Ericsson—Experts spend 80% of practice time on their weakest skills. Amateurs avoid them.",
    insight: {
      text: "Experts spend 80% of practice time on their weakest skills.",
      source: "Ericsson, Deliberate Practice",
    },
  },
];

// Wu Wei Flow practice card content
const WU_WEI_CARDS = [
  {
    type: "overview" as const,
    title: "Effortless Action Through Wu Wei",
    subtitle: "Flow, don't force",
    source: "Laozi's Tao Te Ching — 無為 (Wu Wei) Daoist principle + Flow state research (Csíkszentmihályi)",
    duration: "2 min",
    steps: "4 Steps",
    trigger: "Micromanaging, overthinking technique, feeling stuck or effortful, creative blocks",
    whenToUse: "When you're forcing progress, gripping too hard, or creating unnecessary friction in your work.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Notice Where You're Forcing",
    duration: "30 sec",
    instruction: "Scan your body: Where am I holding tension? Jaw? Shoulders? Typing too hard? Scan your mind: Am I overthinking this?",
    insight: {
      text: "Over-effort fills working memory slots with noise, reducing bandwidth for pattern recognition",
      source: "Cognitive Load Theory",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Release 20% of Effort",
    duration: "10 sec",
    instruction: "Intentionally reduce grip, soften muscles, slow down slightly. You're looking for the minimum effective dose of effort.",
    insight: {
      text: "Flow states emerge when challenge matches skill AND effort is optimized, not maximized",
      source: "Flow Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Find the Natural Rhythm",
    duration: "1 min",
    instruction: "If writing: Just write next thought. If problem-solving: Ask \"What wants to emerge here?\" If in conversation: Listen and respond naturally.",
    examples: [
      "Stop trying to write perfectly — just write",
      "Stop forcing the solution — ask what wants to emerge",
      "Stop planning your next sentence — just respond naturally",
    ],
    closingWisdom: "The river doesn't push water. Align effort with natural conditions, not against them.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "The Ease Check",
    duration: "ongoing",
    instruction: "Every 10 minutes ask: \"Am I swimming with the current or against it?\" Adjust accordingly.",
    insight: {
      text: "Mastery isn't more effort — it's precise effort with less tension",
      source: "Expert Performance Research",
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "When you release 20% effort, you free up bandwidth for pattern recognition and intuition.",
      "Flow states emerge when challenge matches skill AND effort is optimized, not maximized.",
    ],
    closing: "\"Try less hard\" sounds wrong but is often right.",
  },
];

// Mushin Flow practice card content
const MUSHIN_CARDS = [
  {
    type: "overview" as const,
    title: "Fluid Performance Through Mushin",
    subtitle: "Empty mind, full action",
    source: "無心 (Mushin) — Zen Buddhism, martial arts philosophy + Expert automaticity research",
    duration: "1 min",
    steps: "4 Steps",
    trigger: "High-stakes performance, when self-doubt interferes, during practiced skills that don't need thinking",
    whenToUse: "Before and during performance moments when overthinking would disrupt what your body already knows.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Pre-Performance Discharge",
    duration: "15 sec",
    instruction: "Before the event, do a \"thought dump\": write every worry, doubt, and \"what if\" on paper. Close the notebook. \"Those thoughts stay here. I'm going in empty.\"",
    insight: {
      text: "Externalizing worries reduces cognitive load and frees working memory for performance",
      source: "Expressive Writing Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Shift From Thinking to Sensing",
    duration: "5 sec",
    instruction: "Stop rehearsing in your head. Instead, tune into physical sensations: What do I see? Hear? Feel in my body? Become the action, not the narrator.",
    insight: {
      text: "The conscious mind processes 40-50 bits/sec. The unconscious processes 11 million",
      source: "Neuroscience Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Trust the Training",
    duration: "moment of action",
    instruction: "When it's time to perform, don't think your way through it. Let your body do what it's practiced 100 times. If a thought arises, notice it like a cloud passing and return to sensation.",
    closingWisdom: "Your body knows. Trust it.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "The Redirect Mantra",
    duration: "ongoing",
    instruction: "When thoughts hook you mid-performance, say internally: \"Not now. Do.\"",
    insight: {
      text: "Experts perform best when they stop consciously monitoring. \"Choking\" is thinking interrupting doing",
      source: "Performance Psychology",
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "When you \"try to think\" during performance, you bottleneck a massive parallel processor through a tiny serial one.",
      "Experts perform best when they stop consciously monitoring and let procedural memory take over.",
    ],
    closing: "Mushin is getting out of your own way.",
  },
];

// Jobs Simplicity practice card content
const JOBS_SIMPLICITY_CARDS = [
  {
    type: "overview" as const,
    title: "Ruthless Focus Through Simplicity",
    subtitle: "One thing. Nothing else.",
    source: "\"Focus is about saying no.\" — Steve Jobs + Essentialism (Greg McKeown)",
    duration: "2 min",
    steps: "4 Steps",
    trigger: "Overwhelm by options, multitasking temptation, unclear priorities, decision fatigue",
    whenToUse: "When you have too many priorities and need to identify the ONE thing that actually matters.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "The Brutal Prioritization Question",
    duration: "0.5 min",
    instruction: "Write down everything you think you need to do. Then ask: \"If I could only do ONE of these today, and the rest disappeared, which one actually moves the mission forward?\" Circle it. Cross out the rest (for now).",
    insight: {
      text: "Context-switching costs 20-40% of your productive time. Every additional priority fractures attention",
      source: "Cognitive Research",
      quote: {
        text: "Jobs killed 70% of Apple's product line when he returned. The company became the most valuable in the world by doing LESS, better.",
        author: "Business History",
      },
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Create Environmental Constraints",
    duration: "10 sec",
    instruction: "Close all browser tabs except the one for your priority task. Put phone in another room. Set a timer for 25 minutes of single-focus work. Tell yourself: \"For the next 25 minutes, this is the only thing that exists.\"",
    insight: {
      text: "Your environment is an extension of your attention. What's visible competes for focus",
      source: "Environmental Psychology",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "The \"Is This It?\" Filter",
    duration: "ongoing",
    instruction: "Every time you're tempted to switch tasks or add something, ask: \"Is this THE thing right now?\" If no, write it on a \"later\" list and return to your one thing.",
    closingWisdom: "\"Do one thing\" isn't limiting — it's liberating. You're not avoiding work; you're avoiding waste.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "The Simplicity Review",
    duration: "end of day",
    instruction: "\"Did I do my one thing? If not, why? What distracted me?\" Adjust tomorrow's environment accordingly.",
    insight: {
      text: "Your brain can only hold one complex thing in working memory at a time",
      source: "Working Memory Research",
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "Context-switching costs 20-40% of productive time. Every additional priority fractures your attention.",
      "Your brain can only hold one complex thing in working memory at a time.",
    ],
    closing: "Mastery isn't adding complexity — it's ruthless elimination of everything that doesn't serve the mission.",
  },
];

// Ikigai Purpose practice card content
const IKIGAI_PURPOSE_CARDS = [
  {
    type: "overview" as const,
    title: "Purpose-Driven Flow Through Ikigai",
    subtitle: "This is why I'm here",
    source: "生き甲斐 (Ikigai) — Japanese philosophy of purpose + Self-determination theory",
    duration: "3 min",
    steps: "4 Steps",
    trigger: "Mundane work, motivation dips, when questioning the point, energy depletion from meaningless tasks",
    whenToUse: "When you've lost sight of why your work matters and need to reconnect with deeper purpose.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Connect Task to Larger Meaning",
    duration: "2 min",
    instruction: "Before starting work, answer: \"Who benefits if I do this well? How does this serve something bigger than me?\" Even mundane tasks have downstream impact.",
    examples: [
      "Not \"filling out reports\" — \"creating clarity for the team to make better decisions\"",
      "Not \"answering emails\" — \"unblocking people so they can move forward\"",
    ],
    insight: {
      text: "When you connect your task to meaning, your prefrontal cortex releases dopamine — the fuel for sustained effort",
      source: "Motivation Research",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Reframe the Task",
    duration: "30 sec",
    instruction: "Find the human impact hiding in the task. Who does this help? What problem does this solve?",
    insight: {
      text: "Intrinsic motivation (purpose, autonomy, mastery) outperforms extrinsic motivation for complex cognitive work",
      source: "Self-Determination Theory",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "The Energy Check",
    duration: "ongoing",
    instruction: "If a task consistently drains you with no sense of purpose, ask: \"Is this in my Ikigai zone? If not, can I delegate it, automate it, or say no to it?\" Protect your energy for work that lights you up.",
    closingWisdom: "When your task sits at the intersection of what you love, what you're good at, what the world needs, and what you can be rewarded for — energy flows naturally.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "The Ikigai Audit",
    duration: "weekly",
    instruction: "Draw four overlapping circles (love, good at, world needs, paid for). Plot your tasks. If most are outside the center, something needs to change.",
    insight: {
      text: "People with strong Ikigai live longer and report higher life satisfaction",
      source: "Japanese Longevity Research",
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "Intrinsic motivation outperforms extrinsic motivation for complex cognitive work.",
      "When you connect your task to meaning, your brain releases dopamine — the fuel for sustained effort.",
    ],
    closing: "Meaning isn't found; it's created through framing.",
  },
];

// Stoic Reflection practice card content
const STOIC_REFLECTION_CARDS = [
  {
    type: "overview" as const,
    title: "Daily Virtue Alignment",
    subtitle: "Marcus Aurelius's evening practice",
    source: "Ancient Rome — Stoic Philosophy, Marcus Aurelius's Meditations",
    duration: "10 min",
    steps: "5 Steps",
    trigger: "End of day, need for clarity, desire to align actions with values",
    whenToUse: "Every evening to review the day, extract wisdom, and align with your highest values.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Review the Day",
    duration: "2 min",
    instruction: "Ask yourself: \"What happened today? What challenged me? What went well?\" Write it down without judgment.",
    insight: {
      text: "Reflection creates distance from events, allowing wisdom to emerge",
      source: "Stoic Practice",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Examine Your Responses",
    duration: "2 min",
    instruction: "For each challenge: \"How did I respond? Was I ruled by impulse or guided by reason?\" Notice patterns.",
    insight: {
      text: "Self-awareness is the foundation of self-mastery",
      source: "Ancient Wisdom",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Identify Virtue Alignment",
    duration: "2 min",
    instruction: "Ask: \"Where did I act with courage, wisdom, justice, or temperance? Where did I fall short?\" Be honest but not harsh.",
    closingWisdom: "The goal isn't perfection — it's progress toward who you want to become.",
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Extract the Lesson",
    duration: "2 min",
    instruction: "For tomorrow: \"What will I do differently? What principle will I remember?\" Write one clear commitment.",
    insight: {
      text: "Every day is an opportunity to practice virtue",
      source: "Marcus Aurelius",
    },
  },
  {
    type: "step" as const,
    stepNumber: 5,
    title: "Close With Gratitude",
    duration: "2 min",
    instruction: "Name three things from today you're grateful for. End the day with appreciation, not regret.",
    insight: {
      text: "Gratitude transforms ordinary days into extraordinary lives",
      source: "Stoic Practice",
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "Daily reflection creates a feedback loop for continuous improvement.",
      "Stoic practice builds emotional resilience and aligns actions with values over time.",
    ],
    closing: "The examined life is the path to wisdom.",
  },
];

// Calm in Chaos Through Fudōshin card content
const FUDOSHIN_CARDS = [
  {
    type: "overview" as const,
    title: "Calm in Chaos Through Fudōshin",
    subtitle: "Maintain unshakeable mind when everything moves",
    source: "Samurai principle Fudōshin (不動心 — 'immovable mind') from Miyamoto Musashi's Book of Five Rings + Elite athlete 'eye of the storm' training + Michael Jordan's pre-shot ritual",
    duration: "1.5 min",
    steps: "3 Steps",
    trigger: "Critical performances, leadership under crisis, public speaking, confrontation, when chaos surrounds you and all eyes are on you",
    whenToUse: "Before stepping into the arena—presentations, difficult conversations, competition, emergency leadership, any moment requiring poise under pressure.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Center in your body",
    duration: "30 sec",
    instruction: "Feel your feet on the ground. Press them down deliberately. Lower your awareness to your center—two inches below your navel. The Japanese call this hara, your body's gravity point.",
    guidance: "Chaos exists outside. Your center is internal and unmovable. Stand or sit with spine straight. You are a mountain.",
    insight: {
      text: "Before battle, samurai warriors grounded their energy in hara. External storm, internal stillness. This is the foundation of immovable mind.",
      source: "Ancient Wisdom",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Widen your gaze",
    duration: "30 sec",
    instruction: "Soften your eyes. Don't fixate on one thing—take in the whole scene at once. Peripheral vision, not tunnel vision.",
    guidance: "When you fixate, you react to every stimulus. When you observe broadly, you respond from choice. Let everything enter your awareness without grabbing onto anything.",
    insight: {
      text: "Observe with both eyes, but see with the mind. Perceive that which cannot be seen with the eye. Peripheral vision activates parasympathetic calm awareness.",
      source: "Musashi",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Declare your ground",
    duration: "30 sec",
    instruction: "Say silently or aloud: 'I am here. I am steady. Nothing moves me.' Or use the samurai declaration: 'Fudōshin—immovable mind.'",
    guidance: "Your inner stability creates outer composure. What you declare, you embody. Feel the truth of immovability in your center. You are the eye of the storm.",
    insight: {
      text: "Michael Jordan used the same free-throw ritual 8,000+ times—same breath, same stance, same unshakeable presence regardless of 20,000 screaming fans.",
      source: "Elite Performance Research",
    },
  },
];

// Presence Through Grounding card content
const PRESENCE_GROUNDING_CARDS = [
  {
    type: "overview" as const,
    title: "Presence Through Grounding",
    subtitle: "Return to now when mind spirals elsewhere",
    source: "Buddhist mindfulness practice (sati — present-moment awareness) + Eckhart Tolle's The Power of Now + Grounding techniques from trauma therapy (Bessel van der Kolk)",
    duration: "1.5 min",
    steps: "3 Steps",
    trigger: "Ruminating on past mistakes, anxious about future outcomes, mental time-traveling during stress, feeling disconnected or dissociated, racing thoughts that won't stop",
    whenToUse: "When your body is here but your mind is elsewhere—replaying arguments, rehearsing disasters, or lost in worry. This brings you back.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Notice where you went",
    duration: "30 sec",
    instruction: "Pause. Ask yourself: 'Where was my mind just now?' Past (replaying what happened)? Future (worrying what might happen)? Judging myself? Planning obsessively?",
    guidance: "Name it without shame: 'I was catastrophizing about tomorrow' or 'I was replaying that conversation.' Just notice. No fixing yet.",
    insight: {
      text: "Awareness of mind-wandering itself interrupts the default mode network—the brain's 'autopilot' that creates rumination.",
      source: "Brewer et al., 2011",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Anchor in three sensations",
    duration: "30 sec",
    instruction: "Bring your attention to RIGHT NOW through your senses. Name one thing you see. Name one thing you hear. Name one thing you feel.",
    guidance: "Sensation only exists in the present moment. Your senses are your tether back to now.",
    insight: {
      text: "When walking, just walk. When sitting, just sit. Don't wobble. The present moment is the only moment that actually exists.",
      source: "Buddhist Teaching",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Speak your location",
    duration: "30 sec",
    instruction: "Say aloud or silently: 'I am here. I am now. This moment is enough.' Or simply: 'Here. Now.'",
    guidance: "Your body believes what you declare. Verbal grounding completes the return. Take one full breath. Feel yourself arrive.",
    insight: {
      text: "Grounding statements restore 'felt safety'—the body's sense that it's okay to be present. The body keeps the score.",
      source: "Van der Kolk",
    },
  },
];

// Release Through The Exhale card content
const RELEASE_EXHALE_CARDS = [
  {
    type: "overview" as const,
    title: "Release Through The Exhale",
    subtitle: "Discharge intensity through controlled breath",
    source: "Ancient Pranayama (yogic breath control) + Polyvagal Theory (Stephen Porges) + Navy SEAL combat breathing protocols",
    duration: "1.5 min",
    steps: "3 Steps",
    trigger: "Physical tension, shallow breathing, fight-or-flight activation, wired/manic energy at night, post-adrenaline crash, body feeling 'locked up,' overstimulated after long day",
    whenToUse: "When intensity is stored in your body—anxiety that manifests as chest tightness, post-stress tension, or when you have too much energy at the end of the day and need to wind down.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Locate the intensity",
    duration: "30 sec",
    instruction: "Scan your body from head to feet. Where is tension or excess energy held? Jaw clenched? Shoulders tight? Chest constricted? Legs restless?",
    guidance: "Name the location: 'Tension in my shoulders' or 'Wired energy in my chest.' Don't try to change it yet. Just acknowledge where it lives.",
    insight: {
      text: "Dysregulation creates a 'vagal brake' that locks your nervous system. Tension is a roadblock. You're about to clear it.",
      source: "Polyvagal Theory",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Elongate the exhale",
    duration: "40 sec",
    instruction: "Breathe in through your nose for 4 counts. Breathe out through your nose or mouth for 8 counts (twice as long as the inhale). Repeat this pattern 3 times.",
    guidance: "Focus only on making the exhale long and complete. Each long exhale is a message to your nervous system: 'Threat is over. Reset to baseline.'",
    insight: {
      text: "Inhale is energy. Exhale is release. The exhale activates the parasympathetic nervous system—your body's rest-and-digest mode.",
      source: "Pranayama Teaching",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Discharge physically",
    duration: "20 sec",
    instruction: "After your third long exhale, shake your hands vigorously for 10 seconds. Let them be loose and wild. Or shiver your whole body like you're shaking off water.",
    guidance: "Let sound escape if it wants to—sigh, groan, exhale sharply. You're completing the stress cycle your body started but couldn't finish.",
    insight: {
      text: "Animals shake after escaping predators—discharging trapped cortisol and adrenaline. Physical discharge releases stress hormones that breath alone can't clear.",
      source: "Levine, 1997",
    },
  },
];

// Clarity in Chaos Through The Eye card content
const CLARITY_EYE_STORM_CARDS = [
  {
    type: "overview" as const,
    title: "Clarity in Chaos Through The Eye",
    subtitle: "See through confusion by naming what's real",
    source: "Sun Tzu's The Art of War ('Know yourself, know the enemy') + Dwight Eisenhower's Urgent/Important Matrix + Cognitive Behavioral Therapy (Aaron Beck)",
    duration: "2 min",
    steps: "4 Steps",
    trigger: "Overwhelming situations, information overload, when multiple demands hit simultaneously, decision paralysis under pressure, feeling like everything is urgent",
    whenToUse: "When everything feels critical and you don't know where to look first—project crises, simultaneous deadlines, family emergencies overlapping with work demands.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Name what you see",
    duration: "30 sec",
    instruction: "List the facts. No story, no drama. Just what's actually in front of you.",
    minimal: true,
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Separate urgent from important",
    duration: "45 sec",
    instruction: "Sort each item: Must act now? Or matters long-term? Do the overlap first.",
    minimal: true,
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Choose the one critical action",
    duration: "30 sec",
    instruction: "Which one action unblocks everything else? That's your move.",
    minimal: true,
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "State the first move",
    duration: "15 sec",
    instruction: "Say it: 'The one thing I do next is ___.' Make it physical. Make it now.",
    minimal: true,
  },
];

// Stillness Through The Gap card content
const STILLNESS_GAP_CARDS = [
  {
    type: "overview" as const,
    title: "Stillness Through The Gap",
    subtitle: "Find the quiet between thoughts",
    source: "Zen ma (間 — the space between) + Vipassana meditation (sankara observation) + Elite sniper 'breath pause' training",
    duration: "2 min",
    steps: "3 Steps",
    trigger: "Mental noise, thoughts colliding, feeling trapped in your own head, pre-decision overwhelm, when you need to hear your intuition but can't access it",
    whenToUse: "Before important decisions when you need to hear your own wisdom, when thoughts are too loud to think clearly, when you need to access intuition buried under noise.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Notice the stream",
    duration: "40 sec",
    instruction: "Close your eyes or soften your gaze. Notice thoughts moving through your mind like cars on a highway. Don't grab onto any thought. Don't follow any thought into its story.",
    guidance: "Just observe: 'Thought about work. Thought about dinner. Worry thought. Planning thought.' You are not the cars. You are the road.",
    insight: {
      text: "Thoughts arise (uppada), exist briefly, and pass away (vaya). Your job isn't to stop them—it's to stop identifying with them.",
      source: "Vipassana Teaching",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Find the gap",
    duration: "60 sec",
    instruction: "Between each thought, there is a tiny space of silence. A gap. Your task: Notice the gap. Even if it's only a fraction of a second.",
    guidance: "Thought arises → Gap → Next thought arises. Rest your attention in that gap. It's where stillness lives. When the next thought comes (it will), just wait for the next gap.",
    insight: {
      text: "Ma (間) is the void, the pause, the breath between notes in music. Without ma, music is noise. Without the gap, thoughts are chaos.",
      source: "Zen Concept",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Expand the silence",
    duration: "20 sec",
    instruction: "After finding a few gaps, ask one question into the silence: 'What do I actually need right now?' or 'What's true here?' Don't answer it. Just ask it into the gap and listen.",
    guidance: "The answer won't come from thinking. It will arrive in the next gap—sudden, clear, quiet. Trust the first thing that emerges from silence. That's your intuition.",
    insight: {
      text: "The quieter you become, the more you can hear. Intuition doesn't shout. It whispers in gaps.",
      source: "Rumi",
    },
  },
];

// Detachment Through The Observer card content
const DETACHMENT_OBSERVER_CARDS = [
  {
    type: "overview" as const,
    title: "Detachment Through The Observer",
    subtitle: "Step outside yourself to see clearly",
    source: "Stoic prosoche (attention discipline) + Buddhist sakshi (witness consciousness) + Psychological distancing research (Ethan Kross)",
    duration: "2 min",
    steps: "3 Steps",
    trigger: "Taking things too personally, reactive defensiveness, feeling attacked by feedback, when emotions cloud judgment, losing objectivity about your own situation",
    whenToUse: "After harsh feedback, when criticism feels like identity assault, during conflicts where you're losing perspective, when you need to separate fact from story.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Shift to third-person narration",
    duration: "40 sec",
    instruction: "Describe what's happening as if you're a narrator watching someone else. Don't say: 'I'm furious.' Say: 'They are feeling anger' or 'They received feedback that triggered defensiveness.'",
    guidance: "Use your name or 'they' instead of 'I.' Create distance without denying reality. You're not suppressing emotion—you're changing your viewing angle.",
    insight: {
      text: "Third-person self-talk reduces emotional reactivity by 30% and increases problem-solving by 20%.",
      source: "Kross et al., 2014",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Name the story, not the fact",
    duration: "40 sec",
    instruction: "Ask: 'What story am I telling about what happened?' Separate fact from interpretation.",
    examples: [
      "Fact: 'They disagreed with my idea.' Story: 'They think I'm incompetent.'",
      "Fact: 'I didn't get the role.' Story: 'I'm not talented enough.'",
    ],
    guidance: "Speak this out loud: 'The fact is [X]. The story I'm telling is [Y].' Stories create suffering. Facts create information.",
    insight: {
      text: "People are disturbed not by things, but by the views they take of them. The event is neutral. Your interpretation creates the pain.",
      source: "Epictetus",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Return as witness",
    duration: "40 sec",
    instruction: "Say to yourself: 'I notice I'm having the thought that [story]. That's a thought, not a truth.' Example: 'I notice I'm having the thought that I'm not good enough. That's a thought, not a truth.'",
    guidance: "You don't have to believe every thought your mind produces. You are not your thoughts. You are the awareness that notices them. Sit in that awareness for three breaths. Observer, not participant.",
    insight: {
      text: "You are the sky, not the weather. Thoughts and emotions are weather patterns passing through. The sky remains unchanged.",
      source: "Buddhist Teaching",
    },
  },
];

// Softness Through Release card content
const SOFTNESS_RELEASE_CARDS = [
  {
    type: "overview" as const,
    title: "Softness Through Release",
    subtitle: "Let go of what you cannot control",
    source: "Taoist Wu Wei (effortless action) + Serenity Prayer tradition + Acceptance and Commitment Therapy (ACT — Russ Harris)",
    duration: "2 min",
    steps: "3 Steps",
    trigger: "Trying to control the uncontrollable, white-knuckling outcomes, exhaustion from forcing, resistance creating more suffering, fixated on what you can't change",
    whenToUse: "When you're fighting reality, when effort creates more tension, when you need to accept what is before you can act, when resistance is the problem—not the situation.",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "Name what you're gripping",
    duration: "40 sec",
    instruction: "Ask: 'What am I trying to control right now?' Be specific. Write it or speak it.",
    examples: [
      "'I'm trying to control what they think of me'",
      "'I'm trying to control the outcome of this interview'",
      "'I'm trying to make them understand'",
    ],
    guidance: "Naming reveals the grip. You can't release what you don't acknowledge you're holding.",
    insight: {
      text: "God, grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.",
      source: "Serenity Prayer",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Separate what's yours to hold",
    duration: "40 sec",
    instruction: "For what you named, ask: 'Can I directly influence this outcome?' and 'Is my effort creating the result I want?'",
    guidance: "If both answers are NO, you're gripping the uncontrollable. Speak: 'I cannot control [X]. I release my grip on [X].' If YES to either, identify your one actual leverage point: 'What I CAN do is [specific action].'",
    insight: {
      text: "Wu Wei doesn't mean 'do nothing.' It means 'don't force what doesn't need force.' Water doesn't fight the rock—it flows around.",
      source: "Taoist Teaching",
    },
  },
  {
    type: "step" as const,
    stepNumber: 3,
    title: "Open your hands",
    duration: "40 sec",
    instruction: "Physically: Make tight fists. Squeeze hard for 5 seconds. Then open your hands completely. Palms up. Fingers relaxed. Feel the difference. That's the sensation of release.",
    guidance: "Say aloud or silently: 'I release. I allow. I accept what is.' Take three breaths with open hands. Each exhale, imagine releasing more grip. You're not giving up. You're putting down what was never yours to carry.",
    insight: {
      text: "Open palms (varada mudra)—the gesture of giving and releasing. Used for 2,500+ years to signal surrender to what is.",
      source: "Buddhist Mudra",
    },
  },
];

// Helper to get cards for practice
const getCardsForPractice = (practiceId: string | undefined) => {
  switch (practiceId) {
    case "buddhist-phoenix":
      return BUDDHIST_PHOENIX_CARDS;
    case "energy-through-reframe":
      return ENERGY_REFRAME_CARDS;
    case "courage-future-self":
      return COURAGE_FUTURE_SELF_CARDS;
    case "confidence-through-evidence":
      return CONFIDENCE_EVIDENCE_CARDS;
    case "energy-through-completion":
      return ENERGY_COMPLETION_CARDS;
    case "courage-arena":
      return COURAGE_ARENA_CARDS;
    case "single-thread-focus":
      return SINGLE_THREAD_CARDS;
    case "first-move-momentum":
      return FIRST_MOVE_CARDS;
    case "depth-subtraction":
      return DEPTH_SUBTRACTION_CARDS;
    case "eternal-now-presence":
      return ETERNAL_NOW_CARDS;
    case "rhythm-pulse":
      return RHYTHM_PULSE_CARDS;
    case "mastery-constraint":
      return MASTERY_CONSTRAINT_CARDS;
    case "wu-wei-flow":
      return WU_WEI_CARDS;
    case "mushin-no-mind":
      return MUSHIN_CARDS;
    case "jobs-simplicity":
      return JOBS_SIMPLICITY_CARDS;
    case "ikigai-purpose":
      return IKIGAI_PURPOSE_CARDS;
    case "stoic-reflection":
      return STOIC_REFLECTION_CARDS;
    case "fudoshin-immovable-mind":
      return FUDOSHIN_CARDS;
    case "presence-grounding":
    case "presence-grounding-new":
      return PRESENCE_GROUNDING_CARDS;
    case "release-exhale":
    case "release-exhale-new":
      return RELEASE_EXHALE_CARDS;
    case "eye-of-storm":
      return CLARITY_EYE_STORM_CARDS;
    case "stillness-gap":
    case "stillness-gap-new":
      return STILLNESS_GAP_CARDS;
    case "detachment-observer":
    case "detachment-observer-new":
      return DETACHMENT_OBSERVER_CARDS;
    case "softness-release":
    case "softness-release-new":
      return SOFTNESS_RELEASE_CARDS;
    default:
      return [];
  }
};

// Helper to get background image for practice
const getBackgroundForPractice = (practiceId: string | undefined) => {
  switch (practiceId) {
    case "buddhist-phoenix":
      return phoenixResilienceHero;
    case "energy-through-reframe":
      return energyReframeHero;
    case "courage-future-self":
      return courageFutureHero;
    case "confidence-through-evidence":
      return confidenceEvidenceHero;
    case "energy-through-completion":
      return energyCompletionHero;
    case "courage-arena":
      return braveActionHero;
    case "single-thread-focus":
      return singleThreadFocusHero;
    case "first-move-momentum":
      return firstMoveMomentumHero;
    case "depth-subtraction":
      return depthSubtractionHero;
    case "eternal-now-presence":
      return eternalNowPresenceHero;
    case "rhythm-pulse":
      return rhythmPulseHero;
    case "mastery-constraint":
      return masteryConstraintHero;
    case "wu-wei-flow":
      return wuWeiFlowHero;
    case "mushin-no-mind":
      return mushinFlowHero;
    case "jobs-simplicity":
      return jobsSimplicityHero;
    case "ikigai-purpose":
      return ikigaiPurposeHero;
    case "stoic-reflection":
      return stoicReflectionHero;
    case "fudoshin-immovable-mind":
      return fudoshinHero;
    case "presence-grounding":
    case "presence-grounding-new":
      return presenceGroundingHero;
    case "release-exhale":
    case "release-exhale-new":
      return releaseExhaleHero;
    case "eye-of-storm":
      return clarityEyeStormHero;
    case "stillness-gap":
    case "stillness-gap-new":
      return stillnessGapHero;
    case "detachment-observer":
    case "detachment-observer-new":
      return detachmentObserverHero;
    case "softness-release":
    case "softness-release-new":
      return softnessReleaseHero;
    default:
      return phoenixResilienceHero;
  }
};

// Haptic feedback helper
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
};

// Crisp step card — title + instruction only, secondary content expandable
const StepCardContent = ({ card }: { card: any }) => {
  const [expanded, setExpanded] = useState(false);
  
  const hasSecondary = card.examples?.length || card.guidance || card.reframing || card.closingWisdom || card.question || card.insight;

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      {/* Step label */}
      <p className="text-white/50 text-xs tracking-[0.25em] uppercase font-medium">
        Step {card.stepNumber}
      </p>

      {/* Title — large, commanding action verb */}
      <h2 className="text-2xl md:text-3xl font-serif font-bold text-white tracking-wide leading-snug px-2">
        {card.title}
      </h2>

      {/* Core instruction — the ONE thing to do */}
      <p className="text-base text-white/85 leading-relaxed max-w-[280px]">
        {card.instruction}
      </p>

      {/* Expand toggle for secondary content */}
      {hasSecondary && (
        <>
          <button 
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-white/40 text-xs tracking-wider uppercase transition-colors hover:text-white/60 active:scale-95"
          >
            {expanded ? 'Less' : 'More'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded && (
            <div className="space-y-4 w-full max-w-[280px] animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Question */}
              {card.question && (
                <p className="text-sm text-white/70 italic">{card.question}</p>
              )}

              {/* Reframing */}
              {card.reframing && (
                <div className="text-sm space-x-1">
                  <span className="text-white/40">{card.reframing.from}</span>
                  <span className="text-white/30">→</span>
                  <span className="text-amber-300/80">{card.reframing.to}</span>
                </div>
              )}

              {/* Examples */}
              {card.examples && card.examples.length > 0 && (
                <div className="space-y-1">
                  {card.examples.map((ex: string, i: number) => (
                    <p key={i} className="text-xs text-white/55 text-left">
                      <span className="text-amber-300/60 mr-1">•</span>{ex}
                    </p>
                  ))}
                </div>
              )}

              {/* Guidance */}
              {card.guidance && (
                <p className="text-xs text-white/50 leading-relaxed">{card.guidance}</p>
              )}

              {/* Closing wisdom */}
              {card.closingWisdom && (
                <p className="text-sm text-amber-300/80 italic">{card.closingWisdom}</p>
              )}

              {/* Insight / attribution */}
              {card.insight && (card.insight.text || card.insight.quote || card.insight.wisdom) && (
                <div className="pt-2 border-t border-white/10">
                  {card.insight.text && (
                    <p className="text-[11px] text-white/40 italic">
                      {card.insight.text}
                      {card.insight.source && <span className="text-amber-300/50"> — {card.insight.source}</span>}
                    </p>
                  )}
                  {card.insight.wisdom && (
                    <p className="text-[11px] text-white/40 italic">
                      {card.insight.wisdom}
                      {card.insight.wisdomSource && <span className="text-amber-300/50"> — {card.insight.wisdomSource}</span>}
                    </p>
                  )}
                  {card.insight.quote && (
                    <p className="text-[11px] text-white/40 italic mt-1">
                      "{card.insight.quote.text}" <span className="text-amber-300/50">— {card.insight.quote.author}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const MicroPracticePlayerCards = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const category = location.state?.category || 'power-up'; // Default to power-up if no category
  const fromRitual = location.state?.fromRitual || false;
  const fromIntervention = location.state?.fromIntervention || false;
  const allContent = getAllContent();
  const practice = allContent.find(
    (item) => item.id === id && item.contentType === "micro-practice"
  );

  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  // Practice Queue State
  const [practiceQueue, setPracticeQueue] = useState<any[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [isInQueue, setIsInQueue] = useState(false);

  // Get cards for the current practice
  const cards = getCardsForPractice(id);

  // Check if this is part of a practice queue
  useEffect(() => {
    const queue = localStorage.getItem('practiceQueue');
    if (queue) {
      try {
        const parsed = JSON.parse(queue);
        setPracticeQueue(parsed);
        const index = parsed.findIndex((p: any) => p.id === id);
        if (index !== -1) {
          setCurrentQueueIndex(index);
          setIsInQueue(true);
        }
      } catch (e) {
        console.error('Error parsing practice queue:', e);
      }
    }
  }, [id]);

  // Swipe handlers for navigation
  const handlePrev = useCallback(() => {
    if (api && current > 0) {
      api.scrollPrev();
      triggerHaptic();
    }
  }, [api, current]);

  const handleNext = useCallback(() => {
    if (api) {
      api.scrollNext();
      triggerHaptic();
    }
  }, [api]);

  // Enable swipe gestures
  useSwipeHandler({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    threshold: 50,
  });

  useEffect(() => {
    if (!api) return;

    setCurrent(api.selectedScrollSnap());
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
      triggerHaptic();
    });
  }, [api]);

  // Track engagement on page load
  useEffect(() => {
    if (practice) {
      const practiceQueue = JSON.parse(
        localStorage.getItem("practiceQueue") || "null"
      );
      const isPartOfRitual =
        practiceQueue && practiceQueue.some((p: any) => p.id === id);

      if (isPartOfRitual) {
        trackEngagement("daily_ritual_micro");
      } else if (practice.category === "pause") {
        trackEngagement("pause_session");
      } else if (practice.category === "power-up") {
        trackEngagement("renew_session");
      } else if (
        practice.category === "presence" ||
        practice.category === "flow"
      ) {
        trackEngagement("flow_session");
      }
    }
  }, [practice, id]);

  const handleComplete = async () => {
    if (!practice) return;

    try {
      const practiceQueue = JSON.parse(
        localStorage.getItem("practiceQueue") || "null"
      );
      const isPartOfRitual =
        practiceQueue && practiceQueue.some((p: any) => p.id === id);
      
      // Queue is source of truth for ritual membership
      const shouldTrackRitual = isPartOfRitual;

      // Single consolidated tracking call (writes to both sanctuary_events + practice_sessions)
      const result = await trackSanctuaryEvent({
        eventType: 'session_complete',
        contentId: practice.id,
        contentType: 'micro-practice',
        category: practice.category as 'pause' | 'power-up' | 'presence',
        tags: [],
        duration: practice.duration * 60,
        timestamp: new Date().toISOString(),
        contextData: {
          timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening',
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        },
        partOfRitual: shouldTrackRitual,
        metadata: { title: practice.title }
      });

      if (result.data?.practiceSessionId) {
        setSessionId(result.data.practiceSessionId);
      }

      // Update ritual completion if part of recommended plan or queue
      if (shouldTrackRitual) {
        const queue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
        console.log('[MicroPracticePlayerCards] Calling updateRitualCompletion:', { id, queueLength: queue?.length });
        await updateRitualCompletion('micro_exercise', id, queue || undefined);
        console.log('[MicroPracticePlayerCards] updateRitualCompletion complete');
      }
    } catch (error) {
      console.error("Failed to save completion:", error);
    }

    // If this is the last practice in a plan, skip practice rating and trigger plan feedback
    if (isLastPracticeInPlan(id)) {
      console.log('[MicroPracticePlayerCards] Last in plan — skipping practice rating, setting plan feedback flag');
      const ritualMode = localStorage.getItem('ritualMode');
      const jitData = localStorage.getItem('jitInterventionData');
      const planType = (ritualMode === 'jit' || jitData) ? 'jit' : 'tod';
      
      localStorage.removeItem('practiceQueue');
      localStorage.removeItem('ritualMode');
      
      if (jitData) {
        try {
          const parsed = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          if (parsed.hasCoachStep === true && parsed.coachPrompt) {
            toast.success('Practices complete! Opening Coach...');
            navigate('/coach', {
              state: {
                flowType: parsed.flowType,
                initialPrompt: parsed.coachPrompt,
                fromIntervention: true,
                eventTitle: parsed.eventTitle
              }
            });
            return;
          }
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      
      setPlanFeedbackFlag(planType as 'tod' | 'jit');
      toast.success('🎉 Plan complete!');
      navigate('/executive-home');
      return;
    }

    setShowRatingModal(true);
  };

  const handleRatingSubmit = async (rating: number, feedback?: string) => {
    if (practice) {
      await submitPracticeRating(
        sessionId,
        practice.id,
        "micro-practice",
        rating,
        feedback
      );
      toast.success("Thank you for your feedback!");
    }
    setShowRatingModal(false);
    
    // Check for coach continuity - practice was launched from coach
    const fromCoach = location.state?.fromCoach;
    const coachSessionId = location.state?.coachSessionId || sessionStorage.getItem('returnCoachSessionId');
    
    if (fromCoach && coachSessionId) {
      // Clear stored coach return data
      sessionStorage.removeItem('returnToCoach');
      sessionStorage.removeItem('returnCoachSessionId');
      
      toast.success('Practice complete! Returning to Coach...');
      navigate('/coach', {
        state: {
          resumeSession: true,
          previousSessionId: coachSessionId
        }
      });
      return;
    }
    
    // If in queue and not last, navigate to next; otherwise check for JIT coach navigation
    if (isInQueue && currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    } else if (isInQueue) {
      localStorage.removeItem('practiceQueue');
      // Check for JIT intervention data for coach navigation
      const jitData = localStorage.getItem('jitInterventionData');
      if (jitData) {
        try {
          const parsed = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          if (parsed.hasCoachStep === true && parsed.coachPrompt) {
            toast.success('Practices complete! Opening Coach...');
            navigate('/coach', {
              state: {
                flowType: parsed.flowType,
                initialPrompt: parsed.coachPrompt,
                fromIntervention: true,
                eventTitle: parsed.eventTitle
              }
            });
            return;
          }
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      // Set plan feedback flag for ExecutiveHome
      const ritualMode = localStorage.getItem('ritualMode');
      localStorage.setItem('showPlanFeedback', JSON.stringify({
        planType: ritualMode === 'jit' ? 'jit' : 'tod',
        timestamp: Date.now()
      }));
      localStorage.removeItem('ritualMode');
      toast.success('🎉 Ritual complete!');
      navigate('/executive-home');
    } else {
      // Check for JIT intervention data even if not in queue (single practice case)
      const jitData = localStorage.getItem('jitInterventionData');
      if (jitData) {
        try {
          const parsed = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          if (parsed.hasCoachStep === true && parsed.coachPrompt) {
            toast.success('Practice complete! Opening Coach...');
            navigate('/coach', {
              state: {
                flowType: parsed.flowType,
                initialPrompt: parsed.coachPrompt,
                fromIntervention: true,
                eventTitle: parsed.eventTitle
              }
            });
            return;
          }
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      const returnPath = (fromRitual || fromIntervention) ? '/executive-home' : `/recalibrate/${category}`;
      navigate(returnPath);
    }
  };

  const handleRatingSkip = () => {
    setShowRatingModal(false);
    
    // Check for coach continuity
    const fromCoach = location.state?.fromCoach;
    const coachSessionId = location.state?.coachSessionId || sessionStorage.getItem('returnCoachSessionId');
    
    if (fromCoach && coachSessionId) {
      sessionStorage.removeItem('returnToCoach');
      sessionStorage.removeItem('returnCoachSessionId');
      
      navigate('/coach', {
        state: {
          resumeSession: true,
          previousSessionId: coachSessionId
        }
      });
      return;
    }
    
    // If in queue and not last, navigate to next; otherwise check for JIT coach navigation
    if (isInQueue && currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    } else {
      // Check for JIT intervention data
      const jitData = localStorage.getItem('jitInterventionData');
      if (jitData) {
        try {
          const parsed = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          if (parsed.hasCoachStep === true && parsed.coachPrompt) {
            toast.success('Practice complete! Opening Coach...');
            navigate('/coach', {
              state: {
                flowType: parsed.flowType,
                initialPrompt: parsed.coachPrompt,
                fromIntervention: true,
                eventTitle: parsed.eventTitle
              }
            });
            return;
          }
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      const returnPath = (fromRitual || fromIntervention) ? '/executive-home' : `/recalibrate/${category}`;
      navigate(returnPath);
    }
  };

  // Queue Handlers
  const navigateToNext = () => {
    const next = practiceQueue[currentQueueIndex + 1];
    if (!next) return;
    
    localStorage.setItem('queueIndex', String(currentQueueIndex + 1));
    
    if (next.contentType === 'soundbath') {
      navigate(`/soundscapes/${next.id}`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'guided-practice') {
      navigate(`/guided-practices/${next.id}`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'micro-practice') {
      navigate(`/micro-practice/${next.id}/cards`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'coach') {
      // Handle Coach cards - navigate to coach page with context
      navigate('/coach', { 
        state: { 
          flowType: next.id === 'coach-prepare' ? 'prepare' : 'integrate',
          initialPrompt: next.id === 'coach-prepare' 
            ? "I have an important moment coming up. Help me mentally prepare and visualize success."
            : "Let's close out today. First, take a deep breath and let your shoulders drop. Now, what's one thing you did right today? Share your small win.",
          fromRitual: true 
        } 
      });
    }
  };

  const handleQueueSkip = () => {
    if (currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    }
  };

  const handleQueuePause = () => {
    localStorage.removeItem('practiceQueue');
    toast.success('Ritual paused');
    navigate('/executive-home');
  };

  const handleQueueComplete = () => {
    // Navigate to next or complete ritual
    if (currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    } else {
      localStorage.removeItem('practiceQueue');
      toast.success('🎉 Ritual complete!');
      navigate('/executive-home');
    }
  };

  if (!practice || cards.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Practice not found</p>
      </div>
    );
  }

  if (showRatingModal && practice) {
    return (
      <PracticeRatingModal
        contentId={practice.id}
        contentType="micro-practice"
        contentTitle={practice.title}
        category={practice.category}
        sessionId={sessionId}
        onSubmit={handleRatingSubmit}
        onSkip={handleRatingSkip}
      />
    );
  }

  const isLastCard = current === cards.length - 1;

  return (
    <div className="min-h-screen relative overflow-hidden animate-page-enter">
      {/* Fixed full-bleed background with optimized filter */}
      <div className="fixed inset-0 -z-10">
        <img
          src={getBackgroundForPractice(id)}
          alt="Practice background"
          className="w-full h-full object-cover"
          style={{ filter: (['presence', 'flow'].includes(practice.category || '')) ? 'saturate(0.6) sepia(15%) hue-rotate(85deg) brightness(0.9) contrast(1.1)' : 'brightness(0.85) contrast(1.1) saturate(1.2)' }}
        />
        {/* Luxury warm overlay - matching soundscapes */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-taupe-rich/30 to-black/50" />
      </div>

      {/* Top Navigation */}
      <TopNavigation backPath={(fromRitual || fromIntervention) ? '/executive-home' : `/recalibrate/${category}`} transparent />

      {/* Practice Queue Progress - only show when multiple practices in queue */}
      {isInQueue && practice && practiceQueue.length > 1 && (
        <PracticeQueueProgress
          currentIndex={currentQueueIndex}
          totalCount={practiceQueue.length}
          queue={practiceQueue}
          onSkip={handleQueueSkip}
          onPause={handleQueuePause}
          onComplete={handleQueueComplete}
        />
      )}

      {/* Back indicator - shows from Card 2 onwards */}
      {current > 0 && (
        <button
          onClick={handlePrev}
          className="fixed left-3 top-1/2 -translate-y-1/2 z-40 p-2 rounded-full bg-white/40 backdrop-blur-sm border border-white/30 shadow-sm active:scale-95 transition-transform"
          aria-label="Previous card"
        >
          <ChevronLeft className="w-5 h-5 text-foreground/70" />
        </button>
      )}

      {/* Forward indicator - shows on all cards except last */}
      {!isLastCard && (
        <button
          onClick={handleNext}
          className="fixed right-3 top-1/2 -translate-y-1/2 z-40 p-2 rounded-full bg-white/40 backdrop-blur-sm border border-white/30 shadow-sm active:scale-95 transition-transform"
          aria-label="Next card"
        >
          <ChevronRight className="w-5 h-5 text-foreground/70" />
        </button>
      )}

      {/* Carousel */}
      <Carousel
        setApi={setApi}
        className="w-full h-full"
        opts={{
          align: "start",
          loop: false,
        }}
      >
        <CarouselContent className="-ml-0">
          {cards.map((card, index) => (
            <CarouselItem key={index} className="pl-0">
              <div className="p-4 pt-20 pb-32 min-h-screen flex items-center justify-center">
                {/* Card container — transparent glassmorphic for all cards */}
                <div className="w-full max-w-md rounded-3xl p-6 md:p-8 bg-white/15 backdrop-blur-md border border-white/40">
                  {card.type === "overview" && (
                    <div className="flex flex-col items-center text-center space-y-5">
                      {/* Title */}
                      <div className="space-y-2">
                        <h1 className="text-2xl md:text-3xl font-serif leading-tight text-white">
                          {card.title}
                        </h1>
                        <p className="text-sm md:text-base text-white/60">
                          {card.subtitle}
                        </p>
                      </div>

                      {/* Source - in box */}
                      <div className="w-full px-4 py-3 rounded-xl border bg-white/10 border-white/20">
                        <p className="text-xs uppercase tracking-wide mb-1 text-white/50">
                          Source
                        </p>
                        <p className="text-sm text-white/90">
                          {card.source}
                        </p>
                      </div>

                      {/* Duration & Steps */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-white/60">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">{card.duration}</span>
                        </div>
                        <span className="text-white/30">•</span>
                        <span className="text-sm text-white/60">
                          {card.steps}
                        </span>
                      </div>

                      {/* Trigger */}
                      <div className="space-y-2 w-full">
                        <p className="text-xs uppercase tracking-wide text-white/50">
                          Trigger
                        </p>
                        <p className="text-sm text-white/80">
                          {card.trigger}
                        </p>
                      </div>

                      {/* When to use */}
                      <div className="space-y-2 w-full">
                        <p className="text-xs uppercase tracking-wide text-white/50">
                          When to Use
                        </p>
                        <p className="text-sm text-white/80">
                          {card.whenToUse}
                        </p>
                      </div>
                    </div>
                  )}

                  {card.type === "step" && (
                    <StepCardContent card={card} />
                  )}

                  {card.type === "science" && (
                    <div className="flex flex-col items-center text-center space-y-6">
                      <h2 className="text-2xl md:text-3xl font-serif text-white">
                        {card.title}
                      </h2>

                      <div className="space-y-4">
                        {card.content.map((paragraph, i) => (
                          <p
                            key={i}
                            className="text-base text-white/80 leading-relaxed"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>

                      {/* Closing quote */}
                      <div className="pt-4 border-t border-white/20 w-full">
                        <p className="text-lg text-amber-300 font-bold italic">
                          {card.closing}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/10 to-transparent">
        <div className="max-w-md mx-auto space-y-4">
          {/* Progress dots */}
          <CardProgress total={cards.length} current={current} />

          {/* Mark Complete button - only on last card */}
          {isLastCard && (
            <Button
              onClick={handleComplete}
              className="w-full h-14 text-base font-semibold rounded-2xl bg-[#1DB954] hover:bg-[#1DB954]/90 text-white"
            >
              Mark Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MicroPracticePlayerCards;
