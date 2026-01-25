/**
 * Message Parser Utility
 * Parses AI coach messages to extract protocol and wisdom markers
 * for rendering as embedded interactive cards
 */

export interface ProtocolMarker {
  type: 'somatic' | 'mindset';
  id: string;
  fullMatch: string;
}

export interface WisdomMarker {
  category: string;
  key: string;
  fullKey: string;
  fullMatch: string;
}

export interface ParsedMessage {
  text: string;
  protocols: ProtocolMarker[];
  wisdom: WisdomMarker[];
}

/**
 * Parse message content for protocol and wisdom markers
 * 
 * Protocol format: [PROTOCOL:type:id]
 * Example: [PROTOCOL:somatic:box-breathing-calm]
 * 
 * Wisdom format: [WISDOM:category:key]
 * Example: [WISDOM:aviation:slow-is-smooth]
 */
export function parseMessageContent(content: string): ParsedMessage {
  const protocols: ProtocolMarker[] = [];
  const wisdom: WisdomMarker[] = [];
  let cleanText = content;
  
  // Extract protocol markers: [PROTOCOL:type:id]
  const protocolRegex = /\[PROTOCOL:(somatic|mindset):([^\]]+)\]/g;
  let protocolMatch;
  while ((protocolMatch = protocolRegex.exec(content)) !== null) {
    protocols.push({
      type: protocolMatch[1] as 'somatic' | 'mindset',
      id: protocolMatch[2].trim(),
      fullMatch: protocolMatch[0]
    });
    // Remove from clean text
    cleanText = cleanText.replace(protocolMatch[0], '');
  }
  
  // Extract wisdom markers: [WISDOM:category:key]
  const wisdomRegex = /\[WISDOM:([^:]+):([^\]]+)\]/g;
  let wisdomMatch;
  while ((wisdomMatch = wisdomRegex.exec(content)) !== null) {
    const category = wisdomMatch[1].trim();
    const key = wisdomMatch[2].trim();
    wisdom.push({
      category,
      key,
      fullKey: `${category}:${key}`,
      fullMatch: wisdomMatch[0]
    });
    // Remove from clean text
    cleanText = cleanText.replace(wisdomMatch[0], '');
  }
  
  // Clean up extra whitespace and empty lines
  cleanText = cleanText
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove triple+ line breaks
    .replace(/^\s+|\s+$/g, ''); // Trim start and end
  
  return {
    text: cleanText,
    protocols,
    wisdom
  };
}

/**
 * Check if a message contains any embedded content markers
 */
export function hasEmbeddedContent(content: string): boolean {
  return /\[PROTOCOL:|WISDOM:/.test(content);
}

/**
 * Extract just the text without markers (for summaries, etc.)
 */
export function extractPlainText(content: string): string {
  return parseMessageContent(content).text;
}
