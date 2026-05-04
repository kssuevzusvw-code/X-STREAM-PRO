const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const axios = require('axios');
const { scraperFetch, wrapGlobalMedia } = require('../../utils/helpers');

// --- Native XNXX Scraper Addon ---
router.get('/manifest.json', (req, res) => {
    res.json({ id: 'org.xstream.xnxx', version: '1.0.0', name: 'XNXX Native', resources: ['catalog', 'meta', 'stream'], types: ['movie'], catalogs: [{ type: 'movie', id: 'xnxx', name: 'XNXX' }], idPrefixes: ['xn'] });
});

router.get([
    '/catalog/movie/:id.json', '/catalog/movie/:id/search=:query.json', '/catalog/movie/:id/skip=:skip.json', '/catalog/movie/:id/search=:query/skip=:skip.json'
], async (req, res) => {
    let idParam = req.params.id || '';
    if (idParam.endsWith('.json')) idParam = idParam.slice(0, -5);

    let query = req.params.query || null;
    if (query && query.endsWith('.json')) query = query.slice(0, -5);

    let skipRaw = req.params.skip || '0';
    if (skipRaw.endsWith('.json')) skipRaw = skipRaw.slice(0, -5);
    const skip = parseInt(skipRaw);
    let targetUrl = skip > 0 ? `https://www.xnxx.com/search/hot/${Math.floor(skip / 30)}` : `https://www.xnxx.com/search/hot`;

    if (query) {
        targetUrl = `https://www.xnxx.com/search/${encodeURIComponent(query)}/${skip > 0 ? Math.floor(skip / 30) : ''}`.replace(/\/$/, "");
    } else if (idParam && idParam.includes('search=')) {
        let q = idParam.split('search=')[1];
        targetUrl = `https://www.xnxx.com/search/${encodeURIComponent(q)}/${skip > 0 ? Math.floor(skip / 30) : ''}`.replace(/\/$/, "");
    }

    try {
        console.log(`🌐 [XNXX Catalog] Fetching: ${targetUrl}`);
        let response;
        const axiosConfig = {
            timeout: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Referer': 'https://www.xnxx.com/',
                'Cookie': 'bs=s; age_verified=1'
            }
        };

        try {
            response = await axios.get(targetUrl, axiosConfig);
        } catch (error) {
            console.warn(`⚠️ [XNXX] Direct fetch failed, trying proxy...`);
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
            response = await axios.get(proxyUrl, { timeout: 25000 });
        }

        const html = response.data;
        const $ = cheerio.load(html);
        const results = [];

        $('.thumb-block, .video, [id^="video_"]').each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a[href*="/video-"]').first();
            const href = $link.attr('href');
            if (!href) return;

            let name = $el.find('.title a, p.title a, .video-title a').text().trim() ||
                $el.find('a[title]').first().attr('title') ||
                $el.find('.title, p.title, h3, h4').text().trim() ||
                $el.find('img').attr('alt') ||
                "XNXX Video";

            if (name.length < 5 && /quality|hd|sd|playlist|favorite|video/i.test(name)) return;

            let poster = $el.find('img').attr('data-src') || $el.find('img').attr('src') || "";
            if (poster.startsWith('//')) poster = 'https:' + poster;
            poster = poster.replace('THUMBNUM', '1');

            const videoPath = href.startsWith('/video-') ? href : (href.startsWith('http') ? new URL(href).pathname : `/video-${href}`);
            const encodedPath = Buffer.from(videoPath).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            let duration = $el.find('.duration, .time').text().replace(/<[^>]+>/g, '').trim();
            if (!duration) {
                const metadataText = $el.find('.metadata').text();
                const dMatch = metadataText.match(/(\d+\s*(?:min|sec|h)(?!\w))/);
                if (dMatch) duration = dMatch[1];
            }
            let preview = $el.attr('data-pvv') || $el.attr('data-videopv') || $el.find('img').attr('data-src-preview') || "";

            if (!preview && poster) {
                let pBase = poster.split('/').slice(0, -1).join('/');
                if (pBase.startsWith('http:')) pBase = pBase.replace('http:', 'https:');
                if (pBase.includes('xnxx-cdn.com') || pBase.includes('xvideos-cdn.com') || pBase.includes('img-hw') || pBase.includes('ncdn') || pBase.includes('xv-cdn') || pBase.includes('xn-cdn')) {
                    preview = `${pBase}/preview.mp4`;
                }
            }

            results.push({
                id: 'xn_' + encodedPath,
                type: 'movie',
                name: name.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
                poster: poster,
                background: poster,
                duration: duration,
                preview: preview,
                url: 'https://www.xnxx.com' + videoPath
            });
        });

        console.log(`✅ [XNXX] Found ${results.length} items.`);
        const finalResults = results.map(item => wrapGlobalMedia({ ...item, _source: { id: 'xnxx', type: 'real' } }));
        res.json({ metas: finalResults });
    } catch (e) {
        console.error(`❌ [XNXX Error]: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

router.get('/meta/movie/:id.json', async (req, res) => {
    const encoded = req.params.id.replace('xn_', '').replace(/-/g, '+').replace(/_/g, '/');
    const path = Buffer.from(encoded, 'base64').toString('utf8');
    const targetUrl = `https://www.xnxx.com${path}`;

    try {
        console.log(`📡 [XNXX Meta] Fetching: ${targetUrl}`);
        let response;
        try {
            response = await axios.get(targetUrl, { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' } });
        } catch (e) {
            console.warn(`⚠️ [XNXX Meta] Direct fetch failed for ${targetUrl}, trying proxy...`);
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
            response = await axios.get(proxyUrl, { timeout: 25000 });
        }
        const html = response.data;
        if (!html) throw new Error('Empty response from XNXX');

        const related = [];
        let blocks = html.split(/class="thumb-block\s*"/);
        if (blocks.length <= 1) blocks = html.split('id="video_');

        blocks.slice(1, 40).forEach(block => {
            try {
                const urlMatch = block.match(/href="\/video-([^"]+?)"/) || block.match(/href="([^"]+)"/);
                const posterMatch = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/);
                const titleMatch = block.match(/title="([^"]+)"/) || block.match(/alt="([^"]+)"/);

                if (urlMatch && posterMatch && titleMatch) {
                    const videoPath = urlMatch[1].startsWith('/video-') ? urlMatch[1] : (urlMatch[1].startsWith('http') ? new URL(urlMatch[1]).pathname : urlMatch[1]);
                    const enc = Buffer.from(videoPath).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                    related.push({
                        id: 'xn_' + enc,
                        type: 'movie',
                        name: titleMatch[1].replace(/&quot;/g, '"'),
                        poster: posterMatch[1].replace('THUMBNUM', '1'),
                        background: posterMatch[1].replace('THUMBNUM', '1')
                    });
                }
            } catch (e) { }
        });

        const nMatch = html.match(/<title>([^<]+)<\/title>/);
        const name = nMatch ? nMatch[1].replace(' - XNXX.COM', '').trim() : "XNXX Video";

        const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || html.match(/<link rel="image_src" href="([^"]+)"/);
        const poster = posterMatch ? posterMatch[1] : "";

        res.json({
            meta: wrapGlobalMedia({
                id: req.params.id,
                type: 'movie',
                name: name,
                poster: poster,
                thumbnail: poster,
                background: poster,
                related: related,
                url: targetUrl
            })
        });
    } catch (e) {
        console.error(`❌ [XNXX Meta Error]: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

router.get('/stream/movie/:id.json', async (req, res) => {
    const encoded = req.params.id.replace('xn_', '').replace(/-/g, '+').replace(/_/g, '/');
    const path = Buffer.from(encoded, 'base64').toString('utf8');
    const targetUrl = `https://www.xnxx.com${path}`;

    const axiosConfig = {
        timeout: 25000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.xnxx.com/',
            'Cookie': 'bs=s; age_verified=1'
        }
    };

    let html = null;
    try {
        console.log(`📡 [XNXX Stream] Direct fetch: ${targetUrl}`);
        const response = await axios.get(targetUrl, axiosConfig);
        html = response.data;
    } catch (e1) {
        console.warn(`⚠️ [XNXX Stream] Direct fetch failed: ${e1.message}. Trying proxy...`);
        try {
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
            const response = await axios.get(proxyUrl, { timeout: 20000 });
            html = response.data;
        } catch (e2) {
            console.error(`❌ [XNXX Stream] Proxy also failed: ${e2.message}`);
        }
    }

    let streams = [];
    if (html) {
        try {
            const proxyBase = `http://${req.headers.host}/api/m3u8-proxy?url=`;

            const hlsMatch = html.match(/html5player\.setVideoHLS\('([^']+)'\)/);
            if (hlsMatch) streams.push({ title: 'XNXX HLS (Multiple Qualities)', url: proxyBase + encodeURIComponent(hlsMatch[1]) + '&referer=https://www.xnxx.com/&origin=https://www.xnxx.com', behaviorHints: { notWebReady: false } });

            const highMatch = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
            if (highMatch && highMatch[1]) {
                streams.push({ title: 'XNXX MP4 (High)', url: proxyBase + encodeURIComponent(highMatch[1]) + '&referer=https://www.xnxx.com/&origin=https://www.xnxx.com' });
            }

            const lowMatch = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
            if (lowMatch && lowMatch[1]) {
                streams.push({ title: 'XNXX MP4 (Low)', url: proxyBase + encodeURIComponent(lowMatch[1]) + '&referer=https://www.xnxx.com/&origin=https://www.xnxx.com' });
            }

            if (streams.length === 0) {
                const m3u8Match = html.match(/['"]([^'"]+\.m3u8[^'"]*)['"]/);
                if (m3u8Match) streams.push({ title: 'XNXX HLS (alt)', url: proxyBase + encodeURIComponent(m3u8Match[1]) + '&referer=https://www.xnxx.com/&origin=https://www.xnxx.com' });
            }
        } catch (parseErr) {
            console.error(`❌ [XNXX Stream] Parse error: ${parseErr.message}`);
        }
    }

    if (streams.length === 0) {
        const vidIdMatch = path.match(/\/video-([^/]+)/);
        const embedId = vidIdMatch ? vidIdMatch[1] : path.split('/')[1];
        streams.push({
            title: 'XNXX Official Player (Webview)',
            url: `iframe:https://www.xnxx.com/embed/${embedId}`
        });
    }

    console.log(`✅ [XNXX Stream] Found ${streams.length} streams for ${req.params.id}`);
    res.json({ streams });
});

module.exports = router;
