const mongoose = require('mongoose');
const { Schema } = mongoose;

const JobPostingSchema = new Schema({
  upworkJobId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['NOT_PROCESSED', 'PROCESSING', 'PROCESSED', 'FAILED_PROCESSING', 'ARCHIVED'],
    default: 'NOT_PROCESSED',
  },
  clientDetails: {
    type: Schema.Types.Mixed, // Allows for a flexible object structure
  },
  jobDetails: {
    type: Schema.Types.Mixed, // Allows for raw API responses or other job data
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt fields
  collection: 'jobpostings' // Explicitly set collection name
});


const JobPosting = mongoose.model('JobPosting', JobPostingSchema);

module.exports = JobPosting;