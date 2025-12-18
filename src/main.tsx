import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './hooks/useAuth'
import { CANONICAL_APP_URL } from './utils/authRedirect'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain={auth0Domain}
    clientId={auth0ClientId}
    authorizationParams={{
      redirect_uri: `${CANONICAL_APP_URL}/callback`
    }}
    useRefreshTokens={true}
    cacheLocation="localstorage"
    onRedirectCallback={(appState) => {
      // Navigate to intended destination after auth, default to executive-home
      const returnTo = appState?.returnTo || '/executive-home';
      window.history.replaceState({}, document.title, returnTo);
    }}
  >
    <AuthProvider>
      <App />
    </AuthProvider>
  </Auth0Provider>
);
