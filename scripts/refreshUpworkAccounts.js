require('dotenv').config(); // Ensure .env is loaded from project root
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const UpworkAccount = require('../src/models/UpworkAccount');
const { loginAccount } = require('../src/services/upworkAuthService');
const { sleep } = require('../src/utils/puppeteerUtils');

const ACCOUNT_PROCESSING_DELAY_MS = process.env.ACCOUNT_PROCESSING_DELAY_MS || 30000; // 30 seconds delay by default

const runAccountRefresh = async () => {
  let dbConnected = false;
  try {
    await connectDB();
    dbConnected = true;
    console.log('Starting Upwork account refresh process...');

    const activeAccounts = await UpworkAccount.find({ isActive: true });

    if (!activeAccounts || activeAccounts.length === 0) {
      console.log('No active Upwork accounts found to refresh.');
      return;
    }

    console.log(`Found ${activeAccounts.length} active accounts to refresh.`);

    for (let i = 0; i < activeAccounts.length; i++) {
      const account = activeAccounts[i];
      console.log(`\nProcessing account: ${account.email} (${i + 1}/${activeAccounts.length})`);

      try {
        const sessionData = await loginAccount(account.email, account.password, account.securityAnswer);
        
        if (sessionData && sessionData.cookies && sessionData.upworkAuthToken) {
          account.cookies = sessionData.cookies;
          account.upworkAuthToken = sessionData.upworkAuthToken;
          account.lastRefreshedAt = new Date();
          account.loginError = undefined; // Clear any previous error message
          await account.save();
          console.log(`Successfully refreshed session for ${account.email}. Auth token found: ${!!sessionData.upworkAuthToken}`);
        } else if (sessionData && sessionData.cookies && !sessionData.upworkAuthToken) {
          account.cookies = sessionData.cookies; // Still save cookies if retrieved
          account.lastRefreshedAt = new Date();
          account.loginError = 'Auth token (oauth2_global_js_token or asct_vt) not found after login.';
          await account.save();
          console.warn(`Session partially refreshed for ${account.email} (cookies updated, but specific auth token missing).`);
        } else {
          // This case implies loginAccount might have returned an unexpected structure or null without throwing
          account.lastRefreshedAt = new Date();
          account.loginError = 'Login attempt did not return expected session data (cookies/token).';
          await account.save();
          console.error(`Failed to refresh session for ${account.email}: No complete session data returned from loginAccount.`);
        }
      } catch (error) {
        console.error(`Error refreshing account ${account.email}:`, error.message);
        account.lastRefreshedAt = new Date();
        account.loginError = error.message.substring(0, 500); // Store a snippet of the error
        try {
          await account.save();
        } catch (saveErr) {
          console.error(`Failed to save error state for account ${account.email}:`, saveErr);
        }
      }

      // Apply delay only if there are more accounts to process
      if (i < activeAccounts.length - 1) {
        console.log(`Waiting for ${ACCOUNT_PROCESSING_DELAY_MS / 1000} seconds before next account...`);
        await sleep(Number(ACCOUNT_PROCESSING_DELAY_MS));
      }
    }

    console.log('Upwork account refresh process completed.');

  } catch (error) {
    console.error('Critical error in runAccountRefresh function:', error);
    // Depending on how this script is run (cron vs standalone),
    // you might want to rethrow or handle the exit differently.
  } finally {
    if (dbConnected && mongoose.connection.readyState === 1) { // 1 === connected
      try {
        await mongoose.disconnect();
        console.log('MongoDB disconnected after account refresh.');
      } catch (disconnectError) {
        console.error('Error disconnecting MongoDB:', disconnectError);
      }
    }
  }
};

// This block allows the script to be run directly via `node scripts/refreshUpworkAccounts.js`
// For cron jobs, the `runAccountRefresh` function will be imported and called.
if (require.main === module) {
  runAccountRefresh()
    .then(() => {
      console.log("Standalone account refresh script finished successfully.");
      // process.exit(0); // Uncomment if you want explicit exit for standalone success
    })
    .catch((e) => {
      console.error("Standalone account refresh script encountered a critical failure:", e);
      // process.exit(1); // Uncomment if you want explicit exit for standalone failure
    });
}

module.exports = { runAccountRefresh };
