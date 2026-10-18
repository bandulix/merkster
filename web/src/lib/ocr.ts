/* Photo / PDF import: preprocessing, on-device OCR (Tesseract.js, vendored), PDF text layer,
   and AI extraction via the server (POST /api/ai/extract – the LLM key never reaches the browser). */
import type { DraftRow, ExtractResult, Test } from '../../../shared/types';
import { LANGS } from '../i18n';
import { api, ApiError } from './api';
import { linesText, orient, parseGeneral, parseWords, type Header, type OcrWord } from './parse';
import { loadScript } from './util';
import { APP_SLUG } from '../../../shared/brand';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { Tesseract?: any } }
type PdfJs = { getDocument: (src: object) => { promise: Promise<any> }; GlobalWorkerOptions: { workerSrc: string } };
let pdfJsPromise: Promise<PdfJs> | null = null;
/** PDF.js 4 as a same-origin module. JavaScript inside a PDF stays disabled. */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfJsPromise) pdfJsPromise = import(
    /* @vite-ignore */
    // The file is copied into web/public/vendor by scripts/vendor.mjs. It is not a TypeScript module.
    // @ts-expect-error vendor asset
    '/vendor/pdfjs/pdf.min.mjs'
  ).then(mod => {
    const lib = (mod as { getDocument?: PdfJs['getDocument'] }).getDocument ? mod as PdfJs : (mod as { default: PdfJs }).default;
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return lib;
  });
  return pdfJsPromise;
}
type Src = ImageBitmap | HTMLImageElement | HTMLCanvasElement;
export interface Status { stage: 'load' | 'prep' | 'ocr' | 'ai' | 'pdf'; page?: number; of?: number; progress?: number; name?: string }
export interface ImportResult { rows: DraftRow[]; thumbs: string[]; method: 'ai' | 'ocr'; unreadable: string[]; unused: number; swapped: boolean; aiError: string | null; header: Header | null; orientConfidence?: number; pictureDropped?: number }
type Page = { kind: 'photo'; src: Src } | { kind: 'text'; words: OcrWord[]; canvas: HTMLCanvasElement } | { kind: 'image'; canvas: HTMLCanvasElement };

const abs = (p: string) => new URL(p, location.origin).href;
let worker: any = null, workerLangs = '', progressCb: ((m: any) => void) | null = null;

async function getWorker(langs: string) {
  if (!window.Tesseract) await loadScript('/vendor/tesseract/tesseract.min.js');
  if (worker && workerLangs === langs) return worker;
  if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }
  worker = await window.Tesseract.createWorker(langs.split('+'), 1, {
    workerPath: abs('/vendor/tesseract/worker.min.js'), corePath: abs('/vendor/tesseract/core'),
    langPath: abs('/vendor/lang'), gzip: true, workerBlobURL: false,
    logger: (m: any) => progressCb?.(m)
  });
  workerLangs = langs;
  return worker;
}
export async function terminate() { if (worker) { try { await worker.terminate(); } catch { /* ignore */ } worker = null; workerLangs = ''; } }

