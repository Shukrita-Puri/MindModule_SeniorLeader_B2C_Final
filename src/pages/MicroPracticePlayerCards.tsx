import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, Sparkles, CheckCircle2 } from "lucide-react";
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
import { getAllContent } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating } from "@/utils/relevanceFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSwipeHandler } from "@/hooks/useSwipeHandler";
import phoenixHero from "@/assets/phoenix-rising-hero.png";
import courageFutureSelfHero from "@/assets/courage-future-self-hero.png";
import confidenceEvidenceHero from "@/assets/confidence-evidence-hero.png";
import energyReframeHero from "@/assets/energy-reframe-hero.png";
import energyCompletionHero from "@/assets/energy-completion-hero.png";

// Buddhist Phoenix practice card content
const BUDDHIST_PHOENIX_CARDS = [
  {
    type: "overview" as const,
    title: "Resilience Through The Phoenix",
    subtitle: "Reframe setbacks into strength and clarity",
    source: "Growth through adversity — a pattern observed across millennia — Stoic Amor Fati (love of fate) + Growth Mindset Research (Dweck)",
    duration: "2 min",
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
      wisdom: "Amor fati — Practice of loving all events in one's life, good or bad. — Ancient Wisdom",
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
    duration: "90 sec",
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
    default:
      return [];
  }
};

// Helper to get background image for practice
const getBackgroundForPractice = (practiceId: string | undefined) => {
  switch (practiceId) {
    case "buddhist-phoenix":
      return phoenixHero;
    case "energy-through-reframe":
      return energyReframeHero;
    case "courage-future-self":
      return courageFutureSelfHero;
    case "confidence-through-evidence":
      return confidenceEvidenceHero;
    case "energy-through-completion":
      return energyCompletionHero;
    default:
      return phoenixHero;
  }
};

// Haptic feedback helper
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
};

