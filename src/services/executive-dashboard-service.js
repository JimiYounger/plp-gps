// src/services/execuitive-dashboard-service.js

const { supabase } = require('../config/supabase');

class ExecutiveDashboardService {
  async getOrgMetrics(monthDate, roleType = 'All') {
    try {
      console.log('Fetching org metrics for:', { monthDate, roleType });
      
      // First try with requested month
      let { data, error } = await supabase
        .from('org_monthly_summary')
        .select('*')
        .eq('month_date', monthDate);

      // If no data found, get most recent month
      if (!data?.length) {
        console.log('No org data found for requested month, fetching most recent...');
        const mostRecentMonth = await this.getMostRecentMonth();
        console.log('Most recent month:', mostRecentMonth);
        
        ({ data, error } = await supabase
          .from('org_monthly_summary')
          .select('*')
          .eq('month_date', mostRecentMonth)
          .limit(1));
      }

      if (error) throw error;
      if (!data?.length) {
        throw new Error('No data available in org_monthly_summary');
      }

      // Use transformAreaMetrics for organization data since the structure is the same
      return this.transformAreaMetrics(data[0], roleType.toLowerCase());
    } catch (error) {
      console.error('Error fetching org metrics:', error);
      throw error;
    }
  }

  async getAreaMetrics(monthDate, roleType = 'All') {
    try {
      console.log('Fetching area metrics for:', { monthDate, roleType });
      
      // First get the most recent available month
      const mostRecentMonth = await this.getMostRecentMonth();
      console.log('Most recent month available:', mostRecentMonth);

      // Fetch data for either requested month or most recent month
      const targetMonth = monthDate || mostRecentMonth;
      console.log('Using target month:', targetMonth);

      let { data, error } = await supabase
        .from('area_monthly_summary')
        .select('*')
        .eq('month_date', targetMonth);

      console.log('Query result:', {
        hasData: !!data?.length,
        recordCount: data?.length,
        error: error?.message
      });

      if (error) throw error;
      if (!data?.length) {
        console.log('No data found for target month, trying most recent month...');
        ({ data, error } = await supabase
          .from('area_monthly_summary')
          .select('*')
          .eq('month_date', mostRecentMonth));
          
        if (error) throw error;
        if (!data?.length) {
          throw new Error('No data available in area_monthly_summary');
        }
      }

      // Transform the data for each area
      const transformedData = {};
      data.forEach(area => {
        if (area.area_name) {
          transformedData[area.area_name] = this.transformAreaMetrics(area, roleType.toLowerCase());
        }
      });

      console.log('Transformed data for areas:', Object.keys(transformedData));
      
      // Log the first area's metrics as an example
      const firstArea = Object.keys(transformedData)[0];
      if (firstArea) {
        console.log('Example metrics for', firstArea, ':', 
          JSON.stringify(transformedData[firstArea].metrics, null, 2));
      }
      return transformedData;
    } catch (error) {
      console.error('Error fetching area metrics:', error);
      throw error;
    }
  }

  transformAreaMetrics(data, rolePrefix = '') {
    const prefix = rolePrefix === 'all' ? '' : `${rolePrefix}_`;
    
    return {
      metrics: {
        'Career Growth': this._getMetricData(data, 'career_growth', prefix),
        'Training': this._getMetricData(data, 'training', prefix),
        'Support': this._getMetricData(data, 'support', prefix),
        'Pay Accuracy': this._getMetricData(data, 'pay_accuracy', prefix),
        'Company Endorsement': this._getMetricData(data, 'company_endorsement', prefix),
        'Opportunity': this._getMetricData(data, 'opportunity', prefix),
        'Energy': this._getMetricData(data, 'energy', prefix),
        'Development': this._getMetricData(data, 'development', prefix),
        'Financial Goals': this._getMetricData(data, 'financial_goals', prefix),
        'Personal Performance': this._getMetricData(data, 'personal_performance', prefix),
        'Team Culture': this._getMetricData(data, 'team_culture', prefix)
      },
      responseRate: {
        total: rolePrefix === 'all' ? data.total_headcount : data[`${prefix}headcount`],
        completed: rolePrefix === 'all' ? data.total_responses : data[`${prefix}responses`],
        completionRate: rolePrefix === 'all'
          ? (data.total_responses / data.total_headcount * 100)
          : (data[`${prefix}responses`] / data[`${prefix}headcount`] * 100)
      }
    };
  }

  _getMetricData(data, metric, prefix = '') {
    const nps = Number(data[`${prefix}${metric}_nps`]) || 0;
    return {
      nps,
      avg: Number(data[`${prefix}${metric}_avg`]) || 0,
      promoters: Number(data[`${prefix}${metric}_promoters`]) || 0,
      passives: Number(data[`${prefix}${metric}_passives`]) || 0,
      detractors: Number(data[`${prefix}${metric}_detractors`]) || 0,
      responses: Number(data[`${prefix}${metric}_promoters`]) + 
                Number(data[`${prefix}${metric}_passives`]) + 
                Number(data[`${prefix}${metric}_detractors`]) || 0,
      color: this._getNPSColor(nps),
      status: this._getNPSStatus(nps)
    };
  }

  _getNPSColor(score) {
    if (score >= 30) return '#93c47d'; // Green
    if (score >= 0) return '#ffd966';  // Yellow
    return '#e06666'; // Red
  }

  _getNPSStatus(score) {
    if (score >= 30) return 'Strong';
    if (score >= 0) return 'Moderate';
    return 'Needs Attention';
  }

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

module.exports = new ExecutiveDashboardService();