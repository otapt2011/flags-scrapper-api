// api/image-proxy.js
const axios = require('axios');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing ?url parameter' });
  }

  // Basic validation: only allow URLs starting with http(s)
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        // Some servers require a user-agent
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
      },
    });

    // Set content-type from original response, default to image/gif
    const contentType = response.headers['content-type'] || 'image/gif';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(response.data, 'binary'));
  } catch (err) {
    console.error('Image proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
};
