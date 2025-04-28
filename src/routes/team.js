const TeamService = require('../services/teamService');

async function routes(fastify, options) {
      fastify.get('/', function (request, reply) {
      let params = {
        greeting: "Hello Node!",
        user: request.user,
        currentPath: request.url  // Add this line
      };
      return reply.view("index.hbs", params);
    });
}

module.exports = routes;