// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const jobRoutes = require('./routes/jobRoutes');

const {loginAccount} = require('./utils/login'); // Import the login service

const app = express();

// Connect to MongoDB
connectDB();

// Middleware to log HTTP requests using morgan
app.use(morgan('dev')); 

// Middleware to parse JSON request bodies
app.use(express.json());

// Middleware to handle URL encoded form data
app.use(express.urlencoded({ extended: true }));

// Middleware to enable CORS
app.use(cors()); // You can pass options to configure CORS if needed

// Define a simple root route for testing
app.get('/', (req, res) => {
  res.send('Upwork Scraper Backend API is running...');
});

app.post('/login', async (req, res) => {
  const { email, password, securityAnswer } = req.body;

  if (!email || !password || !securityAnswer) {
    return res.status(400).json({ error: 'Email, password, and security answer are required.' });
  }

  try {
     await loginAccount(email, password, securityAnswer);
     res.sendStatus(200).json({ message: 'Login successful. Session data saved.' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message });
  }
})

// Use job routes
app.use('/api', jobRoutes) // All routes in jobRoutes will be prefixed with /api

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

