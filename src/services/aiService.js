// src/services/aiService.js
const { Configuration, OpenAIApi } = require('openai');
const { openAIConfig } = require('../config/openai-config.js');

class AIService {
    constructor() {
        // Create a configuration object with your API key
        const configuration = new Configuration({
            apiKey: openAIConfig.apiKey
        });
        
        // Initialize the OpenAI client with the configuration
        this.client = new OpenAIApi(configuration);
    }

    /**
     * Generates a summary of the provided text using OpenAI's GPT model
     * @param {string} text - The text to summarize
     * @returns {Promise<string>} The generated summary
     */
    async generateSummary(text) {
        try {
            // Call the OpenAI API to generate a summary
            const response = await this.client.createChatCompletion({
                model: openAIConfig.model,
                messages: [
                    { 
                        role: "system", 
                        content: "You are a helpful assistant that generates concise summaries."
                    },
                    {
                        role: "user",
                        content: `Please summarize the following text: ${text}`
                    }
                ],
                max_tokens: openAIConfig.maxTokens
            });

            // Extract and return the generated summary
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error generating summary:', error);
            throw new Error('Failed to generate summary');
        }
    }

    /**
     * Analyzes the sentiment of the provided text using OpenAI's GPT model
     * @param {string} text - The text to analyze
     * @returns {Promise<string>} The sentiment analysis result
     */
    async analyzeSentiment(text) {
        try {
            // Call the OpenAI API to analyze sentiment
            const response = await this.client.createChatCompletion({
                model: openAIConfig.model,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that analyzes sentiment. Respond with either POSITIVE, NEGATIVE, or NEUTRAL, followed by a brief explanation."
                    },
                    {
                        role: "user",
                        content: `Please analyze the sentiment of this text: ${text}`
                    }
                ],
                max_tokens: openAIConfig.maxTokens
            });

            // Extract and return the sentiment analysis
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error analyzing sentiment:', error);
            throw new Error('Failed to analyze sentiment');
        }
    }
}

// Export a singleton instance of the service
module.exports = new AIService();