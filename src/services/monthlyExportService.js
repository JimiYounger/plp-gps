// src/services/monthlyExportService.js

/**
 * This service handles the generation and organization of monthly organizational health data.
 * It combines metrics, feedback, and insights from various areas into a comprehensive analysis.
 */

const base = require('../config/airtable');
const surveyMetricsService = require('./surveyMetricsService');

// Define constants for consistent metric handling throughout the service
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

// Define feedback categories with their context for analysis
const FEEDBACK_FIELDS = {
    'Feedback': {
        question: "What feedback do you have about your overall experience?",
        purpose: "Capture general sentiments and experiences",
        analysis_hints: ["Look for common themes", "Identify urgent concerns"]
    },
    'Energy Feedback': {
        question: "How is your energy level at the beginning and end of the day?",
        purpose: "Assess work-life balance and burnout risks",
        analysis_hints: ["Compare start vs end of day", "Look for energy patterns"]
    },
    'Development Feedback': {
        question: "How are you progressing with your personal & professional development?",
        purpose: "Track growth and development progress",
        analysis_hints: ["Identify training needs", "Note mentorship requests"]
    },
    'Financial Goals Feedback': {
        question: "How are you progressing towards your financial goals?",
        purpose: "Monitor financial satisfaction",
        analysis_hints: ["Track compensation concerns", "Note resource needs"]
    },
    'Personal Performance Feedback': {
        question: "Rate and comment on your professional performance",
        purpose: "Self-assessment insights",
        analysis_hints: ["Compare with metrics", "Identify support needs"]
    }
};

class MonthlyExportService {
    constructor() {
        this.base = base;
        this.metricsService = surveyMetricsService;
        this.npsQuestions = NPS_QUESTIONS;
    }

    /**
     * Generates a comprehensive analysis of organizational health for a specific month
     * @param {string} monthKey - The month to analyze (YYYY-MM format)
     * @returns {Promise<Object>} Structured analysis data
     */
    async exportMonthlyAnalysis(monthKey) {
        try {
            console.log(`Starting monthly analysis export for ${monthKey}...`);

            // Gather all necessary data
            const gpsSummary = await this.metricsService.getMonthlySummary(monthKey);
            if (!gpsSummary) {
                throw new Error(`No GPS Summary found for ${monthKey}`);
            }

            const areaSummaries = await this.getAreaSummariesForMonth(monthKey);
            console.log(`Found ${areaSummaries.length} area summaries`);

            // Build the analysis structure
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

            // Process overall metrics
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

                // Add metrics for each area
                this.npsQuestions.forEach(question => {
                    monthlyAnalysis.area_breakdown[areaName].metrics[question] = {
                        nps_score: area.get(`${question} NPS`),
                        responses: area.get(`${question} Responses`),
                        average: area.get(`${question} Avg`)
                    };
                });

                // Add area-specific feedback if available
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

            // Generate insights based on the collected data
            this.generateInsights(monthlyAnalysis);

            return monthlyAnalysis;
        } catch (error) {
            console.error('Error in monthly analysis export:', error);
            throw error;
        }
    }

    /**
     * Retrieves all area summaries for a specific month
     * @param {string} monthKey - The month in YYYY-MM format
     * @returns {Promise<Array>} Array of area summary records
     */
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

    /**
     * Determines the status label for a given NPS score
     * @param {number} npsScore - The NPS score to evaluate
     * @returns {string} Status description
     */
    getMetricStatus(npsScore) {
        if (npsScore >= 50) return "Excellent";
        if (npsScore >= 30) return "Strong";
        if (npsScore >= 0) return "Moderate";
        return "Needs Attention";
    }

    /**
     * Generates insights based on the analyzed data
     * @param {Object} analysis - The monthly analysis data
     */
    generateInsights(analysis) {
        // Analyze overall metrics for strengths and concerns
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

        // Analyze survey completion rates
        const lowCompletionAreas = Object.entries(analysis.area_breakdown)
            .filter(([_, data]) => data.completion.completion_rate < 70)
            .map(([area, _]) => area);

        if (lowCompletionAreas.length > 0) {
            analysis.monthly_insights.concerns.push(
                `Low survey completion rates in: ${lowCompletionAreas.join(', ')}`
            );
        }

        // Add general recommendations based on findings
        if (analysis.monthly_insights.concerns.length > 0) {
            analysis.monthly_insights.recommendations.push(
                "Consider conducting focused feedback sessions in areas showing concerning metrics",
                "Review and strengthen communication channels in areas with low completion rates"
            );
        }
    }
}

// Export a single instance of the service
module.exports = new MonthlyExportService();