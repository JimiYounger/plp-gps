// src/services/surveyMetricsService.js

/**
 * Service for handling employee survey metrics and NPS calculations.
 * Provides both real-time calculations and cached summary data management.
 */

const base = require('../config/airtable');

/**
 * Constants for NPS score ranges and their visual representation.
 * Each category defines the score range and associated display properties.
 */
const NPS_CATEGORIES = {
  DETRACTOR: { min: 0, max: 6, color: '#ff4d4d' },  // Red for scores 0-6
  PASSIVE: { min: 7, max: 8, color: '#ffd966' },    // Yellow for scores 7-8
  PROMOTER: { min: 9, max: 10, color: '#93c47d' }   // Green for scores 9-10
};

/**
 * List of survey questions measured using NPS methodology.
 * Each question helps evaluate different aspects of employee satisfaction.
 */
const NPS_QUESTIONS = [
  'Career Growth',         // Career progression and compensation
  'Training',             // Training quality and availability
  'Support',              // Management and peer support
  'Pay Accuracy',         // Paycheck accuracy
  'Company Endorsement',  // Likelihood to recommend workplace
  'Opportunity',          // Career growth opportunities
  'Energy',               // Work environment and culture
  'Development',          // Professional development
  'Financial Goals',      // Financial performance understanding
  'Personal Performance'  // Individual performance feedback
];

/**
 * Feedback field definitions with their context and analysis guidance
 */
const FEEDBACK_FIELDS = {
  'Feedback': {
    question: "Is there anything else you would like your leadership to know?",
    purpose: "Capture general sentiments and experiences that might not be covered by specific metrics",
    analysis_hints: ["Look for common themes", "Identify urgent concerns", "Note positive experiences"]
  },
  'Energy Feedback': {
    question: "How is your energy level at the beginning and end of the day?",
    purpose: "Assess work-life balance and potential burnout risks",
    analysis_hints: ["Compare start vs end of day", "Look for patterns in energy fluctuation", "Identify energy drains"]
  },
  'Development Feedback': {
    question: "What's one thing you are going to do next month to improve on your personal & professional development?",
    purpose: "Track growth opportunities and career progression",
    analysis_hints: ["Identify training needs", "Note mentorship requests", "Track skill development"]
  },
  'Financial Goals Feedback': {
    question: "What's one thing you are going to do next month to make progress towards your financial goals?",
    purpose: "Monitor financial satisfaction and compensation adequacy",
    analysis_hints: ["Look for compensation concerns", "Track financial goal progress", "Identify resource needs"]
  },
  'Personal Performance Feedback': {
    question: "What is one thing you are going to do next month to improve professionally?",
    purpose: "Self-assessment of work quality and productivity",
    analysis_hints: ["Compare with metrics", "Identify support needs", "Note achievements"]
  },
  'Roadblocks': {
    question: "Is there anything keeping you from hitting your goals today?",
    purpose: "Identify obstacles preventing optimal performance",
    analysis_hints: ["Group by type (process/technical/resource)", "Track recurring issues", "Note urgency"]
  },
  'Leadership Support': {
    question: "How can leadership better support you?",
    purpose: "Gather specific feedback on leadership effectiveness",
    analysis_hints: ["Categorize support types needed", "Track recurring requests", "Note immediate needs"]
  },
  'Recognition': {
    question: "is there anyone else you would like to recognize this month?",
    purpose: "Assess effectiveness of recognition programs",
    analysis_hints: ["Note recognition preferences", "Track satisfaction levels", "Identify improvement areas"]
  }
};

class SurveyMetricsService {
  // Existing calculation methods remain unchanged
  calculateNPSScore(responses) {
    if (!responses || responses.length === 0) return 0;
    
    const total = responses.length;
    const promoters = responses.filter(score => score >= 9).length;
    const detractors = responses.filter(score => score <= 6).length;
    
    return Math.round(((promoters - detractors) / total) * 100);
  }

  getNPSColor(npsScore) {
    if (npsScore >= 30) return NPS_CATEGORIES.PROMOTER.color;
    if (npsScore >= 0) return NPS_CATEGORIES.PASSIVE.color;
    return NPS_CATEGORIES.DETRACTOR.color;
  }

  getNPSStatus(npsScore) {
    if (npsScore >= 30) return 'Strong';
    if (npsScore >= 0) return 'Moderate';
    return 'Needs Attention';
  }

