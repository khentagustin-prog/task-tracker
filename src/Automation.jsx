import { useMemo, useState } from 'react'
import { readSequencePdf } from './pdfRows.js'
import ImageReview from './ImageReview.jsx'
import { compute, formatGap, fmtTime12, msToDate, msToTime, dayMs, MIN, guessFlow } from './sequence.js'

const niceDate = (iso) => new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const CODE = /[A-Z]{2,6}-\d{4}[A-Z]{0,4}/

function Drop({ title, hint, doc, busy, onFile, onClear }) {
  return (
    <div className={`au-drop ${doc ? 'has' : ''}`}>
      <div className="au-drop-h"><b>{title}</b>{doc && <button className="x" onClick={onClear} title="Remove">✕</button>}</div>
      {!doc ? (
        <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}>
          {busy ? 'Reading the PDF...' : <>Click or drop the PDF here<small>{hint}</small></>}
          <input type="file" accept="application/pdf" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = '' }} />
        </label>
      ) : (
        <div className="au-info">
          <div className="au-file">📄 {doc.name}</div>
          <div>{doc.rows.length} steps · {doc.info.casino || 'no casino name'}</div>
          <div className="muted">First: {doc.rows[0]?.dateText} {doc.rows[0]?.timeText} · Last: {doc.rows[doc.rows.length - 1]?.dateText}</div>
          {doc.issues.map((m, i) => <div key={i} className="au-bad">⚠ {m}</div>)}
        </div>
      )}
    </div>
  )
}

