import 'dotenv/config';
import * as cheerio from 'cheerio';
import cors from 'cors';
import express from 'express';

const PORT = process.env.PORT ?? 3000;
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b';
const MAX_TEXT_CHARS = 15000;
const MAX_PAGE_BYTES = 2_000_000;

const app = express();
app.use(cors());
app.use(express.json());

function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw httpError(400, 'That does not look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw httpError(400, 'Only http and https URLs are supported.');
  }
  const host = url.hostname;
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '' ||
    /^(10\.|127\.|192\.168\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1'
  ) {
    throw httpError(400, 'Local and private addresses are not allowed.');
  }
  return url;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function scrape(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    throw httpError(502, `The page returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('html') && !contentType.startsWith('text/')) {
    throw httpError(415, 'That URL is not an HTML page.');
  }
  const html = await response.text();
  if (html.length > MAX_PAGE_BYTES) {
    throw httpError(413, 'That page is too large to summarize.');
  }

  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, form, nav, header, footer, aside, button, figure, figcaption').remove();

  const title = $('title').first().text().trim() || url.hostname;
  let text = $('p, h1, h2, h3, li')
    .map((_, el) => $(el).text())
    .get()
    .join('\n');
  if (text.trim().length < 200) {
    text = $('article').text() || $('main').text() || $('body').text();
  }
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  if (!text) {
    throw httpError(422, 'No readable text was found on that page.');
  }
  return { title, text: text.slice(0, MAX_TEXT_CHARS) };
}

const MODEL_FALLBACKS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];

async function callGroq(model, text, title) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'You are a summarization assistant. Reply with only a single concise summary paragraph ' +
            'of 3-5 sentences. No headings, bullets, preamble, or self-commentary.',
        },
        {
          role: 'user',
          content: `Summarize this web page ("${title}"):\n\n---\n${text}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = httpError(
      502,
      `Groq API error (${response.status}): ${body.slice(0, 200)}`,
    );
    err.retryable = response.status === 503 || response.status === 429;
    throw err;
  }
  const data = await response.json();
  const summary = data?.choices?.[0]?.message?.content?.trim();
  if (!summary) {
    throw httpError(502, 'Groq returned an empty summary.');
  }
  return summary;
}

async function summarizeWithGroq(text, title) {
  if (!process.env.GROQ_API_KEY) {
    throw httpError(500, 'GROQ_API_KEY is not set. Add it to .env and restart the server.');
  }
  let lastError;
  for (const model of [GROQ_MODEL, ...MODEL_FALLBACKS]) {
    try {
      return await callGroq(model, text, title);
    } catch (err) {
      lastError = err;
      if (!err.retryable) throw err;
    }
  }
  throw lastError;
}

app.post('/api/summarize', async (req, res, next) => {
  try {
    const { url } = req.body ?? {};
    if (typeof url !== 'string' || !url.trim()) {
      throw httpError(400, 'Please provide a URL.');
    }
    const safeUrl = assertSafeUrl(url.trim());
    const { title, text } = await scrape(safeUrl);
    const summary = await summarizeWithGroq(text, title);
    res.json({ title, url: safeUrl.href, summary });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (err.name === 'TimeoutError') {
    return res.status(504).json({ error: 'The page took too long to load.' });
  }
  if (err instanceof TypeError && status === 500) {
    return res.status(502).json({ error: 'Could not reach that URL.' });
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
