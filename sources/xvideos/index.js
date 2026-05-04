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

    const p = skip > 0 ? Math.floor(skip / 30) + 1 : 1;
    let targetUrl = p > 1 ? `https://www.xvideos3.com/new/${p}` : `https://www.xvideos3.com/`;

    if (query) {
        targetUrl = `https://www.xvideos3.com/?k=${encodeURIComponent(query)}&p=${p}`;
    } else if (idParam.includes('search=')) {
        let q = idParam.split('search=')[1];
        targetUrl = `https://www.xvideos3.com/?k=${encodeURIComponent(q)}&p=${p}`;
    }

    try {
        let response;
        const axiosConfig = {
            timeout: 25000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        };

        try {
            response = await axios.get(targetUrl, axiosConfig);
        } catch (error) {
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
            response = await axios.get(proxyUrl, { timeout: 25000 });
        }

        const html = response.data;
        const results = [];

        const blocks = html.split('class="frame-block thumb-block');
        blocks.slice(1).forEach(block => {
            try {
                const idMatch = block.match(/data-videoid="([^"]+)"/);
                const urlMatch = block.match(/href="([^"]+)"/);
                const posterMatch = block.match(/data-src="([^"]+)"/);

                const titles = [...block.matchAll(/title="([^"]+)"/g)].map(m => m[1]);
                const filteredTitles = titles.filter(t => t.length > 5 && !/Quality|HD|SD|4K|720p|1080p|Video|Flash/i.test(t));
                let encodedTitle = filteredTitles.length > 0 ? filteredTitles.sort((a, b) => b.length - a.length)[0] : (titles.find(t => t.length > 2) || "XVideos Movie");
                encodedTitle = encodedTitle.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

                const previewMatch = block.match(/https?:\/\/[^"']+\/preview\.mp4/) || block.match(/data-pvv="([^"]+)"/) || block.match(/data-vpvv="([^"]+)"/);

                if (urlMatch && posterMatch) {
                    const encodedPath = Buffer.from(urlMatch[1]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                    const poster = posterMatch[1].replace('THUMBNUM', '1');

                    const durationMatch = block.match(/<span class="duration">([^<]+)<\/span>/);
                    const duration = durationMatch ? durationMatch[1].trim() : "";

                    let preview = previewMatch ? (Array.isArray(previewMatch) ? previewMatch[0] : previewMatch) : '';

                    if (!preview && poster) {
                        let pBase = poster.split('/').slice(0, -1).join('/');
                        if (pBase.startsWith('http:')) pBase = pBase.replace('http:', 'https:');
                        if (pBase.includes('xnxx-cdn.com') || pBase.includes('xvideos-cdn.com') || pBase.includes('img-hw') || pBase.includes('ncdn') || pBase.includes('xv-cdn') || pBase.includes('xn-cdn')) {
                            preview = `${pBase}/preview.mp4`;
                        }
                    }

                    results.push(wrapGlobalMedia({
                        id: 'xv_' + encodedPath,
                        type: 'movie',
                        name: encodedTitle,
                        poster: poster,
                        background: poster,
                        duration: duration,
                        preview: preview
                    }));
                }
            } catch (e) { }
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
        if (!html) throw new Error('Empty response from XVideos');

        const related = [];
        let blocks = html.split(/class="frame-block thumb-block\s*"/);
        if (blocks.length <= 1) blocks = html.split(/class="thumb-block\s*"/);
        if (blocks.length <= 1) blocks = html.split('id="video_');

        blocks.slice(1, 40).forEach(block => {
            try {
                const urlMatch = block.match(/href="([^"]+)"/);
                const posterMatch = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/);
                const titleMatch = block.match(/title="([^"]+)"/) || block.match(/alt="([^"]+)"/);

                if (urlMatch && posterMatch && titleMatch) {
                    const enc = Buffer.from(urlMatch[1]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                    related.push(wrapGlobalMedia({
                        id: 'xv_' + enc,
                        type: 'movie',
                        name: titleMatch[1].replace(/&quot;/g, '"'),
                        poster: posterMatch[1].replace('THUMBNUM', '1'),
                        background: posterMatch[1].replace('THUMBNUM', '1')
                    }));
                }
            } catch (e) { }
        });

        const nMatch = html.match(/<title>([^<]+)<\/title>/);
        const name = nMatch ? nMatch[1].replace(' - XVIDEOS.COM', '').trim() : "XVideos Video";

        const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || html.match(/<link rel="image_src" href="([^"]+)"/);
        const poster = posterMatch ? posterMatch[1] : "";

        res.json({
            meta: wrapGlobalMedia({
                id: req.params.id,
                type: 'movie',
                name: name,
                poster: poster,
                background: poster,
                related: related,
                url: targetUrl
            })
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
