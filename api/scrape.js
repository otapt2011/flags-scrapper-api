// api/scrape.js
const axios = require('axios');
const cheerio = require('cheerio');

// Build base URL from country name
function buildBaseUrl(country) {
  const safeCountry = encodeURIComponent(country);
  return `https://ozoutback.com.au/${safeCountry}/flags/`;
}

// Helper: resolve relative URLs to absolute
function resolveUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// Scrape the index page for thumbnail data
async function scrapeThumbnails(baseUrl) {
  const indexUrl = baseUrl + 'index.html';
  const { data } = await axios.get(indexUrl);
  const $ = cheerio.load(data);
  const results = [];

  $('#thumbs figure').each((i, el) => {
    const $a = $(el).find('a');
    const $img = $(el).find('img');
    results.push({
      id: i + 1,
      alt: $img.attr('alt') || '',
      slideUrl: resolveUrl($a.attr('href'), baseUrl),
      thumbnailUrl: resolveUrl($img.attr('src'), baseUrl),
    });
  });
  return results;
}

// Scrape a single slide page for full image and description
async function scrapeSlide(slideUrl) {
  try {
    const { data } = await axios.get(slideUrl);
    const $ = cheerio.load(data);

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

// Parse alt text for ruler and period
function parseAlt(alt) {
  if (!alt) return { ruler: '', period: '' };
  const lastComma = alt.lastIndexOf(',');
  if (lastComma === -1) return { ruler: alt.trim(), period: '' };
  return {
    ruler: alt.substring(0, lastComma).trim(),
    period: alt.substring(lastComma + 1).trim()
  };
}

function guessFlagColors(alt) {
  if (alt && /italian/i.test(alt)) return ['#009246', '#ffffff', '#ce2b37'];
  return ['#078930', '#fcdd09', '#da121a'];
}

function transformFlag(flag, country) {
  const { ruler, period } = parseAlt(flag.alt);
  return {
    id: flag.id,
    country,
    period,
    ruler,
    emblem: 'none',
    imageUrl: flag.fullImageUrl || '',
    imageBlob: null,
    description: flag.description || '',
    flagColors: guessFlagColors(flag.alt),
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

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { country, full, limit } = req.query;

  if (!country || !/^[a-zA-Z\s\-]+$/.test(country)) {
    return res.status(400).json({ success: false, error: 'Valid country name required (e.g., Ethiopia)' });
  }

  const baseUrl = buildBaseUrl(country);

  try {
    let flags = await scrapeThumbnails(baseUrl);
    flags.forEach(f => (f.country = country)); // inject country

    if (limit) flags = flags.slice(0, parseInt(limit));

    if (full === 'true') {
      await Promise.all(
        flags.map(async (flag) => {
          const slideData = await scrapeSlide(flag.slideUrl);
          flag.fullImageUrl = slideData.fullImageUrl;
          flag.description = slideData.description;
        })
      );
    }

    const historyFormat = flags.map(f => transformFlag(f, country));

    res.status(200).json({
      success: true,
      count: flags.length,
      flags,
      historyFormat,
    });
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
