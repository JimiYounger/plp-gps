// src/helpers/handlebarHelpers.js

/**
 * This module provides helper functions for use in Handlebars templates.
 * These helpers enable more complex logic and formatting in our templates
 * while keeping the templates themselves clean and readable.
 */

// First, let's define our role constants that will be used across helpers
const ROLES = {
  EXECUTIVE: ['DVP', 'VP', 'SVP', 'CSO', 'CRO', 'CMO'],
  AREA_MANAGER: ['AD', 'MD', 'RD']
};

// Basic comparison helpers for template logic
const comparisonHelpers = {
  eq: function (a, b) {
    return a === b;
  },
  gt: function (a, b) {
    return a > b;
  },
  gte: function (a, b) {
    return a >= b;
  },
  lt: function (a, b) {
    return a < b;
  },
  lte: function (a, b) {
    return a <= b;
  },
  and: function () {
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.every(Boolean);
  },
  or: function () {
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.some(Boolean);
  },
  every: function (collection, key, value) {
    if (!collection) return false;
    
    if (Array.isArray(collection)) {
      return collection.every(item => item[key] >= value);
    }
    return Object.values(collection).every(item => item[key] >= value);
  }
};

// Helpers for working with arrays and objects
const collectionHelpers = {
  length: function (value) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object') return Object.keys(value).length;
    return 0;
  },
  some: function (collection, key, value) {
    if (!collection) return false;
    
    if (Array.isArray(collection)) {
      return collection.some(item => item[key] === value);
    }
    return Object.values(collection).some(item => item[key] === value);
  },
  lookup: function (obj, field) {
    return obj && obj[field];
  },
  array: function() {
    return Array.prototype.slice.call(arguments, 0, -1);
  }
};

// Helpers for formatting text and numbers
const formatHelpers = {
  titleCase: function(str) {
    if (!str) return '';
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  },
  toUpperCase: function(str) {
    if (!str) return '';
    return str.toUpperCase();
  },
  formatNumber: function (number) {
    return new Intl.NumberFormat().format(number);
  },
  formatPercent: function (number) {
    return `${Number(number).toFixed(1)}%`;
  },
  padNumber: function (number) {
    return number.toString().padStart(2, '0');
  },
  percentage: function(value, total) {
    if (!total) return 0;
    return ((value / total) * 100).toFixed(1);
  },
  multiply: function(a, b) {
    return a * b;
  },
  concat: function() {
    // Remove the Handlebars options object which is always the last argument
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.join('');
  },
  formatDate: function(date, format) {
    if (!date) return '';
    const d = new Date(date);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (format === "MMMM YYYY") {
      return `${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return d.toLocaleDateString();
  }
};

// Helpers specific to the dashboard functionality
const dashboardHelpers = {
  getNPSStatusClass: function (score) {
    if (score >= 50) return 'text-success';
    if (score >= 0) return 'text-warning';
    return 'text-danger';
  },
  getNPSStatusText: function (score) {
    if (score >= 50) return 'Excellent';
    if (score >= 20) return 'Good';
    if (score >= 0) return 'Fair';
    return 'Needs Improvement';
  },
  formatResponseCount: function (count) {
    return `${count} ${count === 1 ? 'response' : 'responses'}`;
  },
getSurveyQuestion: function(category) {
    const questions = {
      'Career Growth': "I am making the money I need for this to be a long term opportunity",
      'Training': "I am receiving the training I need",
      'Support': "I am receiving the support I need",
      'Compensation Knowledge': "I have an understanding of how I'm payed",
      'Company Endorsement': "I would recommend working at Purelight to friends and Family",
      'Opportunity': "I see opportunities for growth here at Purelight",
      'Energy': "How is your energy level at the beginning and end of the day?",
      'Development': "Rate how you are currently doing with your personal & professional development",
      'Financial Goals': "How are you doing towards your financial goals?",
      'Personal Performance': "Rate your professional performance",
      'Team Culture': "How would you rate the culture of your team?"
    };
    return questions[category] || category;
  },
  getTooltipAttributes: function(category) {
    const question = dashboardHelpers.getSurveyQuestion(category);
    return `data-bs-toggle="tooltip" data-bs-placement="top" title="${question}"`;
  },
  getPopoverAttributes: function(category) {
    const question = dashboardHelpers.getSurveyQuestion(category);
    return `data-bs-toggle="popover" data-bs-placement="top" 
            data-bs-title="${category}" 
            data-bs-content="${question}"
            data-bs-trigger="hover focus"`;
  },
    formatMetricBadge: function(metric) {
      // First check if we have a metric object at all
      if (!metric) {
        return '<span class="text-muted">-</span>';
      }

      // Now check if NPS is actually null/undefined (but allow 0 as valid)
      if (metric.nps === null || metric.nps === undefined) {
        return '<span class="text-muted">-</span>';
      }

      // Format the badge with the NPS value
      return `<div class="d-inline-block" data-bs-toggle="tooltip" 
                title="Avg: ${formatHelpers.formatNumber(metric.avg)}/10 | ${formatHelpers.formatNumber(metric.responses)} responses">
                <span class="badge rounded-pill px-3 py-2" 
                      style="background-color: ${metric.color}">
                      ${formatHelpers.formatNumber(metric.nps)}
                </span>
              </div>`;
    }
};

// New helpers for role-based access and navigation
const roleHelpers = {
  isAreaManager: function(role) {
    return ROLES.AREA_MANAGER.includes(role);
  },
  isExecutive: function(role) {
    return ROLES.EXECUTIVE.includes(role);
  },
  getDashboardUrl: function(user) {
    if (!user || !user.role) return '/';
    
    if (ROLES.AREA_MANAGER.includes(user.role)) {
      return `/health/area-dashboard/${encodeURIComponent(user.area)}`;
    }
    if (ROLES.EXECUTIVE.includes(user.role)) {
      return '/health/exec-dashboard';
    }
    return '/';
  }
};

// Navigation-specific helpers
const navigationHelpers = {
  isActiveRoute: function(currentPath, route) {
    return currentPath === route;
  },
  getNavLabel: function(user) {
    if (!user) return '';
    if (roleHelpers.isAreaManager(user.role)) {
      return `${user.area} Dashboard`;
    }
    if (roleHelpers.isExecutive(user.role)) {
      return 'Executive Dashboard';
    }
    return '';
  }
};

// Combine all helpers into a single object
const helpers = {
  ...comparisonHelpers,
  ...collectionHelpers,
  ...formatHelpers,
  ...dashboardHelpers,
  ...roleHelpers,
  ...navigationHelpers
};

// Function to register all helpers with Handlebars
function registerHelpers(handlebars) {
  Object.entries(helpers).forEach(([name, helper]) => {
    handlebars.registerHelper(name, helper);
  });
}

// Export both the helpers object and the registration function
module.exports = {
  helpers,
  registerHelpers
};