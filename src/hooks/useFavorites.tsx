import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { DEV_MODE, DEV_USER } from "@/config/devMode";

// Helper to get access token
async function getAccessToken(): Promise<string | null> {
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      return await auth0Client.getAccessTokenSilently();
    }
    return null;
  } catch {
    return null;
  }
}

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
      const userId = DEV_MODE ? DEV_USER.id : user.id;
      let favoritesData: any[] = [];

      if (DEV_MODE) {
        // DEV_MODE: Query database directly (RLS bypassed via service key in edge function not needed)
        console.log('[useFavorites] DEV_MODE: Fetching favorites directly from DB');
        const { data, error } = await supabase
          .from('user_favorites')
          .select('content_id, content_type, category')
          .eq('user_id', userId);
        
        if (error) {
          console.error('[useFavorites] DEV_MODE DB error:', error);
          throw error;
        }
        favoritesData = data || [];
      } else {
        // Production: Use edge function with Auth0 token
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.warn('[useFavorites] No access token available');
          setFavorites(new Map());
          setLoading(false);
          return;
        }

        const { data, error: favoritesError } = await supabase.functions.invoke('user-favorites', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'GET_FAVORITES' }
        });

        if (favoritesError) {
          console.error('[useFavorites] Edge function error:', favoritesError);
          throw favoritesError;
        }
        favoritesData = data?.data || [];
      }

      console.log('[useFavorites] Fetched favorites:', favoritesData.length);

      if (!favoritesData || favoritesData.length === 0) {
        setFavorites(new Map());
        setLoading(false);
        return;
      }

      // Get content IDs to fetch titles
      const contentIds = favoritesData.map((f: any) => f.content_id);
      
      // Fetch titles from sanctuary_content (public table, no auth needed)
      const { data: contentData, error: contentError } = await supabase
        .from('sanctuary_content')
        .select('id, title')
        .in('id', contentIds);

      if (contentError) {
        console.error('[useFavorites] Error fetching content titles:', contentError);
      }

      // Build a map of content_id -> title
      const titleMap = new Map<string, string>();
      contentData?.forEach(c => {
        titleMap.set(c.id, c.title);
      });

      // Build favorites map with titles
      const favoritesMap = new Map<string, FavoriteItem>();
      favoritesData.forEach((favorite: any) => {
        favoritesMap.set(favorite.content_id, {
          content_id: favorite.content_id,
          content_type: favorite.content_type,
          category: favorite.category,
          title: titleMap.get(favorite.content_id) || null
        });
      });
      setFavorites(favoritesMap);
    } catch (error) {
      console.error('[useFavorites] Error fetching favorites:', error);
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

    const userId = DEV_MODE ? DEV_USER.id : user.id;
    const isFavorited = favorites.has(contentId);

    try {
      if (DEV_MODE) {
        // DEV_MODE: Direct database operations
        console.log('[useFavorites] DEV_MODE: Toggling favorite directly in DB');
        
        if (isFavorited) {
          const { error } = await supabase
            .from('user_favorites')
            .delete()
            .eq('user_id', userId)
            .eq('content_id', contentId);

          if (error) {
            console.error('[useFavorites] DEV_MODE Remove error:', error);
            throw error;
          }

          setFavorites(prev => {
            const newFavorites = new Map(prev);
            newFavorites.delete(contentId);
            return newFavorites;
          });
          toast.success("Removed from favorites");
          console.log('[useFavorites] Removed favorite:', contentId);
        } else {
          const { error } = await supabase
            .from('user_favorites')
            .insert({
              user_id: userId,
              content_id: contentId,
              content_type: contentType,
              category: category
            });

          if (error) {
            console.error('[useFavorites] DEV_MODE Add error:', error);
            throw error;
          }

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
          console.log('[useFavorites] Added favorite:', contentId);
        }
      } else {
        // Production: Use edge function with Auth0 token
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.warn('[useFavorites] No access token for toggle');
          toast.error("Authentication required");
          return;
        }

        if (isFavorited) {
          const { error } = await supabase.functions.invoke('user-favorites', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { 
              action: 'REMOVE_FAVORITE',
              contentId 
            }
          });

          if (error) {
            console.error('[useFavorites] Remove favorite error:', error);
            throw error;
          }

          setFavorites(prev => {
            const newFavorites = new Map(prev);
            newFavorites.delete(contentId);
            return newFavorites;
          });
          toast.success("Removed from favorites");
          console.log('[useFavorites] Removed favorite:', contentId);
        } else {
          const { error } = await supabase.functions.invoke('user-favorites', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { 
              action: 'ADD_FAVORITE',
              contentId,
              contentType,
              category
            }
          });

          if (error) {
            console.error('[useFavorites] Add favorite error:', error);
            throw error;
          }

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
          console.log('[useFavorites] Added favorite:', contentId);
        }
      }
    } catch (error: any) {
      console.error('[useFavorites] Error toggling favorite:', error);
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
