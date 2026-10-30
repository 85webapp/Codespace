import { downloadBlob, shareFile, showToast, type ShareFileOptions, type ShareResult } from './pdfShare';

export { downloadBlob, shareFile, showToast };
export type { ShareFileOptions, ShareResult };

export interface ShareTextOptions { title?: string; text: string; url?: string; onStatus?: (message: string | null) => void; }

/** Native text/link sharing with clipboard fallback for unsupported browsers or cancelled dialogs. */
export async function shareTextOrLink(options: ShareTextOptions): Promise<'shared' | 'copied'> {
  const status = options.onStatus || showToast;
  const text = [options.text, options.url].filter(Boolean).join('\n');
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      if (navigator.canShare({ title: options.title, text, url: options.url })) {
        await navigator.share({ title: options.title, text, url: options.url });
        status('Shared successfully.');
        return 'shared';
      }
    } catch { /* Continue to clipboard fallback for cancellation and unsupported share targets. */ }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      status('Copied to clipboard');
      return 'copied';
    }
  } catch { /* Report a clear failure below. */ }
  status('Sharing and clipboard access are unavailable in this browser.');
  return 'copied';
}
