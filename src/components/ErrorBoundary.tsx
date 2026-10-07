import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError } from './chunkError';
import { SHELL_COPY } from './shellCopy';

interface State {
  hasError: boolean;
  /** A lazy page's code could not be downloaded (offline or a new deploy): a reload fixes it. */
  chunk: boolean;
}

// Top-level safety net: a render error shows a Hinglish message instead of a blank screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, chunk: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, chunk: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.state.chunk) {
      return (
        <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
          <p className="text-lg font-semibold text-destructive">{SHELL_COPY.chunkError.title}</p>
          <p className="text-sm text-muted-foreground">{SHELL_COPY.chunkError.body}</p>
          <Button className="h-11" onClick={() => window.location.reload()}>
            {SHELL_COPY.chunkError.retry}
          </Button>
        </div>
      );
    }
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
        <p className="text-lg font-semibold">Kuch gadbad ho gayi.</p>
        <p className="text-sm text-muted-foreground">Page reload karke dobara try karo.</p>
        <Button onClick={() => window.location.reload()}>Reload karo</Button>
      </div>
    );
  }
}
