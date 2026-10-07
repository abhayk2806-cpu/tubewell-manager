import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigErrorScreen } from './ConfigErrorScreen';
import type { ConfigProblem } from './configProblem';

/** Renders the config-error screen; names only, so nothing secret or private reaches the page. */
export function showConfigError(rootElement: HTMLElement, problem: ConfigProblem): void {
  createRoot(rootElement).render(
    <StrictMode>
      <ConfigErrorScreen problem={problem} />
    </StrictMode>,
  );
}
