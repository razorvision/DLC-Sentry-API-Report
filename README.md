# DLC Weekly Application & Payment Report

Automated weekly reporting system that fetches data from Sentry and Gravity Forms, generates PDF reports, and emails them every Sunday at 11 PM Pacific Time.

## Automated Weekly Report (Primary)

The system runs automatically via GitHub Actions every **Sunday at 11 PM Pacific Time**.

### What It Does

1. **Fetches Gravity Forms data** - Applications, logins, password resets, etc.
2. **Fetches Sentry payment data** - Payment success and error events
3. **Generates HTML & PDF report** - With charts and detailed breakdowns
4. **Emails the report** - Sends PDF to configured recipients via Resend

### GitHub Actions Workflow

- **Schedule**: Every Sunday at 11 PM PT (7 AM UTC Monday)
- **Repo**: [DLC-Sentry-API-Report](https://github.com/luciana-razorvision/DLC-Sentry-API-Report)
- **Workflow**: `.github/workflows/weekly-report.yml`

### Manual Trigger

You can run the report manually anytime:

1. Go to [Actions](https://github.com/luciana-razorvision/DLC-Sentry-API-Report/actions)
2. Click **"Weekly Payment Report"**
3. Click **"Run workflow"**
4. Optionally change the number of days (default: 7)

### Required Secrets (GitHub)

| Secret | Description |
|--------|-------------|
| `SENTRY_TOKEN` | Sentry API token |
| `GRAVITY_FORMS_URL` | `https://www.dontbebroke.com` |
| `GRAVITY_FORMS_KEY` | Gravity Forms consumer key |
| `GRAVITY_FORMS_SECRET` | Gravity Forms consumer secret |
| `RESEND_API_KEY` | Resend email API key |
| `REPORT_RECIPIENTS` | Email addresses (comma-separated) |

---

## Report Contents

### Summary Section
- Payment Success events & unique users
- Payment Error events & unique users

### Applications Section (from Gravity Forms)
- Total applications
- First-time vs. returning customers
- Store kiosk applications
- Applications by state (NV, ID, WI, UT, MO, DE, OK)
- "Please Wait" submissions (complete vs. error)
- Bank verifications
- Document uploads
- Login/password activity

### Payment Errors Analysis (from Sentry)
- Pie chart: Top 12 error reasons + "Others"
- Bar chart: Error frequency
- Detailed table with all error reasons, counts, and percentages

### Payment Success Analysis (from Sentry)
- Merchant distribution
- Success by merchant breakdown

---

## Local Development (Secondary)

### Setup

```bash
# Clone the repo
git clone https://github.com/luciana-razorvision/DLC-Sentry-API-Report.git
cd DLC-Sentry-API-Report

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

### Environment Variables (.env)

```env
# Sentry API
SENTRY_TOKEN=your_sentry_token
SENTRY_ORG=xajeet

# Gravity Forms API
GRAVITY_FORMS_URL=https://www.dontbebroke.com
GRAVITY_FORMS_KEY=your_consumer_key
GRAVITY_FORMS_SECRET=your_consumer_secret

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxx
REPORT_RECIPIENTS=your@email.com
```

### Run Locally

```bash
# Full report with email
npm run report

# Report without email (local testing)
npm run report:local

# Fetch only Gravity Forms data
npm run fetch:gravity

# Fetch only Sentry data
npm run fetch:sentry

# Generate report from cached data
npm run generate
```

### Command Line Options

```bash
# Last 7 days (default)
node src/run_weekly_report.js

# Custom number of days
node src/run_weekly_report.js --days 14

# Skip email
node src/run_weekly_report.js --skip-email

# Skip fetching (use cached data)
node src/run_weekly_report.js --skip-sentry --skip-gravity-forms
```

---

## Project Structure

```
├── .github/workflows/
│   └── weekly-report.yml     # GitHub Actions workflow
├── src/
│   ├── run_weekly_report.js  # Main orchestrator
│   ├── fetch_gravity_forms.js # Gravity Forms API integration
│   └── send_email.js         # Resend email integration
├── data/
│   ├── raw/                  # Cached Sentry events (7-day chunks)
│   ├── manual/               # Gravity Forms data cache
│   └── processed/            # Generated HTML & PDF reports
├── fetch_payment_data.js     # Sentry data fetcher
├── process_payment_report.js # Report generator
├── .env.example              # Environment template
└── package.json
```

## Gravity Forms Field Mappings

| Stat | Form | Field |
|------|------|-------|
| Total Applications | Form 4 | Entry count |
| From Store Kiosks | Form 4 | Field 120 = "Store Kiosk" |
| First Time Applications | Form 4 | Field 151 = "FirstApplication" |
| Returning Customers | Form 4 | Field 151 = "NewLoan" |
| By State | Form 4 | Field 27 (NV, ID, etc.) |
| Please Wait - Total | Form 14 | Entry count |
| Please Wait - Complete | Form 14 | workflow_final_status = "complete" |
| Please Wait - Error | Form 14 | workflow_final_status = "error_server" |
| Bank Verification | Form 10 | Entry count |
| Documentation Upload | Form 11 | Entry count |
| Upload Document (Auth) | Form 12 | Entry count |
| Change Password | Form 8 | Entry count |
| Login to Member Area | Form 6 | Entry count |
| Forgot Password | Form 7 | Entry count |
| Reset Password | Form 9 | Entry count |

---

## Troubleshooting

### Email not received
- Check Resend dashboard for delivery status
- Verify `REPORT_RECIPIENTS` is set correctly
- On free tier, can only send to the email you signed up with

### PDF not generated in CI
- Check GitHub Actions logs for Puppeteer errors
- Ensure the workflow has the `CI: true` environment variable

### Data looks incorrect
- Run manually with `--skip-sentry --skip-gravity-forms` to use cached data
- Check date range in the report header

### Workflow failed
- Check [Actions tab](https://github.com/luciana-razorvision/DLC-Sentry-API-Report/actions) for error logs
- Verify all GitHub Secrets are set correctly

---

**Project**: [DLC-004] Production Maintenance
**Organization**: RazorVision
**Last Updated**: 2026-01-21
