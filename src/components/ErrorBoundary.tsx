import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface State {
  hasError: boolean;
}

// Top-level safety net: a render error shows a Hinglish message instead of a blank screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
        <p className="text-lg font-semibold">Kuch gadbad ho gayi.</p>
        <p className="text-sm text-muted-foreground">Page reload karke dobara try karo.</p>
        <Button onClick={() => window.location.reload()}>Reload karo</Button>
      </div>
    );
  }
}
