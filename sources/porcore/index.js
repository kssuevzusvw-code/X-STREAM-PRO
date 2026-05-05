const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const axios = require('axios');
const { scraperFetch, wrapGlobalMedia, UA } = require('../../utils/helpers');

// --- Native Porcore Scraper Addon ---
router.get('/manifest.json', (req, res) => {
    res.json({
        id: 'org.xstream.porcore',
        version: '1.0.1',
        name: 'Porcore',
        resources: ['catalog', 'meta', 'stream'],
        types: ['movie'],
        catalogs: [
            { type: 'movie', id: 'porcore', name: 'Porcore Top' },
            { type: 'movie', id: 'porcore-new', name: 'Porcore Recent' }
        ]
    });
});

router.get(['/catalog/:type/:id.json', '/catalog/:type/:id/skip=:skip.json', '/catalog/:type/:id/search=:query.json', '/catalog/:type/:id/search=:query/skip=:skip.json'], async (req, res) => {
    try {
        let query = req.params.query || (req.params.id && req.params.id.includes('search=') ? req.params.id.split('search=')[1] : null);
        if (query && query.endsWith('.json')) query = query.slice(0, -5);

        let skip = req.params.skip ? parseInt(req.params.skip) : 0;
        let pageNum = Math.floor(skip / 20) + 1;

        let baseUrl = 'https://porcore.com/videos/highest-rated/';
        if (req.params.id === 'porcore-new') baseUrl = 'https://porcore.com/videos/latest-updates/';

        let html;
        let url;
        if (query) {
            console.log(`📡 [Porcore Search] GET: q=${query}, p=${pageNum}`);
            url = `https://porcore.com/?q=${encodeURIComponent(query)}&ajax=true&p=${pageNum}`;
            try {
                const resp = await axios.get(url, {
                    headers: { 'User-Agent': UA, 'Referer': 'https://porcore.com/', 'X-Requested-With': 'XMLHttpRequest' },
                    timeout: 25000
                });
                html = resp.data;
                if (!html || html.length < 200) {
                    html = await scraperFetch(url.replace('&ajax=true', ''), 25000);
                }
            } catch (e) {
                console.warn(`⚠️ [Porcore] Search failed, trying scraperFetch...`);
                html = await scraperFetch(url, 25000);
            }
        } else {
            const url = `${baseUrl}?ajax=true&p=${pageNum}`;
            console.log(`📡 [Porcore Catalog] Fetching: ${url}`);
            try {
                const resp = await axios.get(url, {
                    headers: { 'User-Agent': UA, 'Referer': 'https://porcore.com/', 'X-Requested-With': 'XMLHttpRequest' },
                    timeout: 25000
                });
                html = resp.data;
                if (!html || html.length < 500) html = await scraperFetch(url.replace('&ajax', ''), 25000);
            } catch (e) {
                html = await scraperFetch(url, 25000);
            }
        }

        let $ = cheerio.load(html);
        const metas = [];

        const items = $('#videoitems .onevideothumb, #videoitems .v-item, .onevideothumb, .v-item, .video-item, .col-video, .thumb-block').length > 0
            ? $('#videoitems .onevideothumb, #videoitems .v-item, .onevideothumb, .v-item, .video-item, .col-video, .thumb-block')
            : $('a[href*="/video/"]').closest('div');

        items.each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a[href*="/video/"]').first();
            const href = $link.attr('href') || "";
            const idMatch = href.match(/\/video\/(\d+)/);
            const id = idMatch ? idMatch[1] : $el.attr('data-id');

            const title = $el.find('h5, .title, .name').text().trim() || $link.attr('title') || "Porcore Video";

            let poster = $el.find('img').attr('data-webp') ||
                $el.find('img').attr('data-src') ||
                $el.find('img').attr('data-original') ||
                $el.find('img').attr('src');

            if (id && title && poster && !poster.includes('clear.gif')) {
                if (poster.startsWith('//')) poster = 'https:' + poster;
                else if (poster.startsWith('/')) poster = 'https://porcore.com' + poster;

                const duration = $el.find('.duration, .time, .video-duration, .floatlefttop').text().trim();
                const preview = $el.attr('data-preview') || $el.find('img').attr('data-preview') || "";

                metas.push({
                    id: `porcore_${id}`,
                    type: 'movie',
                    name: title.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim(),
                    poster: poster,
                    posterShape: 'landscape',
                    background: poster,
                    duration: duration,
                    preview: preview
                });
            }
        });

        if (metas.length === 0) {
            $('a[href*="/video/"]').each((i, el) => {
                const $el = $(el);
                const href = $el.attr('href');
                const idMatch = href.match(/\/video\/(\d+)/);
                const $img = $el.find('img');
                const title = $el.attr('title') || $img.attr('alt');
                let poster = $img.attr('data-src') || $img.attr('src');

                if (idMatch && title && poster && !poster.includes('clear.gif')) {
                    metas.push({
                        id: `porcore_${idMatch[1]}`,
                        type: 'movie',
                        name: title.trim(),
                        poster: poster.startsWith('/') ? 'https://porcore.com' + poster : poster,
                        posterShape: 'landscape'
                    });
                }
            });
        }

        const finalMetas = metas.map(item => wrapGlobalMedia({ ...item, _source: { id: 'porcore', type: 'real' } }));
        res.json({ metas: finalMetas });
    } catch (e) {
        console.error(`❌ [Porcore Catalog] Error: ${e.message}`);
        res.json({ metas: [] });
    }
});

