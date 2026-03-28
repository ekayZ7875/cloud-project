import { useState, useEffect, useRef } from 'react';
import { 
  File, 
  MoreVertical, 
  Star, 
  Trash2, 
  Download, 
  ExternalLink, 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  FileCode, 
  Archive, 
  Table, 
  Shield, 
  Copy, 
  Check,
  RefreshCw,
  GitBranch,
  Triangle
} from 'lucide-react';
import { useAuth } from '../store/AuthContext';

const GoogleStyleIcon = ({ type, name }) => {
  const ext = name?.split('.').pop().toLowerCase();
  
  if (type === 'folder') {
    return (
      <div style={{ width: '32px', height: '32px', background: '#5f6368', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <Folder size={18} fill="white" color="white" />
      </div>
    );
  }

  if (['pdf'].includes(ext)) {
    return (
      <div style={{ width: '32px', height: '32px', background: '#ea4335', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
         <span style={{ color: 'white', fontSize: '8px', fontWeight: 900, lineHeight: 1 }}>PDF</span>
      </div>
    );
  }

  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return (
      <div style={{ width: '32px', height: '32px', background: '#0f9d58', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <Table size={18} color="white" />
      </div>
    );
  }

  if (['doc', 'docx', 'txt'].includes(ext)) {
    return (
      <div style={{ width: '32px', height: '32px', background: '#4285f4', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <FileText size={18} color="white" />
      </div>
    );
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
    return (
      <div style={{ width: '32px', height: '32px', background: '#db4437', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <ImageIcon size={18} color="white" />
      </div>
    );
  }

  if (['drawio', 'xml', 'draw'].includes(ext)) {
    return (
      <div style={{ width: '32px', height: '32px', background: '#f4b400', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <GitBranch size={18} color="white" />
      </div>
    );
  }

  if (['zip', 'rar', '7z'].includes(ext)) {
    return (
      <div style={{ width: '32px', height: '32px', background: '#5f6368', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <Archive size={18} color="white" />
      </div>
    );
  }

  return (
    <div style={{ width: '32px', height: '32px', background: '#94a3b8', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
       <File size={18} color="white" />
    </div>
  );
};

export default function FileList({ 
  files = [], 
  loading = false, 
  onStar, 
  onDelete, 
  onDownload, 
  onView, 
  onRestore, 
  onPermanentDelete,
  isGridView = true,
  isTrashView = false
}) {
  const { user } = useAuth();
  const [openMenu, setOpenMenu] = useState(null);
  const [copySuccess, setCopySuccess] = useState(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenu && !e.target.closest('.sidebar-new-menu') && !e.target.closest('.btn--icon')) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const handleCopyLink = (itemId, file) => {
    const url = file.s3Url || file.fileUrl || file.url || file.downloadUrl || `${window.location.origin}/view/${itemId}`;
    navigator.clipboard.writeText(url).then(() => {
       setCopySuccess(itemId);
       setTimeout(() => {
          setCopySuccess(null);
          setOpenMenu(null); // Close menu after feedback
       }, 1500);
    });
  };

  if (loading) {
    return (
      <div className="file-list-loading" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ height: '140px', background: '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }}></div>
          ))}
      </div>
    );
  }

  const renderContent = () => {
    if (isGridView) {
      return (
        <div className="file-grid">
          {files.map((file, idx) => {
            const id = file.fileId || file._id || file.id || file.folderId || `idx-${idx}`;
            const name = file.fileName || file.name;
            const type = file.type || (file.folderId ? 'folder' : 'file');

            return (
              <div key={id} className="file-card" onClick={() => type !== 'folder' && onView?.(file)}>
                <div className="file-card__header">
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <GoogleStyleIcon type={type} name={name} />
                  </div>
                  <button 
                    className="btn btn--ghost btn--icon" 
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === id ? null : id); }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  
                  {openMenu === id && (
                    <div 
                      className="sidebar-new-menu" 
                      style={{ top: '44px', right: '0', left: 'auto', width: '200px', zIndex: 1000 }} 
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!isTrashView ? (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onView?.(file); setOpenMenu(null); }}><ExternalLink size={14} /> Open</button>
                          {onStar && (
                            <button className="sidebar-new-item" onClick={() => { onStar(id, !file.isStarred); setOpenMenu(null); }}>
                              <Star size={14} fill={file.isStarred ? 'var(--warning)' : 'none'} color={file.isStarred ? 'var(--warning)' : 'currentColor'} /> 
                              {file.isStarred ? 'Unstar' : 'Star'}
                            </button>
                          )}
                          <button 
                             className="sidebar-new-item" 
                             style={{ 
                                color: copySuccess === id ? 'var(--success)' : 'inherit',
                                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: copySuccess === id ? 'scale(1.02)' : 'scale(1)'
                             }} 
                             onClick={() => handleCopyLink(id, file)}
                          >
                             {copySuccess === id ? <Check size={14} className="bounce-in" /> : <Copy size={14} />} 
                             {copySuccess === id ? 'Link Copied!' : 'Copy link'}
                          </button>
                          <button className="sidebar-new-item" onClick={() => { onDownload?.(id); setOpenMenu(null); }}><Download size={14} /> Download</button>
                          <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={14} /> Move to Trash</button>
                        </>
                      ) : (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onRestore?.(id, type); setOpenMenu(null); }}><RefreshCw size={14} /> Restore Item</button>
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onPermanentDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={14} /> Delete Forever</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="file-card__body">
                  <p className="file-name text-truncate" title={name}>{name}</p>
                </div>
                
                <div className="file-card__footer" style={{ marginTop: 'auto' }}>
                   <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{file.createdAt ? new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Mar 28'}</p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <table className="file-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Details</th>
            <th>Owner</th>
            <th>Location</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, idx) => {
            const id = file.fileId || file._id || file.id || file.folderId || `idx-${idx}`;
            const name = file.fileName || file.name;
            const type = file.type || (file.folderId ? 'folder' : 'file');
            const updatedAt = file.updatedAt || file.createdAt;

            return (
              <tr key={id} className="file-row" onClick={() => type !== 'folder' && onView?.(file)}>
                <td style={{ width: '40%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <GoogleStyleIcon type={type} name={name} />
                    <span className="text-truncate" style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.875rem' }}>{name}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text-sub)', fontSize: '0.8125rem' }}>
                   {updatedAt ? `You opened • ${new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Mar 28'}
                </td>
                <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-sub)', fontSize: '0.8125rem' }}>
                      <img 
                        src={user?.avatar || 'https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'} 
                        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-light)' }} 
                        alt="me"
                      />
                      <span>me</span>
                   </div>
                </td>
                <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-sub)', fontSize: '0.8125rem' }}>
                      {file.folderId ? <Folder size={16} color="var(--text-muted)" /> : <Triangle size={16} color="var(--text-muted)" style={{ transform: 'rotate(180deg)' }} />}
                      <span>{file.folderName || 'My Drive'}</span>
                   </div>
                </td>
                <td style={{ textAlign: 'right', position: 'relative' }}>
                  <button className="btn btn--ghost btn--icon" onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === id ? null : id); }}>
                    <MoreVertical size={16} />
                  </button>
                  {openMenu === id && (
                    <div className="sidebar-new-menu" style={{ top: '40px', right: '0', left: 'auto', width: '200px', zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
                      {!isTrashView ? (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onView?.(file); setOpenMenu(null); }}><ExternalLink size={14} /> Open</button>
                          <button 
                             className="sidebar-new-item" 
                             style={{ 
                                color: copySuccess === id ? 'var(--success)' : 'inherit',
                                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: copySuccess === id ? 'scale(1.02)' : 'scale(1)'
                             }} 
                             onClick={() => handleCopyLink(id, file)}
                          >
                             {copySuccess === id ? <Check size={14} className="bounce-in" /> : <Copy size={14} />} 
                             {copySuccess === id ? 'Link Copied!' : 'Copy link'}
                          </button>
                          <button className="sidebar-new-item" onClick={() => { onDownload?.(id); setOpenMenu(null); }}><Download size={14} /> Download</button>
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={14} /> Delete</button>
                        </>
                      ) : (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onRestore?.(id, type); setOpenMenu(null); }}><RefreshCw size={14} /> Restore</button>
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onPermanentDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={14} /> Delete Forever</button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return <div className="file-list-container">{renderContent()}</div>;
}
