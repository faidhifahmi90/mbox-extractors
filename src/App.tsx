import React, { useState, useRef, useMemo, useDeferredValue } from 'react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { UploadCloud, FileType, CheckCircle2, Download, Settings, Loader2, Search, Paperclip, Crown, Mail, ChevronRight, Inbox, Eye, Calendar, User, AlignLeft, FileText, Lock, X } from 'lucide-react';
import { extractEmailsFromMbox, ExtractedAttachment, ParsedMessage, ExtractionResult } from './lib/mboxParser';
import { extractEmailsFromEml } from './lib/emlParser';
import { extractEmailsFromPST } from './lib/pstParser';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import MiniSearch from 'minisearch';

import { checkTrialUsed, markTrialUsed } from './lib/deviceTracking';

import { loadRazorpayScript } from './lib/razorpay';

import { PolicyModal } from './components/PolicyModal';

const BrandLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="url(#brand-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <defs>
      <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f97316" /> {/* orange-500 */}
        <stop offset="50%" stopColor="#ec4899" /> {/* pink-500 */}
        <stop offset="100%" stopColor="#6366f1" /> {/* indigo-500 */}
      </linearGradient>
    </defs>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 6l9 6 9-6" />
    <path d="M14 14l7 7m0-5v5h-5" />
  </svg>
);

