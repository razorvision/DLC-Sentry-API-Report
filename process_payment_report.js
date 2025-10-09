#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const ORGANIZATION_SLUG = "xajeet";
const PAYMENT_ERROR_ISSUE_ID = "6722248692";
const PAYMENT_SUCCESS_ISSUE_ID = "6722249177";

// Paths
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const MANUAL_DIR = path.join(DATA_DIR, 'manual');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

// Ensure directories exist
if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

// Date utilities
function formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function parseDate(dateStr) {
    return new Date(dateStr + 'T00:00:00Z');
}

// File utilities
function getChunkDir(issueId, issueName) {
    const dirName = `${issueName.toLowerCase().replace(/\s+/g, '_')}_${issueId}`;
    return path.join(RAW_DIR, dirName);
}

function loadChunksInDateRange(issueId, issueName, startDate, endDate) {
    const chunkDir = getChunkDir(issueId, issueName);

    if (!fs.existsSync(chunkDir)) {
        console.log(`⚠ No data found for ${issueName}`);
        return [];
    }

    const files = fs.readdirSync(chunkDir).filter(f => f.endsWith('.json'));
    const allEvents = [];

    for (const file of files) {
        const match = file.match(/^(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})\.json$/);
        if (!match) continue;

        const chunkStart = match[1];
        const chunkEnd = match[2];

        // Check if chunk overlaps with requested date range
        if (chunkEnd >= startDate && chunkStart <= endDate) {
            const chunkPath = path.join(chunkDir, file);
            const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

            // Filter events by date range
            for (const event of chunkData.events) {
                const eventDate = event.timestamp.split('T')[0]; // YYYY-MM-DD
                if (eventDate >= startDate && eventDate <= endDate) {
                    allEvents.push(event);
                }
            }

            console.log(`  Loaded chunk: ${chunkStart} to ${chunkEnd} (${chunkData.events.length} events)`);
        }
    }

    return allEvents;
}

function loadApplicationsData() {
    const applicationsFile = path.join(MANUAL_DIR, 'applications_data.json');

    if (!fs.existsSync(applicationsFile)) {
        console.log('⚠ No manual applications data found');
        return null;
    }

    const data = JSON.parse(fs.readFileSync(applicationsFile, 'utf8'));
    console.log(`  ✓ Loaded applications data (${data.dateRangeStart} to ${data.dateRangeEnd})`);
    return data;
}

// Data processing
function processPaymentErrors(events) {
    const reasonData = {};
    const invalidCardNumberKey = 'Invalid card number (grouped)';

    for (const event of events) {
        let reason = event.paymentErrorReason || 'Unknown';

        // Group errors ending with "is not a valid card number"
        if (reason.endsWith('is not a valid card number')) {
            reason = invalidCardNumberKey;
        }

        if (!reasonData[reason]) {
            reasonData[reason] = {
                count: 0,
                users: new Set()
            };
        }

        reasonData[reason].count++;
        reasonData[reason].users.add(event.userId);
    }

    const results = Object.entries(reasonData).map(([reason, data]) => ({
        reason,
        count: data.count,
        uniqueUsers: data.users.size
    }));

    results.sort((a, b) => b.count - a.count);

    return results;
}

function processPaymentSuccess(events) {
    const merchantData = {};

    for (const event of events) {
        const merchantId = event.merchant_id || 'Unknown';

        if (!merchantData[merchantId]) {
            merchantData[merchantId] = {
                count: 0,
                users: new Set()
            };
        }

        merchantData[merchantId].count++;
        merchantData[merchantId].users.add(event.userId);
    }

    const results = Object.entries(merchantData).map(([merchantId, data]) => ({
        merchantId,
        count: data.count,
        uniqueUsers: data.users.size
    }));

    results.sort((a, b) => b.count - a.count);

    return results;
}

