import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signupWithGoogle } from '../services/auth.service';

const AuthContext = createContext(null);

/**
 * Decode a Google Identity Services JWT credential to extract profile info.
 * The credential is a standard JWT — we only need the payload (claims).
 */
function decodeGoogleCredential(credential) {
  try {
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token && parsed.user) {
          setToken(parsed.token);
          setUser(parsed.user);
        }
      }
    } catch {
      localStorage.removeItem('auth');
    }
    setLoading(false);
  }, []);

  const persistAuth = useCallback((authData) => {
    // Backend wraps response in { response: { token, user, ... } }
    const payload = authData.response || authData;
    const authToken = payload.token;
    const userData = payload.user || {
      email: payload.email,
      name: payload.name || payload.fullname,
      avatar: payload.avatar,
    };
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('auth', JSON.stringify({ user: userData, token: authToken }));
  }, []);

  /**
   * Handle Google Sign-In credential.
   * Decodes the JWT to extract sub (uid), email, name, picture,
   * then calls the backend signup endpoint (which also handles existing users).
   */
  const signInWithGoogle = useCallback(
    async (credentialResponse) => {
      const decoded = decodeGoogleCredential(credentialResponse.credential);
      if (!decoded) throw new Error('Failed to decode Google credential');

      const result = await signupWithGoogle({
        uid: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        avatar: decoded.picture || '',
      });

      persistAuth(result);
      return result;
    },
    [persistAuth]
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth');
  }, []);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    signInWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
