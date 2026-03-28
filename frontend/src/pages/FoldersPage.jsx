import { useState, useEffect, useCallback } from 'react';
import { getAllFolders, getFilesInFolder } from '../services/folder.service';
import { toggleStar, softDeleteFile, getDownloadUrl } from '../services/file.service';
import FileList from '../components/FileList';
import FileDetailModal from '../components/FileDetailModal';
import MoveFileModal from '../components/MoveFileModal';
import CreateFolderModal from '../components/CreateFolderModal';
import {
  Folder,
  FolderPlus,
  ArrowLeft,
  RefreshCw,
  Loader,
} from 'lucide-react';

export default function FoldersPage() {
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [activeFolder, setActiveFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [moveFileId, setMoveFileId] = useState(null);

  const fetchFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const result = await getAllFolders();
      const arr = Array.isArray(result) ? result : result?.folders || [];
      setFolders(arr);
    } catch {
      setFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  const fetchFolderFiles = useCallback(async (folderId) => {
    setLoadingFiles(true);
    setFileError(null);
    try {
      const result = await getFilesInFolder(folderId);
      const arr = Array.isArray(result) ? result : result?.files || [];
      setFiles(arr);
    } catch (err) {
      setFileError(err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    if (activeFolder) {
      fetchFolderFiles(activeFolder._id || activeFolder.id);
    }
  }, [activeFolder, fetchFolderFiles]);

  const handleStar = async (fileId, isStarred) => {
    setFiles((prev) =>
      prev.map((f) =>
        (f._id || f.id) === fileId ? { ...f, isStarred } : f
      )
    );
    try {
      await toggleStar(fileId, isStarred);
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          (f._id || f.id) === fileId ? { ...f, isStarred: !isStarred } : f
        )
      );
    }
  };

  const handleDelete = async (fileId) => {
    try {
      await softDeleteFile(fileId);
      setFiles((prev) => prev.filter((f) => (f._id || f.id) !== fileId));
    } catch { /* */ }
  };

  const handleDownload = async (fileId) => {
    try {
      const result = await getDownloadUrl(fileId);
      const url = result?.url || result?.downloadUrl;
      if (url) window.open(url, '_blank');
    } catch { /* */ }
  };

  if (activeFolder) {
    const folderId = activeFolder._id || activeFolder.id;
    return (
      <div className="folders-page">
        <div className="dashboard-header">
          <div className="folder-breadcrumb">
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => setActiveFolder(null)}
              aria-label="Back to folders"
            >
              <ArrowLeft size={18} />
            </button>
            <Folder size={20} />
            <h1>{activeFolder.name}</h1>
          </div>
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => fetchFolderFiles(folderId)}
            aria-label="Refresh folder"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <FileList
          files={files}
          loading={loadingFiles}
          error={fileError}
          onStar={handleStar}
          onDelete={handleDelete}
          onDownload={handleDownload}
          onMove={(id) => setMoveFileId(id)}
          onView={(file) => setSelectedFileId(file._id || file.id)}
          emptyMessage="This folder is empty"
        />

        {selectedFileId && (
          <FileDetailModal
            fileId={selectedFileId}
            onClose={() => setSelectedFileId(null)}
          />
        )}
        {moveFileId && (
          <MoveFileModal
            fileIds={[moveFileId]}
            onClose={() => setMoveFileId(null)}
            onMoved={() => fetchFolderFiles(folderId)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="folders-page">
      <div className="dashboard-header">
        <h1>Folders</h1>
        <div className="dashboard-header__actions">
          <button
            className="btn btn--ghost btn--icon"
            onClick={fetchFolders}
            aria-label="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="btn btn--primary"
            onClick={() => setShowCreate(true)}
            id="new-folder-btn"
          >
            <FolderPlus size={16} /> New Folder
          </button>
        </div>
      </div>

      {loadingFolders ? (
        <div className="page-loader">
          <Loader size={24} className="spin" />
          <p>Loading folders...</p>
        </div>
      ) : folders.length === 0 ? (
        <div className="file-list-empty">
          <Folder size={48} />
          <p>No folders yet. Create your first folder!</p>
        </div>
      ) : (
        <div className="folder-grid">
          {folders.map((folder) => {
            const fId = folder._id || folder.id;
            return (
              <button
                key={fId}
                className="folder-card"
                onClick={() => setActiveFolder(folder)}
              >
                <Folder size={32} />
                <span className="folder-card__name">{folder.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateFolderModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchFolders}
        />
      )}
    </div>
  );
}
