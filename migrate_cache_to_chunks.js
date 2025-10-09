#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');

// Configuration
const PAYMENT_ERROR_ISSUE_ID = "6722248692";
const CHUNK_DAYS = 7;

function formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function parseDate(dateStr) {
    return new Date(dateStr);
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

function getChunkDir(issueId, issueName) {
    const dirName = `${issueName.toLowerCase().replace(/\s+/g, '_')}_${issueId}`;
    return path.join(RAW_DIR, dirName);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function extractMinimalEventData(event) {
    const user = event.user || {};
    const userId = user.id || user.email || user.ip_address || 'anonymous';

    const minimalEvent = {
        timestamp: event.dateCreated || event.dateReceived || new Date().toISOString(),
        eventId: event.id || event.eventID,
        userId: userId
    };

    // Extract paymentErrorReason
    const tags = event.tags || [];
    for (const tag of tags) {
        if (tag.key === 'paymentErrorReason') {
            minimalEvent.paymentErrorReason = tag.value || 'Unknown';
            break;
        }
    }

    return minimalEvent;
}

function migratePaymentErrorCache() {
    const oldCacheFile = path.join(RAW_DIR, 'issue_6722248692_events_30d_2025-10-09.json');

    if (!fs.existsSync(oldCacheFile)) {
        console.log('❌ Old cache file not found:', oldCacheFile);
        return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migrating Payment Error Cache to Chunked Format');
    console.log('='.repeat(60));

    console.log('\n1. Loading old cache file...');
    console.log('   File:', path.basename(oldCacheFile));

    const cacheData = JSON.parse(fs.readFileSync(oldCacheFile, 'utf8'));
    const events = cacheData.events || [];

    console.log(`   ✓ Loaded ${events.length} events`);

    // Extract minimal event data and organize by date
    console.log('\n2. Extracting minimal event data...');

    const eventsByDate = {};
    let minDate = null;
    let maxDate = null;

    for (const event of events) {
        const minimalEvent = extractMinimalEventData(event);
        const eventDate = minimalEvent.timestamp.split('T')[0]; // YYYY-MM-DD

        if (!eventsByDate[eventDate]) {
            eventsByDate[eventDate] = [];
        }
        eventsByDate[eventDate].push(minimalEvent);

        const date = parseDate(minimalEvent.timestamp);
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
    }

    console.log(`   ✓ Date range: ${formatDate(minDate)} to ${formatDate(maxDate)}`);
    console.log(`   ✓ Unique dates: ${Object.keys(eventsByDate).length}`);

    // Create date ranges (weekly chunks)
    console.log('\n3. Creating weekly chunks...');
    const dateRanges = getDateRanges(minDate, maxDate, CHUNK_DAYS);
    console.log(`   ✓ Will create ${dateRanges.length} chunks (${CHUNK_DAYS} days each)`);

    // Create chunk directory
    const chunkDir = getChunkDir(PAYMENT_ERROR_ISSUE_ID, 'Payment Error');
    ensureDir(chunkDir);

    // Save events in chunks
    console.log('\n4. Saving chunks...');

    for (const range of dateRanges) {
        const chunkEvents = [];

        // Collect all events in this date range
        for (const date in eventsByDate) {
            if (date >= range.start && date <= range.end) {
                chunkEvents.push(...eventsByDate[date]);
            }
        }

        if (chunkEvents.length > 0) {
            const chunkFile = path.join(chunkDir, `${range.start}_to_${range.end}.json`);

            const chunkData = {
                fetchDate: new Date().toISOString(),
                issueId: PAYMENT_ERROR_ISSUE_ID,
                issueName: 'Payment Error',
                dateRangeStart: range.start,
                dateRangeEnd: range.end,
                totalEvents: chunkEvents.length,
                events: chunkEvents
            };

            fs.writeFileSync(chunkFile, JSON.stringify(chunkData, null, 2));
            console.log(`   ✓ Saved: ${range.start} to ${range.end} (${chunkEvents.length} events)`);
        } else {
            console.log(`   ⚠ Skipped: ${range.start} to ${range.end} (no events)`);
        }
    }

    // Rename old cache file (don't delete, just in case)
    const backupFile = oldCacheFile + '.backup';
    fs.renameSync(oldCacheFile, backupFile);
    console.log(`\n5. Renamed old cache file to: ${path.basename(backupFile)}`);

    console.log('\n' + '='.repeat(60));
    console.log('✓ Migration completed successfully!');
    console.log('='.repeat(60));
    console.log(`\nChunked data saved to: ${chunkDir}`);
    console.log(`Backup of original cache: ${backupFile}`);
}

if (require.main === module) {
    migratePaymentErrorCache();
}

module.exports = { migratePaymentErrorCache };
