// server.js
const SKIP_AUTH_FOR_DEV = false;
const path = require("path");
const Handlebars = require("handlebars");
const { registerHelpers } = require('./src/helpers/handlebarHelpers');
const aiRoutes = require('./src/routes/aiRoutes.js');
const executiveDashboardRoutes = require('./src/routes/executive-dashboard-routes');
const areaDashboardRoutes = require('./src/routes/area-dashboard-routes');
const regionalDashboardRoutes = require('./src/routes/regional-dashboard-routes');
const userService = require('./src/services/userService');  // Add this line


// Import and create our Passport authenticator
const { Authenticator } = require('@fastify/passport');
const fastifyPassport = new Authenticator();

fastifyPassport.registerUserSerializer(async (user, request) => {
  // When storing user info in the session, we want to be minimal for security
  // We just store the email since we can use that to look up the full user details later
  if (!user || !user.email) {
    throw new Error('Invalid user object for serialization');
  }
  return user.email;
});

// Update deserializer to use userService
fastifyPassport.registerUserDeserializer(async (serializedUser, request) => {
  try {
    // Use our userService to reconstruct the full user object from the email
    const user = await userService.findUserInAirtable(serializedUser);
    if (!user) {
      throw new Error('User not found during deserialization');
    }
    return user;
  } catch (error) {
    console.error('Deserialization error:', error);
    throw error;
  }
});

// Import our authentication config
const authConfig = require('./src/config/auth-config');

// Create our Fastify instance
const fastify = require("fastify")({
  logger: false,
});

// Register our custom Handlebars helpers
registerHelpers(Handlebars);

// Configure and register plugins in the correct order
async function registerPlugins() {
  try {
    // 1. Cookie parser - needed for sessions
    await fastify.register(require("@fastify/cookie"));

    // 2. Session handling - needed for authentication
    await fastify.register(require("@fastify/session"), {
      secret: process.env.SESSION_SECRET || 'aK9#mP2$vL5@nR8*qW4&hX6!jN3^pB7%dF9$mH2@pL5',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      },
      saveUninitialized: false
    });

    // 3. Initialize Passport authentication
    await fastify.register(fastifyPassport.initialize());
    await fastify.register(fastifyPassport.secureSession());

    // 4. Static file serving
    await fastify.register(require("@fastify/static"), {
      root: path.join(__dirname, "public"),
      prefix: "/",
    });

    // 5. Form body parser
    await fastify.register(require("@fastify/formbody"));

    // 6. Configure view engine
    await fastify.register(require("@fastify/view"), {
      engine: {
        handlebars: Handlebars
      },
      root: path.join(__dirname, "src", "pages"),
      layout: 'layout',
      options: {
        helpers: {
          currentYear: function() {
            return new Date().getFullYear();
          }
        },
        partials: {
          'organization-health/navigation': 'organization-health/partials/navigation.hbs',
          'organization-health/metric-card': 'organization-health/partials/metric-card.hbs',
          'organization-health/nps-legend': 'organization-health/partials/nps-legend.hbs',
          'health/filter-tabs': 'health/partials/filter-tabs.hbs',
          'health/metric-card': 'health/partials/metric-card.hbs',
          'health/area-table': 'health/partials/area-table.hbs',
          'health/area-scorecard': 'health/partials/area-scorecard.hbs',
          'health/response-table': 'health/partials/response-table.hbs'
        }
      }
    });
  } catch (err) {
    console.error('Error registering plugins:', err);
    throw err;
  }
}

// Import our service layers
const TeamService = require("./src/services/teamService");
const SurveyMetricsService = require("./src/services/surveyMetricsService");
const AIService = require("./src/services/aiService");

// Add authentication check middleware
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth check for public routes as before
  const publicRoutes = ['/login', '/auth/google', '/auth/google/callback', '/', '/public'];
  if (publicRoutes.some(route => request.url.startsWith(route))) {
    return;
  }

  // If we're skipping auth for development, create a fake user session
  if (SKIP_AUTH_FOR_DEV && process.env.NODE_ENV !== 'production') {
    // Simulate a logged-in user with the permissions you need for testing
    request.user = {
      id: 'dev-user',
      email: 'dev@purelightpower.com',
      name: 'Development User',
      role: 'AD',  // Set this to whatever role you need to test
      area: 'Puget Sound',
      isActive: true
    };
    reply.locals = reply.locals || {};
    reply.locals.user = request.user;
    return;
  }

  // Regular authentication check for when auth is enabled
  if (!request.user) {
    reply.redirect('/login');
    return;
  }

  // Add user to all view renders
  reply.locals = reply.locals || {};
  reply.locals.user = request.user;
});

// Export the passport instance for use in auth service
fastify.decorate('passport', fastifyPassport);

// Start the server with proper plugin registration
async function startServer() {
  try {
    // Register all plugins first
    await registerPlugins();

    // Register route handlers after plugins are set up
    fastify.register(require('./src/routes/authRoutes'));
    fastify.register(require('./src/routes/compare'), { prefix: '/compare' });
    fastify.register(require('./src/routes/organizationHealth'), { prefix: '/organization-health' });
    fastify.register(require('./src/routes/aiRoutes'), { prefix: '/api/ai' });
    fastify.register(executiveDashboardRoutes, { prefix: '/health' });
    fastify.register(areaDashboardRoutes);
    fastify.register(regionalDashboardRoutes);

    // Basic home page route
    fastify.get("/", function (request, reply) {
      let params = {
        greeting: "Hello Node!",
        user: request.user
      };
      return reply.view("index.hbs", params);
    });

    // Team members route
    fastify.get("/team", async function (request, reply) {
      try {
        const teamMembers = await TeamService.getAllTeamMembers();
        let params = {
          teamMembers: teamMembers,
          user: request.user
        };
        return reply.view("team.hbs", params);
      } catch (error) {
        console.error("Error fetching team members:", error);
        return reply.view("team.hbs", { 
          error: "Failed to load team members",
          user: request.user 
        });
      }
    });

    // Global error handler
    fastify.setErrorHandler(function (error, request, reply) {
      console.error(error);
      return reply.view("error.hbs", {
        message: error.message || "Internal Server Error",
        error: process.env.NODE_ENV === 'development' ? error : {},
        user: request.user
      });
    });

    // Start listening
    await fastify.listen({ port: process.env.PORT, host: "0.0.0.0" });
    console.log(`Server is running at ${fastify.server.address().port}`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Start the server
startServer();