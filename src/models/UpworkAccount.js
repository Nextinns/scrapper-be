const mongoose = require('mongoose');
const { Schema } = mongoose;

const UpworkAccountSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  password: {
    type: String,
    required: true,
  },
  securityAnswer: {
    type: String,
    required: true,
  },
  cookies: {
    type: [Object],
    default: [],
  },
  upworkAuthToken: { // Stores the value of oauth2_global_js_token or asct_vt
    type: String,
  },
  lastRefreshedAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
  collection: 'upworkaccounts' // Explicitly set collection name
});


const UpworkAccount = mongoose.model('UpworkAccount', UpworkAccountSchema);

module.exports = UpworkAccount;