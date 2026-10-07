import { Button } from '@/components/ui/button';
import { CONFIG_ERROR_COPY } from './configErrorCopy';
import type { ConfigProblem } from './configProblem';

function NameList({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm">{label}</p>
      <ul className="space-y-1">
        {names.map((name) => (
          <li key={name} className="break-all font-mono text-sm font-semibold text-destructive">
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full-screen message when the Supabase settings are missing or wrong: names only, never values. */
export function ConfigErrorScreen({ problem }: { problem: ConfigProblem }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <p className="text-lg font-semibold text-destructive">{CONFIG_ERROR_COPY.title}</p>
      <p className="text-sm text-muted-foreground">{CONFIG_ERROR_COPY.body}</p>
      <NameList label={CONFIG_ERROR_COPY.missing} names={problem.missing} />
      <NameList label={CONFIG_ERROR_COPY.invalid} names={problem.invalid} />
      <p className="text-sm">{CONFIG_ERROR_COPY.hint}</p>
      <Button className="h-11" onClick={() => window.location.reload()}>
        {CONFIG_ERROR_COPY.retry}
      </Button>
    </div>
  );
}
