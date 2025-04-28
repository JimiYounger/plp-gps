// src/config/airtable.js

const Airtable = require('airtable');
require('dotenv').config();

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = base;