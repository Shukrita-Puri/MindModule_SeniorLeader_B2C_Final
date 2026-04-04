import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Play, 
  Pause,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Clock,
  TrendingUp,
  Lightbulb,
  Volume2,
  Volume1,
  VolumeX,
  SkipBack,
  SkipForward,
  ChevronDown,
  Repeat
} from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import BreathingAnimation from "@/components/BreathingAnimation";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import TopNavigation from "@/components/simulation/TopNavigation";
import PracticeRatingModal from "@/components/PracticeRatingModal";
import PracticeQueueProgress from "@/components/PracticeQueueProgress";
import { getContentById, PracticeStep as ImportedPracticeStep } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating, markPlanCompleteForFeedback, setPlanFeedbackFlag } from "@/utils/relevanceFeedback";
import { updateRitualCompletion } from "@/utils/dailyRituals";
import { trackSanctuaryEvent } from "@/utils/sanctuaryEventTracking";
import { cn } from "@/lib/utils";

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

// Practice data now comes from practicesAndSoundscapes.ts
const getPracticeData = (id: string): PracticeData | null => {
  const content = getContentById(id);
  if (!content || content.contentType !== "guided-practice") return null;
  
  // Convert imported practice steps to local format with step numbers
  const steps: PracticeStep[] = content.practiceSteps?.map((step, index) => ({
    stepNumber: index + 1,
    title: step.title,
    instruction: step.instruction,
    duration: step.duration,
    breathingPattern: step.breathingPattern,
    wisdomNote: step.wisdomNote
  })) || [];
  
  const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
  
  return {
    id: content.id,
    title: content.title,
    category: content.category,
    totalDuration,
    difficulty: content.difficulty || "Beginner",
    origin: content.origin || "",
    fullStory: content.fullStory || "",
    whatYouNeed: content.whatYouNeed || [],
    expectedOutcomes: content.expectedOutcomes || [],
    usedBy: content.usedBy || "",
    steps,
    completionMessage: content.completionQuote || "You've completed the practice."
  };
};

