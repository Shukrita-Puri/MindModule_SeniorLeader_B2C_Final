import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_favorites')
        .select('content_id')
        .eq('user_id', user.id);

      if (error) throw error;

      if (data) {
        setFavorites(new Set(data.map(fav => fav.content_id)));
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error("Please sign in to save favorites");
        return;
      }

      const isFavorited = favorites.has(contentId);

      if (isFavorited) {
        // Remove from favorites
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
        // Add to favorites
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
    isFavorite
  };
};
