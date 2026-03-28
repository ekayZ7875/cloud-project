import { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';

export default function CreateFolderModal({ onClose, onCreate }) {
  const [folderName, setFolderName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (folderName.trim()) {
      onCreate(folderName.trim());
      onClose();
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal-content" style={{ width: '400px', padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             <div className="brand-icon" style={{ padding: '8px' }}><FolderPlus size={20} /></div>
             <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>New Vault Folder</h2>
          </div>
          <button onClick={onClose} className="btn btn--ghost" style={{ padding: '8px' }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-sub)', marginBottom: '8px' }}>
              Folder Name
            </label>
            <input
              autoFocus
              type="text"
              className="search-bar"
              style={{ width: '100%', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)' }}
              placeholder="e.g. Project Assets"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" onClick={onClose} className="btn btn--ghost">Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={!folderName.trim()}>
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
