const { supabase } = require('../config/supabase');

class AreaDashboardService {
  /**
   * Format summary content into properly structured HTML
   */
  _formatSummaryContent(summaryText) {
    // Convert markdown-style bold (**text**) to HTML <strong> tags
    let formattedText = summaryText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Split into sections based on double newlines while preserving original formatting
    const sections = formattedText.split(/\n\n+/);
    
    let formattedHtml = '<div class="summary-content">';
    let isBigPictureContent = false;
    
    sections.forEach(section => {
      const sectionText = section.trim();
      if (!sectionText) return;

      // Special handling for The Big Picture and its content
      if (sectionText === 'The Big Picture') {
        formattedHtml += `<h3 class="fw-bold mb-4">The Big Picture</h3><div class="mb-4"></div>`;
        isBigPictureContent = true;
        return;
      }
      
      // Handle Big Picture content
      if (isBigPictureContent && sectionText.startsWith('With a')) {
        formattedHtml += `<p class="mb-4">${sectionText}</p>`;
        isBigPictureContent = false;
        return;
      }

      // Handle section headers
      if (/^(Team Recognition|Key Findings|Recurring Themes|Sentiment Analysis|Potential Correlations|Actionable Items)$/.test(sectionText)) {
        formattedHtml += `<h4 class="mb-3">${sectionText}</h4><div class="mb-3"></div>`;
        return;
      }

      // Check if this is a name under Team Recognition
      if (/^[A-Za-z\s]+$/.test(sectionText) && sectionText.split(' ').length <= 3) {
        formattedHtml += `<h5 class="mb-2">${sectionText}</h5>`;
        return;
      }

      // Handle bullet points
      if (section.includes('\n- ')) {
        const lines = section.split('\n');
        const firstLine = lines[0].trim();
        
        // Add any text before bullets as a paragraph
        if (!firstLine.startsWith('- ') && firstLine) {
          formattedHtml += `<p class="mb-3">${firstLine}</p>`;
        }
        
        // Add bullet points
        formattedHtml += '<ul class="list-unstyled ps-4 mb-4">';
        lines.forEach(line => {
          if (line.trim().startsWith('- ')) {
            const bulletContent = line.trim().substring(2);
            formattedHtml += `<li class="mb-2">${bulletContent}</li>`;
          }
        });
        formattedHtml += '</ul>';
      } else {
        // Regular paragraph with increased bottom margin
        formattedHtml += `<p class="mb-4">${sectionText}</p>`;
      }
    });
    
    formattedHtml += '</div>';
    return formattedHtml;
  }
  
