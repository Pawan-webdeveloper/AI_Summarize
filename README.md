# AI Web Scraper

Paste a URL, click **Summarize**, and get a short AI summary of the page.

## Structure

```
client/   React + TypeScript + Vite frontend
server/   Node + Express backend (scraping + Groq AI)
```

- **Scraping:** fetch + [cheerio](https://cheerio.js.org/) text extraction
- **AI:** [Groq](https://console.groq.com/) free-tier chat completions API

## Setup

This is an npm workspaces monorepo — install everything from the root:

```bash
npm install
```

Add your Groq key to `server/.env` (copy `server/.env.example` if missing):

```
GROQ_API_KEY=your-key-here
```

Get a free key at https://console.groq.com/keys

## Run

Two terminals from the project root:

```bash
npm run server     # Express API on http://localhost:3000
npm run dev        # Vite dev server (proxies /api to :3000)
```

Open the URL Vite prints (default http://localhost:5173), paste a webpage URL, and click Summarize.

## Notes

- The model is set via `GROQ_MODEL` in `server/.env` (default `openai/gpt-oss-20b`, the fastest general model on the current key). See https://console.groq.com/docs/models.
- Only basic HTML text is scraped; heavy JavaScript-rendered or bot-protected pages may fail with a clear error.
- `npm run build` type-checks and builds the client into `client/dist/`.
# AI_Summarize
