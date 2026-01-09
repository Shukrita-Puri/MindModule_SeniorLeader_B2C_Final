import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Lightbulb, 
  Compass, 
  SmilePlus, 
  TrendingUp,
  Bookmark,
  Clock
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import UserSettingsPopover from './UserSettingsPopover';
import RecentActivity from './RecentActivity';
import StarredItems from './StarredItems';

const features = [
  {
    title: 'Inner Advisor',
    icon: Lightbulb,
    path: '/coach',
    description: 'AI-powered coaching',
  },
  {
    title: 'Recalibrate Studio',
    icon: Compass,
    path: '/recalibrate',
    description: 'Energy practices',
  },
  {
    title: 'Energy Pulse',
    icon: SmilePlus,
    path: '/daily-check-in',
    description: 'Track your state',
  },
  {
    title: 'Insights',
    icon: TrendingUp,
    path: '/insights',
    description: 'Trends & patterns',
  },
];

const LeftSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Header */}
      <SidebarHeader className="h-14 flex items-center justify-center border-b border-border">
        <div className={cn(
          "flex items-center gap-2 transition-all duration-200",
          isCollapsed ? "justify-center" : "px-2"
        )}>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-lg">🧠</span>
          </div>
          {!isCollapsed && (
            <span className="font-headline text-lg text-foreground">Mind Atelier</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Features Section */}
        <SidebarGroup>
          <SidebarGroupLabel className={cn(isCollapsed && "sr-only")}>
            Features
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {features.map((feature) => {
                const isActive = location.pathname === feature.path;
                return (
                  <SidebarMenuItem key={feature.path}>
                    <SidebarMenuButton
                      onClick={() => navigate(feature.path)}
                      isActive={isActive}
                      tooltip={feature.title}
                      className={cn(
                        "transition-colors",
                        isActive && "bg-primary/10 text-primary"
                      )}
                    >
                      <feature.icon className="h-4 w-4" />
                      <span>{feature.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Starred Section */}
        <SidebarGroup>
          <SidebarGroupLabel className={cn(isCollapsed && "sr-only")}>
            <Bookmark className="h-3.5 w-3.5 mr-1.5 inline" />
            Starred
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <StarredItems />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Recent Activity Section */}
        <SidebarGroup className="flex-1">
          <SidebarGroupLabel className={cn(isCollapsed && "sr-only")}>
            <Clock className="h-3.5 w-3.5 mr-1.5 inline" />
            Recent
          </SidebarGroupLabel>
          <SidebarGroupContent className="overflow-auto">
            <RecentActivity />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - User Settings */}
      <SidebarFooter className="border-t border-border">
        <UserSettingsPopover />
      </SidebarFooter>
    </Sidebar>
  );
};

export default LeftSidebar;
