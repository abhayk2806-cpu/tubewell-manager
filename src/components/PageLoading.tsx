import { SHELL_COPY } from './shellCopy';

/** The one Suspense fallback for every lazy page: a quiet line inside the layout (no jump at 360 px). */
export function PageLoading() {
  return (
    <p role="status" className="py-6 text-sm text-muted-foreground" data-testid="page-loading">
      {SHELL_COPY.pageLoading}
    </p>
  );
}
