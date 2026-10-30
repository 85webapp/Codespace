import html2pdf from 'html2pdf.js';

/* ------------------------------------------------------------------ */
/*  Shared PDF download + multi-app share helpers (Invoices & Reports) */
/* ------------------------------------------------------------------ */

export type StatusFn = (message: string | null) => void;

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: number | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
};

export interface BuildPdfOptions {
  /** Live DOM element to convert. It is cloned, the original is never touched. */
  element: HTMLElement;
  fileName: string;
  /** Layout width (CSS px) the clone is rendered at. A4 portrait ~ 794, A4 landscape ~ 1123. */
  widthPx?: number;
  orientation?: 'portrait' | 'landscape';
  /** Thermal roll: one tall page. */
  thermal?: boolean;
  /** Thermal roll width in mm (58 or 80). Default 80. */
  thermalWidthMm?: number;
  /** Regular paper size. Default a4. */
  pageSize?: 'a4' | 'a5' | 'letter';
  /** Print "Page x of y" at the bottom of every page (regular only). */
  pageNumbers?: boolean;
}

export interface ShareOptions {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
  onStatus?: StatusFn;
  /** Legacy compatibility only; this implementation never opens a tab. */
  pendingTab?: Window | null;
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded' | 'copied' | 'failed';

/* ----------------------------- small toast ----------------------------- */

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | undefined;

export const showToast: StatusFn = (message) => {
  if (typeof document === 'undefined') return;
  if (!message) {
    if (toastEl) toastEl.style.display = 'none';
    return;
  }
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('data-pdf-ignore', 'true');
    toastEl.style.cssText =
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;' +
      'background:rgba(15,23,42,.96);color:#fff;padding:10px 18px;border-radius:999px;' +
      'font:700 12px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:90vw;text-align:center;';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.display = 'none';
  }, 3500);
};

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Continue with the legacy browser fallback. */ }
  if (typeof document === 'undefined') return false;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  (document.body || document.documentElement).appendChild(field);
  field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  field.remove();
  return copied;
}

/* ------------------------ colour compatibility -------------------------- */
/* html2canvas cannot parse modern CSS colours (oklch, oklab, color-mix ...)
   which Tailwind v4 uses. Every colour is converted to plain rgb()/rgba(). */

const MODERN_COLOR = /(oklch|oklab|lab|lch|color-mix|color)\((?:[^()]|\([^()]*\))*\)/gi;

let colorCtx: CanvasRenderingContext2D | null = null;

function toRgb(value: string): string {
  try {
    if (!colorCtx) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      colorCtx = c.getContext('2d', { willReadFrequently: true });
    }
    if (!colorCtx) return 'rgb(0,0,0)';
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = '#000';
    colorCtx.fillStyle = value;
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  } catch {
    return 'rgb(0,0,0)';
  }
}

const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
  'fill',
  'stroke',
] as const;

const COMPOSITE_PROPS = ['boxShadow', 'textShadow', 'backgroundImage'] as const;

async function flattenModernColors(root: HTMLElement) {
  const nodes: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (let index = 0; index < nodes.length; index++) {
    const el = nodes[index];
    const cs = window.getComputedStyle(el);
    const style = el.style as any;
    for (const prop of COLOR_PROPS) {
      const v = (cs as any)[prop] as string;
      if (v && MODERN_COLOR.test(v)) style[prop] = toRgb(v);
      MODERN_COLOR.lastIndex = 0;
    }
    for (const prop of COMPOSITE_PROPS) {
      const v = (cs as any)[prop] as string;
      if (v && v !== 'none' && MODERN_COLOR.test(v)) {
        MODERN_COLOR.lastIndex = 0;
        style[prop] = v.replace(MODERN_COLOR, (m) => toRgb(m));
      }
      MODERN_COLOR.lastIndex = 0;
    }
    if (index > 0 && index % 120 === 0) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
}

/* --------------------------- PDF generation ----------------------------- */

const waitForImages = async (root: HTMLElement) => {
  await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const finish = () => resolve();
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
      // A broken/slow remote image must not hang export forever.
      window.setTimeout(finish, 8000);
    });
  }));
  if ('fonts' in document && document.fonts?.ready) {
    await Promise.race([document.fonts.ready.catch(() => undefined), new Promise<void>(r => window.setTimeout(r, 3000))]);
  }
}

