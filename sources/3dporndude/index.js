const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const axios = require('axios');
const { scraperFetch, wrapGlobalMedia, UA } = require('../../utils/helpers');

// --- Native 3DPornDude Scraper Addon ---
router.get('/manifest.json', (req, res) => {
    res.json({ id: 'org.xstream.3dporndude', version: '1.0.0', name: '3DPornDude', resources: ['catalog', 'meta', 'stream'], types: ['movie'], catalogs: [{ type: 'movie', id: '3dporndude' }] });
});

router.get(['/catalog/:type/:id', '/catalog/:type/:id/skip=:skip', '/catalog/:type/:id/search=:query', '/catalog/:type/:id/search=:query/skip=:skip'], async (req, res) => {
    try {
        let query = req.params.query || (req.params.id && req.params.id.includes('search=') ? req.params.id.split('search=')[1] : null);
        if (query && query.endsWith('.json')) query = query.slice(0, -5);

        let skip = req.params.skip ? parseInt(req.params.skip) : 0;
        let pageNum = Math.floor(skip / 24) + 1;
        let url = `https://3dporndude.com/latest-updates/`;
        if (pageNum > 1) url = `https://3dporndude.com/latest-updates/${pageNum}/`;

        if (query) {
            const slug = encodeURIComponent(query.toLowerCase().trim().replace(/\s+/g, '-'));
            // Use the AJAX-friendly parameter shown in the site's data-parameters
            url = `https://3dporndude.com/search/${slug}/?from_videos=${pageNum}`;
        } else {
            // For catalog pages, the site also supports ?from_videos=N
            url = `${url}?from_videos=${pageNum}`;
        }

        let html;
        try {
            const resp = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Referer': 'https://3dporndude.com/' },
                timeout: 25000
            });
            html = resp.data;
        } catch (e) {
            html = await scraperFetch(url, 25000);
        }

        const $ = cheerio.load(html);
        const metas = [];

        $('.thumb-itm, .item, .video-item, .onevideothumb, .onevideo, .video-boxed, [class*="video-box"], [class*="thumb"], .grid-item, .list-videos > div').each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a[href*="/video/"], a[href*="/v/"], a[href*="/out/"]').first();
            const href = $link.attr('href');
            const title = $el.find('.title').first().text().trim() || $link.attr('title') || $el.find('h5, h3, .name').text().trim() || $el.find('img').attr('alt');
            let poster = $el.find('img').attr('data-webp') || $el.find('img').attr('data-src') || $el.find('img').attr('data-original') || $el.find('img').attr('src');

            if (href && title && poster && !poster.includes('clear.gif')) {
                let videoUrl = href.startsWith('http') ? href : 'https://3dporndude.com' + (href.startsWith('/') ? '' : '/') + href;
                const encId = Buffer.from(videoUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

                if (poster.startsWith('/')) poster = 'https://3dporndude.com' + poster;

                // Improved duration extraction
                const durationRaw = $el.find('.time, .duration, .video-duration').first().text().trim();
                const duration = durationRaw ? durationRaw.match(/\d+[\d:]+/) ? durationRaw.match(/\d+[\d:]+/)[0] : durationRaw : "";

                // Optional: fetch quality if available
                const quality = $el.find('.qualtiy, .quality').text().trim();
                const finalName = quality ? `[${quality}] ${title}` : title;

                const preview = $el.find('video source').attr('src') || $el.find('video').attr('src') || $el.attr('data-video-preview') || "";

                metas.push({
                    id: `3dporndude_${encId}`,
                    type: 'movie',
                    name: finalName.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim(),
                    poster: poster,
                    posterShape: 'landscape',
                    duration: duration,
                    preview: preview
                });
            }
        });

        if (metas.length === 0) {
            let blocks = html.split(/class=["'](?:thumb-itm|item|video-item|onevideothumb)[^"']*/i).slice(1);
            blocks.forEach(block => {
                const dataIdMatch = block.match(/data-id=["'](\d+)["']/);
                const hrefMatch = block.match(/href=["']((?:https:\/\/3dporndude\.com)?\/(?:out|video|v)\/[^"']+)["']/i);
                const titleMatch = block.match(/title=["']([^"']+)["']/i) || block.match(/<h5[^>]*>([^<]+)<\/h5>/i);
                const posterMatches = [block.match(/data-webp=["']([^"']+)["']/i), block.match(/data-original=["']([^"']+)["']/i), block.match(/data-src=["']([^"']+)["']/i), block.match(/src=["']([^"']+)["']/i)];
                let posterStr = '';
                for (const match of posterMatches) { if (match && match[1] && !match[1].includes('gif')) { posterStr = match[1]; break; } }
                if ((dataIdMatch || hrefMatch) && titleMatch && posterStr) {
                    let videoUrl = hrefMatch ? hrefMatch[1] : `/video/${dataIdMatch[1]}/`;
                    if (!videoUrl.startsWith('http')) videoUrl = 'https://3dporndude.com' + (videoUrl.startsWith('/') ? '' : '/') + videoUrl;
                    const encId = Buffer.from(videoUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                    posterStr = posterStr.replace(/&amp;/g, '&').trim();
                    if (posterStr.startsWith('/')) posterStr = 'https://3dporndude.com' + posterStr;
                    metas.push({ id: `3dporndude_${encId}`, type: 'anime', name: titleMatch[1].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim(), poster: posterStr, posterShape: 'landscape' });
                }
            });
        }
        const finalMetas = metas.map(item => wrapGlobalMedia({ ...item, _source: { id: '3dporndude', type: 'real' } }));
        res.json({ metas: finalMetas });
    } catch (e) { res.json({ metas: [] }); }
});

router.get(['/meta/:type/:id'], async (req, res) => {
    try {
        let rawId = req.params.id.replace('3dporndude_', '');
        if (rawId.endsWith('.json')) rawId = rawId.slice(0, -5);
        let url;
        if (rawId.length > 20) {
            const b64 = rawId.replace(/-/g, '+').replace(/_/g, '/');
            url = Buffer.from(b64, 'base64').toString('utf8');
            if (!url.startsWith('http')) url = 'https://3dporndude.com' + (url.startsWith('/') ? '' : '/') + url;
        } else {
            url = `https://3dporndude.com/video/${rawId}/`;
        }

        console.log(`📡 [3DPornDude Meta] Fetching: ${url}`);
        const html = await scraperFetch(url, 25000);
        const $ = cheerio.load(html);

        let name = $('.video-header h1, .video-header h2').text().trim() || $('title').text().replace(' - 3DPornDude', '').trim() || "3DPornDude Video";
        let description = $('.description, .video-info').text().trim() || "";
        let poster = $('meta[property="og:image"]').attr('content') || $('link[rel="image_src"]').attr('href') || "";

        const related = [];
        $('.thumb-itm, .item, .onevideothumb').slice(0, 12).each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a').first();
            const href = $link.attr('href');
            const title = $el.find('.title, h5').text().trim() || $link.attr('title');
            let p = $el.find('img').attr('data-webp') || $el.find('img').attr('src');

            if (href && title && p) {
                let vUrl = href.startsWith('http') ? href : 'https://3dporndude.com' + (href.startsWith('/') ? '' : '/') + href;
                const enc = Buffer.from(vUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                related.push({
                    id: `3dporndude_${enc}`,
                    type: 'anime',
                    name: title,
                    poster: p.startsWith('/') ? 'https://3dporndude.com' + p : p
                });
            }
        });

        res.json({
            meta: wrapGlobalMedia({
                id: req.params.id,
                type: req.params.type,
                name: name,
                description: description || "Watch premium 3D animations and SFM porn.",
                poster: poster,
                thumbnail: poster,
                background: poster,
                related: related,
                url: url
            })
        });
    } catch (e) {
        res.json({ meta: { id: req.params.id, type: req.params.type, name: "3DPornDude Video" } });
    }
});

router.get(['/stream/:type/:id'], async (req, res) => {
    try {
        let rawId = req.params.id.replace('3dporndude_', '');
        if (rawId.endsWith('.json')) rawId = rawId.slice(0, -5);

        let url;
        if (rawId.length > 20) {
            const b64 = rawId.replace(/-/g, '+').replace(/_/g, '/');
            url = Buffer.from(b64, 'base64').toString('utf8');
            if (!url.startsWith('http')) url = 'https://3dporndude.com' + (url.startsWith('/') ? '' : '/') + url;
        } else {
            console.log(`[3DPornDude] Legacy ID detected: ${rawId}. Attempting to recover slug via embed page...`);
            try {
                const embedResp = await axios.get(`https://3dporndude.com/embed/${rawId}`, { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                const canonicalMatch = embedResp.data.match(/<link href=["']([^"']+)["'] rel=["']canonical["']/i);
                if (canonicalMatch) {
                    url = canonicalMatch[1];
                    console.log(`[3DPornDude] Recovered URL: ${url}`);
                } else {
                    url = `https://3dporndude.com/video/${rawId}/`;
                }
            } catch (e) {
                console.log(`[3DPornDude] Recover failed, using fallback: ${e.message}`);
                url = `https://3dporndude.com/video/${rawId}/`;
            }
        }

        console.log(`[3DPornDude] Resolving Stream: ${url}`);

        let html;
        const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://3dporndude.com/',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        try {
            console.log(`[3DPornDude] Fetching Page: ${url}`);
            const resp = await axios.get(url, {
                headers: browserHeaders,
                timeout: 25000,
                maxRedirects: 5
            });
            html = resp.data;
        } catch (e) {
            console.log(`[3DPornDude] Direct stream fetch failed, trying proxy...`);
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const resp = await axios.get(proxyUrl, { timeout: 20000 });
            html = resp.data;
        }

        const streams = [];

        const findStreams = async (pageHtml, depth = 0) => {
            if (depth > 2) return;

            const patterns = [
                /video_url:\s*['"]([^'"]+)['"]/gi,
                /video_alt_url:\s*['"]([^'"]+)['"]/gi,
                /video_alt_url2:\s*['"]([^'"]+)['"]/gi,
                /video_alt_url3:\s*['"]([^'"]+)['"]/gi,
                /video_url_(\d+p):\s*['"]([^'"]+)['"]/gi,
                /['"]([^'"]+\/get_file\/[^'"]+)['"]/gi
            ];

            patterns.forEach(p => {
                const matches = pageHtml.matchAll(p);
                for (const m of matches) {
                    let u = m[1] || m[0];
                    if (u.startsWith("'") || u.startsWith('"')) u = u.substring(1, u.length - 1);

                    let quality = 'SD';
                    const fullMatch = m[0];
                    if (fullMatch.includes('video_alt_url3')) quality = '4K';
                    else if (fullMatch.includes('video_alt_url2')) quality = '1080p';
                    else if (fullMatch.includes('video_alt_url')) quality = '720p';
                    else if (fullMatch.includes('video_url_1080p')) quality = '1080p';
                    else if (fullMatch.includes('video_url_720p')) quality = '720p';
                    else if (u.includes('_1080p')) quality = '1080p';
                    else if (u.includes('_720p')) quality = '720p';
                    else if (u.includes('_4k')) quality = '4K';

                    u = u.replace(/&amp;/g, '&').replace(/\\/g, '').trim();
                    if (!u.startsWith('http')) continue;

                    const streamId = encodeURIComponent(u);
                    if (!streams.some(s => s.url.includes(streamId))) {
                        streams.push({
                            title: `3DPornDude ${quality}`,
                            url: `http://${req.headers.host}/api/m3u8-proxy?url=${streamId}&referer=${encodeURIComponent('https://3dporndude.com/')}`,
                            isProxy: true
                        });
                    }
                }
            });

            if (streams.length === 0) {
                const iframeMatch = pageHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) {
                    let iframeUrl = iframeMatch[1];
                    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
                    console.log(`[3DPornDude] Following iframe: ${iframeUrl}`);
                    try {
                        const ifResp = await axios.get(iframeUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': url }, timeout: 25000 });
                        await findStreams(ifResp.data, depth + 1);
                    } catch (e) { }
                }
            }
        };

        await findStreams(html);

        const uniqueStreams = [];
        const seen = new Set();
        streams.forEach(s => {
            if (!seen.has(s.url)) {
                seen.add(s.url);
                uniqueStreams.push(s);
            }
        });

        res.json({ streams: uniqueStreams });
    } catch (e) {
        console.error("3DPornDude Stream Error:", e.message);
        res.json({ streams: [] });
    }
});

module.exports = router;
