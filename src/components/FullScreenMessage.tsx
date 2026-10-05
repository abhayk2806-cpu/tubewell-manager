import type { ReactNode } from 'react';

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center bg-background p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
