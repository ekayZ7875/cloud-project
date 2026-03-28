import { Trash2, AlertTriangle, X, AlertCircle } from 'lucide-react';

export default function DeleteConfirmModal({ isOpen, onClose, onConfirm, itemName, itemType, isPermanent = false }) {
  if (!isOpen) return null;

  const IconComp = isPermanent ? AlertTriangle : AlertCircle;
  const color = '#ef4444';
  const bgColor = isPermanent ? '#fef2f2' : '#fee2e2';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '440px', padding: '32px', textAlign: 'center', border: isPermanent ? `2px solid ${color}` : '1px solid var(--border-medium)' }}
      >
        <div style={{ 
          width: '72px', 
          height: '72px', 
          background: bgColor, 
          color: color, 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          margin: '0 auto 24px' 
        }}>
          <IconComp size={40} strokeWidth={2.5} />
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px' }}>
          {isPermanent ? 'Permanent Destruction' : 'Move to Trash?'}
        </h2>
        
        <p style={{ color: 'var(--text-sub)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '32px' }}>
          {isPermanent ? (
            <>This action <strong>cannot be undone</strong>. You are about to permanently purge <strong>{itemName}</strong> from the system and S3 storage.</>
          ) : (
            <>You are moving <strong>{itemName}</strong> to the trash. It will no longer be visible in your active cabinet, but can be restored later.</>
          )}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button 
            className="btn btn--secondary" 
            style={{ flex: 1, padding: '12px', fontWeight: 700 }} 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="btn btn--primary" 
            style={{ 
               flex: 1, 
               padding: '12px', 
               background: color, 
               fontWeight: 700, 
               boxShadow: isPermanent ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none' 
            }} 
            onClick={() => { onConfirm(); onClose(); }}
          >
            {isPermanent ? 'Delete Forever' : `Trash ${itemType === 'folder' ? 'Folder' : 'Chunk'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
