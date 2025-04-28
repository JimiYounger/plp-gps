// test-monthly-export.js

const surveyMetricsService = require('./src/services/surveyMetricsService');
const base = require('./src/config/airtable');

// Define the NPS questions directly in our export service to ensure availability
const NPS_QUESTIONS = [
    'Career Growth',
    'Training',
    'Support',
    'Pay Accuracy',
    'Company Endorsement',
    'Opportunity',
    'Energy',
    'Development',
    'Financial Goals',
    'Personal Performance'
];

class MonthlyExportService {
    constructor() {
        this.base = base;
        this.metricsService = surveyMetricsService;
        this.npsQuestions = NPS_QUESTIONS; // Store questions for easy access
    }

    async exportMonthlyAnalysis(monthKey) {
        try {
            console.log(`Starting monthly analysis export for ${monthKey}...`);

            const gpsSummary = await this.metricsService.getMonthlySummary(monthKey);
            if (!gpsSummary) {
                throw new Error(`No GPS Summary found for ${monthKey}`);
            }

            const areaSummaries = await this.getAreaSummariesForMonth(monthKey);
            console.log(`Found ${areaSummaries.length} area summaries`);

            const monthlyAnalysis = {
                metadata: {
                    month: monthKey,
                    last_updated: gpsSummary.get('Last Updated'),
                    total_areas: areaSummaries.length,
                    status: gpsSummary.get('Summary Status')
                },
                overall_metrics: {},
                area_breakdown: {},
                feedback_analysis: {},
                monthly_insights: {
                    strengths: [],
                    concerns: [],
                    trends: [],
                    recommendations: []
                }
            };

            // Process overall metrics using our local NPS_QUESTIONS
            this.npsQuestions.forEach(question => {
                console.log(`Processing metric: ${question}`);
                const npsScore = gpsSummary.get(`${question} NPS`);
                monthlyAnalysis.overall_metrics[question] = {
                    nps_score: npsScore,
                    responses: gpsSummary.get(`${question} Responses`),
                    average: gpsSummary.get(`${question} Avg`),
                    status: this.getMetricStatus(npsScore)
                };
            });

            // Process area breakdowns
            areaSummaries.forEach(area => {
                const areaName = area.get('Area');
                console.log(`Processing area: ${areaName}`);
                
                monthlyAnalysis.area_breakdown[areaName] = {
                    completion: {
                        total_team_members: area.get('Total Team Members'),
                        completed_surveys: area.get('Completed Surveys'),
                        completion_rate: area.get('Completion Rate')
                    },
                    metrics: {}
                };

                // Add metrics for each area using our local NPS_QUESTIONS
                this.npsQuestions.forEach(question => {
                    monthlyAnalysis.area_breakdown[areaName].metrics[question] = {
                        nps_score: area.get(`${question} NPS`),
                        responses: area.get(`${question} Responses`),
                        average: area.get(`${question} Avg`)
                    };
                });

                // Add area feedback if it exists
                const areaFeedback = area.get('Area Feedback Data');
                if (areaFeedback) {
                    try {
                        monthlyAnalysis.area_breakdown[areaName].feedback = 
                            JSON.parse(areaFeedback);
                    } catch (e) {
                        console.warn(`Could not parse feedback data for ${areaName}`);
                    }
                }
            });

            // Process overall feedback data
            const overallFeedback = gpsSummary.get('Feedback Data');
            if (overallFeedback) {
                try {
                    monthlyAnalysis.feedback_analysis = JSON.parse(overallFeedback);
                } catch (e) {
                    console.warn('Could not parse overall feedback data');
                }
            }

            this.generateInsights(monthlyAnalysis);

            return monthlyAnalysis;
        } catch (error) {
            console.error('Error in monthly analysis export:', error);
            throw error;
        }
    }

    async getAreaSummariesForMonth(monthKey) {
        try {
            const summaries = await this.base('Area Summary').select({
                filterByFormula: `SEARCH('${monthKey}', {Month Summary})`
            }).all();
            console.log(`Retrieved ${summaries.length} area summaries for ${monthKey}`);
            return summaries;
        } catch (error) {
            console.error('Error fetching area summaries:', error);
            throw error;
        }
    }

    getMetricStatus(npsScore) {
        if (npsScore >= 50) return "Excellent";
        if (npsScore >= 30) return "Strong";
        if (npsScore >= 0) return "Moderate";
        return "Needs Attention";
    }

    generateInsights(analysis) {
        Object.entries(analysis.overall_metrics).forEach(([metric, data]) => {
            if (data.nps_score >= 30) {
                analysis.monthly_insights.strengths.push(
                    `Strong ${metric} performance with NPS score of ${data.nps_score}`
                );
            }
            if (data.nps_score < 0) {
                analysis.monthly_insights.concerns.push(
                    `${metric} needs attention with NPS score of ${data.nps_score}`
                );
            }
        });

        const lowCompletionAreas = Object.entries(analysis.area_breakdown)
            .filter(([_, data]) => data.completion.completion_rate < 70)
            .map(([area, _]) => area);

        if (lowCompletionAreas.length > 0) {
            analysis.monthly_insights.concerns.push(
                `Low survey completion rates in: ${lowCompletionAreas.join(', ')}`
            );
        }
    }
}

async function testMonthlyExport(monthKey) {
    try {
        console.log(`Starting export for ${monthKey}...`);
        const exportService = new MonthlyExportService();
        const monthlyData = await exportService.exportMonthlyAnalysis(monthKey);
        
        // Create a visual separator for better readability
        console.log('\n' + '='.repeat(80));
        console.log('MONTHLY ANALYSIS DATA');
        console.log('='.repeat(80) + '\n');
        
        // Display the data in a nicely formatted way
        console.log(JSON.stringify(monthlyData, null, 2));
        
        // Create another separator
        console.log('\n' + '='.repeat(80));
        
        // Display a helpful summary
        console.log('\nEXPORT SUMMARY:');
        console.log('-'.repeat(40));
        console.log(`Month: ${monthKey}`);
        console.log(`Total areas processed: ${monthlyData.metadata.total_areas}`);
        console.log(`Strengths identified: ${monthlyData.monthly_insights.strengths.length}`);
        console.log(`Concerns identified: ${monthlyData.monthly_insights.concerns.length}`);
        
        // Add instructions for copying
        console.log('\nTIP: To copy this data:');
        console.log('1. Click and drag to select all the text between the separator lines');
        console.log('2. Use Ctrl+C (Cmd+C on Mac) to copy the selected text');
        console.log('3. The JSON data is properly formatted and ready to be pasted elsewhere');
        
    } catch (error) {
        console.error('Export failed:', error);
    }
}

// Run the test with a specific month
testMonthlyExport('2025-01');