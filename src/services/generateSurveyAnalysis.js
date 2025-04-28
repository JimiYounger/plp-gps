const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Helper function to capitalize the first letter of a string.
function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper function to convert Airtable field names to database column names
function fieldToColumn(fieldName) {
  return fieldName.toLowerCase().replace(/\s+/g, '_');
}

/**
 * formatSurveyData:
 *   - summary: the record from either org_monthly_summary or area_monthly_summary.
 *   - roleType: a string like "all", "setter", "closer", or "manager".
 *   - month_date: the month date string.
 *   - areaName: if provided, the area's name (for area-level data).
 *   - isAreaLevel: boolean flag; if true, we use role-specific totals.
 */
function formatSurveyData(summary, roleType, month_date, areaName = null, isAreaLevel = false) {
    let finalRole;
    let totalHeadcount, totalResponses;
    if (roleType.toLowerCase() === "all") {
        finalRole = null;
        totalHeadcount = summary.total_headcount;
        totalResponses = summary.total_responses;
    } else {
        finalRole = capitalizeFirstLetter(roleType);
        if (isAreaLevel) {
            if (roleType.toLowerCase() === "setter") {
                totalHeadcount = summary.setter_headcount;
                totalResponses = summary.setter_responses;
            } else if (roleType.toLowerCase() === "closer") {
                totalHeadcount = summary.closer_headcount;
                totalResponses = summary.closer_responses;
            } else if (roleType.toLowerCase() === "manager") {
                totalHeadcount = summary.manager_headcount;
                totalResponses = summary.manager_responses;
            } else {
                totalHeadcount = summary.total_headcount;
                totalResponses = summary.total_responses;
            }
        } else {
            totalHeadcount = summary.total_headcount;
            totalResponses = summary.total_responses;
        }
    }
    return {
        scope: {
            org_level: areaName ? areaName : "Company-wide",
            role_type: finalRole
        },
        metrics: {
            categories: {}
        },
        month_date: month_date,
        total_headcount: totalHeadcount,
        total_responses: totalResponses,
        response_rate: totalHeadcount ? (totalResponses / totalHeadcount * 100) : 0
    };
}

