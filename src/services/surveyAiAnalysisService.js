// src/services/surveyAiAnalysisService.js
const { createClient } = require('@supabase/supabase-js');
const { Configuration, OpenAIApi } = require('openai');
const { openAIConfig } = require('../config/openai-config');

class SurveyAiAnalysisService {
    constructor() {
        this.openai = new OpenAIApi(new Configuration({
            apiKey: openAIConfig.apiKey
        }));
        
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }

    async getUnprocessedPackages() {
        try {
            const { data, error } = await this.supabase
                .from('survey_analysis_packages')
                .select('id, month_date, area_name, role_type')
                .eq('ai_processed', false)
                .order('month_date', { ascending: false });

            if (error) throw new Error(`Failed to fetch unprocessed packages: ${error.message}`);
            return data;
        } catch (error) {
            console.error('Error in getUnprocessedPackages:', error);
            throw error;
        }
    }

    async generateAnalysisSummary(analysisPackageId) {
        try {
            // 1. Fetch the analysis package
            const { data: packageData, error: packageError } = await this.supabase
                .from('survey_analysis_packages')
                .select('*')
                .eq('id', analysisPackageId)
                .single();

            if (packageError) throw new Error(`Failed to fetch package: ${packageError.message}`);
            if (!packageData) throw new Error('Analysis package not found');
          
          console.log('Using max tokens:', openAIConfig.maxTokens);

            // 2. Generate AI summary
            const completion = await this.openai.createChatCompletion({
                model: openAIConfig.model,
                messages: [
                    {
                        role: "system",
                        content: `You are an expert organizational development consultant analyzing survey data. You will analyze patterns by examining promoters (9-10), passives (7-8), and detractors (0-6), but translate all insights into clear business language for managers. You will ALWAYS follow this EXACT structure and format, with NO DEVIATIONS:

                                        [ANALYSIS PRINCIPLES]
                                        1. ANALYZE using:
                                           - Ratio of promoters to detractors
                                           - Distribution patterns
                                           - Concentration of responses
                                           - Relationship between categories
                                        2. TRANSLATE all NPS insights into business impact using:
                                           - Clear majority/minority language
                                           - Concrete business implications
                                           - Actionable observations
                                           - Direct cause-and-effect relationships

                                        [REQUIRED OUTPUT STRUCTURE]
                                        1. Start directly with "**The Big Picture**" (no headers or intros)
                                        2. Use EXACTLY these sections in this order:
                                           - **The Big Picture**
                                           - **Key Findings**
                                           - **Recurring Themes**
                                           - **Sentiment Analysis**
                                           - **Potential Correlations**
                                           - **Actionable Items**
                                           - **Team Recognition**
                                        3. NO transitions between sections
                                        4. NO concluding statements
                                        5. NO additional headers or sections

                                        [SECTION REQUIREMENTS]

                                        **The Big Picture** (REQUIRED FORMAT)
                                        - EXACTLY 3-5 sentences
                                        - MUST START with response rate context if under 70%
                                        - MUST use **bold highlights** for key patterns
                                        - MUST connect major themes
                                        - MUST suggest direction forward
                                        - NEVER use NPS terminology
                                        - MUST translate insights into business impact

                                        **Key Findings** (REQUIRED FORMAT)
                                        - EXACTLY 3-4 bullet points
                                        - Each MUST start with **bold key insight**
                                        - MUST include confidence context if under 40% response rate
                                        - Each point MUST explain business impact
                                        - Each point MUST connect multiple data points
                                        - NEVER use NPS terminology
                                        - MUST use these business phrases instead:
                                          * "Strong team satisfaction"
                                          * "Clear need for improvement"
                                          * "Mixed feedback requiring attention"
                                          * "Consistent positive feedback"
                                          * "Significant opportunity for growth"
                                          * "Well-established strength"
                                          * "Notable area of concern"
                                          * "Clear pattern of success"
                                          * "Varied team perspectives"

                                        **Recurring Themes** (REQUIRED FORMAT)
                                        - EXACTLY 3-4 themes
                                        - Each MUST have **Bold theme headers**
                                        - Each MUST include specific examples
                                        - Each MUST connect to business impact
                                        - NO recognition themes
                                        - MUST frame compensation themes around effort-achievement correlation
                                        - NEVER use NPS terminology

                                        **Sentiment Analysis** (REQUIRED FORMAT)
                                        - MUST have these EXACT three categories:
                                          * Positive: **Bold** clear strengths
                                          * Neutral: **Bold** areas showing mixed results
                                          * Negative: **Bold** areas needing improvement
                                        - MUST frame compensation feedback as growth opportunity
                                        - NEVER use NPS terminology

                                        **Potential Correlations** (REQUIRED FORMAT)
                                        - EXACTLY 2-3 clear relationship patterns
                                        - Each MUST start with **bold** key connection
                                        - Each MUST explain business impact
                                        - Each MUST be actionable
                                        - NEVER use NPS terminology
                                        - For compensation correlations, MUST:
                                          * Connect financial outcomes to specific behaviors
                                          * Highlight success patterns
                                          * Focus on actionable steps
                                          * Link training/support to income growth
                                          * Connect development to revenue generation

                                        **Actionable Items** (REQUIRED FORMAT)
                                        - EXACTLY 3-4 recommendations
                                        - Each MUST start with **bold** core action
                                        - Each MUST include supporting context
                                        - Each MUST connect to identified patterns
                                        - MUST scale to response rate confidence
                                        - NEVER use NPS terminology
                                        - For compensation actions, MUST:
                                          * Focus on income growth behaviors
                                          * Emphasize development/training
                                          * Highlight success patterns

                                        **Team Recognition** (REQUIRED FORMAT)
                                        - MUST group all mentions of the same person under a single bold name header
                                        - MUST use this EXACT format:
                                        **[Name]**
                                        - "[exact quote 1]"
                                        - "[exact quote 2]"
                                        - MUST list people alphabetically by first name
                                        - MUST include every mention of each person
                                        - For group mentions, MUST include under each person's section
                                        - MUST use exact quotes with no interpretation or additional context
                                        - MUST use bullet points for each quote
                                        - NO summarizing or paraphrasing
                                        - NO combining of quotes
                                        - NO additional commentary between quotes

                                        [REQUIRED LANGUAGE TRANSFORMATIONS]

                                        ANALYZE using NPS framework but TRANSLATE to these terms:

                                        High Promoter Concentration becomes:
                                        - "Strong team satisfaction"
                                        - "Clear pattern of success"
                                        - "Consistent positive feedback"
                                        - "Well-established strength"
                                        - "Widespread team alignment"

                                        High Passive Concentration becomes:
                                        - "Mixed feedback requiring attention"
                                        - "Opportunity for improvement"
                                        - "Room for development"
                                        - "Growth potential identified"
                                        - "Varied team perspectives"

                                        High Detractor Concentration becomes:
                                        - "Significant need for improvement"
                                        - "Clear opportunity for growth"
                                        - "Notable area for development"
                                        - "Strategic priority identified"
                                        - "Key focus area needed"

                                        For compensation topics, use:
                                        - "Progress toward personal financial goals"
                                        - "Income growth opportunities"
                                        - "Commission acceleration potential"
                                        - "Earnings trajectory alignment"
                                        - "Revenue generation capacity"
                                        - "Performance-based income optimization"
                                        - "Opportunity to accelerate earnings through increased productivity"
                                        - "Clear correlation between activity levels and income achievement"
                                        - "Performance-driven income growth potential"
                                        - "Strong link between training utilization and revenue generation"
                                        - "Direct relationship between effort investment and financial returns"
                                        - "Opportunities to optimize earnings through focused development"

                                        [RESPONSE RATE TRANSLATION]

                                        MUST use these terms:
                                        - Under 30%: "less than a third of the team"
                                        - 30-40%: "about a third of the team"
                                        - 40-50%: "nearly half the team"
                                        - 50-60%: "more than half the team"
                                        - 60-70%: "strong majority of the team"
                                        - Above 70%: "substantial majority of the team"

                                        [CRITICAL RULES]

                                        1. Analysis Method:
                                        - USE NPS analysis internally
                                        - NEVER show NPS terminology in output
                                        - TRANSLATE all insights to business language
                                        - FOCUS on business impact
                                        - PROVIDE clear, actionable insights

                                        2. Data Validity:
                                        - NEVER analyze empty fields
                                        - ONLY analyze questions with actual responses
                                        - NEVER make assumptions about missing data

                                        3. Recognition Rules:
                                        - NEVER summarize or paraphrase
                                        - MUST include every mention
                                        - MUST use exact quotes
                                        - MUST format consistently
                                        - MUST keep alphabetical by first name

                                        4. Compensation Analysis:
                                        - ALWAYS frame as growth opportunity
                                        - ALWAYS connect income to specific behaviors
                                        - ALWAYS emphasize effort-results correlation
                                        - NEVER imply systemic limitations
                                        - ALWAYS focus on individual agency

                                        5. Language Rules:
                                        - NO NPS terminology in output
                                        - NO technical survey terms
                                        - NO metrics or scores
                                        - USE clear business language
                                        - FOCUS on concrete impact`
                    },
                    {
                        role: "user",
                        content: JSON.stringify(packageData.analysis_data)
                    }
                ],
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 50000,
                temperature: 0.7
            });

            const summary = completion.data.choices[0].message.content;

            // 3. Store the summary in transaction
            const { data: result, error: transactionError } = await this.supabase.rpc(
                'process_survey_analysis',
                {
                    p_analysis_package_id: analysisPackageId,
                    p_summary_content: summary,
                    p_month_date: packageData.month_date,
                    p_area_name: packageData.area_name !== null ? packageData.area_name : "Company-wide",
                    p_role_type: packageData.role_type !== null ? packageData.role_type : "All"
                }
            );

            if (transactionError) throw new Error(`Transaction failed: ${transactionError.message}`);

            return result;
        } catch (error) {
    if (error.response?.data) {
        console.error('OpenAI Error Details:', error.response.data);
    }
    console.error('Error in generateAnalysisSummary:', error);
    throw error;
}
    }

