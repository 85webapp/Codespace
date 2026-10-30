import React from 'react';
import { X, FileText, Camera, UploadCloud, ChevronRight, ShieldCheck, Layers } from 'lucide-react';

interface AddPurchaseChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectManual: () => void;
  onSelectPhoto: () => void;
  onSelectUpload: () => void;
}

export const AddPurchaseChoiceModal: React.FC<AddPurchaseChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectManual,
  onSelectPhoto,
  onSelectUpload,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl border border-blue-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
              <UploadCloud className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Add Purchase Bill
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                  Select Workflow
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose one of three transactional execution paths
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Choice Body: Exactly Three Distinct Execution Paths */}
        <div className="p-6 space-y-3.5 bg-slate-50/50">
          
          {/* Path Option A: Manual Entry */}
          <div
            onClick={() => {
              onClose();
              onSelectManual();
            }}
            className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-200 hover:border-blue-600 hover:shadow-md transition-all cursor-pointer group flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                    [Choice A]: Manual Entry
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    Direct Blank
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Instantly opens the clean white standard purchase form structure initialized completely blank. Fill supplier details, GSTIN, item rates, and tax parameters manually.
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                  <span>Open Clean Blank Form</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Path Option B: Take Photo */}
          <div
            onClick={() => {
              onClose();
              onSelectPhoto();
            }}
            className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-200 hover:border-blue-600 hover:shadow-md transition-all cursor-pointer group flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                    [Choice B]: Take Photo
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Device Camera
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Launches device camera capture parameters mapping to Cloudinary upload paths and deterministic Gemini Vision OCR extraction.
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                  <span>Launch Camera Capture</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Path Option C: Upload File & PDF */}
          <div
            onClick={() => {
              onClose();
              onSelectUpload();
            }}
            className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-200 hover:border-blue-600 hover:shadow-md transition-all cursor-pointer group flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                    [Choice C]: Upload File & PDF
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Multi-Page Slider
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Accepts multi-page invoice stacks routing to the blue horizontal slidable circle slider widget (Circle 1, Circle 2, etc.) with active Green Border focus trace.
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                  <span>Select File / Multi-Page PDF</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer info banner */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Dual Ingestion System • Zero Voice Prohibited</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
