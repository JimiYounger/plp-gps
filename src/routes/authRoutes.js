// src/routes/authRoutes.js

// Import required dependencies
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const userService = require('../services/userService');
const ROLES = require('../config/roles');

async function routes(fastify, options) {
  // Get passport instance from fastify
  const passport = fastify.passport;

  // Set up user serialization for sessions
  // This determines what user data we store in the session
  passport.serializeUser((user, done) => {
    // We only store the email in the session for security
    // The full user object will be reconstructed during deserialization
    done(null, user.email);
  });

  // Set up user deserialization
  // This runs when we need to get the full user object from the session data
  passport.deserializeUser(async (email, done) => {
    try {
      // Use our userService to look up the full user details
      const user = await userService.findUserInAirtable(email);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Configure Google authentication strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === 'production'
      ? 'https://plp-gps.glitch.me/auth/google/callback'
      : 'http://localhost:3000/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      
      // Verify email domain
      if (!email.endsWith('@purelightpower.com')) {
        return done(null, false, { message: 'Only @purelightpower.com emails are allowed' });
      }

      // Look up user in Airtable using our userService
      const user = await userService.findUserInAirtable(email);
      
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
  }));

  // Login route
  fastify.get('/login', async (request, reply) => {
    if (request.user) {
      return reply.redirect('/');
    }
    return reply.view('login', { layout: 'layout' });
  });

  // Start Google OAuth flow
  fastify.get('/auth/google', {
    preValidation: passport.authenticate('google', { 
      scope: ['profile', 'email']
    })
  }, async (request, reply) => {});

  // Handle Google OAuth callback
  fastify.get('/auth/google/callback', {
    preValidation: passport.authenticate('google', { 
      failureRedirect: '/login',
      failureMessage: true
    })
  }, async (request, reply) => {
    try {
      // Ensure session is saved before redirect
      await request.session.save();
      
      // Direct users to appropriate dashboard based on role
      if (request.user && request.user.role) {
        if (request.user.role === 'RD' && request.user.region) {
          return reply.redirect(`/health/regional-dashboard/${encodeURIComponent(request.user.region)}`);
        }
        if (ROLES.AREA_MANAGER.includes(request.user.role) && request.user.role !== 'RD') {
          return reply.redirect(`/health/area-dashboard/${encodeURIComponent(request.user.area)}`);
        }
        if (ROLES.EXECUTIVE.includes(request.user.role)) {
          return reply.redirect('/health/exec-dashboard');
        }
      }
      
      return reply.redirect('/');
    } catch (error) {
      console.error('Callback error:', error);
      return reply.redirect('/login');
    }
  });

  // Logout route
  fastify.get('/logout', async (request, reply) => {
    request.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return reply.code(500).view('error', {
          message: 'Error during logout',
          error: err
        });
      }
      return reply.redirect('/login');
    });
  });
}

// Export the routes function
module.exports = routes;