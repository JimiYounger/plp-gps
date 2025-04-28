// src/routes/area-dashboard-routes.js
const { auth } = require('../middleware');
const areaDashboardService = require('../services/area-dashboard-service');

async function areaDashboardRoutes(fastify, options) {
  
  // Register the middleware for all routes in this plugin

  
      fastify.get('/health/area-dashboard/:areaName', async (request, reply) => {
      try {
        const { areaName } = request.params;
        const initialMonthDate = request.query.month || new Date().toISOString().slice(0, 7) + '-01';
        const roleType = request.query.role || 'Setter';

        // First fetch metrics to get the actual month date we'll use
        const metricsResult = await areaDashboardService.getAreaMetrics(areaName, initialMonthDate, roleType);

        // Now use the same month date for all other queries to ensure consistency
        const actualMonthDate = metricsResult.monthDate; // We'll need to add this to the metrics result

        const [
          summary, 
          availableMonths,
          generalResponses,
          roadblocksResponses,
          leadershipResponses
        ] = await Promise.all([
          areaDashboardService.getAreaSummary(areaName, actualMonthDate, roleType),
          areaDashboardService.getAvailableMonths(),
          areaDashboardService.getFeedbackResponses(areaName, actualMonthDate, roleType, 'general'),
          areaDashboardService.getFeedbackResponses(areaName, actualMonthDate, roleType, 'roadblocks'),
          areaDashboardService.getFeedbackResponses(areaName, actualMonthDate, roleType, 'leadership_support')
        ]);

        // Return the view with all data including new feedback responses
        return reply.view('health/area-dashboard', {
          areaName,
          metrics: metricsResult.metrics,
          responseRate: metricsResult.responseRate,
          summary,
          selectedMonth: actualMonthDate, // Use the actual month date here
          selectedRole: roleType,
          availableMonths,
          generalResponses,
          roadblocksResponses,
          leadershipResponses,
          layout: 'default'
        });
      } catch (error) {
        console.error('Route error:', error);
        request.log.error(error);
        reply.status(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Error fetching dashboard data'
        });
      }
    });
}

module.exports = areaDashboardRoutes;