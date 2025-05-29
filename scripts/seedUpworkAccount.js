require('dotenv').config(); // Loads .env from the current working directory (project root)
const mongoose = require('mongoose');
const connectDB = require('../src/config/db'); // Path relative to project root
const UpworkAccount = require('../src/models/UpworkAccount'); // Path relative to project root

const seedAccount = async () => {
    let dbConnected = false;
    try {
        await connectDB();
        dbConnected = true;
        console.log('MongoDB Connected for Upwork account seeding...');

        const email = process.env.UPWORK_ACCOUNT_SEED_EMAIL;
        const password = process.env.UPWORK_ACCOUNT_SEED_PASSWORD;
        const securityAnswer = process.env.UPWORK_ACCOUNT_SEED_SECURITY_ANSWER;

        // Validate that email and password are provided.
        // Security answer can be an empty string, but must be defined.
        if (!email || !password || typeof securityAnswer === 'undefined') {
            console.error(
                'Error: UPWORK_ACCOUNT_SEED_EMAIL, UPWORK_ACCOUNT_SEED_PASSWORD must be defined in .env. UPWORK_ACCOUNT_SEED_SECURITY_ANSWER must also be present (can be an empty string).'
            );
            if (dbConnected) await mongoose.disconnect(); // Disconnect if connected before exiting
            process.exit(1);
        }

        console.log(`Attempting to seed account for email: ${email}`);

        const existingAccount = await UpworkAccount.findOne({ email });

        if (existingAccount) {
            console.log(`Upwork account with email ${email} already exists. No new account seeded.`);
        } else {
            const newAccount = new UpworkAccount({
                email,
                password, // Stored as-is for Puppeteer; consider encryption for real apps
                securityAnswer, // Stored as-is, even if empty string
                cookies: [], // Initialize with empty cookies
                upworkAuthToken: null, // Initialize as null
                isActive: true,
                lastRefreshedAt: null, // Initialize as null
                loginError: null, // Initialize as null
            });

            await newAccount.save();
            console.log(`Successfully seeded Upwork account for ${email}.`);
        }
    } catch (error) {
        console.error('Error seeding Upwork account:', error.message);
        if (dbConnected) { // Attempt to disconnect only if connection was established
            try {
                await mongoose.disconnect();
            } catch (disconnectErr) {
                console.error('Failed to disconnect MongoDB during error handling:', disconnectErr);
            }
        }
        process.exit(1); // Exit with failure status
    } finally {
        // Ensure the database connection is closed if it was successfully opened and not already closed.
        if (dbConnected && mongoose.connection.readyState === 1) { // 1 for connected
            try {
                await mongoose.disconnect();
                console.log('MongoDB disconnected successfully.');
            } catch (disconnectError) {
                console.error('Error disconnecting MongoDB in finally block:', disconnectError.message);
            }
        }
        // If no error occurred and script is finishing, exit with 0
        // If an error occurred, process.exit(1) would have been called.
        if (!process.exitCode) { // Check if an exit code hasn't already been set by an error
            process.exit(0);
        }
    }
};

seedAccount();