  calculateAverageScore(responses) {
    if (!responses || responses.length === 0) return 0;
    const sum = responses.reduce((acc, score) => acc + score, 0);
    return Number((sum / responses.length).toFixed(1));
  }

  /**
   * Formats a Date object into YYYY-MM format for consistent querying
   * @param {Date} date - The date to format
   * @returns {string} Formatted date string
   */
  formatMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Retrieves metrics from the GPS Summary table for a specific month
   * Falls back to real-time calculation if summary doesn't exist
   * @param {Date} targetMonth - The month to get metrics for
   * @returns {Promise<Object>} The metrics data
   */
  async getOverallMetrics(targetMonth = new Date()) {
  try {
    const monthKey = this.formatMonthKey(targetMonth);
    
    // First, try to get data from summary table
    const summary = await this.getMonthlySummary(monthKey);
    
    if (summary) {
      console.log('Using cached summary data for:', monthKey);
      // Transform summary data into the expected format
      const metrics = {};
      
      NPS_QUESTIONS.forEach(question => {
        const npsScore = summary.get(`${question} NPS`);
        metrics[question] = {
          score: npsScore,
          color: this.getNPSColor(npsScore),
          status: this.getNPSStatus(npsScore),
          responses: summary.get(`${question} Responses`),
          averageScore: summary.get(`${question} Avg`)
        };
      });
      
      return metrics;
    }

    // If no summary exists, calculate in real-time
    console.log('Calculating real-time metrics for:', monthKey);
    
    const records = await base('GPS').select({
      fields: ['Area', ...NPS_QUESTIONS],
      filterByFormula: `AND(
        IS_AFTER({Submit Date}, '${targetMonth.toISOString()}'),
        IS_BEFORE({Submit Date}, '${new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).toISOString()}')
      )`
    }).all();

    const metrics = {};
    NPS_QUESTIONS.forEach(question => {
      const responses = records
        .map(record => record.get(question))
        .filter(score => score !== undefined && score !== null);
      
      const npsScore = this.calculateNPSScore(responses);
      
      metrics[question] = {
        score: npsScore,
        color: this.getNPSColor(npsScore),
        status: this.getNPSStatus(npsScore),
        responses: responses.length,
        averageScore: this.calculateAverageScore(responses)
      };
    });

    // Generate summary in the background for future requests
    this.generateMonthlySummary(targetMonth).catch(error => {
      console.error('Background summary generation failed:', error);
    });

    return metrics;
  } catch (error) {
    console.error('Error fetching overall metrics:', error);
    throw error;
  }
}

  /**
   * Retrieves area metrics from the Area Summary table for a specific month
   * Falls back to real-time calculation if summary doesn't exist
   * @param {Date} targetMonth - The month to get metrics for
   * @returns {Promise<Object>} Metrics for each area
   */
  async getAreaMetrics(targetMonth = new Date()) {
    try {
      const monthKey = this.formatMonthKey(targetMonth);
      
      // Try to get cached area summaries first
      const areaSummaries = await base('Area Summary').select({
        filterByFormula: `SEARCH('${monthKey}', {Month Summary})`
      }).all();

      if (areaSummaries.length > 0) {
        const areaMetrics = {};
        
        areaSummaries.forEach(summary => {
          const area = summary.get('Area');
          areaMetrics[area] = {};
          
          NPS_QUESTIONS.forEach(question => {
            areaMetrics[area][question] = {
              score: summary.get(`${question} NPS`),
              color: this.getNPSColor(summary.get(`${question} NPS`)),
              status: this.getNPSStatus(summary.get(`${question} NPS`)),
              responses: summary.get(`${question} Responses`),
              averageScore: summary.get(`${question} Avg`)
            };
          });
        });
        
        return areaMetrics;
      }

      // Fall back to real-time calculation
      return this.calculateAreaMetrics();
    } catch (error) {
      console.error('Error fetching area metrics:', error);
      throw error;
    }
  }

