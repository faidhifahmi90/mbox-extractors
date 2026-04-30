import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { useReactToPrint } from 'react-to-print';
import { UploadCloud, FileType, CheckCircle2, Download, Settings, Loader2, Search, Paperclip, Crown, Mail, ChevronRight, Inbox, Eye, Calendar, User, AlignLeft, FileText } from 'lucide-react';
import { extractEmailsFromMbox, ExtractedAttachment, ParsedMessage } from './lib/mboxParser';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'extract' | 'emails' | 'attachments' | 'messages' | 'pro'>('extract');
  const [isPro, setIsPro] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [totalEmailsFound, setTotalEmailsFound] = useState(0);
  const [attachments, setAttachments] = useState<ExtractedAttachment[]>([]);
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ParsedMessage | null>(null);
  
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
  const [attachmentGroupBy, setAttachmentGroupBy] = useState<'none' | 'filename' | 'mimeType' | 'sender' | 'date'>('none');
  
  // Settings
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [extractAttachments, setExtractAttachments] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [outputFormat, setOutputFormat] = useState('CSV');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);

  const resetState = () => {
    setFile(null);
    setResults([]);
    setTotalEmailsFound(0);
    setAttachments([]);
    setMessages([]);
    setSelectedMessage(null);
    setSelectedEmails(new Set());
    setSelectedAttachments(new Set());
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!isPro && f.size > 50 * 1024 * 1024) {
        alert("Free tier limits file size to 50MB. Upgrade to Pro for unlimited sizes.");
        return;
      }
      setFile(f);
      setResults([]);
      setTotalEmailsFound(0);
      setAttachments([]);
      setMessages([]);
      setSelectedMessage(null);
      setSelectedEmails(new Set());
      setSelectedAttachments(new Set());
      setProgress(0);
    }
  };

  const exportMessageToPDF = useReactToPrint({
      contentRef: messageContentRef,
      documentTitle: selectedMessage ? `email_${selectedMessage.id}` : 'email',
      pageStyle: `
        @page {
            margin: 20mm;
        }
        @media print {
            body { 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
            }
        }
      `
  });

  const handleExtract = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setProgress(0);
    setResults([]);
    setTotalEmailsFound(0);
    setAttachments([]);
    setMessages([]);
    setSelectedEmails(new Set());
    setSelectedAttachments(new Set());

    try {
      const extracted = await extractEmailsFromMbox(file, {
        removeDuplicates,
        extractAttachments: isPro ? extractAttachments : false,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        onProgress: (p) => setProgress(p),
      });
      
      let finalEmails = extracted.emails;
      if (!isPro && finalEmails.length > 500) {
        finalEmails = finalEmails.slice(0, 500);
      }

      setResults(finalEmails);
      setTotalEmailsFound(extracted.totalEmailsFound);
      setAttachments(extracted.attachments);
      setMessages(extracted.messages);
      
      if (finalEmails.length > 0) {
        setActiveTab('emails');
      } else if (extracted.messages.length > 0) {
        setActiveTab('messages');
      } else if (extracted.attachments.length > 0) {
        setActiveTab('attachments');
      }
      
    } catch (error) {
      console.error('Error extracting emails:', error);
      alert('Failed to parse file. Please ensure it is a valid text/MBOX file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredResults = results.filter(email => email.toLowerCase().includes(searchQuery.toLowerCase()));

  const filteredMessages = messages.filter(m => 
    m.subject.toLowerCase().includes(messageSearchQuery.toLowerCase()) || 
    m.sender.toLowerCase().includes(messageSearchQuery.toLowerCase()) ||
    (m.date && m.date.includes(messageSearchQuery))
  );

  const visibleMessages = isPro ? filteredMessages : filteredMessages.slice(0, 10);

  const downloadResults = () => {
    if (results.length === 0) return;
    
    const baseList = searchQuery ? filteredResults : results;
    const itemsToExport = selectedEmails.size > 0 
      ? baseList.filter(e => selectedEmails.has(e))
      : baseList;

    if (itemsToExport.length === 0) return;
    
    let content = '';
    let mimeType = 'text/plain';
    let extension = 'txt';

    if (outputFormat === 'CSV') {
      content = 'Email Address\n' + itemsToExport.map(e => `"${e}"`).join('\n');
      mimeType = 'text/csv';
      extension = 'csv';
    } else if (outputFormat === 'VCF') {
      content = itemsToExport.map(e => `BEGIN:VCARD\nVERSION:3.0\nEMAIL:${e}\nEND:VCARD`).join('\n');
      mimeType = 'text/vcard';
      extension = 'vcf';
    } else {
      content = itemsToExport.join('\n');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_emails.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAttachments = async () => {
    if (attachments.length === 0) return;
    
    if (!isPro) {
      setActiveTab('pro');
      return;
    }

    const itemsToExport = selectedAttachments.size > 0
      ? attachments.filter(a => selectedAttachments.has(a.filename))
      : attachments;
      
    if (itemsToExport.length === 0) return;

    setIsProcessing(true);
    try {
      const zip = new JSZip();
      itemsToExport.forEach(att => {
        zip.file(att.filename, att.data, { base64: true });
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'extracted_attachments.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleEmailSelection = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleAllFilteredEmails = () => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      const allSelected = filteredResults.every(e => next.has(e));
      if (allSelected) {
        filteredResults.forEach(e => next.delete(e));
      } else {
        filteredResults.forEach(e => next.add(e));
      }
      return next;
    });
  };

  const toggleAttachmentSelection = (filename: string) => {
    setSelectedAttachments(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };
  
  const toggleAllAttachments = () => {
    setSelectedAttachments(prev => {
      const next = new Set(prev);
      const allSelected = attachments.every(a => next.has(a.filename));
      if (allSelected) {
        attachments.forEach(a => next.delete(a.filename));
      } else {
        attachments.forEach(a => next.add(a.filename));
      }
      return next;
    });
  };

  const groupedAttachments = React.useMemo(() => {
    if (attachmentGroupBy === 'none') return [];
    
    const grouped: Record<string, ExtractedAttachment[]> = {};
    attachments.forEach(att => {
      let key = 'Unknown';
      if (attachmentGroupBy === 'mimeType') {
        key = att.mimeType || 'unknown format';
      } else if (attachmentGroupBy === 'sender') {
        key = att.sender || 'Unknown Sender';
      } else if (attachmentGroupBy === 'date') {
        key = att.date ? new Date(att.date).toLocaleDateString() : 'Unknown Date';
      } else if (attachmentGroupBy === 'filename') {
        const extMatch = att.filename.match(/\.([^.]+)$/);
        key = extMatch ? `.${extMatch[1].toUpperCase()}` : 'No Extension';
      }
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(att);
    });
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [attachments, attachmentGroupBy]);

  return (
    <div className="bg-slate-900 min-h-screen flex items-center justify-center sm:p-6 md:p-12">
      {/* Mobile Device Frame styling */}
      <div className="w-full h-[100dvh] sm:h-[800px] sm:max-w-[400px] bg-slate-50 relative flex flex-col sm:rounded-[2.5rem] shadow-2xl overflow-hidden ring-1 ring-slate-900/10">
        
        {/* Dynamic header area per tab */}
        <div className="bg-white px-6 pt-12 pb-4 shadow-sm z-10 flex-shrink-0 flex justify-between items-center relative">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 capitalize">
            {activeTab === 'extract' ? 'vMail Extractor' : activeTab}
          </h1>
          {activeTab === 'emails' && results.length > 0 && (
             <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
               {results.length} found
             </span>
          )}
          {activeTab === 'attachments' && attachments.length > 0 && (
             <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
               {attachments.length} files
             </span>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          
          <AnimatePresence mode="wait">
            
            {activeTab === 'extract' && (
              <motion.div 
                key="extract"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-6 pb-6 flex flex-col h-full space-y-8 overflow-y-auto"
              >
                
                <div className="flex flex-col items-center justify-center space-y-6 mt-2">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".mbox, .txt" className="hidden" />
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-square max-h-56 border-2 border-dashed border-slate-300 rounded-3xl bg-white flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all shadow-sm active:scale-95"
                  >
                    {file ? (
                      <>
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                          <FileType className="w-8 h-8" />
                        </div>
                        <span className="font-semibold text-slate-800 max-w-full truncate px-4">{file.name}</span>
                        <span className="text-sm text-slate-500 mt-1">{(file.size/1024/1024).toFixed(2)} MB</span>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
                          <UploadCloud className="w-8 h-8" />
                        </div>
                        <span className="font-semibold text-slate-800">Tap to browse</span>
                        <span className="text-sm text-slate-500 mt-1">Supports MBOX files</span>
                      </>
                    )}
                  </div>

                  {!isPro && (
                    <p className="text-xs text-center text-slate-400 px-4">
                      Free tier limits extraction to 500 emails max and file size to 50MB.
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-2">Options</h2>
                  
                  <label className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 cursor-pointer">
                    <div>
                      <span className="block font-medium text-slate-800">Remove Duplicates</span>
                      <span className="text-xs text-slate-500">Only extract unique emails</span>
                    </div>
                    <input type="checkbox" checked={removeDuplicates} onChange={(e) => setRemoveDuplicates(e.target.checked)} className="w-5 h-5 text-blue-600 rounded border-slate-300" />
                  </label>

                  <label className={cn("flex items-center justify-between p-4 rounded-xl shadow-sm border transition-colors", isPro ? "bg-white border-slate-100 cursor-pointer" : "bg-slate-50 border-slate-200 opacity-80 cursor-not-allowed")}>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="block font-medium text-slate-800">Extract Attachments</span>
                        {!isPro && <Crown className="w-3 h-3 text-amber-500" />}
                      </div>
                      <span className="text-xs text-slate-500">Find and save file attachments</span>
                    </div>
                    <input type="checkbox" disabled={!isPro} checked={isPro && extractAttachments} onChange={(e) => setExtractAttachments(e.target.checked)} className="w-5 h-5 text-blue-600 rounded border-slate-300" />
                  </label>

                  <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 space-y-3">
                     <span className="block font-medium text-slate-800">Date Range</span>
                     <div className="flex space-x-3">
                       <div className="flex-1">
                         <label className="text-[10px] uppercase text-slate-400 font-semibold mb-1 block">From</label>
                         <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full p-2 text-sm bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500" />
                       </div>
                       <div className="flex-1">
                         <label className="text-[10px] uppercase text-slate-400 font-semibold mb-1 block">To</label>
                         <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full p-2 text-sm bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500" />
                       </div>
                     </div>
                  </div>
                </div>

                <div className="pt-2 pb-6 space-y-4">
                  <button
                    onClick={handleExtract}
                    disabled={isProcessing || !file}
                    className={cn(
                      "w-full bg-blue-600 active:bg-blue-700 text-white font-semibold py-4 rounded-2xl shadow-lg transition-transform flex items-center justify-center",
                      (isProcessing || !file) ? "opacity-50 cursor-not-allowed" : "active:scale-95"
                    )}
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Extracting {progress}%</>
                    ) : (
                      'Start Extraction'
                    )}
                  </button>
                  {file && (results.length > 0 || attachments.length > 0) && (
                    <button onClick={resetState} className="w-full bg-slate-200 text-slate-700 font-semibold py-4 rounded-2xl active:bg-slate-300 transition-colors">
                      Clear Data
                    </button>
                  )}
                </div>
                
              </motion.div>
            )}

            {activeTab === 'emails' && (
              <motion.div 
                key="emails"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col h-full bg-white relative overflow-hidden"
              >
                {results.length > 0 ? (
                  <>
                    <div className="px-5 py-4 border-b border-slate-100 space-y-4 flex-shrink-0 bg-white z-10">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search emails..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent focus:bg-white rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                         <label className="flex items-center space-x-3 cursor-pointer">
                           <input type="checkbox" onChange={toggleAllFilteredEmails} checked={filteredResults.length > 0 && filteredResults.every(e => selectedEmails.has(e))} className="w-5 h-5 rounded text-blue-600 border-slate-300" />
                           <span className="text-sm font-medium text-slate-700">Select All</span>
                         </label>
                         
                         <select value={outputFormat} onChange={e => setOutputFormat(e.target.value)} className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer">
                           <option value="CSV">CSV</option>
                           <option value="TXT">TXT</option>
                           <option value="VCF">VCF</option>
                         </select>
                      </div>
                    </div>
                    
                    <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 pb-28">
                       {filteredResults.map((email, idx) => (
                         <label key={idx} className="flex items-center px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
                            <input type="checkbox" checked={selectedEmails.has(email)} onChange={() => toggleEmailSelection(email)} className="w-5 h-5 rounded text-blue-600 border-slate-300 mr-4 flex-shrink-0" />
                            <span className="text-sm font-mono text-slate-700 truncate">{email}</span>
                         </label>
                       ))}
                       {filteredResults.length === 0 && (
                         <div className="p-8 text-center text-slate-400 mt-10">No items found matching your search.</div>
                       )}
                    </ul>

                    {/* Floating Action Bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none flex justify-center pb-6 pt-12">
                       <button onClick={downloadResults} className="pointer-events-auto bg-slate-900 text-white px-8 py-3.5 rounded-full shadow-xl font-medium flex items-center active:scale-95 transition-transform">
                         <Download className="w-4 h-4 mr-2" />
                         Download {selectedEmails.size > 0 ? selectedEmails.size : 'All'}
                       </button>
                    </div>
                  </>
                ) : (
                  <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4">
                     <Mail className="w-12 h-12 text-slate-300" />
                     <p className="text-slate-500 font-medium">No emails extracted yet.</p>
                     <button onClick={() => setActiveTab('extract')} className="text-blue-600 font-semibold px-4 py-2 bg-blue-50 rounded-lg">Go to Extractor</button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'messages' && (
              <motion.div 
                key="messages"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col h-full bg-slate-50 relative overflow-hidden"
              >
                {selectedMessage ? (
                  <div className="flex flex-col h-full bg-white w-full">
                     <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
                        <button onClick={() => setSelectedMessage(null)} className="flex items-center text-sm font-medium text-slate-600 hover:text-slate-900 transition bg-slate-100 px-3 py-1.5 rounded-full">
                           <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back
                        </button>
                        {isPro ? (
                           <button onClick={exportMessageToPDF} className="flex items-center text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 rounded-full px-4 py-1.5 transition active:scale-95">
                              <FileText className="w-4 h-4 mr-1.5" /> PDF
                           </button>
                        ) : (
                           <button onClick={() => setActiveTab('pro')} className="flex items-center text-sm font-bold text-amber-600 hover:text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 transition">
                              <Crown className="w-4 h-4 mr-1.5" /> Export PDF
                           </button>
                        )}
                     </div>
                     <div className="flex-1 overflow-y-auto print:overflow-visible print:h-auto p-6 print:p-0" ref={messageContentRef}>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-6 leading-tight print:mb-4">{selectedMessage.subject || 'No Subject'}</h2>
                        <div className="flex flex-col space-y-3 mb-8 bg-slate-50 rounded-2xl p-5 border border-slate-100 print:border-none print:bg-transparent print:p-0 print:mb-6">
                           <div className="flex items-start">
                              <User className="w-4 h-4 text-slate-400 mt-1 mr-3 flex-shrink-0" />
                              <div className="flex flex-col">
                                 <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">From</span>
                                 <span className="text-sm font-medium text-slate-800 break-all">{selectedMessage.sender}</span>
                              </div>
                           </div>
                           <div className="flex items-start">
                              <Calendar className="w-4 h-4 text-slate-400 mt-1 mr-3 flex-shrink-0" />
                              <div className="flex flex-col">
                                 <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Date</span>
                                 <span className="text-sm font-medium text-slate-800">{selectedMessage.date ? new Date(selectedMessage.date).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) : 'Unknown Date'}</span>
                              </div>
                           </div>
                           {selectedMessage.attachmentCount > 0 && (
                               <div className="flex items-center mt-2 bg-blue-50 text-blue-700 rounded-lg px-3 py-2 w-fit">
                                 <Paperclip className="w-4 h-4 mr-2" /> 
                                 <span className="text-sm font-semibold">{selectedMessage.attachmentCount} Attachment(s)</span>
                               </div>
                           )}
                        </div>
                        <div className="pt-2 pb-12 print:pb-0">
                           <div className="flex items-center space-x-2 text-slate-400 mb-4 opacity-50 print:mt-4"><AlignLeft className="w-4 h-4" /><span className="text-sm font-semibold uppercase tracking-wider">Message</span></div>
                           {selectedMessage.htmlBody ? (
                              <div className="prose prose-sm max-w-none text-slate-800 prose-a:text-blue-600 overflow-hidden print:overflow-visible" dangerouslySetInnerHTML={{ __html: selectedMessage.htmlBody }} />
                           ) : (
                              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700 font-sans">{selectedMessage.body || <span className="italic text-slate-400">Empty message</span>}</div>
                           )}
                        </div>
                     </div>
                  </div>
                ) : messages.length > 0 ? (
                  <div className="flex flex-col h-full bg-white">
                    <div className="px-5 py-4 border-b border-slate-100 space-y-4 flex-shrink-0 bg-white z-10">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search subject, sender, date..." 
                          value={messageSearchQuery}
                          onChange={(e) => setMessageSearchQuery(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent focus:bg-white rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                      {!isPro && messages.length > 10 && (
                         <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100/50 p-2.5 rounded-xl font-medium text-center flex items-center justify-center">
                            <Crown className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                            Free tier shows top 10 recent. Upgrade to see all {messages.length}.
                         </div>
                      )}
                    </div>
                    
                    <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 pb-20">
                       {visibleMessages.map((msg, idx) => (
                         <li key={msg.id} onClick={() => setSelectedMessage(msg)} className="px-5 py-4 flex flex-col hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
                            <div className="flex justify-between items-start mb-1.5 gap-2">
                               <span className="text-sm font-bold text-slate-900 line-clamp-1 flex-1">{msg.sender}</span>
                               <span className="text-xs font-medium text-slate-400 flex-shrink-0 mt-0.5">{msg.date ? new Date(msg.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-700 line-clamp-1 mb-1.5">{msg.subject || 'No Subject'}</div>
                            <div className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed">{msg.body}</div>
                            {msg.attachmentCount > 0 && <div className="mt-3 text-[10px] font-bold tracking-wider bg-slate-100 self-start px-2 py-1 rounded-md text-slate-500 flex items-center uppercase"><Paperclip className="w-3 h-3 mr-1" /> {msg.attachmentCount} Attachment(s)</div>}
                         </li>
                       ))}
                       {visibleMessages.length === 0 && (
                         <div className="p-8 text-center text-slate-400 mt-10 text-sm font-medium">No messages found matching your search.</div>
                       )}
                    </ul>
                  </div>
                ) : (
                  <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4">
                     <Inbox className="w-12 h-12 text-slate-300" />
                     <p className="text-slate-500 font-medium">No messages found or parsed.</p>
                     <button onClick={() => setActiveTab('extract')} className="text-blue-600 font-semibold px-4 py-2 bg-blue-50 rounded-lg shadow-sm active:scale-95 transition-transform">Go to Extractor</button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'attachments' && (
              <motion.div 
                key="attachments"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col h-full bg-white relative overflow-hidden"
              >
                {!isPro ? (
                   <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-6">
                      <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 relative">
                        <Paperclip className="w-8 h-8" />
                        <Crown className="w-5 h-5 absolute -top-1 -right-1 text-amber-500 bg-white rounded-full p-0.5 shadow-sm" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Unlock Attachments</h2>
                        <p className="mt-2 text-slate-500 text-sm">Upgrade to Pro to extract and download all attachments directly from your MBOX file.</p>
                      </div>
                      <button onClick={() => setActiveTab('pro')} className="w-full bg-slate-900 text-white font-semibold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                        Upgrade Now
                      </button>
                   </div>
                ) : attachments.length > 0 ? (
                  <>
                    <div className="px-5 py-4 border-b border-slate-100 space-y-4 flex-shrink-0 bg-white z-10">
                      <div className="flex items-center justify-between">
                         <label className="flex items-center space-x-3 cursor-pointer">
                           <input type="checkbox" onChange={toggleAllAttachments} checked={attachments.length > 0 && attachments.every(a => selectedAttachments.has(a.filename))} className="w-5 h-5 rounded text-blue-600 border-slate-300" />
                           <span className="text-sm font-medium text-slate-700">Select All</span>
                         </label>
                         
                         <div className="relative overflow-hidden w-32 border border-slate-200 rounded-lg">
                           <select value={attachmentGroupBy} onChange={e => setAttachmentGroupBy(e.target.value as any)} className="w-full bg-slate-50 text-xs font-medium text-slate-600 outline-none cursor-pointer py-2 pl-2 pr-4 appearance-none">
                             <option value="none">No Grouping</option>
                             <option value="filename">Group: Extension</option>
                             <option value="mimeType">Group: Type</option>
                             <option value="sender">Group: Sender</option>
                             <option value="date">Group: Date</option>
                           </select>
                           <Search className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                         </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pb-28">
                      {attachmentGroupBy === 'none' ? (
                        <ul className="divide-y divide-slate-100">
                           {attachments.map((att, idx) => (
                             <label key={idx} className="flex items-center px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
                                <input type="checkbox" checked={selectedAttachments.has(att.filename)} onChange={() => toggleAttachmentSelection(att.filename)} className="w-5 h-5 rounded text-blue-600 border-slate-300 mr-4 flex-shrink-0" />
                                <div className="flex-1 min-w-0 pr-4">
                                   <div className="text-sm font-medium text-slate-900 truncate">{att.filename}</div>
                                   <div className="text-xs text-slate-500 mt-1 truncate">{att.sender || 'Unknown Sender'}</div>
                                </div>
                             </label>
                           ))}
                        </ul>
                      ) : (
                        <div className="divide-y-8 divide-slate-50">
                           {groupedAttachments.map(([groupName, groupAtts]) => (
                             <div key={groupName}>
                               <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                                 <span>{groupName}</span>
                                 <span>{groupAtts.length}</span>
                               </div>
                               <ul className="divide-y divide-slate-100">
                                 {groupAtts.map((att, idx) => (
                                   <label key={idx} className="flex items-center px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
                                      <input type="checkbox" checked={selectedAttachments.has(att.filename)} onChange={() => toggleAttachmentSelection(att.filename)} className="w-5 h-5 rounded text-blue-600 border-slate-300 mr-4 flex-shrink-0" />
                                      <div className="flex-1 min-w-0 pr-4">
                                         <div className="text-sm font-medium text-slate-900 truncate">{att.filename}</div>
                                         <div className="text-xs text-slate-400 mt-0.5 truncate">{att.sender || 'Unknown Sender'}</div>
                                      </div>
                                   </label>
                                 ))}
                               </ul>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>

                    {/* Floating Action Bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none flex justify-center pb-6 pt-12">
                       <button onClick={downloadAttachments} className="pointer-events-auto bg-slate-900 text-white px-8 py-3.5 rounded-full shadow-xl font-medium flex items-center active:scale-95 transition-transform">
                         <Download className="w-4 h-4 mr-2" />
                         Download ZIP ({selectedAttachments.size > 0 ? selectedAttachments.size : 'All'})
                       </button>
                    </div>
                  </>
                ) : (
                  <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4">
                     <Paperclip className="w-12 h-12 text-slate-300" />
                     <p className="text-slate-500 font-medium">No attachments extracted.</p>
                     <button onClick={() => setActiveTab('extract')} className="text-blue-600 font-semibold px-4 py-2 bg-blue-50 rounded-lg">Go to Extractor</button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'pro' && (
              <motion.div 
                key="pro"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex flex-col h-full p-6 pb-6 overflow-y-auto"
              >
                 <div className="text-center py-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/20 rotate-12">
                      <Crown className="w-8 h-8 text-white -rotate-12" />
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Pro Access</h2>
                    <p className="text-slate-500 max-w-[260px] mx-auto text-sm">Remove limits and unlock professional extraction tools.</p>
                 </div>

                 <div className="bg-white border-2 border-amber-500 rounded-3xl p-6 shadow-xl shadow-amber-500/10 mb-8 relative">
                    <div className="absolute top-0 right-6 -translate-y-1/2 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Popular
                    </div>
                    <div className="flex items-end mb-6">
                       <span className="text-4xl font-black text-slate-900">$9</span>
                       <span className="text-slate-500 font-medium mb-1 ml-1">.99 / mo</span>
                    </div>
                    <ul className="space-y-4 mb-8">
                       {[
                         'Unlimited email extraction',
                         'Process files larger than 50MB',
                         'Extract & download attachments',
                         'Advanced attachment grouping',
                         'Export to multiple formats'
                       ].map(feature => (
                         <li key={feature} className="flex items-start text-sm font-medium text-slate-700">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 mr-3 flex-shrink-0" />
                            {feature}
                         </li>
                       ))}
                    </ul>
                    <button 
                      onClick={() => setIsPro(!isPro)} 
                      className={cn(
                        "w-full font-bold py-4 rounded-xl shadow-lg transition-transform active:scale-95 text-center flex justify-center items-center",
                        isPro ? "bg-slate-100 text-slate-700 shadow-none border border-slate-200" : "bg-gradient-to-r from-amber-500 to-amber-600 text-white"
                      )}
                    >
                      {isPro ? 'Cancel Subscription' : 'Upgrade to Pro'}
                      {!isPro && <ChevronRight className="w-5 h-5 ml-1" />}
                    </button>
                    {isPro && (
                      <p className="text-amber-600 text-xs text-center font-semibold mt-4">You are currently on the Pro plan.</p>
                    )}
                 </div>
              </motion.div>
            )}

          </AnimatePresence>

        </div>

        {/* Bottom Tab Navigation */}
        <nav className="bg-white border-t border-slate-100 flex justify-between items-center z-20 flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 1rem)' }}>
           
           <button onClick={() => setActiveTab('extract')} className={cn("flex flex-1 flex-col items-center justify-center pt-3 pb-4 transition-colors", activeTab === 'extract' ? 'text-blue-600' : 'text-slate-400')}>
             <div className={cn("p-1.5 rounded-full mb-1 transition-colors", activeTab === 'extract' && 'bg-blue-50')}><UploadCloud className="w-6 h-6" /></div>
             <span className="text-[10px] font-semibold">Extract</span>
           </button>

           <button onClick={() => setActiveTab('emails')} className={cn("flex flex-1 flex-col items-center justify-center pt-3 pb-4 transition-colors", activeTab === 'emails' ? 'text-blue-600' : 'text-slate-400')}>
             <div className="relative">
               <div className={cn("p-1.5 rounded-full mb-1 transition-colors", activeTab === 'emails' && 'bg-blue-50')}><Mail className="w-6 h-6" /></div>
               {results.length > 0 && <span className="absolute 0 top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>}
             </div>
             <span className="text-[10px] font-semibold">Emails</span>
           </button>

           <button onClick={() => setActiveTab('messages')} className={cn("flex flex-1 flex-col items-center justify-center pt-3 pb-4 transition-colors", activeTab === 'messages' ? 'text-blue-600' : 'text-slate-400')}>
             <div className="relative">
               <div className={cn("p-1.5 rounded-full mb-1 transition-colors", activeTab === 'messages' && 'bg-blue-50')}><Inbox className="w-6 h-6" /></div>
               {messages.length > 0 && <span className="absolute 0 top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>}
             </div>
             <span className="text-[10px] font-semibold">Inbox</span>
           </button>

           <button onClick={() => setActiveTab('attachments')} className={cn("flex flex-1 flex-col items-center justify-center pt-3 pb-4 transition-colors", activeTab === 'attachments' ? 'text-blue-600' : 'text-slate-400')}>
              <div className="relative">
               <div className={cn("p-1.5 rounded-full mb-1 transition-colors", activeTab === 'attachments' && 'bg-blue-50')}><Paperclip className="w-6 h-6" /></div>
               {attachments.length > 0 && <span className="absolute 0 top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>}
             </div>
             <span className="text-[10px] font-semibold">Files</span>
           </button>

           <button onClick={() => setActiveTab('pro')} className={cn("flex flex-1 flex-col items-center justify-center pt-3 pb-4 transition-colors", activeTab === 'pro' ? 'text-amber-500' : 'text-slate-400')}>
             <div className={cn("p-1.5 rounded-full mb-1 transition-colors", activeTab === 'pro' && 'bg-amber-50')}><Crown className="w-6 h-6" /></div>
             <span className="text-[10px] font-semibold">Pro</span>
           </button>

        </nav>

      </div>
    </div>
  );
}
