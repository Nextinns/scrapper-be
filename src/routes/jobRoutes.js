// src/routes/jobRoutes.js
const express = require('express');
const { submitJob } = require('../controllers/jobController');
const { validateJobSubmissionsArray } = require('../validators/jobValidators'); // Import the validator

const router = express.Router();

// @route   POST /api/jobs/submit
// @desc    Submit a new job posting
// @access  Public (for now, can be protected later)
router.post(
  '/jobs/submit',
  validateJobSubmissionsArray, // Apply validation middleware before the controller
  submitJob
);

module.exports = router;