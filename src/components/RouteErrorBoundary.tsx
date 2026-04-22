/**
 * RouteErrorBoundary
 *
 * Rendered by React Router as the `errorElement` for the root route. Unlike a
 * class-based ErrorBoundary, this is invoked by the router when a loader,
 * action, or render throws — so it ALSO catches things our top-level
 * <ErrorBoundary> can't see (e.g. lazy-chunk load failures from a stale
 * deploy, or a thrown 404 from a route).
 *
 * Design goals:
 *  - Never render an empty page (no `<div />` placeholder).
 *  - Mirror the look of <ErrorBoundary> so users see one consistent error UI.
 *  - Offer "Try again" (re-fetch chunks via reload) and "Go home" recovery.
 */
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const RouteErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  // eslint-disable-next-line no-console
  console.error('[RouteErrorBoundary] Route render/loader error:', error);

  let title = 'Something went wrong';
  let description = 'We encountered an unexpected error loading this page.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page not found';
      description = "The page you're looking for doesn't exist.";
    } else {
      title = `Error ${error.status}`;
      description = error.statusText || description;
    }
  } else if (error instanceof Error) {
    // Detect chunk-load errors from a stale deploy and tell the user to refresh.
    if (/ChunkLoadError|Loading chunk|dynamically imported module/i.test(error.message)) {
      title = 'A new version is available';
      description = 'Please refresh to load the latest version.';
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-[15px] text-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{description}</p>
          <div className="space-y-2">
            <Button
              onClick={() => window.location.reload()}
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Page
            </Button>
            <Button
              onClick={() => navigate('/', { replace: true })}
              variant="outline"
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RouteErrorBoundary;