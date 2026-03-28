import { useEffect, useState } from 'react';
import {
  X,
  FileText,
  AlertCircle,
  Loader,
  Download,
  Share2
} from 'lucide-react';
import { getFile, getDownloadUrl } from '../services/file.service';

export default function FileDetailModal({ fileId, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const fileData = await getFile(fileId);
        const actualFile = fileData.file || fileData.data || fileData;
        setFile(actualFile);
        
        try {
          // Fetch INLINE URL for preview
          const dlRes = await getDownloadUrl(fileId, false);
          setPreviewUrl(dlRes.downloadUrl);
        } catch (e) {
          console.error("Preview fetch failed", e);
        }
      } catch (err) {
        setError(err.message || 'Failed to initialize preview');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fileId]);

  const handleDownload = async () => {
    if (!fileId || isDownloading) return;
    setIsDownloading(true);
    try {
      // Fetch ATTACHMENT URL for real download
      const dlRes = await getDownloadUrl(fileId, true);
      const link = document.createElement('a');
      link.href = dlRes.downloadUrl;
      link.download = file?.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {} finally {
      setIsDownloading(false);
    }
  };

  if (!fileId) return null;

  const fileName = file?.fileName || file?.name || 'Untitled Chunk';
  const fileExt = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(fileExt);
  const isPDF = fileExt === 'pdf';

  return (
    <div className="modal-overlay modal-overlay--dark" onClick={onClose} style={{ zIndex: 5000 }}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()} style={{ width: '90vw', height: '90vh' }}>
        <div className="preview-header">
           <div className="preview-header__left">
              <div style={{ background: 'var(--brand-primary)', width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <FileText size={18} color="white" />
              </div>
              <span className="preview-title" style={{ fontSize: '1rem', fontWeight: 600 }}>{fileName}</span>
           </div>
           <div className="preview-header__actions">
              <button 
                className={`btn btn--ghost btn--icon ${isDownloading ? 'spin' : ''}`} 
                onClick={handleDownload}
                title="Download Chunk"
              >
                <Download size={20} />
              </button>
              <button className="btn btn--ghost btn--icon"><Share2 size={20} /></button>
              <button className="btn btn--ghost btn--icon" onClick={onClose}><X size={20} /></button>
           </div>
        </div>

        <div className="preview-content" style={{ display: 'block' }}>
           <div className="preview-main" style={{ width: '100%', height: 'calc(90vh - 65px)', background: '#111827' }}>
              {loading ? (
                <div className="preview-placeholder">
                   <Loader size={48} className="spin" color="white" />
                   <p style={{ marginTop: '16px', color: 'rgba(255,255,255,0.7)' }}>Decrypting vault content...</p>
                </div>
              ) : error ? (
                <div className="preview-placeholder">
                   <AlertCircle size={48} color="var(--error)" />
                   <p style={{ marginTop: '16px', color: 'white' }}>{error}</p>
                </div>
              ) : previewUrl ? (
                 <div className="preview-viewport" style={{ width: '100%', height: '100%' }}>
                    {isImage ? (
                       <img src={previewUrl} alt={fileName} className="preview-img" style={{ maxWidth: '95%', maxHeight: '95%' }} />
                    ) : isPDF ? (
                       <iframe src={`${previewUrl}#toolbar=0`} className="preview-iframe" title="PDF Preview" />
                    ) : (
                       <div className="preview-placeholder">
                          <FileText size={64} style={{ opacity: 0.2 }} />
                          <h3 style={{ marginTop: '24px', color: 'white' }}>Format Preview Unavailable</h3>
                          <p style={{ marginTop: '8px', color: 'rgba(255,255,255,0.6)' }}>Download "{fileName}" to view its contents.</p>
                          <button 
                            className="btn btn--primary" 
                            style={{ marginTop: '24px', padding: '12px 24px' }}
                            onClick={handleDownload}
                          >
                            <Download size={18} /> Download Chunk
                          </button>
                       </div>
                    )}
                 </div>
              ) : (
                 <div className="preview-placeholder">
                    <Loader size={32} className="spin" color="white" />
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
