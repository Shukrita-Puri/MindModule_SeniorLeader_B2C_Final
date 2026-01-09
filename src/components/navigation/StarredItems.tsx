import { useNavigate } from 'react-router-dom';
import { Star, Compass } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useFavorites } from '@/hooks/useFavorites';
import { cn } from '@/lib/utils';

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

  const favoritesArray = Array.from(favorites);

  if (favoritesArray.length === 0) {
    return (
      <div className="px-2 py-2">
        <p className="text-xs text-muted-foreground">No starred items yet</p>
      </div>
    );
  }

  // Show max 5 starred items
  const displayedFavorites = favoritesArray.slice(0, 5);

  return (
    <SidebarMenu>
      {displayedFavorites.map((favoriteId) => (
        <SidebarMenuItem key={favoriteId}>
          <SidebarMenuButton
            onClick={() => navigate('/recalibrate')}
            className="h-auto py-1.5"
          >
            <Compass className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs truncate">Favorite Practice</span>
            <Star className="h-3 w-3 text-amber-500 ml-auto fill-amber-500" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
};

export default StarredItems;