/** Clone an element off-screen at a fixed width so the PDF looks the same on phone and desktop. */
async function prepareClone(element: HTMLElement, widthPx: number) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${widthPx}px;background:#fff;z-index:-1;pointer-events:none;`;

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-pdf-ignore], .sticky button, script').forEach((n) => n.remove());
  clone.removeAttribute('id');
  clone.style.cssText +=
    `;width:${widthPx}px;max-width:none;min-height:0;height:auto;max-height:none;margin:0;overflow:visible;` +
    'box-shadow:none;transform:none;animation:none;background:#fff;';
  clone.querySelectorAll<HTMLElement>('*').forEach((n) => {
    n.style.animation = 'none';
    n.style.transition = 'none';
  });
  clone.querySelectorAll<HTMLElement>('.sticky').forEach((n) => {
    n.style.position = 'static';
  });
  // Wide tables should never be clipped by their scroll wrapper.
  clone.querySelectorAll<HTMLElement>('[class*="overflow"]').forEach((n) => {
    n.style.overflow = 'visible';
    n.style.maxHeight = 'none';
  });

  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await withTimeout(waitForImages(clone), 12_000, 'Document images took too long to load.');
    await flattenModernColors(clone);
    return { host, clone };
  } catch (error) {
    host.remove();
    throw error;
  }
}

export async function buildPdf(opts: BuildPdfOptions): Promise<Blob> {
  const { element, thermal = false, orientation = 'portrait', pageSize = 'a4' } = opts;
  const thermalMm = opts.thermalWidthMm ?? 80;
  const portraitPx = pageSize === 'a5' ? 559 : pageSize === 'letter' ? 816 : 794;
  const landscapePx = pageSize === 'a5' ? 794 : pageSize === 'letter' ? 1056 : 1123;
  const widthPx = opts.widthPx ?? (thermal ? Math.round((thermalMm / 25.4) * 96) : orientation === 'landscape' ? landscapePx : portraitPx);
  const { host, clone } = await prepareClone(element, widthPx);
  try {
    const marginMm = thermal ? 2 : 8;
    let jsPDF: any = { unit: 'mm', format: pageSize, orientation };
    if (thermal) {
      const heightMm = Math.max(60, Math.ceil((clone.scrollHeight * 25.4) / 96) + marginMm * 2 + 2);
      jsPDF = { unit: 'mm', format: [thermalMm, heightMm], orientation: 'portrait' };
    }
    let worker = html2pdf()
      .set({
        margin: marginMm,
        filename: opts.fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: window.innerWidth < 640 ? 1.25 : Math.min(2, Math.max(1.5, (window.devicePixelRatio || 1) + 0.5)),
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: widthPx,
        },
        jsPDF,
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid-break', 'thead'], before: '.html2pdf__page-break' },
      })
      .from(clone);
    if (opts.pageNumbers && !thermal) {
      worker = worker
        .toPdf()
        .get('pdf')
        .then((pdf: any) => {
          const total = pdf.internal.getNumberOfPages();
          const w = pdf.internal.pageSize.getWidth();
          const h = pdf.internal.pageSize.getHeight();
          pdf.setFontSize(8);
          pdf.setTextColor(110);
          for (let i = 1; i <= total; i++) {
            pdf.setPage(i);
            pdf.text(`Page ${i} of ${total}`, w / 2, h - 3.5, { align: 'center' });
          }
        });
    }
    const blob: Blob = await withTimeout(worker.outputPdf('blob'), 45_000, 'PDF rendering timed out. Please try a smaller report.');
    return blob;
  } finally {
    host.remove();
  }
}

/** Render a DOM element to a PNG Blob for native file sharing without data URLs. */
export async function buildPngBlob(element: HTMLElement, widthPx = 794): Promise<Blob> {
  const { host, clone } = await prepareClone(element, widthPx);
  try {
    const canvas = await renderElementCanvas(clone, widthPx);
    return await canvasToPngBlob(canvas);
  } finally { host.remove(); }
}

async function renderElementCanvas(element: HTMLElement, widthPx: number): Promise<HTMLCanvasElement> {
  const scale = window.innerWidth < 640 ? 1.25 : 1.75;
  try {
    const html2canvas = (await import('html2canvas')).default;
    return await withTimeout(html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: widthPx,
    }), 35_000, 'Image rendering timed out. Please try again.');
  } catch (error) {
    console.warn('html2canvas failed; trying html2pdf canvas rendering.', error);
    const fallback = html2pdf()
      .set({ html2canvas: { scale, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0, windowWidth: widthPx } })
      .from(element)
      .toCanvas()
      .get('canvas');
    return withTimeout(fallback, 35_000, 'Image rendering timed out. Please try again.');
  }
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    try {
      return await withTimeout(new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png');
      }), 15_000, 'Image encoding timed out.');
    } catch (error) {
      console.warn('Canvas Blob encoding failed; trying data URL encoding.', error);
    }
  }
  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Unable to encode image data.');
  return response.blob();
}

