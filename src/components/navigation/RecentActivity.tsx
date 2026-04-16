import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Brain, Compass } from '@phosphor-icons/react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useRecentActivity } from '@/hooks/useRecentActivity';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';

interface Activity {
  id: string;
  type: 'assessment' | 'recalibrate' | 'brief';
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
    if (isThisWeek(date)) return format(date, 'EEEE');
    return format(date, 'MMM d');
  };

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
      case 'recalibrate':
        return { icon: Compass, isPhosphor: true };
      case 'brief':
        return { icon: FileText, isLucide: true };
      case 'assessment':
      default:
        return { icon: Brain, isPhosphor: true };
    }
  };

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
          <p className="text-xs text-muted-foreground/60 px-2 py-1.5 uppercase tracking-wide font-medium">
            {group.label}
          </p>
          
          {group.items.map((activity) => {
            const { icon: Icon, isPhosphor } = getIcon(activity.type) as any;
            const IconNode = isPhosphor ? (
              <Icon size={14} weight="duotone" className="text-muted-foreground flex-shrink-0" />
            ) : (
              <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            );

            // Assessments are informational only — render as static row
            if (activity.type === 'assessment') {
              return (
                <SidebarMenuItem key={activity.id}>
                  <div className="flex items-center gap-2 px-2 py-1.5 h-auto text-sidebar-foreground/80">
                    {IconNode}
                    <span className="text-xs truncate flex-1">{activity.title}</span>
                  </div>
                </SidebarMenuItem>
              );
            }

            return (
              <SidebarMenuItem key={activity.id}>
                <SidebarMenuButton
                  onClick={() => {
                    if (activity.type === 'recalibrate') {
                      navigate('/recalibrate');
                    } else if (activity.type === 'brief') {
                      const dateStr = activity.date.toISOString().split('T')[0];
                      navigate(`/executive-home?briefDate=${dateStr}`);
                    }
                  }}
                  className="h-auto py-1.5"
                >
                  {IconNode}
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
