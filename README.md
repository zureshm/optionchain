# NSE NIFTY 50 Option Chain

Scrapes NSE's option-chain API for **NIFTY 50**, keeps only the
**current week** and **next week** expiries, and serves a simple option-chain UI
that highlights **ITM / ATM / OTM** strikes (~10 around ATM).

Data is refreshed at most **once every 30 seconds** (server-side cache) to avoid
being blocked by NSE.

## How it works
Uses the [`stock-nse-india`](https://www.npmjs.com/package/stock-nse-india) library which:
1. Manages cookies via `axios-cookiejar-support` + `tough-cookie`
2. Rotates User-Agent strings
3. Calls NSE's v3 API:
   - `/api/option-chain-contract-info?symbol=NIFTY` → expiry dates
   - `/api/option-chain-v3?type=Indices&symbol=NIFTY&expiry=...` → chain data

## Run
```bash
npm install
npm start
```
Server starts on **http://localhost:8080**

To use a different port: `set PORT=3000 && npm start` (Windows).

## Endpoints
| Route | Description |
|-------|-------------|
| `/` | Web UI |
| `/api/option-chain` | Processed chain (current + next week). `?expiry=current` or `?expiry=next` to filter |
| `/api/raw` | Raw NSE JSON (debug) |
| `/api/health` | Cache status |

## Notes
- NSE scraping is **unofficial** and can break or get rate-limited at any time.
- Data is available during and after market hours.