/** Same clean render as the PDF, returned as a PNG data URL (legacy compatibility). */
export async function buildPng(element: HTMLElement, widthPx = 794): Promise<string> {
  const { host, clone } = await prepareClone(element, widthPx);
  try {
    const canvas = await renderElementCanvas(clone, widthPx);
    return canvas.toDataURL('image/png');
  } finally {
    host.remove();
  }
}

/* ------------------------------ download -------------------------------- */

/** Shared, mobile-safe Blob download and native file-sharing primitives. */
const safeFileName = (name: string, extension = '') => {
  const cleaned = (name || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'document';
  return extension && !cleaned.toLowerCase().endsWith(extension.toLowerCase()) ? `${cleaned}${extension}` : cleaned;
};

/**
 * Trigger a download from an in-memory Blob without navigating or opening a tab.
 *
 * IMPORTANT: keep the object URL alive long enough for Android Chrome and mobile
 * WebViews to start consuming it. Revoking it on the next task (0ms) can cancel
 * a download before the browser has opened the Blob, which looks like a button
 * that does nothing on phones. The delayed cleanup is intentionally shared by
 * every JSON/PDF export so all download buttons follow the same behavior.
 */
export function downloadBlob(blob: Blob, fileName: string): boolean {
  const payload = blob.type ? blob : new Blob([blob], { type: 'application/octet-stream' });
  const safeName = safeFileName(fileName);
  if (typeof document === 'undefined') {
    showToast('Downloads are unavailable in this environment.');
    return false;
  }
  const fallbackToDataUrl = () => {
    if (typeof FileReader === 'undefined') {
      showToast('Download could not start because this browser does not support file downloads.');
      return false;
    }
    let reader: FileReader;
    try { reader = new FileReader(); } catch {
      showToast('The file could not be prepared for download.');
      return false;
    }
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        showToast('The file could not be prepared for download.');
        return;
      }
      try {
        const fallbackAnchor = document.createElement('a');
        fallbackAnchor.href = dataUrl;
        fallbackAnchor.download = safeName;
        fallbackAnchor.rel = 'noopener';
        document.body.appendChild(fallbackAnchor);
        fallbackAnchor.click();
        fallbackAnchor.remove();
        showToast('File download started.');
      } catch {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (clipboard?.writeText) {
          void clipboard.writeText(dataUrl).then(
            () => showToast('Download is unavailable. The file data URL was copied.'),
            () => showToast('Download and clipboard access are unavailable in this browser.')
          );
        } else {
          showToast('Download and clipboard access are unavailable in this browser.');
        }
      }
    };
    reader.onerror = () => showToast('The file could not be prepared for download.');
    try { reader.readAsDataURL(payload); } catch { showToast('The file could not be prepared for download.'); }
    return true;
  };
  const legacyNavigator = typeof navigator !== 'undefined'
    ? navigator as Navigator & { msSaveOrOpenBlob?: (data: Blob, name: string) => boolean }
    : null;
  if (legacyNavigator?.msSaveOrOpenBlob) {
    try {
      legacyNavigator.msSaveOrOpenBlob(payload, safeName);
      return true;
    } catch { fallbackToDataUrl(); return true; }
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    fallbackToDataUrl();
    return true;
  }
  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(payload);
  } catch {
    fallbackToDataUrl();
    return true;
  }
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = safeName;
  anchor.rel = 'noopener';
  anchor.style.position = 'fixed';
  anchor.style.left = '-10000px';
  anchor.style.top = '0';
  anchor.style.width = '1px';
  anchor.style.height = '1px';
  anchor.style.opacity = '0';
  anchor.setAttribute('aria-hidden', 'true');
  (document.body || document.documentElement).appendChild(anchor);
  try {
    // A connected anchor with a filename is the most compatible Blob download
    // mechanism for Android Chrome and desktop browsers.
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    fallbackToDataUrl();
    return true;
  } finally {
    anchor.remove();
    // Do not revoke at 0ms: some mobile browsers begin reading the Blob later.
    // One minute is short enough to avoid leaking URLs but gives downloads time
    // to initialize, including larger invoice/report PDFs on slower phones.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
  return true;
}

