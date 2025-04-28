// src/config/openai-config.js

// Load environment variables from .env file
require('dotenv').config();

// Configure OpenAI settings with fallback values for optional parameters
const openAIConfig = {
    // Required API key from environment variables
    apiKey: process.env.OPENAI_API_KEY,
    
    // Optional model selection with default fallback
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    
    // Optional token limit with default fallback
    // Parse as integer since environment variables are strings
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 500
};

// Export configuration object for use in other files
module.exports = { openAIConfig };