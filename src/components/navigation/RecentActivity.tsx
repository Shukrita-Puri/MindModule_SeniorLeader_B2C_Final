import { useNavigate } from 'react-router-dom';
import { MessageCircle, Compass, CalendarCheck } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useRecentActivity } from '@/hooks/useRecentActivity';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

const RecentActivity = () => {
  const navigate = useNavigate();
  const { activities, isLoading } = useRecentActivity();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const formatDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'coach':
        return MessageCircle;
      case 'recalibrate':
        return Compass;
      case 'checkin':
        return CalendarCheck;
      default:
        return MessageCircle;
    }
  };

  // Show content on mobile (sheet is always full width when open)
  // Only hide on desktop when collapsed
  if (isCollapsed && !isMobile) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="px-2 py-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="px-2 py-3">
        <p className="text-xs text-muted-foreground/70 italic">No recent activity</p>
      </div>
    );
  }

  return (
    <SidebarMenu>
      {activities.map((activity) => {
        const Icon = getIcon(activity.type);
        return (
          <SidebarMenuItem key={activity.id}>
            <SidebarMenuButton
              onClick={() => {
                if (activity.type === 'coach' && activity.sessionId) {
                  navigate('/coach');
                } else if (activity.type === 'recalibrate') {
                  navigate('/recalibrate');
                } else if (activity.type === 'checkin') {
                  navigate('/daily-check-in');
                }
              }}
              className="h-auto py-2"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{activity.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(activity.date)}
                </p>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
};

export default RecentActivity;
