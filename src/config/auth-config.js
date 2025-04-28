// src/config/auth-config.js

const authConfig = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://your-glitch-project.glitch.me/auth/google/callback'
  },
  session: {
    // Session configuration
    secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-this',
    cookie: {
      secure: process.env.NODE_ENV === 'production', // true in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    resave: false,
    saveUninitialized: false
  },
  // Add roles that have access to specific pages
  roleAccess: {
    // Example: 'exec-dashboard': ['Executive', 'Admin'],
    'exec-dashboard': ['Executive', 'Admin'],
    'area-dashboard': ['Area Manager', 'Executive', 'Admin'],
    'team': ['Team Lead', 'Area Manager', 'Executive', 'Admin']
  }
};

module.exports = authConfig;