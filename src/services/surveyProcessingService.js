// src/services/surveyProcessingService.js

const { supabase } = require('../config/supabase');
const base = require('../config/airtable');

// Fields that need NPS calculations (0-10 responses)
const npsFields = [
    'Career Growth',
    'Training',
    'Support',
    'Pay Accuracy',
    'Company Endorsement',
    'Opportunity',
    'Energy',
    'Financial Goals',
    'Personal Performance',
    'Development',
    'Team Culture'
];

// Text feedback fields
const feedbackFields = [
    'Feedback',
    'Energy Feedback',
    'Development Feedback',
    'Financial Goals Feedback',
    'Personal Performance Feedback',
    'Roadblocks',
    'Leadership Support',
    'Recognition'
];

// Role types
const roleTypes = ['Setter', 'Closer', 'Manager'];

// Helper function to convert Airtable field names to database column names
function fieldToColumn(fieldName) {
    return fieldName.toLowerCase().replace(/\s+/g, '_');
}

// Validate NPS score (should be between 0 and 10)
function isValidNPSScore(score) {
    return typeof score === 'number' && score >= 0 && score <= 10;
}

// Clean and validate feedback text
function cleanFeedbackText(text) {
    if (text === null || text === undefined) return null;
    // Convert to string and handle non-string values
    const stringValue = String(text);
    const cleaned = stringValue.trim();
    return cleaned.length > 0 ? cleaned : null;
}