  /**
   * Calculates area metrics in real-time from GPS submissions
   * @returns {Promise<Object>} The calculated metrics
   */
  async calculateAreaMetrics() {
    try {
      const records = await base('GPS').select({
        fields: ['Area', ...NPS_QUESTIONS]
      }).all();

      const areaGroups = {};
      records.forEach(record => {
        const area = record.get('Area');
        if (!area) return;
        
        if (!areaGroups[area]) {
          areaGroups[area] = {};
          NPS_QUESTIONS.forEach(question => {
            areaGroups[area][question] = [];
          });
        }
        
        NPS_QUESTIONS.forEach(question => {
          const score = record.get(question);
          if (score !== undefined && score !== null) {
            areaGroups[area][question].push(score);
          }
        });
      });

      const areaMetrics = {};
      Object.entries(areaGroups).forEach(([area, questions]) => {
        areaMetrics[area] = {};
        
        NPS_QUESTIONS.forEach(question => {
          const responses = questions[question];
          const npsScore = this.calculateNPSScore(responses);
          const averageScore = this.calculateAverageScore(responses);
          
          areaMetrics[area][question] = {
            score: npsScore,
            color: this.getNPSColor(npsScore),
            status: this.getNPSStatus(npsScore),
            responses: responses.length,
            averageScore: averageScore
          };
        });
      });

      return areaMetrics;
    } catch (error) {
      console.error('Error calculating area metrics:', error);
      throw error;
    }
  }

  /**
   * Retrieves a monthly summary from the GPS Summary table
   * @param {string} monthKey - Month in YYYY-MM format
   * @returns {Promise<Object|null>} The summary record or null if not found
   */
  async getMonthlySummary(monthKey) {
    try {
      const records = await base('GPS Summary').select({
        filterByFormula: `{Month} = '${monthKey}'`
      }).firstPage();
      
      return records.length > 0 ? records[0] : null;
    } catch (error) {
      console.error('Error fetching monthly summary:', error);
      throw error;
    }
  }

  /**
   * Generates or updates the monthly summary and area breakdowns
   * @param {Date} targetMonth - The month to summarize
   * @returns {Promise<Object>} The created or updated summary
   */
  // In surveyMetricsService.js

processFeedbackResponses(submissions) {
  try {
    // Create a more compact feedback structure
    const feedbackStructure = {
      metadata: {
        response_count: submissions.length,
        month: submissions[0]?.get('Submit Date') ? new Date(submissions[0].get('Submit Date')).toISOString().slice(0, 7) : null
      },
      summaries: {}
    };

    // Process each feedback field
    Object.entries(FEEDBACK_FIELDS).forEach(([fieldName, context]) => {
      const responses = submissions
        .filter(record => record.get(fieldName))
        .map(record => ({
          text: record.get(fieldName).slice(0, 500), // Limit text length
          area: record.get('Area'),
          // Only include date without time to reduce data size
          date: record.get('Submit Date') ? record.get('Submit Date').slice(0, 10) : null
        }));

      if (responses.length > 0) {
        feedbackStructure.summaries[fieldName] = {
          count: responses.length,
          areas: [...new Set(responses.map(r => r.area))],
          responses: responses.slice(0, 50) // Limit number of responses stored
        };
      }
    });

    // Convert to string and check size
    const feedbackString = JSON.stringify(feedbackStructure);
    if (feedbackString.length > 100000) { // Airtable's limit is around 100KB
      console.warn('Feedback data exceeds recommended size, truncating...');
      // Create a truncated version
      return JSON.stringify({
        metadata: feedbackStructure.metadata,
        warning: 'Data truncated due to size limitations',
        summaries: Object.fromEntries(
          Object.entries(feedbackStructure.summaries).map(([key, value]) => [
            key,
            {
              count: value.count,
              areas: value.areas,
              responses: value.responses.slice(0, 25) // Further limit responses if needed
            }
          ])
        )
      });
    }

    return feedbackString;
  } catch (error) {
    console.error('Error processing feedback:', error);
    return JSON.stringify({
      error: 'Error processing feedback',
      metadata: {
        response_count: submissions.length,
        error_message: error.message
      }
    });
  }
}

// Update the processAreaFeedback method similarly
processAreaFeedback(submissions) {
  try {
    if (!submissions.length) return null;

    const feedbackStructure = {
      metadata: {
        area: submissions[0].get('Area'),
        response_count: submissions.length,
        month: submissions[0]?.get('Submit Date') ? new Date(submissions[0].get('Submit Date')).toISOString().slice(0, 7) : null
      },
      summaries: {}
    };

    Object.entries(FEEDBACK_FIELDS).forEach(([fieldName]) => {
      const responses = submissions
        .filter(record => record.get(fieldName))
        .map(record => ({
          text: record.get(fieldName).slice(0, 500),
          date: record.get('Submit Date') ? record.get('Submit Date').slice(0, 10) : null
        }))
        .slice(0, 25); // Limit number of responses

      if (responses.length > 0) {
        feedbackStructure.summaries[fieldName] = {
          count: responses.length,
          responses: responses
        };
      }
    });

    const feedbackString = JSON.stringify(feedbackStructure);
    if (feedbackString.length > 100000) {
      console.warn('Area feedback data exceeds recommended size, truncating...');
      return JSON.stringify({
        metadata: feedbackStructure.metadata,
        warning: 'Data truncated due to size limitations',
        summaries: Object.fromEntries(
          Object.entries(feedbackStructure.summaries).map(([key, value]) => [
            key,
            {
              count: value.count,
              responses: value.responses.slice(0, 15)
            }
          ])
        )
      });
    }

    return feedbackString;
  } catch (error) {
    console.error('Error processing area feedback:', error);
    return JSON.stringify({
      error: 'Error processing area feedback',
      metadata: {
        area: submissions[0]?.get('Area'),
        response_count: submissions.length,
        error_message: error.message
      }
    });
  }
}

