import React, { useState, useEffect } from 'react';
import PDFToolbar from './PDFToolbar';
import PDFViewer from './PDFViewer';
import PDFSummaryPanel from './PDFSummaryPanel';
import { Sparkles } from 'lucide-react';

export default function PDFViewLayout({ 
  file, 
  previewUrl, 
  onClose,
  jobResult,
  polling
}) {
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setScale((s) => Math.min(3, s + 0.25));
        } else if (e.key === '-') {
          e.preventDefault();
          setScale((s) => Math.max(0.5, s - 0.25));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePrint = () => {
    // Basic window print trigger
    window.print();
  };

  const handleShare = async () => {
    try {
      if (previewUrl) {
        await navigator.clipboard.writeText(previewUrl);
        alert('File URL copied to clipboard!');
      }
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const analysis = jobResult?.job?.analysis || file?.analysis;
  const isProcessed = analysis && (jobResult?.job?.status === 'COMPLETED' || (!polling && analysis));
  const fileName = file?.fileName || file?.name || 'Untitled Document.pdf';

  return (
    <div className="fixed inset-0 z-[6000] bg-[#1f1f1f] flex flex-col w-full h-full overflow-hidden text-white font-sans animate-in fade-in duration-300">
      <PDFToolbar 
        fileName={fileName}
        scale={scale}
        setScale={setScale}
        currentPage={currentPage}
        numPages={numPages}
        onPrint={handlePrint}
        onShare={handleShare}
        onClose={onClose}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <PDFViewer 
          fileUrl={previewUrl}
          scale={scale}
          onPageChange={setCurrentPage}
          numPages={numPages}
          setNumPages={setNumPages}
        />

        {sidebarOpen ? (
          <PDFSummaryPanel
            onClose={() => setSidebarOpen(false)}
            isProcessed={isProcessed}
            analysis={analysis}
            polling={polling}
          />
        ) : (
          <div className="absolute top-6 right-6 z-50">
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-zinc-800 hover:bg-zinc-700 text-white shadow-xl px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 transition-all"
            >
              <Sparkles size={16} className="text-indigo-400" />
              <span className="text-xs font-bold tracking-widest uppercase">Insights</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
