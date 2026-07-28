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

    // Try multiple selectors to find the full flag image
    let mainImgSrc =
      $('img.mainImage').attr('src') ||
      $('#flag img').attr('src') ||
      $('div.Photo img').attr('src') ||
      $('div.fluid.Photo img').attr('src') ||
      $('a[href^="../index.html"] img').attr('src');

    const fullImageUrl = mainImgSrc ? resolveUrl(mainImgSrc, slideUrl) : null;
    const description = $('p#caption').text().trim();

    return { fullImageUrl, description };
  } catch (err) {
    console.error(`Failed to scrape slide: ${slideUrl}`);
    return { fullImageUrl: null, description: '' };
  }
}

/**
 * Parse the alt text to extract a "ruler" (state/entity) and a "period" (year/century).
 * Examples:
 *   "Ethiopian Empire, 19th Century" -> ruler: "Ethiopian Empire", period: "19th Century"
 *   "Empire of Ethiopia, 1875"       -> ruler: "Empire of Ethiopia", period: "1875"
 *   "Abyssinia, Italian East Africa, 1936" -> ruler: "Abyssinia, Italian East Africa", period: "1936"
 */
function parseAlt(alt) {
  if (!alt) return { ruler: '', period: '' };
  const lastComma = alt.lastIndexOf(',');
  if (lastComma === -1) {
    return { ruler: alt.trim(), period: '' };
  }
  const ruler = alt.substring(0, lastComma).trim();
  const period = alt.substring(lastComma + 1).trim();
  return { ruler, period };
}

/**
 * Guess flag colours based on alt text or period.
 * Default to green-yellow-red; use green-white-red for Italian occupation.
 */
function guessFlagColors(alt) {
  if (alt && /italian/i.test(alt)) {
    return ['#009246', '#ffffff', '#ce2b37'];
  }
  return ['#078930', '#fcdd09', '#da121a'];
}

// Transform scraped flag object into the flagData structure used by the history page
function transformFlag(flag) {
  const { ruler, period } = parseAlt(flag.alt);
  return {
    // Fields required by flag history page
    id: flag.id,
    period: period,
    ruler: ruler,
    emblem: 'none',
    imageUrl: flag.fullImageUrl || '',        // full image used for display
    description: flag.description || '',
    flagColors: guessFlagColors(flag.alt),

    // Extra scraped fields (kept for reference)
    slideUrl: flag.slideUrl,
    thumbnailUrl: flag.thumbnailUrl,
    fullImageUrl: flag.fullImageUrl,
    alt: flag.alt,
  };
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { full, limit } = req.query;

  try {
    let flags = await scrapeThumbnails();

    if (limit) {
      flags = flags.slice(0, parseInt(limit));
    }

    if (full === 'true') {
      const promises = flags.map(async (flag) => {
        const slideData = await scrapeSlide(flag.slideUrl);
        flag.fullImageUrl = slideData.fullImageUrl;
        flag.description = slideData.description;
      });
      await Promise.all(promises);
    }

    // Transform each flag to match the flag history page data structure
    const transformed = flags.map(transformFlag);

    res.status(200).json({
      success: true,
      count: transformed.length,
      flags: transformed,
    });
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
