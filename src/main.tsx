import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './hooks/useAuth'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain={auth0Domain}
    clientId={auth0ClientId}
    authorizationParams={{
      redirect_uri: `${window.location.origin}/callback`
    }}
    useRefreshTokens={true}
    cacheLocation="localstorage"
  >
    <AuthProvider>
      <App />
    </AuthProvider>
  </Auth0Provider>
);