export function cn(...inputs: ClassValue[]) {

  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'extract' | 'emails' | 'attachments' | 'messages' | 'pro'>('extract');
  const [userPlan, setUserPlan] = useState<'free' | 'day-pass' | 'monthly' | 'yearly'>('free');
  const [passExpiry, setPassExpiry] = useState<number | null>(null);
  const [hasUsedTrial, setHasUsedTrial] = useState<boolean>(false);
  const [region, setRegion] = useState<'MY_SG' | 'ROW' | null>(null);
  const [policyType, setPolicyType] = useState<'EULA' | 'TERMS' | 'PRIVACY' | 'REFUND' | null>(null);

  React.useEffect(() => {
    checkTrialUsed().then(used => {
      setHasUsedTrial(used);
    });

    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.country_code === 'MY' || data.country_code === 'SG') {
          setRegion('MY_SG');
        } else {
          setRegion('ROW');
        }
      })
      .catch(() => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz === 'Asia/Kuala_Lumpur' || tz === 'Asia/Singapore' || tz === 'Asia/Kuching') {
          setRegion('MY_SG');
        } else {
          setRegion('ROW');
        }
      });
  }, []);
  
  const isMYSG = region === 'MY_SG';

  const handleUpgrade = async (plan: 'day-pass' | 'monthly' | 'yearly') => {
    const prices = {
      'day-pass': 39.90,
      'monthly': 15.89,
      'yearly': 119.89
    };
    
    // 1. Load Razorpay Script
    const res = await loadRazorpayScript('https://checkout.razorpay.com/v1/checkout.js');
    if (!res) {
      alert('Failed to load Razorpay SDK. Are you online?');
      return;
    }

    // 2. Create Order on backend
    let order: any;
    try {
      const resp = await fetch('/api/create-order', {
        method: 'POST',
        headers: {
           'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: prices[plan], currency: 'MYR' })
      });
      if (!resp.ok) {
         throw new Error(await resp.text());
      }
      order = await resp.json();
    } catch (e) {
      console.error(e);
      alert('Payment initialization failed. Have you set the RAZORPAY_KEY ID/SECRET in your environment?');
      return;
    }

    // 3. Setup Razorpay options
    const options = {
      key: order.key_id || '', // Provided by our backend
      amount: order.amount.toString(),
      currency: order.currency,
      name: "iLyF Email Recovery & Extractor",
      description: `Subscription: ${plan}`,
      image: "https://example.com/your_logo", // Optional
      order_id: order.id,
      handler: function (response: any) {
         // 4. On success, activate plan
         setUserPlan(plan);
         if (plan === 'day-pass') {
            setPassExpiry(Date.now() + 24 * 60 * 60 * 1000);
         } else {
            setPassExpiry(null);
         }
         alert(`Payment successful via Curlec! Welcome to the ${plan} plan.`);
         setActiveTab('extract');
      },
      prefill: {
         name: "Customer Name",
         email: "customer@example.com",
         contact: ""
      },
      theme: {
         color: "#0f172a" // Tailwind slate-900
      }
    };

    // 5. Open checkout
    // @ts-ignore
    const rzp1 = new window.Razorpay(options);
    rzp1.on('payment.failed', function (response: any){
            alert('Payment Failed: ' + response.error.description);
    });
    rzp1.open();
  };

  const getPlanDisplay = () => {
    if (userPlan === 'day-pass' && passExpiry) {
      const ms = Math.max(0, passExpiry - Date.now());
      const remainingHours = Math.floor(ms / (1000 * 60 * 60));
      const remainingMinutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      if (remainingHours > 0) return `Day Pass (${remainingHours}h ${remainingMinutes}m left)`;
      return `Day Pass (${remainingMinutes}m left)`;
    }
    if (userPlan === 'monthly') return 'Pro (Monthly)';
    if (userPlan === 'yearly') return 'Pro (Yearly)';
    return 'Free Tier';
  };

  const isPro = userPlan !== 'free';

  interface UploadedFileNode {
    id: string;
    file: File;
    customName: string;
    parsed: boolean;
  }

  interface ExtractedRecord {
    id: string;
    originalName: string;
    customName: string;
    size: number;
    emails: string[];
    attachments: ExtractedAttachment[];
    messages: ParsedMessage[];
  }

  const [fileNodes, setFileNodes] = useState<UploadedFileNode[]>([]);
  const [extractedRecords, setExtractedRecords] = useState<ExtractedRecord[]>([]);
  const [activeFileIds, setActiveFileIds] = useState<Set<string>>(new Set());
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Settings
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [extractAttachments, setExtractAttachments] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { results, attachments, messages, totalEmailsFound, hasAnyMessages, hasAnyAttachments } = useMemo(() => {
    const recordsToUse = activeFileIds.size > 0 ? extractedRecords.filter(r => activeFileIds.has(r.id)) : extractedRecords;
    let allEmails = new Set<string>();
    let allEmailsWithDupes: string[] = [];
    let allAttachments: ExtractedAttachment[] = [];
    let allMessages: ParsedMessage[] = [];
    let tCount = 0;
    
    for (const r of recordsToUse) {
      r.emails.forEach(e => {
         allEmails.add(e);
         allEmailsWithDupes.push(e);
      });
      allAttachments = allAttachments.concat(r.attachments);
      allMessages = allMessages.concat(r.messages);
      tCount += r.emails.length;
    }
    
    const parseLocalDate = (dateStr: string, isEndOfDay: boolean) => {
       if (!dateStr) return isEndOfDay ? Infinity : 0;
       const [y, m, d] = dateStr.split('-').map(Number);
       return new Date(y, m - 1, d, isEndOfDay ? 23 : 0, isEndOfDay ? 59 : 0, isEndOfDay ? 59 : 0, isEndOfDay ? 999 : 0).getTime();
    };
    
    const dFrom = parseLocalDate(dateFrom, false);
    const dTo = parseLocalDate(dateTo, true);

    let filteredMessages = allMessages;
    let filteredAttachments = allAttachments;

    if (dateFrom || dateTo) {
      filteredMessages = allMessages.filter(m => {
         if (!m.timestamp) return true;
         return m.timestamp >= dFrom && m.timestamp <= dTo;
      });

      filteredAttachments = allAttachments.filter(a => {
         if (!a.date) return true;
         const t = new Date(a.date).getTime();
         if (isNaN(t)) return true;
         return t >= dFrom && t <= dTo;
      });
    }

    // Sort messages descending by date
    filteredMessages.sort((a, b) => {
       const t1 = a.date ? new Date(a.date).getTime() : 0;
       const t2 = b.date ? new Date(b.date).getTime() : 0;
       return t2 - t1;
    });

    const finalResults = removeDuplicates ? Array.from(allEmails) : allEmailsWithDupes;
    return { results: finalResults, attachments: filteredAttachments, messages: filteredMessages, totalEmailsFound: tCount, hasAnyMessages: allMessages.length > 0, hasAnyAttachments: allAttachments.length > 0 };
  }, [extractedRecords, activeFileIds, removeDuplicates, dateFrom, dateTo]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ParsedMessage | null>(null);
  
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
  const [attachmentGroupBy, setAttachmentGroupBy] = useState<'none' | 'filename' | 'mimeType' | 'sender' | 'date'>('none');
  
  const [outputFormat, setOutputFormat] = useState('CSV');
  const [fileNamingConvention, setFileNamingConvention] = useState<'default' | 'sender' | 'subject' | 'date'>('default');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);

  const resetState = () => {
    setFileNodes([]);
    setExtractedRecords([]);
    setActiveFileIds(new Set());
    setSelectedMessage(null);
    setSelectedEmails(new Set());
    setSelectedAttachments(new Set());
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const processAppendedFiles = (filesToAppend: File[]) => {
    if (filesToAppend.length === 0) {
      alert("No valid files to add.");
      return;
    }
    const totalSize = fileNodes.reduce((acc, n) => acc + n.file.size, 0) + filesToAppend.reduce((acc, f) => acc + f.size, 0);
    if (!isPro && totalSize > 50 * 1024 * 1024) {
      alert("Free tier limits total file size to 50MB. Upgrade to Pro for unlimited sizes.");
      setActiveTab('pro');
      return;
    }
    const newNodes = filesToAppend.map(f => ({
       id: Math.random().toString(36).substring(2, 9),
       file: f,
       customName: f.name,
       parsed: false
    }));
    setFileNodes(prev => [...prev, ...newNodes]);
    setSelectedMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files) as File[];
      processAppendedFiles(selectedFiles);
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validFiles = (Array.from(e.target.files) as File[]).filter(f => {
         const lower = f.name.toLowerCase();
         return lower.endsWith('.mbox') || lower.endsWith('.eml') || lower.endsWith('.pst') || lower.endsWith('.txt');
      });
      processAppendedFiles(validFiles);
    }
  };

  const getPdfDocumentTitle = () => {
    if (!selectedMessage) return 'email';
    let filename = `email_${selectedMessage.id}`;
    if (fileNamingConvention === 'sender' && selectedMessage.sender) {
        filename = selectedMessage.sender;
    } else if (fileNamingConvention === 'subject' && selectedMessage.subject) {
        filename = selectedMessage.subject;
    } else if (fileNamingConvention === 'date' && selectedMessage.date) {
        filename = new Date(selectedMessage.date).toISOString().split('T')[0];
    }
    return filename.replace(/[^a-zA-Z0-9.\-_ \(\)]/g, '_');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const exportMessageToPDF = async () => {
    if (!messageContentRef.current) return;
    try {
      const canvas = await html2canvas(messageContentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${getPdfDocumentTitle()}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF', error);
      alert('Failed to export PDF.');
    }
  };

  const handleExtract = async () => {
    const unparsedNodes = fileNodes.filter(n => !n.parsed);
    if (unparsedNodes.length === 0) return;
    
    if (!isPro) {
       if (hasUsedTrial) {
          alert('Your device has already used the trial version (Free Tier). Please subscribe to continue using the application.');
          setActiveTab('pro');
          return;
       }
       await markTrialUsed();
       setHasUsedTrial(true);
    }
    
    setIsProcessing(true);
    setProgress(0);

    try {
      const options = {
        removeDuplicates: false,
        extractAttachments: true,
        onProgress: (p: number) => {}, // Handled per file
      };

      const newRecords: ExtractedRecord[] = [];

      for (let i = 0; i < unparsedNodes.length; i++) {
          const node = unparsedNodes[i];
          const f = node.file;
          // Local progress handler for individual files
          const localProgress = (p: number) => {
              const fileWeight = 100 / unparsedNodes.length;
              const completedProgress = i * fileWeight;
              const currentFileProgress = (p / 100) * fileWeight;
              setProgress(Math.round(completedProgress + currentFileProgress));
          };
          const fileOptions = { ...options, onProgress: localProgress };

          let extracted: ExtractionResult;
          const lowerName = f.name.toLowerCase();
          if (lowerName.endsWith('.eml')) {
              extracted = await extractEmailsFromEml(f, fileOptions);
          } else if (lowerName.endsWith('.pst')) {
              extracted = await extractEmailsFromPST(f, fileOptions);
          } else {
              extracted = await extractEmailsFromMbox(f, fileOptions);
          }
          
          newRecords.push({
            id: node.id,
            originalName: f.name,
            customName: node.customName,
            size: f.size,
            emails: Array.from(extracted.emails), // It maps or just takes it
            attachments: extracted.attachments.map(a => ({ ...a, sourceFileId: node.id })),
            messages: extracted.messages.map(m => ({ ...m, sourceFileId: node.id }))
          });
      }
      
      setExtractedRecords(prev => [...prev, ...newRecords]);
      setFileNodes(prev => prev.map(n => unparsedNodes.some(un => un.id === n.id) ? { ...n, parsed: true } : n));
      
      setProgress(100);
      
      const hasEmails = newRecords.some(r => r.emails.length > 0);
      const hasMessages = newRecords.some(r => r.messages.length > 0);
      const hasAttachments = newRecords.some(r => r.attachments.length > 0);

      // Auto switch tabs on the first extraction
      if (extractedRecords.length === 0) {
        if (hasEmails) {
          setActiveTab('emails');
        } else if (hasMessages) {
          setActiveTab('messages');
        } else if (hasAttachments) {
          setActiveTab('attachments');
        }
      }
      
    } catch (error) {
      console.error('Error extracting data:', error);
      alert('Failed to parse file. Please ensure it is a valid supported file (.mbox, .eml, .pst).');
    } finally {
      setIsProcessing(false);
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredMessageSearchQuery = useDeferredValue(messageSearchQuery);

  const filteredResults = useMemo(() => {
    if (!deferredSearchQuery) return results;
    return results.filter(email => email.toLowerCase().includes(deferredSearchQuery.toLowerCase()));
  }, [results, deferredSearchQuery]);

  const miniSearch = useMemo(() => {
    const searcher = new MiniSearch({
      fields: ['subject', 'sender', 'date', 'body'],
      storeFields: ['id'],
      searchOptions: {
        boost: { subject: 2, sender: 1.5, body: 1 },
        fuzzy: 0.2
      }
    });
    // Add all messages to the index
    if (messages.length > 0) {
      searcher.addAll(messages.map(m => ({
        id: m.id,
        subject: m.subject || '',
        sender: m.sender || '',
        date: m.date || '',
        body: m.body || ''
      })));
    }
    return searcher;
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (!deferredMessageSearchQuery) return messages;
    const searchResults = miniSearch.search(deferredMessageSearchQuery);
    const matchedIds = new Set(searchResults.map(res => res.id));
    // Provide fallback simple check if no results from MiniSearch
    if (matchedIds.size === 0) {
       return messages.filter(m => 
          (m.subject?.toLowerCase() || '').includes(deferredMessageSearchQuery.toLowerCase()) || 
          (m.sender?.toLowerCase() || '').includes(deferredMessageSearchQuery.toLowerCase()) ||
          (m.date || '').includes(deferredMessageSearchQuery)
        );
    }
    return messages.filter(m => matchedIds.has(m.id));
  }, [messages, miniSearch, deferredMessageSearchQuery]);

  const visibleMessages = filteredMessages;

  const isMessageLocked = (msg: ParsedMessage) => !isPro && messages.indexOf(msg) >= 5;

  const baseList = searchQuery ? filteredResults : results;
  const itemsToExportEmails = selectedEmails.size > 0 
    ? baseList.filter(e => selectedEmails.has(e))
    : baseList;

  // rough estimate: email string length + 2 bytes per line break
  const totalEmailsExportSize = itemsToExportEmails.reduce((acc, email) => acc + email.length + 2, 0);

  const downloadResults = () => {
    if (results.length === 0) return;
    
    if (itemsToExportEmails.length === 0) return;

    if (!isPro && itemsToExportEmails.length > 5) {
       alert(`Free tier allows exporting up to 5 email addresses at once (Selected: ${itemsToExportEmails.length}). Please select fewer addresses or upgrade to Pro.`);
       setActiveTab('pro');
       return;
    }
    
    let content = '';
    let mimeType = 'text/plain';
    let extension = 'txt';

    if (outputFormat === 'CSV') {
      content = 'Email Address\n' + itemsToExportEmails.map(e => `"${e}"`).join('\n');
      mimeType = 'text/csv';
      extension = 'csv';
    } else if (outputFormat === 'VCF') {
      content = itemsToExportEmails.map(e => `BEGIN:VCARD\nVERSION:3.0\nEMAIL:${e}\nEND:VCARD`).join('\n');
      mimeType = 'text/vcard';
      extension = 'vcf';
    } else {
      content = itemsToExportEmails.join('\n');
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

  const itemsToExportAtch = selectedAttachments.size > 0
    ? attachments.filter(a => selectedAttachments.has(a.filename))
    : attachments;
  
  const totalAttachmentsExportSize = itemsToExportAtch.reduce((acc, att) => acc + (att.size || 0), 0);
  
  const downloadAttachments = async () => {
    if (attachments.length === 0) return;

    if (itemsToExportAtch.length === 0) return;

    if (!isPro) {
      if (totalAttachmentsExportSize > 5 * 1024 * 1024) {
        alert(`Free tier allows downloading up to 5MB of attachments at once (Selected: ${formatSize(totalAttachmentsExportSize)}). Please select fewer files or upgrade to Pro.`);
        setActiveTab('pro');
        return;
      }
    }

    setIsProcessing(true);
    try {
      const zip = new JSZip();
      itemsToExportAtch.forEach(att => {
        let path = att.filename;
        const clean = (s: string) => s.replace(/[^a-zA-Z0-9.\-_ \(\)]/g, '_');
        
        if (fileNamingConvention === 'sender' && att.sender) {
            path = `${clean(att.sender)}/${att.filename}`;
        } else if (fileNamingConvention === 'subject' && att.subject) {
            path = `${clean(att.subject)}/${att.filename}`;
        } else if (fileNamingConvention === 'date' && att.date) {
            const dateStr = new Date(att.date).toISOString().split('T')[0];
            path = `${dateStr}/${att.filename}`;
        }

        zip.file(path, att.data, { base64: true });
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
    <div className="bg-slate-950 min-h-screen flex flex-col items-center justify-center sm:p-6 md:p-12">
      {/* Responsive Container styling */}
      <div className="w-full h-[100dvh] sm:h-[85vh] max-w-full sm:max-w-3xl md:max-w-5xl lg:max-w-6xl bg-slate-50 relative flex flex-col sm:rounded-3xl shadow-2xl overflow-hidden ring-1 ring-slate-900/10 transition-all duration-300">
        
        {/* Dynamic header area per tab */}
        <div className="bg-white px-6 pt-12 pb-4 shadow-sm z-10 flex-shrink-0 flex justify-between items-center relative gap-2">
          <div className="flex items-center">
            {activeTab === 'extract' && <BrandLogo className="w-5 h-5 mr-1.5" />}
            <h1 className="text-xl font-bold tracking-tight text-slate-900 capitalize">
              {activeTab === 'extract' ? 'iLyFExtractor' : activeTab}
            </h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
             <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded select-none shrink-0 border border-slate-200 shadow-sm whitespace-nowrap">
               {getPlanDisplay()}
             </span>
             {activeTab === 'emails' && results.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-1 rounded shrink-0 whitespace-nowrap">
                  {results.length} found
                </span>
             )}
             {activeTab === 'attachments' && attachments.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-1 rounded shrink-0 whitespace-nowrap">
                  {attachments.length} files
                </span>
             )}
          </div>
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
                
                <div className="flex flex-col items-center justify-center space-y-4 mt-2">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept=".mbox,.txt,.eml,.pst" className="hidden" />
                  <input type="file" ref={folderInputRef} onChange={handleFolderChange} {...({ webkitdirectory: "true", directory: "true" } as any)} className="hidden" />
                  
                  <div className="grid grid-cols-2 gap-4 w-full">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 aspect-square max-h-40 border-2 border-dashed border-slate-300 rounded-2xl bg-white flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all shadow-sm active:scale-95"
                    >
                      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                        <FileType className="w-6 h-6" />
                      </div>
                      <span className="font-semibold text-slate-800">Select Files</span>
                      <span className="text-xs text-slate-500 mt-1">MBOX, EML, PST</span>
                    </div>
                    <div 
                      onClick={() => folderInputRef.current?.click()}
                      className="flex-1 aspect-square max-h-40 border-2 border-dashed border-slate-300 rounded-2xl bg-white flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all shadow-sm active:scale-95"
                    >
                      <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3">
                        <Inbox className="w-6 h-6" />
                      </div>
                      <span className="font-semibold text-slate-800">Select Folder</span>
                      <span className="text-xs text-slate-500 mt-1">Batch Process</span>
                    </div>
                  </div>

                  {fileNodes.length > 0 && (
                     <div className="w-full space-y-3 mt-4">
                       <div className="flex items-center justify-between px-1">
                         <span className="text-xs font-bold text-slate-500 uppercase">Uploaded Files ({fileNodes.length})</span>
                         <button onClick={resetState} className="text-xs font-bold text-red-500 hover:text-red-700">Clear All</button>
                       </div>
                       <ul className="space-y-2">
                       {fileNodes.map(node => (
                           <li key={node.id} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                             <div className="flex flex-col min-w-0 flex-1 mr-3">
                                <span className="font-medium text-sm text-slate-800 truncate">{node.customName}</span>
                                <span className="text-[11px] text-slate-400">{(node.file.size/1024/1024).toFixed(2)} MB • {node.parsed ? <span className="text-emerald-500 font-semibold">Parsed</span> : <span className="text-amber-500 font-semibold">Pending</span>}</span>
                             </div>
                             {(userPlan === 'monthly' || userPlan === 'yearly') && (
                                <button onClick={() => {
                                   const newName = prompt('Rename file:', node.customName);
                                   if (newName) setFileNodes(prev => prev.map(n => n.id === node.id ? {...n, customName: newName} : n))
                                }} className="text-[11px] mr-2 text-blue-600 bg-blue-50 px-2 py-1.5 rounded-md font-semibold active:scale-95 transition-transform">Rename</button>
                             )}
                             <button onClick={() => {
                               setFileNodes(prev => prev.filter(n => n.id !== node.id));
                               setExtractedRecords(prev => prev.filter(r => r.id !== node.id));
                               setActiveFileIds(prev => {
                                 const next = new Set(prev);
                                 next.delete(node.id);
                                 return next;
                               });
                             }} className="text-slate-400 hover:text-red-500 p-1"><X className="w-4 h-4" /></button>
                           </li>
                       ))}
                       </ul>
                     </div>
                  )}

                  {!isPro && (
                     <div className="bg-blue-50 text-blue-800 text-xs px-4 py-3 rounded-lg mb-6 flex items-start border border-blue-100 w-full mt-4">
                        <CheckCircle2 className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                        <div>
                      Free tier limits extraction to 500 emails max and file size to 50MB. 
                      Upgrade to unlock unlimited processing and exports.
                        </div>
                     </div>
                  )}
                </div>

                  <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-2">Options</h2>

                  <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col space-y-2">
                     <div className="flex items-center justify-between">
                       <span className="block font-medium text-slate-800">Export Naming</span>
                       <span className="text-xs text-slate-500">For PDFs and Attachments</span>
                     </div>
                     <select 
                       value={fileNamingConvention}
                       onChange={(e) => setFileNamingConvention(e.target.value as any)}
                       className="w-full mt-2 p-2 text-sm bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500"
                     >
                       <option value="default">Default (email_id)</option>
                       <option value="sender">Sender Name</option>
                       <option value="subject">Subject Line</option>
                       <option value="date">Date Sent</option>
                     </select>
                  </div>
                </div>

                <div className="pt-2 pb-6 space-y-4">
                  <button
                    onClick={handleExtract}
                    disabled={isProcessing || fileNodes.filter(n => !n.parsed).length === 0}
                    className={cn(
                      "w-full bg-blue-600 active:bg-blue-700 text-white font-semibold py-4 rounded-2xl shadow-lg transition-transform flex items-center justify-center",
                      (isProcessing || fileNodes.filter(n => !n.parsed).length === 0) ? "opacity-50 cursor-not-allowed" : "active:scale-95"
                    )}
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Extracting {progress}%</>
                    ) : (
                      'Start Extraction'
                    )}
                  </button>
                  {fileNodes.length > 0 && (results.length > 0 || attachments.length > 0) && (
                    <button onClick={resetState} className="w-full bg-slate-200 text-slate-700 font-semibold py-4 rounded-2xl active:bg-slate-300 transition-colors">
                      Clear Data
                    </button>
                  )}
                  <p className="text-xs text-center text-slate-400 px-4 mt-4 flex flex-col items-center gap-1">
                    <span className="font-semibold text-slate-500">100% Local Processing</span>
                    All processing happens entirely in your browser. No sensitive email content is ever uploaded to external servers.
                  </p>
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
                      <div className="flex flex-col space-y-3">
                         <div className="flex items-center justify-between">
                           <label className="flex items-center space-x-2 cursor-pointer">
                             <input type="checkbox" onChange={toggleAllFilteredEmails} checked={filteredResults.length > 0 && filteredResults.every(e => selectedEmails.has(e))} className="w-4 h-4 rounded text-blue-600 border-slate-300" />
                             <span className="text-sm font-medium text-slate-700">Select All</span>
                           </label>
                           
                           <select value={outputFormat} onChange={e => setOutputFormat(e.target.value)} className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer">
                             <option value="CSV">CSV</option>
                             <option value="TXT">TXT</option>
                             <option value="VCF">VCF</option>
                           </select>
                         </div>
                         <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" checked={removeDuplicates} onChange={(e) => setRemoveDuplicates(e.target.checked)} className="w-4 h-4 rounded text-blue-600 border-slate-300" />
                            <span className="text-sm font-medium text-slate-700">Remove Duplicates</span>
                         </label>
                      </div>
                    </div>
                    
                    <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 md:divide-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:p-4 pb-28">
                       {filteredResults.map((email, idx) => (
                         <label key={idx} className="flex items-center px-5 py-4 md:py-3 md:px-4 md:border md:border-slate-100 md:rounded-xl md:shadow-sm bg-white hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
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
                         Download {selectedEmails.size > 0 ? selectedEmails.size : 'All'} ({formatSize(totalEmailsExportSize)})
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
                ) : hasAnyMessages ? (
                  <div className="flex flex-col h-full bg-white">
                    <div className="px-5 py-4 border-b border-slate-100 space-y-4 flex-shrink-0 bg-white z-10">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search content, subject, sender..." 
                          value={messageSearchQuery}
                          onChange={(e) => setMessageSearchQuery(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent focus:bg-white rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                      
                      <div className="flex space-x-3">
                         <div className="flex-1">
                           <label className="text-[10px] uppercase text-slate-400 font-semibold mb-1 block">From Date</label>
                           <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full p-2 text-xs bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500" />
                         </div>
                         <div className="flex-1">
                           <label className="text-[10px] uppercase text-slate-400 font-semibold mb-1 block">To Date</label>
                           <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full p-2 text-xs bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500" />
                         </div>
                      </div>

                      {!isPro && messages.length > 5 && (
                         <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100/50 p-2.5 rounded-xl font-medium text-center flex items-center justify-center cursor-pointer active:scale-95 transition-transform" onClick={() => setActiveTab('pro')}>
                            <Crown className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                            Free tier shows top 5. Upgrade to see all {messages.length}.
                         </div>
                      )}
                    </div>
                    
                    <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 md:divide-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3 md:p-4 pb-20">
                       {visibleMessages.length === 0 && (
                         <li className="p-8 text-center text-slate-500 font-medium col-span-full">No messages found for the selected dates or search query.</li>
                       )}
                       {visibleMessages.map((msg, idx) => {
                         const locked = isMessageLocked(msg);
                         return (
                         <li key={msg.id} onClick={() => { if (locked) { setActiveTab('pro'); } else { setSelectedMessage(msg); } }} className={cn("px-5 py-4 md:py-3 md:px-4 md:border md:border-slate-100 md:rounded-xl md:shadow-sm bg-white flex flex-col hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100 relative", locked && "opacity-60")}>
                            {locked && <div className="absolute top-4 right-5 text-amber-500"><Lock className="w-4 h-4"/></div>}
                            <div className="flex justify-between items-start mb-1.5 gap-2">
                               <span className="text-sm font-bold text-slate-900 line-clamp-1 flex-1">{msg.sender}</span>
                               <span className={cn("text-xs font-medium text-slate-400 flex-shrink-0 mt-0.5", locked && "mr-6")}>{msg.date ? new Date(msg.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-700 line-clamp-1 mb-1.5">{msg.subject || 'No Subject'}</div>
                            <div className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed">{msg.body}</div>
                            {msg.attachmentCount > 0 && <div className="mt-3 text-[10px] font-bold tracking-wider bg-slate-100 self-start px-2 py-1 rounded-md text-slate-500 flex items-center uppercase"><Paperclip className="w-3 h-3 mr-1" /> {msg.attachmentCount} Attachment(s)</div>}
                         </li>
                         );
                       })}
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
                {hasAnyAttachments ? (
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

                      <div className="flex space-x-3">
                         <div className="flex-1">
                           <label className="text-[10px] uppercase text-slate-400 font-semibold mb-1 block">From Date</label>
                           <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full p-2 text-xs bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500" />
                         </div>
                         <div className="flex-1">
                           <label className="text-[10px] uppercase text-slate-400 font-semibold mb-1 block">To Date</label>
                           <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full p-2 text-xs bg-slate-50 rounded-lg border border-slate-200 outline-none focus:border-blue-500" />
                         </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pb-28">
                      {attachments.length === 0 && (
                        <div className="p-8 text-center text-slate-500 font-medium">No files found for the selected dates.</div>
                      )}
                      {attachmentGroupBy === 'none' ? (
                        <ul className="divide-y divide-slate-100 md:divide-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:px-4">
                           {attachments.map((att, idx) => (
                             <label key={idx} className="flex items-center px-5 py-4 md:py-3 md:px-4 md:border md:border-slate-100 md:rounded-xl md:shadow-sm bg-white hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
                                <input type="checkbox" checked={selectedAttachments.has(att.filename)} onChange={() => toggleAttachmentSelection(att.filename)} className="w-5 h-5 rounded text-blue-600 border-slate-300 mr-4 flex-shrink-0" />
                                <div className="flex-1 min-w-0 pr-4">
                                   <div className="text-sm font-medium text-slate-900 truncate">{att.filename}</div>
                                   <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                     <span className="truncate">{att.sender || 'Unknown Sender'}</span>
                                     <span className="w-1 h-1 bg-slate-300 rounded-full flex-shrink-0"></span>
                                     <span className="font-medium flex-shrink-0 text-slate-400">{formatSize(att.size || 0)}</span>
                                   </div>
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
                               <ul className="divide-y divide-slate-100 md:divide-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:p-4">
                                 {groupAtts.map((att, idx) => (
                                   <label key={idx} className="flex items-center px-5 py-3 md:py-3 md:px-4 md:border md:border-slate-100 md:rounded-xl md:shadow-sm bg-white hover:bg-slate-50 transition-colors cursor-pointer active:bg-slate-100">
                                      <input type="checkbox" checked={selectedAttachments.has(att.filename)} onChange={() => toggleAttachmentSelection(att.filename)} className="w-5 h-5 rounded text-blue-600 border-slate-300 mr-4 flex-shrink-0" />
                                      <div className="flex-1 min-w-0 pr-4">
                                         <div className="text-sm font-medium text-slate-900 truncate">{att.filename}</div>
                                         <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                                           <span className="truncate">{att.sender || 'Unknown Sender'}</span>
                                           <span className="w-1 h-1 bg-slate-300 rounded-full flex-shrink-0"></span>
                                           <span className="font-medium text-slate-500">{formatSize(att.size || 0)}</span>
                                         </div>
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
                         Download ZIP ({selectedAttachments.size > 0 ? selectedAttachments.size : 'All'} - {formatSize(totalAttachmentsExportSize)})
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
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Build Your Forever Library</h2>
                    <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed mt-2">
                       Don't just unzip your emails—carry 20 years of email history in your pocket, searchable instantly without internet.
                    </p>
                 </div>

                 {isPro ? (
                   <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center mb-6 shadow-sm">
                     <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                     </div>
                     <h3 className="text-xl font-bold text-slate-900 mb-2">Active Subscription</h3>
                     <p className="text-emerald-700 font-medium text-lg mb-1">{getPlanDisplay()}</p>
                     <button onClick={() => setUserPlan('free')} className="text-sm font-semibold text-slate-500 mt-6 px-6 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm active:scale-95">Cancel Subscription</button>
                   </div>
                 ) : (
                   <div className="space-y-4 mb-6">
                      {/* One Time Pass */}
                      <div className="bg-white border-2 border-slate-200 hover:border-amber-300 rounded-3xl p-5 shadow-sm transition-colors cursor-pointer">
                         <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-slate-900 text-lg">24-Hour Pass</h3>
                            <div className="text-xl font-black text-slate-900">{isMYSG ? 'RM39' : '$17'}<span className="text-sm font-bold text-slate-500">.{isMYSG ? '90' : '99'}</span></div>
                         </div>
                         <p className="text-sm border-b border-slate-100 pb-3 mb-3 text-slate-500 leading-relaxed text-left">Perfect for a work, account auditing, court case, or immigration need today.</p>
                         <ul className="space-y-2 mb-4">
                            <li className="flex items-center text-xs font-medium text-slate-700">
                               <CheckCircle2 className="w-4 h-4 text-amber-500 mr-2 flex-shrink-0" /> Unlock all features for 24 hours
                            </li>
                         </ul>
                            <button onClick={() => handleUpgrade('day-pass')} className="w-full font-bold py-2.5 rounded-xl bg-slate-900 text-white shadow-md active:scale-95 transition-transform text-sm">
                             Get 24-Hour Access via Curlec
                           </button>
                      </div>

                      {/* Monthly */}
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-500 rounded-3xl p-5 shadow-xl shadow-amber-500/10 relative cursor-pointer">
                         <div className="absolute top-0 right-5 -translate-y-1/2 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                           Most Popular
                         </div>
                         <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-slate-900 text-lg">Monthly Pro</h3>
                            <div className="flex items-end">
                              <span className="text-2xl font-black text-slate-900">{isMYSG ? 'RM15' : '$5'}<span className="text-base text-slate-600">.{isMYSG ? '89' : '99'}</span></span>
                              <span className="text-xs text-slate-500 font-medium ml-1 mb-1.5">/mo</span>
                            </div>
                         </div>
                         <p className="text-sm border-b border-amber-200/50 pb-3 mb-3 text-amber-800 leading-relaxed text-left">Best for researchers or project-based work requiring full extraction capabilities.</p>
                         <ul className="space-y-2.5 mb-5 mt-2">
                            {[
                              'Unlimited email extraction & parsing',
                              'Process batch folders > 50MB',
                              'Export all attachments at once',
                              'Generate offline PDFs of emails',
                              'Instant full-text offline search'
                            ].map(feature => (
                              <li key={feature} className="flex items-start text-xs font-medium text-amber-900">
                                 <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0" />
                                 {feature}
                              </li>
                            ))}
                         </ul>
                            <button onClick={() => handleUpgrade('monthly')} className="w-full font-bold py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg active:scale-95 transition-transform text-sm flex items-center justify-center">
                             Subscribe via Curlec <ChevronRight className="w-4 h-4 ml-1" />
                           </button>
                      </div>

                      {/* Yearly */}
                      <div className="bg-white border-2 border-slate-200 hover:border-amber-300 rounded-3xl p-5 shadow-sm transition-colors cursor-pointer">
                         <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-slate-900 text-lg">Yearly Pro</h3>
                            <div className="flex items-end">
                              <span className="text-xl font-black text-slate-900">{isMYSG ? 'RM119' : '$39'}<span className="text-sm text-slate-600">.{isMYSG ? '89' : '99'}</span></span>
                              <span className="text-xs text-slate-500 font-medium ml-1 md:mb-0.5">/yr</span>
                            </div>
                         </div>
                         <p className="text-sm text-slate-500 leading-relaxed mb-4 text-left">Best for professionals (lawyers, journalists, accountants) who handle archives regularly.</p>
                            <button onClick={() => handleUpgrade('yearly')} className="w-full font-bold py-2.5 rounded-xl bg-slate-100 text-slate-800 shadow-sm hover:bg-slate-200 active:scale-95 transition-transform text-sm">
                             Subscribe via Curlec
                           </button>
                      </div>
                   </div>
                 )}

                 {/* Policy Links */}
                 <div className="mt-8 mb-4 border-t border-slate-100 pt-6">
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs font-semibold text-slate-400">
                       <button onClick={() => setPolicyType('TERMS')} className="hover:text-amber-600 transition-colors relative after:content-[''] after:absolute after:-right-3.5 after:top-1/2 after:-translate-y-1/2 after:w-1 after:h-1 after:bg-slate-300 after:rounded-full last:after:hidden">Terms of Use</button>
                       <button onClick={() => setPolicyType('PRIVACY')} className="hover:text-amber-600 transition-colors relative after:content-[''] after:absolute after:-right-3.5 after:top-1/2 after:-translate-y-1/2 after:w-1 after:h-1 after:bg-slate-300 after:rounded-full last:after:hidden">Privacy Policy</button>
                       <button onClick={() => setPolicyType('EULA')} className="hover:text-amber-600 transition-colors relative after:content-[''] after:absolute after:-right-3.5 after:top-1/2 after:-translate-y-1/2 after:w-1 after:h-1 after:bg-slate-300 after:rounded-full last:after:hidden">EULA</button>
                       <button onClick={() => setPolicyType('REFUND')} className="hover:text-amber-600 transition-colors relative">Refund Policy</button>
                    </div>
                    <p className="text-center text-[10px] text-slate-400 mt-6">&copy; 2026 Syncwealth Sdn Bhd. All rights reserved.</p>
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

        <PolicyModal policyType={policyType} onClose={() => setPolicyType(null)} />
      </div>
    </div>
  );
}
