import { Link, NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, ArrowLeft, Activity, AlertTriangle, Bell, Gauge } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users, end: false },
  { to: '/admin/jobs', label: 'Jobs', icon: Activity, end: false },
  { to: '/admin/executive-home-audit', label: 'Home Cards Audit', icon: Gauge, end: false },
  { to: '/admin/error-logs', label: 'Error Logs', icon: AlertTriangle, end: false },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell, end: false },
];

const AdminLayout = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-60 shrink-0 border-r border-border bg-muted/30 p-4 flex flex-col gap-1">
        <div className="px-2 py-3 mb-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">MindModule</div>
          <div className="text-lg font-semibold">Admin Console</div>
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-4 w-4" aria-hidden />
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto pt-4 border-t border-border/60">
          <div className="px-3 pb-2 text-xs text-muted-foreground truncate" title={user?.email ?? ''}>
            {user?.email}
          </div>
          <Link
            to="/executive-home"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to app
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;