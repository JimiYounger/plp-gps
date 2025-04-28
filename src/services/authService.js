// src/services/authService.js

const passport = require('@fastify/passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const authConfig = require('../config/auth-config');
const base = require('../config/airtable');

// Define role hierarchies
const EXECUTIVE_ROLES = ['DVP', 'VP', 'SVP', 'CSO', 'CRO', 'CMO'];
const AREA_MANAGER_ROLES = ['AD', 'MD', 'RD'];
const ALL_DASHBOARD_ROLES = [...AREA_MANAGER_ROLES, ...EXECUTIVE_ROLES];

// Function to find user in Airtable
async function findUserInAirtable(email) {
  try {
    const records = await base('Team Members').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage();
    
    if (records.length === 0) return null;
    
    const userData = records[0].fields;
    return {
      id: records[0].id,
      email: userData.Email,
      name: userData.Name,
      role: userData.Role,
      area: userData.Area,
      isActive: userData.Active === true
    };
  } catch (error) {
    console.error('Airtable lookup error:', error);
    return null;
  }
}

// Set up passport serialization
passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  try {
    const user = await findUserInAirtable(email);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Configure Google Strategy
passport.use(new GoogleStrategy(
  authConfig.google,
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      
      // Check if email is from purelightpower.com domain
      if (!email.endsWith('@purelightpower.com')) {
        return done(null, false, { message: 'Only @purelightpower.com emails are allowed' });
      }

      // Look up user in Airtable
      const user = await findUserInAirtable(email);
      
      if (!user) {
        return done(null, false, { message: 'User not found in Team Members table' });
      }

      if (!user.isActive) {
        return done(null, false, { message: 'User account is not active' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Middleware to check access to exec dashboard
function canAccessExecDashboard(user) {
  return EXECUTIVE_ROLES.includes(user.role);
}

// Middleware to check access to area dashboard
function canAccessAreaDashboard(user) {
  return ALL_DASHBOARD_ROLES.includes(user.role);
}

// Middleware to check if user can access specific area
function canAccessArea(user, areaName) {
  // Executives can access all areas
  if (EXECUTIVE_ROLES.includes(user.role)) {
    return true;
  }
  
  // Area managers can only access their assigned area
  if (AREA_MANAGER_ROLES.includes(user.role)) {
    return user.area === areaName;
  }
  
  return false;
}

// Middleware to protect exec dashboard
function requireExecAccess(request, reply, next) {
  if (!request.user) {
    reply.redirect('/login');
    return;
  }

  if (!canAccessExecDashboard(request.user)) {
    reply.code(403).view('error', {
      message: 'You do not have permission to access the executive dashboard',
      user: request.user
    });
    return;
  }

  next();
}

// Middleware to protect area dashboard
function requireAreaAccess(request, reply, next) {
  if (!request.user) {
    reply.redirect('/login');
    return;
  }

  if (!canAccessAreaDashboard(request.user)) {
    reply.code(403).view('error', {
      message: 'You do not have permission to access area dashboards',
      user: request.user
    });
    return;
  }

  // If accessing a specific area, check area permissions
  const areaName = request.params.areaName;
  if (areaName && !canAccessArea(request.user, areaName)) {
    reply.code(403).view('error', {
      message: 'You do not have permission to access this area',
      user: request.user
    });
    return;
  }

  next();
}

module.exports = {
  passport,
  requireExecAccess,
  requireAreaAccess,
  canAccessExecDashboard,
  canAccessAreaDashboard,
  canAccessArea
};