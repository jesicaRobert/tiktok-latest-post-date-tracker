onst puppeteer = require('puppeteer');
const { normalizeTimestamp } = require('./time_utils');

/**
* Launch a Puppeteer browser instance.
* Kept separate for easier reuse and potential future testing.
*/
async function launchBrowser({ headless = true, logger }) {
try {
const browser = await puppeteer.launch({
headless,
args: [
'--no-sandbox',
'--disable-setuid-sandbox',
'--disable-dev-shm-usage',
'--disable-gpu',
'--no-first-run',
'--no-zygote',
],
});

logger.info({ headless }, 'Browser launched');
return browser;
} catch (err) {
if (logger) logger.error({ err }, 'Failed to launch browser');
throw err;
}
}

/**
* Build a TikTok profile URL from username or accept full URL as-is.
*/
function resolveProfileUrl(channel, type) {
const trimmed = channel.trim();
const isUrl = /^https?:\/\//i.test(trimmed);
const baseUrl = isUrl ? trimmed : `https://www.tiktok.com/@${trimmed}`;

// TikTok uses tabs like '?lang=en' or '?_t='; some variants use 'video' or 'live'
if (type && !isUrl) {
return `${baseUrl}?tab=${encodeURIComponent(type)}`;
}
return baseUrl;
}

/**
* Extracts the raw timestamp information from a TikTok profile page.
* This function is intentionally defensive to handle UI/layout changes.
*/
async function extractRawTimestamp(page) {
return page.evaluate(() => {
// Try various selectors that might represent the timestamp of the latest post
const candidates = [];

// Typical HTML5 datetime attribute on <time> element
const timeElements = Array.from(document.querySelectorAll('time'));
for (const time of timeElements) {
const datetime = time.getAttribute('datetime');
const text = (time.textContent || '').trim();
if (datetime) {
candidates.push(datetime);
} else if (text) {
candidates.push(text);
}
}

// TikTok sometimes uses spans/divs with "ago" text like "2d ago"
const agoElements = Array.from(
document.querySelectorAll('span, div, p')
).filter((el) => {
const t = (el.textContent || '').trim().toLowerCase();
return /\b(min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|m|minths|month|months|y|year|years)\b/.test(
t
);
});

for (const el of agoElements) {
const t = (el.textContent || '').trim();
if (t) candidates.push(t);
}

// Fallback: look into data attributes that contain timestamp-like values
const dataElements = Array.from(document.querySelectorAll('[data-e2e], [data-time]'));
for (const el of dataElements) {
const attrKeys = ['data-time', 'data-timestamp', 'data-ts'];
for (const key of attrKeys) {
const v = el.getAttribute(key);
if (v && /\d{4}-\d{2}-\d{2}/.test(v)) {
candidates.push(v);
}
}
}

// Return the first candidate or null
return candidates.length > 0 ? candidates[0] : null;
});
}

/**
* Fetch the latest post timestamp for a single TikTok channel.
*
* @param {Object} options
* @param {import('puppeteer').Browser} options.browser
* @param {string} options.channel
* @param {string|null} options.type
* @param {number} options.timeoutMs
* @param {Object} options.logger
* @returns {Promise<{ unix: number, iso: string, raw: string }>}
*/
async function fetchLatestPostTimestamp({ browser, channel, type, timeoutMs = 45000, logger }) {
if (!browser) {
throw new Error('Browser instance is required');
}
if (!channel) {
throw new Error('Channel is required');
}

const url = resolveProfileUrl(channel, type);
const page = await browser.newPage();

try {
await page.setUserAgent(
'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
'(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
);
await page.setViewport({ width: 1280, height: 720 });

logger.info({ channel, url }, 'Opening TikTok profile');

await page.goto(url, {
waitUntil: 'networkidle2',
timeout: timeoutMs,
});

// Try to accept cookies or close popups if present
try {
await page.evaluate(() => {
const labels = ['accept all', 'accept', 'agree'];
const buttons = Array.from(document.querySelectorAll('button'));
for (const btn of buttons) {
const text = (btn.textContent || '').trim().toLowerCase();
if (labels.includes(text)) {
btn.click();
break;
}
}
});
} catch (e) {
// Non-fatal, ignore
}

const raw = await extractRawTimestamp(page);
if (!raw) {
const error = new Error('Could not detect latest post timestamp on profile page');
error.code = 'NO_TIMESTAMP_FOUND';
throw error;
}

const normalized = normalizeTimestamp(raw);
logger.info({ channel, raw, normalized }, 'Extracted latest post timestamp');

return {
unix: normalized.unix,
iso: normalized.iso,
raw,
};
} catch (err) {
logger.error({ err, channel, url }, 'Error while scraping TikTok profile');
throw err;
} finally {
try {
await page.close();
} catch (e) {
if (logger) logger.warn({ e }, 'Failed to close page');
}
}
}

module.exports = {
launchBrowser,
fetchLatestPostTimestamp,
};