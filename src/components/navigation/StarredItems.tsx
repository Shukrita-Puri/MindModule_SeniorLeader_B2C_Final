import { useNavigate } from 'react-router-dom';
import { Star, Compass } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useFavorites } from '@/hooks/useFavorites';

const StarredItems = () => {
  const navigate = useNavigate();
  const { favorites, loading } = useFavorites();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  // Show content on mobile (sheet is always full width when open)
  // Only hide on desktop when collapsed
  if (isCollapsed && !isMobile) {
    return null;
  }

  if (loading) {
    return (
      <div className="px-2 py-2">
        <div className="h-6 bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  const favoritesArray = Array.from(favorites.values());

  if (favoritesArray.length === 0) {
    return (
      <div className="px-2 py-3">
        <p className="text-xs text-muted-foreground/70 italic">No starred items yet</p>
      </div>
    );
  }

  // Show max 5 starred items
  const displayedFavorites = favoritesArray.slice(0, 5);

  // Navigate to specific practice based on content type
  const handlePracticeClick = (favorite: { content_id: string; content_type?: string; category?: string }) => {
    const contentType = favorite.content_type;
    if (contentType === 'soundbath') {
      navigate(`/soundscapes/${favorite.content_id}`, { state: { category: favorite.category } });
    } else if (contentType === 'guided-practice') {
      navigate(`/guided-practices/${favorite.content_id}`, { state: { category: favorite.category } });
    } else if (contentType === 'micro-practice') {
      navigate(`/micro-practice/${favorite.content_id}/cards`, { state: { category: favorite.category } });
    } else {
      navigate('/recalibrate');
    }
  };

  // Format practice name from content_id if title is missing
  const formatPracticeName = (favorite: { title?: string; content_id: string }) => {
    if (favorite.title) return favorite.title;
    // Convert content_id like "box-breathing" to "Box Breathing"
    return favorite.content_id
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <SidebarMenu>
      {displayedFavorites.map((favorite) => (
        <SidebarMenuItem key={favorite.content_id}>
          <SidebarMenuButton
            onClick={() => handlePracticeClick(favorite)}
            className="h-auto py-1.5"
          >
            <Compass className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs truncate">
              {formatPracticeName(favorite)}
            </span>
            <Star className="h-3 w-3 text-amber-500 ml-auto fill-amber-500" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
};

export default StarredItems;
