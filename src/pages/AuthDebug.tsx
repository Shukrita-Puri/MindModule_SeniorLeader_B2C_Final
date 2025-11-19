import { useAuth0 } from '@auth0/auth0-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

const AuthDebug = () => {
  const { loginWithRedirect, logout, isAuthenticated, isLoading, error, user } = useAuth0();

  const handleLogin = async () => {
    try {
      await loginWithRedirect({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback`,
          screen_hint: 'login',
        },
      });
    } catch (e) {
      console.error('Login redirect failed:', e);
    }
  };

  const handleSignup = async () => {
    try {
      await loginWithRedirect({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback?from=onboarding`,
          screen_hint: 'signup',
        },
      });
    } catch (e) {
      console.error('Signup redirect failed:', e);
    }
  };

  const handleLogout = () => {
    logout({ 
      logoutParams: { 
        returnTo: window.location.origin 
      } 
    });
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Auth0 Debug Panel</h1>
        
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Auth Status</h2>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : isAuthenticated ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              )}
              <span className="text-foreground">
                Status: {isLoading ? 'Loading...' : isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
              </span>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600 font-semibold">Error:</p>
                <p className="text-sm text-red-600">{error.message}</p>
              </div>
            )}

            {user && (
              <div className="p-3 bg-muted rounded-md space-y-1">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold">User ID:</span> {user.sub}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold">Email:</span> {user.email || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold">Name:</span> {user.name || 'N/A'}
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Test Actions</h2>
          
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full"
            >
              Test Login Flow
            </Button>

            <Button 
              onClick={handleSignup}
              disabled={isLoading}
              variant="secondary"
              className="w-full"
            >
              Test Signup Flow
            </Button>

            <Button 
              onClick={handleLogout}
              disabled={isLoading || !isAuthenticated}
              variant="outline"
              className="w-full"
            >
              Test Logout
            </Button>
          </div>
        </Card>

        <Card className="p-6 space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Environment</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Domain:</span> {import.meta.env.VITE_AUTH0_DOMAIN}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Client ID:</span> {import.meta.env.VITE_AUTH0_CLIENT_ID}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Callback URL:</span> {window.location.origin}/callback
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AuthDebug;
