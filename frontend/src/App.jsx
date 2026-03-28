import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './store/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FoldersPage from './pages/FoldersPage';

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      {showSplash && (
        <div className="splash-loader">
           <div className="splash-content">
              <div className="splash-logo">
                 <Zap size={48} fill="white" color="white" />
              </div>
              <h1 className="splash-title">Chunkly</h1>
           </div>
        </div>
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage view="all" />} />
            <Route path="starred" element={<DashboardPage view="starred" />} />
            <Route path="recent" element={<DashboardPage view="recent" />} />
            <Route path="trash" element={<DashboardPage view="trash" />} />
            <Route path="folders" element={<FoldersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
