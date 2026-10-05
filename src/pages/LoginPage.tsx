import { useState, type FormEvent } from 'react';
import { Droplets } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import type { SignInErrorCode } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ERROR_TEXT: Record<SignInErrorCode | 'empty', string> = {
  empty: 'Email aur password dono bharo.',
  invalid_credentials: 'Email ya password galat hai.',
  unknown: 'Login nahi ho paya. Internet check karke dobara try karo.',
};

// Single-user login. No sign-up link and no forgot-password flow by design.
export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError(ERROR_TEXT.empty);
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await signIn(email.trim(), password);
    if (!result.ok) {
      setError(ERROR_TEXT[result.errorCode ?? 'unknown']);
      setSubmitting(false);
    }
    // On success the auth listener updates the session and PublicRoute redirects to "/".
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Droplets size={28} aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold">Tubewell Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pani aur Paisa ka poora hisaab</p>
        </div>

        <Card className="shadow-card">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 text-base md:text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 text-base md:text-base"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                {submitting ? 'Login ho raha hai...' : 'Login karo'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
