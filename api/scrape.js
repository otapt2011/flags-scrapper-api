const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://ozoutback.com.au/Ethiopia/flags/';
const INDEX_URL = BASE + 'index.html';

function resolveUrl(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}

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

async function scrapeSlide(slideUrl) {
  try {
    const { data } = await axios.get(slideUrl);
    const $ = cheerio.load(data);

    // Large flag image
    const mainImgSrc = $('img.mainImage').attr('src');
    const fullImageUrl = mainImgSrc ? resolveUrl(mainImgSrc, slideUrl) : null;

    // Historical description
    const description = $('p#caption').text().trim();

    return { fullImageUrl, description };
  } catch (err) {
    return { fullImageUrl: null, description: '' };
  }
}

module.exports = async (req, res) => {
  const { full, limit } = req.query;

  try {
    let flags = await scrapeThumbnails();

    if (limit) {
      flags = flags.slice(0, parseInt(limit));
    }

    if (full === 'true') {
      // Fetch full image and description for all (or limited) flags
      const promises = flags.map(async (flag) => {
        const slideData = await scrapeSlide(flag.slideUrl);
        flag.fullImageUrl = slideData.fullImageUrl;
        flag.description = slideData.description;
      });
      await Promise.all(promises);
    }

    res.status(200).json({ success: true, count: flags.length, flags });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
