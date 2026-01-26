#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration - requires SENTRY_TOKEN environment variable
const SENTRY_TOKEN = process.env.SENTRY_TOKEN;
if (!SENTRY_TOKEN) {
    console.error('Error: SENTRY_TOKEN environment variable is required');
    process.exit(1);
}
const ORGANIZATION_SLUG = process.env.SENTRY_ORG || "xajeet";
const PAYMENT_ERROR_ISSUE_ID = "6722248692";
const PAYMENT_SUCCESS_ISSUE_ID = "6722249177";

// Paths
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');

// Chunk configuration - 30 days per chunk (single chunk for full period)
const CHUNK_DAYS = 30;

// Ensure directories exist
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

ensureDir(DATA_DIR);
ensureDir(RAW_DIR);

// Date utilities
function formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function parseDate(dateStr) {
    return new Date(dateStr + 'T00:00:00Z');
}

function addDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function getDateRanges(startDate, endDate, chunkDays = CHUNK_DAYS) {
    const ranges = [];
    let currentStart = new Date(startDate);

    while (currentStart < endDate) {
        let currentEnd = addDays(currentStart, chunkDays - 1);
        if (currentEnd > endDate) {
            currentEnd = new Date(endDate);
        }

        ranges.push({
            start: formatDate(currentStart),
            end: formatDate(currentEnd)
        });

        currentStart = addDays(currentEnd, 1);
    }

    return ranges;
}

// File utilities
function getChunkDir(issueId, issueName) {
    const dirName = `${issueName.toLowerCase().replace(/\s+/g, '_')}_${issueId}`;
    return path.join(RAW_DIR, dirName);
}

function getChunkFilename(chunkDir, startDate, endDate) {
    return path.join(chunkDir, `${startDate}_to_${endDate}.json`);
}

function loadExistingChunks(issueId, issueName) {
    const chunkDir = getChunkDir(issueId, issueName);

    if (!fs.existsSync(chunkDir)) {
        return [];
    }

    const files = fs.readdirSync(chunkDir);
    const chunks = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const match = f.match(/^(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})\.json$/);
            if (match) {
                return {
                    filename: f,
                    path: path.join(chunkDir, f),
                    start: match[1],
                    end: match[2]
                };
            }
            return null;
        })
        .filter(Boolean);

    return chunks;
}

function saveChunk(issueId, issueName, startDate, endDate, events) {
    const chunkDir = getChunkDir(issueId, issueName);
    ensureDir(chunkDir);

    const chunkFile = getChunkFilename(chunkDir, startDate, endDate);

    const chunkData = {
        fetchDate: new Date().toISOString(),
        issueId: issueId,
        issueName: issueName,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        totalEvents: events.length,
        events: events
    };

    fs.writeFileSync(chunkFile, JSON.stringify(chunkData, null, 2));
    console.log(`  ✓ Saved chunk: ${startDate} to ${endDate} (${events.length} events)`);
}

// API utilities
async function fetchWithPagination(url, headers) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const linkHeader = res.headers.link;
                    resolve({ data: json, linkHeader });
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function extractMinimalEventData(event, issueType) {
    const user = event.user || {};
    const userId = user.id || user.email || user.ip_address || 'anonymous';

    const minimalEvent = {
        timestamp: event.dateCreated || event.dateReceived || new Date().toISOString(),
        eventId: event.id || event.eventID,
        userId: userId
    };

    // Extract issue-specific fields
    if (issueType === 'payment_error') {
        const tags = event.tags || [];
        for (const tag of tags) {
            if (tag.key === 'paymentErrorReason') {
                minimalEvent.paymentErrorReason = tag.value || 'Unknown';
            } else if (tag.key === 'merchant_id') {
                minimalEvent.merchant_id = tag.value;
            } else if (tag.key === 'customerId') {
                minimalEvent.customerId = tag.value;
            } else if (tag.key === 'storeState') {
                minimalEvent.storeState = tag.value;
            } else if (tag.key === 'storeId') {
                minimalEvent.storeId = tag.value;
            }
        }
    } else if (issueType === 'payment_success') {
        const tags = event.tags || [];
        for (const tag of tags) {
            if (tag.key === 'merchant_id') {
                minimalEvent.merchant_id = tag.value || 'Unknown';
                break;
            }
        }
    }

    return minimalEvent;
}

