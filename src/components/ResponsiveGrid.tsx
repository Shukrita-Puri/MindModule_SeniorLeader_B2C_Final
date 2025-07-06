
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  cols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: number;
}

export const ResponsiveGrid = ({ 
  children, 
  className, 
  cols = { default: 1, sm: 1, md: 2, lg: 3, xl: 4 },
  gap = 4 
}: ResponsiveGridProps) => {
  // Use explicit Tailwind classes to ensure they're available
  const getGridCols = (cols: ResponsiveGridProps['cols']) => {
    const classes = [];
    
    if (cols?.default === 1) classes.push('grid-cols-1');
    if (cols?.default === 2) classes.push('grid-cols-2');
    if (cols?.default === 3) classes.push('grid-cols-3');
    if (cols?.default === 4) classes.push('grid-cols-4');
    
    if (cols?.sm === 1) classes.push('sm:grid-cols-1');
    if (cols?.sm === 2) classes.push('sm:grid-cols-2');
    if (cols?.sm === 3) classes.push('sm:grid-cols-3');
    if (cols?.sm === 4) classes.push('sm:grid-cols-4');
    
    if (cols?.md === 1) classes.push('md:grid-cols-1');
    if (cols?.md === 2) classes.push('md:grid-cols-2');
    if (cols?.md === 3) classes.push('md:grid-cols-3');
    if (cols?.md === 4) classes.push('md:grid-cols-4');
    
    if (cols?.lg === 1) classes.push('lg:grid-cols-1');
    if (cols?.lg === 2) classes.push('lg:grid-cols-2');
    if (cols?.lg === 3) classes.push('lg:grid-cols-3');
    if (cols?.lg === 4) classes.push('lg:grid-cols-4');
    
    if (cols?.xl === 1) classes.push('xl:grid-cols-1');
    if (cols?.xl === 2) classes.push('xl:grid-cols-2');
    if (cols?.xl === 3) classes.push('xl:grid-cols-3');
    if (cols?.xl === 4) classes.push('xl:grid-cols-4');
    
    return classes;
  };

  const getGapClass = (gap: number) => {
    switch(gap) {
      case 1: return 'gap-1';
      case 2: return 'gap-2';
      case 3: return 'gap-3';
      case 4: return 'gap-4';
      case 5: return 'gap-5';
      case 6: return 'gap-6';
      case 8: return 'gap-8';
      default: return 'gap-4';
    }
  };

  const gridClasses = cn(
    "grid",
    ...getGridCols(cols),
    getGapClass(gap),
    className
  );

  return (
    <div className={gridClasses}>
      {children}
    </div>
  );
};

export default ResponsiveGrid;
