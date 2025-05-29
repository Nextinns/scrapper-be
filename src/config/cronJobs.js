const cron = require('node-cron');
const { runAccountRefresh } = require('../../scripts/refreshUpworkAccounts');
const { runJobProcessing } = require('../../scripts/processUpworkJobs'); // Import job processor

const startCronJobs = () => {
  console.log('Initializing cron jobs...');

  // --- Upwork Account Refresh Cron Job ---
  const accountRefreshCronExpr = process.env.ACCOUNT_REFRESH_CRON_EXPRESSION || '0 3 * * *'; // Daily at 3 AM
  cron.schedule(accountRefreshCronExpr, async () => {
    console.log(`\nRunning scheduled Upwork account refresh job at ${new Date().toISOString()}...`);
    try {
      await runAccountRefresh();
      console.log('Scheduled Upwork account refresh job finished.');
    } catch (error) {
      console.error('Unhandled error during scheduled account refresh:', error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || "Etc/UTC"
  });
  console.log(`Upwork account refresh job scheduled: "${accountRefreshCronExpr}" in timezone ${process.env.TZ || "Etc/UTC"}`);

  // --- Job Processing Cron Job ---
  const jobProcessingCronExpr = process.env.JOB_PROCESSING_CRON_EXPRESSION || '*/15 * * * *'; // Every 15 minutes
  cron.schedule(jobProcessingCronExpr, async () => {
    console.log(`\nRunning scheduled job processing job at ${new Date().toISOString()}...`);
    try {
      await runJobProcessing();
      console.log('Scheduled job processing job finished.');
    } catch (error) {
      console.error('Unhandled error during scheduled job processing:', error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || "Etc/UTC"
  });
  console.log(`Job processing job scheduled: "${jobProcessingCronExpr}" in timezone ${process.env.TZ || "Etc/UTC"}`);

};

module.exports = { startCronJobs };
