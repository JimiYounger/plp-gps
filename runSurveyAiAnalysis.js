#!/usr/bin/env node
const SurveyAiAnalysisService = require('./src/services/surveyAiAnalysisService');
const service = new SurveyAiAnalysisService();

async function run() {
  try {
    // Process all unprocessed packages
    const results = await service.processAllUnprocessedPackages();
    console.log('AI Analysis processing complete:', results);
    process.exit(0);
  } catch (error) {
    console.error('Error processing AI Analysis:', error);
    process.exit(1);
  }
}

run();
