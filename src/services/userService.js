// src/services/userService.js

// Import Airtable configuration and roles
const base = require('../config/airtable');
const ROLES = require('../config/roles');

/**
 * Finds a user in Airtable by their email address. This function serves as the core
 * user lookup mechanism for our authentication system, used both during initial
 * login and session deserialization.
 * 
 * @param {string} email - The email address to search for
 * @returns {Promise<Object|null>} The user object if found, null otherwise
 */
async function findUserInAirtable(email) {
    try {
        // Query Airtable for the user with the matching email. We use maxRecords: 1
        // since email should be unique, and we only need the first match
        const records = await base('Team Members').select({
            filterByFormula: `{Email} = '${email}'`,
            maxRecords: 1
        }).firstPage();
        
        if (records.length === 0) return null;
        
        const userData = records[0].fields;

        // We create a standardized user object that will be consistent
        // throughout our application
        return {
            id: records[0].id,
            email: userData.Email,
            name: userData.Name,
            role: userData.Role,
            area: userData.Area,
            isActive: userData.Role !== 'TERM',
            fields: {
                'Health Dashboard': userData['Health Dashboard']
            }
        };
    } catch (error) {
        console.error('Airtable lookup error:', error);
        return null;
    }
}

/**
 * Checks if a user has executive access. This function uses our role configuration
 * to determine if the user's role is in the executive group.
 * 
 * @param {Object} user - The user object containing at minimum a role property
 * @returns {boolean} True if user has executive access
 */
function hasExecutiveAccess(user) {
    return ROLES.EXECUTIVE.includes(user.role);
}

/**
 * Checks if a user has access to a specific area. This implements our access control
 * logic where executives can access all areas, but area managers can only access
 * their assigned area.
 * 
 * @param {Object} user - The user object containing role and area properties
 * @param {string} areaName - The area to check access for
 * @returns {boolean} True if user has access to the area
 */
function hasAreaAccess(user, areaName) {
    // Executives have universal access to all areas
    if (ROLES.EXECUTIVE.includes(user.role)) {
        return true;
    }
    
    // Area managers can only access their assigned area
    if (ROLES.AREA_MANAGER.includes(user.role)) {
        return user.area === areaName && 
         (user.role === 'AD' || user.role === 'SM') && 
          user.fields?.['Health Dashboard'] === true;
    }
    
    // Default to no access for any other role
    return false;
}

module.exports = {
    findUserInAirtable,
    hasExecutiveAccess,
    hasAreaAccess
};