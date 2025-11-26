import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronRight, Clock, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselApi,
} from "@/components/ui/carousel";
import PracticeCard from "@/components/practice/PracticeCard";
import CardProgress from "@/components/practice/CardProgress";
import PracticeRatingModal from "@/components/PracticeRatingModal";
import TopNavigation from "@/components/simulation/TopNavigation";
import { getAllContent } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating } from "@/utils/relevanceFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import phoenixHero from "@/assets/phoenix-mindset-hero.png";

// Buddhist Phoenix practice card content
const BUDDHIST_PHOENIX_CARDS = [
  {
    type: "overview" as const,
    title: "Resilience Through The Phoenix Mindset",
    subtitle: "Reframe setbacks into strength and clarity",
    source: "Stoic Amor Fati + Bezos's 'Disagree and Commit' + Dweck's Growth Mindset",
    duration: "2 min",
    steps: "3 steps + optional 4th",
    trigger: "Setbacks, failures, rejection, moments when you feel defeated",
    whenToUse: "After any loss, rejection, or mistake—big or small. When you need to move from 'what happened to me' to 'what I do next.'",
  },
  {
    type: "step" as const,
    stepNumber: 1,
    title: "State What Happened",
    duration: "40 sec",
    instruction: "Write one sentence: What occurred. No interpretation, no 'should have,' no blame. Just the event.",
    examples: [
      "\"I didn't get selected\"",
      "\"The project failed\"",
      "\"They said no\"",
    ],
    insight: {
      text: "Separating event from story reduces emotional intensity by 40%",
      source: "Lieberman, 2007",
      wisdom: "Buddhist equanimity — 'This too is arising.'",
    },
  },
  {
    type: "step" as const,
    stepNumber: 2,
    title: "Find What It Revealed",
    duration: "50 sec",
    instruction: "Complete: 'This showed me I need to develop [specific capability or knowledge].'",
    prompt: "Not 'I'm not good enough' → 'I need to learn X'",
    question: "What's the skill gap or blind spot this exposed?",
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
    instruction: "List three things this setback didn't touch:",
    examples: [
      "My work ethic",
      "My curiosity",
      "My ability to start again",
    ],
    insight: {
      text: "Anchoring to stable identity prevents learned helplessness",
      source: "Seligman, 1972",
      quote: {
        text: "You have power over your mind, not outside events.",
        author: "Marcus Aurelius",
      },
    },
  },
  {
    type: "step" as const,
    stepNumber: 4,
    title: "Commit to One Move Forward",
    duration: "40 sec",
    instruction: "\"The next action I take is [specific behavior] by [specific time].\"",
    guidance: "Make it small. Make it soon. Make it specific.",
    principle: "Momentum rebuilds through motion, not planning.",
    insight: {
      wisdom: "Amor fati means loving what happened enough to use it.",
      quote: {
        text: "Failure is an option here. If things are not failing, you are not innovating enough.",
        author: "Musk after SpaceX's third rocket failure",
      },
    },
  },
  {
    type: "science" as const,
    title: "Why This Works",
    content: [
      "Your brain rewires most dramatically during stress and recovery. You're building new neural pathways through adversity.",
      "Hormetic stress (the right dose of challenge) makes you antifragile—stronger than before.",
    ],
    closing: "You're not waiting to get through the mud. You're using the mud.",
  },
];

// Haptic feedback helper
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10); // Light 10ms vibration
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

  // Only buddhist-phoenix is supported currently
  const cards = id === "buddhist-phoenix" ? BUDDHIST_PHOENIX_CARDS : [];

  useEffect(() => {
    if (!api) return;

    setCurrent(api.selectedScrollSnap());
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
      triggerHaptic(); // Haptic feedback on card change
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

  const handleNext = useCallback(() => {
    if (api) {
      api.scrollNext();
      triggerHaptic();
    }
  }, [api]);

  const handleComplete = async () => {
    if (!practice) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Top Navigation */}
      <TopNavigation backPath="/recalibrate/power-up" />

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
              <div className="p-4 pt-16 pb-32 min-h-screen">
                {card.type === "overview" && (
                  <PracticeCard variant="overview">
                    {/* Hero image */}
                    <div className="relative h-40 md:h-48 -mx-6 -mt-6 md:-mx-8 md:-mt-8 mb-6 overflow-hidden rounded-t-3xl">
                      <img
                        src={phoenixHero}
                        alt="Phoenix rising"
                        className="w-full h-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/50 to-transparent" />
                    </div>

                    <div className="flex-1 space-y-5">
                      {/* Title */}
                      <div className="space-y-2">
                        <h1 className="text-2xl md:text-3xl font-serif text-foreground leading-tight">
                          {card.title}
                        </h1>
                        <p className="text-muted-foreground text-sm md:text-base">
                          {card.subtitle}
                        </p>
                      </div>

                      {/* Source */}
                      <div className="px-4 py-3 bg-primary/5 rounded-xl border border-primary/10">
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
                      <div className="space-y-2">
                        <p className="text-xs text-primary uppercase tracking-wide">
                          Trigger
                        </p>
                        <p className="text-sm text-foreground/80">
                          {card.trigger}
                        </p>
                      </div>

                      {/* When to use */}
                      <div className="space-y-2">
                        <p className="text-xs text-primary uppercase tracking-wide">
                          When to Use
                        </p>
                        <p className="text-sm text-foreground/80">
                          {card.whenToUse}
                        </p>
                      </div>
                    </div>
                  </PracticeCard>
                )}

                {card.type === "step" && (
                  <PracticeCard variant="step" stepNumber={card.stepNumber}>
                    <div className="flex-1 space-y-5 pt-12">
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

                      {/* Prompt (if exists) */}
                      {card.prompt && (
                        <p className="text-sm text-muted-foreground italic">
                          {card.prompt}
                        </p>
                      )}

                      {/* Question (if exists) */}
                      {card.question && (
                        <div className="px-4 py-3 bg-primary/10 rounded-xl border border-primary/20">
                          <p className="text-sm text-foreground">
                            🔍 {card.question}
                          </p>
                        </div>
                      )}

                      {/* Examples */}
                      {card.examples && (
                        <div className="space-y-2">
                          {card.examples.map((example, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-sm text-foreground/80"
                            >
                              <span className="text-primary">
                                {card.stepNumber === 3 ? "✓" : "💬"}
                              </span>
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

                      {/* Principle (if exists) */}
                      {card.principle && (
                        <p className="text-sm text-muted-foreground italic">
                          {card.principle}
                        </p>
                      )}

                      {/* Insight box */}
                      {card.insight && (
                        <div className="mt-auto pt-4">
                          <div className="px-4 py-4 bg-primary/5 rounded-xl border border-primary/10 space-y-3">
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
                  </PracticeCard>
                )}

                {card.type === "science" && (
                  <PracticeCard variant="science">
                    <div className="flex-1 flex flex-col justify-center space-y-6">
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

                      <div className="pt-4 border-t border-primary/10">
                        <p className="text-lg text-foreground font-medium italic">
                          {card.closing}
                        </p>
                      </div>
                    </div>
                  </PracticeCard>
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-md mx-auto space-y-4">
          {/* Progress dots */}
          <CardProgress total={cards.length} current={current} />

          {/* Action button */}
          {isLastCard ? (
            <Button
              onClick={handleComplete}
              className="w-full h-14 text-base font-medium rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Mark Complete
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="w-full h-14 text-base font-medium rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Continue
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MicroPracticePlayerCards;
