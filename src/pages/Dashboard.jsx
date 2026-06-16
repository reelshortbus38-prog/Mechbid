import { useState } from 'react'
import FileUpload from '../components/FileUpload'
import { processQuote } from '../services/processQuote'

export default function Dashboard() {
  const [quote, setQuote] = useState(null)

  const handleParsed = (data) => {
    const result = processQuote(data)
    setQuote(result)
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Mechbid Dashboard</h1>

      <FileUpload onParsed={handleParsed} />

      {quote && (
        <div>
          <h2>Quote Summary</h2>

          <p>Material: ${quote.totalMaterial}</p>
          <p>Labor: ${quote.totalLabor}</p>
          <h3>Total: ${quote.grandTotal}</h3>
        </div>
      )}
    </div>
  )
}
