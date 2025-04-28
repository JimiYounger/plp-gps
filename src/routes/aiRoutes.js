// src/routes/aiRoutes.js
const SurveyAiAnalysisService = require('../services/surveyAiAnalysisService');

async function routes(fastify, options) {
    const aiService = new SurveyAiAnalysisService();

    // Get list of unprocessed packages
    fastify.get('/unprocessed', async (request, reply) => {
        try {
            const packages = await aiService.getUnprocessedPackages();
            return reply.send(packages);
        } catch (error) {
            console.error('Error getting unprocessed packages:', error);
            reply.code(500).send({ error: error.message });
        }
    });

    // Process a specific package
    fastify.post('/analyze/:packageId', async (request, reply) => {
        try {
            const result = await aiService.generateAnalysisSummary(request.params.packageId);
            return reply.send(result);
        } catch (error) {
            console.error('Error analyzing package:', error);
            reply.code(500).send({ error: error.message });
        }
    });

    // Process next batch of unprocessed packages
    fastify.post('/process-batch', async (request, reply) => {
        try {
            const batchSize = request.body?.batchSize || 5;
            const results = await aiService.processNextBatch(batchSize);
            return reply.send(results);
        } catch (error) {
            console.error('Error processing batch:', error);
            reply.code(500).send({ error: error.message });
        }
    });

  fastify.post('/process-all', async (request, reply) => {
    try {
        const results = await aiService.processAllUnprocessedPackages();
        return reply.send(results);
    } catch (error) {
        console.error('Error processing all unprocessed packages:', error);
        reply.code(500).send({ error: error.message });
    }
});


}

module.exports = routes;