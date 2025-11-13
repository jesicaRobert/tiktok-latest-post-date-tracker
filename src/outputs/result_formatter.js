js/**
 * Formats the scraper output into the documented structure:
 * {
 *   "channel": "johndoe",
 *   "lastPostTime": 1699658443,
 *   "lastPostTimeISO": "2023-11-10T23:20:43.000Z",
 *   "type": "videos"
 * }
 */

function formatResult({ channel, type, timestamps }) {
  const normalizedChannel = String(channel || '').trim();

  if (!timestamps || typeof timestamps.unix !== 'number' || !timestamps.iso) {
    return {
      channel: normalizedChannel,
      type: type || null,
      error: true,
      errorMessage: 'Missing or invalid timestamps data',
    };
  }

  return {
    channel: normalizedChannel,
    lastPostTime: timestamps.unix,
    lastPostTimeISO: timestamps.iso,
    type: type || null,
  };
}

module.exports = {
  formatResult,
};