  /**
   * Get area metrics with letter grades, falling back to most recent data if needed
   * @param {string} areaName - The name of the area to fetch metrics for
   * @param {string} monthDate - The target month to fetch data for (YYYY-MM-DD)
   * @param {string} roleType - The role type to filter by (defaults to 'All')
   * @returns {Object} Object containing metrics and response rate data
   */
  async getAreaMetrics(areaName, monthDate, roleType = 'All') {
    try {
      console.log('\n=== Starting Metric Fetch ===');
      console.log('Search Parameters:', { areaName, monthDate, roleType });
      
      // Convert the input date to ISO format for consistency
      const formattedDate = new Date(monthDate).toISOString().split('T')[0];
      
      // First attempt to fetch data for the requested month
      let { data, error } = await supabase
        .from('area_monthly_summary')
        .select('*')
        .ilike('area_name', areaName)
        .eq('month_date', formattedDate)
        .limit(1);

      // If no data found for the requested month, fetch the most recent available month
      if (!data || data.length === 0) {
        console.log(`No data found for ${formattedDate}, fetching most recent month`);
        const { data: mostRecentData, error: mostRecentError } = await supabase
          .from('area_monthly_summary')
          .select('*')
          .ilike('area_name', areaName)
          .order('month_date', { ascending: false })
          .limit(1);
          
        if (mostRecentError) throw mostRecentError;
        if (!mostRecentData || mostRecentData.length === 0) {
          throw new Error(`No data found for ${areaName}`);
        }
        
        data = mostRecentData;
        monthDate = mostRecentData[0].month_date;
      }

      if (error) throw error;
      
      const areaData = data[0];
      
      // Log the complete record for debugging
      console.log('\nComplete Record:', JSON.stringify(areaData, null, 2));

      // Determine prefix based on role type
      const prefix = roleType.toLowerCase() === 'all' ? '' : `${roleType.toLowerCase()}_`;
      console.log('\nUsing prefix:', prefix);

      // Instead of subtracting exactly one month, fetch the latest row older than the current month
      let previousRecord = null;
      if (roleType !== 'All') {
        const { data: prevData, error: prevError } = await supabase
          .from('area_monthly_summary')
          .select('*')
          .ilike('area_name', areaName)
          .lt('month_date', formattedDate)       // <--- older than the current month
          .order('month_date', { ascending: false })
          .limit(1);

        if (!prevError && prevData && prevData.length > 0) {
          previousRecord = prevData[0];
        }
      }

      // Transform the raw data into structured metrics
      const metrics = {
        'Career Growth': this._transformMetric(areaData, 'career_growth', prefix, previousRecord),
        'Training': this._transformMetric(areaData, 'training', prefix, previousRecord),
        'Support': this._transformMetric(areaData, 'support', prefix, previousRecord),
        'Compensation Knowledge': this._transformMetric(areaData, 'pay_accuracy', prefix, previousRecord),
        'Company Endorsement': this._transformMetric(areaData, 'company_endorsement', prefix, previousRecord),
        'Opportunity': this._transformMetric(areaData, 'opportunity', prefix, previousRecord),
        'Energy': this._transformMetric(areaData, 'energy', prefix, previousRecord),
        'Development': this._transformMetric(areaData, 'development', prefix, previousRecord),
        'Financial Goals': this._transformMetric(areaData, 'financial_goals', prefix, previousRecord),
        'Personal Performance': this._transformMetric(areaData, 'personal_performance', prefix, previousRecord),
        'Team Culture': this._transformMetric(areaData, 'team_culture', prefix, previousRecord)
      };

      // Calculate response rate statistics
      const responseData = roleType === 'All' ? {
        total: areaData.total_headcount,
        completed: areaData.total_responses
      } : {
        total: areaData[`${prefix}headcount`],
        completed: areaData[`${prefix}responses`]
      };

      return {
        metrics,
        responseRate: {
          ...responseData,
          completionRate: (responseData.completed / responseData.total) * 100
        },
        monthDate  // Include the actual month date used
      };
    } catch (error) {
      console.error('Error fetching area metrics:', error);
      throw error;
    }
  }

  /**
   * Transform metrics data into graded format.
   * Now accepts an optional previousData parameter for comparison.
   */
  _transformMetric(data, metricBase, prefix = '', previousData = null) {
    const fieldNames = {
      nps: `${prefix}${metricBase}_nps`,
      avg: `${prefix}${metricBase}_avg`,
      promoters: `${prefix}${metricBase}_promoters`,
      passives: `${prefix}${metricBase}_passives`,
      detractors: `${prefix}${metricBase}_detractors`
    };

    console.log('\nLooking for fields:', fieldNames);
    console.log('Found values:', {
      nps: data[fieldNames.nps],
      avg: data[fieldNames.avg],
      promoters: data[fieldNames.promoters],
      passives: data[fieldNames.passives],
      detractors: data[fieldNames.detractors]
    });

    const nps = Number(data[fieldNames.nps]) || 0;
    const avg = Number(data[fieldNames.avg]) || 0;
    const promoters = Number(data[fieldNames.promoters]) || 0;
    const passives = Number(data[fieldNames.passives]) || 0;
    const detractors = Number(data[fieldNames.detractors]) || 0;
    const responses = promoters + passives + detractors;
    const currentGradeInfo = this._getGradeInfo(nps);
    
    // If previousData is provided, compute previous grade info
    let prevGrade = null;
    let changeIndicator = null;
    if (previousData) {
      const prevNps = Number(previousData[`${prefix}${metricBase}_nps`]) || 0;
      const prevGradeInfo = this._getGradeInfo(prevNps);
      prevGrade = prevGradeInfo.grade;
      const currentRank = this._gradeRank(currentGradeInfo.grade);
      const prevRank = this._gradeRank(prevGrade);
      if (currentRank > prevRank) {
        changeIndicator = 'up';
      } else if (currentRank < prevRank) {
        changeIndicator = 'down';
      } else {
        changeIndicator = 'same';
      }
    }
    
    return {
      nps,
      avg,
      promoters,
      passives,
      detractors,
      responses,
      ...currentGradeInfo,
      prevGrade,
      changeIndicator
    };
  }

