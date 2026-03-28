import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import {
  Search,
  Plus,
  Home,
  Folder as FolderIcon,
  Star as StarIcon,
  Clock,
  Trash2,
  Settings,
  Bell,
  CheckCircle,
  FilePlus,
  FolderPlus,
  UploadCloud,
  AlertCircle,
  Loader,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadFile, uploadFolderBulk, getStorageCapacity } from '../services/file.service';

/**
 * Circular Upload Progress Overlay
 */
const UploadStatusBadge = ({ progress, fileName, status, error, onHide }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="upload-status-overlay">
      <div className="circular-progress">
        {status === 'loading' && (
          <svg width="44" height="44">
            <circle className="bg" cx="22" cy="22" r={radius} />
            <circle
              className="fg"
              cx="22" cy="22" r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
        )}
        {status === 'success' && <div className="brand-icon" style={{ borderRadius: '50%', background: 'var(--success)' }}><CheckCircle size={20} color="white" /></div>}
        {status === 'error' && <div className="brand-icon" style={{ borderRadius: '50%', background: 'var(--error)' }}><AlertCircle size={20} color="white" /></div>}
        {status === 'loading' && <span style={{ position: 'absolute', fontSize: '10px', fontWeight: 800 }}>{progress}%</span>}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </p>
        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          {status === 'loading' ? 'Encrypting chunk...' : status === 'success' ? 'Vaulted successfully' : error || 'Upload failed'}
        </p>
      </div>
      {status !== 'loading' && (
         <button onClick={onHide} className="btn btn--ghost" style={{ padding: '4px' }}><Plus size={16} style={{ transform: 'rotate(45deg)' }} /></button>
      )}
    </div>
  );
};

