const { createClient } = require('@supabase/supabase-js');

// Check that required environment variables are set
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

// Initialize the Supabase client with service role privileges
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Create a simple test function to verify our connection
async function testConnection() {
  try {
    // Just check if we can connect to Supabase
    const { data, error } = await supabase.rpc('get_service_role');
    console.log('Successfully connected to Supabase');
    return true;
  } catch (error) {
    console.error('Failed to connect to Supabase:', error.message);
    return false;
  }
}

module.exports = {
  supabase,
  testConnection
};