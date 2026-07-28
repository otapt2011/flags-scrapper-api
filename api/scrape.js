// api/scrape.js
const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://ozoutback.com.au/Ethiopia/flags/';
const INDEX_URL = BASE + 'index.html';

// Helper: resolve relative URLs to absolute
function resolveUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// Scrape the index page for thumbnail data
async function scrapeThumbnails() {
  const { data } = await axios.get(INDEX_URL);
  const $ = cheerio.load(data);
  const results = [];

  $('#thumbs figure').each((i, el) => {
    const $a = $(el).find('a');
    const $img = $(el).find('img');
    results.push({
      id: i + 1,
      alt: $img.attr('alt') || '',
      slideUrl: resolveUrl($a.attr('href'), BASE),
      thumbnailUrl: resolveUrl($img.attr('src'), BASE),
    });
  });
  return results;
}

// Scrape a single slide page for full image and description
async function scrapeSlide(slideUrl) {
  try {
    const { data } = await axios.get(slideUrl);
    const $ = cheerio.load(data);

    // Main flag image: <img class="mainImage" src="03_eth1875.gif">
    const mainImgSrc = $('img.mainImage').attr('src');
    const fullImageUrl = mainImgSrc ? resolveUrl(mainImgSrc, slideUrl) : null;

    // Historical description: <p id="caption">...</p>
    const description = $('p#caption').text().trim();

    return { fullImageUrl, description };
  } catch (err) {
    console.error(`Failed to scrape slide: ${slideUrl}`);
    return { fullImageUrl: null, description: '' };
  }
}

module.exports = async (req, res) => {
  // CORS – allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { full, limit } = req.query;

  try {
    // 1. Get all thumbnails from the index
    let flags = await scrapeThumbnails();

    // 2. Apply limit if provided (e.g., ?limit=20)
    if (limit) {
      flags = flags.slice(0, parseInt(limit));
    }

    // 3. If full data requested, fetch each slide for image & description
    if (full === 'true') {
      const promises = flags.map(async (flag) => {
        const slideData = await scrapeSlide(flag.slideUrl);
        flag.fullImageUrl = slideData.fullImageUrl;
        flag.description = slideData.description;
      });
      await Promise.all(promises);
    }

    // 4. Return the result
    res.status(200).json({
      success: true,
      count: flags.length,
      flags,
    });
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
