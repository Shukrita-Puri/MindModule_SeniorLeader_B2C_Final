import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { isNativeAuthCompleted, clearNativeAuthCompleted, getNativeTokens, clearNativeTokens, decodeJwtPayload, isNativeiOS, clearNativeLoginInProgress, getSanitisedAuth0Domain } from '@/utils/nativeAuth';
import { activateLogoutGuard } from '@/utils/logoutGuard';
import { clearTokenCache } from '@/services/authTokenService';

// Extend window type for global auth client
declare global {
  interface Window {
    __auth0Client?: {
      getAccessTokenSilently: () => Promise<string>;
    };
  }
}

// Custom user type that includes subscription metadata
interface AppUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  subscription_status?: 'active' | 'inactive' | 'trial';
  subscription_plan?: 'monthly' | 'annual';
  onboarding_completed?: boolean;
  onboarding_completed_at?: string | null;
  user_archetype?: string;
  subscription_tier?: string;
  trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_canceled_at?: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Dev mode: return mock data immediately
  if (DEV_MODE) {
    return (
      <AuthContext.Provider value={{ 
        user: DEV_USER, 
        loading: false, 
        signOut: async () => console.log('[DEV MODE] Sign out called'),
        refreshProfile: async () => console.log('[DEV MODE] Refresh profile called'),
        isAuthenticated: true 
      }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // Production mode: use Auth0
  return <Auth0AuthProvider>{children}</Auth0AuthProvider>;
};

// Separate component for Auth0 logic to avoid hook rules issues
const Auth0AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { user: auth0User, isLoading, logout, isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [nativeAuthed, setNativeAuthed] = useState(false);
  const syncAttempted = useRef(false);
  const nativeHydrationAttempted = useRef(false);

  // Expose Auth0 client globally for utility functions that can't use hooks
  useEffect(() => {
    if (getAccessTokenSilently) {
      window.__auth0Client = {
        getAccessTokenSilently: () => getAccessTokenSilently()
      };
      console.log('[useAuth] Auth0 client exposed globally');
    }
    return () => {
      delete window.__auth0Client;
    };
  }, [getAccessTokenSilently]);

  // Native auth hydration: when SDK doesn't pick up tokens, use native token store
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      // SDK caught up — clear native flags if present
      if (isNativeAuthCompleted()) {
        console.log('[useAuth] SDK is authenticated, clearing native auth flags');
        clearNativeAuthCompleted();
        clearNativeTokens();
        setNativeAuthed(false);
      }
      return;
    }
    if (nativeHydrationAttempted.current) return;
    if (!isNativeAuthCompleted()) return;

    nativeHydrationAttempted.current = true;
    const tokens = getNativeTokens();
    if (!tokens) {
      console.warn('[useAuth] Native auth flag set but no valid tokens found, clearing');
      clearNativeAuthCompleted();
      return;
    }

    console.log('[useAuth] 🔄 Hydrating auth from native tokens...');
    const payload = decodeJwtPayload(tokens.id_token);
    if (!payload) {
      console.error('[useAuth] Failed to decode native id_token, clearing');
      clearNativeAuthCompleted();
      clearNativeTokens();
      return;
    }

    // Expose native token via global auth client so API calls work
    // Includes refresh logic: if access token is near expiry and refresh_token exists,
    // attempt to get a new one from Auth0's /oauth/token endpoint.
    window.__auth0Client = {
      getAccessTokenSilently: async () => {
        // Check if current token is still valid (with 60s buffer)
        const now = Math.floor(Date.now() / 1000);
        const currentTokens = getNativeTokens();
        if (currentTokens && currentTokens.expires_at > now + 60) {
          return currentTokens.access_token;
        }
        // Token expired or expiring — try refresh
        const storedRaw = localStorage.getItem('native_auth_tokens');
        if (storedRaw) {
          try {
            const stored = JSON.parse(storedRaw);
            if (stored.refresh_token) {
              console.log('[useAuth] 🔄 Native token expired, refreshing...');
              const domain = getSanitisedAuth0Domain();
              const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
              const resp = await fetch(`https://${domain}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  grant_type: 'refresh_token',
                  client_id: clientId,
                  refresh_token: stored.refresh_token,
                }),
              });
              if (resp.ok) {
                const data = await resp.json();
                // Update stored tokens
                const entry = {
                  access_token: data.access_token,
                  id_token: data.id_token || stored.id_token,
                  refresh_token: data.refresh_token || stored.refresh_token,
                  expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 86400),
                };
                localStorage.setItem('native_auth_tokens', JSON.stringify(entry));
                console.log('[useAuth] ✅ Native token refreshed');
                return data.access_token;
              } else {
                console.warn('[useAuth] Native token refresh failed:', resp.status);
              }
            }
          } catch (e) {
            console.warn('[useAuth] Native token refresh error:', e);
          }
        }
        // Fallback: return whatever we have (may be stale)
        return tokens.access_token;
      },
    };

    // Create user from JWT claims
    const nativeUser: AppUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || payload.nickname,
      picture: payload.picture,
      subscription_status: 'trial',
      subscription_plan: 'monthly',
    };
    setAppUser(nativeUser);
    setNativeAuthed(true);
    console.log('[useAuth] ✅ Native auth hydration complete, user:', payload.sub);

    // Now attempt profile sync with native token
    (async () => {
      try {
        setSyncing(true);
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/sync-profile`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: payload.email,
              name: payload.name || payload.nickname,
              picture: payload.picture,
            }),
          }
        );

        if (response.ok) {
          const { profile } = await response.json();
          console.log('[useAuth] ✅ Native profile synced:', profile.id);
          setAppUser({
            id: profile.id,
            email: profile.email,
            name: profile.display_name || profile.auth_name || profile.full_name || payload.name,
            picture: payload.picture,
            subscription_status: profile.subscription_status || 'trial',
            subscription_plan: profile.subscription_plan || 'monthly',
            onboarding_completed: !!profile.onboarding_completed_at,
            onboarding_completed_at: profile.onboarding_completed_at || null,
            user_archetype: profile.user_archetype,
            subscription_tier: profile.subscription_tier || 'none',
            trial_ends_at: profile.trial_ends_at || null,
            subscription_current_period_end: profile.subscription_current_period_end || null,
            subscription_canceled_at: profile.subscription_canceled_at || null,
          });
        } else {
          console.warn('[useAuth] Native profile sync failed:', response.status);
        }
      } catch (err) {
        console.warn('[useAuth] Native profile sync error:', err);
      } finally {
        setSyncing(false);
      }
    })();
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    const syncProfile = async () => {
      if (!auth0User || !isAuthenticated || syncing) return;
      // Only attempt sync once per auth session
      if (syncAttempted.current) return;
      syncAttempted.current = true;
      
      setSyncing(true);
      
      try {
        // Get access token for server-side verification
        const token = await getAccessTokenSilently();

        // Call sync-profile edge function (server-side upsert)
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/sync-profile`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              // Client hints as fallback only — server verifies identity from JWT
              email: auth0User.email,
              name: auth0User.name,
              picture: auth0User.picture,
            }),
          }
        );

        if (response.ok) {
          const { profile } = await response.json();
          console.log('[useAuth] ✅ Profile synced to Supabase:', profile.id);

          // Use Supabase profile as source of truth for app user
          const mappedUser: AppUser = {
            id: profile.id,
            email: profile.email,
            name: profile.display_name || profile.auth_name || profile.full_name || auth0User.name,
            picture: auth0User.picture,
            subscription_status: profile.subscription_status || 'trial',
            subscription_plan: profile.subscription_plan || 'monthly',
            onboarding_completed: !!profile.onboarding_completed_at,
            onboarding_completed_at: profile.onboarding_completed_at || null,
            user_archetype: profile.user_archetype,
            subscription_tier: profile.subscription_tier || 'none',
            trial_ends_at: profile.trial_ends_at || null,
            subscription_current_period_end: profile.subscription_current_period_end || null,
            subscription_canceled_at: profile.subscription_canceled_at || null,
          };
          setAppUser(mappedUser);
        } else {
          // Sync failed — still allow auth but log error clearly
          const errorBody = await response.text();
          console.error('[useAuth] ⚠️ Profile sync failed:', response.status, errorBody);
          console.warn('[useAuth] Falling back to Auth0-only user data (will retry next load)');
          syncAttempted.current = false; // Allow retry on next load

          // Fallback: use Auth0 data directly
          setAppUser({
            id: auth0User.sub!,
            email: auth0User.email!,
            name: auth0User.name,
            picture: auth0User.picture,
            subscription_status: 'trial',
            subscription_plan: 'monthly',
            onboarding_completed_at: null,
            subscription_tier: 'none',
          });
        }
      } catch (error) {
        console.error('[useAuth] ⚠️ Profile sync error:', error);
        console.warn('[useAuth] Falling back to Auth0-only user data (will retry next load)');
        syncAttempted.current = false; // Allow retry on next load

        // Fallback: use Auth0 data directly
        setAppUser({
          id: auth0User.sub!,
          email: auth0User.email!,
          name: auth0User.name,
          picture: auth0User.picture,
          subscription_status: 'trial',
          subscription_plan: 'monthly',
          onboarding_completed_at: null,
          subscription_tier: 'none',
        });
      } finally {
        setSyncing(false);
      }
    };
    
    syncProfile();
  }, [auth0User, isAuthenticated, getAccessTokenSilently]);

  const refreshProfile = async () => {
    try {
      console.log('[useAuth] 🔄 Refreshing profile...');
      let token: string;
      if (window.__auth0Client) {
        token = await window.__auth0Client.getAccessTokenSilently();
      } else {
        token = await getAccessTokenSilently();
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sync-profile`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        const { profile } = await response.json();
        console.log('[useAuth] ✅ Profile refreshed, onboarding_completed_at:', profile.onboarding_completed_at);
        setAppUser(prev => prev ? {
          ...prev,
          name: profile.display_name || profile.auth_name || profile.full_name || prev.name,
          subscription_status: profile.subscription_status || prev.subscription_status,
          subscription_plan: profile.subscription_plan || prev.subscription_plan,
          onboarding_completed: !!profile.onboarding_completed_at,
          onboarding_completed_at: profile.onboarding_completed_at || null,
          user_archetype: profile.user_archetype || prev.user_archetype,
          subscription_tier: profile.subscription_tier || prev.subscription_tier,
          trial_ends_at: profile.trial_ends_at || prev.trial_ends_at,
          subscription_current_period_end: profile.subscription_current_period_end || prev.subscription_current_period_end,
          subscription_canceled_at: profile.subscription_canceled_at || prev.subscription_canceled_at,
        } : prev);
      } else {
        console.warn('[useAuth] Profile refresh failed:', response.status);
      }
    } catch (err) {
      console.warn('[useAuth] Profile refresh error:', err);
    }
  };

  const signOut = async () => {
    // 1. Activate logout guard BEFORE anything else — prevents auto-login race
    activateLogoutGuard();
    clearTokenCache();

    // 2. Clear all native auth state
    syncAttempted.current = false;
    nativeHydrationAttempted.current = false;
    setNativeAuthed(false);
    clearNativeTokens();
    clearNativeAuthCompleted();
    clearNativeLoginInProgress();
    setAppUser(null);
    delete window.__auth0Client;

    // 3. On native iOS, do a local-only logout (no external redirect to Auth0)
    //    to avoid bouncing the user into Safari.
    if (isNativeiOS()) {
      // Clear Auth0 SDK cache locally without triggering a redirect
      try {
        await logout({ openUrl: false });
      } catch (e) {
        console.warn('[useAuth] Native logout cleanup error (non-fatal):', e);
      }
      // Navigation to "/" is handled by the caller (signOut consumer)
      return;
    }

    // 4. Web: standard Auth0 redirect logout
    await logout({ 
      logoutParams: { 
        returnTo: window.location.origin 
      } 
    });
  };

  const effectiveAuthenticated = isAuthenticated || nativeAuthed;

  return (
    <AuthContext.Provider value={{ 
      user: appUser, 
      loading: isLoading || syncing, 
      signOut,
      refreshProfile,
      isAuthenticated: effectiveAuthenticated
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
