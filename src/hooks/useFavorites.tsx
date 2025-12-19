import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";

export const useFavorites = () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFavorites();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchFavorites = async () => {
    try {
      const token = await getAccessTokenSilently();
      
      const { data, error } = await supabase.functions.invoke('user-favorites', {
        body: { action: 'GET_FAVORITES' },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;

      if (data?.data) {
        setFavorites(new Set(data.data.map((fav: { content_id: string }) => fav.content_id)));
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
    if (!isAuthenticated) {
      toast.error("Please sign in to save favorites");
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const isFavorited = favorites.has(contentId);

      if (isFavorited) {
        const { error } = await supabase.functions.invoke('user-favorites', {
          body: { action: 'REMOVE_FAVORITE', contentId },
          headers: { Authorization: `Bearer ${token}` }
        });

        if (error) throw error;

        setFavorites(prev => {
          const newFavorites = new Set(prev);
          newFavorites.delete(contentId);
          return newFavorites;
        });
        toast.success("Removed from favorites");
      } else {
        const { error } = await supabase.functions.invoke('user-favorites', {
          body: { action: 'ADD_FAVORITE', contentId, contentType, category },
          headers: { Authorization: `Bearer ${token}` }
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