// Retry helper function
async function retryOperation(operation, maxAttempts = 3, delay = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            console.log(`Attempt ${attempt} failed, retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

// Main processing function
async function getSurveyData(processMonth) {
    return retryOperation(async () => {
        // Set date range for the month
        const startOfMonth = new Date(processMonth.getFullYear(), processMonth.getMonth(), 1);
        const endOfMonth = new Date(processMonth.getFullYear(), processMonth.getMonth() + 1, 0);

        console.log('Fetching survey responses...');

        // 1. First get all survey responses
        const responses = await base('GPS')
            .select({
                filterByFormula: `AND(
                    IS_AFTER({Submit Date}, '${startOfMonth.toISOString()}'),
                    IS_BEFORE({Submit Date}, '${endOfMonth.toISOString()}')
                )`,
                fields: ['teamMember', ...npsFields, ...feedbackFields]
            })
            .all();

        console.log(`Found ${responses.length} survey responses`);

        // 2. Get unique areas from responses
        const responseTeamMemberIds = [...new Set(responses.map(r => 
            r.get('teamMember') ? r.get('teamMember')[0] : null
        ).filter(Boolean))];

        // Get team member records for responses to find their areas
        const responseTeamMembers = await base('Team Members')
            .select({
                filterByFormula: `OR(${responseTeamMemberIds.map(id => `RECORD_ID() = '${id}'`).join(',')})`,
                fields: ['Area', 'Role Type']
            })
            .all();

        const surveyedAreas = [...new Set(responseTeamMembers.map(r => r.get('Area')).filter(Boolean))];
        
        console.log('Areas with responses:', surveyedAreas);

        // 3. Get ALL active team members from those areas
        const activeTeamMembers = await base('Team Members')
            .select({
                filterByFormula: `AND(
                    {Role} != 'TERM',
                    OR(${surveyedAreas.map(area => `{Area} = '${area}'`).join(',')})
                )`,
                fields: ['First Name', 'Last Name', 'Area', 'Role Type']
            })
            .all();

        console.log(`Found ${activeTeamMembers.length} active team members in surveyed areas`);

        // Create a map for quick lookups of team member info
        const teamMemberMap = new Map(
            activeTeamMembers.map(record => [
                record.id,
                {
                    id: record.id,
                    firstName: record.get('First Name'),
                    lastName: record.get('Last Name'),
                    area: record.get('Area'),
                    roleType: record.get('Role Type')
                }
            ])
        );

        // Process responses with team member info
            const processedResponses = responses.map(record => {
                const teamMemberId = record.get('teamMember')?.[0];
                const teamMember = teamMemberMap.get(teamMemberId);

                if (!teamMember) {
                    console.warn(`Warning: No team member found for response ${record.id}`);
                    return null;
                }

                return {
                    id: record.id,
                    teamMemberId,
                    firstName: teamMember.firstName,
                    lastName: teamMember.lastName,
                    area: teamMember.area,
                    roleType: teamMember.roleType,
                    timestamp: record.get('Submit Date'), // Include submission timestamp
                    responses: npsFields.reduce((acc, field) => {
                        const value = record.get(field);
                        acc[field] = isValidNPSScore(value) ? value : null;
                        return acc;
                    }, {}),
                    feedback: feedbackFields.reduce((acc, field) => {
                        acc[field] = cleanFeedbackText(record.get(field));
                        return acc;
                    }, {})
                };
            }).filter(Boolean); // Remove null responses

        // Log summary for verification
        const areaStats = {};
        activeTeamMembers.forEach(member => {
            const area = member.get('Area');
            const roleType = member.get('Role Type');
            if (!areaStats[area]) {
                areaStats[area] = { total: 0, responses: 0, byRole: {} };
            }
            if (!areaStats[area].byRole[roleType]) {
                areaStats[area].byRole[roleType] = { total: 0, responses: 0 };
            }
            areaStats[area].total++;
            areaStats[area].byRole[roleType].total++;
        });

        processedResponses.forEach(response => {
            if (response.area && response.roleType) {
                areaStats[response.area].responses++;
                areaStats[response.area].byRole[response.roleType].responses++;
            }
        });

        console.log('\nArea Statistics:');
        Object.entries(areaStats).forEach(([area, stats]) => {
            console.log(`\n${area}:`);
            console.log(`Total: ${stats.responses}/${stats.total} responses`);
            Object.entries(stats.byRole).forEach(([roleType, roleStats]) => {
                console.log(`${roleType}: ${roleStats.responses}/${roleStats.total} responses`);
            });
        });

        return {
            responses: processedResponses,
            activeEmployees: Array.from(teamMemberMap.values())
        };
    });
}

async function processMonthlySurvey(targetDate = new Date()) {
    try {
        // Format the date to the first of the month
        const processMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        console.log(`Starting survey processing for ${processMonth.toISOString().slice(0, 10)}`);
        
        // Get survey responses with team member info
        const surveyData = await getSurveyData(processMonth);
        console.log(`Processed ${surveyData.responses.length} survey responses`);
        
        // Process metrics
        await processOrgMetrics(surveyData, processMonth);
        console.log('Processed organization metrics');
        
        await processAreaMetrics(surveyData, processMonth);
        console.log('Processed area metrics');
        
        await processFeedbackResponses(surveyData, processMonth);
        console.log('Processed feedback responses');
        
        return {
            success: true,
            month: processMonth.toISOString().slice(0, 10),
            totalEmployees: surveyData.activeEmployees.length,
            totalResponses: surveyData.responses.length
        };
    } catch (error) {
        console.error('Error processing monthly survey:', error);
        throw error;
    }
}

// Calculate metrics for a specific role type and responses
function calculateRoleMetrics(responses, field, roleType) {
    const roleResponses = responses.filter(r => r.roleType === roleType);
    const values = roleResponses
        .map(r => r.responses[field])
        .filter(val => isValidNPSScore(val));
    
    if (!values.length) return null;

    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Calculate NPS distributions
    const promoters = values.filter(val => val >= 9).length;
    const passives = values.filter(val => val >= 7 && val < 9).length;
    const detractors = values.filter(val => val < 7).length;
    
    // Calculate NPS score
    const promoterPercent = (promoters / values.length) * 100;
    const detractorPercent = (detractors / values.length) * 100;
    const npsScore = promoterPercent - detractorPercent;

    return {
        avg: Number(avg.toFixed(2)),
        nps: Number(npsScore.toFixed(2)),
        promoters,
        passives,
        detractors,
        total: values.length
    };
}

// Calculate overall metrics
function calculateMetrics(responses, field) {
    const values = responses
        .map(r => r.responses[field])
        .filter(val => isValidNPSScore(val));
    
    if (!values.length) return null;

    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Calculate NPS distributions
    const promoters = values.filter(val => val >= 9).length;
    const passives = values.filter(val => val >= 7 && val < 9).length;
    const detractors = values.filter(val => val < 7).length;
    
    // Calculate NPS score
    const promoterPercent = (promoters / values.length) * 100;
    const detractorPercent = (detractors / values.length) * 100;
    const npsScore = promoterPercent - detractorPercent;

    return {
        avg: Number(avg.toFixed(2)),
        nps: Number(npsScore.toFixed(2)),
        promoters,
        passives,
        detractors,
        total: values.length
    };
}

// Add metrics to data object
function addMetricsToData(data, metrics, field, prefix = '') {
    if (!metrics) return;
    
    const columnName = fieldToColumn(field);
    const prefixStr = prefix ? `${prefix.toLowerCase()}_` : '';
    
    data[`${prefixStr}${columnName}_avg`] = metrics.avg;
    data[`${prefixStr}${columnName}_nps`] = metrics.nps;
    data[`${prefixStr}${columnName}_promoters`] = metrics.promoters;
    data[`${prefixStr}${columnName}_passives`] = metrics.passives;
    data[`${prefixStr}${columnName}_detractors`] = metrics.detractors;
}

async function processOrgMetrics({ responses, activeEmployees }, processMonth) {
    try {
        const data = {
            month_date: processMonth.toISOString().slice(0, 10),
            total_headcount: activeEmployees.length,
            total_responses: responses.length,
            setter_headcount: activeEmployees.filter(emp => emp.roleType === 'Setter').length,
            setter_responses: responses.filter(r => r.roleType === 'Setter').length,
            closer_headcount: activeEmployees.filter(emp => emp.roleType === 'Closer').length,
            closer_responses: responses.filter(r => r.roleType === 'Closer').length,
            manager_headcount: activeEmployees.filter(emp => emp.roleType === 'Manager').length,
            manager_responses: responses.filter(r => r.roleType === 'Manager').length
        };

        // Calculate overall metrics
        for (const field of npsFields) {
            const metrics = calculateMetrics(responses, field);
            addMetricsToData(data, metrics, field);
        }

        // Calculate role-specific metrics
        for (const roleType of roleTypes) {
            for (const field of npsFields) {
                const roleMetrics = calculateRoleMetrics(responses, field, roleType);
                addMetricsToData(data, roleMetrics, field, roleType);
            }
        }

        const { error } = await supabase
            .from('org_monthly_summary')
            .upsert(data);

        if (error) {
            throw new Error(`Error upserting org metrics: ${error.message}`);
        }

    } catch (error) {
        console.error('Error processing org metrics:', error);
        throw error;
    }
}

async function processAreaMetrics({ responses, activeEmployees }, processMonth) {
    try {
        const areas = [...new Set(activeEmployees.map(emp => emp.area))];
        
        for (const area of areas) {
            const areaEmployees = activeEmployees.filter(emp => emp.area === area);
            const areaResponses = responses.filter(resp => resp.area === area);

            const data = {
                month_date: processMonth.toISOString().slice(0, 10),
                area_name: area,
                total_headcount: areaEmployees.length,
                total_responses: areaResponses.length,
                setter_headcount: areaEmployees.filter(emp => emp.roleType === 'Setter').length,
                setter_responses: areaResponses.filter(r => r.roleType === 'Setter').length,
                closer_headcount: areaEmployees.filter(emp => emp.roleType === 'Closer').length,
                closer_responses: areaResponses.filter(r => r.roleType === 'Closer').length,
                manager_headcount: areaEmployees.filter(emp => emp.roleType === 'Manager').length,
                manager_responses: areaResponses.filter(r => r.roleType === 'Manager').length
            };

            // Calculate overall metrics for the area
            for (const field of npsFields) {
                const metrics = calculateMetrics(areaResponses, field);
                addMetricsToData(data, metrics, field);
            }

            // Calculate role-specific metrics for the area
            for (const roleType of roleTypes) {
                for (const field of npsFields) {
                    const roleMetrics = calculateRoleMetrics(areaResponses, field, roleType);
                    addMetricsToData(data, roleMetrics, field, roleType);
                }
            }

            // Insert data into Supabase
            const { error } = await supabase
                .from('area_monthly_summary')
                .upsert(data);

            if (error) {
                throw new Error(`Error upserting data for area ${area}: ${error.message}`);
            }
        }
    } catch (error) {
        console.error('Error processing area metrics:', error);
        throw error;
    }
}

async function processFeedbackResponses({ responses }, processMonth) {
    try {
        const areas = [...new Set(responses.map(r => r.area).filter(Boolean))];

        // Clear existing feedback for this month to prevent duplicates
        const { error: clearError } = await supabase
            .from('monthly_feedback_responses')
            .delete()
            .eq('month_date', processMonth.toISOString().slice(0, 10));

        if (clearError) {
            throw new Error(`Error clearing existing feedback: ${clearError.message}`);
        }

        // Process feedback for each area and role combination
        for (const area of areas) {
            for (const roleType of roleTypes) {
                const areaResponses = responses.filter(r => 
                    r.area === area && r.roleType === roleType
                );

                // Process each feedback field
                for (const field of feedbackFields) {
                    const detailedResponses = areaResponses
                        .map(r => {
                            const text = r.feedback[field];
                            if (!text) return null;

                            try {
                                const cleaned = text.toString().trim();
                                if (cleaned.length === 0) return null;

                                // Include user info with the response
                                return {
                                    response: cleaned,
                                    userId: r.teamMemberId,
                                    firstName: r.firstName,
                                    lastName: r.lastName,
                                    timestamp: r.timestamp // If available from Airtable
                                };
                            } catch (error) {
                                console.warn(`Warning: Invalid feedback text for ${field}:`, text);
                                return null;
                            }
                        })
                        .filter(Boolean);

                    // Create anonymous version for AI processing
                    const anonymousResponses = detailedResponses.map(r => r.response);

                    if (detailedResponses.length > 0) {
                        const { error } = await supabase
                            .from('monthly_feedback_responses')
                            .upsert({
                                month_date: processMonth.toISOString().slice(0, 10),
                                area_name: area,
                                role_type: roleType,
                                field_name: field,
                                responses: detailedResponses,
                                anonymous_responses: anonymousResponses,
                                response_count: detailedResponses.length
                            });

                        if (error) {
                            throw new Error(
                                `Error upserting feedback for ${area} ${roleType} ${field}: ${error.message}`
                            );
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error processing feedback responses:', error);
        throw error;
    }
}

module.exports = {
    processMonthlySurvey
};