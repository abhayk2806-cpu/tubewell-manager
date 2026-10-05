import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type SignInErrorCode = 'invalid_credentials' | 'unknown';

export interface SignInResult {
  ok: boolean;
  errorCode?: SignInErrorCode;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read on startup. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
