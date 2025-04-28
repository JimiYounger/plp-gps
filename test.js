// test.js

const surveyMetricsService = require('./src/services/surveyMetricsService');

async function testAreaExport() {
    try {
        console.log('Starting area analysis export...');
        console.log('Area: Medford');
        console.log('Month: 2025-01');
        console.log('----------------------------------------');

        const analysis = await surveyMetricsService.exportAreaAnalysis('Medford', '2025-01');
        
        // Create a more readable output by parsing and re-stringifying with formatting
        const formattedAnalysis = JSON.parse(analysis);
        console.log(JSON.stringify(formattedAnalysis, null, 2));

        console.log('----------------------------------------');
        console.log('Analysis export completed successfully.');
    } catch (error) {
        console.error('Error during analysis export:');
        console.error(error.message);
        if (error.statusCode) {
            console.error('Status Code:', error.statusCode);
        }
    }
}

// Run the test
testAreaExport();