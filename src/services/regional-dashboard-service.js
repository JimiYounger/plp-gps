const { supabase } = require('../config/supabase');

class RegionalDashboardService {
  /**
   * Get all areas within a specific region
   * @param {string} regionName - The name of the region to fetch areas for
   * @returns {Promise<Array>} Array of area names in the region
   */
  async getAreasInRegion(regionName) {
    try {
      console.log('Fetching areas for region:', regionName);
      
      const { data, error } = await supabase
        .from('areas')
        .select('area_name')
        .eq('region', regionName)
        .order('area_name');

      if (error) throw error;
      
      return data.map(area => area.area_name);
    } catch (error) {
      console.error('Error fetching areas in region:', error);
      throw error;
    }
  }

  /**
   * Get aggregated metrics for all areas in a region
   * @param {string} regionName - The name of the region to fetch metrics for
   * @param {string} monthDate - The month to fetch data for (YYYY-MM-DD)
   * @param {string} roleType - The role type to filter by (defaults to 'All')
   * @returns {Promise<Object>} Object containing aggregated metrics for the region
   */
  async getRegionMetrics(regionName, monthDate, roleType = 'All') {
    try {
      console.log('Fetching region metrics for:', { regionName, monthDate, roleType });
      
      // First get the most recent available month if none provided
      if (!monthDate) {
        monthDate = await this.getMostRecentMonth();
        console.log('Using most recent month:', monthDate);
      }

      // Get all areas in the region
      const areas = await this.getAreasInRegion(regionName);
      
      if (!areas.length) {
        throw new Error(`No areas found for region: ${regionName}`);
      }
      
      console.log(`Found ${areas.length} areas in region ${regionName}`);
      
      // Fetch metrics for all areas in the region
      const { data, error } = await supabase
        .from('area_monthly_summary')
        .select('*')
        .in('area_name', areas)
        .eq('month_date', monthDate);

      if (error) throw error;
      
      if (!data?.length) {
        console.log('No data found for month, trying most recent month...');
        const mostRecentMonth = await this.getMostRecentMonth();
        
        const { data: latestData, error: latestError } = await supabase
          .from('area_monthly_summary')
          .select('*')
          .in('area_name', areas)
          .eq('month_date', mostRecentMonth);
          
        if (latestError) throw latestError;
        if (!latestData?.length) {
          throw new Error(`No data available for areas in region: ${regionName}`);
        }
        
        data = latestData;
        monthDate = mostRecentMonth;
      }
      
      // Aggregate metrics across all areas
      return this.aggregateAreaMetrics(data, roleType, areas);
    } catch (error) {
      console.error('Error fetching region metrics:', error);
      throw error;
    }
  }

  /**
   * Aggregate metrics from multiple areas
   * @param {Array} areasData - Array of area data objects
   * @param {string} roleType - The role type to filter by
   * @param {Array} allAreas - Complete list of areas in the region
   * @returns {Object} Aggregated metrics for the region
   */
  aggregateAreaMetrics(areasData, roleType = 'All', allAreas = []) {
    const prefix = roleType.toLowerCase() === 'all' ? '' : `${roleType.toLowerCase()}_`;
    
    // Initialize metric categories and counters
    const metricFields = [
      'career_growth', 'training', 'support', 'pay_accuracy', 
      'company_endorsement', 'opportunity', 'energy', 'development', 
      'financial_goals', 'personal_performance', 'team_culture'
    ];
    
    const aggregatedMetrics = {};
    const responseRateTotals = {
      total: 0,
      completed: 0
    };
    
    // Initialize aggregation objects for each metric
    metricFields.forEach(field => {
      aggregatedMetrics[field] = {
        promoters: 0,
        passives: 0,
        detractors: 0,
        responses: 0,
        sum: 0
      };
    });

    // Aggregate data across all areas
    areasData.forEach(area => {
      metricFields.forEach(field => {
        const promoters = Number(area[`${prefix}${field}_promoters`]) || 0;
        const passives = Number(area[`${prefix}${field}_passives`]) || 0;
        const detractors = Number(area[`${prefix}${field}_detractors`]) || 0;
        const avg = Number(area[`${prefix}${field}_avg`]) || 0;
        
        aggregatedMetrics[field].promoters += promoters;
        aggregatedMetrics[field].passives += passives;
        aggregatedMetrics[field].detractors += detractors;
        
        const responses = promoters + passives + detractors;
        aggregatedMetrics[field].responses += responses;
        aggregatedMetrics[field].sum += avg * responses; // Weighted average
      });
      
      // Aggregate response rate data
      if (roleType.toLowerCase() === 'all') {
        responseRateTotals.total += Number(area.total_headcount) || 0;
        responseRateTotals.completed += Number(area.total_responses) || 0;
      } else {
        responseRateTotals.total += Number(area[`${prefix}headcount`]) || 0;
        responseRateTotals.completed += Number(area[`${prefix}responses`]) || 0;
      }
    });
    
    // Calculate NPS and averages
    const finalMetrics = {};
    metricFields.forEach(field => {
      const metric = aggregatedMetrics[field];
      const total = metric.promoters + metric.passives + metric.detractors;
      const nps = total > 0 ? ((metric.promoters - metric.detractors) / total) * 100 : 0;
      const avg = metric.responses > 0 ? metric.sum / metric.responses : 0;
      
      finalMetrics[this._formatMetricName(field)] = {
        nps,
        avg,
        promoters: metric.promoters,
        passives: metric.passives,
        detractors: metric.detractors,
        responses: metric.responses,
        color: this._getNPSColor(nps),
        status: this._getNPSStatus(nps)
      };
    });
    
    // Calculate response rate
    const completionRate = responseRateTotals.total > 0 
      ? (responseRateTotals.completed / responseRateTotals.total) * 100 
      : 0;
    
    return {
      metrics: finalMetrics,
      responseRate: {
        ...responseRateTotals,
        completionRate
      },
      areasCount: {
        total: allAreas.length,
        withData: areasData.length
      }
    };
  }
  
