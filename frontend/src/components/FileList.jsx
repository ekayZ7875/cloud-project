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
      <div className="google-icon-wrapper google-icon-wrapper--folder">
         <Folder size={16} fill="white" color="white" />
      </div>
    );
  }

  if (['pdf'].includes(ext)) {
    return (
      <div className="google-icon-wrapper google-icon-wrapper--pdf">
         <span style={{ color: 'white', fontSize: '7px', fontWeight: 900, lineHeight: 1 }}>PDF</span>
      </div>
    );
  }

  if (['drawio', 'xml'].includes(ext)) {
    return (
      <div className="google-icon-wrapper" style={{ background: '#f4b400' }}>
         <Triangle size={14} fill="white" color="white" />
      </div>
    );
  }

  return (
    <div className="google-icon-wrapper" style={{ background: '#4285f4' }}>
       <FileText size={14} color="white" />
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
       setTimeout(() => { setCopySuccess(null); setOpenMenu(null); }, 1500);
    });
  };

  if (loading && files.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '300px' }}>
         <div className="premium-spinner"></div>
      </div>
    );
  }

  const renderContent = () => {
    if (isGridView) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {files.map((file, idx) => {
            const id = file.fileId || file._id || file.id || file.folderId || `idx-${idx}`;
            const name = file.fileName || file.name;
            const type = file.type || (file.folderId ? 'folder' : 'file');
            const updatedAt = file.updatedAt || file.createdAt || new Date().toISOString();
            const fileExt = name?.split('.').pop().toLowerCase();

            return (
              <div key={id} className="preview-grid-card" onClick={() => type !== 'folder' && onView?.(file)}>
                <div className="preview-grid-card__header">
                  <GoogleStyleIcon type={type} name={name} />
                  <span className="file-name text-truncate" style={{ flex: 1, minWidth: 0 }}>{name}</span>
                  <button 
                    className="btn btn--ghost btn--icon" 
                    style={{ width: '32px', height: '32px' }}
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === id ? null : id); }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  
                  {openMenu === id && (
                    <div className="sidebar-new-menu" style={{ top: '40px', right: '8px', left: 'auto', width: '200px', zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
                       {!isTrashView ? (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onView?.(file); setOpenMenu(null); }}><ExternalLink size={14} /> Open</button>
                          <button className="sidebar-new-item" onClick={() => { onStar?.(id, type); setOpenMenu(null); }}>
                             <Star size={14} fill={file.isStarred ? "var(--warning)" : "none"} color={file.isStarred ? "var(--warning)" : "currentColor"} /> 
                             {file.isStarred ? 'Remove from Starred' : 'Add to Starred'}
                          </button>
                          <button className="sidebar-new-item" onClick={() => handleCopyLink(id, file)}>{copySuccess === id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />} {copySuccess === id ? 'Copied' : 'Copy link'}</button>
                          <button className="sidebar-new-item" onClick={() => { onDownload?.(id); setOpenMenu(null); }}><Download size={14} /> Download</button>
                          <hr style={{ border: 'none', borderTop: '1px solid #e8eaed', margin: '4px 0' }} />
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={14} /> Move to Trash</button>
                        </>
                      ) : (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onRestore?.(id, type); setOpenMenu(null); }}><RefreshCw size={14} /> Restore</button>
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onPermanentDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={14} /> Delete Forever</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="preview-grid-card__thumbnail" style={{ position: 'relative', overflow: 'hidden', background: '#f8f9fa' }}>
                   {type === 'folder' ? (
                      <Folder size={64} color="#bdc1c6" fill="#f1f3f4" />
                   ) : (
                      <div className="preview-thumbnail-img" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         {['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(fileExt) ? (
                            <img src={file.s3Url || file.fileUrl || file.downloadUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" />
                         ) : fileExt === 'pdf' ? (
                            <iframe 
                              src={(file.s3Url || file.downloadUrl || '') + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH'} 
                              style={{ width: '100%', height: '220%', border: 'none', transform: 'scale(0.8) translateY(-10%)', pointerEvents: 'none' }}
                              title="pdf-preview"
                            />
                         ) : (
                            <div style={{ width: '100%', height: '100%', padding: '12px', background: 'white' }}>
                               <div style={{ height: '4px', background: '#f1f3f4', width: '60%', marginBottom: '8px' }}></div>
                               <div style={{ height: '4px', background: '#f1f3f4', width: '80%', marginBottom: '8px' }}></div>
                               <div style={{ height: '4px', background: '#f1f3f4', width: '40%', marginBottom: '16px' }}></div>
                               <div style={{ display: 'flex', gap: '4px' }}>
                                  <div style={{ flex: 1, height: '40px', background: '#f8f9fa' }}></div>
                                  <div style={{ flex: 1, height: '40px', background: '#f8f9fa' }}></div>
                               </div>
                            </div>
                         )}
                      </div>
                   )}
                </div>
                
                <div className="preview-grid-card__info">
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img 
                        src={user?.avatar || 'https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'} 
                        style={{ width: '20px', height: '20px', borderRadius: '50%' }} alt="me" 
                      />
                      <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>
                         {updatedAt ? `You opened • ${new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Mar 28'}
                      </span>
                   </div>
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
            const updatedAt = file.updatedAt || file.createdAt || new Date().toISOString();

            return (
              <tr key={id} className="file-row" onClick={() => type !== 'folder' && onView?.(file)}>
                <td style={{ width: '35%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <GoogleStyleIcon type={type} name={name} />
                    <span className="file-name text-truncate">{name}</span>
                  </div>
                </td>
                <td style={{ color: '#5f6368', fontSize: '0.8125rem' }}>
                   {updatedAt ? `You opened • ${new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '4:19 PM'}
                </td>
                <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1a73e8', fontSize: '0.8125rem' }}>
                      <img 
                        src={user?.avatar || 'https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'} 
                        style={{ width: '24px', height: '24px', borderRadius: '50%' }} 
                        alt="me"
                      />
                      <span>me</span>
                   </div>
                </td>
                <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#5f6368', fontSize: '0.8125rem' }}>
                      {file.folderId ? <Folder size={16} color="#5f6368" /> : <div style={{ width: '16px', height: '16px', background: '#5f6368', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Triangle size={10} color="white" fill="white" style={{ transform: 'rotate(180deg)' }} /></div>}
                      <span className="text-truncate" style={{ maxWidth: '100px' }}>{file.folderName || 'My Drive'}</span>
                   </div>
                </td>
                <td style={{ textAlign: 'right', position: 'relative' }}>
                  <button className="btn btn--ghost btn--icon" onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === id ? null : id); }}>
                    <MoreVertical size={18} color="#5f6368" />
                  </button>
                  {openMenu === id && (
                    <div className="sidebar-new-menu" style={{ top: '42px', right: '0', left: 'auto', width: '180px', zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
                      {!isTrashView ? (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onView?.(file); setOpenMenu(null); }}><ExternalLink size={16} /> Open</button>
                          <button className="sidebar-new-item" onClick={() => { onStar?.(id, type); setOpenMenu(null); }}>
                             <Star size={16} fill={file.isStarred ? "var(--warning)" : "none"} color={file.isStarred ? "var(--warning)" : "currentColor"} /> 
                             {file.isStarred ? 'Remove from Starred' : 'Add to Starred'}
                          </button>
                          <button className="sidebar-new-item" onClick={() => handleCopyLink(id, file)}><Copy size={16} /> Copy link</button>
                          <button className="sidebar-new-item" onClick={() => { onDownload?.(id); setOpenMenu(null); }}><Download size={16} /> Download</button>
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={16} /> Delete</button>
                        </>
                      ) : (
                        <>
                          <button className="sidebar-new-item" onClick={() => { onRestore?.(id, type); setOpenMenu(null); }}><RefreshCw size={16} /> Restore</button>
                          <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={() => { onPermanentDelete?.(id, type); setOpenMenu(null); }}><Trash2 size={16} /> Delete Forever</button>
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
