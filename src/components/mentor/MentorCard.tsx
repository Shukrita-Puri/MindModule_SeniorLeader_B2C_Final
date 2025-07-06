
import { Button } from "@/components/ui/button";

interface MentorCardProps {
  mentor: {
    id: string;
    name: string;
    title: string;
    image: string;
    description: string;
  };
  onSelect: (mentorId: string) => void;
}

const MentorCard = ({ mentor, onSelect }: MentorCardProps) => {
  return (
    <div className="rounded-xl overflow-hidden shadow-sm bg-white border border-gray-200">
      <div className="relative min-h-[140px] pt-20 flex flex-col items-stretch justify-end">
        {/* Linocut style background with overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${mentor.image}")`,
            filter: 'grayscale(100%) contrast(200%) brightness(70%)',
            mixBlendMode: 'multiply'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        
        <div className="relative flex w-full items-end justify-between gap-3 p-4 z-10">
          <div className="flex-1">
            <p className="text-white text-lg font-bold leading-tight">{mentor.name}</p>
            <p className="text-white text-xs font-medium leading-normal mb-1">{mentor.title}</p>
            <p className="text-white/90 text-xs">{mentor.description}</p>
          </div>
          <Button
            onClick={() => onSelect(mentor.id)}
            size="sm"
            className="bg-hyper-coral hover:bg-red-600 text-white text-xs font-bold whitespace-nowrap border-0"
          >
            Ask Questions
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MentorCard;
