import { ExtractedAttachment, ExtractorOptions, ExtractionResult, ParsedMessage } from './mboxParser';
import emlformat from 'eml-format';

export async function extractEmailsFromEml(
  file: File,
  options: ExtractorOptions
): Promise<ExtractionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return reject(new Error("File empty"));

      emlformat.read(text, (error: any, data: any) => {
        if (error) return reject(error);

        const extractedEmails: Set<string> = new Set();
        const resultList: string[] = [];
        let totalEmailsFound = 0;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

        const addEmailsFromText = (str: string) => {
          if (!str) return;
          const emails = str.match(emailRegex);
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
        };

        addEmailsFromText(text);

        const extractedAttachments: ExtractedAttachment[] = [];
        let attachmentCount = 0;
        
        let sender = data.from ? (typeof data.from === 'string' ? data.from : data.from.email || data.from.name) : 'Unknown Sender';
        let msgDate: Date | null = null;
        let dateString: string | null = null;
        let timestamp = 0;
        
        if (data.headers && data.headers.Date) {
          msgDate = new Date(data.headers.Date);
          if (!isNaN(msgDate.getTime())) {
            dateString = msgDate.toISOString();
            timestamp = msgDate.getTime();
          }
        }

        // Check date filtering
        if (msgDate && !isNaN(msgDate.getTime())) {
          if (options.dateFrom && msgDate < options.dateFrom) {
            return resolve({ emails: [], attachments: [], messages: [], totalEmailsFound: 0 });
          }
          if (options.dateTo && msgDate > options.dateTo) {
            return resolve({ emails: [], attachments: [], messages: [], totalEmailsFound: 0 });
          }
        } else if (options.dateFrom || options.dateTo) {
          return resolve({ emails: [], attachments: [], messages: [], totalEmailsFound: 0 });
        }

        if (options.extractAttachments && data.attachments) {
          for (const att of data.attachments) {
            attachmentCount++;
            let base64Data = '';
            let size = 0;
            if (Buffer.isBuffer(att.data)) {
               base64Data = att.data.toString('base64');
               size = att.data.length;
            } else if (att.data && att.data.data) {
               base64Data = Buffer.from(att.data.data).toString('base64');
               size = Buffer.from(att.data.data).length;
            } else if (typeof att.data === 'string') {
               base64Data = Buffer.from(att.data, 'binary').toString('base64');
               size = base64Data.length * 0.75; // Approx
            }
            
            extractedAttachments.push({
              filename: att.name || 'unnamed',
              mimeType: att.mimeType || 'application/octet-stream',
              data: base64Data,
              sender,
              subject: data.subject || 'No Subject',
              date: dateString || undefined,
              size: Math.floor(size)
            });
          }
        }
        
        let htmlBody = typeof data.html === 'string' ? data.html : null;
        if (htmlBody) {
             htmlBody = htmlBody.replace(/cid:[^"'>\s\)]+/gi, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
        }

        const messages: ParsedMessage[] = [{
          id: `eml-1`,
          sender,
          subject: data.subject || 'No Subject',
          date: dateString,
          timestamp,
          body: typeof data.text === 'string' ? data.text : '',
          htmlBody,
          attachmentCount
        }];

        options.onProgress(100);
        resolve({ emails: resultList, attachments: extractedAttachments, messages, totalEmailsFound });
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
