#!/usr/bin/env node

/**
 * Weekly Report Orchestrator
 *
 * This script orchestrates the entire weekly report generation process:
 * 1. Fetches Sentry payment data (success and error events)
 * 2. Fetches Gravity Forms application data
 * 3. Generates HTML and PDF reports
 * 4. Sends email with the report attached
 *
 * Usage:
 *   node src/run_weekly_report.js [--days N] [--skip-email] [--skip-sentry]
 *
 * Environment variables required:
 *   - SENTRY_TOKEN: Sentry API token
 *   - GRAVITY_FORMS_URL: WordPress site URL
 *   - GRAVITY_FORMS_KEY: Gravity Forms consumer key
 *   - GRAVITY_FORMS_SECRET: Gravity Forms consumer secret
 *   - GMAIL_USER: Gmail address for sending
 *   - GMAIL_APP_PASSWORD: Gmail app password
 *   - REPORT_RECIPIENTS: Comma-separated email addresses
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Import modules
const { fetchGravityFormsData } = require('./fetch_gravity_forms');
const { sendReportEmail } = require('./send_email');

// Import from parent directory
const { fetchMissingChunks } = require('../fetch_payment_data');
const {
    loadChunksInDateRange,
    loadApplicationsData,
    processPaymentErrors,
    processPaymentSuccess,
    processMidRulesErrors,
    generateHTMLReport,
    generatePDF,
    formatDate
} = require('../process_payment_report');

// Configuration
const PAYMENT_ERROR_ISSUE_ID = "6722248692";
const PAYMENT_SUCCESS_ISSUE_ID = "6722249177";
const DATA_DIR = path.join(__dirname, '../data');
const MANUAL_DIR = path.join(DATA_DIR, 'manual');

/**
 * Main orchestrator function
 */