// Legacy practice data for backwards compatibility
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
        instruction: "Hold your breath at the top of the inhale for 4 counts. Keep your body relaxed–no tension in your shoulders or jaw. Count: 1... 2... 3... 4.",
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
        wisdomNote: "Emptiness is not absence–it's spaciousness. Here lies your power."
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
        instruction: "Bring to mind a difficulty you're facing–nothing overwhelming, just a genuine challenge. Feel where it lives in your body. Notice the sensation without trying to fix it.",
        duration: 90,
        wisdomNote: "Your own pain is the gateway to understanding all pain."
      },
      {
        stepNumber: 3,
        title: "Breathe In Your Suffering",
        instruction: "As you inhale, imagine breathing in the dark, heavy quality of your difficulty. You're not making it worse–you're acknowledging it, accepting it, making space for it.",
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
        wisdomNote: "Compassion is not exhausting–it's liberating. You've just touched the source of infinite strength."
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
    fullStory: "The ancient Egyptians developed sophisticated meditation practices centered around the Nile River, which they considered the source of all life. Temple priests and priestesses performed sunset rituals to honor Ra's journey into the underworld, using these moments to restore Ma'at–the cosmic balance of truth, justice, and harmony. This practice draws from temple reliefs at Karnak and Luxor showing seated meditation postures, papyrus texts describing breath work (ankh breathing), and archaeological evidence of lotus flower use in contemplative rituals. The Egyptians believed that sunset was a liminal time when the veil between worlds thinned, making it ideal for inner work and divine communication. The practice combines several ritual elements: purifying with sacred water, anointing with temple oils, breath synchronization with natural rhythms, and visualization of the eternal Nile. These weren't separate practices but an integrated system for achieving hotep–deep peace and contentment.",
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
        instruction: "Settle into your chosen space. Sit with your spine straight, hands resting on your lap or knees. Close your eyes or soften your gaze. Begin breathing consciously–long, slow breaths through your nose. Feel yourself arriving fully in this present moment.",
        duration: 120,
        wisdomNote: "The ancient Egyptians believed that conscious arrival at sacred practice was half the journey. Let the modern world fall away."
      },
      {
        stepNumber: 2,
        title: "Purification Ritual",
        instruction: "Visualize yourself standing before the great Nile at sunset. Imagine cupping sacred water in your hands and bringing it to your forehead, your heart, your belly. With each touch, feel the water washing away the tensions and concerns of the day. Set your intention: 'I restore Ma'at within myself–truth, balance, harmony.'",
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
        instruction: "Visualize a blue lotus flower floating on the Nile before you. As you inhale, imagine the lotus opening, petals spreading wide. Hold your breath gently at the top. As you exhale, see the lotus closing softly. Repeat this cycle 7 times–the sacred number of Egypt. Breathe in: lotus opens (count 4). Hold (count 4). Breathe out: lotus closes (count 6).",
        duration: 180,
        breathingPattern: "Lotus Pattern",
        wisdomNote: "The ankh symbol represented eternal life. This breath pattern mirrors the ankh's shape–balance between intake and release."
      },
      {
        stepNumber: 5,
        title: "Sunset Contemplation",
        instruction: "Watch the sun descend toward the horizon in your mind's eye. As it touches the water, visualize all your burdens, worries, and struggles being carried away with Ra's golden barque into the underworld. Know that they will be transformed in the night and return renewed. Place your hand on your heart and feel it being weighed against the feather of Ma'at. Feel yourself in perfect balance.",
        duration: 240,
        wisdomNote: "The weighing of the heart ceremony wasn't just about death–it was a daily practice of self-evaluation and balance."
      },
      {
        stepNumber: 6,
        title: "Sacred Stillness (Heron Meditation)",
        instruction: "Become completely still like the sacred heron standing in the shallows at dusk. Don't move a muscle. Simply be. Listen to the sounds around you as if they were the sounds of the ancient Nile–the wind, distant birds, the water's gentle movement. Rest in pure presence. You are held. You are part of the eternal flow.",
        duration: 180,
        wisdomNote: "The heron was sacred to Thoth, god of wisdom. In perfect stillness, wisdom arises naturally."
      },
      {
        stepNumber: 7,
        title: "Return & Integration",
        instruction: "When you're ready, begin climbing back up the limestone steps. With each step up, count from 1 to 10, bringing yourself back to ordinary awareness. But you are not the same person who descended. You carry hotep–deep peace–within you. Place both hands on your heart and bow slightly, honoring the practice. Open your eyes slowly.",
        duration: 60,
        wisdomNote: "The Egyptians knew that sacred practices must be sealed with gratitude. What you honor, you strengthen."
      }
    ],
    completionMessage: "You have restored Ma'at. You have touched the eternal Nile. Hotep–peace be with you."
  },
  "zazen-stone-garden": {
    id: "zazen-stone-garden",
    title: "Zazen in the Stone Garden",
    category: "Zen Wisdom",
    totalDuration: 900,
    difficulty: "Beginner",
    origin: "Japanese Zen Buddhism | 12th-13th Century",
    fullStory: "Zazen, meaning 'seated meditation' in Japanese, is the heart of Zen Buddhism, brought to Japan from China in the 12th-13th centuries by monks Eisai and Dogen. However, its roots extend back to the Buddha himself, who achieved enlightenment through seated meditation 2,500 years ago. The practice was refined in Japanese Zen monasteries, particularly at Eiheiji Temple (founded 1244 CE) and within the Rinzai and Soto Zen schools. Unlike goal-oriented meditation, Zazen embodies the radical principle of 'shikantaza'–'just sitting.' There is no object of meditation, no mantra, no visualization. You simply sit, allowing thoughts to arise and dissolve like clouds passing through an empty sky. This version is set in a traditional Japanese Zen garden (karesansui or 'dry landscape garden'), where monks have practiced for centuries. These gardens of raked gravel, carefully placed stones, and minimal vegetation are designed as three-dimensional expressions of Zen philosophy: Ma (間) - the concept of meaningful emptiness and space between things; Wabi-sabi (侘寂) - finding beauty in imperfection, impermanence, and incompleteness; Fukinsei (不均整) - asymmetry and irregularity as more natural than perfect balance. The practice includes kinhin (walking meditation) as traditionally practiced between sitting periods in Zen monasteries. During Japan's feudal period, even samurai warriors practiced Zazen to cultivate mental clarity and fearlessness before battle.",
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
        instruction: "Visualize yourself entering a traditional Zen temple garden at dawn. The raked gravel patterns flow like water around carefully placed stones. Morning mist still clings to moss-covered rocks. You walk mindfully to your seat–a zafu cushion facing a simple stone wall. Upon arriving, perform three prostrations (or simply bow three times from the heart) to honor the practice, the teachers who came before, and your own Buddha nature.",
        duration: 60,
        wisdomNote: "The entrance to the zendo (meditation hall) is sacred threshold. Monks bow upon entering and leaving, acknowledging the transformation that happens within."
      },
      {
        stepNumber: 2,
        title: "Taking the Posture",
        instruction: "Sit on your cushion with your sitting bones elevated above your knees, creating a stable tripod base. Cross your legs in half-lotus, full-lotus, or simply cross-legged (Burmese position). Rock gently side to side, then front to back, finding your center of gravity. Lengthen your spine upward as if a string pulls from the crown of your head. Tuck your chin slightly. Place your hands in the cosmic mudra: left hand resting in right palm, thumbs barely touching to form an oval. Rest hands on your lap. Let your shoulders relax. This posture is dignified, alert, yet at ease.",
        duration: 120,
        wisdomNote: "Dogen taught that the posture itself is enlightenment. You are not sitting to become Buddha–you are sitting as Buddha. Form and essence are one."
      },
      {
        stepNumber: 3,
        title: "The Gaze & Breath",
        instruction: "Rather than closing your eyes completely, lower your gaze to about 45 degrees, resting softly on the floor or wall about three feet in front of you. Eyes are half-open, not focusing on anything in particular–this is called 'just seeing.' Now bring attention to your breath. Do not control it. Do not count it. Simply notice the natural rhythm–the belly rising on the inhale, falling on the exhale. The breath breathes itself.",
        duration: 60,
        wisdomNote: "Half-open eyes prevent drowsiness and dreams. You remain present to reality as it is. Zen is not about escaping the world–it's about being fully here."
      },
      {
        stepNumber: 4,
        title: "Shikantaza - Just Sitting",
        instruction: "Now, just sit. Shikantaza means 'nothing but precisely sitting.' No counting breaths. No mantra. No visualization. Simply be completely present with whatever arises. Thoughts will come–let them. They are like clouds passing through the vast sky of awareness. Don't grasp them. Don't push them away. Notice them arising, notice them passing. You are the sky, not the clouds. When you realize you've been caught in thought, gently return to the physical sensation of sitting–the weight of your body, the flow of breath, the sounds around you. Again and again, return. This is the practice.",
        duration: 420,
        wisdomNote: "This is the most challenging and most profound form of meditation. It requires nothing yet demands everything–total presence without agenda. Suzuki Roshi said: 'The most important thing is remembering the most important thing.'"
      },
      {
        stepNumber: 5,
        title: "Kinhin - Walking Meditation",
        instruction: "When you're ready, slowly stand, bringing the same quality of awareness into movement. Form the shashu hand position: left hand in a fist at heart level, right hand covering it. Walk very slowly–one full breath per half-step. Your gaze remains lowered. Feel the weight shift from heel to toe, the engagement of muscles, the contact with the ground. Walk in a circle or back and forth. This is not walking to get anywhere–it's walking to walk, fully alive in each step.",
        duration: 120,
        wisdomNote: "Kinhin prevents stiffness and demonstrates that Zen practice extends to all activities. Monks walk mindfully between sits, understanding that meditation is not confined to stillness."
      },
      {
        stepNumber: 6,
        title: "Return to Stillness",
        instruction: "Return to your seat and settle back into zazen posture. Take a moment to feel the contrast–movement and stillness, sound and silence, effort and ease. All of it arising in the same awareness. Sit again, completely present. Let everything be exactly as it is. Nothing to fix. Nothing to achieve. Nothing to become. You are already whole. Just this. Just sitting. Just breath. Just being.",
        duration: 90,
        wisdomNote: "The second sit often goes deeper, as body and mind have now settled. Notice how stillness feels more natural now, less forced."
      },
      {
        stepNumber: 7,
        title: "Closing Bows",
        instruction: "When you're ready, bring your hands together at your heart in gassho (prayer position). Bow deeply from this seated position–honoring the practice, your effort, all beings who seek peace. Slowly stand and perform three final bows. As you prepare to leave the garden, know that you carry this quality of presence with you. Every moment is an opportunity for zazen–washing dishes, walking to your car, listening to a friend. This is the Way.",
        duration: 30,
        wisdomNote: "Zen Master Thich Nhat Hanh taught: 'The practice of Zen is forgetting the self in the act of uniting with something.' You have touched this in zazen. Now live it."
      }
    ],
    completionMessage: "The practice of Zen is forgetting the self. You have touched your true nature. Carry this presence into every moment."
  },
  "bhramari-pranayama": {
    id: "bhramari-pranayama",
    title: "Bhramari Pranayama - The Humming Bee Breath",
    category: "Ancient Flow",
    totalDuration: 720,
    difficulty: "Beginner",
    origin: "Ancient Vedic Meditation | 5000 years",
    fullStory: "Bhramari Pranayama originates from ancient India, dating back at least 5,000 years to the Vedic period. The name comes from the Sanskrit word 'bhramari,' meaning 'bee,' as the practice mimics the gentle humming sound of a black Indian bee. Referenced in the Hatha Yoga Pradipika (15th century) and earlier tantric texts, this practice was used by yogis to achieve Pratyahara–the withdrawal of senses from external distractions and deep inward focus. The humming vibration was believed to activate the Ajna chakra (third eye) and still the fluctuations of the mind. Ancient practitioners discovered that the internal vibration creates a deeply meditative state where the mind naturally becomes absorbed in the sound, making it one of the most effective techniques for entering flow states. Vedic sages called this state 'one-pointed awareness' or Dharana–the precursor to meditation and eventual samadhi (transcendent consciousness). The practice was traditionally performed at dawn or dusk in quiet forest settings, where yogis would sync their humming with the natural sounds of bees pollinating flowers. Modern neuroscience confirms what ancient yogis knew: the vibration stimulates the vagus nerve, activating the parasympathetic nervous system while simultaneously focusing attention.",
    whatYouNeed: [
      "Quiet space where you can sit comfortably for 12 minutes",
      "Ability to hum without disturbing others (or practice during private time)",
      "Chair or cushion for upright seated position",
      "Optional: Earplugs or finger position to close ears (enhances internal sound)",
      "Optional: Sandalwood, lotus, or jasmine incense/oil",
      "Optional: Dim lighting or eye mask to reduce visual distraction",
      "Best practiced: During mid-day energy dips, before creative work, or when feeling scattered"
    ],
    expectedOutcomes: [
      "Profound mental stillness and clarity",
      "Sensation of pleasant vibration in the skull and face",
      "Immediate reduction in mental chatter and anxiety",
      "Feeling of being 'centered' and present",
      "Instant access to focused attention state",
      "Enhanced ability to drop into flow states quickly (with regular practice)",
      "Improved concentration and sustained attention",
      "Better emotional regulation",
      "Relief from tension headaches"
    ],
    usedBy: "Yogis, Meditators, Focus Seekers, Creative Professionals",
    steps: [
      {
        stepNumber: 1,
        title: "Sacred Arrival",
        instruction: "Find a comfortable seated position with your spine naturally upright. Close your eyes gently. Take three deep breaths, feeling your body settle into the earth. Allow your shoulders to soften, your jaw to release. Bring your awareness to the natural rhythm of your breath–no need to change it yet, simply observe.",
        duration: 90,
        wisdomNote: "The ancient yogis taught that how you arrive at practice determines its depth. Come with reverence, as if entering a sacred temple."
      },
      {
        stepNumber: 2,
        title: "Pranayama Preparation",
        instruction: "Raise your hands to your face. Place your thumbs gently in your ears to close them, or rest your index fingers on the tragus (the small cartilage flap) and press gently to seal the ear canal. Your remaining fingers rest lightly on your face. This is Shanmukhi Mudra–sealing the six gates of perception. Feel the immediate shift into inner space.",
        duration: 90,
        wisdomNote: "When the outer sound disappears, the inner sound becomes audible. This is where transformation happens."
      },
      {
        stepNumber: 3,
        title: "First Humming Cycle",
        instruction: "Take a deep breath in through your nose. As you exhale, keep your mouth gently closed and create a smooth, steady humming sound–'mmmmmmm'–like a contented bee. Feel the vibration in your skull, face, and throat. The pitch doesn't matter; choose what feels natural. Complete three rounds: inhale deeply, exhale with the hum for as long as comfortable. Between rounds, take a normal breath and observe the resonance still vibrating within you.",
        duration: 120,
        breathingPattern: "Bee Breath",
        wisdomNote: "The bee doesn't force its hum–it arises naturally from its being. Let your sound be effortless, arising from your center."
      },
      {
        stepNumber: 4,
        title: "Deep Immersion Rounds",
        instruction: "Now begin 12 continuous rounds of Bhramari. Inhale slowly and deeply through your nose. Exhale with the bee breath, letting the hum be smooth and steady for the entire length of your exhale. Don't rush–quality over quantity. With each round, feel the vibration deepening, resonating in new places: your third eye, the crown of your head, your entire skull becoming a resonance chamber. Let your mind be absorbed completely in the sound. If thoughts arise, let them dissolve into the humming. The sound is your anchor, your home.",
        duration: 300,
        breathingPattern: "Deep Bhramari",
        wisdomNote: "Ancient texts say: 'The yogi who practices Bhramari becomes lord of his mind, just as the bee is lord of its hive.'"
      },
      {
        stepNumber: 5,
        title: "Silent Absorption",
        instruction: "After your final hum, gently lower your hands to your lap. Keep your eyes closed. Sit in complete stillness. Notice the profound silence that follows the practice–it feels different than ordinary silence. There's a spaciousness, a clarity, a vibration still echoing. This is the fruit of practice. Simply rest here, absorbed in presence.",
        duration: 90,
        wisdomNote: "The silence after Bhramari is called 'Nada'–the inner cosmic sound. Ancient yogis would meditate on this sound for hours, using it as a gateway to higher consciousness."
      },
      {
        stepNumber: 6,
        title: "Return & Integration",
        instruction: "Begin to deepen your breath. Wiggle your fingers and toes. When you're ready, gently open your eyes. Take a moment to bow inwardly to the practice, to the ancient lineage that preserved it, and to your own commitment to inner work. Carry this clarity forward into whatever comes next.",
        duration: 30,
        wisdomNote: "The practice ends, but its effects continue. You've trained your nervous system to access this state–it will become easier each time."
      }
    ],
    completionMessage: "You have touched the ancient sound of Nada. You have entered the hive of consciousness. Carry this resonance with you."
  },
  "trataka-flame-gaze": {
    id: "trataka-flame-gaze",
    title: "Trataka - The Steady Flame Gaze",
    category: "Ancient Focus",
    totalDuration: 480,
    difficulty: "Beginner",
    origin: "Ancient Yogic Practice | Hatha Yoga Pradipika",
    fullStory: "Trataka is one of the six purification practices (Shatkarma) described in the Hatha Yoga Pradipika, a 15th-century Sanskrit text, though the practice itself dates back much earlier to tantric traditions of ancient India. The word 'Trataka' comes from Sanskrit, meaning 'to gaze steadily.' Unlike ordinary seeing, Trataka involves focused, unwavering attention on a single point–traditionally a candle flame, though it can be practiced with a black dot, a symbol (yantra), the moon, or even a still body of water. Ancient yogis discovered that the eyes are the gateway to the mind. By training the eyes to remain perfectly still, the mind naturally follows into deep concentration. This practice was considered essential preparation for meditation, as it develops Ekagrata–one-pointed attention–the foundation of all yogic and flow states. The flame was chosen as the ideal object because fire has a mesmerizing, magnetic quality that naturally draws attention, the flickering creates enough movement to maintain interest without overwhelming, the afterimage created when closing the eyes stimulates the Ajna chakra (third eye), and fire represents consciousness itself in Vedic philosophy. Tantric texts describe Trataka as a direct path to stilling the 'monkey mind' and achieving instant access to meditative absorption. Modern research confirms this: studies show that Trataka increases gamma brainwave activity associated with peak concentration and flow states.",
    whatYouNeed: [
      "One candle (any size, unscented works best to avoid distraction)",
      "Matches or lighter",
      "Stable surface at eye level when seated (table, altar, or shelf)",
      "Comfortable seated position 3-4 feet from the candle",
      "Optional: Eye drops if your eyes are sensitive",
      "Safety: Ensure candle is on stable, fire-safe surface with no drafts",
      "Best practiced: Before deep work, in the morning, or when feeling scattered"
    ],
    expectedOutcomes: [
      "Profound mental clarity and focus",
      "Complete cessation of mental chatter",
      "Sense of absorption where time disappears",
      "Slight tingling or pressure at the third eye center",
      "Instant entry into flow state",
      "Dramatically improved concentration (with regular practice)",
      "Ability to enter flow states at will",
      "Enhanced visualization abilities",
      "Greater emotional stability and mental resilience"
    ],
    usedBy: "Yogis, Meditators, High Performers, Creative Professionals",
    steps: [
      {
        stepNumber: 1,
        title: "Sacred Setup",
        instruction: "Light your candle and place it on a stable surface at eye level, about 3-4 feet away from where you'll sit. Ensure the room is dim or dark, with no other light sources. Sit comfortably with your spine upright–on a cushion or chair. Take three deep breaths. Set your intention: 'I dedicate this practice to developing unwavering focus and inner clarity.' Feel the reverence of this ancient ritual.",
        duration: 60,
        wisdomNote: "Fire has been humanity's meditation object for millennia. You are joining an unbroken lineage of seekers gazing into flames."
      },
      {
        stepNumber: 2,
        title: "Soft Gazing Preparation",
        instruction: "Look at the flame with soft, relaxed eyes. Don't stare harshly–imagine you're looking at someone you love. Let your eyes rest naturally on the brightest part of the flame, just above the wick where it glows most intensely. Your eyes should feel comfortable, not strained. Blink naturally a few times, then allow the blinks to slow down. Breathe normally through your nose.",
        duration: 60,
        wisdomNote: "Trataka is not about forcing–it's about magnetism. Let the flame draw your attention naturally, like falling in love."
      },
      {
        stepNumber: 3,
        title: "First Gaze Cycle",
        instruction: "Now gaze at the flame without blinking for 30 seconds. Keep your eyes soft but steady. The flame is the only thing that exists. When your eyes begin to water (which is natural and purifying), gently close them. With eyes closed, observe the afterimage of the flame–it will appear in your inner vision, usually as a glowing shape at your forehead center. Watch it shift colors, move, fade. Don't try to hold it; simply observe. After 30 seconds, open your eyes again.",
        duration: 90,
        wisdomNote: "The afterimage is your third eye awakening. Ancient yogis called this 'inner fire'–the light of consciousness itself."
      },
      {
        stepNumber: 4,
        title: "Deep Immersion Cycles",
        instruction: "Begin three rounds of deeper gazing. Each round: gaze steadily at the flame for 45 seconds without blinking, then close your eyes for 30 seconds to observe the afterimage. With each round, feel yourself sinking deeper into absorption. Your mind becomes quieter. The boundary between you and the flame begins to dissolve. There is just seeing. Just presence. Just this. If your mind wanders, the flame gently calls it back. If thoughts arise, watch them dissolve in the fire.",
        duration: 210,
        breathingPattern: "Natural",
        wisdomNote: "Hatha Yoga Pradipika states: 'By practicing Trataka, all eye diseases vanish and clairvoyance is induced.' The ancient yogis were mapping consciousness itself."
      },
      {
        stepNumber: 5,
        title: "Final Extended Gaze",
        instruction: "For this final minute, gaze at the flame with complete, unwavering attention. You are not trying anymore–you are simply absorbed. The flame is not separate from you. You are the witness of the flame. You are the flame witnessing itself. Let time disappear. Let the room disappear. Let everything dissolve into this single point of light. When tears come, let them flow–they are purifying. When the minute ends, close your eyes one last time.",
        duration: 60,
        wisdomNote: "This is Ekagrata–one-pointed absorption. You've just experienced what athletes call 'the zone,' what mystics call Samadhi."
      },
      {
        stepNumber: 6,
        title: "Integration",
        instruction: "Sit with eyes closed for 30 seconds, feeling the afterimage fade. Rub your palms together vigorously until they're warm, then place them gently over your closed eyes (called 'palming'). Feel the warmth soothing your eyes. Take three deep breaths. When ready, open your eyes slowly. Bow to the flame in gratitude, then safely extinguish it. Notice how the world looks sharper, clearer, more vivid.",
        duration: 30,
        wisdomNote: "The practice ends, but the focus remains. You can return to this state at will now–the neural pathway has been carved."
      }
    ],
    completionMessage: "You have trained the eyes. You have stilled the mind. You have touched the eternal flame within. Carry this focus into your work."
  },
  "kapalabhati-pranayama": {
    id: "kapalabhati-pranayama",
    title: "Kapalabhati Pranayama - Skull Shining Breath",
    category: "Ancient Power",
    totalDuration: 360,
    difficulty: "Intermediate",
    origin: "Ancient Yogic Practice | Hatha Yoga",
    fullStory: "Kapalabhati, literally meaning 'skull shining' or 'forehead luster' in Sanskrit, is one of the six classical cleansing techniques (Shatkarma) described in ancient yogic texts including the Hatha Yoga Pradipika (15th century) and Gheranda Samhita (17th century). This practice dates back thousands of years to the early development of Hatha Yoga in India, where yogis discovered that rapid, forceful exhalations could purify the nadis (energy channels), expel stale air and toxins from the lungs, and generate immediate vitality and mental clarity. The technique was traditionally practiced at dawn, after cleansing rituals, to prepare the body and mind for meditation. Ancient yogis believed that Kapalabhati clears the frontal brain region (bringing luminosity to the mind), activates the manipura chakra (solar plexus - the seat of personal power), balances the three doshas in Ayurvedic medicine, and increases prana (life force) throughout the entire system. Unlike gentle breathing practices, Kapalabhati is vigorous and heating. The rapid diaphragmatic pumping creates an internal massage of the organs, stimulates the sympathetic nervous system, and floods the body with oxygen and energy. Modern studies show it increases metabolic rate, improves lung capacity, and triggers the release of endorphins. This is not a meditation–it's an activation. Warriors and yogis alike used this technique before battle, intense practice, or any situation requiring peak physical and mental performance.",
    whatYouNeed: [
      "Empty stomach (at least 2 hours after eating) - CRITICAL",
      "Comfortable seated position with straight spine",
      "Box of tissues nearby (practice clears the sinuses)",
      "Water to drink afterward",
      "DO NOT PRACTICE IF: Pregnant, high blood pressure, heart conditions, hernia, menstruating, epilepsy, or if you feel dizzy",
      "Optional: Peppermint or eucalyptus oil for invigoration",
      "Best practiced: First thing in morning, before workouts, or mid-afternoon energy slumps"
    ],
    expectedOutcomes: [
      "Surge of energy and vitality",
      "Complete mental clarity and alertness",
      "Feeling of internal heat and activation",
      "Tingling sensations throughout the body",
      "Completely clear sinuses and lungs",
      "Euphoric, empowered feeling",
      "Significantly increased energy levels (with regular practice)",
      "Improved lung capacity and respiratory health",
      "Stronger core muscles",
      "Reduced need for caffeine"
    ],
    usedBy: "Yogis, Warriors, Athletes, High Performers",
    steps: [
      {
        stepNumber: 1,
        title: "Preparation & Technique",
        instruction: "Sit upright with your spine straight–on a cushion or chair. Place your hands on your knees or belly. Close your eyes. Take three natural breaths. Now learn the technique: the exhale is sharp, forceful, and active–pull your belly in toward your spine like a quick pump. The inhale is passive and automatic–just release your belly and air flows in naturally. Practice 10 slow pumps now to get the rhythm: sharp exhale (belly in), passive inhale (belly out). Don't force the inhale; let it happen naturally.",
        duration: 60,
        wisdomNote: "The ancient yogis called this 'bellows breath'–like a blacksmith pumping bellows to stoke fire. You are stoking your inner fire."
      },
      {
        stepNumber: 2,
        title: "First Activation Round",
        instruction: "Take a deep breath in and let it out. Now begin: 30 rapid breaths at the pace of about 1 per second. Sharp exhales, passive inhales. Pump from your belly. Let your body find its rhythm. After 30 breaths, take one final deep inhale, fill your lungs completely, and hold for as long as comfortable (aim for 15-30 seconds). When you need to breathe, exhale slowly and return to normal breathing. Notice the energy flowing through you.",
        duration: 60,
        breathingPattern: "Rapid Pumping",
        wisdomNote: "You've just expelled stale air that's been sitting in your lungs. Fresh prana is flooding your system."
      },
      {
        stepNumber: 3,
        title: "Second Power Round",
        instruction: "Take a moment to feel the effects–tingling, warmth, clarity. When ready, take another deep breath and begin: 50 rapid breaths this time, slightly faster than before. Let the rhythm become automatic–your belly pumping like a powerful engine. Sharp exhales, passive inhales. After 50, take one final massive inhale, hold it for 20-40 seconds or as long as comfortable. Feel the pressure building in your skull–this is the 'skull shining.' Exhale slowly. Breathe normally for a few breaths.",
        duration: 90,
        breathingPattern: "Intense Pumping",
        wisdomNote: "The Sanskrit texts describe this feeling as 'tejas'–radiant inner fire. Your manipura chakra is awakening."
      },
      {
        stepNumber: 4,
        title: "Peak Performance Round",
        instruction: "This is the peak round. Take a deep breath. Begin: 70-100 rapid breaths, as fast as you can maintain with control. Let yourself become the breath–there's no you anymore, just this pumping rhythm. Your core is on fire. Your mind is crystal clear. Every cell is alive. After your count, take one final enormous inhale, hold it as long as you possibly can (aim for 30-60 seconds). Feel the pressure at your third eye. When you absolutely must breathe, exhale slowly through your mouth with a sigh. Rest in stillness.",
        duration: 120,
        breathingPattern: "Maximum Power",
        wisdomNote: "Warriors used this before battle. You've just accessed your primal power. This is what you're capable of."
      },
      {
        stepNumber: 5,
        title: "Integration Breath",
        instruction: "Return to normal, natural breathing. Don't try to control it–just observe. Notice the profound effects: your heart rate, the energy coursing through your limbs, the clarity in your mind, the warmth in your body. You may feel slightly euphoric, empowered, invincible. This is your natural state when obstacles are cleared. Sit with this for 30 seconds, just breathing and feeling.",
        duration: 30,
        wisdomNote: "The ancient texts promise: 'By this practice, one becomes radiant, diseases are destroyed, and perfect health is attained.'"
      },
      {
        stepNumber: 6,
        title: "Seal & Rise",
        instruction: "Place both hands on your belly, feeling the power center you've just activated. Set your intention: 'I carry this fire into my day. I am energized, focused, unstoppable.' Take three deep breaths. When ready, open your eyes slowly. Stand up mindfully. Drink water. Go conquer your day.",
        duration: 30,
        wisdomNote: "You've just done what yogis have done for 5,000 years to access superhuman energy. This is your birthright. Practice daily."
      }
    ],
    completionMessage: "Your skull is shining. Your fire is lit. You are fully activated. Now go do the impossible."
  },
  "spartan-battle-breath": {
    id: "spartan-battle-breath",
    title: "The Spartan Battle Breath - Ancient Greek Warrior Activation",
    category: "Warrior Power",
    totalDuration: 420,
    difficulty: "Intermediate",
    origin: "Ancient Spartan Warrior Protocol | 480 BCE",
    fullStory: "This practice is reconstructed from historical accounts of Spartan warrior preparation rituals, particularly the pre-battle practices performed before the Battle of Thermopylae (480 BCE) and other legendary conflicts. Ancient Greek warriors, especially the Spartans, understood that the mind and body must be unified, energized, and fearless before combat. Historical sources including Plutarch's 'Sayings of Spartans' and Xenophon's 'Polity of the Lacedaemonians' describe how Spartan warriors performed specific breathing exercises combined with physical movements and battle cries before engaging in warfare. The Spartans believed that Pneuma (breath/spirit) was the essence of life force and courage, controlled breathing expanded the chest making warriors appear larger and more intimidating, rhythmic forceful breathing synchronized groups of soldiers creating unified energy, and the paean (war cry) expelled fear and summoned divine favor from Apollo and Ares. Before battle, Spartan warriors would form into phalanx formation, begin slow deep rhythmic breathing synchronized with their fellows, gradually increase the pace while stamping the ground with their shields, culminate in powerful battle cries that could be heard across the battlefield, and enter a state called 'menos'–divine fury or battle-trance. This practice combines historical accounts with what we know about warrior cultures worldwide: controlled hyperventilation increases adrenaline, reduces fear response, heightens pain tolerance, and creates a transcendent state of fearless presence. This is not meditation. This is activation for peak performance.",
    whatYouNeed: [
      "Standing space where you can move and make noise",
      "Privacy (you will shout)",
      "Empty stomach",
      "Comfortable, unrestricting clothing",
      "DO NOT PRACTICE IF: Heart conditions, high blood pressure, pregnant, recent injuries, prone to panic attacks",
      "Optional: Rosemary or pine oil (Mediterranean warrior scents)",
      "Optional: A stick or object to grip (simulates spear/sword)",
      "Best practiced: Before competitions, difficult conversations, high-stakes moments, or as morning ritual"
    ],
    expectedOutcomes: [
      "Massive surge of adrenaline and energy",
      "Feeling of invincibility and fearlessness",
      "Complete mental focus and clarity",
      "Heightened physical strength and pain tolerance",
      "Powerful posture and commanding presence",
      "Primal, empowered mental state",
      "Complete absence of doubt or hesitation",
      "Significantly increased confidence (with regular practice)",
      "Enhanced physical power and endurance",
      "Leadership qualities and commanding presence"
    ],
    usedBy: "Spartan Warriors, Athletes, Leaders, Competitors",
    steps: [
      {
        stepNumber: 1,
        title: "Warrior's Stance",
        instruction: "Stand with feet shoulder-width apart, knees slightly bent. Roll your shoulders back and down. Lift your chest proudly. Plant your feet like roots growing into the earth–you are immovable. If you have a prop (stick, weight, etc.), grip it firmly in your right hand like a spear. Close your eyes. Visualize yourself as a Spartan warrior standing in formation with 299 brothers before battle. You are about to do something extraordinary. Set your intention: 'I am fearless. I am powerful. I am ready.'",
        duration: 60,
        wisdomNote: "The Spartans inscribed on their shields: 'Ἢ τὰν ἢ ἐπὶ τᾶς' (Come back with your shield or on it). Total commitment. No retreat. This is that energy."
      },
      {
        stepNumber: 2,
        title: "Shield Wall Breathing",
        instruction: "Begin slow, deep breathing through your nose. Inhale for 4 counts, expanding your chest as wide as possible–imagine holding a massive shield. Hold for 2 counts. Exhale for 4 counts through your mouth with control. As you breathe, feel yourself synchronizing with thousands of invisible warriors around you. You breathe together. You are one organism. Repeat this cycle 10 times. With each breath, feel power building in your core, in your legs, in your chest.",
        duration: 90,
        breathingPattern: "Deep Warrior Breath",
        wisdomNote: "The phalanx formation was invincible because it moved as one. You are learning to harness collective warrior energy."
      },
      {
        stepNumber: 3,
        title: "Battle March Activation",
        instruction: "Now increase the pace: inhale for 2 counts, exhale for 2 counts–faster, more forceful. As you breathe, begin to add movement: stomp your feet in rhythm with your breath. Left foot stomp (inhale), right foot stomp (exhale). Let the rhythm intensify. If you're holding an object, raise it and lower it with each breath. Your breathing becomes audible, powerful–like bellows. Feel your heart rate rising. Feel adrenaline beginning to flood your system. You are marching toward battle. Faster now. Build the intensity. Let guttural sounds emerge from your exhales–'HAH!'",
        duration: 120,
        breathingPattern: "Forceful March",
        wisdomNote: "Ancient sources describe the Spartans approaching battle in perfect rhythm, their unified breathing and footsteps creating a sound like thunder."
      },
      {
        stepNumber: 4,
        title: "The Paean - War Cry",
        instruction: "This is the crescendo. Take three massive breaths–huge inhales, explosive exhales. With each exhale, release a powerful shout from your deepest core: 'HA!' (or 'AROO!' in Spartan tradition). Don't hold back–let it be primal, animalistic, fearsome. Breath 1: 'HA!' Breath 2: louder 'HA!' Breath 3: maximum power 'HA!' Now, take one final enormous inhale, raise your arms or weapon overhead, and release the longest, loudest war cry you can produce–let it last 10-15 seconds. Empty every ounce of air. Expel all fear, all doubt, all weakness. You are MENOS–divine warrior fury incarnate.",
        duration: 90,
        breathingPattern: "War Cry",
        wisdomNote: "Plutarch wrote that the Spartan war cry was so terrifying that enemies would flee before the battle even began. You are channeling 2,500 years of warrior spirit."
      },
      {
        stepNumber: 5,
        title: "Menos - Battle Trance",
        instruction: "After the cry, stand in powerful stillness. Breathe naturally but notice: you are transformed. Your chest is expanded. Your eyes are fierce. Your body is flooded with adrenaline and endorphins. You feel no fear. You feel unstoppable. This is the warrior state–menos. Hold this for one full minute. Breathe naturally. Feel the power coursing through you. You could run through walls. You could face any challenge. This is your true nature when all limitations are stripped away. Remember this feeling. This is who you actually are.",
        duration: 60,
        wisdomNote: "The 300 Spartans held Thermopylae for three days in this state. You now have access to the same transcendent courage. Use it wisely."
      },
      {
        stepNumber: 6,
        title: "Return of the Victor",
        instruction: "Begin to slow your breathing. Place one hand on your heart, one on your belly. Bow your head slightly in warrior's honor–honoring your ancestors, your lineage, your own courage. Take three deep, calming breaths. Say aloud or internally: 'I am ready. I am powerful. I am fearless.' When you open your eyes, you are returning not as who you were, but as a warrior who knows their true strength. Stand tall. You carry this with you now.",
        duration: 30,
        wisdomNote: "The Spartans never celebrated before battle–only after. But they fought with absolute certainty of their worth. You have just tapped that certainty. Go forth and conquer."
      }
    ],
    completionMessage: "Μολὼν λαβέ (Come and take them). You are the warrior. You are the storm. Nothing can stop you. Now go claim your victory."
  }
};

