import { useQuery } from '@tanstack/react-query';
import { 
  getAllContent, 
  getContentByCategory, 
  getContentByType, 
  getContentById,
  type Category,
  type ContentType,
  type SanctuaryContent
} from '@/utils/contentDatabase';

/**
 * Hook to fetch all active content
 */
export function useAllContent() {
  return useQuery({
    queryKey: ['sanctuary-content'],
    queryFn: getAllContent,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch content by category
 */
export function useContentByCategory(category: Category) {
  return useQuery({
    queryKey: ['sanctuary-content', 'category', category],
    queryFn: () => getContentByCategory(category),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch content by type
 */
export function useContentByType(type: ContentType) {
  return useQuery({
    queryKey: ['sanctuary-content', 'type', type],
    queryFn: () => getContentByType(type),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single content item by ID
 */
export function useContentById(id: string) {
  return useQuery({
    queryKey: ['sanctuary-content', 'id', id],
    queryFn: () => getContentById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}
