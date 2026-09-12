import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { saveToken, getToken, clearToken } from '../api/tokenStorage';
import { setUnauthorizedHandler } from '../api/client';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

/**
 * Auth state: 'booting' (checking for a stored token) -> 'authenticated' |
 * 'unauthenticated'. Mirrors the web app's authSlice bootstrap pattern
 * (client/src/features/auth/authSlice.js) so the two clients behave the same
 * way conceptually, even though the storage/transport mechanism differs
 * (Bearer token in SecureStore here vs. an HTTP-only cookie on the web).
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('booting');
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('unauthenticated');
    });
  }, []);

  useEffect(() => {
    (async () => {
      // Everything here — including reading the token itself — must be
      // inside this try/catch. A storage failure that escapes it leaves
      // `status` stuck at 'booting' forever (an infinite spinner, no error,
      // no way forward) rather than falling back to the login screen.
      try {
        const token = await getToken();
        if (!token) {
          setStatus('unauthenticated');
          return;
        }
        const { user: me } = await authApi.getCurrentUser();
        setUser(me);
        setStatus('authenticated');
      } catch {
        await clearToken().catch(() => {});
        setStatus('unauthenticated');
      }
    })();
  }, []);

  const signIn = useCallback(async ({ companySlug, identifier, password }) => {
    setError(null);
    try {
      const res = await authApi.login({ companySlug, identifier, password });
      if (!res.token) {
        // Should never happen given X-Client: mobile is always sent, but
        // fail loudly rather than silently pretending the user is signed in.
        throw new Error('Login succeeded but no token was returned');
      }
      await saveToken(res.token);
      setUser(res.user);
      setStatus('authenticated');
      return res.user;
    } catch (err) {
      const message = err.uiMessage || err.message || 'Login failed';
      setError(message);
      throw err;
    }
  }, []);

  const value = useMemo(() => ({ status, user, error, signIn, signOut }), [status, user, error, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
