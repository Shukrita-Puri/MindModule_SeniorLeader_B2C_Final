import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Link2, 
  Shield, 
  Share2, 
  LogOut,
  ChevronUp,
  Settings
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

const UserSettingsPopover = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [open, setOpen] = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const menuItems = [
    { icon: User, label: 'Profile', path: '/profile' },
    { icon: Link2, label: 'Connected Data', path: '/connected-data' },
    { icon: Shield, label: 'Privacy & Security', path: '/privacy' },
    { icon: Share2, label: 'Refer to Friends', path: '/refer' },
  ];

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate('/login');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className={cn(
            "data-[state=open]:bg-muted",
            isCollapsed && "justify-center px-0"
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.picture} alt={user?.name || 'User'} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent 
        className="w-64 p-2" 
        side="top" 
        align="start"
        sideOffset={8}
      >
        {/* User info header */}
        <div className="flex items-center gap-3 px-2 py-3 border-b border-border mb-2">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.picture} alt={user?.name || 'User'} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        {/* Menu items */}
        <div className="space-y-1">
          {menuItems.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              className="w-full justify-start gap-3 h-9 px-2 text-sm"
              onClick={() => {
                setOpen(false);
                navigate(item.path);
              }}
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              {item.label}
            </Button>
          ))}
        </div>

        {/* Sign out */}
        <div className="border-t border-border mt-2 pt-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-9 px-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UserSettingsPopover;
