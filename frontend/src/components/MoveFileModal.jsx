import { useState, useEffect } from 'react';
import { X, FolderInput, Loader, Folder } from 'lucide-react';
import { getAllFolders } from '../services/folder.service';
import { moveFileToFolder, bulkMoveFiles } from '../services/folder.service';

export default function MoveFileModal({ fileIds, onClose, onMoved }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [error, setError] = useState(null);

  const isBulk = Array.isArray(fileIds) && fileIds.length > 1;
  const singleFileId = Array.isArray(fileIds) ? fileIds[0] : fileIds;

  useEffect(() => {
    getAllFolders()
      .then((result) => {
        const folderArr = Array.isArray(result) ? result : result?.folders || [];
        setFolders(folderArr);
      })
      .catch(() => setFolders([]))
      .finally(() => setLoading(false));
  }, []);

  const handleMove = async () => {
    if (!selectedFolder) return;
    setMoving(true);
    setError(null);
    try {
      if (isBulk) {
        await bulkMoveFiles(fileIds, selectedFolder);
      } else {
        await moveFileToFolder(singleFileId, selectedFolder);
      }
      onMoved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Move failed');
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>
            <FolderInput size={20} /> Move {isBulk ? `${fileIds.length} files` : 'File'}
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal__body">
          {loading ? (
            <div className="modal__loader">
              <Loader size={24} className="spin" />
              <p>Loading folders...</p>
            </div>
          ) : folders.length === 0 ? (
            <p className="modal__empty-msg">No folders available. Create a folder first.</p>
          ) : (
            <div className="folder-pick-list">
              {folders.map((folder) => {
                const fId = folder._id || folder.id;
                return (
                  <button
                    key={fId}
                    className={`folder-pick-item ${selectedFolder === fId ? 'folder-pick-item--active' : ''}`}
                    onClick={() => setSelectedFolder(fId)}
                  >
                    <Folder size={18} />
                    <span>{folder.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleMove}
            disabled={moving || !selectedFolder}
            id="move-file-submit"
          >
            {moving ? (
              <>
                <Loader size={16} className="spin" /> Moving...
              </>
            ) : (
              'Move'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