async function fileToImage(file: File): Promise<Src> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img; }
}
const dims = (s: Src): [number, number] => [(s as HTMLImageElement).naturalWidth || s.width, (s as HTMLImageElement).naturalHeight || s.height];
function scaledCanvas(src: Src, maxSide: number) {
  const [sw, sh] = dims(src), k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const toDataURL = (src: Src, max: number, q: number) => scaledCanvas(src, max).toDataURL('image/jpeg', q);
const toBlob = (src: Src, max: number, q: number) => new Promise<Blob>((res, rej) => scaledCanvas(src, max).toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', q));

/** grayscale + background flattening (phone shadows) + contrast stretch */
export function preprocess(src: Src): HTMLCanvasElement {
  const [sw, sh] = dims(src);
  let k = Math.min(1, 2400 / Math.max(sw, sh));
  if (Math.max(sw, sh) * k < 2000) k = 2000 / Math.max(sw, sh);   // Tesseract likes ~30 px capitals
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const g = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  const T = Math.max(24, Math.round(Math.max(w, h) / 60));
  const tw = Math.ceil(w / T), th = Math.ceil(h / T), bg = new Float32Array(tw * th);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    let mx = 0, cnt = 0; const hist = new Uint32Array(64);
    for (let y = ty * T; y < Math.min(h, (ty + 1) * T); y += 2) for (let x = tx * T; x < Math.min(w, (tx + 1) * T); x += 2) { hist[g[y * w + x] >> 2]++; cnt++; }
    let acc = 0; for (let b = 63; b >= 0; b--) { acc += hist[b]; if (acc >= cnt * 0.1) { mx = b * 4 + 2; break; } }
    bg[ty * tw + tx] = Math.max(mx, 40);
  }
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(th - 1, Math.max(0, y / T - 0.5)), y0 = Math.floor(fy), y1 = Math.min(th - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(tw - 1, Math.max(0, x / T - 0.5)), x0 = Math.floor(fx), x1 = Math.min(tw - 1, x0 + 1), wx = fx - x0;
      const b = (bg[y0 * tw + x0] * (1 - wx) + bg[y0 * tw + x1] * wx) * (1 - wy) + (bg[y1 * tw + x0] * (1 - wx) + bg[y1 * tw + x1] * wx) * wy;
      const v = Math.min(255, g[y * w + x] / b * 255);
      g[y * w + x] = v; hist[v | 0]++;
    }
  }
  let lo = 0, acc = 0; for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.005) break; }
  const span = Math.max(30, 250 - lo);
  for (let i = 0, j = 0; j < n; i += 4, j++) { const v = Math.max(0, Math.min(255, (g[j] - lo) / span * 255)); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return removeRulings(deskew(c));
}

