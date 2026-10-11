import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Result = {
  title: string
  url: string
  summary: string
}

type Status = 'idle' | 'loading' | 'success' | 'error'

async function summarize(url: string): Promise<Result> {
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`)
  }
  return data as Result
}

function App() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim() || status === 'loading') return
    setStatus('loading')
    setError('')
    setResult(null)
    try {
      const data = await summarize(url.trim())
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  return (
    <main className="page">
      <div className="card">
        <h1>AI Web Scraper</h1>
        <p className="tagline">
          Paste a URL and get an instant AI summary of the page.
        </p>

        <form className="row" onSubmit={handleSubmit}>
          <input
            type="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={status === 'loading'}
          />
          <button type="submit" disabled={status === 'loading' || !url.trim()}>
            {status === 'loading' ? 'Summarizing…' : 'Summarize'}
          </button>
        </form>

        {status === 'loading' && (
          <div className="loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Loading… fetching the page and generating a summary
          </div>
        )}

        {status === 'error' && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {status === 'success' && result && (
          <section className="result">
            <h2>{result.title}</h2>
            <a className="source" href={result.url} target="_blank" rel="noreferrer">
              {result.url}
            </a>
            <p className="summary">{result.summary}</p>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