const GuidedPracticePlayer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<"intro" | "practice" | "complete" | "rating" | "audio">("intro");
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stepTimeLeft, setStepTimeLeft] = useState(0);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const intervalRef = useRef<number | null>(null);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isOriginOpen, setIsOriginOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  // Practice Queue State
  const [practiceQueue, setPracticeQueue] = useState<any[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [isInQueue, setIsInQueue] = useState(false);

  // Try to get practice from new data structure first, fallback to legacy
  const practice = id ? (getPracticeData(id) || practiceData[id]) : null;
  const contentData = id ? getContentById(id) : null;

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

  // Determine if this is an audio-based practice
  const isAudioPractice = contentData?.audioSrc && (
    id === 'box-breathing' || 
    id === 'energy-forge' ||
    id === 'bhramari-pranayama' ||
    id === 'trataka-flame-gaze'
  );

  // Auto-set view to audio if it's an audio practice
  useEffect(() => {
    if (isAudioPractice && view === "intro") {
      setView("audio");
    }
  }, [isAudioPractice]);

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
              handlePracticeComplete();
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

  // Check if navigated from ritual
  const fromRitual = location.state?.fromRitual || false;
  const fromIntervention = location.state?.fromIntervention || false;

  const getCategoryPath = () => {
    // If from daily ritual or JIT intervention, return to executive home
    if (fromRitual || fromIntervention) return '/executive-home';
    
    // Use the practice's actual category to determine back path
    if (!practice) return '/recalibrate';
    
    const category = practice.category;
    if (category === 'pause') return '/recalibrate/pause';
    if (category === 'power-up') return '/recalibrate/power-up';
    if (category === 'presence') return '/recalibrate/presence';
    if (category === 'flow') return '/recalibrate/presence';
    return '/recalibrate';
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
          fromRitual: true,
          entryContext: { entryPoint: 'practice_complete', lastAction: `completed guided practice`, triggeredBy: null }
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
    }
  };

  const handlePracticeComplete = async () => {
    // Save practice session to database
    try {
      if (practice) {
        const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
        const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
        
        // Queue is source of truth for ritual membership
        const shouldTrackRitual = isPartOfRitual;
        
        // Single consolidated tracking call (writes to both sanctuary_events + practice_sessions)
        const result = await trackSanctuaryEvent({
          eventType: 'session_complete',
          contentId: practice.id,
          contentType: 'guided-practice',
          category: practice.category as 'pause' | 'power-up' | 'presence',
          tags: [],
          duration: practice.totalDuration,
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
          console.log('[GuidedPracticePlayer] Calling updateRitualCompletion:', { id, queueLength: queue?.length });
          await updateRitualCompletion('guided_practice', id, queue || undefined);
          console.log('[GuidedPracticePlayer] updateRitualCompletion complete');
        }
      }
    } catch (error) {
      console.error('Failed to save practice session:', error);
    }
    
    // Skip individual rating modal when in a plan queue
    if (isInQueue) {
      handleQueueComplete();
    } else {
      setView("rating");
    }
  };

  if (!practice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Practice not found</p>
          <Button onClick={() => navigate("/recalibrate")}>
            Return to Recalibrate
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

  // Audio player functions
  const toggleAudioPlayback = () => {
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsAudioPlaying(!isAudioPlaying);
    }
  };

  const skipAudio = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
    }
  };

  // Audio player effects
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsAudioPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const formatTimeAudio = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAudioPlayPause = () => {
    if (!audioRef.current) return;

    if (!hasStarted) {
      setHasStarted(true);
    }

    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      // Track engagement when audio starts
      const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
      const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
      
      if (isPartOfRitual) {
        trackEngagement('daily_ritual_practice');
      } else if (practice?.category === 'power-up') {
        trackEngagement('renew_session');
      }

      audioRef.current.play().catch(err => {
        toast.error("Failed to play audio");
        console.error("Audio play error:", err);
      });
      setIsAudioPlaying(true);
      toast.success("Practice started");
    }
  };

  const handleAudioSkip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0, 
      Math.min(audioRef.current.currentTime + seconds, duration)
    );
  };

  const handleAudioEnded = async () => {
    setIsAudioPlaying(false);
    
    if (isLooping && audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setIsAudioPlaying(true);
      return;
    }

    // Save practice session via consolidated tracking
    try {
      if (practice) {
        const result = await trackSanctuaryEvent({
          eventType: 'session_complete',
          contentId: practice.id,
          contentType: 'guided-practice',
          category: practice.category as 'pause' | 'power-up' | 'presence',
          tags: [],
          duration: Math.floor(duration),
          timestamp: new Date().toISOString(),
          contextData: {
            timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening',
            dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
          },
          metadata: { title: practice.title }
        });

        if (result.data?.practiceSessionId) {
          setSessionId(result.data.practiceSessionId);
        }
      }
    } catch (error) {
      console.error('Failed to save practice session:', error);
    }
    
    // Skip individual rating modal when in a plan queue
    if (isInQueue) {
      handleQueueComplete();
    } else {
      setView("rating");
    }
  };

  const audioProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Audio View (Soundscape-style for audio practices like Kapalabhati)
  if (view === "audio" && isAudioPractice && contentData) {
    return (
      <div className="relative min-h-screen overflow-hidden animate-page-enter">
        {/* Full-screen background with luxury filter */}
        <div className="fixed inset-0 -z-10">
          <img
            src={contentData.thumbnail}
            alt={practice?.title}
            className="w-full h-full object-cover"
            style={{ filter: (practice.category === 'presence' || practice.category === 'flow') ? 'saturate(0.6) sepia(15%) hue-rotate(85deg) brightness(0.9) contrast(1.1)' : 'brightness(0.85) contrast(1.1) saturate(1.2)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-taupe-rich/30 to-black/50" />
        </div>

        {/* Navigation */}
        <TopNavigation backPath={getCategoryPath()} />

        {/* Practice Queue Progress - show when part of ritual */}
        {isInQueue && practice && (
          <PracticeQueueProgress
            currentIndex={currentQueueIndex}
            totalCount={practiceQueue.length}
            queue={practiceQueue}
            onSkip={handleQueueSkip}
            onPause={handleQueuePause}
            onComplete={handleQueueComplete}
          />
        )}

        {!hasStarted ? (
          /* Initial State - Center everything */
          <div className="relative flex flex-col items-center justify-center min-h-screen px-6">
            <div className="text-center mb-8">
              <h1 className="text-[28px] md:text-5xl font-headline font-semibold text-white mb-4 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                {practice?.title}
              </h1>
              <p className="text-white/80 text-[13px] md:text-sm font-body leading-relaxed max-w-md mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                {contentData.storyHook}
              </p>
            </div>

            {/* Large play button */}
            <Button
              onClick={handleAudioPlayPause}
              className={cn(
                "w-24 h-24 md:w-32 md:h-32 rounded-full mb-6",
                "bg-gradient-to-br from-saffron via-gold to-gold",
                "hover:scale-110 active:scale-95 transition-all duration-500 ease-out",
                "shadow-[0_0_40px_rgba(212,175,55,0.6)]",
                "hover:shadow-[0_0_80px_rgba(212,175,55,0.9)]",
                "animate-[pulse_3s_ease-in-out_infinite]"
              )}
            >
              <Play className="w-10 h-10 md:w-12 md:h-12 text-white ml-1 transition-transform duration-300" />
            </Button>

            <p className="text-white/80 text-[13px] md:text-sm font-hint tracking-wide mb-8">
              Tap to begin
            </p>

            {/* Pre-Practice Instructions Collapsible */}
            {(contentData?.technique || (contentData?.benefits && contentData.benefits.length > 0) || (contentData?.whatYouNeed && contentData.whatYouNeed.length > 0)) && (
              <div className="w-full max-w-md">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-gradient-to-r from-taupe/20 to-gold/10 backdrop-blur-md border border-gold/30 text-white hover:from-taupe/30 hover:to-gold/20 hover:border-gold/50"
                    >
                      <span className="flex items-center gap-2 text-xs font-hint">
                        Technique & Instructions
                        <ChevronDown className="w-3 h-3 transition-transform [&[data-state=open]]:rotate-180" />
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-3xl p-6 bg-white/15 backdrop-blur-md border border-white/40 space-y-3 max-h-[40vh] overflow-y-auto">
                        {contentData?.technique && (
                          <div>
                            <h3 className="text-xs uppercase tracking-wide text-white/50 font-body font-semibold mb-1">Technique</h3>
                            <p className="text-white/80 text-xs leading-relaxed font-body">{contentData.technique}</p>
                          </div>
                        )}
                        {contentData?.benefits && contentData.benefits.length > 0 && (
                          <div>
                            <h3 className="text-xs uppercase tracking-wide text-white/50 font-body font-semibold mb-1">Benefits</h3>
                            <ul className="space-y-1">
                              {contentData.benefits.map((benefit: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-white/80 text-xs font-body">
                                  <span className="text-white/50 mt-0.5">•</span>
                                  <span>{benefit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {contentData?.whatYouNeed && contentData.whatYouNeed.length > 0 && (
                          <div>
                            <h3 className="text-xs uppercase tracking-wide text-white/50 font-body font-semibold mb-1">What You Need</h3>
                            <ul className="space-y-1">
                              {contentData.whatYouNeed.map((item: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-white/80 text-xs font-body">
                                  <span className="text-white/50 mt-0.5">•</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>
        ) : (
          /* Playing State - Title at top, controls at bottom */
          <>
            <div className="relative z-20 pt-24 px-4 text-center">
              <h1 className="text-xl md:text-2xl font-headline text-white mb-2 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                {practice?.title}
              </h1>
              <p className="text-white/80 text-xs md:text-sm font-body leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                {contentData?.storyHook || practice?.origin}
              </p>
            </div>

            {/* Bottom control bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-taupe-rich/50 to-black/40 backdrop-blur-xl border-t border-gold/20 rounded-t-2xl px-4 py-3 pb-safe">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/90 font-hint min-w-[40px]">
                    {formatTimeAudio(currentTime)}
                  </span>
                  
                  <div className="flex-1 relative">
                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-gold via-saffron to-gold transition-all duration-500 ease-out relative overflow-hidden"
                        style={{ width: `${audioProgress}%` }}
                      >
                        {isAudioPlaying && (
                          <div 
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                            style={{ backgroundSize: '200% 100%' }}
                          />
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={duration || 0}
                      value={currentTime}
                      onChange={(e) => {
                        const time = Number(e.target.value);
                        setCurrentTime(time);
                        if (audioRef.current) {
                          audioRef.current.currentTime = time;
                        }
                      }}
                      className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
                    />
                  </div>

                  <span className="text-xs text-white/90 font-hint min-w-[40px] text-right">
                    {formatTimeAudio(duration)}
                  </span>
                </div>
              </div>

              {/* Single row controls */}
              <div className="flex items-center justify-center gap-2 md:gap-3 mb-3">
                {/* Skip Back 15s */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAudioSkip(-15)}
                  disabled={currentTime === 0}
                  className="text-white/80 hover:text-gold hover:bg-gold/10"
                >
                  <SkipBack className="w-5 h-5" />
                </Button>

                {/* Play/Pause */}
                <Button
                  onClick={handleAudioPlayPause}
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-saffron via-gold to-gold hover:scale-110 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:shadow-[0_0_30px_rgba(212,175,55,0.7)]"
                >
                  {isAudioPlaying ? (
                    <Pause className="w-6 h-6 text-white transition-all duration-200" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-0.5 transition-all duration-200" />
                  )}
                </Button>

                {/* Skip Forward 15s */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAudioSkip(15)}
                  disabled={duration > 0 && currentTime >= duration}
                  className="text-white/80 hover:text-gold hover:bg-gold/10"
                >
                  <SkipForward className="w-5 h-5" />
                </Button>

                {/* Spacer */}
                <div className="w-3 md:w-6" />

                {/* Volume Controls */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-white/80 hover:text-gold hover:bg-gold/10"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : volume < 50 ? (
                    <Volume1 className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>

                <div className="w-20 md:w-32">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    onValueChange={(val) => {
                      setVolume(val[0]);
                      if (val[0] > 0) setIsMuted(false);
                    }}
                    max={100}
                    step={1}
                    className="[&_[role=slider]]:bg-gold [&_[role=slider]]:border-white [&_[role=slider]]:shadow-[0_0_10px_rgba(212,175,55,0.5)]"
                  />
                </div>

                {/* Spacer */}
                <div className="w-3 md:w-6" />

                {/* Loop Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsLooping(!isLooping)}
                  className={cn(
                    "text-white/80 hover:text-gold hover:bg-gold/10",
                    isLooping && "text-gold bg-gold/10"
                  )}
                >
                  <Repeat className="w-5 h-5" />
                </Button>
              </div>

              {/* Origin Story Collapsible */}
              <Collapsible open={showStory} onOpenChange={setShowStory}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-gradient-to-r from-taupe/20 to-gold/10 backdrop-blur-md border border-gold/30 text-white hover:from-taupe/30 hover:to-gold/20 hover:border-gold/50"
                  >
                    <span className="flex items-center gap-2 text-xs font-hint">
                      Origin & Technique
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform",
                        showStory && "rotate-180"
                      )} />
                    </span>
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <Card className="mt-2 bg-gradient-to-b from-taupe-rich/40 via-black/70 to-black/80 backdrop-blur-xl border border-gold/20 rounded-xl">
                    <CardContent className="pt-4 pb-3 space-y-3 max-h-[40vh] overflow-y-auto">
                      <div>
                        <h3 className="text-gold font-body font-semibold text-sm mb-1">The Story</h3>
                        <p className="text-white/80 text-xs leading-relaxed font-body">
                          {contentData.fullStory}
                        </p>
                      </div>

                      {contentData.technique && (
                        <div>
                          <h3 className="text-gold font-body font-semibold text-sm mb-1">Technique</h3>
                          <p className="text-white/80 text-xs leading-relaxed font-body">
                            {contentData.technique}
                          </p>
                        </div>
                      )}

                      {contentData.benefits && contentData.benefits.length > 0 && (
                        <div>
                          <h3 className="text-gold font-body font-semibold text-sm mb-1">Benefits</h3>
                          <ul className="space-y-1">
                            {contentData.benefits.map((benefit, index) => (
                              <li key={index} className="flex items-start gap-2 text-white/80 text-xs font-body">
                                <span className="text-gold mt-0.5">•</span>
                                <span>{benefit}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {contentData.completionQuote && (
                        <div className="pt-2 border-t border-gold/10">
                          <p className="text-gold/80 text-xs italic font-body">
                            "{contentData.completionQuote}"
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </>
        )}

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src={contentData.audioSrc}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={handleAudioEnded}
          onError={(e) => {
            toast.error("Failed to load audio");
            console.error("Audio error:", e);
          }}
          preload="metadata"
        />
      </div>
    );
  }

  // Intro View
  if (view === "intro") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background animate-page-enter">
        <TopNavigation backPath={getCategoryPath()} />
        
        {/* Practice Queue Progress - show when part of ritual */}
        {isInQueue && practice && (
          <PracticeQueueProgress
            currentIndex={currentQueueIndex}
            totalCount={practiceQueue.length}
            queue={practiceQueue}
            onSkip={handleQueueSkip}
            onPause={handleQueuePause}
            onComplete={handleQueueComplete}
          />
        )}
        
        <div className={cn("max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4 md:space-y-6", isInQueue ? "pt-36" : "pt-20")}>
            {/* Hero Image */}
            {getContentById(id!)?.thumbnail && (
              <div className="w-full max-h-64 md:max-h-80 overflow-hidden rounded-xl bg-muted">
                <img 
                  src={getContentById(id!)!.thumbnail} 
                  alt={practice.title}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Header */}
            <div>
              <h1 className="text-2xl md:text-4xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
                {practice.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 md:h-4 md:w-4 text-gold" />
                  {practice.origin}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 md:h-4 md:w-4" />
                  {Math.floor(practice.totalDuration / 60)} min
                </span>
                <span>{practice.difficulty}</span>
              </div>
            </div>

            {/* Origin Story - Collapsible */}
            <Collapsible open={isOriginOpen} onOpenChange={setIsOriginOpen}>
              <Card>
                <CardContent className="pt-4 md:pt-6 space-y-3 md:space-y-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full group">
                    <h2 className="text-base md:text-lg font-semibold text-gold">Origin & History</h2>
                    <ChevronDown className={`h-4 w-4 text-gold transition-transform ${isOriginOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {practice.fullStory}
                    </p>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground pt-2">
                      <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                      <span>Used by: {practice.usedBy}</span>
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>

            {/* What You'll Need */}
            <Card>
              <CardContent className="pt-4 md:pt-6 space-y-3 md:space-y-4">
                <h2 className="text-base md:text-lg font-semibold text-gold">What You'll Need</h2>
                <ul className="space-y-2">
                  {practice.whatYouNeed.map((item, index) => (
                    <li 
                      key={index} 
                      className={`flex items-start gap-2 text-sm md:text-base ${
                        item.startsWith('⚠️') || item.includes('DO NOT') 
                          ? 'text-red-500 font-semibold' 
                          : 'text-muted-foreground'
                      }`}
                    >
                      <span className="text-gold mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Expected Outcomes */}
            <Card>
              <CardContent className="pt-4 md:pt-6 space-y-3 md:space-y-4">
                <h2 className="text-base md:text-lg font-semibold text-gold">Expected Outcomes</h2>
                <ul className="space-y-2">
                  {practice.expectedOutcomes.map((outcome, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm md:text-base text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 md:h-4 md:w-4 text-gold mt-1" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Step Preview */}
            <Card>
              <CardContent className="pt-4 md:pt-6 space-y-3 md:space-y-4">
                <h2 className="text-base md:text-lg font-semibold text-gold">Practice Journey</h2>
                <p className="text-sm md:text-base text-muted-foreground">
                  {practice.steps.length} steps • {Math.floor(practice.totalDuration / 60)} minutes
                </p>
                <div className="space-y-2">
                  {practice.steps.map((step, index) => (
                    <div key={index} className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                      <span className="text-gold font-mono text-xs">{index + 1}</span>
                      <span className="text-muted-foreground flex-1">{step.title}</span>
                      <span className="text-xs text-muted-foreground">
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
                // Track engagement
                const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
                const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
                
                if (isPartOfRitual) {
                  trackEngagement('daily_ritual_practice');
                } else if (practice.category === 'pause') {
                  trackEngagement('pause_session');
                } else if (practice.category === 'power-up') {
                  trackEngagement('renew_session');
                } else if (practice.category === 'presence' || practice.category === 'flow') {
                  trackEngagement('flow_session');
                }
                
                setView("practice");
                setStepTimeLeft(practice.steps[0].duration);
                // Auto-start audio if available
                const content = getContentById(id!);
                if (content?.audioSrc && audioRef.current) {
                  audioRef.current.play();
                  setIsAudioPlaying(true);
                }
                toast.success("Practice started");
              }}
            >
              Begin Practice
            </Button>

            {/* Hidden audio element */}
            {getContentById(id!)?.audioSrc && (
              <audio ref={audioRef} src={getContentById(id!)!.audioSrc} />
            )}
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
        <TopNavigation backPath={getCategoryPath()} />
        
        {/* Step Counter */}
        <div className="fixed right-4 md:right-6 z-40" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}>
          <span className="text-xs md:text-sm text-muted-foreground bg-card/80 backdrop-blur-sm px-2 md:px-3 py-1 rounded-full border border-gold/20">
            Step {currentStep + 1} of {practice.steps.length}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="px-4 md:px-6 py-3 md:py-4 pt-20">
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12 max-w-3xl mx-auto">
          {/* Step Title */}
          <h2 className="text-xl md:text-3xl font-serif text-center mb-3 md:mb-4 bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent">
            {currentStepData.title}
          </h2>

          {/* Waveform Visualizer or Breathing Visual */}
          {isAudioPlaying ? (
            <div className="my-6 md:my-8">
              <WaveformVisualizer isActive={isAudioPlaying} color="primary" />
            </div>
          ) : currentStepData.breathingPattern ? (
            <div className="my-6 md:my-8">
              <BreathingAnimation />
            </div>
          ) : null}

          {/* Instruction */}
          <Card className="w-full mb-4 md:mb-6">
            <CardContent className="pt-4 md:pt-6">
              <p className="text-sm md:text-base leading-relaxed text-center">
                {currentStepData.instruction}
              </p>
            </CardContent>
          </Card>

          {/* Wisdom Note */}
          {currentStepData.wisdomNote && (
            <div className="flex items-start gap-2 md:gap-3 bg-gold/5 border border-gold/20 rounded-lg p-3 md:p-4 mb-4 md:mb-6 max-w-2xl">
              <Lightbulb className="h-4 w-4 md:h-5 md:w-5 text-gold flex-shrink-0 mt-0.5" />
              <p className="text-xs md:text-sm italic text-muted-foreground">
                {currentStepData.wisdomNote}
              </p>
            </div>
          )}

          {/* Timer */}
          <div className="text-center mb-6 md:mb-8">
            <p className="text-3xl md:text-5xl font-mono font-light text-gold">
              {formatTime(stepTimeLeft)}
            </p>
            <Progress value={stepProgress} className="w-48 md:w-64 mx-auto mt-3 md:mt-4 h-1" />
          </div>

          {/* Practice Controls */}
          <div className="flex items-center gap-4 md:gap-6 mb-4">
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
              className="h-10 w-10 md:h-12 md:w-12"
            >
              <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
            </Button>

            <Button
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-14 w-14 md:h-16 md:w-16 rounded-full"
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 md:h-8 md:w-8" />
              ) : (
                <Play className="h-7 w-7 md:h-8 md:w-8 ml-1" />
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
                  handlePracticeComplete();
                }
              }}
              className="h-10 w-10 md:h-12 md:w-12"
            >
              <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          </div>

          {/* Audio Controls (if audio available) */}
          {getContentById(id!)?.audioSrc && (
            <Card className="w-full max-w-2xl mt-6">
              <CardContent className="pt-4 md:pt-6 space-y-3 md:space-y-4">
                <div className="flex items-center justify-between gap-3 md:gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => skipAudio(-15)}
                    className="h-8 w-8 md:h-10 md:w-10"
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleAudioPlayback}
                    className="h-10 w-10 md:h-12 md:w-12"
                  >
                    {isAudioPlaying ? (
                      <Pause className="h-5 w-5 md:h-6 md:w-6" />
                    ) : (
                      <Play className="h-5 w-5 md:h-6 md:w-6 ml-0.5" />
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => skipAudio(15)}
                    className="h-8 w-8 md:h-10 md:w-10"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-2 flex-1 max-w-32">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsMuted(!isMuted)}
                      className="h-8 w-8"
                    >
                      {isMuted ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Slider
                      value={[volume]}
                      onValueChange={(value) => setVolume(value[0])}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                </div>
                
                <div className="text-xs md:text-sm text-center text-muted-foreground">
                  {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} / {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Rating View
  if (view === "rating") {
    const handleRatingSubmit = async (rating: number, feedback?: string) => {
      await submitPracticeRating(sessionId, practice.id, 'guided-practice', rating, feedback);
      toast.success("Thank you for your feedback!");
      
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
        markPlanCompleteForFeedback();
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
        toast.success('🎉 Plan complete!');
        navigate('/executive-home');
      } else {
        // Check for JIT intervention data (single practice case)
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
        navigate(getCategoryPath());
      }
    };

    const handleRatingSkip = () => {
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
      } else if (isInQueue) {
        markPlanCompleteForFeedback();
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
        toast.success('🎉 Ritual complete!');
        navigate('/executive-home');
      } else {
        // Check for JIT intervention data (single practice case)
        const jitData = localStorage.getItem('jitInterventionData');
        if (jitData) {
          try {
            const { coachPrompt, flowType, eventTitle } = JSON.parse(jitData);
            localStorage.removeItem('jitInterventionData');
            toast.success('Practice complete! Opening Coach...');
            navigate('/coach', {
              state: {
                flowType,
                initialPrompt: coachPrompt,
                fromIntervention: true,
                eventTitle
              }
            });
            return;
          } catch (e) {
            console.error('Error parsing JIT data:', e);
          }
        }
        navigate(getCategoryPath());
      }
    };

    return (
      <PracticeRatingModal
        contentId={practice.id}
        contentType="guided-practice"
        contentTitle={practice.title}
        category={practice.category}
        sessionId={sessionId}
        onSubmit={handleRatingSubmit}
        onSkip={handleRatingSkip}
      />
    );
  }

  // Completion screen removed – post-practice navigates directly to category page
  return null;
};

export default GuidedPracticePlayer;
