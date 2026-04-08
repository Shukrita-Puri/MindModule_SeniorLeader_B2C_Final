import { useNavigate, useLocation } from 'react-router-dom';
import { House, Sparkles, TrendingUp } from 'lucide-react';

const ICON_COLOR = '#8B7E74';

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
        className="flex items-center bg-black/30 backdrop-blur-xl border border-white/15"
        style={{
          borderRadius: 30,
          padding: '8px 20px',
          gap: 8,
          minWidth: 240,
        }}
      >
        {TABS.map((tab) => {
          const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/');
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-0.5 relative"
              style={{
                padding: '6px 16px',
                borderRadius: 20,
                background: isActive ? 'rgba(242,106,80,0.2)' : 'transparent',
                transition: 'background 0.2s ease',
              }}
            >
              <tab.icon size={20} style={{ color: ICON_COLOR }} />
              <span className="font-body" style={{ fontSize: 9, color: ICON_COLOR }}>
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