export default function Automation({ boards, casinos = [], onCreate, onOpenBoard }) {
  const [mode, setMode] = useState('pdf')
  const [act, setAct] = useState(null)
  const [rem, setRem] = useState(null)
  const [busy, setBusy] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [fix, setFix] = useState('') // optional: correct only the time of the first step
  const [rep, setRep] = useState({ from: '', to: '' })
  const [board, setBoard] = useState(boards[0] || 'Main')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')

  const first = act?.rows[0] || rem?.rows[0]
  // One upload is enough: with one or two PDFs, Activation vs Reminder is detected automatically (from the Label/name of the first row)
  const loadMany = async (list) => {
    const files = [...list].filter((f) => f && /pdf$/i.test(f.type || f.name))
    if (!files.length) { setErr('Only PDF files are accepted here.'); return }
    setErr(''); setDone(null); setBusy('x')
    try {
      let nA = act, nR = rem
      const seen = []
      for (const file of files) {
        const d = await readSequencePdf(file); d.name = file.name
        const r0 = d.rows[0]
        const kind = r0 && guessFlow(r0) === 'Reminder' ? 'Reminder' : 'Activation'
        seen.push(kind)
        kind === 'Activation' ? (nA = d) : (nR = d)
        if (!name && d.info.casino) setName(d.info.casino)
        const code = d.rows.map((r) => r.title.match(CODE)?.[0]).find(Boolean)
        if (code && !rep.from) setRep({ from: code, to: code })
      }
      setAct(nA); setRem(nR)
      const base = nA || nR
      if (base?.rows[0]) { setDate(msToDate(base.rows[0].ms)); setFix('') }
      if (seen.length > 1 && new Set(seen).size < seen.length) setErr(`Both PDFs look like ${seen[0]}, so only one was used. Add one Activation and one Reminder PDF.`)
    } catch (e) { setErr('Could not read the PDF: ' + (e.message || e)) } finally { setBusy('') }
  }

  const baseTime = first ? msToTime(first.ms) : ''
  const result = useMemo(() => {
    if ((!act && !rem) || !date || !baseTime) return null
    const [h, m] = baseTime.split(':').map(Number)
    const launchMs = dayMs(date) + (h * 60 + m) * MIN // keeps the PDF times of day; only the date is shifted
    const out = compute({ act, rem, launchMs, replace: rep.from && rep.from !== rep.to ? [rep] : [] })
    if (fix && out.steps.length && fix !== baseTime) {
      const i = out.steps.findIndex((x) => x.order === 0 && x.flow === (act ? 'Activation' : 'Reminder'))
      const [fh, fm] = fix.split(':').map(Number)
      const st = out.steps[i]
      st.ms = dayMs(st.date) + (fh * 60 + fm) * MIN; st.time = fix; st.edited = true
      out.warnings.push(`You changed the time of "${st.title}" from ${fmtTime12(baseTime)} to ${fmtTime12(fix)}. The other steps keep the PDF times.`)
    }
    // Real gap between steps of the same flow (based on the actual times)
    for (const flow of ['Activation', 'Reminder']) {
      const list = out.steps.filter((x) => x.flow === flow).sort((x, y) => x.order - y.order)
      list.forEach((x, k) => { x.realGap = k === 0 ? null : (x.ms - list[k - 1].ms) / MIN })
    }
    if (baseTime < '06:00' && !(fix && fix !== baseTime)) out.warnings.push(`The first step is at ${fmtTime12(baseTime)} (early morning). Make sure AM is correct. If it should be PM, set the right time in "Correct the first step time".`)
    return out
  }, [act, rem, date, baseTime, fix, rep])

  const blocked = !result || result.errors.length > 0 || !result.steps.length
  const add = async () => {
    setSaving(true); setErr('')
    try {
      const steps = result.steps
      const task = {
        title: name.trim() || 'Sequence', status: 'todo', priority: 'medium', group_name: board, due_date: steps[0].date, notes: '', tags: [], attachments: [],
        subtasks: steps.map((s) => ({ id: crypto.randomUUID(), title: s.title, label: s.label, status: s.done ? 'done' : 'todo', owner: '', due_date: s.date, time: s.time, notes: '', attachments: [] })),
      }
      await onCreate(task)
      setDone({ board, count: steps.length })
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="auto">
      <div className="top"><div><h1>Automation</h1><p className="muted">Compute a sequence schedule from PDFs, or create PDFs from an image.</p></div></div>
      <div className="au-tabs">
        <button className={mode === 'pdf' ? 'on' : ''} onClick={() => setMode('pdf')}>PDF → Schedule</button>
        <button className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')}>Image → Review → PDF</button>
      </div>
      {mode === 'image' ? <ImageReview casinos={casinos} /> : (<>

      <label className="au-one" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadMany(e.dataTransfer.files) }}>
        {busy ? 'Reading the PDF...' : <><b>One upload is enough</b><span>Drop or choose the Activation and Reminder PDF (one or both). They are sorted automatically.</span></>}
        <input type="file" accept="application/pdf" multiple hidden onChange={(e) => { loadMany(e.target.files); e.target.value = '' }} />
      </label>
      <div className="au-grid">
        <Drop title="Activation" hint="Waiting for the Activation PDF" doc={act} busy={false} onFile={(f) => loadMany([f])} onClear={() => { setAct(null); setDone(null) }} />
        <Drop title="Reminder" hint="Waiting for the Reminder PDF" doc={rem} busy={false} onFile={(f) => loadMany([f])} onClear={() => { setRem(null); setDone(null) }} />
      </div>
      {err && <div className="error">⚠ {err}</div>}

      {first && (
        <section className="d-card">
          <h3>Settings</h3>
          <div className="au-form">
            <label>Campaign name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Launch date (first step)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>First step time in the PDF<input value={baseTime ? fmtTime12(baseTime) : ''} readOnly /><small>Each step keeps its PDF time of day; only the dates are shifted.</small></label>
            <label>Correct the first step time (optional)<input type="time" value={fix} onChange={(e) => setFix(e.target.value)} /><small>For example, if it should be 4:30 PM and not 4:30 AM.</small></label>
            <label>Add to board<select value={board} onChange={(e) => setBoard(e.target.value)}>{boards.map((b) => <option key={b}>{b}</option>)}</select></label>
            {rep.from && <label className="wide">Replace the code in the names
              <span className="au-rep"><input value={rep.from} readOnly /><span>→</span><input value={rep.to} onChange={(e) => setRep({ ...rep, to: e.target.value.toUpperCase() })} placeholder="new code" /></span></label>}
          </div>
        </section>
      )}

      {result && (
        <section className="d-card">
          <h3>Preview <small>{result.steps.length} steps{result.steps.length ? ` · ${niceDate(result.steps[0].date)} → ${niceDate(result.steps[result.steps.length - 1].date)}` : ''}</small></h3>
          {result.errors.map((m, i) => <div key={i} className="au-bad">⛔ {m}</div>)}
          {result.warnings.map((m, i) => <div key={i} className="au-warn">⚠ {m}</div>)}
          {!result.errors.length && <div className="au-ok">✓ Every step's Date/Time matches its Gap in the PDF.</div>}
          <div className="au-table">
            <div className="au-r h"><span>#</span><span>Flow</span><span>Subitem</span><span>Label</span><span>Date</span><span>Time</span><span>Gap</span></div>
            {result.steps.map((s, i) => (
              <div key={i} className="au-r">
                <span>{i + 1}</span><span className={`fl ${s.flow}`}>{s.flow === 'Activation' ? 'Act' : 'Rem'}</span><span className="t">{s.title}</span><span>{s.label}</span>
                <span>{niceDate(s.date)}</span><span className={s.edited ? 'chg' : ''}>{fmtTime12(s.time)}{s.edited ? ' ✎' : ''}</span><span className={s.realGap !== s.gap && s.realGap != null ? 'chg' : ''}>{s.realGap == null ? '—' : formatGap(s.realGap)}</span>
              </div>
            ))}
          </div>
          <div className="au-act">
            {done ? <span className="au-ok">✓ Added {done.count} subitems to the board “{done.board}”. <button className="link" onClick={() => onOpenBoard(done.board)}>Open the board →</button></span>
              : <button className="primary" disabled={blocked || saving} onClick={add}>{saving ? 'Adding...' : `Add to ${board}`}</button>}
            {blocked && !done && result.errors.length > 0 && <span className="muted">Cannot be added while there are ⛔ problems.</span>}
          </div>
        </section>
      )}
      </>)}
    </div>
  )
}
