import { cn } from '@/lib/utils';

interface PracticeType {
  type: string;
  count: number;
  percentage: number;
}

interface PracticeFocusBarProps {
  data: PracticeType[];
}

const typeColors: Record<string, string> = {
  'Pause': 'bg-primary',
  'Flow': 'bg-emerald-500',
  'Renewal': 'bg-saffron',
  'other': 'bg-muted-foreground'
};

const typeLabels: Record<string, string> = {
  'Pause': 'Pause',
  'Flow': 'Flow',
  'Renewal': 'Renewal',
  'other': 'Other'
};

const PracticeFocusBar = ({ data }: PracticeFocusBarProps) => {
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  
  if (totalCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Complete practices to see your focus distribution.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="h-8 rounded-full overflow-hidden flex bg-muted/30">
        {data.map((item, index) => (
          item.percentage > 0 && (
            <div
              key={item.type}
              className={cn(
                "h-full flex items-center justify-center transition-all",
                typeColors[item.type] || typeColors['other'],
                index === 0 && "rounded-l-full",
                index === data.length - 1 && "rounded-r-full"
              )}
              style={{ width: `${item.percentage}%` }}
            >
              {item.percentage >= 15 && (
                <span className="text-xs font-medium text-white px-1">
                  {item.percentage}%
                </span>
              )}
            </div>
          )
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        {data.map(item => (
          item.count > 0 && (
            <div key={item.type} className="flex items-center gap-1.5">
              <div className={cn("w-3 h-3 rounded-full", typeColors[item.type] || typeColors['other'])} />
              <span className="text-xs text-muted-foreground">
                {typeLabels[item.type] || item.type} ({item.count})
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

export default PracticeFocusBar;
