/**
 * PlayerErrorBoundary
 *
 * Class-based error boundary used around practice players (Soundscape,
 * Guided, Micro, Micro Cards). A crash inside a single player must not
 * take down the whole app — instead we show a small recovery card with
 * "Return to Reset" and "Try again". The reset button increments an
 * internal key so the child remounts cleanly.
 */
import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  /** Where "Return to Reset" should send the user. */
  returnPath?: string;
}

interface State {
  error: Error | null;
  resetKey: number;
}

class PlayerErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[PlayerErrorBoundary] Practice player crashed:', error, info);
  }

  handleRetry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  handleReturn = () => {
    const target = this.props.returnPath || '/recalibrate';
    // Use a hard navigation so any leaked listeners/timers from the crashed
    // tree are guaranteed to be discarded.
    window.location.assign(target);
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-[15px] text-foreground">
                This practice ran into an issue
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                You can try again or return to Reset and pick another practice.
              </p>
              <div className="space-y-2">
                <Button onClick={this.handleRetry} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try again
                </Button>
                <Button onClick={this.handleReturn} variant="outline" className="w-full">
                  <Home className="w-4 h-4 mr-2" />
                  Return to Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Re-mount children on retry by keying the wrapper.
    return <div key={this.state.resetKey} className="contents">{this.props.children}</div>;
  }
}

export default PlayerErrorBoundary;