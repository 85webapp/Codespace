import { copyTextToClipboard, downloadBlob, shareFile, showToast, type ShareFileOptions, type ShareResult } from './pdfShare';

export { downloadBlob, shareFile, showToast };
export type { ShareFileOptions, ShareResult };

export interface ShareTextOptions { title?: string; text: string; url?: string; onStatus?: (message: string | null) => void; }

/** Native text/link sharing with clipboard fallback for unsupported browsers. */
export async function shareTextOrLink(options: ShareTextOptions): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const status = options.onStatus || showToast;
  const text = [options.text, options.url].filter(Boolean).join('\n');
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: options.title, text, url: options.url });
      status('Shared successfully.');
      return 'shared';
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') {
        status('Sharing cancelled.');
        return 'cancelled';
      }
    }
  }
  const copied = await copyTextToClipboard(text);
  status(copied ? 'Link/data copied successfully.' : 'Sharing and clipboard are unavailable in this browser.');
  return copied ? 'copied' : 'failed';
}
