import { parseTable } from './sequence.js'

// Reads the PDF in the browser (lazy-loaded) and returns the parseTable() result.
export async function readSequencePdf(file) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const items = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const tc = await (await pdf.getPage(n)).getTextContent()
    tc.items.forEach((i) => items.push({ s: i.str, x: i.transform[4], y: i.transform[5] - (n - 1) * 100000 }))
  }
  const out = parseTable(items)
  if (!out.rows.length) out.issues.push('No table was found in this PDF. Make sure it is the "Workflow Gap" PDF.')
  return out
}
