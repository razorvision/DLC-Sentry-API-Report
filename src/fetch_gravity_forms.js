/**
 * Gravity Forms API Integration
 * Fetches application and form submission data from WordPress Gravity Forms
 */

require('dotenv').config();

const GRAVITY_FORMS_URL = process.env.GRAVITY_FORMS_URL;
const GRAVITY_FORMS_KEY = process.env.GRAVITY_FORMS_KEY;
const GRAVITY_FORMS_SECRET = process.env.GRAVITY_FORMS_SECRET;

// Form IDs
const FORMS = {
    applications: 4,
    bankVerification: 10,
    changePassword: 8,
    documentationUpload: 11,
    forgotPassword: 7,
    login: 6,
    makePayment: 13,
    pleaseWait: 14,
    resetPassword: 9,
    uploadDocument: 12
};

// State name mapping
const STATE_NAMES = {
    'NV': 'Nevada',
    'ID': 'Idaho',
    'WI': 'Wisconsin',
    'UT': 'Utah',
    'MO': 'Missouri',
    'DE': 'Delaware',
    'OK': 'Oklahoma'
};

/**
 * Fetch entries from a Gravity Form within a date range
 */
async function fetchFormEntries(formId, startDate, endDate) {
    const baseUrl = `${GRAVITY_FORMS_URL}/wp-json/gf/v2/entries`;
    const allEntries = [];
    let page = 1;
    const pageSize = 100;

    // Format dates for the API (YYYY-MM-DD)
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`  Fetching Form ${formId} entries from ${startDateStr} to ${endDateStr}...`);

    while (true) {
        const params = new URLSearchParams({
            'form_ids': formId,
            'paging[page_size]': pageSize,
            'paging[current_page]': page,
            'search': JSON.stringify({
                'start_date': startDateStr,
                'end_date': endDateStr
            }),
            'consumer_key': GRAVITY_FORMS_KEY,
            'consumer_secret': GRAVITY_FORMS_SECRET
        });

        const url = `${baseUrl}?${params.toString()}`;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const entries = data.entries || [];

            if (entries.length === 0) {
                break;
            }

            // Filter entries by date only (ignore time component)
            const filteredEntries = entries.filter(entry => {
                const entryDateStr = entry.date_created.split(' ')[0]; // "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
                return entryDateStr >= startDateStr && entryDateStr <= endDateStr;
            });

            allEntries.push(...filteredEntries);

            if (entries.length < pageSize) {
                break;
            }

            page++;
        } catch (error) {
            console.error(`  Error fetching form ${formId} page ${page}:`, error.message);
            break;
        }
    }

    console.log(`  Found ${allEntries.length} entries for Form ${formId}`);
    return allEntries;
}

/**
 * Process application entries (Form 4)
 */
function processApplications(entries) {
    const result = {
        total: entries.length,
        fromStoreKiosks: 0,
        firstTimeApplications: 0,
        returningCustomers: 0,
        byState: {}
    };

    for (const entry of entries) {
        // Field 120: Origin
        const origin = entry['120'] || '';
        if (origin === 'Store Kiosk') {
            result.fromStoreKiosks++;
        }

        // Field 151: First application or New Loan
        const customerType = entry['151'] || '';
        if (customerType === 'FirstApplication') {
            result.firstTimeApplications++;
        } else if (customerType === 'NewLoan') {
            result.returningCustomers++;
        }

        // Field 27: State
        const stateCode = entry['27'] || '';
        if (stateCode) {
            const stateName = STATE_NAMES[stateCode] || stateCode;
            result.byState[stateName] = (result.byState[stateName] || 0) + 1;
        }
    }

    return result;
}

/**
 * Process Please Wait entries (Form 14)
 */
function processPleaseWait(entries) {
    const result = {
        total: entries.length,
        errorServer: 0,
        complete: 0
    };

    for (const entry of entries) {
        const status = entry['workflow_final_status'] || '';
        if (status === 'error_server') {
            result.errorServer++;
        } else if (status === 'complete') {
            result.complete++;
        }
    }

    return result;
}

