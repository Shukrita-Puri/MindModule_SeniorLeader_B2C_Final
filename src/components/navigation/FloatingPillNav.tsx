import { useNavigate, useLocation } from 'react-router-dom';
import { FileText, TrendingUp, type LucideIcon } from 'lucide-react';
import { Compass, type Icon } from '@phosphor-icons/react';

interface Tab {
  icon: LucideIcon | Icon;
  label: string;
  path: string;
  phosphor?: boolean;
}

const TABS: Tab[] = [
  { icon: FileText, label: 'Today', path: '/executive-home' },
  { icon: Compass, label: 'Reset', path: '/recalibrate', phosphor: true },
  { icon: TrendingUp, label: 'Insight', path: '/insights' },
];

/**
 * Routes that all belong to the "Today" flow (Assessment → Brief → Plan).
 * The Today tab stays highlighted across all of them so the bottom pill
 * looks identical on every step of the stepper.
 */
const TODAY_FLOW_PATHS = [
  '/executive-home',
  '/daily-check-in',
  '/check-in-detail',
  '/plan',
];

const FloatingPillNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isTodayFlow = TODAY_FLOW_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  return (
    <nav
      className="fixed z-[40] sm:hidden flex items-center justify-center"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="flex items-center border border-white/10 bg-black/70 backdrop-blur-2xl shadow-2xl"
        style={{
          borderRadius: 999,
          padding: '6px 8px',
          gap: 4,
        }}
      >
        {TABS.map((tab) => {
          const isActive =
            tab.path === '/executive-home'
              ? isTodayFlow
              : pathname === tab.path || pathname.startsWith(tab.path + '/');
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`relative flex min-w-[64px] flex-col items-center gap-0.5 rounded-full px-3 py-2 transition-all duration-200 ${
                isActive
                  ? 'bg-white/15'
                  : 'bg-transparent'
              }`}
              style={{
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Icon */}
              {tab.phosphor ? (
                <tab.icon
                  size={19}
                  weight="duotone"
                  className="text-white"
                />
              ) : (
                <tab.icon
                  size={19}
                  className="text-white"
                />
              )}
              <span
                className={`font-body text-[9px] tracking-[0.01em] text-white ${
                  isActive ? 'opacity-100' : 'opacity-70'
                }`}
              >
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