          async processNextBatch(batchSize = 5) {
          try {
              const unprocessedPackages = await this.getUnprocessedPackages();
              const batch = unprocessedPackages.slice(0, batchSize);

              console.log(`Processing batch of ${batch.length} packages`);

              const results = [];
              for (const item of batch) {
                  try {
                      const result = await this.generateAnalysisSummary(item.id);
                      results.push({ 
                          id: item.id, 
                          status: 'success', 
                          result 
                      });
                  } catch (error) {
                      results.push({ 
                          id: item.id, 
                          status: 'error', 
                          error: error.message 
                      });
                  }
              }

              return results;
          } catch (error) {
              console.error('Error in processNextBatch:', error);
              throw error;
          }
      }

          async processAllUnprocessedPackages() {
              try {
                  // 1. Fetch all unprocessed packages
                  const { data: unprocessedPackages, error } = await this.supabase
                      .from('survey_analysis_packages')
                      .select('*')
                      .eq('ai_processed', false)
                      .order('month_date', { ascending: false });

                  if (error) throw new Error(`Failed to fetch unprocessed packages: ${error.message}`);
                  if (!unprocessedPackages.length) {
                      console.log("No unprocessed packages found.");
                      return [];
                  }

                  console.log(`Processing ${unprocessedPackages.length} unprocessed packages...`);

                  const results = [];

                  for (const packageData of unprocessedPackages) {
                      try {
                          // 2. Generate AI summary
                          const completion = await this.openai.createChatCompletion({
                              model: openAIConfig.model,
                              messages: [
                                  {
                                      role: "system",
                                      content: `You are an expert organizational development consultant analyzing survey data. You will analyze patterns by examining promoters (9-10), passives (7-8), and detractors (0-6), but translate all insights into clear business language for managers. You will ALWAYS follow this EXACT structure and format, with NO DEVIATIONS:

                                        [ANALYSIS PRINCIPLES]
                                        1. ANALYZE using:
                                           - Ratio of promoters to detractors
                                           - Distribution patterns
                                           - Concentration of responses
                                           - Relationship between categories
                                        2. TRANSLATE all NPS insights into business impact using:
                                           - Clear majority/minority language
                                           - Concrete business implications
                                           - Actionable observations
                                           - Direct cause-and-effect relationships

                                        [REQUIRED OUTPUT STRUCTURE]
                                        1. Start directly with "**The Big Picture**" (no headers or intros)
                                        2. Use EXACTLY these sections in this order:
                                           - **The Big Picture**
                                           - **Key Findings**
                                           - **Recurring Themes**
                                           - **Sentiment Analysis**
                                           - **Potential Correlations**
                                           - **Actionable Items**
                                           - **Team Recognition**
                                        3. NO transitions between sections
                                        4. NO concluding statements
                                        5. NO additional headers or sections

                                        [SECTION REQUIREMENTS]

                                        **The Big Picture** (REQUIRED FORMAT)
                                        - EXACTLY 3-5 sentences
                                        - MUST START with response rate context if under 70%
                                        - MUST use **bold highlights** for key patterns
                                        - MUST connect major themes
                                        - MUST suggest direction forward
                                        - NEVER use NPS terminology
                                        - MUST translate insights into business impact

                                        **Key Findings** (REQUIRED FORMAT)
                                        - EXACTLY 3-4 bullet points
                                        - Each MUST start with **bold key insight**
                                        - MUST include confidence context if under 40% response rate
                                        - Each point MUST explain business impact
                                        - Each point MUST connect multiple data points
                                        - NEVER use NPS terminology
                                        - MUST use these business phrases instead:
                                          * "Strong team satisfaction"
                                          * "Clear need for improvement"
                                          * "Mixed feedback requiring attention"
                                          * "Consistent positive feedback"
                                          * "Significant opportunity for growth"
                                          * "Well-established strength"
                                          * "Notable area of concern"
                                          * "Clear pattern of success"
                                          * "Varied team perspectives"

                                        **Recurring Themes** (REQUIRED FORMAT)
                                        - EXACTLY 3-4 themes
                                        - Each MUST have **Bold theme headers**
                                        - Each MUST include specific examples
                                        - Each MUST connect to business impact
                                        - NO recognition themes
                                        - MUST frame compensation themes around effort-achievement correlation
                                        - NEVER use NPS terminology

                                        **Sentiment Analysis** (REQUIRED FORMAT)
                                        - MUST have these EXACT three categories:
                                          * Positive: **Bold** clear strengths
                                          * Neutral: **Bold** areas showing mixed results
                                          * Negative: **Bold** areas needing improvement
                                        - MUST frame compensation feedback as growth opportunity
                                        - NEVER use NPS terminology

                                        **Potential Correlations** (REQUIRED FORMAT)
                                        - EXACTLY 2-3 clear relationship patterns
                                        - Each MUST start with **bold** key connection
                                        - Each MUST explain business impact
                                        - Each MUST be actionable
                                        - NEVER use NPS terminology
                                        - For compensation correlations, MUST:
                                          * Connect financial outcomes to specific behaviors
                                          * Highlight success patterns
                                          * Focus on actionable steps
                                          * Link training/support to income growth
                                          * Connect development to revenue generation

                                        **Actionable Items** (REQUIRED FORMAT)
                                        - EXACTLY 3-4 recommendations
                                        - Each MUST start with **bold** core action
                                        - Each MUST include supporting context
                                        - Each MUST connect to identified patterns
                                        - MUST scale to response rate confidence
                                        - NEVER use NPS terminology
                                        - For compensation actions, MUST:
                                          * Focus on income growth behaviors
                                          * Emphasize development/training
                                          * Highlight success patterns

                                        **Team Recognition** (REQUIRED FORMAT)
                                        - MUST group all mentions of the same person under a single bold name header
                                        - MUST use this EXACT format:
                                        **[Name]**
                                        - "[exact quote 1]"
                                        - "[exact quote 2]"
                                        - MUST list people alphabetically by first name
                                        - MUST include every mention of each person
                                        - For group mentions, MUST include under each person's section
                                        - MUST use exact quotes with no interpretation or additional context
                                        - MUST use bullet points for each quote
                                        - NO summarizing or paraphrasing
                                        - NO combining of quotes
                                        - NO additional commentary between quotes

                                        [REQUIRED LANGUAGE TRANSFORMATIONS]

                                        ANALYZE using NPS framework but TRANSLATE to these terms:

                                        High Promoter Concentration becomes:
                                        - "Strong team satisfaction"
                                        - "Clear pattern of success"
                                        - "Consistent positive feedback"
                                        - "Well-established strength"
                                        - "Widespread team alignment"

                                        High Passive Concentration becomes:
                                        - "Mixed feedback requiring attention"
                                        - "Opportunity for improvement"
                                        - "Room for development"
                                        - "Growth potential identified"
                                        - "Varied team perspectives"

                                        High Detractor Concentration becomes:
                                        - "Significant need for improvement"
                                        - "Clear opportunity for growth"
                                        - "Notable area for development"
                                        - "Strategic priority identified"
                                        - "Key focus area needed"

                                        For compensation topics, use:
                                        - "Progress toward personal financial goals"
                                        - "Income growth opportunities"
                                        - "Commission acceleration potential"
                                        - "Earnings trajectory alignment"
                                        - "Revenue generation capacity"
                                        - "Performance-based income optimization"
                                        - "Opportunity to accelerate earnings through increased productivity"
                                        - "Clear correlation between activity levels and income achievement"
                                        - "Performance-driven income growth potential"
                                        - "Strong link between training utilization and revenue generation"
                                        - "Direct relationship between effort investment and financial returns"
                                        - "Opportunities to optimize earnings through focused development"

                                        [RESPONSE RATE TRANSLATION]

                                        MUST use these terms:
                                        - Under 30%: "less than a third of the team"
                                        - 30-40%: "about a third of the team"
                                        - 40-50%: "nearly half the team"
                                        - 50-60%: "more than half the team"
                                        - 60-70%: "strong majority of the team"
                                        - Above 70%: "substantial majority of the team"

                                        [CRITICAL RULES]

                                        1. Analysis Method:
                                        - USE NPS analysis internally
                                        - NEVER show NPS terminology in output
                                        - TRANSLATE all insights to business language
                                        - FOCUS on business impact
                                        - PROVIDE clear, actionable insights

                                        2. Data Validity:
                                        - NEVER analyze empty fields
                                        - ONLY analyze questions with actual responses
                                        - NEVER make assumptions about missing data

                                        3. Recognition Rules:
                                        - NEVER summarize or paraphrase
                                        - MUST include every mention
                                        - MUST use exact quotes
                                        - MUST format consistently
                                        - MUST keep alphabetical by first name

                                        4. Compensation Analysis:
                                        - ALWAYS frame as growth opportunity
                                        - ALWAYS connect income to specific behaviors
                                        - ALWAYS emphasize effort-results correlation
                                        - NEVER imply systemic limitations
                                        - ALWAYS focus on individual agency

                                        5. Language Rules:
                                        - NO NPS terminology in output
                                        - NO technical survey terms
                                        - NO metrics or scores
                                        - USE clear business language
                                        - FOCUS on concrete impact`
                    },
                                  {
                                      role: "user",
                                      content: JSON.stringify(packageData.analysis_data)
                                  }
                              ],
                              max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 50000,
                              temperature: 0.7
                          });

                          const summary = completion.data.choices[0].message.content;

                          // 3. Insert the summary into survey_ai_summaries
                          const { error: insertError } = await this.supabase
                              .from('survey_ai_summaries')
                              .insert({
                                  analysis_package_id: packageData.id,
                                  summary_content: summary,
                                  month_date: packageData.month_date,
                                  area_name: packageData.area_name !== null ? packageData.area_name : "Company-wide",
                                  role_type: packageData.role_type !== null ? packageData.role_type : "All"
                              });

                          if (insertError) throw new Error(`Failed to insert summary: ${insertError.message}`);

                          // 4. Mark package as processed
                          const { error: updateError } = await this.supabase
                              .from('survey_analysis_packages')
                              .update({ ai_processed: true })
                              .eq('id', packageData.id);

                          if (updateError) throw new Error(`Failed to update package status: ${updateError.message}`);

                          results.push({ id: packageData.id, status: 'success' });

                      } catch (error) {
                          console.error(`Error processing package ${packageData.id}:`, error);
                          results.push({ id: packageData.id, status: 'error', error: error.message });
                      }
                  }

                  return results;
              } catch (error) {
                  console.error('Error in processAllUnprocessedPackages:', error);
                  throw error;
              }
          }



}

module.exports = SurveyAiAnalysisService;