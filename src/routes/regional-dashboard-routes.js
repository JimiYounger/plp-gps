const { auth } = require('../middleware');
const regionalDashboardService = require('../services/regional-dashboard-service');

/**
 * Regional dashboard routes
 * Provides endpoints for accessing region-specific dashboard data
 */
async function regionalDashboardRoutes(fastify, options) {
  // Main regional dashboard route
  fastify.get('/health/regional-dashboard/:regionName', {
    preHandler: [
      auth.isAuthenticated,
      auth.hasRegionAccess
    ]
  }, async (request, reply) => {
    try {
      const { regionName } = request.params;
      
      // Log initial request parameters
      console.log('\n=== Starting Regional Dashboard Request ===');
      console.log('Request parameters:', {
        region: regionName,
        requestedMonth: request.query.month,
        requestedRole: request.query.role
      });
      
      // Get available months for filtering
      const availableMonths = await regionalDashboardService.getAvailableMonths();
      
      // Determine which month to use (requested or most recent)
      let monthDate = request.query.month;
      if (!monthDate || !availableMonths.includes(monthDate)) {
        monthDate = availableMonths[0]; // Use most recent month
        console.log('Using most recent available month:', monthDate);
      }
      
      // Get role type from query or default to 'All'
      const roleType = request.query.role || 'All';
      
      console.log('Processed parameters:', {
        regionName,
        monthDate,
        roleType,
        availableMonths
      });
      
      // Log the start of data fetching
      console.log('\n=== Fetching Regional Data ===');
      
      // Get list of areas in the region
      const areasInRegion = await regionalDashboardService.getAreasInRegion(regionName);
      
      if (!areasInRegion || areasInRegion.length === 0) {
        throw new Error(`No areas found for region: ${regionName}`);
      }
      
      console.log(`Found ${areasInRegion.length} areas in region ${regionName}`);
      
      // Fetch region metrics and response rates concurrently
      const [regionMetrics, responseRates] = await Promise.all([
        regionalDashboardService.getRegionMetrics(regionName, monthDate, roleType),
        regionalDashboardService.getRegionResponseRates(regionName, monthDate, roleType)
      ]);
      
      // Log the data we're about to send to the template
      console.log('\n=== Data Ready for Template ===');
      console.log('Region Metrics:', {
        hasMetrics: !!regionMetrics?.metrics,
        metricCount: Object.keys(regionMetrics?.metrics || {}).length,
        responseRate: regionMetrics?.responseRate,
        areasWithData: regionMetrics?.areasCount?.withData
      });
      
      // Filter out metrics with no data
      const filteredMetrics = {};
      Object.entries(regionMetrics.metrics).forEach(([key, value]) => {
        if (value.responses > 0) {
          filteredMetrics[key] = value;
        }
      });
      
      // Render the regional dashboard template with all required data
      return reply.view('health/regional-dashboard', {
        regionName,
        metrics: filteredMetrics,
        responseRate: regionMetrics.responseRate,
        areasCount: regionMetrics.areasCount,
        responseRates,
        areasInRegion,
        selectedMonth: monthDate,
        selectedRole: roleType,
        availableMonths,
        layout: 'default'
      });
      
    } catch (error) {
      // Log any errors that occur
      console.error('\n=== Error in Regional Dashboard Route ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      
      request.log.error(error);
      
      // Send error response to client
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Error fetching regional dashboard data: ' + error.message
      });
    }
  });

  // Route to get all areas in a region (for AJAX requests)
  fastify.get('/api/regions/:regionName/areas', {
    preHandler: [
      auth.isAuthenticated,
      auth.hasRegionAccess
    ]
  }, async (request, reply) => {
    try {
      const { regionName } = request.params;
      
      const areas = await regionalDashboardService.getAreasInRegion(regionName);
      
      return reply.send({
        success: true,
        areas
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Error fetching areas for region: ' + error.message
      });
    }
  });
  
  // Route to get region metrics (for AJAX requests or data export)
  fastify.get('/api/regions/:regionName/metrics', {
    preHandler: [
      auth.isAuthenticated,
      auth.hasRegionAccess
    ]
  }, async (request, reply) => {
    try {
      const { regionName } = request.params;
      const monthDate = request.query.month;
      const roleType = request.query.role || 'All';
      
      const metrics = await regionalDashboardService.getRegionMetrics(regionName, monthDate, roleType);
      
      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Error fetching metrics for region: ' + error.message
      });
    }
  });
}

module.exports = regionalDashboardRoutes; 