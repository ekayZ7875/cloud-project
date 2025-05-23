import React from 'react';
import {
  Folder,
  Image,
  FileText,
  Video,
  Star,
  Share2,
  Users,
  Trash,
  Upload,
  Grid,
  List,
  Settings
} from 'lucide-react';
import { RecentFiles } from '../components/RecentFiles';
import { FileUpload } from '../components/FileUpload';
import Header from '../components/Header';


const SidebarButton = ({ icon, label }) => {
  return (
    <button className='text-left px-4 py-2 rounded-md hover:bg-zinc-800 w-full flex items-center gap-3'>
      {icon}
      {label}
    </button>
  );
};



export const Home = () => {
  const handleFileUpload = (files) => {
    console.log("Uploaded files:", files);
  };

  return (
    <>
      <div className="flex h-screen bg-zinc-900 text-white overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/6 flex flex-col justify-between border-r border-zinc-700 overflow-y-auto">
          <div className=''>
            <h1 className="text-xl font-bold p-4">CloudStore</h1>

            <button className="bg-white text-black flex items-center gap-2 rounded-md mx-4 my-2 py-2 px-3 w-[85%] font-medium">
              <Upload size={18} /> New Upload
            </button>

            <div className="text-gray-400 uppercase text-xs font-semibold px-4 mt-4 mb-2">Storage</div>

            <div className="flex flex-col space-y-2 px-2">
              <SidebarButton icon={<Folder size={18} />} label="My Files" />
              <SidebarButton icon={<Image size={18} />} label="Photos" />
              <SidebarButton icon={<FileText size={18} />} label="Documents" />
              <SidebarButton icon={<Video size={18} />} label="Videos" />
              <SidebarButton icon={<Star size={18} />} label="Starred" />
              <SidebarButton icon={<Share2 size={18} />} label="Shared with me" />
              <SidebarButton icon={<Users size={18} />} label="Shared with others" />
              <SidebarButton icon={<Trash size={18} />} label="Trash" />
            </div>
          </div>

          {/* Footer / Profile */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-700">
            <div className="bg-zinc-700 rounded-full w-8 h-8 flex items-center justify-center font-bold">JD</div>
            <div>
              <div className="text-sm font-medium">John Doe</div>
              <div className="text-xs text-zinc-400">john@example.com</div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between border-b border-zinc-700">
            {/* Left: Search */}
            <input
              type="text"
              placeholder="Search files and folders..."
              className="bg-zinc-800 text-white placeholder-zinc-500 rounded-md px-4 py-2 w-3/5 outline-none border border-zinc-700 focus:border-white"
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
              <div className="flex border border-zinc-600 rounded-md overflow-hidden">
                <button className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700">
                  <Grid size={18} />
                </button>
                <button className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600">
                  <List size={18} />
                </button>
              </div>
              <button className="p-2 hover:bg-zinc-700 rounded-md">
                <Settings size={18} />
              </button>
            </div>
          </div>
          <div className=" flex flex-row">
            <RecentFiles />
            <div className="flex-1 flex flex-col items-center justify-center gap-5">
              <FileUpload />
              <h2 className="text-2xl font-bold mb-4 text-gray-400">Upload Your Files</h2>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
