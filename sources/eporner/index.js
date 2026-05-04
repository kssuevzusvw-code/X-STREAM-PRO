const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const axios = require('axios');
const { scraperFetch, wrapGlobalMedia, UA } = require('../../utils/helpers');

// --- Native Eporner Scraper Addon ---
router.get('/manifest.json', (req, res) => {
    res.json({ id: 'org.xstream.eporner', version: '1.0.0', name: 'Eporner Native', resources: ['catalog', 'meta', 'stream'], types: ['movie'], catalogs: [{ type: 'movie', id: 'eporner' }], idPrefixes: ['ep'] });
});

router.get([
    '/catalog/movie/:id.json',
    '/catalog/movie/:id/search=:query.json',
    '/catalog/movie/:id/skip=:skip.json',
    '/catalog/movie/:id/search=:query/skip=:skip.json'
], async (req, res) => {
    let query = req.params.query || (req.params.id && req.params.id.includes('search=') ? req.params.id.split('search=')[1] : null);
    if (query && query.endsWith('.json')) query = query.slice(0, -5);

    let skipRaw = req.params.skip || '0';
    if (skipRaw.endsWith('.json')) skipRaw = skipRaw.slice(0, -5);
    const skip = parseInt(skipRaw);
    const p = skip > 0 ? Math.floor(skip / 30) + 1 : 1;

    let htmlUrl = `https://www.eporner.com/`;
    if (query) htmlUrl = `https://www.eporner.com/search/${encodeURIComponent(query)}/${p}/`;
    else if (p > 1) htmlUrl = `https://www.eporner.com/${p}/`;

    try {
        console.log(`📡 [Eporner HTML] Fetching: ${htmlUrl}`);
        let html;
        try {
            const response = await axios.get(htmlUrl, {
                headers: { 'User-Agent': UA, 'Cookie': 'age_verified=1; bs=s;' },
                timeout: 25000
            });
            html = response.data;
        } catch (e) {
            html = await scraperFetch(htmlUrl, 25000);
        }

        const $ = cheerio.load(html);
        const results = [];

        $('.mb-2, .mb-3, .mb-4, .mb-0, .mb, [class*="video-"]').each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a[href*="/video-"]').first();
            const href = $link.attr('href');
            if (!href) return;

            const name = $el.find('img').attr('alt') || $link.attr('title') || $el.find('.title').text().trim() || "Eporner Video";
            const $img = $el.find('img');
            let poster = $img.attr('data-src') || $img.attr('src') || "";
            if (poster.startsWith('//')) poster = 'https:' + poster;

            const encodedPath = Buffer.from(href).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const duration = $el.find('.duration, .time, .mbtim').first().text().trim() || "";

            let previewUrl = "";
            if (poster) {
                const parts = poster.split('/');
                const filename = parts.pop();
                const folderName = parts.pop();
                if (folderName && !isNaN(folderName)) previewUrl = poster.replace(filename, `${folderName}-preview.mp4`);
            }

            results.push(wrapGlobalMedia({
                id: 'ep_' + encodedPath,
                type: 'movie',
                name: name.replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
                poster: poster,
                background: poster,
                preview: previewUrl,
                duration: duration
            }));
        });

        res.json({ metas: results });
    } catch (e2) {
        console.error(`❌ [Eporner HTML] Error:`, e2.message);
        res.status(500).json({ error: e2.message });
    }
});

