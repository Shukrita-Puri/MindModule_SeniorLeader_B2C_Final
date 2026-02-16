import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated, user } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (error) {
      console.error('[AuthCallback] Auth0 callback error:', error);
      toast.error('Authentication failed. Please try again.');
      navigate('/signup?error=auth_failed');
      return;
    }

    if (isAuthenticated) {
      const returnTo = sessionStorage.getItem('auth0_return_to') || '/executive-home';
      sessionStorage.removeItem('auth0_return_to');
      toast.success(`Welcome back${user?.given_name ? `, ${user.given_name}` : ''}!`);
      navigate(returnTo);
    }
  }, [isLoading, error, isAuthenticated, navigate, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
