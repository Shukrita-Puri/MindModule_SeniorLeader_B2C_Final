import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface FavoriteItem {
  content_id: string;
  content_type: string;
  category: string;
  title: string | null;
}

export const useFavorites = () => {
  const { isAuthenticated, user } = useAuth();
  const [favorites, setFavorites] = useState<Map<string, FavoriteItem>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setFavorites(new Map());
      setLoading(false);
      return;
    }
    
    try {
      // First fetch user favorites
      const { data: favoritesData, error: favoritesError } = await supabase
        .from('user_favorites')
        .select('content_id, content_type, category')
        .eq('user_id', user.id);

      if (favoritesError) throw favoritesError;

      if (!favoritesData || favoritesData.length === 0) {
        setFavorites(new Map());
        setLoading(false);
        return;
      }

      // Get content IDs to fetch titles
      const contentIds = favoritesData.map(f => f.content_id);
      
      // Fetch titles from sanctuary_content
      const { data: contentData, error: contentError } = await supabase
        .from('sanctuary_content')
        .select('id, title')
        .in('id', contentIds);

      if (contentError) {
        console.error('Error fetching content titles:', contentError);
      }

      // Build a map of content_id -> title
      const titleMap = new Map<string, string>();
      contentData?.forEach(c => {
        titleMap.set(c.id, c.title);
      });

      // Build favorites map with titles
      const favoritesMap = new Map<string, FavoriteItem>();
      favoritesData.forEach((favorite) => {
        favoritesMap.set(favorite.content_id, {
          content_id: favorite.content_id,
          content_type: favorite.content_type,
          category: favorite.category,
          title: titleMap.get(favorite.content_id) || null
        });
      });
      setFavorites(favoritesMap);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const toggleFavorite = async (
    contentId: string,
    contentType: string,
    category: string
  ) => {
    if (!isAuthenticated || !user?.id) {
      toast.error("Please sign in to save favorites");
      return;
    }

    try {
      const isFavorited = favorites.has(contentId);

      if (isFavorited) {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', contentId);

        if (error) throw error;

        setFavorites(prev => {
          const newFavorites = new Map(prev);
          newFavorites.delete(contentId);
          return newFavorites;
        });
        toast.success("Removed from favorites");
      } else {
        const { error } = await supabase
          .from('user_favorites')
          .insert({
            user_id: user.id,
            content_id: contentId,
            content_type: contentType,
            category: category
          });

        if (error) throw error;

        // Fetch the title for the new favorite
        const { data: contentData } = await supabase
          .from('sanctuary_content')
          .select('title')
          .eq('id', contentId)
          .single();

        setFavorites(prev => {
          const newMap = new Map(prev);
          newMap.set(contentId, {
            content_id: contentId,
            content_type: contentType,
            category: category,
            title: contentData?.title || null
          });
          return newMap;
        });
        toast.success("Added to favorites");
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error(error.message || "Failed to update favorites");
    }
  };

  const isFavorite = (contentId: string) => favorites.has(contentId);

  const getFavorite = (contentId: string): FavoriteItem | undefined => {
    return favorites.get(contentId);
  };

  return {
    favorites,
    loading,
    toggleFavorite,
    isFavorite,
    getFavorite,
    refetch: fetchFavorites
  };
};
