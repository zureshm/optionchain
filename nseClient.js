'use strict';

/**
 * NSE option-chain client using the stock-nse-india library.
 *
 * This library handles:
 *   - Cookie jar via axios-cookiejar-support + tough-cookie
 *   - Random User-Agent rotation
 *   - The new v3 API (/api/option-chain-v3)
 *
 * We fetch contract info first (to get expiry dates), then fetch
 * the option chain for current week + next week expiries.
 */

const { NseIndia } = require('stock-nse-india');
const nseIndia = new NseIndia();

/**
 * Fetch option chain data for NIFTY (current + next week expiry).
 * Returns a combined object that our processor can handle.
 */
async function fetchOptionChainRaw() {
  // Step 1: Get available expiry dates
  const contractInfo = await nseIndia.getIndexOptionChainContractInfo('NIFTY');
  const expiries = contractInfo.expiryDates || [];
  console.log(`[NSE] Found ${expiries.length} expiries. First two: ${expiries.slice(0, 2).join(', ')}`);

  if (expiries.length === 0) {
    throw new Error('No expiry dates returned from NSE');
  }

  // Step 2: Fetch option chain for current + next week
  const currentExpiry = expiries[0];
  const nextExpiry = expiries.length > 1 ? expiries[1] : null;

  const currentChain = await nseIndia.getIndexOptionChain('NIFTY', currentExpiry);

  let nextChain = null;
  if (nextExpiry) {
    nextChain = await nseIndia.getIndexOptionChain('NIFTY', nextExpiry);
  }

  // Return in a shape our processor understands
  return {
    _v3: true,
    expiries,
    currentExpiry,
    nextExpiry,
    currentChain,
    nextChain,
  };
}

module.exports = { fetchOptionChainRaw };
