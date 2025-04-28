// src/routes/compare.js
const TeamService = require('../services/teamService');
const Papa = require('papaparse');

async function routes(fastify, options) {
  // GET route for the compare page
  fastify.get('/', (request, reply) => {
    return reply.view('/src/pages/compare.hbs');
  });

  // POST route for handling CSV data
  fastify.post('/', async (request, reply) => {
    try {
      const { csvData } = request.body;
      
      if (!csvData) {
        return reply.view('/src/pages/compare.hbs', { 
          error: 'No CSV data provided' 
        });
      }

      // Parse CSV string
      const parsedCsv = await new Promise((resolve, reject) => {
        Papa.parse(csvData, {
          header: true,
          complete: (results) => resolve(results.data),
          error: (error) => reject(error)
        });
      });

      // Compare with Airtable data
      const results = await TeamService.compareWithCSV(parsedCsv);

      return reply.view('/src/pages/compare.hbs', { results });

    } catch (error) {
      console.error('Error processing data:', error);
      return reply.view('/src/pages/compare.hbs', { 
        error: 'Error processing data: ' + error.message 
      });
    }
  });
}

module.exports = routes;