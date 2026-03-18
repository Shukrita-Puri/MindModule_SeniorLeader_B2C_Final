import { useNavigate } from 'react-router-dom';

const PrivacyFooter = () => {
  const navigate = useNavigate();
  
  return (
    <div className="py-8 text-center flex items-center justify-center gap-3">
      <button
        onClick={() => navigate('/privacy')}
        className="text-[10px] font-body text-gold/60 hover:text-gold transition-colors"
      >
        Privacy by Design
      </button>
      <span className="text-gold/30 text-[10px]">·</span>
      <button
        onClick={() => navigate('/powered-by-ai')}
        className="text-[10px] font-body text-gold/60 hover:text-gold transition-colors"
      >
        Powered by AI
      </button>
    </div>
  );
};

export default PrivacyFooter;
