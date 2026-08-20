import { createContext, useContext, ReactNode } from 'react';
import ShareCardButton from '@/components/insights/ShareCardButton';

interface ShareCtx {
  targetRef: React.RefObject<HTMLElement>;
  title: string;
  fileName?: string;
}

const InsightShareContext = createContext<ShareCtx | null>(null);

export const InsightShareProvider = ({
  value,
  children,
}: {
  value: ShareCtx;
  children: ReactNode;
}) => <InsightShareContext.Provider value={value}>{children}</InsightShareContext.Provider>;

/**
 * Renders the share control inline in a card's title row (same line as the
 * (i) info icon). Carries data-share-hide so the exported snapshot excludes
 * the affordance itself. Renders nothing outside a detail page.
 */
const InsightShareSlot = ({ className }: { className?: string }) => {
  const ctx = useContext(InsightShareContext);
  if (!ctx) return null;
  return (
    <span data-share-hide className={`inline-flex ${className ?? ''}`}>
      <ShareCardButton targetRef={ctx.targetRef} title={ctx.title} fileName={ctx.fileName} />
    </span>
  );
};

export default InsightShareSlot;
