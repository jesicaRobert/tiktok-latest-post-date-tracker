js/**
 * Utilities for converting TikTok-style timestamps into Unix and ISO formats.
 */

function nowMs() {
  return Date.now();
}

/**
 * Parse relative time expressions like:
 *  "3h ago", "2 hours ago", "1d", "5 days", "10m ago" etc.
 */
function parseRelativeTime(str) {
  const text = String(str).toLowerCase().trim();

  const regex =
    /(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mos?|mth|years?|yrs?|y)\s*(ago)?/;
  const match = text.match(regex);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (Number.isNaN(value)) return null;

  let deltaMs = 0;
  const oneSecond = 1000;
  const oneMinute = 60 * oneSecond;
  const oneHour = 60 * oneMinute;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  const oneYear = 365 * oneDay;

  if (/^s(ec(ond)?s?)?$/.test(unit)) {
    deltaMs = value * oneSecond;
  } else if (/^m(in(ute)?s?)?$/.test(unit)) {
    deltaMs = value * oneMinute;
  } else if (/^h(our)?s?$/.test(unit)) {
    deltaMs = value * oneHour;
  } else if (/^d(ay)?s?$/.test(unit)) {
    deltaMs = value * oneDay;
  } else if (/^w(eek)?s?$/.test(unit)) {
    deltaMs = value * oneWeek;
  } else if (/^m(o(nth)?s?)?$/.test(unit)) {
    deltaMs = value * oneMonth;
  } else if (/^y(ear)?s?$/.test(unit)) {
    deltaMs = value * oneYear;
  } else {
    return null;
  }

  return new Date(nowMs() - deltaMs);
}

/**
 * Normalize various timestamp formats into:
 *  - unix: seconds since epoch
 *  - iso: ISO 8601 string
 */
function normalizeTimestamp(raw) {
  if (raw == null) {
    throw new Error('normalizeTimestamp: raw timestamp is required');
  }

  // If it's already a number, assume seconds or milliseconds
  if (typeof raw === 'number') {
    const unix =
      raw > 1e12
        ? Math.floor(raw / 1000) // ms -> seconds
        : raw;
    return {
      unix,
      iso: new Date(unix * 1000).toISOString(),
    };
  }

  // If it's a Date instance
  if (raw instanceof Date) {
    const unix = Math.floor(raw.getTime() / 1000);
    return {
      unix,
      iso: raw.toISOString(),
    };
  }

  const str = String(raw).trim();

  // Numeric string: detect if seconds or ms
  if (/^\d{10,16}$/.test(str)) {
    const num = parseInt(str, 10);
    const unix =
      str.length > 10
        ? Math.floor(num / 1000) // assume ms
        : num;
    return {
      unix,
      iso: new Date(unix * 1000).toISOString(),
    };
  }

  // Relative time like "3h ago"
  const relative = parseRelativeTime(str);
  if (relative) {
    const unix = Math.floor(relative.getTime() / 1000);
    return {
      unix,
      iso: relative.toISOString(),
    };
  }

  // Try direct Date parsing (absolute date/time)
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const unix = Math.floor(parsed.getTime() / 1000);
    return {
      unix,
      iso: parsed.toISOString(),
    };
  }

  // If everything fails, return "now" but keep raw for debugging
  const fallback = new Date();
  const unix = Math.floor(fallback.getTime() / 1000);
  return {
    unix,
    iso: fallback.toISOString(),
  };
}

module.exports = {
  normalizeTimestamp,
  parseRelativeTime,
};