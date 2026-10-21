import ImageReview from './ImageReview.jsx'

export default function Automation({ casinos }) {
  return (
    <div className="auto">
      <div className="top"><div><h1>Automation</h1><p className="muted">Create the Activation and Reminder PDFs from a sequence image.</p></div></div>
      <ImageReview casinos={casinos} />
    </div>
  )
}
