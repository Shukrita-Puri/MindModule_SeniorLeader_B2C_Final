import { type ReactNode } from 'react';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

interface ProfilePageLayoutProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  backPath?: string;
  hideCoach?: boolean;
}

const ProfilePageLayout = ({
  children,
  className = '',
  contentClassName = 'max-w-2xl',
  backPath,
  hideCoach = true,
}: ProfilePageLayoutProps) => (
  <div
    data-scroll-container
    className={`h-screen h-[100dvh] min-h-[100dvh] bg-transparent overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] ${className}`}
    style={{
      scrollPaddingTop: 'calc(env(safe-area-inset-top, 0px) + 76px)',
      scrollPaddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)',
    }}
  >
    <UnifiedTopBar hideCoach={hideCoach} backPath={backPath} />
    <div
      className={`mx-auto px-4 pt-[calc(4.75rem+env(safe-area-inset-top,0px))] pb-[calc(9rem+env(safe-area-inset-bottom,0px))] space-y-6 ${contentClassName}`}
    >
      {children}
    </div>
  </div>
);

export default ProfilePageLayout;
