import './index.css';
import { configProblem } from './configProblem';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in index.html.');

// The Supabase client validates its config while its module loads (src/lib/supabase.ts) and throws
// before React can show anything. So the config is checked here first and the app module is loaded
// only when it is fine; otherwise a Hinglish screen names the variables, never their values.
const problem = configProblem(import.meta.env);
if (problem === null) {
  void import('./startApp').then(({ startApp }) => startApp(rootElement));
} else {
  void import('./showConfigError').then(({ showConfigError }) => showConfigError(rootElement, problem));
}
