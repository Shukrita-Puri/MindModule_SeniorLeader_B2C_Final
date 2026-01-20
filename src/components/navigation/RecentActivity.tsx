import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Compass, CalendarCheck } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useRecentActivity } from '@/hooks/useRecentActivity';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';

interface Activity {
  id: string;
  type: 'coach' | 'recalibrate' | 'checkin';
  title: string;
  date: Date;
  sessionId?: string;
}

interface ActivityGroup {
  label: string;
  items: Activity[];
}

const RecentActivity = () => {
  const navigate = useNavigate();
  const { activities, isLoading } = useRecentActivity();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const formatDateLabel = (date: Date): string => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return format(date, 'EEEE'); // Day name
    return format(date, 'MMM d');
  };

  // Group activities by date (ChatGPT-style)
  const groupedActivities = useMemo<ActivityGroup[]>(() => {
    if (!activities || activities.length === 0) return [];
    
    const groups: ActivityGroup[] = [];
    let currentLabel = '';
    
    activities.forEach(activity => {
      const label = formatDateLabel(activity.date);
      if (label !== currentLabel) {
        groups.push({ label, items: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].items.push(activity);
    });
    
    return groups;
  }, [activities]);

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
      {groupedActivities.map((group) => (
        <div key={group.label}>
          {/* Date group header */}
          <p className="text-[10px] text-muted-foreground/60 px-2 py-1.5 uppercase tracking-wide font-medium">
            {group.label}
          </p>
          
          {/* Activities in this group */}
          {group.items.map((activity) => {
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
                  className="h-auto py-1.5"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs truncate flex-1">{activity.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </div>
      ))}
    </SidebarMenu>
  );
};

export default RecentActivity;
