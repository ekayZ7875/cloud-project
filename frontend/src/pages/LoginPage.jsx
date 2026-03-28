import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { AlertCircle, Loader } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const { signInWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gsiReady, setGsiReady] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleCredentialResponse = async (response) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle(response);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Vault access denied');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initGsi = () => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320,
        });
      }
      setGsiReady(true);
      return true;
    };
    if (initGsi()) return;
    const interval = setInterval(() => { if (initGsi()) clearInterval(interval); }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="chunkly-auth">
      <div className="auth-box">
        <header style={{ marginBottom: '48px' }}>
          <div className="brand-icon" style={{ width: '64px', height: '64px', margin: '0 auto 24px', borderRadius: '16px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="3" fill="white" />
              <rect x="13" y="13" width="9" height="9" rx="4" fill="white" opacity="0.4" />
            </svg>
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.05em' }}>
            Chunkly
          </h1>
          <p style={{ color: 'var(--text-sub)', fontSize: '1.125rem' }}>Secure your digital universe.</p>
        </header>

        {error && (
          <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#f43f5e', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '0.875rem' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '32px 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Loader size={32} className="spin" color="var(--brand-primary)" />
            <p style={{ fontWeight: 600 }}>Syncing vault credentials...</p>
          </div>
        ) : (
          <div className="google-btn-wrapper" style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <div ref={googleBtnRef} />
            {!gsiReady && <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Preparing identity link...</p>}
          </div>
        )}

        <footer style={{ marginTop: '48px', borderTop: '1px solid var(--border-light)', paddingTop: '32px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            Powered by Chunkly OS &copy; 2026. <br/> Encryption active by default.
          </p>
        </footer>
      </div>
    </div>
  );
}
