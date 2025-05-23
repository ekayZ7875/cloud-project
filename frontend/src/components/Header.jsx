import React from 'react'
import { Grid, List, Settings } from "lucide-react";

export default function Header() {
  return (
    <div className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between border-b border-zinc-700">
      {/* Left: Search */}
      <input
        type="text"
        placeholder="Search files and folders..."
        className="bg-zinc-800 text-white placeholder-zinc-500 rounded-md px-4 py-2 w-1/2 outline-none border border-zinc-700 focus:border-white"
      />

      {/* Center: Storage info */}
      <div className="text-sm text-right">
        <div>
          <span className="font-semibold">2.7 GB used</span>
          <span className="text-zinc-400 ml-1">/ 10 GB</span>
        </div>
        <div className="w-40 bg-zinc-800 h-2 mt-1 rounded-full overflow-hidden">
          <div className="bg-white h-full w-[27%]" />
        </div>
      </div>

      {/* Right: View toggle + Settings */}
      <div className="flex items-center gap-4">
        {/* Grid/List Toggle */}
        <div className="flex border border-zinc-600 rounded-md overflow-hidden">
          <button className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700">
            <Grid size={18} />
          </button>
          <button className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600">
            <List size={18} />
          </button>
        </div>

        {/* Settings */}
        <button className="p-2 hover:bg-zinc-700 rounded-md">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
