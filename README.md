# DLC Sentry Payment Analysis & Reporting

Automated reporting system for analyzing payment events (successes and errors) from Sentry, with intelligent chunked caching and PDF generation.

## 🎯 What This Does

- Fetches payment error and payment success events from Sentry
- Analyzes error reasons and merchant distribution
- Includes application submission data from manual sources
- Generates comprehensive HTML and PDF reports with charts
- Uses intelligent chunked caching (7-day chunks) to avoid re-fetching data
- Supports flexible date range queries

## 📊 Latest Results (2025-10-09)

**Last 30 Days (2025-09-09 to 2025-10-09)**:
- **Payment Success**: 18,869 events, 13,070 users
- **Payment Error**: 2,242 events, 1,892 users
- **Unique Error Reasons**: 33+ (top 12 shown in charts)
- **Top 3 Errors**:
  1. Insufficient Funds (17.7%, 343 users)
  2. Invalid Card Number - grouped (17.4%, 370 users)
  3. CVV2 Value Invalid (11.4%, 245 users)

## 🚀 Quick Start

### Recommended: Process Cached Data (Fast)

```bash
# Generate report from cached data (default: last 30 days)
node process_payment_report.js

# Custom date range
node process_payment_report.js --start-date 2025-09-01 --end-date 2025-09-30

# Last N days
node process_payment_report.js --days 7
```

### Fetch Fresh Data (Slower - only when needed)

```bash
# Fetch and cache new data
node fetch_payment_data.js
```

## 📁 Data Storage

### Folder Structure
```
data/
├── raw/                          # Cached raw events (chunked by 7-day periods)
│   ├── payment_error_6722248692/
│   │   ├── 2025-09-09_to_2025-09-15.json
│   │   ├── 2025-09-16_to_2025-09-22.json
│   │   └── ...
│   └── payment_success_6722249177/
│       └── 2025-09-09_to_2025-10-08.json
├── manual/                       # Manual data entry (applications, etc.)
│   └── applications_data.json
└── processed/                    # Generated reports
    ├── payment_report_2025-10-09.html
    └── payment_report_2025-10-09.pdf
```

### Caching Strategy

**Chunked Caching**:
- Data stored in 7-day chunks
- Only fetches missing date ranges
- Efficient for long-term historical analysis
- Automatic deduplication of events
- Used by: `fetch_payment_data.js` and `process_payment_report.js`

### What Gets Generated

**HTML Report** (`data/processed/payment_report_*.html`):
- Summary cards for payment success/error totals
- Application submission statistics
- Interactive pie charts (top 12 error reasons + "Others")
- Interactive bar charts
- Detailed tables with all error reasons
- Print-optimized CSS for PDF generation

**PDF Report** (`data/processed/payment_report_*.pdf`):
- Generated automatically via Chrome headless
- Professional layout with page breaks
- All charts and tables included

## 📝 Files Overview

| File | Purpose |
|------|---------|
| `process_payment_report.js` | ✅ **Main script** - Generate reports from cached chunks |
| `fetch_payment_data.js` | Fetch and cache data in 7-day chunks |
| `migrate_cache_to_chunks.js` | Utility to convert old cache format to chunked format |
| `data/manual/applications_data.json` | Manual application data entry |

## 🔧 Configuration

### Payment Issues (in scripts)

```javascript
const PAYMENT_ERROR_ISSUE_ID = "6722248692";
const PAYMENT_SUCCESS_ISSUE_ID = "6722249177";
const ORGANIZATION_SLUG = "xajeet";
const SENTRY_TOKEN = "your-token-here";
```

### Manual Data

Edit `data/manual/applications_data.json` for application statistics:
```json
{
  "dateRangeStart": "2025-10-02",
  "dateRangeEnd": "2025-10-09",
  "applications": {
    "total": 1234,
    "fromStoreKiosks": 567,
    "byState": { "CA": 500, "TX": 300, ... }
  }
}
```

## 📊 Report Features

### Payment Errors Section
- **Pie Chart**: Top 12 error reasons + "Others" category
- **Bar Chart**: Same as pie chart for easy comparison
- **Detailed Table**: Complete list of all error reasons with:
  - Event counts
  - Unique user counts
  - Percentage breakdown

### Payment Success Section
- **Pie Chart**: Merchant distribution
- **Bar Chart**: Success by merchant
- **Table**: Merchant breakdown with stats