// Report generation
function generateHTMLReport(errorData, successData, applicationsData, startDate, endDate) {
    const today = new Date();
    const outputFile = path.join(PROCESSED_DIR, `payment_report_${formatDate(today)}.html`);

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    const formatDateLong = (date) => {
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC',
            timeZoneName: 'short'
        });
    };

    const timeframeText = `${formatDateLong(start)} to ${formatDateLong(end)}`;
    const todayFormatted = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#E7E9ED', '#C9CBCF', '#4BC0C0', '#FF6384'
    ];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Application and Payment Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
        }
        .header {
            background-color: white;
            padding: 20px 40px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        .header-left {
            display: flex;
            align-items: center;
        }
        .logo {
            height: 40px;
            margin-right: 30px;
        }
        .header-title {
            display: flex;
            flex-direction: column;
        }
        .header-title h1 {
            color: #31C1FF;
            font-size: 24px;
            margin-bottom: 5px;
        }
        .header-subtitle {
            color: #484848;
            font-size: 14px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .summary-section {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .summary-title {
            font-size: 20px;
            color: #333;
            margin-bottom: 20px;
            font-weight: 600;
        }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .summary-card {
            padding: 20px;
            border-radius: 8px;
            color: white;
            text-align: center;
        }
        .summary-card.success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }
        .summary-card.error {
            background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
        }
        .summary-card h3 {
            font-size: 16px;
            margin-bottom: 15px;
            opacity: 0.9;
        }
        .summary-card .metric {
            margin: 10px 0;
        }
        .summary-card .number {
            font-size: 32px;
            font-weight: bold;
        }
        .summary-card .label {
            font-size: 14px;
            opacity: 0.9;
        }
        .section {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 24px;
            color: #333;
            margin-bottom: 10px;
            font-weight: 600;
        }
        .section-subtitle {
            color: #666;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .timeframe {
            color: #888;
            font-size: 13px;
            margin-bottom: 30px;
        }
        .chart-container {
            position: relative;
            margin-bottom: 40px;
        }
        .chart-wrapper {
            position: relative;
            height: 400px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #333;
        }
        tr:hover {
            background-color: #f8f9fa;
        }
        .percentage {
            color: #666;
            font-size: 14px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 14px;
            text-align: center;
        }

        /* Print/PDF specific styles - scale everything down */
        @media print {
            body {
                font-size: 10px;
            }

            .header {
                padding: 10px 20px;
                margin-bottom: 15px;
            }

            .logo {
                height: 25px;
                margin-right: 15px;
            }

            .header-title h1 {
                font-size: 16px;
            }

            .header-subtitle {
                font-size: 10px;
            }

            .summary-section, .section {
                padding: 15px;
                margin-bottom: 15px;
            }

            .summary-title {
                font-size: 14px;
                margin-bottom: 10px;
            }

            .summary-cards {
                gap: 10px;
            }

            .summary-card {
                padding: 10px;
            }

            .summary-card h3 {
                font-size: 11px;
                margin-bottom: 8px;
            }

            .summary-card .number {
                font-size: 20px;
            }

            .summary-card .label {
                font-size: 9px;
            }

            .section-title {
                font-size: 16px;
                margin-bottom: 8px;
            }

            .section-subtitle {
                font-size: 10px;
                margin-bottom: 10px;
            }

            .timeframe {
                font-size: 9px;
                margin-bottom: 15px;
            }

            .chart-container {
                margin-bottom: 30px;
                page-break-inside: avoid;
                min-height: 450px;
            }

            .chart-wrapper {
                height: 400px;
                max-height: 400px;
                overflow: hidden;
                margin-bottom: 20px;
            }

            .chart-container h3 {
                margin-top: 0;
                margin-bottom: 10px;
                padding-top: 10px;
            }

            table {
                font-size: 9px;
                margin-top: 10px;
            }

            th, td {
                padding: 6px;
            }

            th {
                font-size: 9px;
            }

            .percentage {
                font-size: 8px;
            }

            .footer {
                display: none;
            }

            h3 {
                font-size: 12px;
                margin-top: 20px;
                margin-bottom: 10px;
                clear: both;
            }

            .section h3:first-of-type {
                margin-top: 10px;
            }

            .page-break-before {
                page-break-before: always;
            }

            .section.payment-success-section {
                page-break-before: always;
            }

            .merchant-breakdown-title {
                page-break-before: always;
                margin-top: 0 !important;
                padding-top: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <img src="https://www.razorvision.net/wp-content/themes/razorvision-theme/img/logo-black.svg" alt="RazorVision Logo" class="logo">
            <div class="header-title">
                <h1>Weekly Application and Payment Report</h1>
                <div class="header-subtitle">[DLC-004] Production Maintenance &nbsp;&nbsp;&nbsp; ${todayFormatted}</div>
            </div>
        </div>
    </div>

    <div class="container">
        <!-- Summary Section -->
        <div class="summary-section">
            <div class="summary-title">Summary - Last ${daysDiff} Days</div>
            <div class="timeframe">${timeframeText}</div>
            <div class="summary-cards">
                <div class="summary-card success">
                    <h3>Payment Success</h3>
                    <div class="metric">
                        <div class="number">${successData.totalEvents.toLocaleString()}</div>
                        <div class="label">events</div>
                    </div>
                    <div class="metric">
                        <div class="number">${successData.totalUsers.toLocaleString()}</div>
                        <div class="label">users</div>
                    </div>
                </div>
                <div class="summary-card error">
                    <h3>Payment Error</h3>
                    <div class="metric">
                        <div class="number">${errorData.totalEvents.toLocaleString()}</div>
                        <div class="label">events</div>
                    </div>
                    <div class="metric">
                        <div class="number">${errorData.totalUsers.toLocaleString()}</div>
                        <div class="label">users</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Applications Section -->
        ${applicationsData ? `
        <div class="section">
            <div class="section-title">Applications Submitted</div>
            <div class="section-subtitle">Data from Gravity Forms (${applicationsData.dateRangeStart} to ${applicationsData.dateRangeEnd})</div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; color: white;">
                    <h3 style="font-size: 16px; margin-bottom: 15px; opacity: 0.9;">Total Applications</h3>
                    <div style="font-size: 36px; font-weight: bold;">${applicationsData.applications.total.toLocaleString()}</div>
                    <div style="font-size: 14px; opacity: 0.9; margin-top: 5px;">Last 7 days</div>
                </div>
                <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 20px; border-radius: 8px; color: white;">
                    <h3 style="font-size: 16px; margin-bottom: 15px; opacity: 0.9;">From Store Kiosks</h3>
                    <div style="font-size: 36px; font-weight: bold;">${applicationsData.applications.fromStoreKiosks.toLocaleString()}</div>
                </div>
                <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 20px; border-radius: 8px; color: white;">
                    <h3 style="font-size: 16px; margin-bottom: 15px; opacity: 0.9;">First Time Applications</h3>
                    <div style="font-size: 36px; font-weight: bold;">${applicationsData.applications.firstTimeApplications.toLocaleString()}</div>
                </div>
                <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 20px; border-radius: 8px; color: white;">
                    <h3 style="font-size: 16px; margin-bottom: 15px; opacity: 0.9;">Returning Customers</h3>
                    <div style="font-size: 36px; font-weight: bold;">${applicationsData.applications.returningCustomers.toLocaleString()}</div>
                </div>
            </div>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">Applications by State</h3>
            <table>
                <thead>
                    <tr>
                        <th>State</th>
                        <th>Applications</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
${Object.entries(applicationsData.applications.byState)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => {
        const percentage = ((count / applicationsData.applications.total) * 100).toFixed(1);
        return `                    <tr>
                        <td><strong>${state}</strong></td>
                        <td>${count.toLocaleString()}</td>
                        <td class="percentage">${percentage}%</td>
                    </tr>`;
    }).join('\n')}
                </tbody>
            </table>

            <h3 style="margin-top: 40px; margin-bottom: 15px;">Please Wait Submissions</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">
                    <div style="color: #666; font-size: 14px;">Total Submissions</div>
                    <div style="font-size: 24px; font-weight: bold; color: #333; margin-top: 5px;">${applicationsData.pleaseWaitSubmissions.total.toLocaleString()}</div>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #eb3349;">
                    <div style="color: #666; font-size: 14px;">Server Errors</div>
                    <div style="font-size: 24px; font-weight: bold; color: #333; margin-top: 5px;">${applicationsData.pleaseWaitSubmissions.errorServer.toLocaleString()}</div>
                    <div style="color: #666; font-size: 12px; margin-top: 5px; font-style: italic;">${applicationsData.pleaseWaitSubmissions.errorServerNote}</div>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #11998e;">
                    <div style="color: #666; font-size: 14px;">Complete</div>
                    <div style="font-size: 24px; font-weight: bold; color: #333; margin-top: 5px;">${applicationsData.pleaseWaitSubmissions.complete.toLocaleString()}</div>
                </div>
            </div>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">Other Actions</h3>
            <table>
                <thead>
                    <tr>
                        <th>Action</th>
                        <th>Total Submissions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Bank Verification</td>
                        <td><strong>${applicationsData.bankVerification.total.toLocaleString()}</strong></td>
                    </tr>
                    <tr>
                        <td>Documentation Upload (during application)</td>
                        <td><strong>${applicationsData.documentationUploadDuringApplication.total.toLocaleString()}</strong></td>
                    </tr>
${Object.entries(applicationsData.otherActions)
    .map(([key, action]) => `                    <tr>
                        <td>${action.label}</td>
                        <td><strong>${action.total.toLocaleString()}</strong></td>
                    </tr>`).join('\n')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <!-- Payment Errors Section -->
        <div class="section">
            <div class="section-title">Payment Errors Analysis</div>
            <div class="section-subtitle">Issue #${PAYMENT_ERROR_ISSUE_ID}</div>

            <div class="chart-container">
                <h3>Error Reasons Distribution</h3>
                <div class="chart-wrapper">
                    <canvas id="errorPieChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h3>Error Frequency by Reason</h3>
                <div class="chart-wrapper">
                    <canvas id="errorBarChart"></canvas>
                </div>
            </div>

            <h3>Detailed Breakdown</h3>
            <table>
                <thead>
                    <tr>
                        <th>Payment Error Reason</th>
                        <th>Event Count</th>
                        <th>Unique Users</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
${errorData.reasons.map(item => `                    <tr>
                        <td>${item.reason}</td>
                        <td><strong>${item.count}</strong></td>
                        <td><strong>${item.uniqueUsers}</strong></td>
                        <td class="percentage">${item.percentage}%</td>
                    </tr>
`).join('')}                </tbody>
            </table>
        </div>

        <!-- Payment Success Section -->
        <div class="section payment-success-section">
            <div class="section-title">Payment Success Analysis</div>
            <div class="section-subtitle">Issue #${PAYMENT_SUCCESS_ISSUE_ID}</div>

            <div class="chart-container">
                <h3>Merchant Distribution</h3>
                <div class="chart-wrapper">
                    <canvas id="successPieChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h3>Success by Merchant</h3>
                <div class="chart-wrapper">
                    <canvas id="successBarChart"></canvas>
                </div>
            </div>

            <h3 class="merchant-breakdown-title">Merchant Breakdown</h3>
            <table>
                <thead>
                    <tr>
                        <th>Merchant ID</th>
                        <th>Event Count</th>
                        <th>Unique Users</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
${successData.merchants.map(item => `                    <tr>
                        <td>${item.merchantId}</td>
                        <td><strong>${item.count}</strong></td>
                        <td><strong>${item.uniqueUsers}</strong></td>
                        <td class="percentage">${item.percentage}%</td>
                    </tr>
`).join('')}                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>Generated on ${new Date().toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}</p>
            <p>Data source: Sentry API</p>
        </div>
    </div>

    <script>
        // Helper function to truncate text
        function truncateText(text, maxLength) {
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '...';
        }

        // Error Pie Chart
        const errorPieCtx = document.getElementById('errorPieChart').getContext('2d');
        const errorReasons = ${JSON.stringify(errorData.chartReasons.map(r => r.reason))};
        new Chart(errorPieCtx, {
            type: 'pie',
            data: {
                labels: errorReasons.map(r => truncateText(r, 50)),
                datasets: [{
                    data: ${JSON.stringify(errorData.chartReasons.map(r => r.count))},
                    backgroundColor: ${JSON.stringify(colors)},
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 15,
                            padding: 10,
                            font: {
                                size: 10
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = errorReasons[context.dataIndex] || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return label + ': ' + value + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });

        // Error Bar Chart
        const errorBarCtx = document.getElementById('errorBarChart').getContext('2d');
        new Chart(errorBarCtx, {
            type: 'bar',
            data: {
                labels: errorReasons.map(r => truncateText(r, 60)),
                datasets: [{
                    label: 'Number of Events',
                    data: ${JSON.stringify(errorData.chartReasons.map(r => r.count))},
                    backgroundColor: '#eb3349',
                    borderColor: '#f45c43',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return errorReasons[context[0].dataIndex];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: {
                                size: 9
                            }
                        }
                    }
                }
            }
        });

        // Success Pie Chart
        const successPieCtx = document.getElementById('successPieChart').getContext('2d');
        new Chart(successPieCtx, {
            type: 'pie',
            data: {
                labels: ${JSON.stringify(successData.merchants.map(m => m.merchantId))},
                datasets: [{
                    data: ${JSON.stringify(successData.merchants.map(m => m.count))},
                    backgroundColor: ${JSON.stringify(colors)},
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return label + ': ' + value + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });

        // Success Bar Chart
        const successBarCtx = document.getElementById('successBarChart').getContext('2d');
        new Chart(successBarCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(successData.merchants.map(m => m.merchantId))},
                datasets: [{
                    label: 'Number of Events',
                    data: ${JSON.stringify(successData.merchants.map(m => m.count))},
                    backgroundColor: '#11998e',
                    borderColor: '#38ef7d',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(outputFile, html);
    return outputFile;
}

async function main() {
    const args = process.argv.slice(2);

    // Parse command line arguments
    let startDate = null;
    let endDate = null;
    let daysBack = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--start-date' && args[i + 1]) {
            startDate = args[i + 1];
            i++;
        } else if (args[i] === '--end-date' && args[i + 1]) {
            endDate = args[i + 1];
            i++;
        } else if (args[i] === '--days' && args[i + 1]) {
            daysBack = parseInt(args[i + 1], 10);
            i++;
        }
    }

    // Default to last 30 days if not specified
    if (!endDate) {
        endDate = formatDate(new Date());
    }

    if (!startDate) {
        if (daysBack) {
            const end = parseDate(endDate);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - daysBack);
            startDate = formatDate(start);
        } else {
            const end = parseDate(endDate);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 30);
            startDate = formatDate(start);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Payment Report Generator');
    console.log('='.repeat(60));
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log('='.repeat(60));

    // Load Payment Error data
    console.log('\nLoading Payment Error data...');
    const errorEvents = loadChunksInDateRange(
        PAYMENT_ERROR_ISSUE_ID,
        'Payment Error',
        startDate,
        endDate
    );
    console.log(`✓ Loaded ${errorEvents.length} Payment Error events`);

    // Load Payment Success data
    console.log('\nLoading Payment Success data...');
    const successEvents = loadChunksInDateRange(
        PAYMENT_SUCCESS_ISSUE_ID,
        'Payment Success',
        startDate,
        endDate
    );
    console.log(`✓ Loaded ${successEvents.length} Payment Success events`);

    // Load Applications data
    console.log('\nLoading Applications data...');
    const applicationsData = loadApplicationsData();

    // Process data
    console.log('\nProcessing data...');
    const errorReasons = processPaymentErrors(errorEvents);
    const merchants = processPaymentSuccess(successEvents);

    // Calculate totals
    const totalErrorEvents = errorReasons.reduce((sum, item) => sum + item.count, 0);
    const totalErrorUsers = new Set(errorEvents.map(e => e.userId)).size;

    const totalSuccessEvents = merchants.reduce((sum, item) => sum + item.count, 0);
    const totalSuccessUsers = new Set(successEvents.map(e => e.userId)).size;

    // Prepare data for report
    // For charts: limit to top 12 error reasons and combine the rest into "Others"
    const topErrorReasons = errorReasons.slice(0, 12);
    const otherErrorReasons = errorReasons.slice(12);

    let chartErrorReasons = topErrorReasons.map(item => ({
        ...item,
        percentage: totalErrorEvents > 0
            ? parseFloat(((item.count / totalErrorEvents) * 100).toFixed(2))
            : 0
    }));

    // If there are more than 12 reasons, combine the rest into "Others" for the chart
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

    // For table: show all error reasons
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

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log('-'.repeat(60));
    console.log(`Payment Success: ${successData.totalEvents} events, ${successData.totalUsers} users`);
    console.log(`Payment Error:   ${errorData.totalEvents} events, ${errorData.totalUsers} users`);
    console.log('='.repeat(60));

    // Generate HTML report
    console.log('\nGenerating HTML report...');
    const htmlFile = generateHTMLReport(errorData, successData, applicationsData, startDate, endDate);

    console.log(`\n✓ Report saved: ${htmlFile}`);

    // Generate PDF using Chrome headless
    console.log('\nGenerating PDF...');
    const pdfFile = htmlFile.replace('.html', '.pdf');

    const { exec } = require('child_process');

    // Use Chrome headless to generate PDF
    exec(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --print-to-pdf-no-header --print-to-pdf="${pdfFile}" "file://${htmlFile}"`, (error, stdout, stderr) => {
        if (error) {
            console.log(`⚠ PDF generation failed: ${error.message}`);
            console.log('You can manually print to PDF from the browser.');
        } else {
            console.log(`✓ PDF saved: ${pdfFile}`);
        }
    });

    console.log('Opening HTML in browser...');
    exec(`open "${htmlFile}"`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    loadChunksInDateRange,
    processPaymentErrors,
    processPaymentSuccess,
    generateHTMLReport
};
