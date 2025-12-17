import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth0, User as Auth0User } from '@auth0/auth0-react';
import { CANONICAL_APP_URL } from '@/utils/authRedirect';

// Custom user type that includes subscription metadata
interface AppUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  subscription_status?: 'active' | 'inactive' | 'trial';
  subscription_plan?: 'monthly' | 'annual';
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { user: auth0User, isLoading, logout, isAuthenticated } = useAuth0();
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const syncUserToSupabase = async () => {
      if (!auth0User || syncing) return;
      
      setSyncing(true);
      
      try {
        // Map Auth0 user to app user format
        const mappedUser: AppUser = {
          id: auth0User.sub!,
          email: auth0User.email!,
          name: auth0User.name,
          picture: auth0User.picture,
          subscription_status: auth0User['app_metadata']?.subscription_status || 'trial',
          subscription_plan: auth0User['app_metadata']?.subscription_plan || 'monthly',
        };
        
        setAppUser(mappedUser);
      } catch (error) {
        console.error('Error syncing user:', error);
      } finally {
        setSyncing(false);
      }
    };
    
    syncUserToSupabase();
  }, [auth0User, syncing]);

  const signOut = async () => {
    await logout({ 
      logoutParams: { 
        returnTo: CANONICAL_APP_URL 
      } 
    });
    setAppUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user: appUser, 
      loading: isLoading || syncing, 
      signOut,
      isAuthenticated 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