/** estimate the skew of text lines / table rulings (±6°) from the horizontal projection profile */
export function skewAngle(gray: Uint8ClampedArray | Float32Array, w: number, h: number, stride = 4): number {
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (gray[(y * w + x) * stride] < 110) { xs.push(x); ys.push(y); }
  if (xs.length < 200) return 0;
  const score = (deg: number) => {
    const t = Math.tan(deg * Math.PI / 180), bins = new Float64Array(h + w);
    for (let i = 0; i < xs.length; i++) { const r = Math.floor((ys[i] - xs[i] * t) / 2) + w; if (r >= 0 && r < bins.length) bins[r]++; }   // 2-px bins: the sampling grid is 2 px, too
    let sq = 0; for (let i = 0; i < bins.length; i++) sq += bins[i] * bins[i];
    return sq;
  };
  let best = 0, bestS = -1;
  for (let a = -6; a <= 6.001; a += 0.5) { const sc = score(a); if (sc > bestS) { bestS = sc; best = a; } }
  const c0 = best;
  for (let a = c0 - 0.45; a <= c0 + 0.451; a += 0.1) { const sc = score(a); if (sc > bestS) { bestS = sc; best = a; } }
  return Math.abs(best) < 0.15 ? 0 : best;
}
function deskew(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const deg = skewAngle(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  if (!deg) return c;
  const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
  const o = out.getContext('2d', { willReadFrequently: true })!;
  o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.translate(out.width / 2, out.height / 2); o.rotate(-deg * Math.PI / 180); o.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

/** table rulings touch the letters and confuse Tesseract: whiten long horizontal / vertical dark runs */
export function rulingMask(gray: Uint8ClampedArray, w: number, h: number, stride = 4): Uint8Array {
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = gray[i * stride] < 200 ? 1 : 0;   // thin rulings are often light grey after scaling
  const mask = new Uint8Array(w * h);
  const L = Math.max(60, Math.round(w / 9)), V = Math.max(60, Math.round(h / 9));
  // horizontal: a pixel (dilated by ±1 row) whose window of length L is ≥ 92 % dark belongs to a ruling
  const row = new Uint8Array(w), pre = new Uint32Array(w + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = dark[y * w + x] | (y > 0 ? dark[(y - 1) * w + x] : 0) | (y < h - 1 ? dark[(y + 1) * w + x] : 0);
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + row[x];
    let x = 0;
    while (x + L <= w) {
      if (pre[x + L] - pre[x] >= L * 0.92) { let e = x + L; while (e < w && row[e]) e++; for (let k = x; k < e; k++) if (dark[y * w + k]) mask[y * w + k] = 1; x = e; } else x++;
    }
  }
  const col = new Uint8Array(h), cp = new Uint32Array(h + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = dark[y * w + x] | (x > 0 ? dark[y * w + x - 1] : 0) | (x < w - 1 ? dark[y * w + x + 1] : 0);
    for (let y = 0; y < h; y++) cp[y + 1] = cp[y] + col[y];
    let y = 0;
    while (y + V <= h) {
      if (cp[y + V] - cp[y] >= V * 0.92) { let e = y + V; while (e < h && col[e]) e++; for (let k = y; k < e; k++) if (dark[k * w + x]) mask[k * w + x] = 1; y = e; } else y++;
    }
  }
  return mask;
}
function removeRulings(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const mask = rulingMask(d, c.width, c.height);
  let n = 0;
  const w = c.width;
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    // the ruling plus its anti-aliased fringe (one pixel on each side)
    for (const j of [i, i - w, i + w, i - 1, i + 1]) if (j >= 0 && j < mask.length && d[j * 4] < 235) { d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = 255; }
    n++;
  }
  if (n) ctx.putImageData(img, 0, 0);
  return c;
}

const mapWord = (w: any): OcrWord => ({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
export async function recognize(canvas: HTMLCanvasElement, langs: string, psm: number, onProgress?: (m: any) => void) {
  const wk = await getWorker(langs);
  progressCb = onProgress || null;
  await wk.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: '1' });
  const { data } = await wk.recognize(canvas);
  progressCb = null;
  // tesseract.js v5: words/lines are present in the default (non-"blocks") output
  const lines: OcrWord[][] = (data.lines || []).map((l: any) => (l.words || []).map(mapWord));
  const words: OcrWord[] = data.words?.length ? data.words.map(mapWord) : lines.flat();
  return { text: String(data.text || ''), conf: Number(data.confidence || 0), words, lines };
}

async function pdfPages(file: File, onStatus: (s: { page: number; of: number }) => void): Promise<Page[]> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const out: Page[] = [];
  const N = Math.min(pdf.numPages, 15);
  for (let p = 1; p <= N; p++) {
    onStatus({ page: p, of: N });
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const words: OcrWord[] = [];
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue;
      const [, , c, d, e, f] = it.transform;
      const hgt = Math.hypot(c, d) || 10, x0 = e, y1 = vp.height - f, y0 = y1 - hgt;
      const width = it.width || it.str.length * hgt * 0.5, cw = width / it.str.length;
      let pos = 0;
      for (const part of it.str.split(/(\s+)/)) { if (part.trim()) words.push({ text: part, conf: 99, x0: x0 + pos * cw, x1: x0 + (pos + part.length) * cw, y0, y1 }); pos += part.length; }
    }
    const vp2 = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas'); canvas.width = vp2.width; canvas.height = vp2.height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp2 }).promise;
    out.push(words.map(w => w.text).join('').length > 15 ? { kind: 'text', words, canvas } : { kind: 'image', canvas });
  }
  return out;
}

const plain = (w: string) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
/** replace words that only differ by missing diacritics with the version from a diacritics-aware pass */
export function restoreDiacritics(r: { words: OcrWord[]; lines: OcrWord[][]; text: string }, accented: OcrWord[]) {
  const map = new Map<string, string>();
  for (const w of accented) { const t = w.text.trim(); if (t && plain(t) !== t) map.set(plain(t).toLowerCase(), t); }
  if (!map.size) return 0;
  let n = 0;
  const fix = (t: string) => { const m = map.get(t.toLowerCase()); return m && plain(m).toLowerCase() === t.toLowerCase() && m !== t ? m : null; };
  for (const w of [...r.words, ...r.lines.flat()]) { const m = fix(w.text.trim()); if (m) { w.text = m; n++; } }
  r.text = r.text.replace(/[\p{L}]+/gu, t => fix(t) ?? t);
  return n;
}

