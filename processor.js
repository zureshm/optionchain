'use strict';

/**
 * Transform raw NSE option-chain data (v3 format) into a compact, UI-friendly shape.
 * - Handles current week + next week expiry chains.
 * - For each expiry, returns ~`window` strikes centred on ATM, each tagged
 *   ITM / ATM / OTM for both CE and PE sides.
 */

function pickRow(item) {
  const ce = item.CE || {};
  const pe = item.PE || {};
  return {
    strikePrice: item.strikePrice,
    CE: {
      oi: ce.openInterest ?? 0,
      changeOi: ce.changeinOpenInterest ?? 0,
      volume: ce.totalTradedVolume ?? 0,
      iv: ce.impliedVolatility ?? 0,
      ltp: ce.lastPrice ?? 0,
      change: ce.change ?? 0,
    },
    PE: {
      oi: pe.openInterest ?? 0,
      changeOi: pe.changeinOpenInterest ?? 0,
      volume: pe.totalTradedVolume ?? 0,
      iv: pe.impliedVolatility ?? 0,
      ltp: pe.lastPrice ?? 0,
      change: pe.change ?? 0,
    },
  };
}

/**
 * Process a single expiry chain (v3: records.data already filtered to one expiry)
 */
function processOneExpiry(chain, label, underlying, window) {
  const records = chain && chain.records;
  if (!records || !Array.isArray(records.data)) return null;

  const spot = underlying || records.underlyingValue;

  const rows = records.data
    .filter((d) => d.CE || d.PE)
    .map(pickRow)
    .sort((a, b) => a.strikePrice - b.strikePrice);

  if (rows.length === 0) return null;

  // find ATM = strike nearest to underlying
  let atmIdx = 0;
  let best = Infinity;
  rows.forEach((r, idx) => {
    const diff = Math.abs(r.strikePrice - spot);
    if (diff < best) {
      best = diff;
      atmIdx = idx;
    }
  });

  const half = Math.floor(window / 2);
  const start = Math.max(0, atmIdx - half);
  const end = Math.min(rows.length, start + window + 1);
  const sliced = rows.slice(start, end);
  const atmStrike = rows[atmIdx].strikePrice;

  const tagged = sliced.map((r) => {
    let moneyness;
    if (r.strikePrice === atmStrike) moneyness = 'ATM';
    else if (r.strikePrice < atmStrike) moneyness = 'ITM_CE';
    else moneyness = 'OTM_CE';
    return { ...r, moneyness };
  });

  const expiryDate =
    records.expiryDates?.[0] ||
    (records.data[0] && (records.data[0].expiryDates || records.data[0].expiryDate)) ||
    label;

  return {
    label,
    expiryDate,
    atmStrike,
    rows: tagged,
  };
}

/**
 * @param {object} raw  combined object from nseClient { _v3, currentChain, nextChain, ... }
 * @param {number} window number of strikes to show around ATM (default 10)
 */
function processChain(raw, window = 10) {
  if (!raw || !raw._v3) {
    throw new Error('Unexpected NSE payload shape');
  }

  // Determine underlying from the first available chain
  const firstRec = raw.currentChain?.records || raw.nextChain?.records;
  const underlying = firstRec?.underlyingValue ?? 0;

  const result = {
    underlyingValue: underlying,
    timestamp: firstRec?.timestamp || null,
    fetchedAt: new Date().toISOString(),
    expiries: [],
  };

  if (raw.currentChain) {
    const exp = processOneExpiry(raw.currentChain, 'current', underlying, window);
    if (exp) {
      exp.expiryDate = raw.currentExpiry || exp.expiryDate;
      result.expiries.push(exp);
    }
  }

  if (raw.nextChain) {
    const exp = processOneExpiry(raw.nextChain, 'next', underlying, window);
    if (exp) {
      exp.expiryDate = raw.nextExpiry || exp.expiryDate;
      result.expiries.push(exp);
    }
  }

  return result;
}

module.exports = { processChain };