const StorageWidget = ({ usedBytes, allowedBytes, percentage }) => {
  const usedMB = usedBytes / (1024 * 1024);
  const totalGB = allowedBytes / (1024 * 1024 * 1024);
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ padding: '24px 0', textAlign: 'center' }}>
      <div className="round-progress" style={{ margin: '0 auto 16px', position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r={radius} stroke="#f1f5f9" strokeWidth="6" fill="none" />
          <circle
            cx="40" cy="40" r={radius}
            stroke="var(--brand-primary)"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 800 }}>
          {Math.round(percentage)}%
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>Vault Storage</p>
      <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
        {usedMB < 1024 ? `${usedMB.toFixed(1)} MB` : `${(usedMB/1024).toFixed(2)} GB`} of {totalGB.toFixed(0)} GB
      </p>
    </div>
  );
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const newMenuRef = useRef(null);

  // Storage State
  const [storageData, setStorageData] = useState({ usedBytes: 0, allowedBytes: 10 * 1024 * 1024 * 1024, percentage: 0 });

  const fetchStorage = useCallback(async () => {
    try {
      const res = await getStorageCapacity();
      const s = res?.storage || {};
      setStorageData({
        usedBytes: s.usedBytes || 0,
        allowedBytes: s.allowedBytes || 10 * 1024 * 1024 * 1024,
        percentage: s.usagePercentage || 0
      });
    } catch {}
  }, []);

  // Global Upload State
  const [uploadState, setUploadState] = useState({
    active: false, progress: 0, fileName: '', status: 'idle', error: ''
  });

  useEffect(() => {
    fetchStorage();
    const handleRefresh = () => fetchStorage();
    window.addEventListener('vault-refresh', handleRefresh);
    
    const handleClickOutside = (e) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target)) {
        setNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
       window.removeEventListener('vault-refresh', handleRefresh);
       document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [fetchStorage]);

  const handleFileSelect = async (e, isFolder = false) => {
    const pickedFiles = e.target.files;
    if (!pickedFiles || pickedFiles.length === 0) return;

    if (isFolder) {
      const rootPath = pickedFiles[0].webkitRelativePath;
      const folderName = rootPath.split('/')[0] || "Vault Folder";
      
      setUploadState({ active: true, progress: 0, fileName: `${folderName} (${pickedFiles.length} files)`, status: 'loading', error: '' });

      try {
        await uploadFolderBulk(pickedFiles, folderName, (percent) => {
          setUploadState(prev => ({ ...prev, progress: percent }));
        });
        setUploadState(prev => ({ ...prev, status: 'success', progress: 100 }));
        window.dispatchEvent(new CustomEvent('vault-refresh'));
        setTimeout(() => setUploadState(prev => prev.status === 'success' ? { ...prev, active: false } : prev), 3000);
      } catch (err) {
        setUploadState(prev => ({ ...prev, status: 'error', error: err.message || 'Vault rejected folder' }));
      }
    } else {
      const file = pickedFiles[0];
      setUploadState({ active: true, progress: 0, fileName: file.name, status: 'loading', error: '' });

      try {
        await uploadFile(file, (percent) => {
          setUploadState(prev => ({ ...prev, progress: percent }));
        });
        setUploadState(prev => ({ ...prev, status: 'success', progress: 100 }));
        window.dispatchEvent(new CustomEvent('vault-refresh'));
        setTimeout(() => setUploadState(prev => prev.status === 'success' ? { ...prev, active: false } : prev), 3000);
      } catch (err) {
        setUploadState(prev => ({ ...prev, status: 'error', error: err.message || 'Vault rejected chunk' }));
      }
    }

    setNewMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Cabinet' },
    { to: '/dashboard/starred', icon: StarIcon, label: 'Starred' },
    { to: '/dashboard/recent', icon: Clock, label: 'Recent' },
    { to: '/dashboard/folders', icon: FolderIcon, label: 'Folders' },
    { to: '/dashboard/trash', icon: Trash2, label: 'Trash' },
  ];

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link to="/dashboard" className="brand" style={{ marginBottom: '16px' }}>
          <div className="brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="3" fill="white" />
              <rect x="13" y="13" width="9" height="9" rx="4" fill="white" opacity="0.4" />
            </svg>
          </div>
          <span className="brand-name">Chunkly</span>
        </Link>

        <div className="sidebar-new-wrapper" ref={newMenuRef}>
           <button 
             className="btn btn--primary" 
             style={{ width: '100%', height: '56px' }} 
             onClick={() => setNewMenuOpen(!newMenuOpen)}
           >
             <Plus size={20} />
             Create New
           </button>

           {newMenuOpen && (
             <div className="sidebar-new-menu" style={{ width: '220px' }}>
                <div className="sidebar-new-item" onClick={() => {
                   const folderBtn = document.getElementById('create-folder-btn');
                   if (folderBtn) folderBtn.click();
                   setNewMenuOpen(false);
                }}>
                  <FolderPlus size={18} />
                  <span>New folder</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
                <div className="sidebar-new-item" onClick={() => fileInputRef.current.click()}>
                  <FilePlus size={18} />
                  <span>File upload</span>
                </div>
                <div className="sidebar-new-item" onClick={() => folderInputRef.current.click()}>
                  <UploadCloud size={18} />
                  <span>Folder upload</span>
                </div>
             </div>
           )}
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-medium)' }}>
          <StorageWidget usedBytes={storageData.usedBytes} allowedBytes={storageData.allowedBytes} percentage={storageData.percentage} />
        </div>
      </aside>

      <div className="main-area">
        <header className="header">
          <div className="search-bar">
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Explore your cabinet..." />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn--ghost btn--icon"><Bell size={20} /></button>
            <button className="btn btn--ghost btn--icon"><Settings size={20} /></button>
            <div style={{ position: 'relative', marginLeft: '12px' }}>
              <button className="btn btn--ghost" style={{ padding: '0', borderRadius: '50%' }} onClick={() => setUserMenuOpen(!userMenuOpen)}>
                {user?.avatar ? (
                    <img src={user.avatar} alt="Profile" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--brand-gradient)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                )}
              </button>
              {userMenuOpen && (
                <div className="user-menu" style={{ position: 'absolute', top: '52px', right: 0, background: 'white', width: '220px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-premium)', border: '1px solid var(--border-medium)', padding: '8px', zIndex: 1001 }} onMouseLeave={() => setUserMenuOpen(false)}>
                  <div style={{ padding: '12px 16px' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>{user?.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</p>
                  </div>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
                  <button className="btn btn--ghost btn--full" style={{ justifyContent: 'flex-start', color: 'var(--error)' }} onClick={() => { logout(); navigate('/login'); }}>Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="scroll-content">
          <Outlet />
        </section>
      </div>

      {uploadState.active && (
        <UploadStatusBadge {...uploadState} onHide={() => setUploadState(prev => ({ ...prev, active: false }))} />
      )}

      <button className="btn btn--primary btn--fab" onClick={() => fileInputRef.current.click()}><Plus size={36} /></button>
      <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e, false)} style={{ display: 'none' }} />
      <input type="file" ref={folderInputRef} onChange={(e) => handleFileSelect(e, true)} webkitdirectory="" style={{ display: 'none' }} />
    </div>
  );
}
