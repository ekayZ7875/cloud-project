import React from 'react';
import { Sparkles, X, ChevronRight, Search, Tag } from 'lucide-react';

export default function PDFSummaryPanel({ 
  onClose, 
  isProcessed, 
  analysis, 
  polling 
}) {
  return (
    <div className="w-[380px] h-full bg-[#1e1e1e] border-l border-white/5 flex flex-col shadow-2xl shrink-0 overflow-y-auto z-40 transition-all duration-300">
      <div className="sticky top-0 bg-[#1e1e1e]/90 backdrop-blur-md px-6 py-5 border-b border-white/10 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 font-bold text-white tracking-widest text-[13px]">
          <Sparkles size={16} className="text-indigo-400" />
          SUMMARY
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 text-[10px] font-bold rounded-full border tracking-widest uppercase ${
            polling 
              ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse" 
              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          }`}>
            {polling ? 'Analyzing...' : 'Ready'}
          </div>
          <button 
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 text-white/80">
        {!isProcessed ? (
          <div className="space-y-4 pt-6">
            <div className="flex flex-col gap-3.5">
              <div 
                className="h-3.5 rounded-full bg-gradient-to-r from-[#c084fc] via-[#60a5fa] to-[#3b82f6] shadow-[0_0_15px_rgba(96,165,250,0.4)] animate-pulse" 
                style={{ width: '100%', animationDuration: '2s' }}
               />
              <div 
                className="h-3.5 rounded-full bg-gradient-to-r from-[#c084fc] via-[#60a5fa] to-[#3b82f6] shadow-[0_0_15px_rgba(96,165,250,0.3)] animate-pulse" 
                style={{ width: '80%', animationDuration: '2s', animationDelay: '0.2s' }}
               />
              <div 
                className="h-3.5 rounded-full bg-gradient-to-r from-[#818cf8] to-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse" 
                style={{ width: '25%', animationDuration: '2s', animationDelay: '0.4s' }}
               />
            </div>
            
            <div className="pt-10 flex flex-col gap-3">
               <div className="h-3.5 rounded-full bg-white/5 w-full animate-pulse" />
               <div className="h-3.5 rounded-full bg-white/5 w-[90%] animate-pulse" />
               <div className="h-3.5 rounded-full bg-white/5 w-[60%] animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="text-[15px] leading-relaxed text-white/90">
              {analysis?.summary || 'No summary available.'}
            </p>

            {analysis?.entities && (Object.keys(analysis.entities).some(k => analysis.entities[k].length > 0)) && (
              <div className="space-y-3">
                <h4 className="text-[11px] font-black tracking-widest text-white/40 uppercase flex items-center gap-2">
                  <Search size={14} /> extracted entities
                </h4>
                <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/5">
                  {analysis.entities.names?.length > 0 && (
                    <div className="flex gap-4">
                      <span className="text-white/40 text-sm font-semibold w-16 shrink-0">Names</span>
                      <span className="text-white/90 text-sm font-medium">{analysis.entities.names.join(', ')}</span>
                    </div>
                  )}
                  {analysis.entities.dates?.length > 0 && (
                    <div className="flex gap-4">
                      <span className="text-white/40 text-sm font-semibold w-16 shrink-0">Dates</span>
                      <span className="text-white/90 text-sm font-medium">{analysis.entities.dates.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {analysis?.tags?.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[11px] font-black tracking-widest text-white/40 uppercase flex items-center gap-2">
                  <Tag size={14} /> Tags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.tags.map(tag => (
                    <span key={tag} className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-lg">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 space-y-3">
              <button className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                <span className="font-semibold text-sm text-white/90">Prepare interview questions</span>
                <ChevronRight size={16} className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </button>
              <button className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                <span className="font-semibold text-sm text-white/90">Suggest improvements</span>
                <ChevronRight size={16} className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto p-4 text-center border-t border-white/5 text-[11px] font-medium text-white/30 truncate">
        Powered by Chunkly Intelligence
      </div>
    </div>
  );
}