router.get(['/meta/:type/:id.json'], async (req, res) => {
    try {
        const fullId = req.params.id;
        const id = fullId.replace('porcore_', '');
        const url = `https://porcore.com/video/${id}/`;

        console.log(`📡 [Porcore Meta] Fetching: ${url}`);
        let html;
        try {
            const resp = await axios.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://porcore.com/' }, timeout: 25000 });
            html = resp.data;
        } catch (e) {
            html = await scraperFetch(url, 25000);
        }

        const $ = cheerio.load(html);
        const name = $('meta[property="og:title"]').attr('content') || $('.video-header h1').text().trim() || "Porcore Video";
        const poster = $('meta[property="og:image"]').attr('content') || $('link[rel="image_src"]').attr('href') || "";

        const related = [];
        $('.onevideothumb').slice(0, 16).each((i, el) => {
            const $el = $(el);
            const rid = $el.attr('data-id');
            const rtitle = $el.find('h5').text().trim() || $el.find('a').attr('title');
            let rposter = $el.find('img').attr('data-webp') || $el.find('img').attr('src');

            if (rid && rtitle && rposter) {
                related.push({
                    id: `porcore_${rid}`,
                    type: 'movie',
                    name: rtitle,
                    poster: rposter.startsWith('/') ? 'https://porcore.com' + rposter : rposter
                });
            }
        });

        res.json({
            meta: wrapGlobalMedia({
                id: fullId,
                type: 'movie',
                name: name.replace(' - Porcore', '').trim(),
                poster: poster,
                thumbnail: poster,
                background: poster,
                related: related,
                url: url
            })
        });
    } catch (e) {
        res.json({ meta: { id: req.params.id, type: 'movie', name: "Porcore Video" } });
    }
});

router.get(['/stream/:type/:id.json'], async (req, res) => {
    try {
        const id = req.params.id.replace('porcore_', '');
        const url = `https://porcore.com/video/${id}/`;

        console.log(`📡 [Porcore Stream] Resolving: ${url}`);
        let html;
        try {
            const resp = await axios.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://porcore.com/' }, timeout: 25000 });
            html = resp.data;
        } catch (e) {
            html = await scraperFetch(url, 25000);
        }

        const streams = [];
        const proxyBase = `http://${req.headers.host}/api/m3u8-proxy?url=`;

        const hlsMatches = html.match(/['"](https:[^'"]+?\.m3u8[^'"]*?)['"]/g) || [];
        const seenUrls = new Set();

        hlsMatches.forEach(match => {
            const cleanUrl = match.replace(/['"]/g, '').replace(/\\\/|\\/g, '/');
            if (!seenUrls.has(cleanUrl)) {
                seenUrls.add(cleanUrl);
                streams.push({
                    title: 'Porcore HLS',
                    url: proxyBase + encodeURIComponent(cleanUrl)
                });
            }
        });

        const fileMatch = html.match(/file\s*:\s*['"](https:[^'"]+?\.mp4[^'"]*?)['"]/);
        if (fileMatch) {
            streams.push({
                title: 'Porcore MP4',
                url: proxyBase + encodeURIComponent(fileMatch[1])
            });
        }

        console.log(`✅ [Porcore Stream] Found ${streams.length} streams`);
        res.json({ streams });
    } catch (e) {
        console.error("❌ Porcore Stream Error:", e.message);
        res.json({ streams: [] });
    }
});

module.exports = router;
