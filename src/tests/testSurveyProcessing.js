// src/tests/testSurveyProcessing.js

const { processMonthlySurvey } = require('../services/surveyProcessingService');
const { supabase } = require('../config/supabase');  // Updated import

async function testProcessing() {
    try {
        console.log('=== Starting Survey Processing Test ===\n');

        // First test Supabase connection
        console.log('Testing Supabase connection...');
        const { testConnection } = require('../config/supabase');
        const connected = await testConnection();
        if (!connected) {
            throw new Error('Failed to connect to Supabase');
        }
        console.log('Supabase connection successful');

        // Process the survey data
        console.log('\nProcessing January 2025 survey data...');
        const result = await processMonthlySurvey();
        console.log('Initial processing complete:', result);

        // Rest of the test remains the same, but use 'supabase' instead of 'supabaseClient'
        console.log('\n=== Checking Organization Summary ===');
        const { data: orgSummary, error: orgError } = await supabase
            .from('org_monthly_summary')
            .select('*')
            .eq('month_date', '2025-01-01')
            .single();

        if (orgError) {
            console.error('Error fetching org summary:', orgError);
        } else {
            console.log('\nParticipation Metrics:');
            console.log(`Total Responses: ${orgSummary.total_responses}/${orgSummary.total_headcount} (${((orgSummary.total_responses/orgSummary.total_headcount)*100).toFixed(1)}%)`);
            console.log(`Setters: ${orgSummary.setter_responses}/${orgSummary.setter_headcount}`);
            console.log(`Closers: ${orgSummary.closer_responses}/${orgSummary.closer_headcount}`);
            console.log(`Managers: ${orgSummary.manager_responses}/${orgSummary.manager_headcount}`);

            console.log('\nNPS Scores:');
            console.log(`Career Growth NPS: ${orgSummary.career_growth_nps}`);
            console.log(`Training NPS: ${orgSummary.training_nps}`);
            console.log(`Support NPS: ${orgSummary.support_nps}`);
            console.log(`Company Endorsement NPS: ${orgSummary.company_endorsement_nps}`);
        }

        // Check Area Summaries
        console.log('\n=== Checking Area Summaries ===');
        const { data: areaSummaries, error: areaError } = await supabase
            .from('area_monthly_summary')
            .select('*')
            .eq('month_date', '2025-01-01');

        if (areaError) {
            console.error('Error fetching area summaries:', areaError);
        } else {
            areaSummaries.forEach(area => {
                console.log(`\n${area.area_name}:`);
                console.log(`- Total: ${area.total_responses}/${area.total_headcount} responses`);
                console.log(`- Career Growth NPS: ${area.career_growth_nps}`);
                console.log(`- Training NPS: ${area.training_nps}`);
                console.log(`- Support NPS: ${area.support_nps}`);
            });
        }

        console.log('\n=== Test Complete ===');
    } catch (error) {
        console.error('\nTest failed with error:', error);
        throw error;
    }
}

// Run the test
testProcessing()
    .then(() => {
        console.log('\nTest script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('Test script failed:', error);
        process.exit(1);
    });