const MicroPracticePlayerCards = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const allContent = getAllContent();
  const practice = allContent.find(
    (item) => item.id === id && item.contentType === "micro-practice"
  );

  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  // Get cards for the current practice
  const cards = getCardsForPractice(id);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setShowRatingModal(true);
        return;
      }

      const practiceQueue = JSON.parse(
        localStorage.getItem("practiceQueue") || "null"
      );
      const isPartOfRitual =
        practiceQueue && practiceQueue.some((p: any) => p.id === id);

      // Track practice session
      const { data, error } = await supabase
        .from("practice_sessions")
        .insert({
          user_id: user.id,
          content_id: practice.id,
          content_type: "micro",
          category: practice.category,
          duration_seconds: practice.duration * 60,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          completed: true,
          part_of_ritual: isPartOfRitual,
          metadata: { title: practice.title },
        })
        .select("id")
        .single();

      if (data) {
        setSessionId(data.id);
      }

      // Update ritual completion if part of ritual
      if (isPartOfRitual) {
        const today = new Date().toISOString().split("T")[0];

        await supabase.from("daily_ritual_completions").upsert(
          {
            user_id: user.id,
            ritual_date: today,
            micro_exercise_completed: true,
            micro_exercise_completed_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,ritual_date",
          }
        );

        const { data: freshRitualData } = await supabase
          .from("daily_ritual_completions")
          .select("*")
          .eq("user_id", user.id)
          .eq("ritual_date", today)
          .single();

        if (freshRitualData) {
          const completed = [
            freshRitualData.soundscape_completed,
            freshRitualData.guided_practice_completed,
            freshRitualData.micro_exercise_completed,
          ].filter(Boolean).length;

          const totalRecommended =
            freshRitualData.recommended_practices_count || 3;

          const newStatus =
            completed === totalRecommended && completed > 0
              ? "full"
              : completed > 0
                ? "partial"
                : "skipped";

          await supabase
            .from("daily_ritual_completions")
            .update({ completion_status: newStatus })
            .eq("user_id", user.id)
            .eq("ritual_date", today);
        }
      }
    } catch (error) {
      console.error("Failed to save completion:", error);
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
    navigate("/recalibrate/power-up");
  };

  const handleRatingSkip = () => {
    setShowRatingModal(false);
    navigate("/recalibrate/power-up");
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Fixed full-bleed background with optimized filter */}
      <div className="fixed inset-0 -z-10">
        <img
          src={getBackgroundForPractice(id)}
          alt="Practice background"
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(1.0) contrast(1.05) saturate(1.15)' }}
        />
        {/* Subtle warm overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-amber-900/10 to-black/25" />
      </div>

      {/* Top Navigation */}
      <TopNavigation backPath="/recalibrate/power-up" transparent />

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
              <div className="p-4 pt-16 pb-32 min-h-screen flex items-center justify-center">
                {/* Translucent frosted glass container */}
                <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-white/60 shadow-lg">
                  {card.type === "overview" && (
                    <div className="flex flex-col items-center text-center space-y-5">
                      {/* Title */}
                      <div className="space-y-2">
                        <h1 className="text-2xl md:text-3xl font-serif text-foreground leading-tight">
                          {card.title}
                        </h1>
                        <p className="text-muted-foreground text-sm md:text-base">
                          {card.subtitle}
                        </p>
                      </div>

                      {/* Source - in box */}
                      <div className="w-full px-4 py-3 bg-primary/5 rounded-xl border border-primary/10">
                        <p className="text-xs text-primary uppercase tracking-wide mb-1">
                          Source
                        </p>
                        <p className="text-sm text-foreground/90">
                          {card.source}
                        </p>
                      </div>

                      {/* Duration & Steps */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">{card.duration}</span>
                        </div>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="text-sm text-muted-foreground">
                          {card.steps}
                        </span>
                      </div>

                      {/* Trigger */}
                      <div className="space-y-2 w-full">
                        <p className="text-xs text-primary uppercase tracking-wide">
                          Trigger
                        </p>
                        <p className="text-sm text-foreground/80">
                          {card.trigger}
                        </p>
                      </div>

                      {/* When to use */}
                      <div className="space-y-2 w-full">
                        <p className="text-xs text-primary uppercase tracking-wide">
                          When to Use
                        </p>
                        <p className="text-sm text-foreground/80">
                          {card.whenToUse}
                        </p>
                      </div>
                    </div>
                  )}

                  {card.type === "step" && (
                    <div className="flex flex-col items-center text-center space-y-5">
                      {/* Step number badge */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <span className="text-primary font-semibold text-lg">
                          {card.stepNumber}
                        </span>
                      </div>

                      {/* Title & Duration */}
                      <div className="space-y-1">
                        <h2 className="text-xl md:text-2xl font-serif text-foreground">
                          {card.title}
                        </h2>
                        <p className="text-primary text-sm">
                          {card.duration}
                        </p>
                      </div>

                      {/* Instruction */}
                      <p className="text-base text-foreground/90 leading-relaxed">
                        {card.instruction}
                      </p>

                      {/* Question - NOT in box, with Q prefix */}
                      {card.question && (
                        <p className="text-base font-medium text-foreground">
                          <span className="text-primary font-bold mr-2">Q</span>
                          {card.question}
                        </p>
                      )}

                      {/* Reframing pattern - NO box, plain text */}
                      {card.reframing && (
                        <div className="w-full space-y-2">
                          <p className="text-xs text-primary uppercase tracking-wide">Reframing the Pattern</p>
                          <div className="flex flex-col gap-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">From:</span>
                              <span className="text-foreground/80">{card.reframing.from}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-primary font-medium">To:</span>
                              <span className="text-foreground">{card.reframing.to}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Examples - bullets only */}
                      {card.examples && (
                        <div className="space-y-2 w-full">
                          {card.examples.map((example, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-sm text-foreground/80 text-left"
                            >
                              <span className="text-primary mt-1">•</span>
                              <span>{example}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Guidance (if exists) */}
                      {card.guidance && (
                        <p className="text-sm text-foreground/80 font-medium">
                          {card.guidance}
                        </p>
                      )}

                      {/* Reframing note - Big, Bold, Italic, Primary color */}
                      {card.reframingNote && (
                        <p className="text-lg text-primary font-bold italic">
                          {card.reframingNote}
                        </p>
                      )}

                      {/* Closing wisdom - Big, Bold, Italic, Primary color */}
                      {card.closingWisdom && (
                        <p className="text-lg text-primary font-bold italic text-center pt-2">
                          {card.closingWisdom}
                        </p>
                      )}

                      {/* Insight box - for research/wisdom only */}
                      {card.insight && (
                        <div className="w-full mt-auto pt-4">
                          <div className="px-4 py-4 bg-primary/5 rounded-xl border border-primary/10 space-y-3 text-left">
                            <div className="flex items-start gap-2">
                              <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                {card.insight.text && (
                                  <p className="text-sm text-foreground/90">
                                    {card.insight.text}
                                  </p>
                                )}
                                {card.insight.source && (
                                  <p className="text-xs text-primary">
                                    — {card.insight.source}
                                  </p>
                                )}
                                {card.insight.wisdom && (
                                  <p className="text-sm text-muted-foreground italic">
                                    {card.insight.wisdom}
                                  </p>
                                )}
                                {card.insight.quote && (
                                  <div className="pt-2 border-t border-primary/10">
                                    <p className="text-sm text-foreground/80 italic">
                                      "{card.insight.quote.text}"
                                    </p>
                                    <p className="text-xs text-primary mt-1">
                                      — {card.insight.quote.author}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {card.type === "science" && (
                    <div className="flex flex-col items-center text-center space-y-6">
                      <h2 className="text-2xl md:text-3xl font-serif text-foreground">
                        {card.title}
                      </h2>

                      <div className="space-y-4">
                        {card.content.map((paragraph, i) => (
                          <p
                            key={i}
                            className="text-base text-foreground/80 leading-relaxed"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>

                      {/* Closing quote - Big, Bold, Italic, Primary color */}
                      <div className="pt-4 border-t border-primary/10 w-full">
                        <p className="text-lg text-primary font-bold italic">
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
              className="w-full h-14 text-base font-medium rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Mark Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MicroPracticePlayerCards;
