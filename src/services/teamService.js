// src/services/teamService.js
const base = require('../config/airtable');
const stringSimilarity = require('string-similarity');

// Constants at the top level for easy maintenance
const RELEVANT_ROLES = ['FM', 'FMS', 'EC', 'FMM', 'SM', 'AD', 'RD'];

// Define TeamService as a single object with all methods
const TeamService = {
    // Helper function to normalize names for comparison
    normalizeNameForComparison(name) {
        return name
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    },

    // Helper function to check if names match, including partial matches
    areNamesMatching(csvName, airtableName) {
        const normalizedCsvName = this.normalizeNameForComparison(csvName);
        const normalizedAirtableName = this.normalizeNameForComparison(airtableName);

        if (normalizedCsvName === normalizedAirtableName) {
            return true;
        }

        const csvParts = normalizedCsvName.split(' ');
        const airtableParts = normalizedAirtableName.split(' ');

        const similarity = stringSimilarity.compareTwoStrings(
            normalizedCsvName,
            normalizedAirtableName
        );

        if (similarity > 0.8) {
            return true;
        }

        const shorterParts = csvParts.length < airtableParts.length ? csvParts : airtableParts;
        const longerParts = csvParts.length < airtableParts.length ? airtableParts : csvParts;

        return shorterParts.every(part => 
            longerParts.some(longPart => 
                stringSimilarity.compareTwoStrings(part, longPart) > 0.8
            )
        );
    },

    // Compare team members with CSV data
    async compareWithCSV(csvData) {
        try {
            const formula = `OR(${RELEVANT_ROLES.map(role => `{Role} = '${role}'`).join(', ')})`;
            const records = await base('Team Members')
                .select({
                    filterByFormula: formula
                })
                .all();

            const csvNames = csvData
                .filter(row => row['First name'] && row['Last name'])
                .map(row => `${row['First name']} ${row['Last name']}`);

            const missingMembers = records.filter(record => {
                const airtableName = record.fields['Full Name'];
                return !csvNames.some(csvName => 
                    this.areNamesMatching(csvName, airtableName)
                );
            });

            return missingMembers.map(record => ({
                fullName: record.fields['Full Name'],
                role: record.fields['Role'],
                phone: record.fields['Phone'],
                email: record.fields['Email'],
                team: record.fields['Team']
            }));

        } catch (error) {
            console.error('Error comparing team members:', error);
            throw error;
        }
    },

    // Get area roster with survey completion status
    async getAreaRosterWithSurveyStatus(area, targetMonth) {
        try {
            // Step 1: Get all active team members in the area
            const teamMembersFilter = `AND(
                {Area} = '${area}',
                {Role} != 'TERM',
                IS_BEFORE({Hire Date}, TODAY())
            )`;
            
            const teamMembers = await base('Team Members')
                .select({
                    filterByFormula: teamMembersFilter,
                    sort: [{ field: 'Last Name', direction: 'asc' }]
                })
                .all();

            // Step 2: Get all GPS records for the target month
            const startOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
            const endOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
            
            const surveyFilter = `AND(
                IS_AFTER({Submit Date}, '${startOfMonth.toISOString()}'),
                IS_BEFORE({Submit Date}, '${endOfMonth.toISOString()}')
            )`;

            const surveyRecords = await base('GPS')
                .select({
                    filterByFormula: surveyFilter,
                    fields: ['teamMember', 'Submit Date']
                })
                .all();

            // Step 3: Create a Set of team member IDs who completed the survey
            const completedSurveyIds = new Set(
                surveyRecords.flatMap(record => 
                    record.fields.teamMember ? record.fields.teamMember : []
                )
            );

            // Step 4: Map team members to include their survey completion status
            const roster = teamMembers.map(member => ({
                id: member.id,
                name: `${member.fields['First Name']} ${member.fields['Last Name']}`,
                role: member.fields['Role'],
                roleType: member.fields['Role Type'],
                completedSurvey: completedSurveyIds.has(member.id),
                startDate: member.fields['Hire Date']
            }));

            // Step 5: Calculate completion percentage
            const completionStats = {
                total: roster.length,
                completed: roster.filter(member => member.completedSurvey).length,
                completionRate: roster.length > 0 
                    ? (roster.filter(member => member.completedSurvey).length / roster.length) * 100 
                    : 0
            };

            return {
                roster,
                stats: completionStats
            };
        } catch (error) {
            console.error('Error fetching area roster:', error);
            throw error;
        }
    }
};

module.exports = TeamService;