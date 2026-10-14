// Este módulo só é carregado quando a pessoa escolhe um PDF (import() dinâmico),
// para a biblioteca de PDF não pesar na abertura do app.
// A versão "legacy" funciona também em celulares e navegadores mais antigos.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { TextItem } from '../domain/importing';

export type PdfErrorCode = 'unreadable' | 'password' | 'scanned';

export class PdfError extends Error {
  constructor(readonly code: PdfErrorCode) {
    super(code);
    this.name = 'PdfError';
  }
}

/** Extrai o texto de todas as páginas, com a posição de cada pedaço. */
export async function readPdfText(file: File): Promise<TextItem[]> {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new PdfError((e as { name?: string })?.name === 'PasswordException' ? 'password' : 'unreadable');
  }

  const items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!('str' in it) || it.str.trim() === '') continue;
      const [, , , , x, y] = it.transform as number[];
      items.push({
        text: it.str,
        x: x ?? 0,
        y: y ?? 0,
        width: it.width,
        height: it.height,
        page: p,
      });
    }
  }
  await task.destroy();
  // PDF feito de imagem (escaneado) não tem texto para ler.
  if (items.length < 5) throw new PdfError('scanned');
  return items;
}
