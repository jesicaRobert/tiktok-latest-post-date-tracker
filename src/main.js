onst path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const { fetchLatestPostTimestamp } = require('./extractors/tiktok_scraper');
const { formatResult } = require('./outputs/result_formatter');

const logger = pino({
level: process.env.LOG_LEVEL || 'info',
transport:
process.env.NODE_ENV === 'production'
? undefined
: {
target: 'pino-pretty',
options: { translateTime: 'SYS:standard', colorize: true },
},
});

/**
* Load JSON config if present, otherwise use defaults.
*/
function loadSettings() {
const configDir = path.join(__dirname, 'config');
const examplePath = path.join(configDir, 'settings.example.json');
let settings = {
headless: true,
defaultType: 'videos',
navigationTimeoutMs: 45000,
concurrentChannels: 2,
outputPath: path.join(__dirname, '..', 'data', 'output.sample.json'),
channelsPath: path.join(__dirname, '..', 'data', 'channels.sample.txt'),
};

try {
if (fs.existsSync(examplePath)) {
const data = fs.readFileSync(examplePath, 'utf8');
const parsed = JSON.parse(data);
settings = { ...settings, ...parsed };
}
} catch (err) {
logger.warn({ err }, 'Failed to read settings.example.json, using defaults');
}

return settings;
}

/**
* Very small CLI parser for flags like:
* --channels a,b,c --type videos --use-sample
*/
function parseCliArgs(argv) {
const args = argv.slice(2);
const result = {};
for (let i = 0; i < args.length; i += 1) {
const arg = args[i];
if (!arg.startsWith('--')) continue;

const key = arg.replace(/^--/, '');
const next = args[i + 1];

if (key === 'use-sample') {
result.useSample = true;
i -= 1; // no value consumed
} else if (key === 'channels' && next && !next.startsWith('--')) {
result.channels = next.split(',').map((c) => c.trim()).filter(Boolean);
i += 1;
} else if (key === 'type' && next && !next.startsWith('--')) {
result.type = next.trim();
i += 1;
}
}
return result;
}

/**
* Load channels either from CLI or sample file.
*/
async function loadChannels(cliOptions, settings) {
if (cliOptions.channels && cliOptions.channels.length > 0) {
return cliOptions.channels;
}

const useSample = cliOptions.useSample ?? true;
if (!useSample) {
throw new Error(
'No channels provided. Use --channels user1,user2 or --use-sample to load sample channels.'
);
}

const filePath = settings.channelsPath;
logger.info({ filePath }, 'Loading channels from sample file');

const exists = await fs.pathExists(filePath);
if (!exists) {
throw new Error(`Sample channels file not found at ${filePath}`);
}

const content = await fs.readFile(filePath, 'utf8');
return content
.split('\n')
.map((line) => line.trim())
.filter((line) => line && !line.startsWith('#'));
}

/**
* Basic concurrency controller for promises.
*/
async function mapWithConcurrency(items, concurrency, mapper) {
const results = [];
let index = 0;

async function worker() {
while (index < items.length) {
const currentIndex = index;
index += 1;
try {
results[currentIndex] = await mapper(items[currentIndex], currentIndex);
} catch (err) {
results[currentIndex] = { error: err };
}
}
}

const workers = [];
const numWorkers = Math.max(1, Math.min(concurrency, items.length || 1));
for (let i = 0; i < numWorkers; i += 1) {
workers.push(worker());
}

await Promise.all(workers);
return results;
}

async function main() {
const settings = loadSettings();
const cliOptions = parseCliArgs(process.argv);

const channels = await loadChannels(cliOptions, settings);
const contentType = cliOptions.type || settings.defaultType || null;

logger.info(
{
count: channels.length,
type: contentType || 'default',
concurrentChannels: settings.concurrentChannels,
},
'Starting TikTok Latest Post Date Tracker'
);

const { launchBrowser } = require('./extractors/tiktok_scraper');

const browser = await launchBrowser({
headless: settings.headless,
logger,
});

const results = [];
try {
const mapped = await mapWithConcurrency(
channels,
settings.concurrentChannels,
async (channel) => {
try {
const timestamps = await fetchLatestPostTimestamp({
browser,
channel,
type: contentType,
timeoutMs: settings.navigationTimeoutMs,
logger,
});

return formatResult({
channel,
type: contentType,
timestamps,
});
} catch (err) {
logger.error({ err, channel }, 'Failed to fetch latest post timestamp');
return {
channel,
error: true,
errorMessage: err.message || 'Unknown error',
};
}
}
);

for (const item of mapped) {
if (item) results.push(item);
}
} finally {
if (browser) {
try {
await browser.close();
} catch (err) {
logger.warn({ err }, 'Error while closing browser');
}
}
}

// Output to stdout
const outputJson = JSON.stringify(results, null, 2);
// eslint-disable-next-line no-console
console.log(outputJson);

// Persist to file
const outputPath = settings.outputPath;
try {
await fs.ensureDir(path.dirname(outputPath));
await fs.writeFile(outputPath, outputJson, 'utf8');
logger.info({ outputPath }, 'Results written to file');
} catch (err) {
logger.error({ err, outputPath }, 'Failed to write results to file');
}
}

if (require.main === module) {
main().catch((err) => {
logger.error({ err }, 'Fatal error in main');
process.exitCode = 1;
});
}