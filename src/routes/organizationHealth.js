// src/routes/organizationHealth.js

const surveyMetricsService = require('../services/surveyMetricsService');
const teamService = require('../services/teamService');
const monthlyExportService = require('../services/monthlyExportService');

async function routes(fastify, options) {
  // Main dashboard route with month selection
  fastify.get('/dashboard', async (request, reply) => {
    try {
      // Parse selected month from query params, default to current month
      let targetMonth = new Date();
      if (request.query.month) {
        const [year, month] = request.query.month.split('-');
        targetMonth = new Date(parseInt(year), parseInt(month) - 1);
      }
      
      // Get metrics for the selected month
      const [areaMetrics, overallMetrics] = await Promise.all([
        surveyMetricsService.getAreaMetrics(targetMonth),
        surveyMetricsService.getOverallMetrics(targetMonth)
      ]);
      
      const areas = Object.keys(areaMetrics);
      
      // Fetch completion data for all areas
      const completionData = await Promise.all(
        areas.map(async (area) => {
          const rosterData = await teamService.getAreaRosterWithSurveyStatus(area, targetMonth);
          return {
            area,
            completionRate: rosterData.stats.completionRate,
            completed: rosterData.stats.completed,
            total: rosterData.stats.total
          };
        })
      );

      const areaCompletionRates = Object.fromEntries(
        completionData.map(data => [data.area, data])
      );

      // Get available months for the month selector
      // You'll need to implement this method in your service
      const availableMonths = await surveyMetricsService.getAvailableMonths();

      return reply.view("organization-health/dashboard", {
        areas,
        overallMetrics,
        areaMetrics,
        areaCompletionRates,
        currentMonth: targetMonth.toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric' 
        }),
        selectedMonth: surveyMetricsService.formatMonthKey(targetMonth),
        availableMonths,  // For the month selector dropdown
        page: {
          title: 'Organization Health Dashboard',
          description: 'Employee Survey Metrics and Analysis'
        }
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      return reply.view("error", {
        message: "Unable to load dashboard data",
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  });

  // Area detail route with month selection
  fastify.get('/area/:areaName', async (request, reply) => {
    try {
      const { areaName } = request.params;
      
      // Parse selected month from query params, default to current month
      let targetMonth = new Date();
      if (request.query.month) {
        const [year, month] = request.query.month.split('-');
        targetMonth = new Date(parseInt(year), parseInt(month) - 1);
      }
      
      // Fetch all data concurrently
      const [areaMetrics, rosterData, availableMonths] = await Promise.all([
        surveyMetricsService.getAreaMetrics(targetMonth),
        teamService.getAreaRosterWithSurveyStatus(areaName, targetMonth),
        surveyMetricsService.getAvailableMonths()
      ]);

      const areas = Object.keys(areaMetrics);

      // Check if the requested area exists
      if (!areaMetrics[areaName]) {
        return reply.status(404).view("error", {
          error: `Area "${areaName}" not found`
        });
      }

      const metrics = areaMetrics[areaName];

      return reply.view("organization-health/area-detail", {
        areaName,
        areas,
        metrics,
        roster: rosterData.roster,
        completionStats: rosterData.stats,
        currentMonth: targetMonth.toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric' 
        }),
        selectedMonth: surveyMetricsService.formatMonthKey(targetMonth),
        availableMonths,  // For the month selector dropdown
        page: {
          title: `${areaName} - Organization Health Metrics`,
          description: `Detailed survey metrics for ${areaName}`
        }
      });
    } catch (error) {
      console.error('Area detail error:', error);
      return reply.view("error", {
        message: "Unable to load area data",
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  });

  // Route to generate/update summaries (could be triggered by a scheduled job)
fastify.get('/generate-summaries', async (request, reply) => {
  try {
    // Default to current month if no month specified
    const targetMonth = new Date();
    
    console.log('Starting summary generation for:', targetMonth);
    
    // Generate the summaries
    const summary = await surveyMetricsService.generateMonthlySummary(targetMonth);
    
    // Return success message with generated data
    return reply.send({
      success: true,
      message: 'Summaries generated successfully',
      summary: summary
    });
  } catch (error) {
    console.error('Error generating summaries:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to generate summaries',
      details: error.message
    });
  }
});

fastify.get('/monthly-analysis/:monthKey?', async (request, reply) => {
        try {
            // If no month is specified, use current month
            const monthKey = request.params.monthKey || surveyMetricsService.formatMonthKey(new Date());
            
            console.log(`Generating monthly analysis for ${monthKey}...`);
            
            // Use our imported service
            const monthlyData = await monthlyExportService.exportMonthlyAnalysis(monthKey);
            
            // Set appropriate headers for JSON response
            reply.header('Content-Type', 'application/json');
            reply.header('Content-Disposition', 'inline');
            
            // Return the JSON data
            return monthlyData;
        } catch (error) {
            console.error('Monthly analysis generation failed:', error);
            reply.status(500).send({
                error: 'Failed to generate monthly analysis',
                message: error.message
            });
        }
    });



}

module.exports = routes;