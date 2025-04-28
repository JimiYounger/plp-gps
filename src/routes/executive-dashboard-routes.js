// src/routes/executive-dashboard-routes.js
const { auth } = require('../middleware');
const executiveDashboardService = require('../services/executive-dashboard-service');

// Export a Fastify plugin function that accepts fastify instance and options
async function executiveDashboardRoutes(fastify, options) {
  // Register middlewares
  fastify.addHook('preHandler', auth.isAuthenticated);
  fastify.addHook('preHandler', auth.hasExecAccess);

  // Register the dashboard route
  fastify.get('/exec-dashboard', async (request, reply) => {
    try {
      // Log initial request parameters
      console.log('\n=== Starting Dashboard Request ===');
      console.log('Initial request parameters:', {
        requestedMonth: request.query.month,
        requestedRole: request.query.role
      });

      // Get available months for the filter
      const availableMonths = await executiveDashboardService.getAvailableMonths();
      
      // Determine which month to use (requested or most recent)
      let monthDate = request.query.month;
      if (!monthDate || !availableMonths.includes(monthDate)) {
        monthDate = availableMonths[0]; // Use most recent month
        console.log('Using most recent available month:', monthDate);
      }
      
      // Get role type from query or default to 'All'
      const roleType = request.query.role || 'All';
      
      console.log('Processed parameters:', {
        monthDate,
        roleType,
        availableMonths
      });

      // Log the start of data fetching
      console.log('\n=== Fetching Data ===');
      console.log('Starting Promise.all for data fetch...');
      
      // Fetch both organization and area metrics concurrently
      const [orgMetrics, areaMetrics] = await Promise.all([
        executiveDashboardService.getOrgMetrics(monthDate, roleType),
        executiveDashboardService.getAreaMetrics(monthDate, roleType)
      ]);

      // Log the data we're about to send to the template
      console.log('\n=== Data Ready for Template ===');
      console.log('Organization Metrics:', {
        hasMetrics: !!orgMetrics?.metrics,
        metricCount: Object.keys(orgMetrics?.metrics || {}).length,
        responseRate: orgMetrics?.responseRate
      });
      
      console.log('Area Metrics:', {
        areaCount: Object.keys(areaMetrics || {}).length,
        areaNames: Object.keys(areaMetrics || {})
      });

      // Filter out metrics with no data
      const filteredMetrics = {};
      Object.entries(orgMetrics.metrics).forEach(([key, value]) => {
        if (value.responses > 0) {
          filteredMetrics[key] = value;
        }
      });

      // Render the dashboard template with all required data
      return reply.view('health/exec-dashboard', {
        metrics: filteredMetrics,
        areaMetrics,
        responseRate: orgMetrics.responseRate,
        selectedMonth: monthDate,
        selectedRole: roleType,
        availableMonths,
        layout: 'default'
      });

    } catch (error) {
      // Log any errors that occur
      console.error('\n=== Error in Dashboard Route ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      
      request.log.error(error);
      
      // Send error response to client
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Error fetching dashboard data'
      });
    }
  });
}

// Export using fastify-plugin to maintain the correct scope
module.exports = executiveDashboardRoutes;