async function fetchDateRangeChunk(issueId, issueName, issueType, startDate, endDate) {
    console.log(`\n  Fetching ${issueName}: ${startDate} to ${endDate}...`);

    // Use absolute date parameters for historical data
    // Convert dates to ISO 8601 format for Sentry API
    const startISO = `${startDate}T00:00:00Z`;
    const endISO = `${endDate}T23:59:59Z`;

    const url = `https://sentry.io/api/0/organizations/${ORGANIZATION_SLUG}/issues/${issueId}/events/?full=true&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;

    const headers = {
        'Authorization': `Bearer ${SENTRY_TOKEN}`,
        'Content-Type': 'application/json'
    };

    const allEvents = [];
    let currentUrl = url;
    let pageNum = 1;

    try {
        while (currentUrl) {
            const { data, linkHeader } = await fetchWithPagination(currentUrl, headers);

            // Filter events by date range and extract minimal data
            for (const event of data) {
                const eventDate = event.dateCreated || event.dateReceived;
                if (eventDate) {
                    const eventDateObj = new Date(eventDate);
                    const eventDateStr = formatDate(eventDateObj);

                    // Check if event is within our target date range
                    if (eventDateStr >= startDate && eventDateStr <= endDate) {
                        const minimalEvent = extractMinimalEventData(event, issueType);
                        allEvents.push(minimalEvent);
                    }
                }
            }

            console.log(`    Page ${pageNum}: ${allEvents.length} events in range so far`);

            // Parse Link header for next page
            currentUrl = null;
            if (linkHeader) {
                const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                if (nextMatch) {
                    currentUrl = nextMatch[1];
                    pageNum++;
                }
            }

            if (data.length === 0) break;
        }

        console.log(`  ✓ Fetched ${allEvents.length} events in date range`);
        return allEvents;

    } catch (error) {
        console.error(`  ✗ Error fetching chunk: ${error.message}`);
        return [];
    }
}

async function fetchMissingChunks(issueId, issueName, issueType, startDate, endDate) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Fetching: ${issueName} (Issue #${issueId})`);
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log('='.repeat(60));

    // Get all date ranges
    const allRanges = getDateRanges(parseDate(startDate), parseDate(endDate));
    console.log(`\nTotal date ranges: ${allRanges.length}`);

    // Check existing chunks
    const existingChunks = loadExistingChunks(issueId, issueName);
    const existingRanges = new Set(existingChunks.map(c => `${c.start}_to_${c.end}`));

    console.log(`Existing chunks: ${existingChunks.length}`);
    if (existingChunks.length > 0) {
        existingChunks.forEach(c => {
            console.log(`  - ${c.start} to ${c.end}`);
        });
    }

    // Identify missing ranges
    const missingRanges = allRanges.filter(r => !existingRanges.has(`${r.start}_to_${r.end}`));
    console.log(`\nMissing chunks: ${missingRanges.length}`);

    if (missingRanges.length === 0) {
        console.log('✓ All data already cached!');
        return;
    }

    // Fetch missing chunks
    for (let i = 0; i < missingRanges.length; i++) {
        const range = missingRanges[i];
        console.log(`\nFetching chunk ${i + 1}/${missingRanges.length}:`);

        const events = await fetchDateRangeChunk(
            issueId,
            issueName,
            issueType,
            range.start,
            range.end
        );

        if (events.length > 0) {
            saveChunk(issueId, issueName, range.start, range.end, events);
        } else {
            console.log(`  ⚠ No events found for this date range`);
            // Still save empty chunk to mark as fetched
            saveChunk(issueId, issueName, range.start, range.end, []);
        }
    }

    console.log(`\n✓ Completed fetching ${issueName}`);
}

async function main() {
    const args = process.argv.slice(2);

    // Parse command line arguments
    let daysBack = 30;
    let specificIssue = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--days' && args[i + 1]) {
            daysBack = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--issue' && args[i + 1]) {
            specificIssue = args[i + 1];
            i++;
        }
    }

    const endDate = new Date();
    const startDate = addDays(endDate, -daysBack);

    console.log('\n' + '='.repeat(60));
    console.log('Payment Data Fetcher with Date-Range Chunking');
    console.log('='.repeat(60));
    console.log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
    console.log(`Chunk Size: ${CHUNK_DAYS} days`);
    console.log('='.repeat(60));

    // Fetch data for both issues
    if (!specificIssue || specificIssue === 'error') {
        await fetchMissingChunks(
            PAYMENT_ERROR_ISSUE_ID,
            'Payment Error',
            'payment_error',
            formatDate(startDate),
            formatDate(endDate)
        );
    }

    if (!specificIssue || specificIssue === 'success') {
        await fetchMissingChunks(
            PAYMENT_SUCCESS_ISSUE_ID,
            'Payment Success',
            'payment_success',
            formatDate(startDate),
            formatDate(endDate)
        );
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ All data fetched successfully!');
    console.log('='.repeat(60));
    console.log('\nTo generate a report, run:');
    console.log(`  node process_payment_report.js --start-date ${formatDate(startDate)} --end-date ${formatDate(endDate)}`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    fetchMissingChunks,
    loadExistingChunks,
    getDateRanges,
    getChunkDir
};