export function ocrLangs(test: Pick<Test, 'subject' | 'foreign' | 'native'>) {
  const set = new Set<string>();
  if (test.subject === 'languages') { if (test.foreign) set.add(LANGS[test.foreign].ocr); set.add(LANGS[test.native].ocr); }
  else { set.add(LANGS[test.native] ? LANGS[test.native].ocr : 'deu'); set.add('eng'); }
  return [...set].join('+');
}

async function extractViaServer(test: Test, images: Blob[], text?: string): Promise<ExtractResult> {
  const fd = new FormData();
  fd.append('meta', JSON.stringify({ testId: test.id, subject: test.subject, format: test.format, foreign: test.foreign, native: test.native }));
  if (text) fd.append('text', text);
  images.forEach((b, i) => fd.append('image', b, `page-${i + 1}.jpg`));
  return api<ExtractResult>('/api/ai/extract', { form: fd });
}

/** files -> rows for the review screen */
export async function processFiles(files: File[], test: Test, useAI: boolean, onStatus: (s: Status) => void = () => undefined): Promise<ImportResult> {
  const pages: Page[] = [];
  for (const f of files) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      onStatus({ stage: 'pdf', name: f.name });
      (await pdfPages(f, s => onStatus({ stage: 'pdf', name: f.name, page: s.page, of: s.of }))).forEach(p => pages.push(p));
    } else pages.push({ kind: 'photo', src: await fileToImage(f) });
  }
  const isLang = test.subject === 'languages';
  const result: ImportResult = { rows: [], thumbs: [], method: useAI ? 'ai' : 'ocr', unreadable: [], unused: 0, swapped: false, aiError: null, header: null };
  let work = pages;
  if (pages.length) {
    // The server counts every photo and every PDF page. If it cannot be asked, do not read the
    // files on the device either — that path would skip the cap. Paste and the demo never get here.
    const quota = await api<{ remaining: number }>(`/api/tests/${test.id}/pictures`);
    if (quota.remaining <= 0) throw new ApiError(422, 'picture_limit');
    let dropped = 0;
    if (pages.length > quota.remaining) { dropped = pages.length - quota.remaining; work = pages.slice(0, quota.remaining); }
    const reserve = async (count: number) => {
      try {
        const slot = await api<{ accepted: number }>(`/api/tests/${test.id}/pictures`, { body: { count } });
        return slot.accepted;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'picture_limit') return 0;
        throw e;
      }
    };
    if (!useAI) {
      const accepted = await reserve(work.length);
      if (accepted <= 0) throw new ApiError(422, 'picture_limit');
      if (accepted < work.length) { dropped += work.length - accepted; work = work.slice(0, accepted); }
    } else {
      // Image pages are counted inside /api/ai/extract. Text-layer pages never send an image, so count them here.
      const textCount = work.filter(p => p.kind === 'text').length;
      if (textCount) {
        const accepted = await reserve(textCount);
        if (accepted < textCount) {
          let keep = accepted;
          const next: Page[] = [];
          for (const p of work) {
            if (p.kind !== 'text') next.push(p);
            else if (keep > 0) { next.push(p); keep--; }
            else dropped++;
          }
          work = next;
        }
      }
      if (!work.length) throw new ApiError(422, 'picture_limit');
    }
    if (dropped) result.pictureDropped = dropped;
  }
  for (let i = 0; i < work.length; i++) {
    const pg = work[i];
    const color = pg.kind === 'photo' ? pg.src : pg.canvas;
    result.thumbs.push(toDataURL(color, 360, 0.6));
    const ps = (stage: Status['stage'], progress?: number) => onStatus({ stage, page: i + 1, of: work.length, progress });
    let rows: DraftRow[] | null = null;
    if (useAI && !result.aiError) {
      try {
        ps('ai', 0.3);
        const r = pg.kind === 'text' ? await extractViaServer(test, [], linesText(pg.words)) : await extractViaServer(test, [await toBlob(color, 1800, 0.85)]);
        rows = r.rows; result.unreadable.push(...r.unreadable);
        ps('ai', 1);
      } catch (e) {
        // A refused upload must not be read on the device either, or the gate would not hold.
        if (e instanceof ApiError && e.code === 'not_school_material') throw e;
        if (e instanceof ApiError && e.code === 'picture_limit') {
          result.thumbs.pop();
          result.pictureDropped = (result.pictureDropped || 0) + (work.length - i);
          if (!result.rows.length) throw e;
          break;
        }
        result.aiError = e instanceof ApiError ? e.code : 'ai_failed'; result.method = 'ocr';
      }
    }
    if (!rows) {
      let words: OcrWord[], lines: OcrWord[][] | null = null, text: string;
      if (pg.kind === 'text') { words = pg.words; text = linesText(words); }
      else {
        ps('prep', 0);
        const canvas = preprocess(pg.kind === 'photo' ? pg.src : pg.canvas);
        const r = await recognize(canvas, ocrLangs(test), isLang ? 6 : 3, m => {
          if (m.status === 'recognizing text') ps('ocr', m.progress);
          else if (/load|initializ/i.test(m.status)) ps('load', m.progress);
        });
        const langs = ocrLangs(test);
        // eng in a multi-language model tends to drop diacritics (Schüler → Schuler): a second pass without
        // English restores them word by word
        if (langs.includes('+') && langs.split('+').includes('eng')) {
          const other = langs.split('+').filter(l => l !== 'eng').join('+');
          ps('ocr', 1);
          const r2 = await recognize(canvas, other, isLang ? 6 : 3);
          restoreDiacritics(r, r2.words);
        }
        words = r.words; lines = r.lines; text = r.text;
      }
      if (isLang) {
        const pr = parseWords(words, lines);
        if (!result.header && pr.header) result.header = pr.header;
        rows = pr.rows.map(r => ({ type: 'pair' as const, a: r.a, b: r.b, example: r.example, low: r.low, conf: r.conf, flags: r.flags }));
      } else {
        const pr = parseGeneral(text);
        rows = pr.rows.map(r => ({ type: r.type || 'pair', a: r.a, b: r.b, example: r.example, low: r.low, conf: r.conf, flags: r.flags }));
        result.unused += pr.unused;
      }
    }
    result.rows.push(...rows);
  }
  if (isLang && result.method === 'ocr' && result.rows.length && test.foreign) {
    const o = orient(result.rows, test.foreign, test.native, result.header);
    if (o.swap) { result.rows.forEach(r => { const x = r.a; r.a = r.b; r.b = x; }); result.swapped = true; }
    result.orientConfidence = o.confidence;
  }
  await terminate();
  return result;
}

/** pre-cache the OCR engine + language data so photo import works offline (Workbox CacheFirst for /vendor) */
export async function warmOfflineCache(): Promise<boolean> {
  if (!('caches' in window)) return false;
  const files = ['/vendor/tesseract/tesseract.min.js', '/vendor/tesseract/worker.min.js', '/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', '/vendor/tesseract/core/tesseract-core-lstm.wasm.js',
    '/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs', ...['deu', 'eng', 'fra', 'spa', 'lat'].map(l => `/vendor/lang/${l}.traineddata.gz`)];
  const cache = await caches.open(`${APP_SLUG}-vendor`);
  await Promise.all(files.map(async f => { if (!(await cache.match(f))) { const r = await fetch(f); if (r.ok) await cache.put(f, r); } }));
  return true;
}
