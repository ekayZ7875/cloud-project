import { useEffect, useState, useCallback } from 'react';
import {
  X,
  FileText,
  AlertCircle,
  Loader,
  Download,
  Share2,
  Sparkles,
  Search,
  Calendar,
  Tag,
  Clock,
  ChevronRight,
  MoreVertical
} from 'lucide-react';
import { getFile, getDownloadUrl, getProcessingStatus } from '../services/file.service';
import { useProcessingPoller } from '../hooks/useAsync';
import PDFViewLayout from './pdf/PDFViewLayout';

export default function FileDetailModal({ fileId, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Status Polling
  const { status: jobResult, polling, startPolling } = useProcessingPoller(
    file?.jobId,
    (result) => {
      console.log("Analysis Completed:", result);
    }
  );

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      console.log("[DEBUG] Starting loadData for fileId:", fileId);
      try {
        const fileData = await getFile(fileId);
        const actualFile = fileData.file || fileData.data || fileData;
        
        console.log("[DEBUG] API getFile response:", fileData);
        console.log("[DEBUG] Extracted actualFile:", actualFile);
        console.log("[DEBUG] Initial URLs:", {
          s3Url: actualFile?.s3Url,
          fileUrl: actualFile?.fileUrl,
          url: actualFile?.url
        });

        setFile(actualFile);
        
        const initialUrl = actualFile?.s3Url || actualFile?.fileUrl || actualFile?.url;
        console.log("[DEBUG] Chosen initialUrl for preview:", initialUrl);

        if (initialUrl) setPreviewUrl(encodeURI(initialUrl));

        // Always fetch the signed URL as a fallback! S3 direct URLs might be Private (403 Forbidden)
        try {
          console.log("[DEBUG] Fetching signed URL (Presigned for private buckets)...");
          const dlRes = await getDownloadUrl(fileId, false);
          if (dlRes.downloadUrl) {
             console.log("[DEBUG] Overwriting previewUrl with presigned URL:", dlRes.downloadUrl);
             setPreviewUrl(dlRes.downloadUrl);
          }
        } catch (e) {
          console.error("[DEBUG] Signed URL fetch failed", e);
        }
      } catch (err) {
        console.error("[DEBUG] loadData overall failure:", err);
        setError(err.message || 'Failed to initialize preview');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fileId]);

  // Separate effect for polling to avoid dependency loops
  useEffect(() => {
    const currentStatus = jobResult?.job?.status || file?.status;
    const isJobDone = currentStatus === 'COMPLETED' || currentStatus === 'FAILED';
    
    if (file?.jobId && !polling && !isJobDone) {
      console.log("[DEBUG] Triggering polling for jobId:", file.jobId);
      startPolling();
    }
  }, [file?.jobId, file?.status, startPolling, polling, jobResult?.job?.status]);

  const handleDownload = async () => {
    if (!fileId || isDownloading) return;
    setIsDownloading(true);
    try {
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

  const analysis = jobResult?.job?.analysis || file?.analysis;
  const isProcessed = analysis && (jobResult?.job?.status === 'COMPLETED' || (!polling && analysis));

  if (isPDF) {
    return (
      <PDFViewLayout 
        file={file} 
        previewUrl={previewUrl} 
        onClose={onClose} 
        jobResult={jobResult} 
        polling={polling} 
      />
    );
  }

  return (
    <div className="modal-overlay modal-overlay--dark" onClick={onClose} style={{ zIndex: 5000 }}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header" style={{ background: 'white', borderBottom: '1px solid #e8eaed', padding: '12px 24px', color: '#3c4043' }}>
           <div className="preview-header__left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className={`google-icon-wrapper ${isPDF ? 'google-icon-wrapper--pdf' : 'google-icon-wrapper--folder'}`}>
                 {isPDF ? <span style={{ color: 'white', fontSize: '7px', fontWeight: 900 }}>PDF</span> : <FileText size={16} color="white" />}
              </div>
              <span className="preview-title" style={{ fontSize: '1.125rem', fontWeight: 500, color: '#3c4043' }}>{fileName}</span>
           </div>
           <div className="preview-header__actions">
              <button 
                className={`btn btn--ghost btn--icon ${isDownloading ? 'spin' : ''}`} 
                onClick={handleDownload}
                title="Download Chunk"
                style={{ color: '#5f6368' }}
              >
                <Download size={20} />
              </button>
              <button className="btn btn--ghost btn--icon" style={{ color: '#5f6368' }}><Share2 size={20} /></button>
              <button 
                className={`btn btn--ghost btn--icon ${sidebarOpen ? 'btn--active' : ''}`}
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ color: sidebarOpen ? "var(--brand-primary)" : "#5f6368" }}
              >
                <Sparkles size={20} />
              </button>
              <button className="btn btn--ghost btn--icon" onClick={onClose} style={{ color: '#5f6368' }}><X size={20} /></button>
           </div>
        </div>

        <div className="preview-content">
           <div className="preview-main">
              {loading ? (
                <div className="preview-placeholder">
                   <Loader size={48} className="spin" color="white" />
                   <p style={{ marginTop: '16px', color: 'rgba(255,255,255,0.7)' }}>Entering the vault...</p>
                </div>
              ) : error ? (
                <div className="preview-placeholder">
                   <AlertCircle size={48} color="var(--error)" />
                   <p style={{ marginTop: '16px', color: 'white' }}>{error}</p>
                </div>
              ) : previewUrl ? (
                 <div className="preview-viewport">
                    {isImage ? (
                       <img src={previewUrl} alt={fileName} className="preview-img" />
                    ) : isPDF ? (
                                               <iframe key={previewUrl} src={`${previewUrl}#toolbar=0`} className="preview-iframe" title="PDF Preview" />
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

           {sidebarOpen && (
             <div className="preview-sidebar">
                <div className="ai-insight-panel">
                   <div className="ai-insight-header">
                      <Sparkles size={16} />
                      Summary
                      <div className="ai-status-badge ai-status-badge--active" style={{ marginLeft: 'auto' }}>
                         {polling ? 'Analyzing...' : 'Ready'}
                      </div>
                      <MoreVertical size={16} style={{ cursor: 'pointer', opacity: 0.5 }} />
                      <X size={16} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setSidebarOpen(false)} />
                   </div>

                   <div className="ai-insight-body">
                      {!isProcessed ? (
                        <div style={{ padding: '8px 0' }}>
                           <div className="skeleton-line skeleton-line--glow" style={{ width: '100%', height: '20px', marginBottom: '20px' }}></div>
                           <div className="skeleton-line" style={{ width: '90%' }}></div>
                           <div className="skeleton-line" style={{ width: '95%' }}></div>
                           <div className="skeleton-line" style={{ width: '80%' }}></div>
                           <div className="skeleton-line--glow" style={{ width: '40%', height: '16px', marginTop: '32px' }}></div>
                        </div>
                      ) : (
                        <div className="analysis-content">
                           <p className="analysis-summary">
                              {analysis.summary}
                           </p>

                           {analysis.entities && Object.keys(analysis.entities).some(k => analysis.entities[k].length > 0) && (
                              <div className="insight-section">
                                 <div className="insight-section-title"><Search size={12} /> Key Information</div>
                                 <div className="info-grid">
                                    {analysis.entities?.names?.length > 0 && (
                                       <div className="info-row"><span>Found Names:</span> <span>{analysis.entities.names.join(', ')}</span></div>
                                    )}
                                    {analysis.entities?.dates?.length > 0 && (
                                       <div className="info-row"><span>Dates Mentioned:</span> <span>{analysis.entities.dates.join(', ')}</span></div>
                                    )}
                                 </div>
                              </div>
                           )}

                           {analysis.tags?.length > 0 && (
                              <div className="insight-section">
                                 <div className="insight-section-title"><Tag size={12} /> Tags</div>
                                 <div className="insight-chips">
                                    {analysis.tags.map(tag => (
                                       <span key={tag} className="insight-chip insight-chip--tag">#{tag}</span>
                                    ))}
                                 </div>
                              </div>
                           )}

                           <div className="insight-section" style={{ marginTop: '40px' }}>
                              <button className="btn btn--primary btn--full" style={{ background: '#262626', border: '1px solid rgba(255,255,255,0.1)', color: 'white', justifyContent: 'space-between', padding: '16px' }}>
                                 Suggest improvements
                                 <ChevronRight size={16} />
                              </button>
                              <button className="btn btn--primary btn--full" style={{ background: '#262626', border: '1px solid rgba(255,255,255,0.1)', color: 'white', justifyContent: 'space-between', padding: '16px', marginTop: '12px' }}>
                                 Draft from this resume
                                 <ChevronRight size={16} />
                              </button>
                           </div>
                        </div>
                      )}
                   </div>

                   <div className="ai-info-footer" style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      Powered by Chunkly Intelligence
                   </div>
                </div>

                <div className="file-info-section">
                   <div className="info-header"><Clock size={12} /> File Details</div>
                   <div className="info-grid">
                      <div className="info-row"><span>Type</span> <span>{fileExt.toUpperCase()} Chunk</span></div>
                      <div className="info-row"><span>Size</span> <span>{(file?.fileSize / 1024).toFixed(1)} KB</span></div>
                      <div className="info-row"><span>Created</span> <span>{new Date(file?.uploadedAt).toLocaleDateString()}</span></div>
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
