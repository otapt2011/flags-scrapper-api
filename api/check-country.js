// api/check-country.js
const axios = require('axios');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { country } = req.query;
  if (!country || !/^[a-zA-Z\s\-]+$/.test(country)) {
    return res.status(400).json({ error: 'Valid country name required' });
  }

  const safeCountry = encodeURIComponent(country);
  const url = `https://ozoutback.com.au/${safeCountry}/flags/index.html`;

  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CountryChecker/1.0)' },
      validateStatus: () => true, // don't throw on non-2xx
    });
    res.status(200).json({
      country,
      exists: response.status >= 200 && response.status < 400,
      status: response.status,
    });
  } catch (err) {
    // Network error, timeout, DNS failure, etc.
    res.status(200).json({
      country,
      exists: false,
      status: err.code === 'ECONNABORTED' ? 'timeout' : 'error',
    });
  }
};
