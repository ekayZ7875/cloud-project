import React from 'react';
import { FileText, Flag } from 'lucide-react';

const recentFiles = [
  {
    name: 'Proposal_Doc.pdf',
    sender: 'Tony Krijnen',
    time: 'Today',
    flagged: false,
    unread: true,
  },
  {
    name: 'Finance_Report.xlsx',
    sender: 'Katie Jordan',
    time: 'Tue 2:56 PM',
    flagged: true,
    unread: false,
  },
  {
    name: 'Marketing_Invite.ics',
    sender: 'Sara Davis',
    time: '3/13/2025',
    flagged: false,
    unread: false,
  },
  {
    name: 'Sports_Stats.docx',
    sender: 'Belinda Newman',
    time: '3/13/2025',
    flagged: false,
    unread: false,
  },
  {
    name: 'Expense_Report.xlsx',
    sender: 'Pavel Bansky',
    time: '3/13/2025',
    flagged: true,
    unread: true,
  },
];

export const RecentFiles = () => {
  return (
    <div className='w-1/3 h-screen border-l border-zinc-800 bg-zinc-900 pt-5 border-r   border-zinc-800' > 
      <div className='w-full flex-1 flex flex-col  '>
        <h2 className='p-4 font-semibold text-lg text-white text-center w-full border-b border-zinc-800'>
          Recent Files
        </h2>
        {recentFiles.map((file, index) => (
          <div
            key={index}
            className={`flex mt-5 justify-between items-start gap-2 w-[90%] mx-auto p-4 border-b border-zinc-800 hover:bg-zinc-800 cursor-pointer rounded-md ${file.unread ? 'bg-zinc-800 font-semibold text-white' : 'text-zinc-300'
              }`}
          >
            <div className='flex gap-3'>
              <FileText size={20} className='text-zinc-400 mt-1' />
              <div>
                <p className='text-sm'>{file.name}</p>
                <p className='text-xs text-zinc-500'>{file.sender}</p>
              </div>
            </div>
            <div className='text-xs text-zinc-500 flex flex-col items-end gap-1'>
              <span>{file.time}</span>
              {file.flagged && <Flag size={14} className='text-red-200' />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
