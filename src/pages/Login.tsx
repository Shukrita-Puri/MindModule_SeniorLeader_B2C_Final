import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { loginWithRedirect, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    // If already authenticated, redirect to home
    if (isAuthenticated) {
      navigate('/executive-home');
      return;
    }

    // Redirect to Auth0 Universal Login
    loginWithRedirect({
      authorizationParams: {
        redirect_uri: `${window.location.origin}/callback`,
        screen_hint: 'login', // Shows login form by default
      }
    });
  }, [isAuthenticated, loginWithRedirect, navigate]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
};

export default Login;
