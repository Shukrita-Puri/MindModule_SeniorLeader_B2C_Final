import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Play, 
  Pause,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Clock,
  TrendingUp,
  Lightbulb
} from "lucide-react";
import { toast } from "sonner";
import BreathingAnimation from "@/components/BreathingAnimation";

interface PracticeStep {
  stepNumber: number;
  title: string;
  instruction: string;
  duration: number;
  breathingPattern?: string;
  wisdomNote?: string;
}

interface PracticeData {
  id: string;
  title: string;
  category: string;
  totalDuration: number;
  difficulty: string;
  origin: string;
  fullStory: string;
  whatYouNeed: string[];
  expectedOutcomes: string[];
  usedBy: string;
  steps: PracticeStep[];
  completionMessage: string;
}

const practiceData: Record<string, PracticeData> = {
  "box-breathing": {
    id: "box-breathing",
    title: "Box Breathing Reset",
    category: "High Performer Protocol",
    totalDuration: 300,
    difficulty: "Beginner",
    origin: "Navy SEAL Tactical Protocol",
    fullStory: "Box breathing, also known as square breathing or four-square breathing, is a powerful stress management technique used by Navy SEALs, police officers, nurses, and anyone in high-pressure situations. The practice involves breathing in a pattern of four equal parts: inhale for 4 counts, hold for 4 counts, exhale for 4 counts, hold for 4 counts. This creates a 'box' pattern that brings the nervous system into balance, reduces cortisol, and enhances focus. Studies show it can lower blood pressure, improve emotional regulation, and increase cognitive performance under stress.",
    whatYouNeed: ["Quiet space", "Comfortable seated position", "5 minutes of uninterrupted time"],
    expectedOutcomes: [
      "Immediate stress reduction",
      "Enhanced mental clarity",
      "Improved emotional control",
      "Lowered heart rate and blood pressure"
    ],
    usedBy: "Navy SEALs, Surgeons, First Responders, Athletes",
    steps: [
      {
        stepNumber: 1,
        title: "Find Your Center",
        instruction: "Sit comfortably with your spine straight but not rigid. Rest your hands on your lap or knees. Close your eyes or soften your gaze downward. Take a few natural breaths to settle in.",
        duration: 30,
        wisdomNote: "The Navy SEALs begin every mission brief with this centering practice. Composure precedes action."
      },
      {
        stepNumber: 2,
        title: "Inhale for 4",
        instruction: "Breathe in slowly through your nose for a count of 4. Feel your lungs fill completely, expanding your belly first, then your chest. Count: 1... 2... 3... 4.",
        duration: 60,
        breathingPattern: "Inhale",
        wisdomNote: "Fill your body with oxygen like fuel entering a high-performance engine."
      },
      {
        stepNumber: 3,
        title: "Hold for 4",
        instruction: "Hold your breath at the top of the inhale for 4 counts. Keep your body relaxed—no tension in your shoulders or jaw. Count: 1... 2... 3... 4.",
        duration: 60,
        breathingPattern: "Hold",
        wisdomNote: "In this pause, your body absorbs oxygen and your mind finds stillness."
      },
      {
        stepNumber: 4,
        title: "Exhale for 4",
        instruction: "Slowly exhale through your mouth for a count of 4. Release all the air from your lungs, feeling your belly and chest naturally contract. Count: 1... 2... 3... 4.",
        duration: 60,
        breathingPattern: "Exhale",
        wisdomNote: "With the out-breath, release tension, stress, and mental noise."
      },
      {
        stepNumber: 5,
        title: "Hold Empty for 4",
        instruction: "Hold your breath at the bottom of the exhale for 4 counts. Stay calm and present in this empty space. Count: 1... 2... 3... 4.",
        duration: 60,
        breathingPattern: "Hold",
        wisdomNote: "Emptiness is not absence—it's spaciousness. Here lies your power."
      },
      {
        stepNumber: 6,
        title: "Continue the Box",
        instruction: "Repeat this cycle: Inhale (4) → Hold (4) → Exhale (4) → Hold (4). Let the pattern become automatic. Your mind and body are now in sync, operating as one integrated system.",
        duration: 30,
        wisdomNote: "Three minutes of box breathing before high-stakes moments creates unshakeable composure."
      }
    ],
    completionMessage: "You've mastered the breath. You've mastered the moment."
  },
  "tonglen-breathing": {
    id: "tonglen-breathing",
    title: "Tonglen Compassion Practice",
    category: "Ancient Wisdom",
    totalDuration: 720,
    difficulty: "Intermediate",
    origin: "Buddhist Meditation | Tibet, 9th Century",
    fullStory: "Tonglen (Tibetan for 'sending and taking') is a profound practice from Tibetan Buddhism that reverses our instinctive patterns. Instead of avoiding pain and grasping at pleasure, we breathe in suffering and breathe out relief. This counterintuitive approach develops compassion, dissolves self-centeredness, and creates emotional resilience. Neuroscience research at Stanford shows that Tonglen practice activates brain regions associated with empathy and emotional regulation, literally rewiring our capacity for compassion.",
    whatYouNeed: ["Quiet space", "Open heart", "Willingness to face discomfort", "10-15 minutes"],
    expectedOutcomes: [
      "Increased compassion for self and others",
      "Reduced fear of difficult emotions",
      "Greater emotional resilience",
      "Sense of connection and purpose"
    ],
    usedBy: "Therapists, Caregivers, Spiritual Practitioners",
    steps: [
      {
        stepNumber: 1,
        title: "Establish Your Seat",
        instruction: "Sit in a dignified posture. Feel the ground beneath you. Place one hand on your heart. Take several deep breaths, arriving fully in this moment.",
        duration: 60,
        wisdomNote: "You are safe. You are held. You have the capacity to hold suffering without being destroyed by it."
      },
      {
        stepNumber: 2,
        title: "Connect with Your Own Suffering",
        instruction: "Bring to mind a difficulty you're facing—nothing overwhelming, just a genuine challenge. Feel where it lives in your body. Notice the sensation without trying to fix it.",
        duration: 90,
        wisdomNote: "Your own pain is the gateway to understanding all pain."
      },
      {
        stepNumber: 3,
        title: "Breathe In Your Suffering",
        instruction: "As you inhale, imagine breathing in the dark, heavy quality of your difficulty. You're not making it worse—you're acknowledging it, accepting it, making space for it.",
        duration: 120,
        breathingPattern: "Inhale",
        wisdomNote: "What you resist persists. What you accept transforms."
      },
      {
        stepNumber: 4,
        title: "Breathe Out Relief",
        instruction: "As you exhale, imagine breathing out light, spaciousness, and relief. Send this ease to yourself, to the part of you that's struggling. Give yourself what you most need.",
        duration: 120,
        breathingPattern: "Exhale",
        wisdomNote: "You deserve your own compassion."
      },
      {
        stepNumber: 5,
        title: "Extend to Others",
        instruction: "Now think of someone else facing a similar struggle. As you breathe in, take in their suffering alongside yours. As you breathe out, send relief to both of you, and to all beings facing this challenge.",
        duration: 210,
        wisdomNote: "We suffer together. We heal together. Your liberation is bound to mine."
      },
      {
        stepNumber: 6,
        title: "Rest in Spaciousness",
        instruction: "Let go of the technique. Simply breathe naturally. Notice the space that's been created in your heart. Rest here for a few moments in open awareness.",
        duration: 120,
        wisdomNote: "Compassion is not exhausting—it's liberating. You've just touched the source of infinite strength."
      }
    ],
    completionMessage: "May all beings be free from suffering. May all beings know peace. Starting with you."
  },
  "nile-sunset-meditation": {
    id: "nile-sunset-meditation",
    title: "Nile Sunset Pause Meditation",
    category: "Ancient Restoration",
    totalDuration: 1080,
    difficulty: "Beginner",
    origin: "Ancient Egyptian Temple Practice",
    fullStory: "The ancient Egyptians developed sophisticated meditation practices centered around the Nile River, which they considered the source of all life. Temple priests and priestesses performed sunset rituals to honor Ra's journey into the underworld, using these moments to restore Ma'at—the cosmic balance of truth, justice, and harmony. This practice draws from temple reliefs at Karnak and Luxor showing seated meditation postures, papyrus texts describing breath work (ankh breathing), and archaeological evidence of lotus flower use in contemplative rituals. The Egyptians believed that sunset was a liminal time when the veil between worlds thinned, making it ideal for inner work and divine communication. The practice combines several ritual elements: purifying with sacred water, anointing with temple oils, breath synchronization with natural rhythms, and visualization of the eternal Nile. These weren't separate practices but an integrated system for achieving hotep—deep peace and contentment.",
    whatYouNeed: [
      "Quiet space where you can sit comfortably for 18 minutes",
      "Ability to play audio through speakers or headphones (speakers recommended)",
      "Optional: Blue lotus, frankincense, or jasmine essential oil",
      "Optional: A candle or small bowl of water to focus on",
      "Comfortable cushion or chair with straight spine support",
      "Best practiced at sunset, but effective any time you need balance"
    ],
    expectedOutcomes: [
      "Deep sense of calm and groundedness",
      "Slower, more regulated breathing",
      "Release of daily tension and mental clutter",
      "Connection to something ancient and vast",
      "Feeling of emotional and spiritual balance (Ma'at)",
      "Improved ability to transition from stress to rest (with regular practice)",
      "Enhanced visualization and focus skills",
      "Deeper appreciation for cyclical rhythms in life",
      "Reduced anxiety about endings"
    ],
    usedBy: "Temple Priests, Contemplatives, Those Seeking Balance",
    steps: [
      {
        stepNumber: 1,
        title: "Arrival & Preparation",
        instruction: "Settle into your chosen space. Sit with your spine straight, hands resting on your lap or knees. Close your eyes or soften your gaze. Begin breathing consciously—long, slow breaths through your nose. Feel yourself arriving fully in this present moment.",
        duration: 120,
        wisdomNote: "The ancient Egyptians believed that conscious arrival at sacred practice was half the journey. Let the modern world fall away."
      },
      {
        stepNumber: 2,
        title: "Purification Ritual",
        instruction: "Visualize yourself standing before the great Nile at sunset. Imagine cupping sacred water in your hands and bringing it to your forehead, your heart, your belly. With each touch, feel the water washing away the tensions and concerns of the day. Set your intention: 'I restore Ma'at within myself—truth, balance, harmony.'",
        duration: 120,
        wisdomNote: "Water from the Nile was considered divine. This visualization activates the same neural pathways as actual ritual cleansing."
      },
      {
        stepNumber: 3,
        title: "Descent to the Nile",
        instruction: "In your mind's eye, walk slowly down smooth limestone steps toward the river's edge. With each step down, feel yourself descending deeper into stillness. Count: 10... 9... 8... down to 1. At the bottom, stand at the water's edge and face west, where the sun is setting.",
        duration: 180,
        wisdomNote: "The descent into sacred space mirrors the descent into deeper consciousness. Each step is a release."
      },
      {
        stepNumber: 4,
        title: "Lotus Breath Work (Ankh Breathing)",
        instruction: "Visualize a blue lotus flower floating on the Nile before you. As you inhale, imagine the lotus opening, petals spreading wide. Hold your breath gently at the top. As you exhale, see the lotus closing softly. Repeat this cycle 7 times—the sacred number of Egypt. Breathe in: lotus opens (count 4). Hold (count 4). Breathe out: lotus closes (count 6).",
        duration: 180,
        breathingPattern: "Lotus Pattern",
        wisdomNote: "The ankh symbol represented eternal life. This breath pattern mirrors the ankh's shape—balance between intake and release."
      },
      {
        stepNumber: 5,
        title: "Sunset Contemplation",
        instruction: "Watch the sun descend toward the horizon in your mind's eye. As it touches the water, visualize all your burdens, worries, and struggles being carried away with Ra's golden barque into the underworld. Know that they will be transformed in the night and return renewed. Place your hand on your heart and feel it being weighed against the feather of Ma'at. Feel yourself in perfect balance.",
        duration: 240,
        wisdomNote: "The weighing of the heart ceremony wasn't just about death—it was a daily practice of self-evaluation and balance."
      },
      {
        stepNumber: 6,
        title: "Sacred Stillness (Heron Meditation)",
        instruction: "Become completely still like the sacred heron standing in the shallows at dusk. Don't move a muscle. Simply be. Listen to the sounds around you as if they were the sounds of the ancient Nile—the wind, distant birds, the water's gentle movement. Rest in pure presence. You are held. You are part of the eternal flow.",
        duration: 180,
        wisdomNote: "The heron was sacred to Thoth, god of wisdom. In perfect stillness, wisdom arises naturally."
      },
      {
        stepNumber: 7,
        title: "Return & Integration",
        instruction: "When you're ready, begin climbing back up the limestone steps. With each step up, count from 1 to 10, bringing yourself back to ordinary awareness. But you are not the same person who descended. You carry hotep—deep peace—within you. Place both hands on your heart and bow slightly, honoring the practice. Open your eyes slowly.",
        duration: 60,
        wisdomNote: "The Egyptians knew that sacred practices must be sealed with gratitude. What you honor, you strengthen."
      }
    ],
    completionMessage: "You have restored Ma'at. You have touched the eternal Nile. Hotep—peace be with you."
  },
  "zazen-stone-garden": {
    id: "zazen-stone-garden",
    title: "Zazen in the Stone Garden",
    category: "Zen Wisdom",
    totalDuration: 900,
    difficulty: "Beginner",
    origin: "Japanese Zen Buddhism | 12th-13th Century",
    fullStory: "Zazen, meaning 'seated meditation' in Japanese, is the heart of Zen Buddhism, brought to Japan from China in the 12th-13th centuries by monks Eisai and Dogen. However, its roots extend back to the Buddha himself, who achieved enlightenment through seated meditation 2,500 years ago. The practice was refined in Japanese Zen monasteries, particularly at Eiheiji Temple (founded 1244 CE) and within the Rinzai and Soto Zen schools. Unlike goal-oriented meditation, Zazen embodies the radical principle of 'shikantaza'—'just sitting.' There is no object of meditation, no mantra, no visualization. You simply sit, allowing thoughts to arise and dissolve like clouds passing through an empty sky. This version is set in a traditional Japanese Zen garden (karesansui or 'dry landscape garden'), where monks have practiced for centuries. These gardens of raked gravel, carefully placed stones, and minimal vegetation are designed as three-dimensional expressions of Zen philosophy: Ma (間) - the concept of meaningful emptiness and space between things; Wabi-sabi (侘寂) - finding beauty in imperfection, impermanence, and incompleteness; Fukinsei (不均整) - asymmetry and irregularity as more natural than perfect balance. The practice includes kinhin (walking meditation) as traditionally practiced between sitting periods in Zen monasteries. During Japan's feudal period, even samurai warriors practiced Zazen to cultivate mental clarity and fearlessness before battle.",
    whatYouNeed: [
      "Quiet space where you can sit undisturbed for 15 minutes",
      "Zafu (round meditation cushion) or firm cushion that elevates hips above knees",
      "Alternatively: Seiza bench or chair with firm seat",
      "Loose, comfortable clothing",
      "Optional: Japanese incense (sandalwood, cedar, or temple incense)",
      "Optional: Face a blank wall or simple object (rock, single flower)",
      "Best practiced: Early morning (4-6 AM), evening before sleep, or during transitions"
    ],
    expectedOutcomes: [
      "Profound stillness and spaciousness in the mind",
      "Sense of being 'unhurried' even as thoughts arise",
      "Physical grounding and centered presence",
      "Clarity without trying to be clear",
      "Deep acceptance of what is",
      "Reduced anxiety and mental reactivity (with regular practice)",
      "Enhanced ability to observe thoughts without identification",
      "Improved posture and body awareness",
      "Increased creativity and spontaneous insight",
      "Natural emergence of compassion and wisdom"
    ],
    usedBy: "Zen Monks, Samurai Warriors, Mindfulness Practitioners",
    steps: [
      {
        stepNumber: 1,
        title: "Entering the Garden",
        instruction: "Visualize yourself entering a traditional Zen temple garden at dawn. The raked gravel patterns flow like water around carefully placed stones. Morning mist still clings to moss-covered rocks. You walk mindfully to your seat—a zafu cushion facing a simple stone wall. Upon arriving, perform three prostrations (or simply bow three times from the heart) to honor the practice, the teachers who came before, and your own Buddha nature.",
        duration: 60,
        wisdomNote: "The entrance to the zendo (meditation hall) is sacred threshold. Monks bow upon entering and leaving, acknowledging the transformation that happens within."
      },
      {
        stepNumber: 2,
        title: "Taking the Posture",
        instruction: "Sit on your cushion with your sitting bones elevated above your knees, creating a stable tripod base. Cross your legs in half-lotus, full-lotus, or simply cross-legged (Burmese position). Rock gently side to side, then front to back, finding your center of gravity. Lengthen your spine upward as if a string pulls from the crown of your head. Tuck your chin slightly. Place your hands in the cosmic mudra: left hand resting in right palm, thumbs barely touching to form an oval. Rest hands on your lap. Let your shoulders relax. This posture is dignified, alert, yet at ease.",
        duration: 120,
        wisdomNote: "Dogen taught that the posture itself is enlightenment. You are not sitting to become Buddha—you are sitting as Buddha. Form and essence are one."
      },
      {
        stepNumber: 3,
        title: "The Gaze & Breath",
        instruction: "Rather than closing your eyes completely, lower your gaze to about 45 degrees, resting softly on the floor or wall about three feet in front of you. Eyes are half-open, not focusing on anything in particular—this is called 'just seeing.' Now bring attention to your breath. Do not control it. Do not count it. Simply notice the natural rhythm—the belly rising on the inhale, falling on the exhale. The breath breathes itself.",
        duration: 60,
        wisdomNote: "Half-open eyes prevent drowsiness and dreams. You remain present to reality as it is. Zen is not about escaping the world—it's about being fully here."
      },
      {
        stepNumber: 4,
        title: "Shikantaza - Just Sitting",
        instruction: "Now, just sit. Shikantaza means 'nothing but precisely sitting.' No counting breaths. No mantra. No visualization. Simply be completely present with whatever arises. Thoughts will come—let them. They are like clouds passing through the vast sky of awareness. Don't grasp them. Don't push them away. Notice them arising, notice them passing. You are the sky, not the clouds. When you realize you've been caught in thought, gently return to the physical sensation of sitting—the weight of your body, the flow of breath, the sounds around you. Again and again, return. This is the practice.",
        duration: 420,
        wisdomNote: "This is the most challenging and most profound form of meditation. It requires nothing yet demands everything—total presence without agenda. Suzuki Roshi said: 'The most important thing is remembering the most important thing.'"
      },
      {
        stepNumber: 5,
        title: "Kinhin - Walking Meditation",
        instruction: "When you're ready, slowly stand, bringing the same quality of awareness into movement. Form the shashu hand position: left hand in a fist at heart level, right hand covering it. Walk very slowly—one full breath per half-step. Your gaze remains lowered. Feel the weight shift from heel to toe, the engagement of muscles, the contact with the ground. Walk in a circle or back and forth. This is not walking to get anywhere—it's walking to walk, fully alive in each step.",
        duration: 120,
        wisdomNote: "Kinhin prevents stiffness and demonstrates that Zen practice extends to all activities. Monks walk mindfully between sits, understanding that meditation is not confined to stillness."
      },
      {
        stepNumber: 6,
        title: "Return to Stillness",
        instruction: "Return to your seat and settle back into zazen posture. Take a moment to feel the contrast—movement and stillness, sound and silence, effort and ease. All of it arising in the same awareness. Sit again, completely present. Let everything be exactly as it is. Nothing to fix. Nothing to achieve. Nothing to become. You are already whole. Just this. Just sitting. Just breath. Just being.",
        duration: 90,
        wisdomNote: "The second sit often goes deeper, as body and mind have now settled. Notice how stillness feels more natural now, less forced."
      },
      {
        stepNumber: 7,
        title: "Closing Bows",
        instruction: "When you're ready, bring your hands together at your heart in gassho (prayer position). Bow deeply from this seated position—honoring the practice, your effort, all beings who seek peace. Slowly stand and perform three final bows. As you prepare to leave the garden, know that you carry this quality of presence with you. Every moment is an opportunity for zazen—washing dishes, walking to your car, listening to a friend. This is the Way.",
        duration: 30,
        wisdomNote: "Zen Master Thich Nhat Hanh taught: 'The practice of Zen is forgetting the self in the act of uniting with something.' You have touched this in zazen. Now live it."
      }
    ],
    completionMessage: "The practice of Zen is forgetting the self. You have touched your true nature. Carry this presence into every moment."
  }
};

