import React from 'react'
import { useRef, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';

export const FileUpload = () => {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      setIsNear(distance <= 150); // ~2cm
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleClick = () => {
    inputRef.current.click(); // trigger file input
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    console.log("File selected:", file);
    // You can now upload the file or process it
  };

  return (
    <div className={`flex flex-col items-center justify-center rounded-3xl 
      ${isNear ? 'border-dashed border-2 border-blue-700' : 'border-none'}`}>

      <button
        ref={ref}
        onClick={handleClick}
        className={` h-30 w-30 bg-black flex justify-center items-center rounded-2xl 
          transition-transform duration-300 cursor-pointer
          ${isNear ? 'transform -translate-y-4 translate-x-4' : ''}`}
      >
        <Upload size={20} stroke="white" />
      </button>

      <input
        type="file"
        ref={inputRef}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};


