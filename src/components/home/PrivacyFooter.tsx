import { useNavigate } from 'react-router-dom';

const PrivacyFooter = () => {
  const navigate = useNavigate();
  
  return (
    <div className="py-8 text-center">
      <button
        onClick={() => navigate('/privacy')}
        className="text-[10px] font-body text-gold/60 hover:text-gold transition-colors"
      >
        Privacy by Design
      </button>
    </div>
  );
};

export default PrivacyFooter;
