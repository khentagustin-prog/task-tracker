import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatGapPdf, dateText, timeText } from './sequence.js'

// Gumagawa ng "Workflow Gap" PDF na kapareho ng format ng orihinal (A4, Done/Subitem/Label/Date/Time/Gap/Time OK/CRM OK).
// meta: { title, assignedTo, organization, casino, campaignDates, generated, workflow }
// rows: [{ title, label, ms, gap }]   summary: { totalText, from, to } | null
export function buildSequencePdf({ meta, rows, summary }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  doc.setFont('times', 'bold').setFontSize(25)
  doc.text(meta.title, W / 2, 235, { align: 'center' })
  doc.setLineWidth(1).line(41, 252, W - 41, 252)

  doc.setFont('times', 'normal').setFontSize(12)
  const info = [`Assigned To: ${meta.assignedTo}`, `Organization: ${meta.organization}`, `Casino: ${meta.casino}`, `Campaign Dates: ${meta.campaignDates}`, `Generated: ${meta.generated}`]
  info.forEach((t, i) => doc.text(t, 57, 284 + i * 17))

  autoTable(doc, {
    startY: 371,
    margin: { left: 41, right: 41 },
    head: [['Done', 'Subitem', 'Label', 'Date', 'Time', 'Gap', 'Time OK', 'CRM OK']],
    body: rows.map((r) => ['No', r.title, r.label, dateText(r.ms), timeText(r.ms), formatGapPdf(r.gap), 'No', 'No']),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4.5, halign: 'center', valign: 'middle', textColor: 0, lineColor: 0, lineWidth: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 37.5 }, 1: { cellWidth: 115 }, 2: { cellWidth: 66 }, 3: { cellWidth: 62 }, 4: { cellWidth: 52 }, 5: { cellWidth: 72 }, 6: { cellWidth: 52 }, 7: { cellWidth: 53 } },
  })

  let y = doc.lastAutoTable.finalY + 36
  const boxH = summary ? 84 : 58
  if (y + boxH > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 60 }
  doc.setLineWidth(1).rect(41, y, W - 82, boxH)
  doc.setFont('times', 'bold').setFontSize(11).text('Workflow Gap Summary', W / 2, y + 18, { align: 'center' })
  doc.setFont('times', 'normal').setFontSize(10)
  doc.text(`Workflow: ${meta.workflow}`, 57, y + 37)
  if (summary) {
    doc.text(`Total Gap: ${summary.totalText}`, 57, y + 54)
    doc.text(`From: ${summary.from}`, 57, y + 71 - 0)
    doc.text(`To: ${summary.to}`, 298, y + 71 - 0)
  }
  return doc
}
