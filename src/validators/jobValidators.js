// src/validators/jobValidators.js
const { body, validationResult } = require('express-validator');

const validateJobSubmissionsArray = [
  // Check if the request body is an array
  body()
    .isArray({ min: 1 }) // Ensure it's an array and not empty
    .withMessage('Request body must be a non-empty array of job objects.'),

  // Validate each object in the array
  body('*.jobId') // The '*' wildcard applies to each element of the array
    .notEmpty().withMessage('Job ID is required for each job.')
    .isString().withMessage('Job ID must be a string for each job.'),
  body('*.title')
    .notEmpty().withMessage('Title is required for each job.')
    .isString().withMessage('Title must be a string for each job.'),
  body('*.link')
    .notEmpty().withMessage('Link is required for each job.')
    .isString().withMessage('Link must be a string for each job.')
    .isURL().withMessage('Link must be a valid URL for each job.'),
  
  // Middleware to handle the results of the above validations
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next(); // Proceed to the controller if validation passes
  }
];

module.exports = {
  validateJobSubmissionsArray, // Renamed for clarity
};