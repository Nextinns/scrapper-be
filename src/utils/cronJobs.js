const cron = require('node-cron');
const { runAccountRefresh } = require('../../scripts/refreshUpworkAccounts'); // Adjust path if necessary

const startCronJobs = () => {
  console.log('Initializing cron jobs...');


  const cronExpression = process.env.ACCOUNT_REFRESH_CRON_EXPRESSION || '0 3 * * *'; 

  cron.schedule(cronExpression, async () => {
    console.log(`\nRunning scheduled Upwork account refresh job at ${new Date().toISOString()}...`);
    try {
      await runAccountRefresh();
      console.log('Scheduled Upwork account refresh job finished.');
    } catch (error) {
      // runAccountRefresh should ideally handle its internal errors and not let them bubble up here.
      // But this catch is a safeguard.
      console.error('Unhandled error during scheduled account refresh:', error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || "Etc/UTC" // Example: "America/New_York", "Asia/Karachi", "Etc/UTC"
  });

  console.log(`Upwork account refresh job scheduled with expression: "${cronExpression}" in timezone ${process.env.TZ || "Etc/UTC"}`);
};

module.exports = { startCronJobs };