const GuidedPracticePlayer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<"intro" | "practice" | "complete">("intro");
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stepTimeLeft, setStepTimeLeft] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const practice = id ? practiceData[id] : null;

  useEffect(() => {
    if (isPlaying && view === "practice" && practice) {
      const currentStepData = practice.steps[currentStep];
      
      if (stepTimeLeft === 0) {
        setStepTimeLeft(currentStepData.duration);
      }

      intervalRef.current = window.setInterval(() => {
        setStepTimeLeft((prev) => {
          if (prev <= 1) {
            // Move to next step or complete
            if (currentStep < practice.steps.length - 1) {
              setCurrentStep(currentStep + 1);
              return practice.steps[currentStep + 1].duration;
            } else {
              setIsPlaying(false);
              setView("complete");
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, view, currentStep, stepTimeLeft, practice]);

  if (!practice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Practice not found</p>
          <Button onClick={() => navigate("/guided-practices")}>
            Return to Library
          </Button>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Intro View
  if (view === "intro") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/guided-practices")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Library
          </Button>

          <div className="space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-4xl md:text-5xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
                {practice.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-gold" />
                  {practice.origin}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {Math.floor(practice.totalDuration / 60)} min
                </span>
                <span>{practice.difficulty}</span>
              </div>
            </div>

            {/* Origin Story */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold text-gold">Origin & History</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {practice.fullStory}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>Used by: {practice.usedBy}</span>
                </div>
              </CardContent>
            </Card>

            {/* What You'll Need */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold text-gold">What You'll Need</h2>
                <ul className="space-y-2">
                  {practice.whatYouNeed.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-gold mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Expected Outcomes */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold text-gold">Expected Outcomes</h2>
                <ul className="space-y-2">
                  {practice.expectedOutcomes.map((outcome, index) => (
                    <li key={index} className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-gold mt-1" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Step Preview */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold text-gold">Practice Journey</h2>
                <p className="text-muted-foreground">
                  {practice.steps.length} steps • {Math.floor(practice.totalDuration / 60)} minutes
                </p>
                <div className="space-y-2">
                  {practice.steps.map((step, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm">
                      <span className="text-gold font-mono">{index + 1}</span>
                      <span className="text-muted-foreground">{step.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatTime(step.duration)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Begin Button */}
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setView("practice");
                setStepTimeLeft(practice.steps[0].duration);
                toast.success("Practice started");
              }}
            >
              Begin Practice
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Practice View
  if (view === "practice") {
    const currentStepData = practice.steps[currentStep];
    const overallProgress = ((currentStep) / practice.steps.length) * 100;
    const stepProgress = ((currentStepData.duration - stepTimeLeft) / currentStepData.duration) * 100;

    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background flex flex-col">
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsPlaying(false);
              setView("intro");
              setCurrentStep(0);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Exit
          </Button>
          <span className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {practice.steps.length}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4">
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-3xl mx-auto">
          {/* Step Title */}
          <h2 className="text-3xl md:text-4xl font-serif text-center mb-4 bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent">
            {currentStepData.title}
          </h2>

          {/* Breathing Visual */}
          {currentStepData.breathingPattern && (
            <div className="my-8">
              <BreathingAnimation />
            </div>
          )}

          {/* Instruction */}
          <Card className="w-full mb-6">
            <CardContent className="pt-6">
              <p className="text-lg leading-relaxed text-center">
                {currentStepData.instruction}
              </p>
            </CardContent>
          </Card>

          {/* Wisdom Note */}
          {currentStepData.wisdomNote && (
            <div className="flex items-start gap-3 bg-gold/5 border border-gold/20 rounded-lg p-4 mb-6 max-w-2xl">
              <Lightbulb className="h-5 w-5 text-gold flex-shrink-0 mt-0.5" />
              <p className="text-sm italic text-muted-foreground">
                {currentStepData.wisdomNote}
              </p>
            </div>
          )}

          {/* Timer */}
          <div className="text-center mb-8">
            <p className="text-5xl font-mono font-light text-gold">
              {formatTime(stepTimeLeft)}
            </p>
            <Progress value={stepProgress} className="w-64 mx-auto mt-4 h-1" />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (currentStep > 0) {
                  setCurrentStep(currentStep - 1);
                  setStepTimeLeft(practice.steps[currentStep - 1].duration);
                  setIsPlaying(false);
                }
              }}
              disabled={currentStep === 0}
              className="h-12 w-12"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <Button
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-16 w-16 rounded-full"
            >
              {isPlaying ? (
                <Pause className="h-8 w-8" />
              ) : (
                <Play className="h-8 w-8 ml-1" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (currentStep < practice.steps.length - 1) {
                  setCurrentStep(currentStep + 1);
                  setStepTimeLeft(practice.steps[currentStep + 1].duration);
                  setIsPlaying(false);
                } else {
                  setView("complete");
                }
              }}
              className="h-12 w-12"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Completion View
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-6">
        <CheckCircle2 className="h-20 w-20 text-gold mx-auto" />
        <h1 className="text-4xl md:text-5xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent">
          Practice Complete
        </h1>
        
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-xl italic text-muted-foreground">
              {practice.completionMessage}
            </p>
            
            <div className="pt-4 border-t border-border text-sm text-muted-foreground space-y-2">
              <p>Practice: {practice.title}</p>
              <p>Duration: {Math.floor(practice.totalDuration / 60)} minutes</p>
              <p>Steps completed: {practice.steps.length}</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4 justify-center flex-wrap">
          <Button onClick={() => {
            setView("practice");
            setCurrentStep(0);
            setStepTimeLeft(practice.steps[0].duration);
          }}>
            Practice Again
          </Button>
          <Button variant="outline" onClick={() => navigate("/guided-practices")}>
            Explore More
          </Button>
          <Button variant="outline" onClick={() => navigate("/executive-home")}>
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GuidedPracticePlayer;
