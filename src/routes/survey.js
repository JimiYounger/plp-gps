// src/routes/survey.js

const { generateSurveyAnalysis } = require('../services/generateSurveyAnalysis');
const { supabase } = require('../config/supabase');

module.exports = async function (fastify, opts) {
    fastify.get('/survey-analysis/:month_date', async (request, reply) => {
        const { month_date } = request.params;

        const { data, error } = await supabase
            .from('survey_analysis_packages')
            .select('analysis_data')
            .eq('month_date', month_date);

        if (error) {
            return reply.status(500).send({ error: error.message });
        }

        return reply.send(data);
    });

    fastify.post('/survey-analysis/generate/:month_date', async (request, reply) => {
        const { month_date } = request.params;
        await generateSurveyAnalysis(month_date);
        return reply.send({ message: "Survey analysis generated successfully!" });
    });
};
