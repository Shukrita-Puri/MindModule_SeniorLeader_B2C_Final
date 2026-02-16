
## Direct Auth0 Redirect from Front Page

### What Changes

**One file: `src/pages/Front.tsx`**

Instead of navigating to `/login` (which shows an intermediate page), the "Sign In" button will call Auth0's `loginWithRedirect()` directly. This means clicking "Sign In" on the landing page immediately redirects the browser to the Auth0 login screen -- no intermediate page, no extra click.

### Technical Details

1. Import `useAuth0` from `@auth0/auth0-react` in `Front.tsx`
2. Call `const { loginWithRedirect } = useAuth0()` inside the component
3. Replace `handleSignIn` from `navigate('/login')` to:
   ```typescript
   const handleSignIn = () => {
     loginWithRedirect({
       appState: { returnTo: '/executive-home' },
       authorizationParams: {
         redirect_uri: `${window.location.origin}/callback`,
         scope: 'openid profile email',
       },
     });
   };
   ```
4. Remove the `useNavigate` import for `/login` (keep it for `/onboarding`)

### User Experience

- User clicks "Sign In" on the front page
- Browser immediately redirects to Auth0 login (as shown in your second screenshot)
- After authentication, user lands on `/executive-home`
- No intermediate spinner page, no extra clicks

### Note on Lovable Editor Preview

Inside the Lovable editor iframe, clicking "Sign In" will attempt the redirect but Auth0 will refuse to render (X-Frame-Options: DENY). This is unavoidable with Auth0 -- it only works in a standalone browser tab. The Login.tsx page with its "Open in new tab" fallback remains available as a route for edge cases, but the primary flow skips it entirely.