  // Modify generateMonthlySummary to include feedback processing
  async generateMonthlySummary(targetMonth) {
    try {
      const monthKey = this.formatMonthKey(targetMonth);
      
      // Get all GPS submissions for the target month
      const startDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      const endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
      
      const submissions = await base('GPS').select({
        filterByFormula: `AND(
          IS_AFTER({Submit Date}, '${startDate.toISOString()}'),
          IS_BEFORE({Submit Date}, '${endDate.toISOString()}')
        )`
      }).all();

      // Calculate metrics
      const metrics = {};
      NPS_QUESTIONS.forEach(question => {
        const responses = submissions
          .map(record => record.get(question))
          .filter(score => score !== undefined && score !== null);
          
        metrics[question] = {
          nps: this.calculateNPSScore(responses),
          responses: responses.length,
          average: this.calculateAverageScore(responses)
        };
      });

      // Process feedback data
      const feedbackData = this.processFeedbackResponses(submissions);

      // Create or update the summary record
      const existingSummary = await this.getMonthlySummary(monthKey);
      const summaryFields = {
        Month: monthKey,
        'Summary Status': 'Draft',
        'Last Updated': new Date().toISOString(),
        'Feedback Data': JSON.stringify(feedbackData, null, 2),
        ...Object.entries(metrics).reduce((acc, [metric, values]) => ({
          ...acc,
          [`${metric} NPS`]: values.nps,
          [`${metric} Responses`]: values.responses,
          [`${metric} Avg`]: values.average
        }), {})
      };

      let summaryRecord;
      if (existingSummary) {
        summaryRecord = await base('GPS Summary').update(existingSummary.id, summaryFields);
      } else {
        summaryRecord = await base('GPS Summary').create(summaryFields);
      }

      // Generate area summaries
      await this.generateAreaSummaries(submissions, monthKey, summaryRecord.id);

      return summaryRecord;
    } catch (error) {
      console.error('Error generating monthly summary:', error);
      throw error;
    }
  }

