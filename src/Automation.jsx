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
          {busy ? 'Binabasa ang PDF...' : <>Click o i-drop dito ang PDF<small>{hint}</small></>}
          <input type="file" accept="application/pdf" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = '' }} />
        </label>
      ) : (
        <div className="au-info">
          <div className="au-file">📄 {doc.name}</div>
          <div>{doc.rows.length} steps · {doc.info.casino || 'walang pangalan ng casino'}</div>
          <div className="muted">Una: {doc.rows[0]?.dateText} {doc.rows[0]?.timeText} · Huli: {doc.rows[doc.rows.length - 1]?.dateText}</div>
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
  const [fix, setFix] = useState('') // opsyonal: itama ang oras ng unang step lang
  const [rep, setRep] = useState({ from: '', to: '' })
  const [board, setBoard] = useState(boards[0] || 'Main')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')

  const first = act?.rows[0] || rem?.rows[0]
  // Isang upload lang: kahit isa o dalawang PDF, awtomatikong nakikilala kung Activation o Reminder (batay sa Label/pangalan ng unang row)
  const loadMany = async (list) => {
    const files = [...list].filter((f) => f && /pdf$/i.test(f.type || f.name))
    if (!files.length) { setErr('PDF lang ang tinatanggap dito.'); return }
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
      if (seen.length > 1 && new Set(seen).size < seen.length) setErr(`Parehong ${seen[0]} ang nakita sa mga PDF, kaya isa lang ang nagamit. Tiyaking isang Activation at isang Reminder ang ilalagay.`)
    } catch (e) { setErr('Hindi mabasa ang PDF: ' + (e.message || e)) } finally { setBusy('') }
  }

  const baseTime = first ? msToTime(first.ms) : ''
  const result = useMemo(() => {
    if ((!act && !rem) || !date || !baseTime) return null
    const [h, m] = baseTime.split(':').map(Number)
    const launchMs = dayMs(date) + (h * 60 + m) * MIN // iniingatan ang oras ng document; ang petsa lang ang nilipat
    const out = compute({ act, rem, launchMs, replace: rep.from && rep.from !== rep.to ? [rep] : [] })
    if (fix && out.steps.length && fix !== baseTime) {
      const i = out.steps.findIndex((x) => x.order === 0 && x.flow === (act ? 'Activation' : 'Reminder'))
      const [fh, fm] = fix.split(':').map(Number)
      const st = out.steps[i]
      st.ms = dayMs(st.date) + (fh * 60 + fm) * MIN; st.time = fix; st.edited = true
      out.warnings.push(`Binago mo ang oras ng "${st.title}" mula ${fmtTime12(baseTime)} papuntang ${fmtTime12(fix)}. Ang ibang step ay nanatili sa oras ng PDF.`)
    }
    // Totoong gap sa pagitan ng mga step sa iisang flow (batay sa aktuwal na oras)
    for (const flow of ['Activation', 'Reminder']) {
      const list = out.steps.filter((x) => x.flow === flow).sort((x, y) => x.order - y.order)
      list.forEach((x, k) => { x.realGap = k === 0 ? null : (x.ms - list[k - 1].ms) / MIN })
    }
    if (baseTime < '06:00' && !(fix && fix !== baseTime)) out.warnings.push(`Ang unang step ay ${fmtTime12(baseTime)} (madaling-araw). Tiyaking AM talaga ito. Kung PM dapat, ilagay ang tamang oras sa "Itama ang oras ng unang step".`)
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
      <div className="top"><div><h1>Automation</h1><p className="muted">Kompyutin ang sequence mula sa PDF, o gumawa ng PDF mula sa larawan.</p></div></div>
      <div className="au-tabs">
        <button className={mode === 'pdf' ? 'on' : ''} onClick={() => setMode('pdf')}>PDF → Schedule</button>
        <button className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')}>Larawan → Review → PDF</button>
      </div>
      {mode === 'image' ? <ImageReview casinos={casinos} /> : (<>

      <label className="au-one" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadMany(e.dataTransfer.files) }}>
        {busy ? 'Binabasa ang PDF...' : <><b>Isang upload lang</b><span>I-drop o piliin ang Activation at Reminder PDF (isa o dalawa). Awtomatiko itong hahatiin.</span></>}
        <input type="file" accept="application/pdf" multiple hidden onChange={(e) => { loadMany(e.target.files); e.target.value = '' }} />
      </label>
      <div className="au-grid">
        <Drop title="Activation" hint="Naghihintay ng Activation PDF" doc={act} busy={false} onFile={(f) => loadMany([f])} onClear={() => { setAct(null); setDone(null) }} />
        <Drop title="Reminder" hint="Naghihintay ng Reminder PDF" doc={rem} busy={false} onFile={(f) => loadMany([f])} onClear={() => { setRem(null); setDone(null) }} />
      </div>
      {err && <div className="error">⚠ {err}</div>}

      {first && (
        <section className="d-card">
          <h3>Mga setting</h3>
          <div className="au-form">
            <label>Pangalan ng campaign<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Launch date (unang step)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Oras ng unang step sa PDF<input value={baseTime ? fmtTime12(baseTime) : ''} readOnly /><small>Iniingatan ang oras ng bawat step sa PDF; ang petsa lang ang nililipat.</small></label>
            <label>Itama ang oras ng unang step (opsyonal)<input type="time" value={fix} onChange={(e) => setFix(e.target.value)} /><small>Halimbawa, kung 4:30 PM dapat at hindi 4:30 AM.</small></label>
            <label>Ilagay sa board<select value={board} onChange={(e) => setBoard(e.target.value)}>{boards.map((b) => <option key={b}>{b}</option>)}</select></label>
            {rep.from && <label className="wide">Palitan ang code sa mga pangalan
              <span className="au-rep"><input value={rep.from} readOnly /><span>→</span><input value={rep.to} onChange={(e) => setRep({ ...rep, to: e.target.value.toUpperCase() })} placeholder="bagong code" /></span></label>}
          </div>
        </section>
      )}

      {result && (
        <section className="d-card">
          <h3>Preview <small>{result.steps.length} steps{result.steps.length ? ` · ${niceDate(result.steps[0].date)} → ${niceDate(result.steps[result.steps.length - 1].date)}` : ''}</small></h3>
          {result.errors.map((m, i) => <div key={i} className="au-bad">⛔ {m}</div>)}
          {result.warnings.map((m, i) => <div key={i} className="au-warn">⚠ {m}</div>)}
          {!result.errors.length && <div className="au-ok">✓ Tugma ang Date/Time at Gap ng bawat step sa PDF.</div>}
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
            {done ? <span className="au-ok">✓ Nadagdag na ang {done.count} subitems sa board na “{done.board}”. <button className="link" onClick={() => onOpenBoard(done.board)}>Buksan ang board →</button></span>
              : <button className="primary" disabled={blocked || saving} onClick={add}>{saving ? 'Dinadagdag...' : `Add to ${board}`}</button>}
            {blocked && !done && result.errors.length > 0 && <span className="muted">Hindi maidaragdag habang may ⛔ na problema.</span>}
          </div>
        </section>
      )}
      </>)}
    </div>
  )
}
