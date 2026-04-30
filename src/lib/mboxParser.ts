export interface ExtractedEmail {
  address: string;
  source: string; // From, To, Body, etc.
  date?: string; // Standardized ISO date if available
}

export interface ExtractedAttachment {
  filename: string;
  mimeType: string;
  data: string; // base64 string
  sender?: string;
  subject?: string;
  date?: string; // ISO date string
  size: number; // Size in bytes
  sourceFileId?: string;
}

export interface ParsedMessage {
  id: string;
  sender: string;
  subject: string;
  date: string | null;
  timestamp: number;
  body: string;
  htmlBody: string | null;
  attachmentCount: number;
  sourceFileId?: string;
}

export interface ExtractorOptions {
  removeDuplicates: boolean;
  extractAttachments: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  onProgress: (progress: number) => void;
}

export interface ExtractionResult {
  emails: string[];
  attachments: ExtractedAttachment[];
  messages: ParsedMessage[];
  totalEmailsFound: number;
}

export async function extractEmailsFromMbox(
  file: File,
  options: ExtractorOptions
): Promise<ExtractionResult> {
  return new Promise((resolve, reject) => {
    const chunkSize = 1024 * 1024 * 2; // 2MB chunks
    let offset = 0;
    const reader = new FileReader();

    const extractedEmails: Set<string> = new Set();
    const resultList: string[] = [];
    const parsedMessages: ParsedMessage[] = [];
    let totalEmailsFound = 0;
    
    const extractedAttachments: ExtractedAttachment[] = [];
    const attachmentNames: Set<string> = new Set();
    
    // Regex to find full email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    
    // Regex to find headers
    const dateRegex = /^Date:\s*(.+)$/im;
    const subjectRegex = /^Subject:\s*(.+)$/im;
    const fromRegex = /^From:?\s*([^<\r\n]+(?:<[^>\r\n]+>)?)/im;
    
    // Buffer to handle emails/dates split across chunks
    let leftover = '';
    let messageIdCounter = 0;

    reader.onload = (e) => {
      const text = leftover + (e.target?.result as string || '');
      
      const msgs = text.split(/^From\s/m);
      
      if (offset + chunkSize < file.size && msgs.length > 1) {
        leftover = 'From ' + msgs.pop();
      } else {
        leftover = '';
      }

      for (const msg of msgs) {
        if (!msg.trim()) continue;

        // Try to find the Date of this message
        const dateMatch = msg.match(dateRegex);
        let msgDate: Date | null = null;
        let dateString: string | null = null;
        let timestamp = 0;
        
        if (dateMatch && dateMatch[1]) {
          msgDate = new Date(dateMatch[1]);
          if (!isNaN(msgDate.getTime())) {
             dateString = msgDate.toISOString();
             timestamp = msgDate.getTime();
          }
        }
        
        const senderMatch = msg.match(fromRegex);
        let sender = 'Unknown Sender';
        if (senderMatch && senderMatch[1]) {
          sender = senderMatch[1].trim();
        }
        
        const subjectMatch = msg.match(subjectRegex);
        let subject = 'No Subject';
        if (subjectMatch && subjectMatch[1]) {
          subject = subjectMatch[1].trim();
        }

        // Apply Date Filtering
        if (msgDate && !isNaN(msgDate.getTime())) {
          if (options.dateFrom && msgDate < options.dateFrom) continue;
          if (options.dateTo && msgDate > options.dateTo) continue;
        } else if (options.dateFrom || options.dateTo) {
          // Skip if strict date filtering is on and no valid date is found
          continue;
        }

        // Extract emails
        const emails = msg.match(emailRegex);
        if (emails) {
          for (const email of emails) {
            totalEmailsFound++;
            const clean = email.toLowerCase();
            if (options.removeDuplicates) {
              if (!extractedEmails.has(clean)) {
                extractedEmails.add(clean);
                resultList.push(clean);
              }
            } else {
              resultList.push(clean);
            }
          }
        }
        
        // Try parsing body a bit
        let textBody = '';
        let htmlBody: string | null = null;
        let pAttachmentCount = 0;
        
        const contentTypeMatch = msg.match(/^Content-Type:\s*([^;\r\n]+)/im);
        let contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'text/plain';
        
        const headerBodySplitMatch = msg.match(/(?:\r?\n){2}/);
        if (headerBodySplitMatch) {
            const bodyIdx = headerBodySplitMatch.index! + headerBodySplitMatch[0].length;
            textBody = msg.substring(bodyIdx, bodyIdx + 1000) + (msg.length > bodyIdx + 1000 ? '...' : ''); // preview
        }

        // Extract Attachments
        if (options.extractAttachments) {
           const parts = msg.split(/--[A-Za-z0-9_.-]+/);
           for (const part of parts) {
             const dispositionMatch = part.match(/Content-Disposition:\s*(?:attachment|inline);\s*filename\*?=(?:UTF-8'')?"?([^"\r\n;]+)"?/i);
             const contentTypePartMatch = part.match(/Content-Type:\s*([^;\r\n]+)(?:;\s*name="?([^"\r\n;]+)"?)?/i);
             
             let filename = dispositionMatch ? dispositionMatch[1] : (contentTypePartMatch && contentTypePartMatch[2] ? contentTypePartMatch[2] : null);
             
             if (filename) {
               pAttachmentCount++;
               filename = filename.trim();
               
               const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
               const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '';
               
               if (encoding === 'base64') {
                 const mimeType = contentTypePartMatch ? contentTypePartMatch[1].trim() : 'application/octet-stream';
                 
                 const pHeaderBodySplitMatch = part.match(/(?:\r?\n){2}/);
                 if (pHeaderBodySplitMatch) {
                   const bodyIndex = pHeaderBodySplitMatch.index! + pHeaderBodySplitMatch[0].length;
                   const base64Data = part.substring(bodyIndex).replace(/[\r\n\s]/g, '');
                   
                   if (base64Data) {
                     let finalName = filename;
                     let counter = 1;
                     while (attachmentNames.has(finalName)) {
                       const extIdx = filename.lastIndexOf('.');
                       if (extIdx !== -1) {
                         finalName = `${filename.substring(0, extIdx)}_${counter}${filename.substring(extIdx)}`;
                       } else {
                         finalName = `${filename}_${counter}`;
                       }
                       counter++;
                     }
                     attachmentNames.add(finalName);
                     
                     extractedAttachments.push({
                       filename: finalName,
                       mimeType,
                       data: base64Data,
                       sender,
                       subject,
                       date: msgDate && !isNaN(msgDate.getTime()) ? msgDate.toISOString() : undefined,
                       size: Math.floor(base64Data.length * 0.75)
                     });
                   }
                 }
               }
             } else {
                 // Might be text/html part
                 const ctMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
                 if (ctMatch && ctMatch[1].trim().toLowerCase() === 'text/html') {
                     const pHeaderBodySplitMatch = part.match(/(?:\r?\n){2}/);
                     if (pHeaderBodySplitMatch) {
                         const bodyIndex = pHeaderBodySplitMatch.index! + pHeaderBodySplitMatch[0].length;
                         
                         const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
                         const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '';
                         let potentialHtml = part.substring(bodyIndex);
                         
                         if (encoding === 'quoted-printable') {
                             potentialHtml = potentialHtml.replace(/=\r?\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                         } else if (encoding === 'base64') {
                             try {
                               potentialHtml = atob(potentialHtml.replace(/[\r\n\s]/g, ''));
                             } catch(e) {}
                         }
                         
                         if (potentialHtml.trim().startsWith('<')) {
                             // Replace cid: references with transparent pixel to prevent broken images and export errors (like html2canvas / dom-to-image fetch issues)
                             htmlBody = potentialHtml.replace(/cid:[^"'>\s\)]+/gi, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                         }
                     }
                 } else if (ctMatch && ctMatch[1].trim().toLowerCase() === 'text/plain' && !textBody.trim()) {
                     const pHeaderBodySplitMatch = part.match(/(?:\r?\n){2}/);
                     if (pHeaderBodySplitMatch) {
                         const bodyIndex = pHeaderBodySplitMatch.index! + pHeaderBodySplitMatch[0].length;
                         textBody = part.substring(bodyIndex).trim();
                         if (textBody.length > 2000) textBody = textBody.substring(0, 2000) + '...';
                     }
                 }
             }
           }
        }
        
        parsedMessages.push({
            id: `msg-${messageIdCounter++}`,
            sender,
            subject,
            date: dateString,
            timestamp,
            body: textBody,
            htmlBody,
            attachmentCount: pAttachmentCount
        });
      }

      offset += chunkSize;
      options.onProgress(Math.min(100, Math.round((offset / file.size) * 100)));

      if (offset < file.size) {
        readNextChunk();
      } else {
        parsedMessages.sort((a, b) => b.timestamp - a.timestamp);
        resolve({ emails: resultList, attachments: extractedAttachments, messages: parsedMessages, totalEmailsFound });
      }
    };

    reader.onerror = () => reject(reader.error);

    function readNextChunk() {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsText(slice);
    }

    readNextChunk();
  });
}
