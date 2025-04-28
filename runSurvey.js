const { processMonthlySurvey } = require('./src/services/surveyProcessingService');

async function runService() {
  try {
    // Process data for March 2025
    const targetDate = new Date('2025-03-01');
    const result = await processMonthlySurvey(targetDate);
    console.log('Survey processing completed successfully:', result);
  } catch (error) {
    console.error('Failed to process survey:', error);
  }
}

runService();