async function runWeeklyReport(options = {}) {
    const {
        days = 7,
        skipEmail = false,
        skipSentry = false,
        skipGravityForms = false
    } = options;

    console.log('\n' + '='.repeat(70));
    console.log('   DLC Weekly Application & Payment Report Generator');
    console.log('='.repeat(70));

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`\nReport Period: ${startDateStr} to ${endDateStr} (${days} days)`);
    console.log(`Generated at: ${new Date().toISOString()}`);
    console.log('='.repeat(70));

    let gravityData = null;
    let errorEvents = [];
    let successEvents = [];

    // Step 1: Fetch Gravity Forms data
    if (!skipGravityForms) {
        try {
            console.log('\n📊 STEP 1: Fetching Gravity Forms Data');
            console.log('-'.repeat(50));
            gravityData = await fetchGravityFormsData(startDate, endDate);

            // Save to applications_data.json
            if (!fs.existsSync(MANUAL_DIR)) {
                fs.mkdirSync(MANUAL_DIR, { recursive: true });
            }
            const outputPath = path.join(MANUAL_DIR, 'applications_data.json');
            fs.writeFileSync(outputPath, JSON.stringify(gravityData, null, 2));
            console.log(`✓ Saved Gravity Forms data to: ${outputPath}`);
        } catch (error) {
            console.error(`⚠ Gravity Forms fetch failed: ${error.message}`);
            console.log('Continuing without Gravity Forms data...');
        }
    } else {
        console.log('\n⏭ STEP 1: Skipping Gravity Forms fetch (--skip-gravity-forms)');
        gravityData = loadApplicationsData();
    }

    // Step 2: Fetch Sentry data
    if (!skipSentry) {
        console.log('\n📈 STEP 2: Fetching Sentry Payment Data');
        console.log('-'.repeat(50));

        try {
            // Fetch Payment Error data
            await fetchMissingChunks(
                PAYMENT_ERROR_ISSUE_ID,
                'Payment Error',
                'payment_error',
                startDateStr,
                endDateStr
            );

            // Fetch Payment Success data
            await fetchMissingChunks(
                PAYMENT_SUCCESS_ISSUE_ID,
                'Payment Success',
                'payment_success',
                startDateStr,
                endDateStr
            );

            console.log('✓ Sentry data fetch complete');
        } catch (error) {
            console.error(`⚠ Sentry fetch failed: ${error.message}`);
        }
    } else {
        console.log('\n⏭ STEP 2: Skipping Sentry fetch (--skip-sentry)');
    }

    // Step 3: Load and process data
    console.log('\n📋 STEP 3: Processing Data');
    console.log('-'.repeat(50));

    // Load Sentry events from cache
    errorEvents = loadChunksInDateRange(
        PAYMENT_ERROR_ISSUE_ID,
        'Payment Error',
        startDateStr,
        endDateStr
    );
    console.log(`Loaded ${errorEvents.length} Payment Error events`);

    successEvents = loadChunksInDateRange(
        PAYMENT_SUCCESS_ISSUE_ID,
        'Payment Success',
        startDateStr,
        endDateStr
    );
    console.log(`Loaded ${successEvents.length} Payment Success events`);

    // Process data
    const errorReasons = processPaymentErrors(errorEvents);
    const merchants = processPaymentSuccess(successEvents);

    // Calculate totals
    const totalErrorEvents = errorReasons.reduce((sum, item) => sum + item.count, 0);
    const totalErrorUsers = new Set(errorEvents.map(e => e.userId)).size;
    const totalSuccessEvents = merchants.reduce((sum, item) => sum + item.count, 0);
    const totalSuccessUsers = new Set(successEvents.map(e => e.userId)).size;

    // Prepare chart data (top 12 + others)
    const topErrorReasons = errorReasons.slice(0, 12);
    const otherErrorReasons = errorReasons.slice(12);

    let chartErrorReasons = topErrorReasons.map(item => ({
        ...item,
        percentage: totalErrorEvents > 0
            ? parseFloat(((item.count / totalErrorEvents) * 100).toFixed(2))
            : 0
    }));

    if (otherErrorReasons.length > 0) {
        const othersCount = otherErrorReasons.reduce((sum, item) => sum + item.count, 0);
        chartErrorReasons.push({
            reason: 'Others',
            count: othersCount,
            uniqueUsers: otherErrorReasons.reduce((sum, item) => sum + item.uniqueUsers, 0),
            percentage: totalErrorEvents > 0
                ? parseFloat(((othersCount / totalErrorEvents) * 100).toFixed(2))
                : 0
        });
    }

    const allErrorReasons = errorReasons.map(item => ({
        ...item,
        percentage: totalErrorEvents > 0
            ? parseFloat(((item.count / totalErrorEvents) * 100).toFixed(2))
            : 0
    }));

    const errorData = {
        totalEvents: totalErrorEvents,
        totalUsers: totalErrorUsers,
        chartReasons: chartErrorReasons,
        reasons: allErrorReasons
    };

    const successData = {
        totalEvents: totalSuccessEvents,
        totalUsers: totalSuccessUsers,
        merchants: merchants.map(item => ({
            ...item,
            percentage: totalSuccessEvents > 0
                ? parseFloat(((item.count / totalSuccessEvents) * 100).toFixed(2))
                : 0
        }))
    };

    // Load applications data (may have been updated by Gravity Forms fetch)
    const applicationsData = loadApplicationsData();

    // Process MID Rules error details
    const midRulesData = processMidRulesErrors(errorEvents);

    console.log('\n📊 Summary:');
    console.log(`  Payment Success: ${totalSuccessEvents.toLocaleString()} events, ${totalSuccessUsers.toLocaleString()} users`);
    console.log(`  Payment Error:   ${totalErrorEvents.toLocaleString()} events, ${totalErrorUsers.toLocaleString()} users`);
    if (midRulesData) {
        console.log(`  MID Rules Errors: ${midRulesData.totalEvents.toLocaleString()} events, ${midRulesData.totalUsers.toLocaleString()} users`);
    }
    if (applicationsData) {
        console.log(`  Applications:    ${applicationsData.applications?.total?.toLocaleString() || 'N/A'} total`);
    }

    // Step 4: Generate reports
    console.log('\n📄 STEP 4: Generating Reports');
    console.log('-'.repeat(50));

    const htmlFile = generateHTMLReport(errorData, successData, applicationsData, startDateStr, endDateStr, false, midRulesData);
    console.log(`✓ HTML report: ${htmlFile}`);

    const pdfFile = await generatePDF(htmlFile);

    // Step 5: Send email
    if (!skipEmail && pdfFile) {
        console.log('\n📧 STEP 5: Sending Email');
        console.log('-'.repeat(50));

        try {
            await sendReportEmail(pdfFile, htmlFile, {
                startDate: startDateStr,
                endDate: endDateStr,
                applications: applicationsData ? {
                    total: applicationsData.applications?.total,
                    firstTime: applicationsData.applications?.firstTimeApplications
                } : null,
                payments: {
                    successEvents: totalSuccessEvents,
                    successUsers: totalSuccessUsers,
                    errorEvents: totalErrorEvents,
                    errorUsers: totalErrorUsers
                }
            });
        } catch (error) {
            console.error(`⚠ Email send failed: ${error.message}`);
        }
    } else if (skipEmail) {
        console.log('\n⏭ STEP 5: Skipping email (--skip-email)');
    } else {
        console.log('\n⚠ STEP 5: Skipping email (no PDF generated)');
    }

    // Done!
    console.log('\n' + '='.repeat(70));
    console.log('   ✓ Weekly Report Generation Complete!');
    console.log('='.repeat(70));
    console.log(`\nOutput files:`);
    console.log(`  HTML: ${htmlFile}`);
    if (pdfFile) console.log(`  PDF:  ${pdfFile}`);
    console.log('');

    return { htmlFile, pdfFile };
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        days: 7,
        skipEmail: false,
        skipSentry: false,
        skipGravityForms: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--days':
                options.days = parseInt(args[++i], 10) || 7;
                break;
            case '--skip-email':
                options.skipEmail = true;
                break;
            case '--skip-sentry':
                options.skipSentry = true;
                break;
            case '--skip-gravity-forms':
                options.skipGravityForms = true;
                break;
            case '--help':
            case '-h':
                console.log(`
DLC Weekly Report Generator

Usage: node src/run_weekly_report.js [options]

Options:
  --days N              Number of days to include in report (default: 7)
  --skip-email          Generate report but don't send email
  --skip-sentry         Skip fetching Sentry data (use cached)
  --skip-gravity-forms  Skip fetching Gravity Forms data (use cached)
  --help, -h            Show this help message

Environment Variables:
  SENTRY_TOKEN          Sentry API token
  GRAVITY_FORMS_URL     WordPress site URL
  GRAVITY_FORMS_KEY     Gravity Forms consumer key
  GRAVITY_FORMS_SECRET  Gravity Forms consumer secret
  GMAIL_USER            Gmail address for sending
  GMAIL_APP_PASSWORD    Gmail app password
  REPORT_RECIPIENTS     Comma-separated email addresses
                `);
                process.exit(0);
        }
    }

    return options;
}

// Main entry point
if (require.main === module) {
    const options = parseArgs();
    runWeeklyReport(options)
        .then(() => process.exit(0))
        .catch(error => {
            console.error('\n✗ Fatal error:', error.message);
            process.exit(1);
        });
}

module.exports = { runWeeklyReport };
