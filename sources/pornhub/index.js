const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const { scraperFetch, wrapGlobalMedia, UA } = require('../../utils/helpers');

router.get('/manifest.json', (req, res) => {
    res.json({ id: 'org.xstream.pornhub', version: '1.0.0', name: 'PornHub Native', resources: ['catalog', 'meta', 'stream'], types: ['movie'], catalogs: [{ type: 'movie', id: 'pornhub' }], idPrefixes: ['ph'] });
});

router.get([
    '/catalog/movie/:id',
    '/catalog/movie/:id/search=:query',
    '/catalog/movie/:id/skip=:skip',
    '/catalog/movie/:id/search=:query/skip=:skip'
], async (req, res) => {
    let idParam = req.params.id || '';
    if (idParam.endsWith('.json')) idParam = idParam.slice(0, -5);

    let query = req.params.query || (req.params.id && req.params.id.includes('search=') ? req.params.id.split('search=')[1] : null);
    if (query && query.endsWith('.json')) query = query.slice(0, -5);

    let skipRaw = req.params.skip || '0';
    if (skipRaw.endsWith('.json')) skipRaw = skipRaw.slice(0, -5);

    let sort = req.query.sort || (req.url.includes('sort=') ? req.url.split('sort=')[1].split('&')[0] : 'mr');
    sort = sort.replace('.json', '');

    const skip = parseInt(skipRaw);
    const p = skip > 0 ? Math.floor(skip / 30) + 1 : 1;

    const normalizedQuery = (query || "").toLowerCase().trim()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const apiQuery = normalizedQuery.replace(/\s+/g, '+');
    let targetUrl = query ? `https://www.pornhub.com/video/search?search=${apiQuery}&page=${p}` : (skip > 0 ? `https://www.pornhub.com/video?page=${p}` : `https://www.pornhub.com/`);

    try {
        const html = await scraperFetch(targetUrl, 25000);
        if (!html || html.length < 500) return res.json({ metas: [] });

        const $ = cheerio.load(html);
        const results = [];

        $('li.pcVideoListItem, .videoblock, [data-video-vkey]:not([data-video-vkey] [data-video-vkey])').each((i, el) => {
            const $item = $(el);
            let phId = $item.attr('data-video-vkey') || $item.attr('data-vkey') || $item.attr('data-video-id');

            if (!phId) {
                const $child = $item.find('[data-video-vkey], [data-vkey]').first();
                phId = $child.attr('data-video-vkey') || $child.attr('data-vkey');
            }

            if (!phId) {
                const href = $item.find('a[href*="viewkey="]').attr('href') || $item.attr('href');
                if (href && href.includes('viewkey=')) phId = href.split('viewkey=')[1].split('&')[0];
            }

            const finalId = 'ph' + phId;
            if (phId && !results.some(r => r.id === finalId)) {
                const $img = $item.find('img').first();
                const name = $item.attr('data-title') || $img.attr('data-title') || $item.find('.title, .thumbnailTitle').first().text().trim() || $img.attr('alt') || "Pornhub Video";

                let poster = $img.attr('data-mediumthumb') || $img.attr('data-medium-thumb') || $img.attr('src') || $img.attr('data-thumb_url');
                if (poster && poster.startsWith('//')) poster = 'https:' + poster;

                const duration = $item.find('.duration, var.duration, .time').first().text().trim() || "";
                const preview = $img.attr('data-mediabook') || $item.find('[data-mediabook]').first().attr('data-mediabook') || "";

                results.push({
                    id: finalId,
                    type: 'movie',
                    name: name.replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
                    poster: poster || "",
                    background: poster || "",
                    duration: duration,
                    preview: preview
                });
            }
        });

        const uniqueResults = [];
        const seenIds = new Set();
        results.forEach(item => {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                uniqueResults.push(item);
            }
        });

        const finalMetas = uniqueResults.map(item => wrapGlobalMedia({ ...item, _source: { id: 'pornhub', type: 'real' } }));
        res.json({ metas: finalMetas });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/meta/movie/:id', async (req, res) => {
    let rawId = req.params.id;
    if (rawId.endsWith('.json')) rawId = rawId.slice(0, -5);

    let phId = rawId.replace('pornhub_', '').replace('pornhub', '');
    while (phId.startsWith('ph')) phId = phId.substring(2);

    let phUrl = `https://www.pornhub.com/view_video.php?viewkey=${phId}`;

    if (phId.startsWith('_L3') || phId.startsWith('_') || phId.length > 30) {
        try {
            const encoded = phId.replace(/^_/, '');
            const decoded = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            if (decoded.includes('view_video.php')) phUrl = decoded.startsWith('http') ? decoded : 'https://www.pornhub.com' + decoded;
            else if (decoded.includes('viewkey=')) {
                const vk = decoded.split('viewkey=')[1].split('&')[0];
                phUrl = `https://www.pornhub.com/view_video.php?viewkey=${vk}`;
            }
        } catch (e) { }
    }

    try {
        const html = await scraperFetch(phUrl, 30000, {
            'Cookie': 'bs=s; age_verified=1',
            'Referer': 'https://www.pornhub.com/'
        });

        if (!html) throw new Error('Empty response from Pornhub');

        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        let name = titleMatch ? titleMatch[1].replace(' - Pornhub.com', '').replace('Pornhub.com', '').trim() : "Pornhub Video";

        const posterMatch = html.match(/"image_url"\s*:\s*"([^"]+)"/) ||
            html.match(/<picture[^>]*>\s*<source[^>]*srcset="([^"]+)"/) ||
            html.match(/class="mgp_videoPoster"[^>]*>\s*<picture[^>]*>\s*<source[^>]*srcset="([^"]+)"/) ||
            html.match(/link\s+rel="image_src"\s+href="([^"]+)"/) ||
            html.match(/meta\s+property="og:image"\s+content="([^"]+)"/) ||
            html.match(/"image":\s*"([^"]+)"/) ||
            html.match(/poster="([^"]+)"/) ||
            html.match(/thumbnailUrl":\s*"([^"]+)"/) ||
            html.match(/"spritePatterns"\s*:\s*\[\s*"([^"]+)"/);

        let poster = posterMatch ? (posterMatch[2] || posterMatch[1]).replace(/\\\//g, '/') : "";
        if (poster && poster.startsWith('//')) poster = 'https:' + poster;

        const related = [];
        try {
            const relSection = html.split('id="relatedVideos"')[1] || html;
            const blocks = relSection.split('class="phimage"');
            blocks.slice(1, 16).forEach(block => {
                const vMatch = block.match(/viewkey=([^"&]+)/);
                const tMatch = block.match(/title="([^"]+)"/);
                const pMatch = block.match(/data-thumb_url="([^"]+)"/) || block.match(/src="([^"]+)"/);
                if (vMatch && tMatch && pMatch) {
                    related.push(wrapGlobalMedia({
                        id: 'ph' + vMatch[1],
                        type: 'movie',
                        name: tMatch[1].replace(/&quot;/g, '"'),
                        poster: pMatch[1]
                    }));
                }
            });
        } catch (e) { }

        res.json({
            meta: wrapGlobalMedia({
                id: (phId.startsWith('ph') ? '' : 'ph') + phId,
                type: 'movie',
                name: name,
                description: name,
                poster: poster,
                thumbnail: poster,
                background: poster,
                related: related
            })
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/stream/movie/:id', async (req, res) => {
    let rawId = req.params.id;
    if (rawId.endsWith('.json')) rawId = rawId.slice(0, -5);

    let phId = rawId.replace('ph', '');
    let phUrl = `https://www.pornhub.com/view_video.php?viewkey=${phId}`;

    if (phId.startsWith('_L3') || phId.startsWith('_') || phId.length > 30) {
        try {
            const encoded = phId.replace(/^_/, '');
            const decoded = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            if (decoded.includes('view_video.php')) phUrl = decoded.startsWith('http') ? decoded : 'https://www.pornhub.com' + decoded;
        } catch (e) { }
    }

    try {
        const html = await scraperFetch(phUrl, 25000, {
            'Cookie': 'bs=s; age_verified=1',
            'Referer': 'https://www.pornhub.com/'
        });

        let streams = [];

        const hlsMatch = html.match(/"videoUrl":"([^"]+)"/);
        if (hlsMatch) {
            const cleanUrl = hlsMatch[1].replace(/\\\/|\\/g, '/');
            streams.push({
                title: 'PornHub HLS (Multiple Qualities)',
                url: `http://${req.headers.host}/api/m3u8-proxy?url=${encodeURIComponent(cleanUrl)}&referer=${encodeURIComponent('https://www.pornhub.com/')}&origin=${encodeURIComponent('https://www.pornhub.com')}`,
                behaviorHints: { notWebReady: false }
            });
        }

        if (streams.length === 0) {
            streams.push({
                title: 'PornHub Official Player (Webview)',
                url: `iframe:https://www.pornhub.com/embed/${phId}`
            });
        }

        console.log(`✅ [Pornhub Stream] Found ${streams.length} streams for ${phId}`);
        res.json({ streams });
    } catch (e) {
        res.json({ streams: [{ title: 'PornHub Official (Fallback)', url: `iframe:https://www.pornhub.com/embed/${phId}` }] });
    }
});

module.exports = router;