export function downloadPdf(blob: Blob, fileName: string): void {
  const name = safeFileName(fileName, '.pdf');
  downloadBlob(new Blob([blob], { type: 'application/pdf' }), name);
}

export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  downloadBlob(blob, safeFileName(fileName, '.json'));
}

export async function shareJson(data: unknown, fileName: string, title: string, text: string, onStatus: StatusFn = showToast): Promise<ShareResult> {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  return shareFile({ blob, fileName, title, text, mimeType: 'application/json', extension: '.json', onStatus });
}

export function downloadGeoJson(data: unknown, fileName: string): boolean {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return downloadBlob(new Blob([json], { type: 'application/geo+json;charset=utf-8' }), safeFileName(fileName, '.geojson'));
}

export async function shareGeoJson(data: unknown, fileName: string, title: string, text: string, onStatus: StatusFn = showToast): Promise<ShareResult> {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return shareFile({
    blob: new Blob([json], { type: 'application/geo+json;charset=utf-8' }),
    fileName,
    title,
    text,
    mimeType: 'application/geo+json',
    extension: '.geojson',
    onStatus,
  });
}

export const canNativeShareFiles = (file?: File): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (!file) return false;
  if (typeof navigator.canShare !== 'function') return true;
  try { return navigator.canShare({ files: [file] }); } catch { return false; }
};

export function openPendingTab(): Window | null { return null; }

export function printElementFallback(element: HTMLElement | null, onStatus: StatusFn = showToast): boolean {
  if (!element || typeof window.print !== 'function' || typeof document === 'undefined') {
    onStatus('PDF generation failed and browser printing is unavailable.');
    return false;
  }
  const printNode = element.id === 'printable-invoice' ? element : element.cloneNode(true) as HTMLElement;
  const isClone = printNode !== element;
  if (isClone) {
    printNode.id = 'printable-invoice';
    printNode.setAttribute('data-sheet-mode', 'regular');
    printNode.setAttribute('data-print-fallback', 'true');
    printNode.querySelectorAll('[data-pdf-ignore], button').forEach((node) => node.remove());
    document.body.appendChild(printNode);
  }
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', cleanup);
    if (isClone) printNode.remove();
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(cleanup, 120_000);
  onStatus('PDF export failed. Use “Save as PDF” in the print dialog.');
  try {
    window.print();
    return true;
  } catch (error) {
    cleanup();
    console.error('Browser print fallback failed:', error);
    onStatus('PDF export and browser print fallback both failed.');
    return false;
  }
}

export interface ShareFileOptions {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
  mimeType?: string;
  extension?: string;
  onStatus?: StatusFn;
}

/** Share a generated file through the OS share sheet; any unsupported/cancelled/failed share downloads it. */
export async function shareFile(opts: ShareFileOptions): Promise<ShareResult> {
  const status = opts.onStatus || showToast;
  const mimeType = opts.mimeType || opts.blob.type || 'application/octet-stream';
  const fileName = safeFileName(opts.fileName, opts.extension || '');
  const blob = new Blob([opts.blob], { type: mimeType });
  let file: File | null = null;
  try {
    if (typeof File !== 'undefined') file = new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
  } catch { file = null; }

  if (file && canNativeShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text });
      status('Share sheet completed. Check the selected app to confirm the file was sent.');
      return 'shared';
    } catch (error) {
      // Cancellation is not a failure and must not be reported as a successful share.
      if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') {
        status('Sharing cancelled. No file was sent.');
        return 'cancelled';
      }
      console.warn('Native file sharing failed; starting download fallback.', error);
    }
  }

  const downloaded = downloadBlob(blob, fileName);
  if (downloaded) {
    status('File sharing is unavailable. A file download was started.');
    return 'downloaded';
  }
  try {
    const dataUrl = await withTimeout(new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('File conversion failed.'));
      reader.onerror = () => reject(new Error('File conversion failed.'));
      reader.readAsDataURL(blob);
    }), 15_000, 'File conversion timed out.');
    if (await copyTextToClipboard(dataUrl)) {
      status('File download is unavailable. File data URL copied successfully.');
      return 'copied';
    }
  } catch (error) {
    console.warn('File-to-clipboard fallback failed.', error);
  }
  status('Sharing, download, and clipboard are unavailable in this browser.');
  return 'failed';
}

export async function sharePdf(opts: ShareOptions): Promise<ShareResult> {
  return shareFile({
    blob: opts.blob,
    fileName: safeFileName(opts.fileName, '.pdf'),
    title: opts.title,
    text: opts.text,
    mimeType: 'application/pdf',
    extension: '.pdf',
    onStatus: opts.onStatus,
  });
}


