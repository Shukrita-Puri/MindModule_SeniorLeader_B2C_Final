/**
 * Protocol Matcher Utility
 * Maps AI coach recommendations to actual practices in sanctuaryContent
 */

import { sanctuaryContent, type SanctuaryContent } from '@/data/practicesAndSoundscapes';

export type ProtocolType = 'somatic' | 'mindset';
export type ContentTypeRoute = 'soundbath' | 'guided-practice' | 'micro-practice';

export interface MatchedProtocol {
  id: string;
  title: string;
  type: ProtocolType;
  duration: number;
  thumbnail: string;
  contentType: ContentTypeRoute;
  storyHook?: string;
  route: string;
}

/**
 * Get the route for a given content type and id
 */
function getRouteForContentType(contentType: ContentTypeRoute, id: string): string {
  switch (contentType) {
    case 'soundbath':
      return `/soundscapes/${id}`;
    case 'guided-practice':
      return `/guided-practices/${id}`;
    case 'micro-practice':
      return `/micro-practice/${id}/cards`;
    default:
      return `/micro-practice/${id}/cards`;
  }
}

/**
 * Determine protocol type from content
 */
function getProtocolType(content: SanctuaryContent): ProtocolType {
  // Micro-practices with subType 'tool' are somatic protocols
  if (content.subType === 'tool') return 'somatic';
  // Micro-practices with subType 'mindset' are mindset protocols
  if (content.subType === 'mindset') return 'mindset';
  // Guided practices with breath/body focus are somatic
  if (content.tags?.some(t => ['breathing', 'breath', 'somatic', 'body'].includes(t.toLowerCase()))) {
    return 'somatic';
  }
  // Soundbaths are generally somatic (nervous system regulation)
  if (content.contentType === 'soundbath') return 'somatic';
  // Default to mindset
  return 'mindset';
}

/**
 * Convert SanctuaryContent to MatchedProtocol
 */
function toMatchedProtocol(content: SanctuaryContent): MatchedProtocol {
  const contentType = content.contentType as ContentTypeRoute;
  return {
    id: content.id,
    title: content.title,
    type: getProtocolType(content),
    duration: content.duration,
    thumbnail: content.thumbnail,
    contentType,
    storyHook: content.storyHook,
    route: getRouteForContentType(contentType, content.id)
  };
}

/**
 * Match a protocol by exact ID
 */
export function matchProtocolById(id: string): MatchedProtocol | null {
  const content = sanctuaryContent.find(c => c.id === id);
  if (!content) return null;
  return toMatchedProtocol(content);
}

/**
 * Match a protocol by partial ID match (for fuzzy matching)
 */
export function matchProtocolByPartialId(partialId: string): MatchedProtocol | null {
  // First try exact match
  const exactMatch = matchProtocolById(partialId);
  if (exactMatch) return exactMatch;
  
  // Try partial match
  const normalizedPartial = partialId.toLowerCase().replace(/[-_]/g, '');
  const content = sanctuaryContent.find(c => {
    const normalizedId = c.id.toLowerCase().replace(/[-_]/g, '');
    return normalizedId.includes(normalizedPartial) || normalizedPartial.includes(normalizedId);
  });
  
  if (!content) return null;
  return toMatchedProtocol(content);
}

/**
 * Match best protocol by current state and type
 */
export function matchProtocolByContext(
  currentState: string,
  protocolType: ProtocolType,
  contextTag?: string
): MatchedProtocol | null {
  // Filter by protocol type
  const typeFiltered = sanctuaryContent.filter(c => {
    const type = getProtocolType(c);
    return type === protocolType;
  });
  
  if (typeFiltered.length === 0) return null;
  
  // Score each practice based on context match
  const scored = typeFiltered.map(content => {
    let score = 0;
    const tags = content.structuredTags;
    
    // Match by state/outcome
    const stateToEnergyDirection: Record<string, string[]> = {
      'overwhelmed': ['downshift', 'stabilize'],
      'drained': ['restore', 'stabilize', 'refresh'],
      'scattered': ['stabilize', 'clarify'],
      'anxious': ['downshift', 'stabilize'],
      'stressed': ['downshift', 'stabilize'],
      'focused': ['maintain', 'optimize'],
      'steady': ['maintain', 'optimize', 'uplift']
    };
    
    const preferredDirections = stateToEnergyDirection[currentState.toLowerCase()] || [];
    if (tags?.energyDirection && preferredDirections.includes(tags.energyDirection)) {
      score += 10;
    }
    
    // Match by context tag (e.g., 'pre-meeting')
    if (contextTag && tags?.contextTags?.includes(contextTag)) {
      score += 15;
    }
    
    // Prefer shorter practices for quick interventions
    if (content.duration <= 3) {
      score += 5;
    }
    
    return { content, score };
  });
  
  // Sort by score and return best match
  scored.sort((a, b) => b.score - a.score);
  
  if (scored.length === 0) return null;
  return toMatchedProtocol(scored[0].content);
}

/**
 * Get all available protocols of a given type
 */
export function getProtocolsByType(type: ProtocolType): MatchedProtocol[] {
  return sanctuaryContent
    .filter(c => getProtocolType(c) === type)
    .map(toMatchedProtocol);
}

/**
 * Get quick protocols (under 3 minutes) for immediate intervention
 */
export function getQuickProtocols(type?: ProtocolType): MatchedProtocol[] {
  return sanctuaryContent
    .filter(c => {
      const isQuick = c.duration <= 3;
      if (!type) return isQuick;
      return isQuick && getProtocolType(c) === type;
    })
    .map(toMatchedProtocol);
}
