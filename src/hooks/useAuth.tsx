import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { isNativeAuthCompleted, clearNativeAuthCompleted, getNativeTokens, clearNativeTokens, decodeJwtPayload, isNativeiOS, clearNativeLoginInProgress, getSanitisedAuth0Domain } from '@/utils/nativeAuth';
import { activateLogoutGuard } from '@/utils/logoutGuard';
import { clearTokenCache } from '@/services/authTokenService';
import { toast } from 'sonner';

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
  subscription_status?: 'active' | 'inactive' | 'trial' | 'trialing' | 'canceled' | 'past_due' | 'none';
  subscription_plan?: 'monthly' | 'annual';
  onboarding_completed?: boolean;
  onboarding_completed_at?: string | null;
  user_archetype?: string;
  subscription_tier?: string;
  trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_canceled_at?: string | null;
  subscription_cancel_at?: string | null;
  beta_user?: boolean;
  beta_expires_at?: string | null;
  stripe_customer_id?: string | null;
  founding_member?: boolean;
  referral_code?: string | null;
  referral_rewards_balance?: number;
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
      subscription_status: 'none',
      subscription_plan: undefined,
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
              timezone_offset: -(new Date().getTimezoneOffset()),
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
            subscription_status: profile.subscription_status || 'none',
            subscription_plan: profile.subscription_plan || undefined,
            onboarding_completed: !!profile.onboarding_completed_at,
            onboarding_completed_at: profile.onboarding_completed_at || null,
            user_archetype: profile.user_archetype,
            subscription_tier: profile.subscription_tier || 'none',
            trial_ends_at: profile.trial_ends_at || null,
            subscription_current_period_end: profile.subscription_current_period_end || null,
            subscription_canceled_at: profile.subscription_canceled_at || null,
            subscription_cancel_at: profile.subscription_cancel_at || null,
            beta_user: profile.beta_user || false,
            beta_expires_at: profile.beta_expires_at || null,
            stripe_customer_id: profile.stripe_customer_id || null,
            founding_member: profile.founding_member || false,
            referral_code: profile.referral_code || null,
            referral_rewards_balance: profile.referral_rewards_balance || 0,
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

  // Track the last synced Auth0 sub to detect mid-session user switches
  const lastSyncedSub = useRef<string | null>(null);

  useEffect(() => {
    const syncProfile = async () => {
      if (!auth0User || !isAuthenticated || syncing) return;

      const currentSub = auth0User.sub;

      // Detect mid-session user switch: if Auth0 silently refreshed and
      // returned a different identity, reset sync gate so we re-sync.
      if (syncAttempted.current && currentSub && lastSyncedSub.current && currentSub !== lastSyncedSub.current) {
        console.warn('[useAuth] ⚠️ Auth0 user changed mid-session:', lastSyncedSub.current, '→', currentSub);
        syncAttempted.current = false;
      }

      // Only attempt sync once per identity
      if (syncAttempted.current) return;
      syncAttempted.current = true;
      
      setSyncing(true);
      
      try {
        // Get access token for server-side verification
        const token = await getAccessTokenSilently();

        // TIER 4: Client-side token validation — verify token sub matches Auth0 SDK user
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            const tokenSub = payload.sub;
            if (tokenSub && currentSub && tokenSub !== currentSub) {
              console.error('[useAuth] 🚨 TOKEN MISMATCH — token sub:', tokenSub, 'auth0User sub:', currentSub);
              syncAttempted.current = false;
              setSyncing(false);
              toast.error('Session mismatch detected. Please log in again.');
              // Force federated logout to clear stale session
              await signOutFederated();
              return;
            }
          }
        } catch (decodeErr) {
          console.warn('[useAuth] Token decode check failed (non-fatal):', decodeErr);
        }

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
              timezone_offset: -(new Date().getTimezoneOffset()),
            }),
          }
        );

        if (response.ok) {
          const { profile } = await response.json();
          console.log('[useAuth] ✅ Profile synced to Supabase:', profile.id);
          lastSyncedSub.current = currentSub || profile.id;

          // Use Supabase profile as source of truth for app user
          const mappedUser: AppUser = {
            id: profile.id,
            email: profile.email,
            name: profile.display_name || profile.auth_name || profile.full_name || auth0User.name,
            picture: auth0User.picture,
            subscription_status: profile.subscription_status || 'none',
            subscription_plan: profile.subscription_plan || undefined,
            onboarding_completed: !!profile.onboarding_completed_at,
            onboarding_completed_at: profile.onboarding_completed_at || null,
            user_archetype: profile.user_archetype,
            subscription_tier: profile.subscription_tier || 'none',
            trial_ends_at: profile.trial_ends_at || null,
            subscription_current_period_end: profile.subscription_current_period_end || null,
            subscription_canceled_at: profile.subscription_canceled_at || null,
            subscription_cancel_at: profile.subscription_cancel_at || null,
            beta_user: profile.beta_user || false,
            beta_expires_at: profile.beta_expires_at || null,
            stripe_customer_id: profile.stripe_customer_id || null,
            founding_member: profile.founding_member || false,
            referral_code: profile.referral_code || null,
            referral_rewards_balance: profile.referral_rewards_balance || 0,
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
            subscription_status: 'none',
            subscription_plan: undefined,
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
          subscription_status: 'none',
          subscription_plan: undefined,
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
          subscription_status: profile.subscription_status ?? prev.subscription_status,
          subscription_plan: profile.subscription_plan ?? prev.subscription_plan,
          onboarding_completed: !!profile.onboarding_completed_at,
          onboarding_completed_at: profile.onboarding_completed_at ?? null,
          user_archetype: profile.user_archetype ?? prev.user_archetype,
          subscription_tier: profile.subscription_tier ?? prev.subscription_tier,
          trial_ends_at: profile.trial_ends_at ?? prev.trial_ends_at,
          subscription_current_period_end: profile.subscription_current_period_end ?? prev.subscription_current_period_end,
          subscription_canceled_at: profile.subscription_canceled_at ?? prev.subscription_canceled_at,
          subscription_cancel_at: profile.subscription_cancel_at ?? prev.subscription_cancel_at,
          beta_user: profile.beta_user ?? prev.beta_user,
          beta_expires_at: profile.beta_expires_at ?? prev.beta_expires_at,
          stripe_customer_id: profile.stripe_customer_id ?? prev.stripe_customer_id,
          founding_member: profile.founding_member ?? prev.founding_member,
          referral_code: profile.referral_code ?? prev.referral_code,
          referral_rewards_balance: profile.referral_rewards_balance ?? prev.referral_rewards_balance,
        } : prev);
      } else {
        console.warn('[useAuth] Profile refresh failed:', response.status);
      }
    } catch (err) {
      console.warn('[useAuth] Profile refresh error:', err);
    }
  };

  // Shared cleanup for all logout paths
  const cleanupLocalState = () => {
    activateLogoutGuard();
    clearTokenCache();
    syncAttempted.current = false;
    nativeHydrationAttempted.current = false;
    setNativeAuthed(false);
    clearNativeTokens();
    clearNativeAuthCompleted();
    clearNativeLoginInProgress();
    setAppUser(null);
    delete window.__auth0Client;
  };

  // Normal sign-out: clears app + Auth0 session only, does NOT sign out of Google
  const signOut = async () => {
    cleanupLocalState();

    // Native iOS: local logout + clear Auth0 server session (no IdP logout)
    if (isNativeiOS()) {
      try {
        await logout({ openUrl: false });
      } catch (e) {
        console.warn('[useAuth] Native logout cleanup error (non-fatal):', e);
      }
      try {
        const domain = getSanitisedAuth0Domain();
        const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
        const logoutUrl = `https://${domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent('app.mindmodule.me://callback')}`;
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: logoutUrl, presentationStyle: 'popover' });
        setTimeout(async () => {
          try { await Browser.close(); } catch { /* ignore */ }
        }, 1500);
      } catch (e) {
        console.warn('[useAuth] Native Auth0 session clear error (non-fatal):', e);
      }
      return;
    }

    // Web: logout from Auth0 only (no federated flag = Google session preserved)
    await logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  };

  // Federated logout — also signs out of upstream IdP (Google). Used only for security cases.
  const signOutFederated = async () => {
    cleanupLocalState();

    if (isNativeiOS()) {
      try { await logout({ openUrl: false }); } catch { /* ignore */ }
      return;
    }

    await logout({
      logoutParams: {
        returnTo: window.location.origin,
        federated: true,
      },
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
