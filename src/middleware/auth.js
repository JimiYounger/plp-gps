// src/middleware/auth.js
const ROLES = require('../config/roles');

// Check if user is authenticated
function isAuthenticated(request, reply, done) {
  if (!request.user) {
    return reply.redirect('/login');
  }
  done();
}

// Check for executive access
function hasExecAccess(request, reply, done) {
  if (!ROLES.EXECUTIVE.includes(request.user.role)) {
    return reply.code(403).view('error', {
      message: 'Access denied. Executive access required.',
      user: request.user
    });
  }
  done();
}

// Check for area access
function hasAreaAccess(request, reply, done) {
  const { areaName } = request.params;
  
  // Executive access remains unchanged
  if (ROLES.EXECUTIVE.includes(request.user.role)) {
    return done();
  }
  
  // Check for AD role and Health Dashboard access
  const hasAccess = 
    request.user.role === 'AD' && 
    request.user.area === areaName && 
    request.user.fields?.['Health Dashboard'] === true;
  
  if (!hasAccess) {
    return reply.code(403).view('error', {
      message: 'Access denied. AD role and Health Dashboard access required.',
      user: request.user
    });
  }
  
  done();
}

// Check for region access
function hasRegionAccess(request, reply, done) {
  const { regionName } = request.params;
  
  // Executive access allows viewing any region
  if (ROLES.EXECUTIVE.includes(request.user.role)) {
    return done();
  }
  
  // Check for RD role and assigned region
  const hasAccess = 
    request.user.role === 'RD' && 
    request.user.region === regionName && 
    request.user.fields?.['Health Dashboard'] === true;
  
  if (!hasAccess) {
    return reply.code(403).view('error', {
      message: 'Access denied. You do not have permission to view this region.',
      user: request.user
    });
  }
  
  done();
}

module.exports = {
  isAuthenticated,
  hasExecAccess,
  hasAreaAccess,
  hasRegionAccess
};