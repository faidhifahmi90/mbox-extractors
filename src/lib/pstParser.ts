import { ExtractedAttachment, ExtractorOptions, ExtractionResult, ParsedMessage } from './mboxParser';
import { PSTFile, PSTFolder, PSTMessage, PSTAttachment } from 'pst-extractor';

export async function extractEmailsFromPST(
  file: File,
  options: ExtractorOptions
): Promise<ExtractionResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const buffer = await file.arrayBuffer();
      // To work with pst-extractor we have to convert ArrayBuffer to Buffer
      const nodeBuffer = Buffer.from(buffer);
      
      const pstFile = new PSTFile(nodeBuffer);
      const rootFolder = pstFile.getRootFolder();
      
      const extractedEmails: Set<string> = new Set();
      const resultList: string[] = [];
      let totalEmailsFound = 0;
      
      const extractedAttachments: ExtractedAttachment[] = [];
      const messages: ParsedMessage[] = [];
      
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      let messageIdCounter = 0;

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

      const processFolder = (folder: PSTFolder) => {
        if (folder.contentCount > 0) {
          let email: PSTMessage | null = folder.getNextChild();
          while (email != null) {
            
            const sender = email.senderName ? email.senderName : email.senderEmailAddress;
            const subject = email.subject || 'No Subject';
            const body = email.body || '';
            const htmlBody = email.bodyHTML || null;
            const msgDate = email.clientSubmitTime || email.creationTime;
            
            let dateString: string | null = null;
            let timestamp = 0;
            if (msgDate) {
              dateString = msgDate.toISOString();
              timestamp = msgDate.getTime();
            }
            
            // Text mining for emails
            addEmailsFromText(email.transportMessageHeaders);
            addEmailsFromText(body);
            if (htmlBody) addEmailsFromText(htmlBody);

            let skip = false;
            if (msgDate && !isNaN(msgDate.getTime())) {
              if (options.dateFrom && msgDate < options.dateFrom) skip = true;
              if (options.dateTo && msgDate > options.dateTo) skip = true;
            } else if (options.dateFrom || options.dateTo) {
               skip = true;
            }

            if (!skip) {
              let pAttachmentCount = 0;
              if (options.extractAttachments && email.numberOfAttachments > 0) {
                  for (let i = 0; i < email.numberOfAttachments; i++) {
                      try {
                          const attach = email.getAttachment(i);
                          if (attach) {
                            pAttachmentCount++;
                            let filename = attach.filename || attach.longFilename || `attachment_${i}`;
                            const fileStream = attach.fileInputStream;
                            if (fileStream) {
                                // Assuming we can read whole stream
                                const size = attach.size;
                                const buf = Buffer.alloc(Math.max(size, 1024));
                                let bytesRead = 0;
                                const chunks: Buffer[] = [];
                                do {
                                    bytesRead = fileStream.read(buf);
                                    if (bytesRead > 0) {
                                        chunks.push(Buffer.from(buf.slice(0, bytesRead)));
                                    }
                                } while (bytesRead > 0);
                                
                                const finalBuf = Buffer.concat(chunks);
                                extractedAttachments.push({
                                    filename,
                                    mimeType: attach.mimeTag || 'application/octet-stream',
                                    data: finalBuf.toString('base64'),
                                    sender: sender,
                                    subject: subject,
                                    date: dateString || undefined,
                                    size: finalBuf.length
                                });
                            }
                          }
                      } catch (e) {
                          console.error('Error extracting PST attachment', e);
                      }
                  }
              }

              let finalHtmlBody = htmlBody;
              if (finalHtmlBody) {
                  finalHtmlBody = finalHtmlBody.replace(/cid:[^"'>\s\)]+/gi, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
              }

              messages.push({
                id: `pst-msg-${messageIdCounter++}`,
                sender: sender || 'Unknown Sender',
                subject,
                date: dateString,
                timestamp,
                body,
                htmlBody: finalHtmlBody,
                attachmentCount: pAttachmentCount
              });
            }
            email = folder.getNextChild();
          }
        }

        if (folder.hasSubfolders) {
          const childFolders = folder.getSubFolders();
          for (const childFolder of childFolders) {
            processFolder(childFolder);
          }
        }
      };

      processFolder(rootFolder);
      
      messages.sort((a, b) => b.timestamp - a.timestamp);
      options.onProgress(100);
      resolve({ emails: resultList, attachments: extractedAttachments, messages, totalEmailsFound });

    } catch (e) {
      reject(e);
    }
  });
}
