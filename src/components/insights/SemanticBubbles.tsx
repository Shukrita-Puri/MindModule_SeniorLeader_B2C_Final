import { cn } from '@/lib/utils';

interface BubbleItem {
  label: string;
  count: number;
  weight: number;
}

interface SemanticBubblesProps {
  items: BubbleItem[];
  colorScheme: 'warm' | 'cool' | 'neutral';
  emptyMessage?: string;
}

const SemanticBubbles = ({ items, colorScheme, emptyMessage = 'No data yet' }: SemanticBubblesProps) => {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">{emptyMessage}</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span
          key={`${item.label}-${index}`}
          className={cn(
            "px-3 py-1.5 rounded-full font-medium transition-all",
            // Size based on weight
            item.weight > 0.7 ? "text-sm" : item.weight > 0.4 ? "text-xs" : "text-xs",
            // Padding based on weight
            item.weight > 0.7 ? "px-4 py-2" : "px-3 py-1.5",
            // Color scheme
            colorScheme === 'warm' && "bg-saffron/15 text-saffron border border-saffron/20",
            colorScheme === 'cool' && "bg-primary/15 text-primary border border-primary/20",
            colorScheme === 'neutral' && "bg-muted text-muted-foreground border border-border"
          )}
        >
          {item.label}
          {item.count > 1 && (
            <span className="ml-1 opacity-60">({item.count})</span>
          )}
        </span>
      ))}
    </div>
  );
};

export default SemanticBubbles;
