import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const useFavorites = () => {
  const { isAuthenticated, user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchFavorites();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  const fetchFavorites = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('content_id')
        .eq('user_id', user.id);

      if (error) throw error;

      if (data) {
        setFavorites(new Set(data.map((fav: { content_id: string }) => fav.content_id)));
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
    }
  };

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
          const newFavorites = new Set(prev);
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

        setFavorites(prev => new Set(prev).add(contentId));
        toast.success("Added to favorites");
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error(error.message || "Failed to update favorites");
    }
  };

  const isFavorite = (contentId: string) => favorites.has(contentId);

  return {
    favorites,
    loading,
    toggleFavorite,
    isFavorite,
    refetch: fetchFavorites
  };
};
