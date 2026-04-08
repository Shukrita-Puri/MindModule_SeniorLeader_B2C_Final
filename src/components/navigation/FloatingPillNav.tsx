import { useNavigate, useLocation } from 'react-router-dom';
import { House, Sparkles, TrendingUp } from 'lucide-react';

const ACTIVE_COLOR = '#E87A2F';
const INACTIVE_COLOR = 'rgba(255,255,255,0.45)';

const TABS = [
  { icon: House, label: 'Today', path: '/executive-home' },
  { icon: Sparkles, label: 'Reset', path: '/recalibrate' },
  { icon: TrendingUp, label: 'Insights', path: '/insights' },
] as const;

const FloatingPillNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed z-[150] sm:hidden flex items-center justify-center"
      style={{
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="flex items-center backdrop-blur-md"
        style={{
          background: 'rgba(15,15,15,0.65)',
          borderRadius: 30,
          padding: '10px 28px',
          gap: 36,
          minWidth: 240,
          border: '0.5px solid rgba(255,255,255,0.1)',
        }}
      >
        {TABS.map((tab) => {
          const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/');
          const color = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-0.5"
            >
              <tab.icon size={20} style={{ color }} />
              <span className="font-body" style={{ fontSize: 9, color }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default FloatingPillNav;