### Applications Section (if manual data available)
- Total applications
- Store kiosk vs. other sources
- First-time vs. returning customers
- Breakdown by state
- "Please Wait" submission tracking
- Bank verification and document upload stats

## 🎨 Chart Customization

### Top 12 + Others Feature
Error reasons are limited to top 12 in pie/bar charts to improve readability:
- Top 12 reasons shown individually
- Remaining reasons combined into "Others"
- Complete breakdown still shown in detailed table
- Configurable in code (currently hardcoded to 12)

### Error Grouping
- All errors ending with "is not a valid card number" are grouped together
- Displayed as "Invalid card number (grouped)"
- Helps reduce noise from similar errors

## 🔑 Token Requirements

Your Sentry API token needs these scopes:
- `event:read` (required)
- `org:read` (recommended)
- `project:read` (recommended)

Create token at: https://xajeet.sentry.io/settings/auth-tokens/

## ⚙️ PDF Generation

PDF is automatically generated using Chrome headless:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless \
  --disable-gpu \
  --print-to-pdf-no-header \
  --print-to-pdf="output.pdf" \
  "file://path-to-html"
```

Requires Google Chrome installed at the default macOS location.

## 📋 Command Line Examples

```bash
# Default: last 30 days
node process_payment_report.js

# Last 7 days
node process_payment_report.js --days 7

# Specific date range
node process_payment_report.js --start-date 2025-09-01 --end-date 2025-09-30

# Fetch fresh data for current month
node fetch_payment_data.js

# Migrate old cache format to chunks
node migrate_cache_to_chunks.js
```

## 🔄 Workflow

### Regular Usage (Weekly Reports)
1. `node process_payment_report.js --days 7` - Generates report from cache
2. Report automatically opens in browser
3. PDF automatically generated

### First Time or Data Refresh
1. `node fetch_payment_data.js` - Fetch and cache data
2. `node process_payment_report.js` - Generate report
3. Update `data/manual/applications_data.json` if needed
4. Re-run step 2 to include manual data

### Migrating from Old Format
1. `node migrate_cache_to_chunks.js` - Converts old cache to chunks
2. Continue with regular usage workflow

## ❓ FAQ

**Q: Why chunked caching?**
A: Fetching 30+ days of data in one API call is slow and can timeout. 7-day chunks are faster, more reliable, and allow incremental updates.

**Q: How do I refresh data?**
A: Run `node fetch_payment_data.js`. It will only fetch missing chunks, keeping existing cached data.

**Q: Can I analyze different date ranges?**
A: Yes! Use `--start-date` and `--end-date` flags with `process_payment_report.js`.

**Q: Why are only 12 error reasons shown in the chart?**
A: Too many slices make pie charts unreadable. The detailed table shows all reasons, and "Others" combines the rest in the chart.

**Q: What if Chrome is not installed?**
A: PDF generation will fail, but HTML report will still be created. You can manually print to PDF from your browser.

**Q: How do I add application data?**
A: Edit `data/manual/applications_data.json` with your weekly application statistics.

**Q: Can I use this for other Sentry issues?**
A: Yes! Change the `ISSUE_ID` constants in the scripts to analyze any Sentry issue.

## 🔍 Troubleshooting

**PDF not generating**: Ensure Chrome is installed at `/Applications/Google Chrome.app/`

**Data looks incomplete**: Run `node fetch_payment_data.js` to fetch missing chunks

**Charts not showing**: Ensure Chart.js CDN is accessible (requires internet)

**Dates out of range**: Ensure your date range has cached data, or fetch new data first

## 📄 Report Output Example

```
============================================================
Payment Report Generator
============================================================
Date Range: 2025-09-09 to 2025-10-09
============================================================

Loading Payment Error data...
  Loaded chunk: 2025-09-09 to 2025-09-15 (544 events)
  Loaded chunk: 2025-09-16 to 2025-09-22 (509 events)
  ...
✓ Loaded 2242 Payment Error events

Loading Payment Success data...
  ...
✓ Loaded 18869 Payment Success events

============================================================
Summary:
------------------------------------------------------------
Payment Success: 18869 events, 13070 users
Payment Error:   2242 events, 1892 users
============================================================

✓ Report saved: .../payment_report_2025-10-09.html
✓ PDF saved: .../payment_report_2025-10-09.pdf
```

---

**Project**: [DLC-004] Production Maintenance
**Organization**: RazorVision
**Last Updated**: 2025-10-09
