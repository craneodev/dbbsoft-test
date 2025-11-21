const express = require('express');
const app = express();
const PORT = 8080;

const packageJson = require('./package.json');
const VERSION = packageJson.version;

app.get('/health', (req, res) => {
    res.json({
        status: "healthy",
        version: VERSION
    });
});

app.get('/', (req, res) => {
    res.send(`Craneodev test app for DBB Software. The app is running. Version: ${VERSION}`);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}, version ${VERSION}`);
});