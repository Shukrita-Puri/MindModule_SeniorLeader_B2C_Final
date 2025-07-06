
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const InnerArchitect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to Index page (mode selection)
    navigate("/index", { replace: true });
  }, [navigate]);

  return null;
};

export default InnerArchitect;
