import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  User,
  Share2,
  LogOut,
  ChevronUp,
  Compass,
  Link2,
  CreditCard
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  isValidBeta,
  resolveManageSubscriptionTarget,
  MANAGE_SUBSCRIPTION_UPGRADE_PATH,
} from '@/utils/subscriptionHelpers';
import { startFirstSessionTour } from '@/utils/firstSessionTour';
import { PAYMENT_PAGE_SUPPRESSED } from '@/config/payments';
import { SHOW_REFERRAL_PROGRAM } from '@/config/referralConfig';

interface UserSettingsPopoverProps {
  variant?: 'sidebar' | 'header';
}

export function UserSettingsPopover({ variant = 'sidebar' }: UserSettingsPopoverProps) {
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [open, setOpen] = useState(false);

  // Derive display values – guard against null user during async profile sync
  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '';
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const menuItems = [
    { icon: User, label: 'Profile', path: '/profile' },
    ...(SHOW_REFERRAL_PROGRAM ? [{ icon: Share2, label: 'Refer to Friends', path: '/refer' }] : []),
  ];

  const handleRetakeTour = () => {
    setOpen(false);
    const target = startFirstSessionTour({ userId: user?.id, source: 'retake' });
    navigate(target);
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    // Navigate to public landing – NOT /login (which auto-triggers auth)
    navigate('/', { replace: true });
  };

  const handleNavigate = (path: string, source?: string) => {
    setOpen(false);
    requestAnimationFrame(() => {
      navigate(path, source ? { state: { source } } : undefined);
    });
  };

  // Show loading skeleton while user data is being fetched
  if (loading && !user) {
    return (
      <div data-tour="sidebar-profile-wrap">
        <SidebarMenuButton
          size="lg"
          className={cn(
            isCollapsed && "justify-center px-0"
          )}
          disabled
        >
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          {!isCollapsed && (
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
            </div>
          )}
        </SidebarMenuButton>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div data-tour="sidebar-profile-wrap">
          <SidebarMenuButton
            size="lg"
            className={cn(
              "data-[state=open]:bg-muted",
              isCollapsed && "justify-center px-0"
            )}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  {displayEmail && <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>}
                </div>
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </>
            )}
          </SidebarMenuButton>
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-0" 
        side="top" 
        align="start"
        sideOffset={8}
      >
        {/* User info header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{displayName}</p>
            {displayEmail && <p className="text-sm text-muted-foreground truncate">{displayEmail}</p>}
          </div>
        </div>

        {/* Menu items */}
        <div className="py-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
              onClick={() => handleNavigate(item.path, item.source)}
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Retake Tour + Sign out */}
        <div className="border-t border-border py-2">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
            onClick={handleRetakeTour}
          >
            <Compass className="h-4 w-4 text-muted-foreground" />
            Retake Tour
          </button>
          {/* Same destinations the Profile page uses: the full Manage
              Connections experience, and the Subscription card in place. */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
            onClick={() => handleNavigate('/connected-data')}
          >
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Manage Connections
          </button>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
            onClick={() =>
              resolveManageSubscriptionTarget(user) === 'payment_page'
                ? handleNavigate(MANAGE_SUBSCRIPTION_UPGRADE_PATH, 'profile_upgrade')
                : handleNavigate('/profile#subscription')
            }
          >
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Subscription
          </button>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UserSettingsPopover;
