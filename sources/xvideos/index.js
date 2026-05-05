const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const axios = require('axios');
const { scraperFetch, wrapGlobalMedia } = require('../../utils/helpers');

// --- Native XVideos Scraper Addon ---
router.get('/manifest.json', (req, res) => {
    res.json({
        id: 'org.xstream.xvideos',
        version: '1.0.0',
        name: 'XVideos Native',
        description: 'Native XVideos scraper',
        resources: ['catalog', 'meta', 'stream'],
        types: ['movie'],
        catalogs: [{ type: 'movie', id: 'xvideos', name: 'XVideos' }],
        idPrefixes: ['xv']
    });
});

router.get([
    '/catalog/movie/:id.json',
    '/catalog/movie/:id/search=:query.json',
    '/catalog/movie/:id/skip=:skip.json',
    '/catalog/movie/:id/search=:query/skip=:skip.json'
], async (req, res) => {
    let idParam = req.params.id || '';
    if (idParam.endsWith('.json')) idParam = idParam.slice(0, -5);

    let query = req.params.query || null;
    if (query && query.endsWith('.json')) query = query.slice(0, -5);

    let skipRaw = req.params.skip || '0';
    if (skipRaw.endsWith('.json')) skipRaw = skipRaw.slice(0, -5);
    const skip = parseInt(skipRaw);

    const p = skip > 0 ? Math.floor(skip / 30) : '';
    let targetUrl = p ? `https://www.xvideos3.com/new/${p}` : `https://www.xvideos3.com/new/`;

    if (query) {
        // Search uses query parameters as specified by the user
        targetUrl = `https://www.xvideos3.com/?k=${encodeURIComponent(query)}&p=${p}`;
    } else if (idParam.includes('search=')) {
        let q = idParam.split('search=')[1];
        targetUrl = `https://www.xvideos3.com/?k=${encodeURIComponent(q)}&p=${p}`;
    }

    try {
        let response;
        const axiosConfig = {
            timeout: 25000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.xvideos.com/',
                'Cookie': 'age_verified=1'
            }
        };

        try {
            response = await axios.get(targetUrl, axiosConfig);
        } catch (error) {
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
            response = await axios.get(proxyUrl, { timeout: 25000 });
        }

        const html = response.data;
        const $ = cheerio.load(html);
        const results = [];

        $('.thumb-block, .video, .frame-block').each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a[href*="/video"]').first();
            const href = $link.attr('href');
            if (!href) return;

            let name = $el.find('.title a, p.title a, .video-title a').text().trim() ||
                $el.find('a[title]').first().attr('title') ||
                $el.find('.title, p.title').text().trim() ||
                $el.find('img').attr('alt') ||
                "XVideos Video";

            if (name.length < 5 && /quality|hd|sd|playlist|favorite|video/i.test(name)) return;

            let poster = $el.find('img').attr('data-src') || $el.find('img').attr('src') || "";
            if (poster.startsWith('//')) poster = 'https:' + poster;
            poster = poster.replace('THUMBNUM', '1');

            const encodedPath = Buffer.from(href).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            let duration = $el.find('.duration, .time').text().replace(/<[^>]+>/g, '').trim();
            if (!duration) {
                const metadataText = $el.find('.metadata').text();
                const dMatch = metadataText.match(/(\d+\s*(?:min|sec|h|m|s)(?!\w))/i);
                if (dMatch) duration = dMatch[1];
            }

            let preview = $el.find('.videopv video').attr('src') || $el.attr('data-pvv') || $el.attr('data-videopv') || $el.find('img').attr('data-src-preview') || "";

            results.push(wrapGlobalMedia({
                id: 'xv_' + encodedPath,
                type: 'movie',
                name: name.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
                poster: poster,
                background: poster,
                duration: duration,
                preview: preview,
                url: href.startsWith('http') ? href : 'https://www.xvideos.com' + href
            }));
        });

        res.json({ metas: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/stream/movie/:id.json', async (req, res) => {
    const encoded = req.params.id.replace('xv_', '').replace(/-/g, '+').replace(/_/g, '/');
    const pathStr = Buffer.from(encoded, 'base64').toString('utf8');

    // Try both domains for better reliability
    const targetUrl = `https://www.xvideos3.com${pathStr}`;

    try {
        const html = await scraperFetch(targetUrl, 25000);
        let streams = [];
        const m3u8ProxyBase = `/api/m3u8-proxy?url=`;
        const mp4ProxyBase = `/api/stream?url=`;

        // Extract HLS
        const hlsMatch = html.match(/html5player\.setVideoHLS\('([^']+)'\)/);
        if (hlsMatch) {
            let hlsUrl = hlsMatch[1];
            if (hlsUrl.startsWith('//')) hlsUrl = 'https:' + hlsUrl;

            streams.push({
                title: 'XVideos HLS (Multiple Qualities) ✨',
                url: m3u8ProxyBase + encodeURIComponent(hlsUrl) + '&referer=' + encodeURIComponent(targetUrl) + '&origin=https://www.xvideos.com',
                behaviorHints: { notWebReady: false }
            });
        }

        // Extract High Quality MP4
        const highMatch = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
        if (highMatch && highMatch[1]) {
            let highUrl = highMatch[1];
            if (highUrl.startsWith('//')) highUrl = 'https:' + highUrl;
            streams.push({
                title: 'XVideos Direct (High)',
                url: mp4ProxyBase + encodeURIComponent(highUrl) + '&referer=' + encodeURIComponent(targetUrl),
                behaviorHints: { notWebReady: false }
            });
        }

        // Extract Low Quality MP4
        const lowMatch = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
        if (lowMatch && lowMatch[1]) {
            let lowUrl = lowMatch[1];
            if (lowUrl.startsWith('//')) lowUrl = 'https:' + lowUrl;
            streams.push({
                title: 'XVideos Direct (Low)',
                url: mp4ProxyBase + encodeURIComponent(lowUrl) + '&referer=' + encodeURIComponent(targetUrl),
                behaviorHints: { notWebReady: false }
            });
        }

        // Backup HLS extraction if everything above failed
        if (streams.length === 0) {
            const m3u8Matches = html.match(/https?:\/\/[^"'\s<>]+?\.m3u8(?:\?[^"'\s<>]*)?/g) || [];
            [...new Set(m3u8Matches)].forEach((u, i) => {
                streams.push({
                    title: `XVideos Backup HLS ${i + 1}`,
                    url: m3u8ProxyBase + encodeURIComponent(u) + '&referer=' + encodeURIComponent(targetUrl),
                    behaviorHints: { notWebReady: false }
                });
            });
        }

        const proxiedStreams = streams.map(item => ({ ...item, _source: { id: 'xvideos', type: 'real' } }));
        res.json({ streams: proxiedStreams });
    } catch (e) {
        console.error(`❌ [XVideos Stream Error]: ${e.message}`);
        res.json({ streams: [] });
    }
});

router.get('/meta/movie/:id.json', async (req, res) => {
    const encoded = req.params.id.replace('xv_', '').replace(/-/g, '+').replace(/_/g, '/');
    const path = Buffer.from(encoded, 'base64').toString('utf8');
    const targetUrl = `https://www.xvideos.com${path}`;
    try {
        const html = await scraperFetch(targetUrl, 25000);
        const $ = cheerio.load(html);
        const related = [];

        $('.thumb-block, .video, .frame-block').each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a[href*="/video"]').first();
            const href = $link.attr('href');
            if (!href || related.length >= 40) return;

            let name = $el.find('.title a, p.title a, .video-title a').text().trim() ||
                $el.find('a[title]').first().attr('title') ||
                $el.find('.title, p.title').text().trim() ||
                $el.find('img').attr('alt') ||
                "XVideos Related";

            let poster = $el.find('img').attr('data-src') || $el.find('img').attr('src') || "";
            if (poster.startsWith('//')) poster = 'https:' + poster;
            poster = poster.replace('THUMBNUM', '1');

            const encodedPath = Buffer.from(href).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            related.push(wrapGlobalMedia({
                id: 'xv_' + encodedPath,
                type: 'movie',
                name: name.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
                poster: poster,
                background: poster,
                _source: { id: 'xvideos', type: 'real' }
            }));
        });

        const nMatch = html.match(/<title>([^<]+)<\/title>/);
        const name = nMatch ? nMatch[1].replace(' - XVIDEOS.COM', '').trim() : "XVideos Video";

        const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || html.match(/<link rel="image_src" href="([^"]+)"/);
        const mainPoster = posterMatch ? posterMatch[1] : "";

        res.json({
            meta: wrapGlobalMedia({
                id: req.params.id,
                type: 'movie',
                name: name,
                poster: mainPoster,
                background: mainPoster,
                related: related,
                url: targetUrl,
                _source: { id: 'xvideos', type: 'real' }
            })
        });
    } catch (e) {
        console.error(`❌ [XVideos Meta Error]: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