async function generateSurveyAnalysis(month_date) {
    try {
        console.log(`Generating survey analysis for ${month_date}...`);

        // Fetch organization-level data
        const { data: orgData, error: orgError } = await supabase
            .from('org_monthly_summary')
            .select('*')
            .eq('month_date', month_date);

        if (orgError) throw orgError;

        // Fetch area-level data
        const { data: areaData, error: areaError } = await supabase
            .from('area_monthly_summary')
            .select('*')
            .eq('month_date', month_date);

        if (areaError) throw areaError;

        // Fetch feedback responses
        const { data: feedbackData, error: feedbackError } = await supabase
            .from('monthly_feedback_responses')
            .select('*')
            .eq('month_date', month_date);

        if (feedbackError) throw feedbackError;

        // Fetch survey questions
        const { data: questionsData, error: questionsError } = await supabase
            .from('survey_questions')
            .select('*');

        if (questionsError) throw questionsError;

        // This array will hold all the survey analysis packages
        let surveyPackages = [];

        // Map survey questions by category.
        // The keys (field names) should match your database columns (e.g., "support", "training", etc.).
        let questionMap = {};
        questionsData.forEach((q) => {
            if (!questionMap[q.category]) {
                questionMap[q.category] = { questions: {} };
            }
            questionMap[q.category].questions[q.field_name] = {
                intent: q.intent,
                question_text: q.question_text,
                response_type: q.response_type,
                related_feedback: q.related_question_id
                    ? questionsData.find(rq => rq.id === q.related_question_id)
                    : null
            };
        });

        // Process organization-level data (role "all")
        if (orgData.length) {
            let orgSummary = formatSurveyData(orgData[0], "all", month_date, null, false);
            // Deep copy the question map.
            orgSummary.metrics.categories = JSON.parse(JSON.stringify(questionMap));

            let roleKey = ""; // for numeric lookup keys, empty for 'all'
            for (const category in questionMap) {
                for (const qKey in questionMap[category].questions) {
                    let dbKey = `${fieldToColumn(qKey)}_nps`;
                    if (orgData[0].hasOwnProperty(dbKey)) {
                        orgSummary.metrics.categories[category].questions[qKey] = {
                            ...orgSummary.metrics.categories[category].questions[qKey],
                            nps_score: orgData[0][dbKey] !== null ? orgData[0][dbKey] : 0,
                            average_score: orgData[0][`${fieldToColumn(qKey)}_avg`] !== null ? orgData[0][`${fieldToColumn(qKey)}_avg`] : 0,
                            promoters: orgData[0][`${fieldToColumn(qKey)}_promoters`] !== null ? orgData[0][`${fieldToColumn(qKey)}_promoters`] : 0,
                            passives: orgData[0][`${fieldToColumn(qKey)}_passives`] !== null ? orgData[0][`${fieldToColumn(qKey)}_passives`] : 0,
                            detractors: orgData[0][`${fieldToColumn(qKey)}_detractors`] !== null ? orgData[0][`${fieldToColumn(qKey)}_detractors`] : 0
                        };
                    }
                }
            }
            surveyPackages.push(orgSummary);
        }

        // Process area-level data.
        // Loop over each area record and each role ("setter", "closer", "manager").
        areaData.forEach((area) => {
            ["setter", "closer", "manager"].forEach((roleType) => {
                let summary = formatSurveyData(area, roleType, month_date, area.area_name, true);
                // Deep copy questionMap for this package.
                summary.metrics.categories = JSON.parse(JSON.stringify(questionMap));

                let roleKey = roleType; // for numeric lookup keys (e.g., "manager")
                for (const category in questionMap) {
                    for (const qKey in questionMap[category].questions) {
                        let dbKey = `${roleKey}_${fieldToColumn(qKey)}_nps`;
                        if (area.hasOwnProperty(dbKey)) {
                            summary.metrics.categories[category].questions[qKey] = {
                                ...summary.metrics.categories[category].questions[qKey],
                                nps_score: area[dbKey] !== null ? area[dbKey] : 0,
                                average_score: area[`${roleKey}_${fieldToColumn(qKey)}_avg`] !== null ? area[`${roleKey}_${fieldToColumn(qKey)}_avg`] : 0,
                                promoters: area[`${roleKey}_${fieldToColumn(qKey)}_promoters`] !== null ? area[`${roleKey}_${fieldToColumn(qKey)}_promoters`] : 0,
                                passives: area[`${roleKey}_${fieldToColumn(qKey)}_passives`] !== null ? area[`${roleKey}_${fieldToColumn(qKey)}_passives`] : 0,
                                detractors: area[`${roleKey}_${fieldToColumn(qKey)}_detractors`] !== null ? area[`${roleKey}_${fieldToColumn(qKey)}_detractors`] : 0
                            };
                        }
                    }
                }
                surveyPackages.push(summary);
            });
        });

        // Process text-based feedback responses.
        // Only add feedback where both area_name and role_type match.
        feedbackData.forEach((feedback) => {
            surveyPackages.forEach((pkg) => {
                // For org-level packages, pkg.scope.role_type is null; treat that as "all".
                let pkgRole = pkg.scope.role_type ? pkg.scope.role_type.toLowerCase() : "all";
                if (feedback.area_name === pkg.scope.org_level && feedback.role_type.toLowerCase() === pkgRole) {
                    let category = Object.values(pkg.metrics.categories).find((c) =>
                        c.questions.hasOwnProperty(feedback.field_name)
                    );
                    if (category) {
                        if (!Array.isArray(category.questions[feedback.field_name].anonymous_responses)) {
                            category.questions[feedback.field_name].anonymous_responses = [];
                        }
                        category.questions[feedback.field_name].anonymous_responses =
                            category.questions[feedback.field_name].anonymous_responses.concat(feedback.anonymous_responses || []);
                    }
                }
            });
        });

        // Insert each survey analysis package into the "survey_analysis_packages" table.
        for (let pkg of surveyPackages) {
            await supabase.from("survey_analysis_packages").insert({
                month_date: month_date,
                area_name: pkg.scope.org_level,
                role_type: pkg.scope.role_type,
                analysis_data: pkg
            });
        }

        console.log("Survey analysis generated successfully!");

    } catch (error) {
        console.error("Error generating survey analysis:", error);
    }
}

module.exports = { generateSurveyAnalysis };