  /**
   * Convert NPS score to letter grade and associated metadata.
   */
  _getGradeInfo(nps) {
    if (nps >= 90) return { 
      grade: 'A+', 
      color: '#28a745', 
      status: 'Exceptional',
      message: 'Outstanding performance - maintain these excellent practices'
    };
    if (nps >= 70) return { 
      grade: 'A', 
      color: '#34c759', 
      status: 'Strong',
      message: 'Great results - keep up the good work'
    };
    if (nps >= 50) return { 
      grade: 'B+', 
      color: '#5cc969', 
      status: 'Very Good',
      message: 'Solid performance with room for excellence'
    };
    if (nps >= 30) return { 
      grade: 'B', 
      color: '#87cf8f', 
      status: 'Good',
      message: 'Good foundation - focus on specific improvements'
    };
    if (nps >= 10) return { 
      grade: 'C+', 
      color: '#ffd60a', 
      status: 'Fair',
      message: 'Some concerns need addressing'
    };
    if (nps >= -9) return { 
      grade: 'C', 
      color: '#ffc107', 
      status: 'Needs Improvement',
      message: 'Several areas require attention'
    };
    if (nps >= -29) return { 
      grade: 'D', 
      color: '#ff9800', 
      status: 'Needs Attention',
      message: 'Immediate attention needed'
    };
    return { 
      grade: 'D', 
      color: '#ff9800', 
      status: 'Needs Attention',
      message: 'Immediate attention needed'
    };
  }

  /**
   * Assign numeric ranks to letter grades for comparison.
   */
  _gradeRank(grade) {
    const rankMap = {
      'A+': 7,
      'A': 6,
      'B+': 5,
      'B': 4,
      'C+': 3,
      'C': 2,
      'D': 1
    };
    return rankMap[grade] || 0;
  }

  /**
   * Get available months for filtering
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

  /**
   * Get AI summary for the area
   */
  async getAreaSummary(areaName, monthDate, roleType = 'All') {
    try {
      console.log('\n=== Fetching Summary ===');
      console.log('Looking for summary with:', { areaName, monthDate, roleType });

      // Ensure consistent date format
      const formattedDate = new Date(monthDate).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('survey_ai_summaries')
        .select('summary_content')
        .eq('month_date', formattedDate)
        .ilike('area_name', areaName)
        .eq('role_type', roleType)
        .limit(1);

      console.log('Summary query result:', { data, error });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        console.log('No summary found');
        return null;
      }

      // Format the summary content before returning
      return this._formatSummaryContent(data[0].summary_content);
    } catch (error) {
      console.error('Error fetching area summary:', error);
      return null;  // Return null instead of throwing to handle gracefully
    }
  }

  /**
   * Get feedback responses for a specific field
   */
  async getFeedbackResponses(areaName, monthDate, roleType = 'All', fieldName) {
    try {
      console.log('\n=== Fetching Feedback Responses ===');
      console.log('Parameters:', { areaName, monthDate, roleType, fieldName });
      
      const formattedDate = new Date(monthDate).toISOString().split('T')[0];
      
      // Base query
      let query = supabase
        .from('monthly_feedback_responses')
        .select('anonymous_responses, role_type, area_name')
        .eq('month_date', formattedDate)
        .ilike('area_name', areaName);

      // Set the correct field_name based on type
      switch (fieldName) {
        case 'general':
          query = query.eq('field_name', 'general_feedback');
          break;
        case 'roadblocks':
          query = query.eq('field_name', 'roadblocks');
          break;
        case 'leadership_support':
          query = query.eq('field_name', 'leadership_support');
          break;
      }

      // Handle role type filter
      if (roleType !== 'All') {
        query = query.eq('role_type', roleType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Query error:', error);
        throw error;
      }

      console.log('Raw response data:', data);

      // Process responses
      const processedResponses = [];
      data.forEach(row => {
        if (Array.isArray(row.anonymous_responses)) {
          row.anonymous_responses.forEach(response => {
            const noVariations = ['no', 'nah', 'na', 'n/a', '-', 'none', 'no.', 'nope'];
            const trimmedResponse = response.toString().toLowerCase().trim();
            if (!noVariations.includes(trimmedResponse)) {
              processedResponses.push({
                response,
                role_type: row.role_type,
                area_name: row.area_name
              });
            }
          });
        }
      });

      console.log('Processed responses:', processedResponses);
      return processedResponses;

    } catch (error) {
      console.error('Error fetching feedback responses:', error);
      return [];
    }
  }
}

module.exports = new AreaDashboardService();