 /**
 * Fetches and calculates team member statistics for a specific area
 * @param {string} area - The area to calculate stats for
 * @returns {Promise<Object>} Object containing team member counts
 */
async calculateTeamMemberStats(area) {
  try {
    // Query Team Members table for active members in this area
    const teamMembers = await base('Team Members').select({
      filterByFormula: `AND(
        {Area} = '${area}',
        NOT({Role} = 'TERM')
      )`
    }).all();

    // Calculate totals
    const totalTeamMembers = teamMembers.length;
    const totalSetters = teamMembers.filter(member => member.get('Role Type') === 'Setter').length;
    const totalClosers = teamMembers.filter(member => member.get('Role Type') === 'Closer').length;
    const totalManagers = teamMembers.filter(member => member.get('Role Type') === 'Manager').length;

    return {
      totalTeamMembers,
      totalSetters,
      totalClosers,
      totalManagers
    };
  } catch (error) {
    console.error(`Error calculating team member stats for ${area}:`, error);
    throw error;
  }
}

/**
 * Calculates role-based completion statistics for an area
 * @param {Array} submissions - Survey submissions for the area
 * @param {string} area - The area to calculate stats for
 * @returns {Promise<Object>} Object containing completion stats by role
 */
async calculateRoleCompletionStats(submissions, area) {
  try {
    // Get all active team members for this area
    const teamMembers = await base('Team Members').select({
      filterByFormula: `AND(
        {Area} = '${area}',
        NOT({Role} = 'TERM')
      )`
    }).all();

    // Create a map of email to role type for quick lookup
    const emailToRoleMap = new Map(
      teamMembers.map(member => [
        member.get('Email')?.toLowerCase(),
        member.get('Role Type')
      ])
    );

    // Initialize completion counters
    const completionStats = {
      setterCompleted: 0,
      closerCompleted: 0,
      managerCompleted: 0,
      totalSetters: 0,
      totalClosers: 0,
      totalManagers: 0
    };

    // Count total by role type
    teamMembers.forEach(member => {
      const roleType = member.get('Role Type');
      switch (roleType) {
        case 'Setter':
          completionStats.totalSetters++;
          break;
        case 'Closer':
          completionStats.totalClosers++;
          break;
        case 'Manager':
          completionStats.totalManagers++;
          break;
      }
    });

    // Count completions by role type
    submissions.forEach(submission => {
      const submitterEmail = submission.get('Email')?.toLowerCase();
      const roleType = emailToRoleMap.get(submitterEmail);

      switch (roleType) {
        case 'Setter':
          completionStats.setterCompleted++;
          break;
        case 'Closer':
          completionStats.closerCompleted++;
          break;
        case 'Manager':
          completionStats.managerCompleted++;
          break;
      }
    });

    return completionStats;
  } catch (error) {
    console.error(`Error calculating role completion stats for ${area}:`, error);
    throw error;
  }
}

// Update the generateAreaSummaries method
async generateAreaSummaries(submissions, monthKey, summaryId) {
  try {
    const areaSubmissions = {};
    submissions.forEach(submission => {
      const area = submission.get('Area');
      if (!area) return;
      
      if (!areaSubmissions[area]) {
        areaSubmissions[area] = [];
      }
      areaSubmissions[area].push(submission);
    });

    for (const [area, areaData] of Object.entries(areaSubmissions)) {
      // Calculate standard metrics
      const metrics = {};
      NPS_QUESTIONS.forEach(question => {
        const responses = areaData
          .map(record => record.get(question))
          .filter(score => score !== undefined && score !== null);
          
        metrics[question] = {
          nps: this.calculateNPSScore(responses),
          responses: responses.length,
          average: this.calculateAverageScore(responses)
        };
      });

      // Get team member statistics and role completion stats
      const teamStats = await this.calculateTeamMemberStats(area);
      const completionStats = await this.calculateRoleCompletionStats(areaData, area);

      // Process area-specific feedback
      const areaFeedback = this.processAreaFeedback(areaData);

      const summaryFields = {
        'Month Summary': [summaryId],
        'Area': area,
        'Completed Surveys': areaData.length,
        'Last Updated': new Date().toISOString(),
        'Area Feedback Data': JSON.stringify(areaFeedback, null, 2),
        'Total Team Members': teamStats.totalTeamMembers,
        'Total Setters': completionStats.totalSetters,
        'Total Closers': completionStats.totalClosers,
        'Total Managers': completionStats.totalManagers,
        'Setters Completed': completionStats.setterCompleted,
        'Closers Completed': completionStats.closerCompleted,
        'Managers Completed': completionStats.managerCompleted,
        ...Object.entries(metrics).reduce((acc, [metric, values]) => ({
          ...acc,
          [`${metric} NPS`]: values.nps,
          [`${metric} Responses`]: values.responses,
          [`${metric} Avg`]: values.average
        }), {})
      };

      const existingRecord = await base('Area Summary').select({
        filterByFormula: `AND({Month Summary} = '${monthKey}', {Area} = '${area}')`
      }).firstPage();

      if (existingRecord.length > 0) {
        await base('Area Summary').update(existingRecord[0].id, summaryFields);
      } else {
        await base('Area Summary').create(summaryFields);
      }
    }
  } catch (error) {
    console.error('Error generating area summaries:', error);
    throw error;
  }
}

  
    /**
   * Retrieves all available months from the GPS Summary table
   * Orders them from newest to oldest
   * @returns {Promise<Array>} Array of available months in YYYY-MM format
   */
  async getAvailableMonths() {
    try {
      // Get all records from GPS Summary table
      const records = await base('GPS Summary').select({
        fields: ['Month'],
        sort: [{ field: 'Month', direction: 'desc' }]
      }).all();

      // Extract unique months
      const months = [...new Set(records.map(record => record.get('Month')))];

      // If no summary records exist yet, return current month
      if (months.length === 0) {
        const now = new Date();
        return [this.formatMonthKey(now)];
      }

      return months;
    } catch (error) {
      console.error('Error fetching available months:', error);
      // Return current month as fallback
      const now = new Date();
      return [this.formatMonthKey(now)];
    }
  }
  
