
import { ResponsiveRadar } from '@nivo/radar';

interface Domain {
  id: string;
  name: string;
  progress: number;
  color: string;
}

interface DomainRadarProps {
  domains: Domain[];
}

const DomainRadar = ({ domains }: DomainRadarProps) => {
  const data = domains.map(domain => ({
    domain: domain.name.split(' ')[0], // Use first word for cleaner labels
    progress: domain.progress,
    fullName: domain.name
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveRadar
        data={data}
        keys={['progress']}
        indexBy="domain"
        maxValue={100}
        margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
        curve="linearClosed"
        borderWidth={2}
        borderColor="#FF4D4D"
        gridLevels={5}
        gridShape="linear"
        gridLabelOffset={16}
        enableDots={true}
        dotSize={8}
        dotColor="#FF4D4D"
        dotBorderWidth={2}
        dotBorderColor="#ffffff"
        enableDotLabel={false}
        colors={['#FF4D4D']}
        fillOpacity={0.2}
        blendMode="normal"
        animate={true}
        motionConfig="gentle"
        legends={[]}
        theme={{
          grid: {
            line: {
              stroke: '#e5e7eb',
              strokeWidth: 1
            }
          },
          axis: {
            domain: {
              line: {
                stroke: '#9ca3af',
                strokeWidth: 1
              }
            },
            ticks: {
              line: {
                stroke: '#9ca3af',
                strokeWidth: 1
              },
              text: {
                fontSize: 11,
                fill: '#6b7280'
              }
            }
          }
        }}
      />
    </div>
  );
};

export default DomainRadar;
