import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getFiles,
  getStarredFiles,
  getRecentFiles,
  getTrashedFiles,
  getFolders,
  getFilesInFolder,
  createFolder,
  toggleStar,
  softDeleteFile,
  softDeleteFolder,
  restoreItem,
  permanentDelete,
  getDownloadUrl,
} from '../services/file.service';
import FileList from '../components/FileList';
import FileDetailModal from '../components/FileDetailModal';
import MoveFileModal from '../components/MoveFileModal';
import CreateFolderModal from '../components/CreateFolderModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { RefreshCw, Folder, ChevronRight, LayoutGrid, List, Plus, FolderPlus, ArrowLeft, Trash2, MoreVertical, ExternalLink } from 'lucide-react';
import { useAuth } from '../store/AuthContext';

export default function DashboardPage({ view = 'all' }) {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [moveFileId, setMoveFileId] = useState(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [isGridView, setIsGridView] = useState(true);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [openFolderMenu, setOpenFolderMenu] = useState(null);
  const folderMenuRef = useRef(null);
  
  const [trashInfo, setTrashInfo] = useState({ 
    isOpen: false, 
    id: null, 
    type: null, 
    name: '', 
    isPermanent: false,
    fileName: '' 
  });

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setFiles([]);
    }
    setError(null);
    try {
      let fResult;
      if (currentFolder) {
         fResult = await getFilesInFolder(currentFolder.folderId);
      } else {
         switch (view) {
           case 'starred': fResult = await getStarredFiles(); break;
           case 'recent': fResult = await getRecentFiles(); break;
           case 'trash': fResult = await getTrashedFiles(); break;
           case 'folders': 
              const res = await getFolders();
              fResult = (res?.folders || []).map(f => ({ ...f, type: 'folder' }));
              break;
           default: fResult = await getFiles();
         }
      }
      
      if (view === 'all' && !currentFolder) {
         const foldersRes = await getFolders();
         setFolders(foldersRes?.folders || []);
      }

      const fileArr = Array.isArray(fResult) ? fResult : (fResult?.files || fResult?.data || fResult?.response?.data || []);
      setFiles(fileArr);
    } catch (err) {
      setError(err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [view, currentFolder]);

  useEffect(() => {
    fetchAll();
    const handleRefresh = () => fetchAll(false);
    window.addEventListener('vault-refresh', handleRefresh);

    const handleClickOutside = (e) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setOpenFolderMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('vault-refresh', handleRefresh);
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [fetchAll]);

  const handleCreateFolder = async (name) => {
    try {
      await createFolder(name);
      fetchAll(false);
      window.dispatchEvent(new CustomEvent('vault-refresh'));
    } catch (err) {
      alert('Vault rejected folder creation');
    }
  };

  const handleStar = async (fileId, isStarred) => {
    setFiles((prev) => prev.map((f) => (f.fileId || f._id || f.id) === fileId ? { ...f, isStarred } : f));
    try { 
      await toggleStar(fileId, isStarred);
      window.dispatchEvent(new CustomEvent('vault-refresh'));
    } catch {
      setFiles((prev) => prev.map((f) => (f.fileId || f._id || f.id) === fileId ? { ...f, isStarred: !isStarred } : f));
    }
  };

  const handleOpenTrashModal = (itemId, type) => {
    let name = '';
    if (type === 'folder') {
       name = (folders.find(f => f.folderId === itemId) || files.find(f => f.folderId === itemId))?.name || 'Folder';
    } else {
       name = files.find(f => (f.fileId || f._id || f.id) === itemId)?.fileName || 'File';
    }
    setTrashInfo({ isOpen: true, id: itemId, type, name, isPermanent: false });
  };

  const handleOpenPermanentModal = (itemId, type, fileName = '') => {
    let name = '';
    if (type === 'folder') {
       name = files.find(f => f.folderId === itemId)?.name || 'Folder';
    } else {
       name = files.find(f => (f.fileId || f._id || f.id) === itemId)?.fileName || fileName || 'File';
    }
    setTrashInfo({ isOpen: true, id: itemId, type, name, isPermanent: true, fileName });
  };

  const confirmDelete = async () => {
    const { id, type, isPermanent, fileName } = trashInfo;
    try {
      if (isPermanent) { await permanentDelete(id, type, fileName); }
      else {
         if (type === 'folder') { await softDeleteFolder(id); }
         else { await softDeleteFile(id); }
      }
      setTrashInfo({ ...trashInfo, isOpen: false });
      fetchAll(false);
      window.dispatchEvent(new CustomEvent('vault-refresh'));
    } catch {}
  };

  const handleRestore = async (itemId, type) => {
    try {
      await restoreItem(itemId, type);
      fetchAll(false);
      window.dispatchEvent(new CustomEvent('vault-refresh'));
    } catch {}
  };

  const titles = { 
    all: 'Welcome to Chunkly', 
    starred: 'Starred Chunks', 
    recent: 'Recent Discoveries', 
    trash: 'Discarded Pieces',
    folders: 'Vault Cabinets'
  };

  // Logic to separate suggested and main files
  const SUGGESTED_LIMIT = 8;
  const suggestedFiles = (view === 'all' && !currentFolder) ? files.slice(0, SUGGESTED_LIMIT) : [];
  const mainFiles = (view === 'all' && !currentFolder) ? files.slice(SUGGESTED_LIMIT) : files;

  return (
    <div className="dashboard-page">
      <button id="create-folder-btn" style={{ display: 'none' }} onClick={() => setShowFolderModal(true)}></button>

      <div className="dashboard-header" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
           {currentFolder ? (
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn btn--ghost" style={{ padding: '8px' }} onClick={() => setCurrentFolder(null)}>
                   <ArrowLeft size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                   <span style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cabinet</span>
                   <ChevronRight size={20} color="var(--text-muted)" />
                   <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-main)' }}>{currentFolder.name}</h1>
                </div>
             </div>
           ) : (
             <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                 {titles[view] || 'Vault'}
             </h1>
           )}
           {view === 'folders' && !currentFolder && (
              <button 
                className="btn btn--primary" 
                style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '0.875rem' }} 
                onClick={() => setShowFolderModal(true)}
              >
                <FolderPlus size={16} /> New Cabinet
              </button>
           )}
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
           <button className="btn btn--ghost" onClick={() => fetchAll()} disabled={loading}><RefreshCw size={20} className={loading ? 'spin' : ''} /></button>
           
           <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)', display: 'flex', padding: '4px', gap: '4px' }}>
              <button className={`btn btn--ghost`} style={{ padding: '6px', background: !isGridView ? 'white' : 'transparent', border: !isGridView ? '1px solid var(--border-light)' : 'none' }} onClick={() => setIsGridView(false)}><List size={18} /></button>
              <button className={`btn btn--ghost`} style={{ padding: '6px', background: isGridView ? 'white' : 'transparent', border: isGridView ? '1px solid var(--border-light)' : 'none' }} onClick={() => setIsGridView(true)}><LayoutGrid size={18} /></button>
           </div>
        </div>
      </div>

      {!currentFolder && view === 'all' && (
        <section style={{ marginBottom: '48px' }}>
           {folders.length > 0 && (
             <>
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <ChevronRight size={18} />
                  <h2 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Suggested folders</h2>
               </div>
               
               <div className="suggested-grid">
                  {folders.map(f => (
                    <div key={f.folderId} className="folder-card" onClick={() => setCurrentFolder(f)}>
                       <div style={{ width: '32px', height: '32px', background: '#5f6368', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Folder size={18} fill="white" color="white" />
                       </div>
                       
                       <div className="text-truncate" style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 700 }} className="text-truncate">{f.name}</p>
                          <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>in My Drive</p>
                       </div>

                       <button className="btn btn--ghost" style={{ padding: '6px', flexShrink: 0, marginLeft: '4px' }} onClick={(e) => { e.stopPropagation(); setOpenFolderMenu(openFolderMenu === f.folderId ? null : f.folderId); }}>
                          <MoreVertical size={18} />
                       </button>

                       {openFolderMenu === f.folderId && (
                         <div className="sidebar-new-menu" style={{ right: '0', top: '50px', left: 'auto', minWidth: '180px', zIndex: 1000 }} ref={folderMenuRef} onClick={(e) => e.stopPropagation()}>
                            <button className="sidebar-new-item" onClick={() => { setCurrentFolder(f); setOpenFolderMenu(null); }}><ExternalLink size={16} /> Open Folder</button>
                            <button className="sidebar-new-item" style={{ color: 'var(--error)' }} onClick={(e) => { e.stopPropagation(); handleOpenTrashModal(f.folderId, 'folder'); setOpenFolderMenu(null); }}><Trash2 size={16} /> Delete Folder</button>
                         </div>
                       )}
                    </div>
                  ))}
               </div>
             </>
           )}

           {suggestedFiles.length > 0 && (
             <div style={{ marginTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                   <ChevronRight size={18} />
                   <h2 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Suggested files</h2>
                </div>

                <FileList
                    files={suggestedFiles}
                    loading={loading}
                    onStar={handleStar}
                    onDelete={handleOpenTrashModal}
                    onDownload={async (id) => {
                      try {
                        const result = await getDownloadUrl(id);
                        const url = result?.url || result?.downloadUrl;
                        if (url) window.open(url, '_blank');
                      } catch {}
                    }}
                    onView={file => setSelectedFileId(file.fileId || file._id || file.id)}
                    isGridView={isGridView}
                  />
             </div>
           )}
        </section>
      )}

      {mainFiles.length > 0 && (
        <div style={{ marginTop: view === 'all' && !currentFolder ? '48px' : '0' }}>
           {view === 'all' && !currentFolder && suggestedFiles.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                 <ChevronRight size={18} />
                 <h2 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>All Chunks</h2>
              </div>
           )}
           <FileList
            files={mainFiles}
            loading={loading}
            onStar={view !== 'trash' ? handleStar : undefined}
            onDelete={view !== 'trash' ? handleOpenTrashModal : undefined}
            onDownload={async (id) => {
               try {
                 const result = await getDownloadUrl(id);
                 const url = result?.url || result?.downloadUrl;
                 if (url) window.open(url, '_blank');
               } catch {}
            }}
            onRestore={handleRestore}
            onPermanentDelete={handleOpenPermanentModal}
            onView={file => setSelectedFileId(file.fileId || file._id || file.id)}
            isGridView={isGridView}
            isTrashView={view === 'trash'}
          />
        </div>
      )}

      {files.length === 0 && !loading && (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
           <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontStyle: 'italic' }}>Your vault is empty here.</p>
        </div>
      )}

      {selectedFileId && <FileDetailModal fileId={selectedFileId} onClose={() => setSelectedFileId(null)} />}
      {moveFileId && <MoveFileModal fileIds={Array.isArray(moveFileId) ? moveFileId : [moveFileId]} onClose={() => setMoveFileId(null)} onMoved={() => { fetchAll(false); }} />}
      {showFolderModal && <CreateFolderModal onClose={() => setShowFolderModal(false)} onCreate={handleCreateFolder} />}
      
      <DeleteConfirmModal 
        isOpen={trashInfo.isOpen} 
        itemName={trashInfo.name} 
        itemType={trashInfo.type}
        isPermanent={trashInfo.isPermanent}
        onClose={() => setTrashInfo({ ...trashInfo, isOpen: false })}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
