/**
 * Simple Node.js Web Application
 * 
 * This is a lightweight Express.js server that provides health check functionality
 * for AWS Elastic Beanstalk monitoring and deployment verification.
 * 
 * The application reads its version from package.json to ensure consistent versioning
 * across the CI/CD pipeline and infrastructure deployment.
 */

const express = require('express');
const app = express();

// Port 8080 is required by the task specification and exposed in the Dockerfile
const PORT = 8080;

// Read application version from package.json for semantic versioning
const packageJson = require('./package.json');
const VERSION = packageJson.version;

/**
 * Health Check Endpoint
 * 
 * Required endpoint that returns JSON response with application status.
 * Used by:
 * - AWS Elastic Beanstalk health monitoring
 * - Load balancers for health checks
 * - CI/CD pipeline verification after deployment
 * 
 * Returns:
 * - status: "healthy" indicating the application is running properly
 * - version: current application version from package.json
 */
app.get('/health', (req, res) => {
    res.json({
        status: "healthy",
        version: VERSION
    });
});

/**
 * Root Endpoint
 * 
 * Simple landing page that confirms the application is running.
 * Displays the current version for easy verification.
 */
app.get('/', (req, res) => {
    res.send(`Craneodev test app for DBB Software. The app is running. Version: ${VERSION}`);
});

// Start the Express server on port 8080
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}, version ${VERSION}`);
});