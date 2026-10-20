import { parseTable } from './sequence.js'

// Binabasa ang PDF sa browser (lazy-loaded) at ibinabalik ang parseTable() result.
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
  if (!out.rows.length) out.issues.push('Walang nabasang table sa PDF na ito. Siguraduhing ito ang "Workflow Gap" PDF.')
  return out
}
