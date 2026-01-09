import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './hooks/useAuth'
import { DEV_MODE } from './config/devMode'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';

// Dev mode: render without Auth0Provider to avoid initialization errors
if (DEV_MODE) {
  createRoot(document.getElementById("root")!).render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
} else {
  // Production mode: use Auth0Provider
  createRoot(document.getElementById("root")!).render(
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/callback`
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
      onRedirectCallback={(appState) => {
        const returnTo = appState?.returnTo || '/executive-home';
        window.history.replaceState({}, document.title, returnTo);
      }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </Auth0Provider>
  );
}
