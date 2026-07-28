const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://ozoutback.com.au/Ethiopia/flags/';
const INDEX_URL = BASE + 'index.html';

// Helper: resolve relative URLs
function resolveUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// Extract thumbnail data from the index page
async function scrapeThumbnails() {
  const { data } = await axios.get(INDEX_URL);
  const $ = cheerio.load(data);
  const results = [];

  $('#thumbs figure').each((i, el) => {
    const $a = $(el).find('a');
    const $img = $(el).find('img');
    const slideHref = $a.attr('href');
    const thumbSrc = $img.attr('src');
    const alt = $img.attr('alt') || '';

    results.push({
      id: i + 1,
      alt,
      slideUrl: resolveUrl(slideHref, BASE),
      thumbnailUrl: resolveUrl(thumbSrc, BASE),
    });
  });

  return results;
}

// Get the full‑size flag image from a slide page
async function getFullImageUrl(slideUrl) {
  try {
    const { data } = await axios.get(slideUrl);
    const $ = cheerio.load(data);
    const imgSrc = $('#flag img').attr('src');
    if (imgSrc) return resolveUrl(imgSrc, slideUrl);
  } catch (err) {
    console.error(`Failed to fetch full image from ${slideUrl}`);
  }
  return null;
}

module.exports = async (req, res) => {
  // Optional query parameter: ?full=true to also fetch full images
  const { full } = req.query;

  try {
    const flags = await scrapeThumbnails();

    if (full === 'true') {
      // Fetch full images for all flags (parallel, limited to avoid rate issues)
      const promises = flags.map(async (flag) => {
        flag.fullImageUrl = await getFullImageUrl(flag.slideUrl);
      });
      await Promise.all(promises);
    }

    res.status(200).json({ success: true, count: flags.length, flags });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
