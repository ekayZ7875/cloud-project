import { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { uploadFile } from '../services/file.service';
import { useProcessingPoller } from '../hooks/useAsync';

export default function UploadWidget({ onUploadComplete }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const jobId = uploadResult?.jobId || uploadResult?.job_id;

  const { status: processingStatus, polling, startPolling } = useProcessingPoller(
    jobId,
    (result) => {
      if (result.status === 'COMPLETED' || result.status === 'completed') {
        onUploadComplete?.();
      }
    }
  );

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFile(file);
      setUploadResult(result);
      onUploadComplete?.();
      if (result?.jobId || result?.job_id) {
        startPolling();
      }
    } catch (err) {
      setError(err.message || 'Vault entry failed');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setUploadResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      style={{
        background: 'white',
        padding: '32px',
        borderRadius: 'var(--radius-lg)',
        border: '2px dashed var(--border-medium)',
        marginBottom: '32px',
        textAlign: 'center',
        position: 'relative'
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
       {dragging && (
         <div style={{ position: 'absolute', inset: 0, background: 'var(--border-brand)', borderRadius: 'var(--radius-lg)', zIndex: 10 }}></div>
       )}

      {!file ? (
        <div style={{ color: 'var(--text-muted)' }}>
          <div className="file-icon-wrap" style={{ margin: '0 auto 16px', background: 'var(--bg-subtle)' }}>
            <Upload size={24} />
          </div>
          <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>Drop a chunk to upload</p>
          <p style={{ fontSize: '0.75rem' }}>or <button className="btn btn--ghost" style={{ padding: '2px 4px', fontSize: 'inherit', color: 'var(--brand-primary)' }} onClick={() => inputRef.current.click()}>browse files</button></p>
        </div>
      ) : (
        <div>
          <div className="file-name" style={{ justifyContent: 'center', marginBottom: '16px' }}>
            <FileText size={20} color="var(--brand-primary)" />
            <span>{file.name}</span>
            <button className="btn btn--ghost" style={{ padding: '4px' }} onClick={reset}><X size={14} /></button>
          </div>

          {!uploadResult && (
             <button className="btn btn--primary" onClick={handleUpload} disabled={uploading}>
               {uploading ? <Loader size={16} className="spin" /> : <Upload size={16} />}
               Proceed Upload
             </button>
          )}

          {uploadResult && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
               <div style={{ padding: '8px 16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-medium)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 {polling ? <Loader size={12} className="spin" /> : <CheckCircle size={12} color="var(--success)" />}
                 {polling ? 'Analyzing Chunk...' : 'Vault Analysis Complete'}
               </div>
               {!polling && <button className="btn btn--ghost" onClick={reset} style={{ fontSize: '0.75rem' }}>Upload Another</button>}
            </div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" onChange={handleSelect} style={{ display: 'none' }} />
    </div>
  );
}