  async exportAreaAnalysis(areaName, monthKey = this.formatMonthKey(new Date())) {
  try {
    // First, let's get all the relevant data
    const areaRecord = await base('Area Summary').select({
      filterByFormula: `AND({Month Summary} = '${monthKey}', {Area} = '${areaName}')`
    }).firstPage();

    if (!areaRecord || areaRecord.length === 0) {
      throw new Error(`No data found for ${areaName} in ${monthKey}`);
    }

    const record = areaRecord[0];
    
    // Get the GPS entries for this area and month
    const startDate = new Date(monthKey + '-01');
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    
    const submissions = await base('GPS').select({
      filterByFormula: `AND(
        {Area} = '${areaName}',
        IS_AFTER({Submit Date}, '${startDate.toISOString()}'),
        IS_BEFORE({Submit Date}, '${endDate.toISOString()}')
      )`
    }).all();

    // Build our comprehensive analysis object
    const analysisData = {
      metadata: {
        area: areaName,
        month: monthKey,
        last_updated: record.get('Last Updated'),
        total_team_members: record.get('Total Team Members'),
        survey_completion: {
          completed: record.get('Completed Surveys'),
          completion_rate: (record.get('Completed Surveys') / record.get('Total Team Members') * 100).toFixed(1) + '%'
        }
      },
      
      metrics_summary: {
        overview: "Summary of NPS scores and their meanings",
        metrics: {}
      },
      
      feedback_analysis: {
        overview: "Qualitative feedback from team members",
        categories: {}
      },

      historical_context: {
        overview: "Month-over-month changes and trends",
        trends: {}
      }
    };

    // Add detailed metrics data
    NPS_QUESTIONS.forEach(question => {
      const npsScore = record.get(`${question} NPS`);
      analysisData.metrics_summary.metrics[question] = {
        nps_score: npsScore,
        status: this.getNPSStatus(npsScore),
        interpretation: npsScore >= 30 ? "Strong positive sentiment" :
                       npsScore >= 0 ? "Moderate sentiment" :
                       "Needs attention",
        responses: record.get(`${question} Responses`),
        average_score: record.get(`${question} Avg`),
        benchmark: "Company-wide average could be added here"
      };
    });

    // Process feedback responses
    const feedbackFields = [
      'Feedback', 'Energy Feedback', 'Development Feedback',
      'Financial Goals Feedback', 'Personal Performance Feedback',
      'Roadblocks', 'Leadership Support', 'Recognition'
    ];

    feedbackFields.forEach(field => {
      const responses = submissions
        .map(s => s.get(field))
        .filter(text => text && text.trim() !== '');

      if (responses.length > 0) {
        analysisData.feedback_analysis.categories[field] = {
          question: FEEDBACK_FIELDS[field]?.question || field,
          purpose: FEEDBACK_FIELDS[field]?.purpose || "Gather feedback",
          response_count: responses.length,
          responses: responses.map(text => text.trim()),
          analysis_hints: FEEDBACK_FIELDS[field]?.analysis_hints || []
        };
      }
    });

    // Add suggestions for the LLM
    analysisData.analysis_suggestions = {
      key_points: [
        "Consider both quantitative (NPS) and qualitative (feedback) data",
        "Look for patterns in feedback that might explain NPS scores",
        "Identify actionable insights from the feedback",
        "Note both strengths and areas for improvement",
        "Consider how different metrics might be interconnected"
      ],
      focus_areas: [
        "Team member satisfaction and engagement",
        "Professional development and growth",
        "Leadership effectiveness",
        "Work-life balance",
        "Recognition and support"
      ]
    };

    // Format the output nicely
    return JSON.stringify(analysisData, null, 2);
  } catch (error) {
    console.error('Error exporting area analysis:', error);
    throw error;
  }
}
  
  
}

module.exports = new SurveyMetricsService();