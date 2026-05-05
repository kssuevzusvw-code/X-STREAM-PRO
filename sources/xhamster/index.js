const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const axios = require('axios');
const { scraperFetch, wrapGlobalMedia, UA } = require('../../utils/helpers');

// --- Native XHamster Scraper Addon ---
router.get('/manifest.json', (req, res) => {
    res.json({ id: 'org.xstream.xhamster', version: '1.0.0', name: 'XHamster Native', resources: ['catalog', 'meta', 'stream'], types: ['movie'], catalogs: [{ type: 'movie', id: 'xhamster', name: 'XHamster Trending' }], idPrefixes: ['xh'] });
});

router.get([
    '/catalog/:type/:id.json',
    '/catalog/:type/:id/search=:query.json',
    '/catalog/:type/:id/skip=:skip.json',
    '/catalog/:type/:id/search=:query/skip=:skip.json'
], async (req, res) => {
    let query = req.params.query || (req.params.id && req.params.id.includes('search=') ? req.params.id.split('search=')[1] : null);
    if (query && query.endsWith('.json')) query = query.slice(0, -5);

    let skipRaw = req.params.skip || '0';
    if (skipRaw.endsWith('.json')) skipRaw = skipRaw.slice(0, -5);
    const skip = parseInt(skipRaw);

    const p = skip > 0 ? Math.floor(skip / 30) + 1 : 1;

    const type = req.params.type || 'movie';
    let targetUrl = query ? `https://xhamster.com/search/${encodeURIComponent(query)}?page=${p}` : '';

    if (!targetUrl) {
        if (type === 'anime') {
            targetUrl = p > 1 ? `https://xhamster.com/categories/hentai/${p}` : `https://xhamster.com/categories/hentai`;
        } else {
            // Updated to use the native /2, /3 pattern mentioned by the user
            targetUrl = p > 1 ? `https://xhamster.com/${p}` : `https://xhamster.com/`;
        }
    }

    try {
        console.log(`📡 [XHamster Catalog] Fetching: ${targetUrl}`);
        const html = await scraperFetch(targetUrl, 15000, {
            'Cookie': 'age_verified=1; bs=s; R_v=1; perp=1; _ym_isad=1;',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });
        const resultsMap = new Map();

        const stateMatch = html.match(/window\._?initials\s*=\s*({.+?});/s);
        if (stateMatch) {
            try {
                const data = JSON.parse(stateMatch[1]);
                const findVideoThumbProps = (obj) => {
                    const results = [];
                    const stack = [obj];
                    const seen = new Set();
                    while (stack.length > 0) {
                        const current = stack.pop();
                        if (!current || typeof current !== 'object' || seen.has(current)) continue;
                        seen.add(current);
                        if (current.videoThumbProps) {
                            results.push(current.videoThumbProps);
                        } else if ((current.video_id || current.videoId || current.id) && (current.title || current.name)) {
                            results.push(current);
                        }
                        for (const key in current) {
                            try {
                                if (current[key] && typeof current[key] === 'object') {
                                    stack.push(current[key]);
                                }
                            } catch (e) { }
                        }
                    }
                    return results;
                };

                const vids = findVideoThumbProps(data);
                console.log(`📡 [XHamster] Found ${vids.length} potential items in JSON`);

                vids.forEach(v => {
                    let videoId = "";
                    if (v.pageURL) {
                        const parts = v.pageURL.split('/');
                        videoId = parts[parts.length - 1];
                    }

                    if (!videoId || videoId.match(/^[0-9]+$/)) {
                        videoId = v.slug || v.urlName || v.url_name || v.id || v.videoId || "";
                    }

                    if (!videoId) return;

                    const title = v.title || v.name || "";

                    const posterCandidates = [
                        v.hugeThumb, v.huge_thumb, v.largeThumb, v.large_thumb, v.mainThumb, v.main_thumb,
                        v.thumb, v.thumbnail, v.thumbURL, v.thumb_url, v.imageURL, v.image_url,
                        v.image, v.previewThumbURL, v.preview_thumb_url, v.poster, v.background
                    ];

                    const isVideoUrl = (url) => typeof url === 'string' && url.match(/\.(mp4|webm|mov|avi|m3u8|ts)(\?.*)?$/i);
                    const isImageUrl = (url) => typeof url === 'string' && (
                        url.match(/\.(jpg|jpeg|png|webp|gif|svg|avif)/i) ||
                        url.includes(',webp') || url.includes(',jpg') || url.includes('/s(') || url.includes('xhcdn.com')
                    );

                    const poster = posterCandidates.find(url => url && isImageUrl(url) && !isVideoUrl(url)) || "";
                    let finalPoster = poster;
                    if (finalPoster.startsWith('//')) finalPoster = 'https:' + finalPoster;

                    const preview = v.trailerFallbackUrl || v.trailerURL || v.previewThumbURL || v.previewUrl || v.preview_url || "";

                    let duration = (v.duration || v.length || "").toString();
                    if (duration && !duration.includes(':') && !isNaN(duration)) {
                        const sec = parseInt(duration);
                        const mins = Math.floor(sec / 60);
                        const secs = sec % 60;
                        duration = `${mins}:${secs.toString().padStart(2, '0')}`;
                    }

                    resultsMap.set(videoId, {
                        id: 'xh_' + videoId,
                        type: req.params.type || 'movie',
                        name: title || "XHamster Video",
                        poster: finalPoster || "",
                        background: finalPoster || "",
                        duration: duration,
                        preview: preview
                    });
                });
            } catch (e) {
                console.warn("⚠️ [XHamster] Failed to parse initials JSON", e.message);
            }
        }

        resultsMap.forEach((val, key) => {
            if (!val.poster || val.poster.length < 5) resultsMap.delete(key);
        });

        if (resultsMap.size < 10) {
            const $ = cheerio.load(html);
            $('.video-thumb, .thumb-list__item, .video-thumb__image-container').each((i, el) => {
                const $el = $(el);

                const $link = $el.is('a') ? $el : $el.find('a[href*="/videos/"]').first();
                const href = $link.attr('href');
                if (!href) return;

                let id = $el.attr('data-video-id');
                if (!id) {
                    const numMatch = href.match(/-video-([0-9]+)$/) || href.match(/video-([0-9]+)$/);
                    if (numMatch) id = numMatch[1];
                }
                if (!id) {
                    const slugMatch = href.match(/-xh([a-zA-Z0-9]+)$/) || href.match(/\/videos\/[^-]+-([a-zA-Z0-9]+)$/);
                    if (slugMatch) id = slugMatch[1];
                }

                if (!id) return;

                let name = $link.attr('aria-label') || $link.attr('title') || $el.find('img').attr('alt');
                if (!name) {
                    name = $el.find('.video-thumb-info__name').text().trim() ||
                        $el.find('.thumb-image-container__image').attr('alt') ||
                        $link.text().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                }
                if (name) name = name.replace(/\d+:\d+$/, '').trim();
                if (!name || name.length < 3) name = "XHamster Video";

                const isVideoUrl = (url) => typeof url === 'string' && url.match(/\.(mp4|webm|mov|avi|m3u8|ts)(\?.*)?$/i);
                const isImageUrl = (url) => typeof url === 'string' && (
                    url.match(/\.(jpg|jpeg|png|webp|gif|svg|avif)([.\?].*)?$/i) ||
                    url.includes(',webp') || url.includes(',jpg') || url.includes(',jpeg') || url.includes('/s(')
                );

                let poster = "";
                const previewImg = $el.find('img[data-role="thumb-preview-img"], img.thumb-image-container__image, img.video-thumb__image, .video-thumb-image img, img.thumb').first();
                if (previewImg.length > 0) {
                    const srcset = previewImg.attr('srcset') || previewImg.attr('data-srcset');
                    const src = previewImg.attr('src') || previewImg.attr('data-src');
                    if (srcset) {
                        const candidate = srcset.trim().split(/\s+/)[0].replace(/,$/, '');
                        if (isImageUrl(candidate) && !isVideoUrl(candidate)) poster = candidate;
                    }
                    if (!poster && src && isImageUrl(src) && !isVideoUrl(src)) {
                        poster = src;
                    }
                }

                if (!poster) {
                    $el.find('img').each((i, imgEl) => {
                        if (poster) return;
                        const $img = $(imgEl);
                        const src = $img.attr('src');
                        const dataSrc = $img.attr('data-src');
                        const srcset = $img.attr('srcset') || $img.attr('data-srcset');

                        let candidate = "";
                        if (srcset) {
                            candidate = srcset.trim().split(/\s+/)[0].replace(/,$/, '');
                        } else if (dataSrc && isImageUrl(dataSrc) && !dataSrc.includes('clear.gif')) {
                            candidate = dataSrc;
                        } else if (src && isImageUrl(src) && !src.includes('clear.gif')) {
                            candidate = src;
                        }

                        if (candidate && isImageUrl(candidate) && !isVideoUrl(candidate)) {
                            poster = candidate;
                        }
                    });
                }

                if (!poster) {
                    $el.find('*').each((i, subEl) => {
                        if (poster) return;
                        const attribs = subEl.attribs || {};
                        for (const attr in attribs) {
                            const val = attribs[attr];
                            if (typeof val === 'string') {
                                if (isImageUrl(val) && !val.includes('clear.gif') && val.length > 10) {
                                    poster = val.startsWith('//') ? 'https:' + val : val;
                                    break;
                                }
                                if (attr === 'style' && val.includes('url(')) {
                                    const match = val.match(/url\(['"]?([^'"]+?)['"]?\)/);
                                    if (match && isImageUrl(match[1])) {
                                        poster = match[1].startsWith('//') ? 'https:' + match[1] : match[1];
                                        break;
                                    }
                                }
                            }
                        }
                    });
                }

                if (!poster) {
                    const anyImg = $el.find('img').first();
                    const anySrc = anyImg.attr('src') || anyImg.attr('data-src');
                    if (anySrc && !isVideoUrl(anySrc) && anySrc.length > 10) {
                        poster = anySrc;
                    }
                }

                if (!poster) {
                    const elAttribs = el.attribs || {};
                    for (const attr in elAttribs) {
                        const val = elAttribs[attr];
                        if (typeof val === 'string' && isImageUrl(val) && !val.includes('clear.gif') && val.length > 10) {
                            poster = val.startsWith('//') ? 'https:' + val : val;
                            break;
                        }
                    }
                }

                if (poster && poster.startsWith('//')) poster = 'https:' + poster;

                const preview = $el.attr('data-previewvideo') ||
                    $el.find('[data-previewvideo]').attr('data-previewvideo') ||
                    $el.find('video').attr('src') || "";

                if (!poster && preview && preview.includes('xhcdn.com')) {
                    const pathMatch = preview.match(/(\/[0-9]+\/[0-9]+\/[0-9]+\/)/);
                    if (pathMatch) {
                        const segment = pathMatch[1];
                        const regex = new RegExp('"([^"]+?' + segment.replace(/\//g, '\\/') + '[^"]+?\\.(?:webp|jpg|jpeg)[^"]*?)"', 'g');
                        let m;
                        while ((m = regex.exec(html)) !== null) {
                            if (isImageUrl(m[1])) {
                                poster = m[1].startsWith('//') ? 'https:' + m[1] : m[1];
                                break;
                            }
                        }
                    }
                }

                if (!poster && id && id.match(/^[0-9]+$/)) {
                    const searchPattern = new RegExp('"([^"]+?\\/' + id.substring(0, 3) + '\\/' + id.substring(3, 6) + '\\/' + id.substring(6) + '[^"]+?\\.(?:webp|jpg|jpeg)[^"]*?)"', 'i');
                    const match = html.match(searchPattern);
                    if (match && isImageUrl(match[1])) {
                        poster = match[1].startsWith('//') ? 'https:' + match[1] : match[1];
                    }
                }

                const duration = $el.find('[class^="tiny-"], [class*=" tiny-"], [data-role="video-duration"]').first().text().trim() ||
                    $el.find('.thumb-image-container__duration').text().trim() ||
                    $el.find('.video-thumb__duration').text().trim() || "";

                if (!id && href) {
                    const match = href.match(/videos\/([^/?#]+)/);
                    if (match) id = match[1];
                }

                if (!id || !href) return;
                if (!name) name = "XHamster Video";

                if (resultsMap.has(id)) {
                    const existing = resultsMap.get(id);
                    if (existing.poster && !poster) return;
                }

                resultsMap.set(id, {
                    id: 'xh_' + id,
                    type: req.params.type || 'movie',
                    name: name,
                    poster: poster || "",
                    background: poster || "",
                    duration: duration || "",
                    preview: preview || "",
                    url: href
                });
            });
        }

        const metas = Array.from(resultsMap.values()).map(m => ({
            ...m,
            name: (m.name || "XHamster Video").replace(/<[^>]*>?/gm, '').trim()
        }));

        res.json({ metas: metas.map(m => wrapGlobalMedia({ ...m, _source: { id: 'xhamster', type: 'real' } })) });
    } catch (e) {
        console.error(`❌ [XHamster Catalog] Error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

router.get('/meta/:type/:id.json', async (req, res) => {
    let xhId = req.params.id.replace('xh_', '').replace('.json', '');
    const targetUrl = `https://xhamster.com/videos/${xhId}`;

    try {
        console.log(`📡 [XHamster Meta] Fetching: ${targetUrl}`);
        const html = await scraperFetch(targetUrl, 25000, { 'Cookie': 'age_verified=1; bs=s;' });
        const $ = cheerio.load(html);

        const name = $('title').text().replace(' - xHamster', '').trim() || "XHamster Video";
        const ogImage = $('meta[property="og:image"]').attr('content') || "";

        const isVideoUrl = (url) => typeof url === 'string' && url.match(/\.(mp4|webm|mov|avi)(\?.*)?$/i);
        let poster = isVideoUrl(ogImage) ? "" : ogImage;

        const related = [];
        const stateMatch = html.match(/window\._?initials\s*=\s*({.+?});/s);
        if (stateMatch) {
            try {
                const data = JSON.parse(stateMatch[1]);
                const findRelated = (obj) => {
                    if (!obj || typeof obj !== 'object') return [];
                    if (obj.videoThumbProps) return [obj.videoThumbProps];
                    let list = [];
                    for (const key in obj) {
                        list = list.concat(findRelated(obj[key]));
                    }
                    return list;
                };
                const vids = findRelated(data);

                if (!poster && data.videoModel) {
                    const vm = data.videoModel;
                    const p = [vm.hugeThumb, vm.huge_thumb, vm.mainThumb, vm.main_thumb, vm.thumb, vm.thumbURL, vm.thumb_url].find(url => url && !isVideoUrl(url));
                    if (p) poster = p;
                }

                vids.slice(0, 30).forEach(v => {
                    const rId = v.id || v.videoId || v.video_id;
                    if (!rId || rId === xhId) return;

                    const rTitle = v.title || v.name || v.label || "";
                    const rPoster = [v.hugeThumb, v.huge_thumb, v.largeThumb, v.large_thumb, v.mainThumb, v.main_thumb, v.thumb, v.thumbURL, v.thumb_url, v.imageURL, v.image_url, v.previewThumbURL].find(p => p && !isVideoUrl(p)) || "";

                    related.push(wrapGlobalMedia({
                        id: 'xh_' + rId,
                        type: req.params.type || 'movie',
                        name: rTitle.replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() || "XHamster Video",
                        poster: rPoster,
                        background: rPoster
                    }));
                });
            } catch (e) {
                console.warn("⚠️ [XHamster Meta] JSON parse error:", e.message);
            }
        }

        res.json({
            meta: wrapGlobalMedia({
                id: req.params.id,
                type: req.params.type || 'movie',
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

router.get('/stream/movie/:id.json', async (req, res) => {
    let xhId = req.params.id.replace('xh_', '').replace('.json', '');
    const targetUrl = `https://xhamster.com/videos/${xhId}`;

    try {
        let html = await scraperFetch(targetUrl, 15000, { 'Cookie': 'age_verified=1; bs=s;' });
        let streams = [];
        const proxyBase = `http://${req.headers.host}/api/m3u8-proxy?url=`;
        const streamProxy = `http://${req.headers.host}/api/stream?url=`;

        // 🎯 1. High-Quality Cloudflare HLS (Multi-Quality Generator)
        const cfHlsMatches = html.match(/https?:\/\/video-cf\.xhcdn\.com\/[^"'\s]+?media=hls[^"'\s]+?\.m3u8/gi);
        if (cfHlsMatches) {
            [...new Set(cfHlsMatches)].forEach(url => {
                let baseUrl = url.replace(/\\/g, '');
                
                // 🔍 Extract available qualities from the "multi=" part of the URL
                let availableQualities = ['720p']; // Default fallback
                const multiMatch = baseUrl.match(/multi=([^/]+)/);
                if (multiMatch) {
                    const qParts = multiMatch[1].match(/\d+p/g);
                    if (qParts) availableQualities = [...new Set(qParts)];
                } else {
                    // Fallback to common qualities if multi= is missing
                    availableQualities = ['2160p', '1080p', '720p', '480p', '240p'];
                }

                availableQualities.forEach(q => {
                    let finalUrl = baseUrl;
                    
                    // Replace _TPL_ or any existing quality with the target quality
                    if (finalUrl.includes('_TPL_')) {
                        finalUrl = finalUrl.replace('_TPL_', q);
                    } else {
                        // Replaces something like "720p.av1.mp4.m3u8" with "1080p.av1.mp4.m3u8"
                        finalUrl = finalUrl.replace(/\d+p(?=\.av1\.mp4\.m3u8|\.h264\.mp4\.m3u8|\.mp4\.m3u8)/, q);
                    }

                    streams.push({ 
                        title: `⭐ X-Stream Premium (${q})`, 
                        url: proxyBase + encodeURIComponent(finalUrl) + '&referer=https://xhamster.com/&origin=https://xhamster.com',
                        quality: q,
                        addon: 'XHamster'
                    });
                });
            });
        }

        // 🎯 2. JSON State Extraction with IPv6 Filtering
        const stateMatch = html.match(/window\._?initials\s*=\s*({.+?});/s);
        if (stateMatch) {
            try {
                const data = JSON.parse(stateMatch[1]);
                
                const extractDirectUrls = (obj) => {
                    const stack = [obj];
                    const seen = new Set();
                    while (stack.length > 0) {
                        const curr = stack.pop();
                        if (!curr || typeof curr !== 'object' || seen.has(curr)) continue;
                        seen.add(curr);
                        
                        for (const k in curr) {
                            const val = curr[k];
                            if (typeof val === 'string' && val.includes('http') && val.includes('.mp4')) {
                                // 🚫 FILTER: Skip IPv6-poisoned links
                                if (val.includes('data=2605') || val.includes('data=2a02') || val.includes('ip396431123')) continue;

                                if (val.includes('preview') || val.includes('trailer') || val.includes('sprite')) continue;
                                if (!val.includes('key=') && !val.includes('data=')) continue;

                                let q = 'HD';
                                if (val.includes('2160p')) q = '2160p';
                                else if (val.includes('1440p')) q = '1440p';
                                else if (val.includes('1080p')) q = '1080p';
                                else if (val.includes('720p')) q = '720p';
                                else if (val.includes('480p')) q = '480p';
                                
                                streams.push({ 
                                    title: `XHamster MP4 (${q})`, 
                                    url: `${streamProxy}${encodeURIComponent(val)}&referer=https://xhamster.com/`,
                                    quality: q,
                                    addon: 'XHamster'
                                });
                            } else if (val && typeof val === 'object') {
                                stack.push(val);
                            }
                        }
                    }
                };
                extractDirectUrls(data);
            } catch (e) { console.error("XHamster JSON Parse Error:", e); }
        }

        // 🎯 4. Final Deduplication and Sorting
        const uniqueStreams = Array.from(new Map(streams.map(item => [item.url, item])).values());
        
        // Sort: Premium first, then by quality
        const qMap = { '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'HD': 0 };
        uniqueStreams.sort((a, b) => {
            if (a.title.includes('⭐') && !b.title.includes('⭐')) return -1;
            if (!a.title.includes('⭐') && b.title.includes('⭐')) return 1;
            return (qMap[b.quality] || 0) - (qMap[a.quality] || 0);
        });

        res.json({ streams: uniqueStreams });
    } catch (e) {
        console.error("XHamster Scraper Error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
