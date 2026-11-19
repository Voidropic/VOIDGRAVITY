import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as XLSX from 'xlsx';
import type { GeminiPart } from './gemini';

(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export type PreparedAttachment = { name: string; size: number; type: string; previewUrl?: string; cloudPath?: string; bucket?: string; extractedText?: string; geminiParts: GeminiPart[]; note?: string };
const MAX_INLINE_BYTES = 18 * 1024 * 1024;
const MAX_TEXT_CHARS = 90_000;
const textExtensions = new Set(['txt','md','markdown','html','htm','css','js','jsx','ts','tsx','json','xml','yaml','yml','toml','ini','sql','py','lua','java','kt','c','cpp','h','rs','go','sh','bash','csv','log','env','properties','gradle','ktx']);
const ext = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => { const value = String(reader.result || ''); resolve(value.split(',')[1] || ''); };
  reader.onerror = () => reject(reader.error || new Error('Gagal membaca file.'));
  reader.readAsDataURL(file);
});
async function pdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
    const page = await pdf.getPage(i); const content = await page.getTextContent();
    pages.push((content.items as Array<{ str?: string }>).map((item) => item.str || '').join(' '));
  }
  return pages.join('\n').slice(0, MAX_TEXT_CHARS);
}
async function zipText(file: File) {
  const zip = await JSZip.loadAsync(file, { checkCRC32: false });
  const entries = Object.values(zip.files).filter((item) => !item.dir).slice(0, 200);
  const lines: string[] = [`Archive: ${file.name}`, `File entries inspected: ${entries.length}`];
  let extracted = 0;
  for (const entry of entries) {
    // ZIP contents are read in memory only. No entry is written to disk, so traversal paths are not extracted.
    const extension = ext(entry.name);
    const uncompressedSize = Number((entry as any)._data?.uncompressedSize || 0);
    if (!textExtensions.has(extension) || uncompressedSize > 600_000) { lines.push(`\n[${entry.name}] — binary, unsupported, or too large for safe text preview; listed, not extracted.`); continue; }
    try {
      const value = await entry.async('string');
      const remaining = MAX_TEXT_CHARS - extracted;
      if (remaining <= 0) { lines.push('\n[Content limit reached.]'); break; }
      const clipped = value.slice(0, Math.min(remaining, 12_000));
      extracted += clipped.length;
      lines.push(`\n===== ${entry.name} =====\n${clipped}${value.length > clipped.length ? '\n[truncated]' : ''}`);
    } catch { lines.push(`\n[${entry.name}] — could not decode as text.`); }
  }
  return lines.join('\n').slice(0, MAX_TEXT_CHARS);
}
export async function prepareFile(file: File): Promise<PreparedAttachment> {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} terlalu besar untuk upload langsung di aplikasi ini (maksimum 25 MB per file).`);
  const extension = ext(file.name);
  const type = file.type || 'application/octet-stream';
  let extractedText = '';
  let geminiParts: GeminiPart[] = [];
  let previewUrl: string | undefined;
  let note = '';
  if (type.startsWith('image/')) {
    previewUrl = URL.createObjectURL(file);
    if (file.size > MAX_INLINE_BYTES) throw new Error('Gambar terlalu besar untuk dikirim sebagai input inline.');
    geminiParts = [{ inlineData: { mimeType: type, data: await fileToBase64(file) } }];
    note = 'Gambar disiapkan sebagai input visual.';
  } else if (type === 'application/pdf' || extension === 'pdf') {
    extractedText = await pdfText(file).catch(() => '');
    if (file.size <= MAX_INLINE_BYTES) geminiParts = [{ inlineData: { mimeType: 'application/pdf', data: await fileToBase64(file) } }];
    else geminiParts = [{ text: `PDF text extraction:\n${extractedText}` }];
    note = 'PDF diproses. Model multimodal menerima file asli ketika ukurannya berada dalam batas inline.';
  } else if (extension === 'zip') {
    extractedText = await zipText(file);
    geminiParts = [{ text: `The user attached a ZIP archive. It has already been inspected in-browser. Here is the archive inventory and extracted text from supported text files. Do not claim that binaries were opened or executed.\n\n${extractedText}` }];
    note = 'ZIP sudah dibuka di memori browser. File teks diekstrak untuk konteks AI; file biner hanya dicantumkan dan tidak dieksekusi.';
  } else if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    extractedText = result.value.slice(0, MAX_TEXT_CHARS);
    geminiParts = [{ text: `Extracted DOCX text from ${file.name}:\n${extractedText}` }];
  } else if (extension === 'xlsx' || extension === 'xls') {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    extractedText = workbook.SheetNames.map((sheet) => `## Sheet: ${sheet}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])}`).join('\n').slice(0, MAX_TEXT_CHARS);
    geminiParts = [{ text: `Spreadsheet contents from ${file.name}:\n${extractedText}` }];
  } else if (type.startsWith('text/') || textExtensions.has(extension) || ['application/json','application/xml'].includes(type)) {
    extractedText = (await file.text()).slice(0, MAX_TEXT_CHARS);
    geminiParts = [{ text: `File: ${file.name}\n\n${extractedText}` }];
  } else {
    geminiParts = [{ text: `The file ${file.name} (${type}, ${file.size} bytes) is attached. Its binary contents were stored but are not decoded by this client.` }];
    note = 'File berhasil disiapkan sebagai attachment, tetapi format binernya belum didukung untuk pembacaan konten.';
  }
  return { name: file.name, size: file.size, type, previewUrl, extractedText, geminiParts, note };
}
export function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