export async function downloadImage(element: HTMLElement, fileName: string, widthPx = 1000): Promise<void> {
  const blob = await buildPngBlob(element, widthPx);
  downloadBlob(new Blob([blob], { type: 'image/png' }), safeFileName(fileName, '.png'));
}

export async function shareImage(opts: Omit<ShareFileOptions, 'mimeType' | 'extension'>): Promise<ShareResult> {
  return shareFile({ ...opts, mimeType: 'image/png', extension: '.png' });
}

/** Download a remote document as a Blob rather than navigating to a URL. */
export async function downloadUrlAsBlob(url: string, fileName: string, mimeType?: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error(`File download failed (${response.status}).`);
    const remoteBlob = await response.blob();
    const blob = new Blob([remoteBlob], { type: mimeType || remoteBlob.type || 'application/octet-stream' });
    downloadBlob(blob, fileName);
  } finally {
    window.clearTimeout(timeout);
  }
}

/* --------------------------- report helpers ----------------------------- */

export const REPORT_ROOT_ID = 'report-export-root';

export const REPORT_TITLES: Record<string, string> = {
  sale_report: 'Sale Report',
  purchase_report: 'Purchase Report',
  day_book: 'Day Book',
  all_transactions: 'All Transactions',
  bill_wise_profit: 'Bill Wise Profit',
  profit_and_loss: 'Profit and Loss',
  cashflow: 'Cash Flow',
  balance_sheet: 'Balance Sheet',
  trial_balance: 'Trial Balance',
  party_statement: 'Party Ledger',
  party_wise_profit: 'Party Wise Profit and Loss',
  all_parties_report: 'All Parties',
  sale_purchase_by_party: 'Sale Purchase By Party',
  gst_report: 'GST Report',
  rcm_account: 'RCM Account',
  tax_ledger: 'Tax Ledger',
  brs_statement: 'BRS Statement',
  audit_log: 'Audit Log',
  journal_ledger: 'Journal Ledger',
};

const safeName = (s: string) => s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

export async function runReportExport(
  mode: 'download' | 'share',
  reportId: string | null,
  companyName?: string,
  onStatus: StatusFn = showToast
) {
  const root = document.getElementById(REPORT_ROOT_ID);
  if (!root || !reportId) {
    onStatus('Open a report first');
    return;
  }
  const title = REPORT_TITLES[reportId] || 'Report';
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${safeName(title)}_${stamp}.pdf`;
  try {
    onStatus('Preparing PDF...');
    const blob = await buildPdf({ element: root, fileName });
    if (mode === 'download') {
      downloadPdf(blob, fileName);
      onStatus('PDF downloaded successfully.');
      return;
    }
    const text = `${title}${companyName ? ` - ${companyName}` : ''} (${stamp}). Please find the attached document.`;
    await sharePdf({ blob, fileName, title, text, onStatus });
  } catch (err) {
    console.error('Report export failed:', err);
    printElementFallback(root, onStatus);
  }
}


// Simple one-page detail PDF (used where there is no on-screen document, e.g. a purchase or e-way bill record).
export async function buildDetailsPdfBlob(title: string, rows: [string, string][]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfText = (value: unknown) => String(value ?? '-')
    .replace(/₹/g, 'INR ')
    .replace(/[•·]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  const drawHeading = () => {
    page.drawText(pdfText(title), { x: 40, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.2) });
    y -= 14;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: rgb(0.7, 0.7, 0.75) });
    y -= 26;
  };
  drawHeading();
  for (const [k, v] of rows) {
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 790;
      drawHeading();
    }
    page.drawText(pdfText(k), { x: 40, y, size: 10, font: bold, color: rgb(0.3, 0.3, 0.35) });
    page.drawText(pdfText(v).slice(0, 70), { x: 200, y, size: 10, font });
    y -= 20;
  }
  const bytes = await withTimeout(doc.save(), 20_000, 'PDF export timed out. Please try again.');
  const blobBytes = new Uint8Array(bytes.length);
  blobBytes.set(bytes);
  return new Blob([blobBytes.buffer], { type: 'application/pdf' });
}

export async function downloadDetailsPdf(title: string, rows: [string, string][], fileName: string) {
  try {
    const blob = await buildDetailsPdfBlob(title, rows);
    downloadPdf(blob, fileName);
  } catch (error) {
    console.error('Details PDF export failed:', error);
    showToast('PDF could not be created. Please try again.');
  }
}
