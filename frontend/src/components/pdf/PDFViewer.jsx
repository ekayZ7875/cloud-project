import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Initialize worker using Vite's native URL resolution
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export default function PDFViewer({ fileUrl, scale, onPageChange, numPages, setNumPages }) {
  const containerRef = useRef(null);
  
  // Debug log for incoming URL
  useEffect(() => {
    console.log("[DEBUG PDFViewer] Received fileUrl:", fileUrl);
  }, [fileUrl]);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  // Handle intersection to detect current page
  useEffect(() => {
    if (!numPages) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageIndex = Number(entry.target.dataset.pageIndex);
            if (!isNaN(pageIndex)) {
              onPageChange(pageIndex + 1);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.5,
      }
    );

    const pageElements = containerRef.current?.querySelectorAll('.pdf-page-container');
    if (pageElements) {
      pageElements.forEach((el) => observer.observe(el));
    }

    return () => observer.disconnect();
  }, [numPages, scale, onPageChange]);

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-[#323639] flex flex-col items-center py-6 gap-6 relative"
    >
      {fileUrl ? (
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-4">
              <div className="w-8 h-8 rounded-full border-4 border-white/20 border-t-white/80 animate-spin" />
              <p>Loading document...</p>
            </div>
          }
          error={
            <div className="text-red-400 p-4 bg-red-400/10 rounded-lg">
              Failed to load PDF. Please try again.
            </div>
          }
        >
          {Array.from(new Array(numPages || 0), (el, index) => (
            <div 
              key={`page_${index + 1}`} 
              data-page-index={index}
              className="pdf-page-container shadow-xl bg-white transition-transform duration-200"
              style={{ padding: 0 }}
            >
              <Page
                pageNumber={index + 1}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={
                  <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-white/5 animate-pulse">
                    <span className="text-white/30 text-sm">Loading page {index + 1}...</span>
                  </div>
                }
              />
            </div>
          ))}
        </Document>
      ) : (
        <div className="text-white/50">No document available.</div>
      )}
    </div>
  );
}
