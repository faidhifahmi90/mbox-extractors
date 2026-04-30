import React, { useEffect, useState } from 'react';
import { X, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

interface PolicyModalProps {
  policyType: 'EULA' | 'TERMS' | 'PRIVACY' | 'REFUND' | null;
  onClose: () => void;
}

export function PolicyModal({ policyType, onClose }: PolicyModalProps) {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (policyType) {
      fetch(`/${policyType}.md`)
        .then(res => res.text())
        .then(text => setContent(text))
        .catch(() => setContent('Failed to load policy.'));
    }
  }, [policyType]);

  return (
    <AnimatePresence>
      {policyType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-[env(safe-area-inset-bottom,1rem)]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-full overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-lg text-slate-800 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-slate-500" />
                {policyType === 'EULA' && 'End User License Agreement'}
                {policyType === 'TERMS' && 'Terms of Use'}
                {policyType === 'PRIVACY' && 'Privacy Policy'}
                {policyType === 'REFUND' && 'Refund Policy'}
              </h3>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto min-h-[50vh]">
              <div className="prose prose-sm prose-slate max-w-none">
                {content ? (
                  <ReactMarkdown>{content}</ReactMarkdown>
                ) : (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-full"></div>
                    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                    <div className="h-4 bg-slate-200 rounded w-full"></div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 text-center">
              <button
                onClick={onClose}
                className="bg-slate-900 text-white font-semibold px-6 py-2 rounded-xl active:scale-95 transition-transform"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
