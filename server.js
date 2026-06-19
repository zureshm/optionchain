'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { fetchOptionChainRaw } = require('./nseClient');
const { processChain } = require('./processor');

const PORT = process.env.PORT || 8080;
const REFRESH_MS = 10 * 1000; // 10s delay between NSE hits (avoid getting blocked)
const STRIKE_WINDOW = 10;

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4200',
  'http://209.38.126.3:3000',
  'http://144.126.255.14:3000',
  'http://144.126.255.14:4200',
  'https://suralgo.duckdns.org',
  'https://sumalgo.duckdns.org',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.static(path.join(__dirname, 'public')));

// ---- cache state ----
let cache = {
  raw: null,
  processed: null,
  fetchedAt: 0,
  error: null,
};
let inFlight = null;

async function refresh() {
  if (inFlight) return inFlight; // de-dupe concurrent refreshes
  inFlight = (async () => {
    try {
      const raw = await fetchOptionChainRaw();
      cache.raw = raw;
      cache.processed = processChain(raw, STRIKE_WINDOW);
      cache.fetchedAt = Date.now();
      cache.error = null;
      console.log(
        `[${new Date().toLocaleTimeString()}] NSE refresh OK | spot=${cache.processed.underlyingValue}`
      );
    } catch (err) {
      cache.error = err.message;
      console.error(
        `[${new Date().toLocaleTimeString()}] NSE refresh FAILED: ${err.message}`
      );
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Returns cached data; triggers a refresh only if older than REFRESH_MS.
async function getData() {
  const age = Date.now() - cache.fetchedAt;
  if (!cache.processed || age >= REFRESH_MS) {
    await refresh();
  }
  return cache;
}

// ---- routes ----
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasData: !!cache.processed,
    ageSeconds: cache.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 1000) : null,
    refreshIntervalSeconds: REFRESH_MS / 1000,
    lastError: cache.error,
  });
});

app.get('/api/option-chain', async (req, res) => {
  try {
    const data = await getData();
    if (!data.processed) {
      return res.status(503).json({ error: data.error || 'No data yet, try again shortly.' });
    }
    // optional ?expiry=current|next filter
    const filter = req.query.expiry;
    let payload = data.processed;
    if (filter === 'current' || filter === 'next') {
      payload = {
        ...payload,
        expiries: payload.expiries.filter((e) => e.label === filter),
      };
    }
    res.json({
      ...payload,
      cacheAgeSeconds: Math.round((Date.now() - data.fetchedAt) / 1000),
      refreshIntervalSeconds: REFRESH_MS / 1000,
      staleError: data.error,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// raw passthrough for debugging
app.get('/api/raw', async (req, res) => {
  const data = await getData();
  if (!data.raw) return res.status(503).json({ error: data.error || 'No data yet.' });
  res.json(data.raw);
});

app.listen(PORT, () => {
  console.log(`\nNSE Option Chain server running:`);
  console.log(`  Local UI : http://localhost:${PORT}`);
  console.log(`  API      : http://localhost:${PORT}/api/option-chain`);
  console.log(`  Refresh  : every ${REFRESH_MS / 1000}s\n`);
  // warm up + keep cache fresh on a timer (lazy fetch also covers this)
  refresh();
  setInterval(refresh, REFRESH_MS);
});
