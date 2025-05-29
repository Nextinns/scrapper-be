require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const JobPosting = require('../src/models/JobPosting');
const UpworkAccount = require('../src/models/UpworkAccount');
const jobScrapingService = require('../src/services/jobScrapingService');
const puppeteerScraperManager = require('../src/services/puppeteerScraperManager');
const { sleep } = require('../src/utils/puppeteerUtils');
const { AuthError, PuppeteerError } = require('../src/utils/errors');

const JOB_PROCESSING_BATCH_SIZE = parseInt(process.env.JOB_PROCESSING_BATCH_SIZE, 10) || 5;
const DELAY_BETWEEN_JOBS_MIN_MS = parseInt(process.env.DELAY_BETWEEN_JOBS_MIN_MS, 10) || 3000; // 3 seconds
const DELAY_BETWEEN_JOBS_MAX_MS = parseInt(process.env.DELAY_BETWEEN_JOBS_MAX_MS, 10) || 7000; // 7 seconds
const MAX_ACCOUNT_FAILURES_IN_ROW = 3; // Max consecutive failures for an account before pausing its use in this run

const runJobProcessing = async () => {
  let dbConnected = false;
  try {
    await connectDB();
    dbConnected = true;
    console.log('Starting job processing script...');

    const jobsToProcess = await JobPosting.find({ status: 'NOT_PROCESSED' })
      .sort({ createdAt: 1 }) // Prioritize older jobs
      .limit(JOB_PROCESSING_BATCH_SIZE);

    if (!jobsToProcess || jobsToProcess.length === 0) {
      console.log('No jobs found with status NOT_PROCESSED.');
      return;
    }
    console.log(`Found ${jobsToProcess.length} jobs to process.`);

    let upworkAccounts = await UpworkAccount.find({ isActive: true }).sort({ lastRefreshedAt: 1 });
    if (!upworkAccounts || upworkAccounts.length === 0) {
      console.warn('No active Upwork accounts available for scraping. Exiting job processing.');
      return;
    }
    console.log(`Using ${upworkAccounts.length} active Upwork account(s).`);

    let accountIndex = 0;
    const accountFailureCounts = new Map(upworkAccounts.map(acc => [acc.email, 0]));

    for (const job of jobsToProcess) {
      if (upworkAccounts.length === 0) {
          console.warn("Ran out of usable Upwork accounts for this processing run.");
          break; // Break job loop if no accounts are left
      }
      
      let accountUsed = false;
      let attemptsWithDifferentAccounts = 0;

      while (!accountUsed && attemptsWithDifferentAccounts < upworkAccounts.length) {
        const currentAccount = upworkAccounts[accountIndex % upworkAccounts.length];
        
        if (accountFailureCounts.get(currentAccount.email) >= MAX_ACCOUNT_FAILURES_IN_ROW) {
            console.warn(`Account ${currentAccount.email} has failed ${MAX_ACCOUNT_FAILURES_IN_ROW} times consecutively, skipping for now.`);
            accountIndex++;
            attemptsWithDifferentAccounts++;
            continue;
        }

        console.log(`\nAttempting to process job ${job.upworkJobId} with account ${currentAccount.email}`);
        try {
          await jobScrapingService.fetchAndSaveJobDetails(job, currentAccount);
          accountUsed = true; // Job processed (successfully or moved to FAILED/ARCHIVED by service)
          accountFailureCounts.set(currentAccount.email, 0); // Reset failure count on success
          accountIndex++; // Move to next account for next job (round-robin)
        } catch (error) {
          console.error(`Error processing job ${job.upworkJobId} with account ${currentAccount.email}: ${error.name} - ${error.message}`);
          if (error instanceof AuthError) {
            console.warn(`AuthError for account ${currentAccount.email}. It's marked for re-auth. Trying next account for this job if available.`);
            accountFailureCounts.set(currentAccount.email, (accountFailureCounts.get(currentAccount.email) || 0) + 1);
            // Remove account from pool for this run if it failed too many times due to AuthError
            if(accountFailureCounts.get(currentAccount.email) >= MAX_ACCOUNT_FAILURES_IN_ROW){
                console.error(`Account ${currentAccount.email} reached max auth failures. Removing from active pool for this run.`);
                upworkAccounts = upworkAccounts.filter(acc => acc.email !== currentAccount.email);
                accountIndex = 0; // Reset index as array changed
                if(upworkAccounts.length === 0) break; // No more accounts
            } else {
                accountIndex++; // Try next account
            }
            attemptsWithDifferentAccounts++;

          } else if (error instanceof PuppeteerError) {
            console.warn(`PuppeteerError for account ${currentAccount.email}. Closing its browser instance.`);
            await puppeteerScraperManager.closeBrowserInstance(currentAccount.email);
            accountFailureCounts.set(currentAccount.email, (accountFailureCounts.get(currentAccount.email) || 0) + 1);

            accountUsed = true; // As job status is handled, move to next job
            accountIndex++; 
          } else {

            accountUsed = true;
            accountIndex++;
          }
        } // end inner try-catch
      } // end while

      if(!accountUsed){
        console.warn(`Could not process job ${job.upworkJobId} with any available account.`);
        // Job remains NOT_PROCESSED or PROCESSING
      }

      // Random delay between jobs
      const delay = Math.floor(Math.random() * (DELAY_BETWEEN_JOBS_MAX_MS - DELAY_BETWEEN_JOBS_MIN_MS + 1)) + DELAY_BETWEEN_JOBS_MIN_MS;
      console.log(`Waiting for ${delay / 1000} seconds before next job...`);
      await sleep(delay);
    } // end for loop for jobs

    console.log('Job processing batch finished.');

  } catch (error) {
    console.error('Critical error in runJobProcessing script:', error);
  } finally {
    // Close all browser instances managed by this script run, or implement idle timeout in manager
    await puppeteerScraperManager.closeAllBrowserInstances();
    if (dbConnected && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('MongoDB disconnected after job processing script.');
    }
  }
};

// If called directly
if (require.main === module) {
  runJobProcessing()
    .then(() => console.log("Standalone job processing script finished."))
    .catch(e => console.error("Standalone job processing script failed:", e));
}

module.exports = { runJobProcessing };
