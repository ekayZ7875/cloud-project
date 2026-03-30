import React from 'react';
import { Minus, Plus, Share2, Printer, ArrowLeft } from 'lucide-react';

export default function PDFToolbar({
  fileName,
  scale,
  setScale,
  currentPage,
  numPages,
  onPrint,
  onShare,
  onClose
}) {
  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.25));
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.25));
  };

  return (
    <div className="flex items-center justify-between bg-zinc-900 border-b border-white/10 px-4 h-14 text-white sticky top-0 z-50 shadow-md">
      {/* Left items */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center">
            <span className="text-[10px] font-black text-white">PDF</span>
          </div>
          <span className="font-medium text-[15px] truncate max-w-[200px] md:max-w-md">
            {fileName}
          </span>
        </div>
      </div>

      {/* Middle controls: Pagination */}
      {numPages > 0 && (
        <div className="hidden md:flex items-center gap-4 px-4 py-1.5 bg-black/40 rounded-full border border-white/5">
          <span className="text-sm font-medium opacity-90">
            {currentPage} <span className="text-white/40 mx-1">/</span> {numPages}
          </span>
        </div>
      )}

      {/* Right controls */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 mr-4 bg-white/5 rounded-full px-1 py-1">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Zoom out"
          >
            <Minus size={18} />
          </button>
          <span className="text-xs font-semibold w-12 text-center text-white/80">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Zoom in"
          >
            <Plus size={18} />
          </button>
        </div>

        <button 
          onClick={onPrint}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
          title="Print"
        >
          <Printer size={20} />
        </button>

        <button 
          onClick={onShare}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
          title="Share"
        >
          <Share2 size={20} />
        </button>
      </div>
    </div>
  );
}
