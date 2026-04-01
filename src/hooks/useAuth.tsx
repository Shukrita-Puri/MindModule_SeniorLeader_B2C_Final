import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { isNativeAuthCompleted, clearNativeAuthCompleted, getNativeTokens, clearNativeTokens, decodeJwtPayload, isNativeiOS, clearNativeLoginInProgress, getSanitisedAuth0Domain, refreshNativeTokens, hasRecoverableNativeSession } from '@/utils/nativeAuth';
import { activateLogoutGuard } from '@/utils/logoutGuard';
import { clearTokenCache } from '@/services/authTokenService';
import { toast } from 'sonner';

declare global {
  interface Window {
    __auth0Client?: {
      getAccessTokenSilently: () => Promise<string>;
    };
  }
}

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
  return <Auth0AuthProvider>{children}</Auth0AuthProvider>;
};

const Auth0AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { user: auth0User, isLoading, logout, isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [nativeAuthed, setNativeAuthed] = useState(false);
  // Track whether initial auth resolution is complete (SDK loaded + native hydration attempted)
  const [authResolved, setAuthResolved] = useState(false);
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
      setAuthResolved(true);
      return;
    }

    if (nativeHydrationAttempted.current) {
      // Already attempted — mark resolved if we didn't find anything
      if (!nativeAuthed) setAuthResolved(true);
      return;
    }

    // Check for native auth completed flag OR recoverable native session
    const hasNativeCompleted = isNativeAuthCompleted();
    const hasRecoverable = hasRecoverableNativeSession();

    if (!hasNativeCompleted && !hasRecoverable) {
      console.log('[useAuth] No native auth state found, marking resolved');
      setAuthResolved(true);
      return;
    }

    nativeHydrationAttempted.current = true;

    (async () => {
      let tokens = getNativeTokens();

      // If tokens exist but access_token is expired, attempt refresh first
      if (tokens && tokens.expires_at < Math.floor(Date.now() / 1000)) {
        console.log('[useAuth] Native access token expired, attempting refresh...');
        const refreshed = await refreshNativeTokens();
        if (refreshed) {
          tokens = getNativeTokens();
        } else {
          console.warn('[useAuth] Native token refresh failed, clearing auth state');
          clearNativeAuthCompleted();
          clearNativeTokens();
          setAuthResolved(true);
          return;
        }
      }

      if (!tokens) {
        console.warn('[useAuth] Native auth flag set but no valid tokens found, clearing');
        clearNativeAuthCompleted();
        setAuthResolved(true);
        return;
      }

      console.log('[useAuth] 🔄 Hydrating auth from native tokens...');
      const payload = decodeJwtPayload(tokens.id_token);
      if (!payload) {
        console.error('[useAuth] Failed to decode native id_token, clearing');
        clearNativeAuthCompleted();
        clearNativeTokens();
        setAuthResolved(true);
        return;
      }

      // Expose native token via global auth client with built-in refresh
      window.__auth0Client = {
        getAccessTokenSilently: async () => {
          const now = Math.floor(Date.now() / 1000);
          const currentTokens = getNativeTokens();
          if (currentTokens && currentTokens.expires_at > now + 60) {
            return currentTokens.access_token;
          }
          // Token expired or expiring — try refresh
          const refreshed = await refreshNativeTokens();
          if (refreshed) {
            const freshTokens = getNativeTokens();
            if (freshTokens) return freshTokens.access_token;
          }
          // Fallback: return whatever we have (may be stale)
          console.warn('[useAuth] Could not refresh native token, returning possibly stale token');
          return currentTokens?.access_token || tokens!.access_token;
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
      setAuthResolved(true);
      console.log('[useAuth] ✅ Native auth hydration complete, user:', payload.sub);

      // Now attempt profile sync with native token
      try {
        setSyncing(true);
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const freshTokens = getNativeTokens();
        const tokenToUse = freshTokens?.access_token || tokens.access_token;
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/sync-profile`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenToUse}`,
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

      if (syncAttempted.current && currentSub && lastSyncedSub.current && currentSub !== lastSyncedSub.current) {
        console.warn('[useAuth] ⚠️ Auth0 user changed mid-session:', lastSyncedSub.current, '→', currentSub);
        syncAttempted.current = false;
      }

      if (syncAttempted.current) return;
      syncAttempted.current = true;
      
      setSyncing(true);
      
      try {
        const token = await getAccessTokenSilently();

        // TIER 4: Client-side token validation
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
              await signOutFederated();
              return;
            }
          }
        } catch (decodeErr) {
          console.warn('[useAuth] Token decode check failed (non-fatal):', decodeErr);
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
            body: JSON.stringify({
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
          const errorBody = await response.text();
          console.error('[useAuth] ⚠️ Profile sync failed:', response.status, errorBody);
          syncAttempted.current = false;

          // CRITICAL: Preserve last-known-good profile state on transient failures.
          // Only create a minimal Auth0 user if we have NO existing profile at all.
          setAppUser(prev => {
            if (prev && prev.id) {
              console.warn('[useAuth] Preserving last-known-good profile for', prev.id);
              return prev;
            }
            console.warn('[useAuth] No prior profile, creating minimal Auth0-only user');
            return {
              id: auth0User.sub!,
              email: auth0User.email!,
              name: auth0User.name,
              picture: auth0User.picture,
            };
          });
        }
      } catch (error) {
        console.error('[useAuth] ⚠️ Profile sync error:', error);
        syncAttempted.current = false;

        // CRITICAL: Same preservation logic — never downgrade to 'none' on transient errors
        setAppUser(prev => {
          if (prev && prev.id) {
            console.warn('[useAuth] Preserving last-known-good profile for', prev.id);
            return prev;
          }
          console.warn('[useAuth] No prior profile, creating minimal Auth0-only user');
          return {
            id: auth0User.sub!,
            email: auth0User.email!,
            name: auth0User.name,
            picture: auth0User.picture,
          };
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
          body: JSON.stringify({ timezone_offset: -(new Date().getTimezoneOffset()) }),
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
    setAuthResolved(false);
    clearNativeTokens();
    clearNativeAuthCompleted();
    clearNativeLoginInProgress();
    setAppUser(null);
    delete window.__auth0Client;
  };

  // Normal sign-out
  const signOut = async () => {
    cleanupLocalState();

    if (isNativeiOS()) {
      try {
        await logout({ openUrl: false });
      } catch (e) {
        console.warn('[useAuth] Native logout cleanup error (non-fatal):', e);
      }
      try {
        const domain = getSanitisedAuth0Domain();
        const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
        const logoutUrl = `https://${domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent('https://app.mindmodule.me')}`;
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

    await logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  };

  // Federated logout
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

  // Loading = true until:
  // 1. Auth0 SDK has finished loading AND
  // 2. Auth resolution is complete (native hydration attempted) AND
  // 3. Profile sync is not in progress (if authenticated)
  const effectiveLoading = isLoading || !authResolved || syncing;

  return (
    <AuthContext.Provider value={{ 
      user: appUser, 
      loading: effectiveLoading, 
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
