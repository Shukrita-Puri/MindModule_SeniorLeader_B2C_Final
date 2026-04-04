import { useNavigate, useLocation } from 'react-router-dom';
import appLogo from '@/assets/app-logo-5.png';
import { 
  ChatCircle, 
  Compass, 
  Smiley, 
  TrendUp,
  BookmarkSimple,
  Clock
} from '@phosphor-icons/react';
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
    title: 'Performance Readiness Assessment',
    icon: Smiley,
    path: '/daily-check-in',
    description: 'Track your state',
  },
  {
    title: 'Reset Studio',
    icon: Compass,
    path: '/recalibrate',
    description: 'Energy practices',
  },
  {
    title: 'Mind Performance Coach',
    icon: ChatCircle,
    path: '/coach',
    description: 'AI-powered coaching',
  },
  {
    title: 'Performance Intelligence',
    icon: TrendUp,
    path: '/insights',
    description: 'Trends & patterns',
  },
];

const LeftSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  // On mobile, never hide labels (sheet is always expanded when open)
  const hideLabels = isCollapsed && !isMobile;

  return (
    <Sidebar collapsible="icon" className="border-r border-border" data-tour="sidebar-panel">
      {/* Header */}
      <SidebarHeader className="min-h-[4rem] flex items-center justify-center border-b border-sidebar-border pt-[env(safe-area-inset-top,0px)]">
        <div className={cn(
          "flex items-center transition-all duration-200 pt-4 md:pt-0",
          isCollapsed ? "justify-center" : "px-3"
        )}>
          <img src={appLogo} alt="Mind Module" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          {!hideLabels && (
            <div className="flex flex-col ml-2">
              <span className="font-headline text-[15px] font-semibold tracking-widest text-foreground">
                MIND MODULE
              </span>
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Executive Edition
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Features Section */}
        <SidebarGroup data-tour="sidebar-suite-group">
          <SidebarGroupLabel className={cn("text-primary font-body", hideLabels && "sr-only")}>
            Mental Performance Suite
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu data-tour="sidebar-nav">
              {features.map((feature, idx) => {
                const isActive = location.pathname === feature.path;
                const IconComponent = feature.icon;
                return (
                  <SidebarMenuItem key={feature.path} data-tour={`sidebar-suite-${idx}`}>
                    <SidebarMenuButton
                      onClick={() => navigate(feature.path)}
                      isActive={isActive}
                      tooltip={feature.title}
                      className={cn(
                        "transition-all duration-200 ease-out font-body group",
                        "hover:scale-[1.02] hover:shadow-sm",
                        isCollapsed ? "text-primary hover:text-kairos" : "text-primary hover:text-kairos hover:bg-kairos/5",
                        isActive && "bg-kairos/10 text-kairos shadow-sm"
                      )}
                    >
                      <IconComponent 
                        size={18} 
                        weight="duotone" 
                          className={cn(
                            "icon-duotone-luxury flex-shrink-0 transition-all duration-200",
                            "group-hover:scale-110 group-hover:drop-shadow-[0_2px_6px_rgba(29,185,84,0.4)]",
                            isActive ? "text-kairos icon-pulse-active" : "text-primary"
                        )} 
                      />
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
          <SidebarGroupLabel className={cn("text-primary font-body", hideLabels && "sr-only")}>
            <BookmarkSimple 
              size={14} 
              weight="duotone" 
              className={cn("mr-1.5 inline icon-duotone-luxury", hideLabels ? "text-kairos" : "text-primary")} 
            />
            Starred
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <StarredItems />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Recent Activity Section */}
        <SidebarGroup className="flex-1">
          <SidebarGroupLabel className={cn("text-primary font-body", hideLabels && "sr-only")}>
            <Clock 
              size={14} 
              weight="duotone" 
              className={cn("mr-1.5 inline icon-duotone-luxury", hideLabels ? "text-kairos" : "text-primary")} 
            />
            Recent
          </SidebarGroupLabel>
          <SidebarGroupContent className="overflow-auto">
            <RecentActivity />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - User Settings */}
      <SidebarFooter className="border-t border-border" data-tour="sidebar-footer">
        <UserSettingsPopover />
      </SidebarFooter>
    </Sidebar>
  );
};

export default LeftSidebar;