/**
 * Main function to fetch all Gravity Forms data
 */
async function fetchGravityFormsData(startDate, endDate) {
    console.log('\n=== Fetching Gravity Forms Data ===');
    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    if (!GRAVITY_FORMS_URL || !GRAVITY_FORMS_KEY || !GRAVITY_FORMS_SECRET) {
        throw new Error('Missing Gravity Forms credentials. Set GRAVITY_FORMS_URL, GRAVITY_FORMS_KEY, and GRAVITY_FORMS_SECRET environment variables.');
    }

    // Fetch all form entries in parallel
    const [
        applicationEntries,
        bankVerificationEntries,
        changePasswordEntries,
        documentationUploadEntries,
        forgotPasswordEntries,
        loginEntries,
        makePaymentEntries,
        pleaseWaitEntries,
        resetPasswordEntries,
        uploadDocumentEntries
    ] = await Promise.all([
        fetchFormEntries(FORMS.applications, startDate, endDate),
        fetchFormEntries(FORMS.bankVerification, startDate, endDate),
        fetchFormEntries(FORMS.changePassword, startDate, endDate),
        fetchFormEntries(FORMS.documentationUpload, startDate, endDate),
        fetchFormEntries(FORMS.forgotPassword, startDate, endDate),
        fetchFormEntries(FORMS.login, startDate, endDate),
        fetchFormEntries(FORMS.makePayment, startDate, endDate),
        fetchFormEntries(FORMS.pleaseWait, startDate, endDate),
        fetchFormEntries(FORMS.resetPassword, startDate, endDate),
        fetchFormEntries(FORMS.uploadDocument, startDate, endDate)
    ]);

    // Process the data
    const applications = processApplications(applicationEntries);
    const pleaseWaitSubmissions = processPleaseWait(pleaseWaitEntries);

    // Build the final data structure (matching existing format)
    const data = {
        dateRangeStart: startDate.toISOString().split('T')[0],
        dateRangeEnd: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString().split('T')[0],
        applications: applications,
        pleaseWaitSubmissions: pleaseWaitSubmissions,
        bankVerification: {
            total: bankVerificationEntries.length
        },
        documentationUploadDuringApplication: {
            total: documentationUploadEntries.length
        },
        otherActions: {
            uploadDocumentAuthenticated: {
                label: 'Upload Document (Authenticated)',
                total: uploadDocumentEntries.length
            },
            changePassword: {
                label: 'Change Password',
                total: changePasswordEntries.length
            },
            loginToMemberArea: {
                label: 'Login to Member Area',
                total: loginEntries.length
            },
            forgotPassword: {
                label: 'Forgot Password',
                total: forgotPasswordEntries.length
            },
            resetPassword: {
                label: 'Reset Password',
                total: resetPasswordEntries.length
            },
            makePayment: {
                label: 'Make Payment (Form Submissions)',
                total: makePaymentEntries.length
            }
        }
    };

    console.log('\n=== Gravity Forms Data Summary ===');
    console.log(`Applications: ${data.applications.total}`);
    console.log(`  - First Time: ${data.applications.firstTimeApplications}`);
    console.log(`  - Returning: ${data.applications.returningCustomers}`);
    console.log(`  - From Kiosks: ${data.applications.fromStoreKiosks}`);
    console.log(`Please Wait Submissions: ${data.pleaseWaitSubmissions.total}`);
    console.log(`Bank Verifications: ${data.bankVerification.total}`);
    console.log(`Logins: ${data.otherActions.loginToMemberArea.total}`);

    return data;
}

// Export for use in other modules
module.exports = { fetchGravityFormsData, FORMS };

// Allow running directly
if (require.main === module) {
    const args = process.argv.slice(2);
    let days = 7;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--days' && args[i + 1]) {
            days = parseInt(args[i + 1], 10);
        }
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    fetchGravityFormsData(startDate, endDate)
        .then(data => {
            const fs = require('fs');
            const path = require('path');
            const outputPath = path.join(__dirname, '../data/manual/applications_data.json');
            fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
            console.log(`\nData saved to: ${outputPath}`);
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}