router.get('/meta/movie/:id.json', async (req, res) => {
    try {
        let encoded = req.params.id.replace('ep_', '').replace(/-/g, '+').replace(/_/g, '/');
        if (encoded.endsWith('.json')) encoded = encoded.slice(0, -5);
        const path = Buffer.from(encoded, 'base64').toString('utf8');
        const targetUrl = `https://www.eporner.com${path}`;

        let html = await scraperFetch(targetUrl, 25000);
        const $ = cheerio.load(html);

        const title = $('title').text().replace(' - EPORNER', '').trim();
        const description = $('.video-description').text().trim();
        const poster = $('meta[property="og:image"]').attr('content') || "";

        const related = [];
        $('#relatedVids .mb, #relatedVids [class*="video-"]').each((i, el) => {
            const $rel = $(el);
            const $rLink = $rel.find('a[href*="/video-"]').first();
            const rHref = $rLink.attr('href');
            if (rHref) {
                const rEnc = Buffer.from(rHref).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                related.push(wrapGlobalMedia({
                    id: 'ep_' + rEnc,
                    type: 'movie',
                    name: $rel.find('img').attr('alt') || "Related video",
                    poster: $rel.find('img').attr('data-src') || $rel.find('img').attr('src'),
                    thumbnail: $rel.find('img').attr('data-src') || $rel.find('img').attr('src')
                }));
            }
        });

        res.json({
            meta: wrapGlobalMedia({
                id: req.params.id,
                type: 'movie',
                name: title,
                background: poster,
                description: description,
                related: related,
                url: targetUrl
            })
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/stream/movie/:id.json', async (req, res) => {
    let id = req.params.id;
    let targetUrl = "";

    // 🔐 [Safety] Clean ID
    id = id.replace('.json', '');

    // 1. Resolve target page URL from ID
    let rawId = id.split(':')[0].replace('ep_', '').replace(/-/g, '+').replace(/_/g, '/');
    if (id.startsWith('http')) {
        targetUrl = id;
    } else {
        try {
            const decoded = Buffer.from(rawId, 'base64').toString('utf8');
            targetUrl = decoded.includes('/video-') ? `https://www.eporner.com${decoded}` : `https://www.eporner.com/video-${rawId}/`;
        } catch (e) {
            targetUrl = `https://www.eporner.com/video-${rawId}/`;
        }
    }

    console.log(`📡 [Eporner Scraper] Resolving streams for: ${targetUrl}`);

    try {
        let html;
        try {
            const response = await axios.get(targetUrl, {
                headers: { 'User-Agent': UA, 'Referer': 'https://www.eporner.com/', 'Cookie': 'age_verified=1; bs=s;' },
                timeout: 10000
            });
            html = response.data;
        } catch (err) {
            html = await scraperFetch(targetUrl, 25000);
        }

        // --- EXTRACT METADATA ---
        // 1. Get Numeric ID (Strict: Must be 5+ digits to avoid short IDs like '4')
        const allNumericMatches = [
            targetUrl.match(/video-(\d{5,})/),
            html.match(/["']?vid["']?\s*[:=]\s*["']?(\d{5,})["']?/),
            html.match(/["']?id["']?\s*[:=]\s*["']?(\d{5,})["']?/),
            html.match(/["']?identifier["']?\s*[:=]\s*["']?(\d{5,})["']?/),
            html.match(/\/dload\/(\d{5,})\//),
            html.match(/id=(\d{5,})/)
        ];

        let nId = null;
        for (const m of allNumericMatches) {
            if (m && m[1]) {
                nId = m[1];
                break;
            }
        }

        // 2. Get Alphanumeric Video ID (Crucial for XHR API)
        const videoIdMatch = targetUrl.match(/video-([a-zA-Z0-9]{8,15})\//) ||
            html.match(/videoId\s*[:=]\s*["']([a-zA-Z0-9]{8,15})["']/) ||
            html.match(/["']?id["']?\s*[:=]\s*["']([a-zA-Z0-9]{8,15})["']/) ||
            html.match(/\/dload\/([a-zA-Z0-9]{8,15})\//) ||
            html.match(/\/embed\/([a-zA-Z0-9]{8,15})/) ||
            html.match(/id="v_([a-zA-Z0-9]{8,15})"/);

        let videoId = videoIdMatch ? videoIdMatch[1] : (nId || null);
        if (videoId && (videoId.length < 8 || videoId.includes('slide'))) videoId = nId;

        // 3. Get Security Hash
        const hashMatch = html.match(/hash\s*[:=]\s*["']([a-f0-9]{32})["']/i) ||
            html.match(/hash\s*[:=]\s*["']([a-z0-9]{20,})["']/i) ||
            html.match(/hash\s*[:=]\s*["']([a-z0-9]+)["']/i) ||
            html.match(/var\s+hash\s*=\s*['"]([^'"]+)['"]/);

        const videoHash = hashMatch ? hashMatch[1] : null;

        // 🔐 REVERSE ENGINEERED HASH: Convert 32-char Hex MD5 to Base36 for XHR authorization
        let finalHash = videoHash;
        if (videoHash && videoHash.length === 32 && /^[0-9a-f]+$/i.test(videoHash)) {
            try {
                const part1 = BigInt('0x' + videoHash.substring(0, 16)).toString(36).padStart(13, '0');
                const part2 = BigInt('0x' + videoHash.substring(16)).toString(36).padStart(13, '0');
                finalHash = part1 + part2;
                console.log(`🔐 [Eporner Hash] Converted Hex to Base36: ${finalHash}`);
            } catch (e) { console.error("❌ Hash Conversion Error:", e.message); }
        }

        console.log(`🔍 [Eporner Detect] nId: ${nId} | videoId: ${videoId} | hash: ${videoHash ? 'OK' : 'MISSING'}`);

        let streams = [];
        const proxyBase = `/api/stream?url=`;
        const m3u8ProxyBase = `/api/m3u8-proxy?url=`;

        // 🚀 METHOD 1: XHR API (Fallback/Fast)
        if (streams.length === 0 && videoId) {
            try {
                const xhrUrl = `https://www.eporner.com/xhr/video/${videoId}?hash=${finalHash || ''}&device=generic&domain=www.eporner.com&fallback=false&_=${Date.now()}`;
                console.log(`📡 [Eporner XHR] Fetching: ${xhrUrl}`);

                const xhrResponse = await axios.get(xhrUrl, {
                    headers: { 'User-Agent': UA, 'Referer': targetUrl, 'X-Requested-With': 'XMLHttpRequest', 'Cookie': 'age_verified=1; bs=s;' },
                    timeout: 7000
                });

                const data = xhrResponse.data;
                if (data && data.sources) {
                    const hlsBase = data.sources.hls?.src || "";

                    // --- 🔑 TOKEN EXTRACTION ---
                    let hlsParams = hlsBase.includes('?') ? hlsBase.split('?')[1] : "";

                    const expiresMatch = html.match(/expires=(\d+)/) || hlsParams.match(/expires=(\d+)/);
                    const ipMatch = html.match(/ip=([0-9\.]+)/) || hlsParams.match(/ip=([0-9\.]+)/);

                    const exp = expiresMatch ? expiresMatch[1] : (Math.floor(Date.now() / 1000) + 3600 * 5);
                    let ip = ipMatch ? ipMatch[1] : "";
                    const hash = videoHash || (hlsParams.match(/hash=([a-zA-Z0-9_-]+)/)?.[1] || "");

                    // 🚨 NEW: Fetch Public IP if missing (Only for simulation fallback)
                    if (!ip) {
                        try {
                            const ipResp = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
                            ip = ipResp.data.ip;
                            console.log(`🌐 [Eporner IP Fix] Using Server Public IP: ${ip}`);
                        } catch (e) { console.warn("⚠️ [Eporner IP Fix] Could not fetch public IP"); }
                    }

                    // Reconstruct a SOLID token for simulation fallback
                    let tokenParts = [];
                    if (hash) tokenParts.push(`hash=${hash}`);
                    if (exp) tokenParts.push(`expires=${exp}`);
                    if (ip) tokenParts.push(`ip=${ip}`);
                    if (nId) tokenParts.push(`id=${nId}`);
                    const solidToken = tokenParts.join('&');

                    // 🎯 ONLY HLS STREAMS (CDN)
                    if (hlsBase) {
                        const finalHlsUrl = hlsBase.includes('?') ? hlsBase : `${hlsBase}?${solidToken}`;

                        // Add Master Adaptive Stream
                        streams.push({
                            title: `Eporner HLS (Adaptive)`,
                            url: m3u8ProxyBase + encodeURIComponent(finalHlsUrl) + '&referer=' + encodeURIComponent(targetUrl)
                        });

                        // Attempt to generate specific qualities if we have the base pattern
                        // Example: .../12345-720p.mp4/index-v1-a1.m3u8
                        const qualities = ['2160p', '1440p', '1080p', '720p', '480p', '360p'];
                        qualities.forEach(q => {
                            if (finalHlsUrl.includes(q)) return; // Already current quality
                            const qualityUrl = finalHlsUrl.replace(/\d+p/, q);
                            streams.push({
                                title: `Eporner HLS (${q})`,
                                url: m3u8ProxyBase + encodeURIComponent(qualityUrl) + '&referer=' + encodeURIComponent(targetUrl)
                            });
                        });
                    }

                    // ⚠️ Fallback to MP4 only if no HLS was found
                    if (streams.length === 0 && data.sources && data.sources.mp4) {
                        Object.keys(data.sources.mp4).forEach(q => {
                            if (data.sources.mp4[q].src && !data.sources.mp4[q].src.includes('na.mp4')) { // 👈 Exclude fake na.mp4
                                streams.push({
                                    title: `Eporner MP4 (${q})`,
                                    url: proxyBase + encodeURIComponent(data.sources.mp4[q].src) + '&referer=' + encodeURIComponent(targetUrl)
                                });
                            }
                        });
                    }
                }
            } catch (xhrE) { console.warn("⚠️ XHR Fallback:", xhrE.message); }
        }

        // 🚀 METHOD 2: Regex Scrape (Final Fallback for older videos)
        if (streams.length === 0) {
            const dloadMatches = html.match(/\/dload\/[^"'\s<>]+/g) || [];
            [...new Set(dloadMatches)].forEach(u => {
                let q = u.includes('1080p') ? '1080p' : u.includes('720p') ? '720p' : 'SD';
                let full = u.startsWith('http') ? u : `https://www.eporner.com${u}`;
                streams.push({ title: `Eporner Direct (${q})`, url: proxyBase + encodeURIComponent(full) + '&referer=' + encodeURIComponent(targetUrl) });
            });
        }

        // Final Filter: Sort by quality and prioritize HLS
        const qMap = { '2160p': 100, '1440p': 90, '1080p': 80, '720p': 70, '480p': 60, '360p': 50, 'Adaptive': 40 };
        streams.sort((a, b) => {
            const isHlsA = a.title.includes('HLS') ? 1000 : 0;
            const isHlsB = b.title.includes('HLS') ? 1000 : 0;
            const qA = a.title.match(/\((.*?)\)/)?.[1] || 'SD';
            const qB = b.title.match(/\((.*?)\)/)?.[1] || 'SD';
            return (isHlsB + (qMap[qB] || 0)) - (isHlsA + (qMap[qA] || 0));
        });

        res.json({ streams: streams.map(s => ({ ...s, _source: { id: 'eporner', type: 'real' } })) });
    } catch (err) {
        console.error("❌ Eporner Scraper Error:", err.message);
        res.json({ streams: [] });
    }
});

module.exports = router;
