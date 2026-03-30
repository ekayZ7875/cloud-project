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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[420px] overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 border border-slate-200/60">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-[0_4px_10px_rgba(99,102,241,0.2)]">
                <FolderPlus size={20} className="text-white" />
             </div>
             <h2 className="text-lg font-bold text-slate-800 tracking-tight">New Vault Folder</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors outline-none focus:ring-2 focus:ring-slate-200">
             <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-8">
            <label className="block text-[13px] font-bold text-slate-600 mb-2 uppercase tracking-wide">
              Folder Name
            </label>
            <input
              autoFocus
              type="text"
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-[15px] font-medium placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm"
              placeholder="e.g. Project Assets"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!folderName.trim()}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm shadow-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 active:bg-indigo-800"
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
