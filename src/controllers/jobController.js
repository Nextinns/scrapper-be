// src/controllers/jobController.js
const JobPosting = require('../models/JobPosting');

const submitJob = async (req, res) => {
  // req.body is now an array of job objects, validated by middleware
  const jobSubmissions = req.body;
  let newJobsAddedCount = 0;
  let processedCount = 0;
  const errorsEncountered = []; // Optional: to collect specific errors if needed for logging

  try {
    for (const jobData of jobSubmissions) {
      const { jobId, title, link } = jobData;

      try {
        const existingJob = await JobPosting.findOne({ upworkJobId: jobId });

        if (existingJob) {
          // Job already exists, skip it silently as per requirement
          processedCount++;
          continue;
        }

        // If the job is new, create and save it
        const newJob = new JobPosting({
          upworkJobId: jobId,
          title,
          link,
          status: 'NOT_PROCESSED',
        });

        await newJob.save();
        newJobsAddedCount++;
        processedCount++;

      } catch (saveError) {
        // This primarily catches database errors during findOne or save for an individual job
        // e.g., unique constraint violation if a race condition occurred.
        if (saveError.code === 11000) { // MongoDB duplicate key error
          console.warn(`Job with upworkJobId ${jobId} already exists (race condition or concurrent insert). Skipped.`);
        } else {
          console.error(`Error processing job with upworkJobId ${jobId}:`, saveError.message);
          errorsEncountered.push({ jobId, error: saveError.message });
        }
        processedCount++; // Still count as processed (attempted)
      }
    }

    // Return a success response indicating how many new jobs were added
    res.status(200).json({
      message: 'Job submissions processed.',
      newJobsAdded: newJobsAddedCount,
      totalJobsInRequest: jobSubmissions.length,
    });

  } catch (error) {
    // This is for unexpected errors in the overall controller logic
    console.error('Critical error in submitJob controller:', error);
    res.status(500).json({ message: 'Server error while processing job submissions.' });
  }
};

module.exports = {
  submitJob,
};