  /**
   * Format the raw metric field name into a human-readable name
   * @param {string} field - Raw field name from database
   * @returns {string} Formatted metric name
   */
  _formatMetricName(field) {
    const nameMap = {
      'career_growth': 'Career Growth',
      'training': 'Training',
      'support': 'Support',
      'pay_accuracy': 'Pay Accuracy',
      'company_endorsement': 'Company Endorsement',
      'opportunity': 'Opportunity',
      'energy': 'Energy',
      'development': 'Development',
      'financial_goals': 'Financial Goals',
      'personal_performance': 'Personal Performance',
      'team_culture': 'Team Culture'
    };
    
    return nameMap[field] || field;
  }

  /**
   * Get color code for NPS value
   * @param {number} score - NPS score
   * @returns {string} Color hex code
   */
  _getNPSColor(score) {
    if (score >= 30) return '#93c47d'; // Green
    if (score >= 0) return '#ffd966';  // Yellow
    return '#e06666'; // Red
  }

  /**
   * Get status label for NPS value
   * @param {number} score - NPS score
   * @returns {string} Status label
   */
  _getNPSStatus(score) {
    if (score >= 30) return 'Strong';
    if (score >= 0) return 'Moderate';
    return 'Needs Attention';
  }

  /**
   * Get response rates for all areas in a region
   * @param {string} regionName - The name of the region
   * @param {string} monthDate - The month to fetch data for (YYYY-MM-DD)
   * @param {string} roleType - The role type to filter by (defaults to 'All')
   * @returns {Promise<Object>} Object containing response rates for all areas in the region
   */
  async getRegionResponseRates(regionName, monthDate, roleType = 'All') {
    try {
      console.log('Fetching region response rates for:', { regionName, monthDate, roleType });
      
      // First get the most recent available month if none provided
      if (!monthDate) {
        monthDate = await this.getMostRecentMonth();
        console.log('Using most recent month:', monthDate);
      }

      // Get all areas in the region
      const areas = await this.getAreasInRegion(regionName);
      
      if (!areas.length) {
        throw new Error(`No areas found for region: ${regionName}`);
      }
      
      // Fetch data for all areas in the region
      const { data, error } = await supabase
        .from('area_monthly_summary')
        .select('area_name, month_date, total_headcount, total_responses')
        .in('area_name', areas)
        .eq('month_date', monthDate);

      if (error) throw error;
      
      if (!data?.length) {
        console.log('No data found for month, trying most recent month...');
        const mostRecentMonth = await this.getMostRecentMonth();
        
        const { data: latestData, error: latestError } = await supabase
          .from('area_monthly_summary')
          .select('area_name, month_date, total_headcount, total_responses')
          .in('area_name', areas)
          .eq('month_date', mostRecentMonth);
          
        if (latestError) throw latestError;
        if (!latestData?.length) {
          throw new Error(`No response rate data available for areas in region: ${regionName}`);
        }
        
        data = latestData;
      }
      
      // Process response rates for each area
      const prefix = roleType.toLowerCase() === 'all' ? '' : `${roleType.toLowerCase()}_`;
      const responseRates = {};
      
      data.forEach(area => {
        const total = roleType.toLowerCase() === 'all' 
          ? Number(area.total_headcount) || 0
          : Number(area[`${prefix}headcount`]) || 0;
          
        const completed = roleType.toLowerCase() === 'all'
          ? Number(area.total_responses) || 0
          : Number(area[`${prefix}responses`]) || 0;
          
        const completionRate = total > 0 ? (completed / total) * 100 : 0;
        
        responseRates[area.area_name] = {
          total,
          completed,
          completionRate
        };
      });
      
      return responseRates;
    } catch (error) {
      console.error('Error fetching region response rates:', error);
      throw error;
    }
  }

  /**
   * Get most recent available month from the database
   * @returns {Promise<string>} Most recent month date
   */
  async getMostRecentMonth() {
    try {
      const { data, error } = await supabase
        .from('area_monthly_summary')
        .select('month_date')
        .order('month_date', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!data?.length) throw new Error('No months available');
      
      return data[0].month_date;
    } catch (error) {
      console.error('Error fetching most recent month:', error);
      throw error;
    }
  }

  /**
   * Get all available months for filtering
   * @returns {Promise<Array>} Array of available month dates
   */
  async getAvailableMonths() {
    try {
      const { data, error } = await supabase
        .from('area_monthly_summary')
        .select('month_date')
        .order('month_date', { ascending: false });

      if (error) throw error;
      return [...new Set(data.map(d => d.month_date))];
    } catch (error) {
      console.error('Error fetching available months:', error);
      throw error;
    }
  }
}

module.exports = new RegionalDashboardService(); 