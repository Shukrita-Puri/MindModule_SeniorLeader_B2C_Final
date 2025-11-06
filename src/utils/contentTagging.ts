/**
 * Content Tagging Engine
 * Maps content to intelligent tags based on energy state, context, and user needs
 */

export type ContentTag = 
  | "power-up" | "pause" | "presence" | "calm" | "ready"
  | "morning" | "afternoon" | "evening" | "night"
  | "pre-meeting" | "post-meeting" | "deadline-pressure" | "travel"
  | "growth" | "performance" | "recovery" | "preparation";

export type ContentType = "micro-practice" | "guided-practice" | "soundscape";

export interface TaggedContent {
  id: string;
  title: string;
  contentType: ContentType;
  duration: number;
  primaryTags: ContentTag[];
  contextTags: ContentTag[];
  energyTags: ContentTag[];
}

/**
 * Match content to current energy state
 */
export function matchContentToEnergyState(
  content: TaggedContent[],
  energyState: {
    dominantElement?: string;
    state?: string;
    balance?: number;
  }
): TaggedContent[] {
  const { balance = 50 } = energyState;
  
  // Low energy: suggest power-up content
  if (balance < 40) {
    return content.filter(c => 
      c.energyTags.includes("power-up") || 
      c.energyTags.includes("ready")
    );
  }
  
  // High energy/stress: suggest pause content
  if (balance > 75) {
    return content.filter(c => 
      c.energyTags.includes("pause") || 
      c.energyTags.includes("calm")
    );
  }
  
  // Balanced: suggest presence content
  return content.filter(c => 
    c.energyTags.includes("presence") || 
    c.primaryTags.includes("growth")
  );
}

/**
 * Match content to time of day
 */
export function matchContentToTimeOfDay(
  content: TaggedContent[]
): TaggedContent[] {
  const hour = new Date().getHours();
  
  let timeTag: ContentTag;
  if (hour >= 5 && hour < 12) timeTag = "morning";
  else if (hour >= 12 && hour < 17) timeTag = "afternoon";
  else if (hour >= 17 && hour < 21) timeTag = "evening";
  else timeTag = "night";
  
  return content.filter(c => 
    c.contextTags.includes(timeTag)
  );
}

/**
 * Match content to calendar context
 */
export function matchContentToCalendarContext(
  content: TaggedContent[],
  upcomingEvents?: any[]
): TaggedContent[] {
  if (!upcomingEvents || upcomingEvents.length === 0) {
    return content;
  }
  
  const hasUpcomingMeeting = upcomingEvents.some(event => 
    event.title?.toLowerCase().includes('meeting')
  );
  
  if (hasUpcomingMeeting) {
    return content.filter(c => 
      c.contextTags.includes("pre-meeting") ||
      c.primaryTags.includes("preparation")
    );
  }
  
  return content;
}

/**
 * Match content to specific outcome goal
 */
export function matchContentToOutcome(
  content: TaggedContent[],
  desiredOutcome: "focus" | "calm" | "energy" | "clarity"
): TaggedContent[] {
  const outcomeMap: Record<string, ContentTag[]> = {
    focus: ["power-up", "ready", "performance"],
    calm: ["pause", "calm", "recovery"],
    energy: ["power-up", "ready"],
    clarity: ["presence", "growth"]
  };
  
  const relevantTags = outcomeMap[desiredOutcome] || [];
  
  return content.filter(c => 
    c.energyTags.some(tag => relevantTags.includes(tag)) ||
    c.primaryTags.some(tag => relevantTags.includes(tag))
  );
}

/**
 * Get content recommendation priority score
 */
export function calculateContentPriority(
  content: TaggedContent,
  context: {
    energyBalance: number;
    timeOfDay: string;
    hasUpcomingEvents: boolean;
    recentCheckIn?: string;
  }
): number {
  let score = 0;
  
  // Energy state matching
  if (context.energyBalance < 40 && content.energyTags.includes("power-up")) {
    score += 30;
  }
  if (context.energyBalance > 75 && content.energyTags.includes("pause")) {
    score += 30;
  }
  
  // Time of day matching
  if (content.contextTags.includes(context.timeOfDay as ContentTag)) {
    score += 20;
  }
  
  // Calendar context
  if (context.hasUpcomingEvents && content.contextTags.includes("pre-meeting")) {
    score += 25;
  }
  
  // Recent check-in alignment
  if (context.recentCheckIn && content.energyTags.includes(context.recentCheckIn as ContentTag)) {
    score += 35;
  }
  
  // Duration preference (shorter content gets slight boost)
  if (content.duration <= 5) {
    score += 10;
  }
  
  return score;
}

/**
 * Generate intelligent content recommendations
 */
export function generateContentRecommendations(
  allContent: TaggedContent[],
  userContext: {
    energyState: { balance: number; dominantElement?: string; state?: string };
    timeOfDay: string;
    upcomingEvents?: any[];
    recentCheckIn?: string;
  },
  limit: number = 3
): TaggedContent[] {
  const { energyState, timeOfDay, upcomingEvents = [], recentCheckIn } = userContext;
  
  // Calculate priority for each content item
  const scoredContent = allContent.map(content => ({
    content,
    score: calculateContentPriority(content, {
      energyBalance: energyState.balance,
      timeOfDay,
      hasUpcomingEvents: upcomingEvents.length > 0,
      recentCheckIn
    })
  }));
  
  // Sort by score and return top matches
  return scoredContent
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.content);
}
