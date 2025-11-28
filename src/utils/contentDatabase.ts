import { supabase } from "@/integrations/supabase/client";

export type Category = 'pause' | 'power-up' | 'presence';
export type ContentType = 'soundbath' | 'guided-practice' | 'micro-practice';

export interface SanctuaryContent {
  id: string;
  title: string;
  content_type: ContentType;
  category: Category;
  duration: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  creator?: string;
  origin?: string;
  story_hook?: string;
  used_by?: string;
  sub_type?: 'mindset' | 'tool';
  voice?: 'male' | 'female' | 'neutral' | 'none' | 'ai';
  language?: string;
  thumbnail_url?: string;
  audio_url?: string;
  steps_count: number;
  tags?: string[];
  is_active: boolean;
  display_order: number;
  metadata?: SanctuaryContentMetadata;
  steps?: SanctuaryContentStep[];
}

export interface SanctuaryContentMetadata {
  structured_tags?: any;
  full_story?: string;
  technique?: string;
  benefits?: string[];
  completion_quote?: string;
  intro_summary?: string;
  what_you_need?: string[];
  expected_outcomes?: string[];
  essence?: string;
  parallel?: string;
  cue?: string;
  real_examples?: Array<{ scenario: string; trigger: string; response: string }>;
  why_this_works?: string;
  delivery_modality?: string[];
}

export interface SanctuaryContentStep {
  step_order: number;
  title: string;
  instruction: string;
  duration?: number;
  breathing_pattern?: string;
  wisdom_note?: string;
}

/**
 * Fetch all active content from the database
 */
export async function getAllContent(): Promise<SanctuaryContent[]> {
  const { data, error } = await supabase
    .from('sanctuary_content')
    .select(`
      *,
      metadata:sanctuary_content_metadata(*),
      steps:sanctuary_content_steps(*)
    `)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching content:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    metadata: Array.isArray(item.metadata) ? item.metadata[0] : item.metadata,
    steps: Array.isArray(item.steps) 
      ? item.steps.sort((a, b) => a.step_order - b.step_order)
      : []
  })) as SanctuaryContent[];
}

/**
 * Fetch content filtered by category
 */
export async function getContentByCategory(category: Category): Promise<SanctuaryContent[]> {
  const { data, error } = await supabase
    .from('sanctuary_content')
    .select(`
      *,
      metadata:sanctuary_content_metadata(*),
      steps:sanctuary_content_steps(*)
    `)
    .eq('category', category)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching content by category:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    metadata: Array.isArray(item.metadata) ? item.metadata[0] : item.metadata,
    steps: Array.isArray(item.steps) 
      ? item.steps.sort((a, b) => a.step_order - b.step_order)
      : []
  })) as SanctuaryContent[];
}

/**
 * Fetch content filtered by type
 */
export async function getContentByType(type: ContentType): Promise<SanctuaryContent[]> {
  const { data, error } = await supabase
    .from('sanctuary_content')
    .select(`
      *,
      metadata:sanctuary_content_metadata(*),
      steps:sanctuary_content_steps(*)
    `)
    .eq('content_type', type)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching content by type:', error);
    return [];
  }

  return (data || []).map(item => ({
    ...item,
    metadata: Array.isArray(item.metadata) ? item.metadata[0] : item.metadata,
    steps: Array.isArray(item.steps) 
      ? item.steps.sort((a, b) => a.step_order - b.step_order)
      : []
  })) as SanctuaryContent[];
}

/**
 * Fetch a single content item by ID
 */
export async function getContentById(id: string): Promise<SanctuaryContent | null> {
  const { data, error } = await supabase
    .from('sanctuary_content')
    .select(`
      *,
      metadata:sanctuary_content_metadata(*),
      steps:sanctuary_content_steps(*)
    `)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Error fetching content by id:', error);
    return null;
  }

  if (!data) return null;

  return {
    ...data,
    metadata: Array.isArray(data.metadata) ? data.metadata[0] : data.metadata,
    steps: Array.isArray(data.steps) 
      ? data.steps.sort((a, b) => a.step_order - b.step_order)
      : []
  } as SanctuaryContent;
}
