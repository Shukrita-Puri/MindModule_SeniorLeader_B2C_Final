
interface Mentor {
  id: string;
  name: string;
  image: string;
}

interface MentorAvatarsProps {
  mentors: Mentor[];
  onMentorSelect: (mentorId: string) => void;
}

const MentorAvatars = ({ mentors, onMentorSelect }: MentorAvatarsProps) => {
  return (
    <div className="flex items-center px-4 py-3 justify-center gap-4 bg-white border-b border-gray-100">
      {mentors.map((mentor) => (
        <div key={mentor.id} className="flex flex-col items-center">
          <div
            className="bg-center bg-no-repeat aspect-square bg-cover border-white bg-gray-200 rounded-full flex items-center justify-center w-12 h-12 border-2 cursor-pointer hover:scale-110 transition-transform filter grayscale contrast-125 brightness-90"
            style={{ 
              backgroundImage: `url("${mentor.image}")`,
              filter: 'grayscale(100%) contrast(150%) brightness(80%)',
              mixBlendMode: 'multiply'
            }}
            onClick={() => onMentorSelect(mentor.id)}
          />
          <span className="text-xs text-gray-600 mt-1 text-center max-w-[60px] truncate">
            {mentor.name.split(' ')[0]}
          </span>
        </div>
      ))}
    </div>
  );
};

export default MentorAvatars;
