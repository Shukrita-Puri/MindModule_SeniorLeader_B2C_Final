
import { Heart } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";

const FloatingRecalibrate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isPulsing, setIsPulsing] = useState(false);

  // Don't show on Recalibrate page itself
  if (location.pathname === "/recalibrate") return null;

  const handleRecalibrateClick = () => {
    setIsPulsing(true);
    setTimeout(() => {
      navigate("/recalibrate");
    }, 300);
  };

  return (
    <button
      onClick={handleRecalibrateClick}
      className={`
        fixed bottom-6 right-6 z-50 w-16 h-16 
        bg-gradient-to-br from-red-500 to-red-600 
        rounded-full shadow-2xl
        flex items-center justify-center
        transition-all duration-300 ease-out
        hover:scale-110 active:scale-95
        ${isPulsing ? 'animate-pulse scale-110' : ''}
      `}
    >
      <Heart 
        size={24} 
        className="text-white fill-white animate-pulse" 
      />
    </button>
  );
};

export default FloatingRecalibrate;
