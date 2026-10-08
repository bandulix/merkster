// Copies the OCR / PDF runtime files from node_modules into web/public/vendor so they are
// served from our own origin (offline-capable, no CDN). Runs automatically before dev/build.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = p => join(root, 'node_modules', p);
const out = p => join(root, 'web/public/vendor', p);
const copy = (from, to) => { mkdirSync(dirname(out(to)), { recursive: true }); cpSync(nm(from), out(to)); };
copy('tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js');
copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js');
copy('tesseract.js/LICENSE.md', 'tesseract/LICENSE.md');
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) copy('tesseract.js-core/' + f, 'tesseract/core/' + f);
copy('pdfjs-dist/build/pdf.min.js', 'pdfjs/pdf.min.js');
copy('pdfjs-dist/build/pdf.worker.min.js', 'pdfjs/pdf.worker.min.js');
copy('pdfjs-dist/LICENSE', 'pdfjs/LICENSE');
for (const l of ['deu', 'eng', 'fra', 'spa', 'lat']) copy(`@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `lang/${l}.traineddata.gz`);
if (!existsSync(out('lang/deu.traineddata.gz'))) throw new Error('vendor copy failed');
console.log('vendor files ready in web/public/vendor');
