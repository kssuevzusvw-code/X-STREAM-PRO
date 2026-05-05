const express = require('express');
const compression = require('compression');
const axios = require('axios');
const http = require('http');
const https = require('https');
const dns = require('dns');
const { Resolver } = dns.promises;

// 🛡️ DNS Override: Bypass ISP Blocks using Secure DNS (Cloudflare & Google)
const resolver = new Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8', '8.8.4.4', '1.0.0.1']);

const customLookup = async (hostname, options, callback) => {
    try {
        // FORCE IPv4 ONLY - Never return IPv6 to avoid ENETUNREACH traps
        const addresses = await resolver.resolve4(hostname);
        if (addresses && addresses.length > 0) {
            if (options && options.all) {
                callback(null, [{ address: addresses[0], family: 4 }]);
            } else {
                callback(null, addresses[0], 4);
            }
        } else {
            dns.lookup(hostname, { ...options, family: 4 }, callback);
        }
    } catch (err) {
        // Fallback to standard lookup but force IPv4 family
        dns.lookup(hostname, { ...options, family: 4 }, callback);
    }
};

// Create global persistent agents for Keep-Alive and Custom DNS (STRICT IPv4)
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 10000, lookup: customLookup, family: 4 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 10000, rejectUnauthorized: false, lookup: customLookup, family: 4 });

// Apply custom agents globally to Axios to bypass DNS blocks everywhere
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.family = 4;

const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ffmpeg = require('fluent-ffmpeg');
let ffmpegPath = null;
let ffmpegAvailable = false;

try {
    ffmpegPath = require('ffmpeg-static');
    // Check if the binary actually exists
    const fs = require('fs');
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpegAvailable = true;
        console.log(`✅ FFmpeg found: ${ffmpegPath}`);
    } else {
        console.warn('⚠️ FFmpeg binary not found at:', ffmpegPath);
    }
} catch (e) {
    console.warn('⚠️ FFmpeg-static not available:', e.message);
}

const cheerio = require('cheerio');

const app = express();
const PORT = 3000;
const SERVER_BASE = ''; // Make relative to work on any IP

// 🌐 Startup Check: Verify VPN Connection (Force IPv4)
axios.get('https://api.ipify.org?format=json').then(res => {
    console.log(`🌍 [X-STREAM] Server is LIVE at IP: ${res.data.ip} (IPv4 Only Mode)`);
}).catch(err => {
    console.warn(`⚠️ [X-STREAM] Could not verify IP. Check VPN/Internet.`);
});

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(__dirname));

// --- GLOBAL ERROR HANDLERS ---
// Prevent the server from crashing on unhandled exceptions
process.on('uncaughtException', (err) => {
    console.error('🔥 [FATAL] Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});


// --- IMAGE PROXY ---
// --- IMAGE PROXY (Unified) ---
app.get('/proxy-image', (req, res) => {
    // Redirect to the newer unified proxy endpoint
    if (!req.query.url) return res.status(400).send('No URL');
    res.redirect(`/api/image-proxy?url=${encodeURIComponent(req.query.url)}`);
});

// --- DEDICATED PLAYER ROUTE ---
app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'emnphkkblegpebimobpbekeedfgemhof/player.html'));
});

// --- GLOBAL REQUEST LOGGER ---
app.use((req, res, next) => {
    // Only log API and page requests, keep images quiet to avoid console flood
    if (!req.url.match(/\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|m3u8|ts)$/) && !req.url.includes('image-proxy')) {
        console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    }
    next();
});

// --- 🎌 HANIME ADDON RELAY (NATIVE PROXY) 🎌 ---
const hanimeAddonPath = path.join(__dirname, 'hanime-stremio-main');
const hanimeConfig = require(path.join(hanimeAddonPath, 'lib', 'config'));
const HanimeApiClient = require(path.join(hanimeAddonPath, 'lib', 'clients', 'hanime_api_client'));
const createImageProxyMiddleware = require(path.join(hanimeAddonPath, 'lib', 'middleware', 'proxy_image_middleware'));

const hanimeApiClient = new HanimeApiClient(hanimeConfig);
const hanimeProxy = createImageProxyMiddleware(hanimeConfig, hanimeApiClient);

// Use wildcard to capture EVERYTHING and parse manually to avoid Express param issues with hyphens/colons
app.use('/hanime-proxy/proxy/image/*', (req, res, next) => {
    const fullPath = req.params[0]; // This captures everything after 'image/'
    const parts = fullPath.split('/');
    
    if (parts.length >= 2) {
        // Detect which part is the type (poster/background/etc) and which is the ID
        const knownTypes = ['poster', 'background', 'thumbnail', 'logo', 'cover'];
        let type, id;
        
        if (knownTypes.includes(parts[0].toLowerCase())) {
            type = parts[0];
            id = decodeURIComponent(parts[1]);
        } else if (knownTypes.includes(parts[1].toLowerCase())) {
            id = decodeURIComponent(parts[0]);
            type = parts[1];
        } else {
            // Fallback to original assumption
            type = parts[0];
            id = decodeURIComponent(parts[1]);
        }

        req.params.type = type;
        req.params.id = id;
        console.log(`🖼️ [Hanime Smart Proxy] Detected Type: ${type} | ID: ${id}`);
        return hanimeProxy(req, res);
    }
    next();
});

// Fallback for other hanime-proxy requests
app.use('/hanime-proxy', (req, res, next) => {
    if (req.url.includes('/proxy/image/')) {
        const fullPath = req.url.split('/proxy/image/')[1];
        const parts = fullPath.split('?')[0].split('/');
        if (parts.length >= 2) {
            const knownTypes = ['poster', 'background', 'thumbnail', 'logo', 'cover'];
            if (knownTypes.includes(parts[0].toLowerCase())) {
                req.params.type = parts[0];
                req.params.id = decodeURIComponent(parts[1]);
            } else {
                req.params.id = decodeURIComponent(parts[0]);
                req.params.type = parts[1];
            }
            return hanimeProxy(req, res);
        }
    }
    res.status(404).send('Not Found');
});


const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

// Favorites Storage for caching images and preview videos
const favoritesStorageDir = path.join(__dirname, 'favorites_storage');
const favImagesDir = path.join(favoritesStorageDir, 'images');
const favPreviewsDir = path.join(favoritesStorageDir, 'previews');

if (!fs.existsSync(favoritesStorageDir)) fs.mkdirSync(favoritesStorageDir);
if (!fs.existsSync(favImagesDir)) fs.mkdirSync(favImagesDir);
if (!fs.existsSync(favPreviewsDir)) fs.mkdirSync(favPreviewsDir);

let activeDownloads = {};

/**
 * 🛠️ [ROBUST SCRAPER FETCH]
 * Central helper for all scrapers with automatic proxy fallback and session preservation.
 */
const scraperFetch = async (targetUrl, timeout = 25000, headers = {}) => {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Cache-Control': 'no-cache',
        'DNT': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    };

    const urlLower = targetUrl.toLowerCase();
    let finalUrl = targetUrl;

    if (urlLower.includes('xhamster')) {
        // Cache busting for XHamster to avoid getting IPv6 tokens from edge cache
        finalUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_rb=' + Date.now();
        defaultHeaders['Referer'] = 'https://xhamster.com/';
        defaultHeaders['Cookie'] = 'age_verified=1; bs=s;';
        // Add fake IPv4 headers to encourage IPv4 responses
        const fakeIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        defaultHeaders['X-Forwarded-For'] = fakeIp;
        defaultHeaders['X-Real-IP'] = fakeIp;
        defaultHeaders['CF-Connecting-IP'] = fakeIp;
    } else if (urlLower.includes('eporner')) {
        defaultHeaders['Referer'] = 'https://www.eporner.com/';
        defaultHeaders['Cookie'] = 'age_verified=1; bs=s;';
    } else if (urlLower.includes('xvideos')) {
        defaultHeaders['Referer'] = 'https://www.xvideos.com/';
    } else if (urlLower.includes('pornhub')) {
        defaultHeaders['Referer'] = 'https://www.pornhub.com/';
        defaultHeaders['Cookie'] = 'age_verified=1;';
    } else if (urlLower.includes('porcore')) {
        defaultHeaders['Referer'] = 'https://porcore.com/';
        defaultHeaders['X-Requested-With'] = 'XMLHttpRequest';
    }

    const finalHeaders = { ...defaultHeaders, ...headers };

    try {
        console.log(`📡 [scraperFetch] Direct: ${finalUrl.substring(0, 100)}...`);
        const fetchTimeout = urlLower.includes('eporner') ? 12000 : timeout;
        const res = await axios.get(finalUrl, {
            timeout: fetchTimeout,
            headers: finalHeaders,
            validateStatus: (status) => status < 500
        });

        // If we get blocked (403) or not found (404) directly, try proxy fallback
        if (res.status === 403 || res.status === 404) {
            throw new Error(`Direct block ${res.status}`);
        }

        return res.data;
    } catch (e) {
        // Optimization: Never use external proxies for localhost
        if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
            console.error(`❌ [scraperFetch] Internal Loopback Error: ${e.message}`);
            throw e;
        }

        console.warn(`⚠️ [scraperFetch] Direct failed: ${e.message}. Trying primary proxy...`);
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            const res = await axios.get(proxyUrl, { timeout: timeout + 5000 });
            return res.data;
        } catch (e2) {
            console.warn(`⚠️ [scraperFetch] Proxy 1 failed: ${e2.message}. Trying backup proxy 2...`);
            try {
                const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
                const res = await axios.get(proxyUrl, { timeout: timeout + 5000 });
                return res.data;
            } catch (e3) {
                console.warn(`⚠️ [scraperFetch] Proxy 2 failed: ${e3.message}. Trying backup proxy 3...`);
                try {
                    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
                    const res = await axios.get(proxyUrl, { timeout: timeout + 5000 });
                    return res.data;
                } catch (e4) {
                    console.error(`❌ [scraperFetch] Fatal: All fetch attempts failed for: ${targetUrl}`);
                    throw e4;
                }
            }
        }
    }
};

// --- API: Pro Download (M3U8 to MP4 conversion on-the-fly) ---
app.get('/download-pro', (req, res) => {
    let videoUrl = req.query.url;
    const title = req.query.title ? req.query.title.replace(/[\\/:*?"<>|]/g, '_') : 'video';

    if (!videoUrl) return res.status(400).send('No URL provided');

    // 1. Unwrap nested proxy URLs
    if (videoUrl.includes('?url=')) {
        try {
            const urlParts = new URL(videoUrl);
            const nestedUrl = urlParts.searchParams.get('url');
            if (nestedUrl) videoUrl = nestedUrl;
        } catch (e) { }
    }

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let headersStr = `User-Agent: ${userAgent}\r\n`;

    // تعزيز الهيدرز للمواقع الصعبة
    if (videoUrl.includes('eporner')) {
        headersStr += "Referer: https://www.eporner.com/\r\nOrigin: https://www.eporner.com\r\n";
    } else if (videoUrl.includes('xvideos') || videoUrl.includes('xv-cdn') || videoUrl.includes('xnxx')) {
        const domain = videoUrl.includes('xnxx') ? 'xnxx.com' : 'xvideos.com';
        headersStr += `Referer: https://www.${domain}/\r\nOrigin: https://www.${domain}\r\n`;
    } else if (videoUrl.includes('pornhub') || videoUrl.includes('phncdn') || videoUrl.includes('puzzland')) {
        headersStr += "Referer: https://www.pornhub.com/\r\nOrigin: https://www.pornhub.com\r\n";
    } else if (videoUrl.includes('xhamster') || videoUrl.includes('xhcdn')) {
        headersStr += "Referer: https://xhamster.desi/\r\nOrigin: https://xhamster.desi\r\n";
    } else if (videoUrl.includes('3dporndude')) {
        headersStr += "Referer: https://3dporndude.com/\r\nOrigin: https://3dporndude.com\r\n";
    }


    console.log(`\n📥 [PRO DOWNLOAD] Title: ${title}`);
    console.log(`🔗 [URL]: ${videoUrl}`);

    // إعداد الـ Headers للمتصفح (إلغاء طول المحتوى ليعرف المتصفح أنه بث مستمر)
    res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Transfer-Encoding', 'chunked');

    const command = ffmpeg(videoUrl)
        .inputOptions([
            '-headers', headersStr,
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', // السماح بكل البروتوكولات
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '10'
        ])
        .format('mp4')
        .outputOptions([
            '-c copy',                     // نسخ سريع جداً
            '-bsf:a aac_adtstoasc',        // إصلاح تدفق الصوت
            '-movflags frag_keyframe+empty_moov+faststart' // ضروري للتحميل المباشر
        ])
        .on('start', (cmd) => {
            console.log(`🚀 FFmpeg started: ${cmd}`);
        })
        .on('error', (err) => {
            console.error('❌ FFmpeg Error:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Download Error');
            }
        })
        .on('end', () => {
            console.log(`✅ Success: ${title}`);
        });

    command.pipe(res, { end: true });
});

// --- API: Sync Favorites (Multi-Device Support) ---
const favoritesFile = path.join(__dirname, 'favorites.json');

function getFavorites() {
    if (!fs.existsSync(favoritesFile)) return [];
    try {
        const data = fs.readFileSync(favoritesFile, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveFavorites(favs) {
    try {
        // 🛠️ Localize all media links before saving
        const localized = favs.map(item => {
            const wrap = (url) => {
                if (!url || typeof url !== 'string' || !url.startsWith('http')) return url;
                if (url.includes('/api/image-proxy?url=')) return url; // Already wrapped
                return `/api/image-proxy?url=${encodeURIComponent(url)}`;
            };
            return {
                ...item,
                poster: wrap(item.poster),
                thumbnail: wrap(item.thumbnail),
                preview: wrap(item.preview)
            };
        });

        fs.writeFileSync(favoritesFile, JSON.stringify(localized, null, 2));
        if (typeof reloadFavs === 'function') reloadFavs();
    } catch (e) {
        console.error("Error saving favorites:", e);
    }
}

app.get('/api/favorites', (req, res) => {
    let favs = getFavorites();
    // Sort by timestamp descending (newest first)
    favs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json(favs.map(item => wrapGlobalMedia(item)));
});

// Upsert (Add or Update) favorite
app.post('/api/favorites', (req, res) => {
    const item = req.body;
    if (!item || !item.id) return res.status(400).json({ error: 'Invalid item' });

    let favs = getFavorites();
    const index = favs.findIndex(f => f.id === item.id);

    if (index !== -1) {
        // Update existing
        favs[index] = { ...favs[index], ...item, last_updated: Date.now() };
    } else {
        // Add new
        favs.unshift({ ...item, timestamp: Date.now() });
    }

    saveFavorites(favs);

    // 🚚 Trigger Background Sync for this specific item
    try { syncMediaItem(item); } catch (e) { }

    res.json({ success: true, favorites: favs });
});

app.post('/api/favorites/add', (req, res) => {
    const item = req.body;
    if (!item || !item.id) return res.status(400).json({ error: 'Invalid item' });

    let favs = getFavorites();
    const index = favs.findIndex(f => f.id === item.id);
    if (index !== -1) {
        favs[index] = { ...favs[index], ...item };
    } else {
        favs.unshift({ ...item, timestamp: Date.now() });
    }
    saveFavorites(favs);
    res.json({ success: true, favorites: favs });
});

app.post('/api/favorites/remove', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'No ID provided' });

    let favs = getFavorites();
    favs = favs.filter(f => f.id !== id);
    saveFavorites(favs);
    res.json({ success: true, favorites: favs });
});

// --- API: Favorites Sync Logic ---
app.post('/api/favorites/sync', async (req, res) => {
    const favs = getFavorites();
    console.log(`🔄 [Sync] Starting background sync for ${favs.length} items...`);
    favs.forEach(item => { try { syncMediaItem(item); } catch (e) { } });
    res.json({ success: true });
});

async function syncMediaItem(item) {
    if (!item) return;
    const urls = [item.poster, item.thumbnail, item.preview]
        .filter(u => u && typeof u === 'string' && u.startsWith('http'))
        .map(u => u.split('?')[0]);

    for (const u of urls) {
        const pUrl = `http://localhost:${PORT}/api/image-proxy?url=${encodeURIComponent(u)}`;
        axios.get(pUrl).catch(() => { });
    }
}

// --- API: Background Download Manager ---
// --- API: Direct Download (Streaming to Browser) ---
app.get('/api/download/direct', async (req, res) => {
    let { url: videoUrl, title } = req.query;
    if (!videoUrl) return res.status(400).send('No URL provided');

    title = title ? title.replace(/[\\/:*?"<>|]/g, '_') : 'video_' + Date.now();

    // Handle chrome-extension URLs with embedded video URL in fragment
    if (videoUrl.startsWith('chrome-extension://') && videoUrl.includes('#')) {
        try {
            const actualUrl = videoUrl.split('#')[1];
            if (actualUrl) {
                videoUrl = decodeURIComponent(actualUrl);
                console.log(`🔓 Unwrapped chrome-extension URL: ${videoUrl.substring(0, 100)}...`);
            }
        } catch (e) {
            console.error('Failed to decode chrome-extension URL:', e);
        }
    }

    // Check if URL is a proxy URL before extracting
    const isM3u8ProxyUrl = videoUrl.includes('/api/m3u8-proxy');
    const isVpnProxyUrl = videoUrl.includes(':4000/play?url=');
    const isProxyUrl = isM3u8ProxyUrl || isVpnProxyUrl;

    // Only extract nested URL if it's not a proxy URL we want to use
    if (videoUrl.includes('?url=') && !isProxyUrl) {
        try {
            const nestedUrl = new URL(videoUrl).searchParams.get('url');
            if (nestedUrl) videoUrl = nestedUrl;
        } catch (e) { }
    }

    // If using vpn-proxy (port 4000), extract the real URL but keep referer info
    let proxyReferer = '';
    if (isVpnProxyUrl) {
        try {
            const proxyUrlObj = new URL(videoUrl);
            const realUrl = proxyUrlObj.searchParams.get('url');
            if (realUrl) {
                console.log(`🔍 [VPN Proxy] Extracting real URL from proxy: ${realUrl.substring(0, 80)}...`);
                videoUrl = realUrl;
            }
        } catch (e) { }
    }

    console.log(`🚀 Direct Download Started: ${title}`);
    console.log(`📱 URL: ${videoUrl.substring(0, 100)}...`);

    const isDirectMp4 = videoUrl.includes('.mp4') && !videoUrl.includes('.m3u8') && !videoUrl.includes('master.') && !isProxyUrl;

    // Debug download type detection
    console.log(`🔍 Download Type: ${isDirectMp4 ? 'Direct MP4 Proxy' : isProxyUrl ? 'HLS via Proxy' : 'HLS via FFmpeg'}`);
    console.log(`🔍 FFmpeg Available: ${ffmpegAvailable}`);
    console.log(`🔍 Is Proxy URL: ${isProxyUrl}`);
    console.log(`🔍 URL contains .mp4: ${videoUrl.includes('.mp4')}`);
    console.log(`🔍 URL contains .m3u8: ${videoUrl.includes('.m3u8')}`);
    console.log(`🔍 URL contains master.: ${videoUrl.includes('master.')}`);

    const encodedTitle = encodeURIComponent(title);
    res.setHeader('Content-Disposition', `attachment; filename="${encodedTitle}.mp4"; filename*=UTF-8''${encodedTitle}.mp4`);
    res.setHeader('Content-Type', 'video/mp4');

    if (isDirectMp4) {
        // Direct proxy for MP4 files
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            };

            // Source-specific referers and origins
            if (req.query.referer) {
                headers['Referer'] = req.query.referer;
                try { headers['Origin'] = new URL(req.query.referer).origin; } catch (e) { }
            }

            if (videoUrl.includes('eporner')) {
                headers['Referer'] = req.query.referer || 'https://www.eporner.com/';
                headers['Origin'] = 'https://www.eporner.com';
                headers['Cookie'] = 'age_verified=1; bs=s;';
            } else if (videoUrl.includes('xvideos') || videoUrl.includes('xv-cdn') || videoUrl.includes('xnxx')) {
                const domain = videoUrl.includes('xnxx') ? 'xnxx.com' : 'xvideos.com';
                headers['Referer'] = req.query.referer || `https://www.${domain}/`;
                headers['Origin'] = `https://www.${domain}`;
            } else if (videoUrl.includes('pornhub') || videoUrl.includes('phncdn')) {
                headers['Referer'] = req.query.referer || 'https://www.pornhub.com/';
                headers['Origin'] = 'https://www.pornhub.com';
                headers['Cookie'] = 'age_verified=1; platform=pc; bs=s;';
            } else if (videoUrl.includes('xhamster') || videoUrl.includes('xhcdn')) {
                headers['Referer'] = req.query.referer || 'https://xhamster.com/';
                headers['Origin'] = 'https://xhamster.com';
            } else if (videoUrl.includes('3dporndude')) {
                headers['Referer'] = req.query.referer || 'https://3dporndude.com/';
                headers['Origin'] = 'https://3dporndude.com';
            } else if (videoUrl.includes('porcore')) {
                headers['Referer'] = req.query.referer || 'https://porcore.com/';
            }

            const response = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 60000,
                maxRedirects: 5
            });

            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }

            response.data.pipe(res);
            console.log(`✅ Direct MP4 proxy started: ${title}`);

            req.on('close', () => {
                try { response.data.destroy(); } catch (e) { }
            });
        } catch (e) {
            console.error(`❌ Direct download error:`, e.message);
            if (!res.headersSent) res.status(500).send("Download failed: " + e.message);
        }
    } else {
        // Use ffmpeg for HLS/m3u8 streams
        if (!ffmpegAvailable) {
            console.error('❌ FFmpeg not available for HLS download');
            return res.status(503).send('FFmpeg not installed. HLS downloads require FFmpeg. Please install ffmpeg-static: npm install ffmpeg-static');
        }

        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        // Get referer from query param if provided
        const refererHint = req.query.referer || '';
        let headersArr = [`User-Agent: ${userAgent}`, `Cookie: bs=s; age_verified=1`];

        if (refererHint) {
            // Use provided referer hint
            headersArr.push(`Referer: ${refererHint}`);
            try {
                const origin = new URL(refererHint).origin;
                headersArr.push(`Origin: ${origin}`);
            } catch (e) { }
            console.log(`🔍 [FFmpeg] Using referer hint: ${refererHint}`);
        } else if (videoUrl.includes('hanime') || videoUrl.includes('htv-services')) {
            headersArr.push("Referer: https://hanime.tv/", "Origin: https://hanime.tv");
        } else if (videoUrl.includes('eporner')) {
            headersArr.push("Referer: https://www.eporner.com/", "Origin: https://www.eporner.com");
        } else if (videoUrl.includes('xvideos') || videoUrl.includes('xv-cdn') || videoUrl.includes('xnxx')) {
            const domain = videoUrl.includes('xnxx') ? 'xnxx.com' : 'xvideos.com';
            headersArr.push(`Referer: https://www.${domain}/`, `Origin: https://www.${domain}`);
        } else if (videoUrl.includes('pornhub') || videoUrl.includes('phncdn') || videoUrl.includes('puzzland')) {
            headersArr.push("Referer: https://www.pornhub.com/", "Origin: https://www.pornhub.com");
            headersArr.push("Cookie: age_verified=1; platform=pc; bs=s;");
        } else if (videoUrl.includes('xhamster') || videoUrl.includes('xhcdn')) {
            headersArr.push("Referer: https://xhamster.com/", "Origin: https://xhamster.com");
        } else if (videoUrl.includes('3dporndude')) {
            headersArr.push("Referer: https://3dporndude.com/", "Origin: https://3dporndude.com");
        } else if (videoUrl.includes('porcore')) {
            headersArr.push("Referer: https://porcore.com/", "Origin: https://porcore.com");
        }

        const headersStr = headersArr.join('\r\n') + '\r\n';

        console.log(`🔍 [FFmpeg] Headers: ${headersArr.join(', ')}`);
        console.log(`🔍 [FFmpeg] Starting download for: ${title}`);

        console.log(`🔍 [FFmpeg] Input URL: ${videoUrl.substring(0, 80)}...`);

        // Source-specific fixes
        const isPornhub = videoUrl.includes('pornhub') || videoUrl.includes('phncdn');
        const isXhamster = videoUrl.includes('xhamster') || videoUrl.includes('xhcdn');
        const isPorcore = videoUrl.includes('porcore');

        // 🛡️ CRITICAL FIX: Wrap HLS URL with proxy so segments go through proxy too
        // This prevents 403 errors on .ts segments that need referer/cookie headers
        if (videoUrl.includes('.m3u8') && !videoUrl.includes('/api/m3u8-proxy')) {
            const proxyBase = `http://${req.headers.host}/api/m3u8-proxy`;
            let proxyUrl = `${proxyBase}?url=${encodeURIComponent(videoUrl)}`;

            // Add referer to proxy URL so it propagates to segments
            if (isPornhub) {
                proxyUrl += `&referer=${encodeURIComponent('https://www.pornhub.com/')}`;
            } else if (isXhamster) {
                proxyUrl += `&referer=${encodeURIComponent('https://xhamster.com/')}`;
            } else if (videoUrl.includes('eporner')) {
                proxyUrl += `&referer=${encodeURIComponent('https://www.eporner.com/')}`;
            } else if (videoUrl.includes('xvideos') || videoUrl.includes('xnxx')) {
                const domain = videoUrl.includes('xnxx') ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
                proxyUrl += `&referer=${encodeURIComponent(domain)}`;
            } else if (videoUrl.includes('3dporndude')) {
                proxyUrl += `&referer=${encodeURIComponent('https://3dporndude.com/')}`;
            } else if (isPorcore) {
                proxyUrl += `&referer=${encodeURIComponent('https://porcore.com/')}`;
            } else if (req.query.referer) {
                proxyUrl += `&referer=${encodeURIComponent(req.query.referer)}`;
            }

            console.log(`🔍 [FFmpeg] Wrapping with proxy: ${proxyUrl.substring(0, 100)}...`);
            videoUrl = proxyUrl;
        }

        // For PornHub: master.m3u8 might need specific handling
        if (isPornhub && videoUrl.includes('master.m3u8')) {
            console.log(`🔍 [FFmpeg] PornHub HLS detected - using specific options`);
        }

        // 🚀 CRITICAL: Send headers immediately so browser doesn't wait
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${encodedTitle}.mp4"`);
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if present
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders(); // Force send headers immediately

        const command = ffmpeg(videoUrl)
            .inputOptions([
                '-headers', headersStr
            ])
            .outputOptions([
                '-c copy',
                '-bsf:a aac_adtstoasc',
                '-movflags frag_keyframe+empty_moov',
                '-f mp4'
            ])
            .on('start', (cmd) => {
                console.log(`🎬 [FFmpeg] Command: ${cmd.substring(0, 120)}...`);
            })
            .on('stderr', (stderrLine) => {
                console.log(`📝 [FFmpeg] ${stderrLine.substring(0, 120)}`);
            })
            .on('error', (err, stdout, stderr) => {
                console.error(`❌ [FFmpeg] Error: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).send("Download failed: " + err.message);
                }
            })
            .on('end', () => {
                console.log(`✅ [FFmpeg] Download finished: ${title}`);
            });

        req.on('close', () => {
            try {
                console.log(`🛑 [Direct Download] User aborted: ${title}`);
                command.kill('SIGKILL');
            } catch (e) { }
        });

        console.log(`🚀 [FFmpeg] Starting pipe to response...`);

        // Simple direct pipe - most reliable for streaming
        command.pipe(res, { end: true });
    }
});

app.post('/api/download/start', (req, res) => {
    let { url: originalInputUrl, title } = req.body;
    if (!originalInputUrl) return res.status(400).json({ error: 'No URL provided' });

    let videoUrl = originalInputUrl;
    // 📡 Smart De-Proxy: Extract original source URL and referer if provided via proxy
    if (videoUrl.includes('?url=')) {
        try {
            const uObj = new URL(videoUrl, `http://${req.headers.host || 'localhost'}`);
            const realUrl = uObj.searchParams.get('url');
            const realReferer = uObj.searchParams.get('referer');
            if (realUrl) {
                console.log(`📡 [De-Proxy] Extracting original URL for download: ${realUrl}`);
                videoUrl = realUrl;
                if (realReferer) req.query.referer = realReferer;
            }
        } catch (e) { }
    }

    title = title ? title.replace(/[\\/:*?"<>|]/g, '_') : 'video_' + Date.now();
    const id = Date.now().toString();
    const outputPath = path.join(downloadsDir, `${title}.mp4`);

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let headersArr = [
        `User-Agent: ${userAgent}`,
        `Cookie: bs=s; age_verified=1; platform=pc; cookies_banner_seen=1`,
        "Accept: */*",
        "Accept-Language: en-US,en;q=0.9",
        "Connection: keep-alive"
    ];

    if (videoUrl.includes('hanime') || videoUrl.includes('htv-services')) headersArr.push("Referer: https://hanime.tv/", "Origin: https://hanime.tv");
    else if (videoUrl.includes('eporner')) headersArr.push("Referer: https://www.eporner.com/", "Origin: https://www.eporner.com");
    else if (videoUrl.includes('xvideos') || videoUrl.includes('xv-cdn') || videoUrl.includes('xnxx') || videoUrl.includes('xnxx2.com') || videoUrl.includes('xvideos3.com')) {
        const domain = videoUrl.includes('xnxx') ? 'xnxx.com' : 'xvideos.com';
        headersArr.push(`Referer: https://www.${domain}/`, `Origin: https://www.${domain}`);
    } else if (videoUrl.includes('pornhub') || videoUrl.includes('phncdn') || videoUrl.includes('puzzland')) {
        headersArr.push("Referer: https://www.pornhub.com/", "Origin: https://www.pornhub.com");
    } else if (videoUrl.includes('xhamster') || videoUrl.includes('xhcdn')) {
        headersArr.push("Referer: https://xhamster.desi/", "Origin: https://xhamster.desi");
    } else if (videoUrl.includes('3dporndude')) {
        headersArr.push("Referer: https://3dporndude.com/", "Origin: https://3dporndude.com");
    }

    const headersStr = headersArr.join('\r\n') + '\r\n';

    activeDownloads[id] = { id, title, progress: 0, status: 'starting', file: `${title}.mp4`, error: null, startTime: Date.now() };

    const formatETA = (seconds) => {
        if (!seconds || seconds === Infinity) return 'Calculating...';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const command = ffmpeg(videoUrl)
        .inputOptions([
            '-user_agent', userAgent,
            '-headers', headersStr,
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '15',
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '4xx,5xx',
            '-rw_timeout', '15000000',
            '-threads', '1'
        ])
        .outputOptions([
            '-c copy',
            '-bsf:a aac_adtstoasc',
            '-movflags +faststart'
        ])
        .save(outputPath)
        .on('start', (cmdLine) => {
            console.log(`🎬 Download Started [${id}]:`, cmdLine);
        })
        .on('stderr', (line) => {
            if (line.includes('error') || line.includes('fail')) {
                console.warn(`⚠️ [FFmpeg Stderr ${id}]:`, line);
            }
        })
        .on('progress', (progress) => {
            if (activeDownloads[id] && activeDownloads[id].status !== 'error') {
                const percent = progress.percent ? Math.round(progress.percent) : activeDownloads[id].progress;
                activeDownloads[id].progress = percent;
                activeDownloads[id].status = 'downloading';
                activeDownloads[id].timeMark = progress.timemark;

                // Calculate ETA
                const elapsedS = (Date.now() - activeDownloads[id].startTime) / 1000;
                if (percent > 0) {
                    const totalEstS = elapsedS / (percent / 100);
                    const remainingS = Math.max(0, totalEstS - elapsedS);
                    activeDownloads[id].eta = formatETA(remainingS);
                }
            }
        })
        .on('error', (err) => {
            console.error(`❌ Download Error [${id}]:`, err.message);
            if (activeDownloads[id]) {
                activeDownloads[id].status = 'error';
                activeDownloads[id].error = err.message;
            }
        })
        .on('end', () => {
            console.log(`✅ Download Complete [${id}]: ${title}`);
            if (activeDownloads[id]) {
                activeDownloads[id].progress = 100;
                activeDownloads[id].status = 'completed';

                const filePath = path.join(downloadsDir, activeDownloads[id].file);

                // Auto-cleanup the record in the manager after 30 seconds
                setTimeout(() => {
                    delete activeDownloads[id];
                }, 30000);

                // Auto-cleanup the physical file after 5 minutes to save storage
                setTimeout(() => {
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`🧹 Auto-cleaned temp file: ${filePath}`);
                        }
                    } catch (e) { }
                }, 1);
            }
        });

    activeDownloads[id].command = command;
    res.json({ success: true, id, title });
});

// --- API: Bulk Download with Python ---
// Single item download via Python (for web player integration)
app.post('/api/download/python-single', (req, res) => {
    const { url, title, id } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    const itemId = id || `single_${Date.now()}`;
    const itemTitle = title || 'video';

    // Prevent duplicate downloads - check if already downloading
    if (activeDownloads[itemId] && activeDownloads[itemId].status === 'downloading') {
        console.log(`⚠️ Download already in progress for ${itemId}, ignoring duplicate request`);
        return res.json({ success: true, id: itemId, message: 'Download already in progress' });
    }

    console.log(`🚀 Starting Single Python Download: ${itemTitle}`);

    const { spawn } = require('child_process');
    const pythonPath = 'python';

    const pyProcess = spawn(pythonPath, ['downloader.py', '--json'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    activeDownloads[itemId] = {
        id: itemId,
        title: itemTitle,
        progress: 0,
        status: 'waiting',
        startTime: Date.now(),
        command: pyProcess
    };

    const inputData = [{ name: itemTitle, link: url, id: itemId }];
    const inputString = JSON.stringify({ items: inputData }) + '\n';

    console.log(`🐍 Sending to Python: ${inputString.substring(0, 150)}...`);
    pyProcess.stdin.write(inputString);
    pyProcess.stdin.end();

    pyProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            if (line.startsWith('PROGRESS|')) {
                const [_, id, percent, status, eta, speed] = line.split('|');
                if (activeDownloads[id]) {
                    activeDownloads[id].progress = parseInt(percent) || 0;
                    activeDownloads[id].status = status || 'downloading';
                    activeDownloads[id].eta = eta || '';
                    activeDownloads[id].speed = speed || '';
                    if (status === 'completed') activeDownloads[id].progress = 100;
                }
            } else if (line.startsWith('FILENAME|')) {
                const [_, id, filename] = line.split('|');
                if (activeDownloads[id]) {
                    activeDownloads[id].file = filename;
                }
            } else if (line.startsWith('LOG|')) {
                console.log(`🐍 [PyLog]: ${line.replace('LOG|', '')}`);
            }
        });
    });

    pyProcess.stderr.on('data', (data) => {
        console.error(`🐍 [PyErr]: ${data.toString()}`);
    });

    pyProcess.on('close', (code) => {
        console.log(`🐍 Single download exited with code ${code}`);
        if (activeDownloads[itemId]) {
            if (code === 0 && activeDownloads[itemId].progress === 100) {
                activeDownloads[itemId].status = 'completed';
            } else if (code !== 0) {
                activeDownloads[itemId].status = 'error';
            }
        }
    });

    res.json({ success: true, id: itemId, message: 'Python download started' });
});

app.post('/api/download/python', (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No items provided' });
    }

    // Filter out items that are already downloading
    const newItems = items.filter(item => {
        if (activeDownloads[item.id] && activeDownloads[item.id].status === 'downloading') {
            console.log(`⚠️ Item ${item.id} already downloading, skipping duplicate`);
            return false;
        }
        return true;
    });

    if (newItems.length === 0) {
        return res.json({ success: true, message: 'All items already downloading' });
    }

    if (newItems.length < items.length) {
        console.log(`🚀 Starting Bulk Python Download for ${newItems.length}/${items.length} items (filtered duplicates)`);
    } else {
        console.log(`🚀 Starting Bulk Python Download for ${items.length} items`);
    }

    const { spawn } = require('child_process');
    const pythonPath = 'python'; // Base command

    const pyProcess = spawn(pythonPath, ['downloader.py', '--json'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    newItems.forEach(item => {
        activeDownloads[item.id] = {
            id: item.id,
            title: item.name,
            progress: 0,
            status: 'waiting',
            startTime: Date.now(),
            command: pyProcess // Using 'command' to match the stop endpoint
        };
    });

    const inputString = JSON.stringify(newItems) + '\n';
    console.log(`🐍 Sending to Python: ${inputString.substring(0, 200)}${inputString.length > 200 ? '...' : ''}`);
    pyProcess.stdin.write(inputString);
    pyProcess.stdin.end();

    pyProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            if (line.startsWith('PROGRESS|')) {
                const [_, id, percent, status, eta, speed] = line.split('|');
                if (activeDownloads[id]) {
                    activeDownloads[id].progress = parseInt(percent) || 0;
                    activeDownloads[id].status = status || 'downloading';
                    activeDownloads[id].eta = eta || '';
                    activeDownloads[id].speed = speed || '';
                    if (status === 'completed') activeDownloads[id].progress = 100;
                }
            } else if (line.startsWith('FILENAME|')) {
                const [_, id, filename] = line.split('|');
                if (activeDownloads[id]) {
                    activeDownloads[id].file = filename;
                }
            } else if (line.startsWith('LOG|')) {
                console.log(`🐍 [PyLog]: ${line.replace('LOG|', '')}`);
            } else {
                console.log(`🐍 [PyOut]: ${line}`);
            }
        });
    });

    pyProcess.stderr.on('data', (data) => {
        console.error(`🐍 [PyErr]: ${data.toString()}`);
    });

    pyProcess.on('close', (code) => {
        console.log(`🐍 Downloader.py exited with code ${code}`);
        // Set remaining waiting items to error if they didn't finish
        newItems.forEach(item => {
            if (activeDownloads[item.id] && (activeDownloads[item.id].status === 'waiting' || activeDownloads[item.id].status === 'downloading')) {
                if (code === 0 && activeDownloads[item.id].progress === 100) {
                    activeDownloads[item.id].status = 'completed';
                } else if (code !== 0) {
                    activeDownloads[item.id].status = 'error';
                }
            }
        });
    });

    res.json({ success: true, message: 'Bulk download started' });
});

app.get('/api/download/status', (req, res) => {
    // Return safe data without the active command object
    const cleanData = Object.keys(activeDownloads).map(id => {
        const { command, ...rest } = activeDownloads[id];
        return { id, ...rest };
    });
    res.json(cleanData);
});

app.post('/api/download/stop', (req, res) => {
    const { id } = req.body;
    if (activeDownloads[id]) {
        console.log(`🛑 Stopping Download [${id}]: ${activeDownloads[id].title}`);

        if (activeDownloads[id].command) {
            try {
                // For FFmpeg or ChildProcess
                if (typeof activeDownloads[id].command.kill === 'function') {
                    activeDownloads[id].command.kill('SIGINT');
                } else if (typeof activeDownloads[id].command.stop === 'function') {
                    activeDownloads[id].command.stop();
                }
            } catch (e) {
                console.error(`Error killing process for ${id}:`, e.message);
            }
        }

        activeDownloads[id].status = 'cancelled';
        activeDownloads[id].progress = 0;

        // Delete the file if it exists, including .tmp version
        if (activeDownloads[id].file) {
            const filePath = path.join(downloadsDir, activeDownloads[id].file);
            const tmpPath = filePath + '.tmp';

            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                    console.log(`🗑️ Cleaned up files for [${id}]`);
                } catch (e) { }
            }, 1000);
        }

        // Cleanup after 10 seconds
        setTimeout(() => {
            delete activeDownloads[id];
        }, 10000);

        res.json({ success: true, message: 'Download stopped' });
    } else {
        res.status(404).json({ error: 'Download not found' });
    }
});

app.post('/api/download/clear', (req, res) => {
    // Clear only completed or error downloads to prevent data bloat
    Object.keys(activeDownloads).forEach(id => {
        if (activeDownloads[id].status === 'completed' || activeDownloads[id].status === 'error' || activeDownloads[id].status === 'cancelled') {
            delete activeDownloads[id];
        }
    });
    res.json({ success: true });
});

app.post('/api/download/cancel', (req, res) => {
    const { id } = req.body;
    if (id && activeDownloads[id]) {
        console.log(`🛑 Cancelling/Deleting Download [${id}]`);
        try {
            if (activeDownloads[id].command) {
                activeDownloads[id].command.kill('SIGKILL');
            }
        } catch (e) { }

        if (activeDownloads[id].file) {
            const filePath = path.join(downloadsDir, activeDownloads[id].file);
            const tmpPath = filePath + '.tmp';

            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                    console.log(`🗑️ Cancelled & Deleted [${id}]`);
                } catch (e) { }
            }, 1000);
        }
        delete activeDownloads[id];
    }
    res.json({ success: true });
});

// Serve actual downloaded files
app.use('/downloads', express.static(downloadsDir));

// --- API: Proxy for JSON Catalogs ---
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'No URL provided' });

    // 🚀 [Safety Fallback] If someone passes an Eporner page URL instead of an m3u8, handle it
    if (targetUrl.toLowerCase().includes('eporner.com/video-') && !targetUrl.toLowerCase().includes('.m3u8')) {
        console.warn("⚠️ [m3u8-proxy] Detected page URL instead of manifest. Redirecting to scraper logic.");
        return res.redirect(`/eporner/stream/movie/${encodeURIComponent(targetUrl)}.json`);
    }

    try {
        const response = await axios.get(targetUrl, {
            timeout: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        // Fix and proxy Hanime streams specifically if they escaped earlier proxying
        if (source === 'hanime' && response.data && response.data.streams) {
            response.data.streams = response.data.streams.map(s => {
                if (s.url && !s.url.includes('/api/m3u8-proxy') && !s.url.includes('/api/stream')) {
                    const isM3U8 = s.url.includes('.m3u8');
                    const proxyPath = isM3U8 ? '/api/m3u8-proxy' : '/api/stream';
                    s.url = `${proxyPath}?url=${encodeURIComponent(s.url)}&headers=${encodeURIComponent(JSON.stringify({
                        'Referer': 'https://hanime.tv/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }))}`;
                }
                return s;
            });
        }

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * 🌟 DYNAMIC SOURCE DISCOVERY
 * Automatically loads all source modules from the /sources folder and registers them.
 */
const SEARCH_SOURCES = [];

// Scan the 'sources' directory and auto-load everything
const sourcesDir = path.join(__dirname, 'sources');
if (fs.existsSync(sourcesDir)) {
    fs.readdirSync(sourcesDir).forEach(folder => {
        const folderPath = path.join(sourcesDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const indexPath = path.join(folderPath, 'index.js');
            if (fs.existsSync(indexPath)) {
                try {
                    // 1. Register the route automatically
                    const route = require(`./sources/${folder}`);
                    app.use(`/${folder}`, route);

                    // 2. Add to SEARCH_SOURCES for aggregation
                    if (!SEARCH_SOURCES.find(s => s.id === folder)) {
                        const name = folder.charAt(0).toUpperCase() + folder.slice(1);
                        const isAnime = folder.toLowerCase().includes('hanime');

                        SEARCH_SOURCES.push({
                            id: folder,
                            name: name,
                            baseUrl: `http://localhost:${PORT}/${folder}`,
                            type: isAnime ? 'anime' : 'real',
                            priority: isAnime ? ['hanime', 'hanime-recent', 'hanime-mostlikes', 'hanime-mostviews', 'hanime-newest', 'hanime-series'] : [folder]
                        });
                    }
                    console.log(`✅ [Auto-Discovery] Source Loaded: ${folder}`);
                } catch (err) {
                    console.error(`❌ [Auto-Discovery] Failed to load ${folder}:`, err.message);
                }
            }
        }
    });
}

// --- API: Get Available Sources (For UI injection) ---
app.get('/api/sources', (req, res) => {
    res.json(SEARCH_SOURCES.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        baseUrl: s.baseUrl // Include baseUrl so frontend can use it if needed
    })));
});


// --- 📚 SMART SEARCH SYNONYMS ---
const SEARCH_SYNONYMS = {
    "sloppy": ["messy", "drooling", "spit", "gagging"],
    "milk": ["cum", "facial", "creamy", "swallow"],
    "deepthroat": ["throatfuck", "throat fuck", "gagging", "deep throat"],
    "deep throat": ["throatfuck", "throat fuck", "gagging", "deepthroat"],
    "bj": ["blowjob", "oral", "sucking"],
    "blowjob": ["bj", "oral", "sucking"],
    "creampie": ["cum inside", "internal"],
    "pov": ["point of view", "first person"],
    "handjob": ["hj", "hand job"],
    "hj": ["handjob", "hand job"]
};

app.get('/api/search', async (req, res) => {
    const query = req.query.q || "";
    const resolvedType = req.query.type || 'all';
    const skip = req.query.skip || 0;
    const source = req.query.source || 'all';
    const sort = req.query.sort || 'mr';

    if (!query) return res.json({ results: [] });

    const normalizedQuery = query.toLowerCase().trim()
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ')     // Collapse multiple spaces
        .trim();                  // Final trim for safety
    const queryWords = normalizedQuery.split(/\s+/).filter(k => k.length >= 2);
    const isLongQuery = queryWords.length >= 3;

    console.log(`🚀 [Server Search] Aggregating for: "${normalizedQuery}" [Sort: ${sort}]`);

    // 1. Filter sources by type and ID - Targeted List for "All Sources"
    let activeSources = SEARCH_SOURCES;

    // 🛡️ [Strict Category Lock] Enforce category separation regardless of specific source selection
    if (resolvedType === 'real') {
        // Only allow real sources, and explicitly block Hanime
        activeSources = SEARCH_SOURCES.filter(s => s.type === 'real' && s.id !== 'hanime');
        if (source !== 'all' && !activeSources.some(s => s.id === source)) {
            // Source mismatch, return empty results
            return res.json({ results: [], total: 0 });
        }
        if (source !== 'all') activeSources = activeSources.filter(s => s.id === source);
    } else if (resolvedType === 'anime') {
        // ONLY allow Hanime for anime search
        activeSources = SEARCH_SOURCES.filter(s => s.id === 'hanime');
        if (source !== 'all' && source !== 'hanime') {
            // Source mismatch, return empty results
            return res.json({ results: [], total: 0 });
        }
    } else if (source !== 'all') {
        activeSources = SEARCH_SOURCES.filter(s => s.id === source);
    }

    const fetchTasks = [];

    activeSources.forEach(src => {
        const cleanBase = src.baseUrl.replace(/\/$/, '');
        const catalogs = src.priority;

        for (const cat of catalogs) {
            let types = src.type === 'anime' ? ['anime'] : ['movie'];
            if (src.id === 'hanime' && cat === 'hanime-series') types = ['series'];

            for (const t of types) {
                const baseSkip = parseInt(skip) || 0;
                const sep = src.id === 'hanime' ? '&' : '/';

                // --- 🌪️ INTELLIGENT MIXED SORT LOGIC ---
                // If sort is 'mixed' and source is PornHub, we fetch multiple pages across different sorts
                if (sort === 'mixed' && src.id === 'pornhub') {
                    const mixSorts = ['mr', 'mv', 'nw']; // Relevant, Viewed, Newest
                    mixSorts.forEach(s => {
                        const url = `${cleanBase}/catalog/${t}/${encodeURIComponent(cat)}/search=${encodeURIComponent(normalizedQuery)}${sep}skip=${baseSkip}&sort=${s}.json`;
                        fetchTasks.push({ url, src, isSearch: true, mixGroup: s });
                    });
                } else {
                    // Standard single-sort fetch - Fetch exactly one page to prevent frontend deduplication issues
                    const searchUrl = `${cleanBase}/catalog/${t}/${encodeURIComponent(cat)}/search=${encodeURIComponent(normalizedQuery)}${sep}skip=${baseSkip}${src.id === 'pornhub' ? `&sort=${sort}` : ''}.json`;
                    fetchTasks.push({ url: searchUrl, src, isSearch: true });
                }
            }
        }
    });

    // 2. Parallel Fetch with Timeout
    const allMetas = [];
    const startTime = Date.now();

    await Promise.allSettled(fetchTasks.map(async (task) => {
        try {
            const rawData = await scraperFetch(task.url, 25000);
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

            if (data && Array.isArray(data.metas)) {
                data.metas.forEach(m => {
                    const rawTitle = (m.name || m.title || "").toLowerCase();
                    const title = rawTitle.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(); // Cleaned title for match

                    // --- 🧠 ADVANCED RELEVANCE SCORING (PornHub Style) ---
                    let score = 0;
                    if (query) {
                        // 1. Exact Full Match (Absolute Priority)
                        if (title === normalizedQuery) {
                            score += 10000;
                        }
                        // 2. Starts with query
                        else if (title.startsWith(normalizedQuery)) {
                            score += 2000;
                        }
                        // 3. Contains Full Phrase
                        else if (title.includes(normalizedQuery)) {
                            score += 1500;
                        }
                        // 4. Keyword & Synonym Matching
                        else {
                            let matchCount = 0;
                            let synonymMatches = 0;

                            queryWords.forEach(kw => {
                                // Direct match
                                const regex = new RegExp(`\\b${kw}\\b`, 'i');
                                if (regex.test(title)) {
                                    matchCount++;
                                }
                                // Synonym match
                                else if (SEARCH_SYNONYMS[kw]) {
                                    const hasSyn = SEARCH_SYNONYMS[kw].some(syn => {
                                        const synRegex = new RegExp(`\\b${syn}\\b`, 'i');
                                        return synRegex.test(title);
                                    });
                                    if (hasSyn) {
                                        matchCount += 0.8; // Synonyms count as 80% of a direct match
                                        synonymMatches++;
                                    }
                                }
                            });

                            if (matchCount > 0) {
                                score += (matchCount * 220); // Base points for matches
                                const matchRatio = Math.min(1, matchCount / queryWords.length);
                                score += Math.floor(matchRatio * 600);

                                // Relaxed Filtering removed
                            }
                        }
                    }

                    // Calculate Match Percentage for UI
                    const maxForPercent = isLongQuery ? 5000 : 2000;
                    const matchPercent = Math.min(100, Math.floor((score / maxForPercent) * 100));

                    // Final safety gate: Very permissive to ensure results show up
                    // Relaxed: Including everything found by scrapers

                    allMetas.push({
                        ...m,
                        _source: { id: task.src.id, name: task.src.name, type: task.src.type },
                        _isSearchMatch: true,
                        _score: score > 0 ? score : 100, // Ensure even legacy items show up
                        _match: matchPercent > 0 ? matchPercent : 50
                    });
                });
            }
        } catch (e) {
            console.warn(`⚠️ [Search Task Failed] ${task.src.id}: ${e.message}`);
        }
    }));

    // 3. ID-BASED DEDUPLICATION (Strict)
    const unique = [];
    const seenIds = new Set();
    const seenKeys = new Set(); // Additional normalized key check

    allMetas.forEach(item => {
        // Normalize ID for comparison (remove prefixes, lowercase)
        const normalizedId = (item.id || '').toString().toLowerCase().trim();
        const baseKey = normalizedId.replace(/^(ph|ep|xv|xn|xh|_)*/, ''); // Remove common prefixes

        // Skip if we've seen this exact ID or the normalized base key
        if (seenIds.has(item.id) || seenKeys.has(baseKey)) {
            const existing = unique.find(u => u.id === item.id || u.id.toLowerCase().replace(/^(ph|ep|xv|xn|xh|_)*/, '') === baseKey);
            if (existing && item._source && !existing.extraSources.some(s => s.id === item._source.id)) {
                existing.extraSources.push(item._source);
            }
            return;
        }

        seenIds.add(item.id);
        seenKeys.add(baseKey);
        unique.push({ ...item, extraSources: [] });
    });

    // 4. 🏆 EXCELLENT SORTING (PornHub Style)
    if (query) {
        // Sort by relevance score (highest first)
        unique.sort((a, b) => (b._score || 0) - (a._score || 0));
    }
    // Shuffling removed as per user request to prevent random source ordering

    const elapsed = Date.now() - startTime;
    // Final logging removed as per request

    res.json({ results: unique.slice(0, 1000) });
});


// --- API: Advanced M3U8 Proxy ---
app.get('/api/m3u8-proxy', async (req, res) => {
    let targetUrl = req.query.url;

    // 🎯 [Critical Fix] Express converts '+' to ' ' in req.query. 
    // CDN tokens often use '+'. We MUST parse it manually to preserve '+'.
    const rawUrlMatch = req.originalUrl.match(/[?&]url=([^&]+)/);
    if (rawUrlMatch) {
        try {
            targetUrl = decodeURIComponent(rawUrlMatch[1]);
        } catch (e) { }
    }
    if (!targetUrl) return res.status(400).send('No URL provided');
    if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;

    // 🎯 [Super Aggressive Unwrap] Decode until raw URL is reached
    function deepUnwrap(url) {
        // 🛡️ [Security Fix] Do NOT aggressively decode video-cf URLs as they rely on encoded path segments
        if (url.includes('video-cf.xhcdn.com')) return url;

        let current = url;
        let last = "";
        let iterations = 0;
        while (current !== last && iterations < 10) {
            last = current;
            if (current.startsWith('//')) current = 'https:' + current;
            if (current.includes('url=')) {
                try {
                    const parts = current.split('url=');
                    current = decodeURIComponent(parts[parts.length - 1].split('&')[0]);
                } catch (e) { break; }
            } else if (current.includes('%')) {
                try {
                    const decoded = decodeURIComponent(current);
                    if (decoded === current) break;
                    current = decoded;
                } catch (e) { break; }
            } else { break; }
            iterations++;
        }
        return current;
    }

    targetUrl = deepUnwrap(targetUrl);

    // 🎯 [XHamster Template Fix] Auto-resolve _TPL_ to 1080p
    if (targetUrl.includes('_TPL_')) {
        targetUrl = targetUrl.replace('_TPL_', '1080p');
    }

    const urlLower = targetUrl.toLowerCase();

    // 🛡️ [AV1 Auto-Fix] Deep Cleaned URL for compatibility (ONLY for non-CF links)
    if ((urlLower.includes('-av1') || urlLower.includes('_av1') || urlLower.includes('.av1')) && !urlLower.includes('video-cf.xhcdn.com')) {
        targetUrl = targetUrl.replace('-av1', '').replace('_av1', '').replace('.av1', '');
        console.log(`🧹 [AV1 Proxy Fix] Cleaned URL for player: ${targetUrl}`);
    }

    // 🎯 [Strict Type Detection]
    const cleanUrl = targetUrl.split('?')[0].toLowerCase();
    const isSegment = cleanUrl.endsWith('.ts') || cleanUrl.endsWith('.m4s') || cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.png') || targetUrl.includes('/seg-') || targetUrl.includes('.m4s');
    const isM3u8 = !isSegment && (targetUrl.includes('.m3u8') || targetUrl.includes('m3u8') || targetUrl.includes('index-f') || targetUrl.includes('teenxy.com/get_file/') || targetUrl.includes('media=hls'));

    // 🛡️ Pro-Headers for Anti-Bot Bypassing
    let originHost = 'localhost';
    try {
        const decodedUrl = targetUrl.includes('%') ? decodeURIComponent(targetUrl) : targetUrl;
        originHost = new URL(decodedUrl).hostname;
    } catch (e) { }

    const headers = {
        'User-Agent': req.query.ua || req.headers['user-agent'] || UA,
        'Accept': '*/*',
        'Referer': req.query.referer || targetUrl,
        'Origin': req.query.origin || 'https://' + originHost,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    // 🛡️ [Dynamic Headers] Parse and merge custom headers if provided
    if (req.query.headers) {
        try {
            const customHeaders = JSON.parse(decodeURIComponent(req.query.headers));
            Object.assign(headers, customHeaders);
        } catch (e) {
            console.warn(`⚠️ [M3U8 Proxy] Failed to parse custom headers: ${e.message}`);
        }
    }

    // Only add Sec-Fetch if NOT Eporner
    if (!urlLower.includes('eporner')) {
        headers['Sec-Fetch-Dest'] = 'empty';
        headers['Sec-Fetch-Mode'] = 'cors';
        headers['Sec-Fetch-Site'] = 'cross-site';
    }

    // 🛡️ Source-Specific Pro-Headers
    if (urlLower.includes('eporner')) {
        headers['Referer'] = req.query.referer || 'https://www.eporner.com/';
        headers['Origin'] = 'https://www.eporner.com';
        headers['Cookie'] = 'age_verified=1; bs=s;';
        headers['Accept'] = '*/*';
        if (!req.query.referer) req.query.referer = 'https://www.eporner.com/';
    } else if (urlLower.includes('pornhub') || urlLower.includes('phncdn') || urlLower.includes('puzzland')) {
        headers['Referer'] = 'https://www.pornhub.com/';
        headers['Cookie'] = 'age_verified=1; platform=pc; bs=s;';
        headers['Origin'] = 'https://www.pornhub.com';
        if (!req.query.referer) req.query.referer = 'https://www.pornhub.com/';
    } else if (urlLower.includes('xvideos') || urlLower.includes('xv-cdn') || urlLower.includes('xnxx')) {
        const domain = urlLower.includes('xnxx') ? 'xnxx.com' : 'xvideos.com';
        headers['Referer'] = `https://www.${domain}/`;
        headers['Origin'] = `https://www.${domain}`;
        headers['Cookie'] = 'age_verified=1;';
        if (!req.query.referer) req.query.referer = `https://www.${domain}/`;
    } else if (urlLower.includes('xhamster') || urlLower.includes('xhcdn')) {
        const fakeIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        headers['Referer'] = 'https://xhamster.com/';
        headers['Origin'] = 'https://xhamster.com';
        headers['Cookie'] = 'age_verified=1; platform=pc; bs=s;';
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        headers['X-Forwarded-For'] = fakeIp;
        if (!req.query.referer) req.query.referer = 'https://xhamster.com/';
    } else if (urlLower.includes('3dporndude')) {
        headers['Referer'] = 'https://3dporndude.com/';
        headers['Origin'] = 'https://3dporndude.com';
        if (!req.query.referer) req.query.referer = 'https://3dporndude.com/';
    } else if (urlLower.includes('porcore')) {
        headers['Referer'] = 'https://porcore.com/';
    } else if (urlLower.includes('hanime') || urlLower.includes('htv-') || urlLower.includes('streamable.cloud') || urlLower.includes('mcloud.to') || urlLower.includes('cloudvideo') || urlLower.includes('highwinds-cdn.com')) {
        headers['Referer'] = 'https://hanime.tv/';
        headers['Origin'] = 'https://hanime.tv';
    } else if (urlLower.includes('teenxy') || urlLower.includes('ahvcdn')) {
        headers['Referer'] = 'https://teenxy.com/';
        headers['Origin'] = 'https://teenxy.com';
    } else if (urlLower.includes('cdn')) {
        headers['Referer'] = 'https://www.google.com/';
    }

    if (req.headers.range) headers['Range'] = req.headers.range;

    try {
        // TS segments need longer timeout as they can be large
        const requestTimeout = isSegment ? 60000 : 25000;

        const response = await axios.get(targetUrl, {
            responseType: isM3u8 ? 'text' : 'stream',
            timeout: requestTimeout,
            headers: headers,
            maxRedirects: 10,
            validateStatus: (status) => status < 500
        });

        // 🛡️ Explicit error handling for CDN errors (403/404)
        if (response.status >= 400) {
            console.error(`❌ [M3U8 Proxy CDN Error] Status: ${response.status} for ${targetUrl.substring(0, 100)}...`);
            return res.status(response.status).send(`CDN Error: ${response.status}`);
        }

        if (isM3u8) {
            let content = response.data;

            // 🛡️ Strict M3U8 Check: If CDN returns 200 OK but NOT a manifest (e.g., Captcha/HTML)
            if (typeof content !== 'string' || !content.includes('#EXTM3U')) {
                const peek = typeof content === 'string' ? content.substring(0, 150).replace(/\n/g, ' ') : 'binary data';
                console.error(`❌ [M3U8 Proxy Error] Invalid Manifest Payload: ${peek}`);
                return res.status(403).send('Invalid manifest received from CDN.');
            }

            if (typeof content === 'string' && content.includes('#EXTM3U')) {
                console.log(`📡 [M3U8 Proxy Content Type]: ${response.headers['content-type']} | Length: ${content.length}`);
                console.log(`📄 [M3U8 Proxy Content Start]: ${content.substring(0, 100).replace(/\n/g, ' ')}...`);
                const finalUrl = response.request.res.responseUrl || targetUrl;
                const targetUrlObj = new URL(finalUrl);
                const masterQuery = targetUrlObj.search;

                // Debug Pornhub HLS
                if (urlLower.includes('phncdn') || urlLower.includes('pornhub')) {
                    console.log(`🔍 [PH HLS] Master URL: ${finalUrl.substring(0, 80)}...`);
                    console.log(`🔍 [PH HLS] Master Query: ${masterQuery}`);
                    console.log(`🔍 [PH HLS] Content lines: ${content.split('\n').length}`);
                }

                // Propagate security params to segments (avoid duplicates)
                const queryParams = [];
                // Only add referer if not already in the target URL
                if (req.query.referer && !targetUrl.includes('referer=')) {
                    queryParams.push(`referer=${encodeURIComponent(req.query.referer)}`);
                }
                if (req.query.origin && !targetUrl.includes('origin=')) {
                    queryParams.push(`origin=${encodeURIComponent(req.query.origin)}`);
                }
                if (req.query.headers) {
                    queryParams.push(`headers=${encodeURIComponent(req.query.headers)}`);
                }
                const extraParams = queryParams.length > 0 ? '&' + queryParams.join('&') : '';

                const proxyBase = `http://${req.headers.host}/api/m3u8-proxy?url=`;

                let segmentCount = 0;
                content = content.split('\n').map(line => {
                    line = line.trim();
                    if (!line || line.startsWith('#EXT-X-VERSION')) return line;

                    if (line.startsWith('#')) {
                        if (line.startsWith('#EXT-X-KEY:') || line.startsWith('#EXT-X-MAP:')) {
                            return line.replace(/URI="([^"]+)"/, (match, uri) => {
                                const absUrl = uri.startsWith('http') ? uri : new URL(uri, finalUrl).href;
                                return `URI="${proxyBase}${encodeURIComponent(absUrl)}${extraParams}"`;
                            });
                        }
                        return line;
                    }

                    // Resolve absolute URL based on final redirected URL
                    let absUrl = line.startsWith('http') ? line : new URL(line, finalUrl).href;
                    segmentCount++;

                    // 🛡️ Critical Fix: Correctly merge master tokens into segment URLs
                    if (masterQuery) {
                        const separator = absUrl.includes('?') ? '&' : '?';
                        const cleanM = masterQuery.startsWith('?') ? masterQuery.substring(1) : masterQuery;

                        // Avoid doubling the same parameters
                        const cleanMasterParts = cleanM.split('&').filter(part => {
                            const key = part.split('=')[0];
                            return !absUrl.includes(key + '=');
                        });

                        if (cleanMasterParts.length > 0) {
                            absUrl += separator + cleanMasterParts.join('&');
                        }
                    }

                    const result = `${proxyBase}${encodeURIComponent(absUrl)}${extraParams}`;

                    // Debug first few segments
                    if ((urlLower.includes('phncdn') || urlLower.includes('pornhub')) && segmentCount <= 3) {
                        console.log(`🔍 [PH HLS] Segment ${segmentCount}: ${result.substring(0, 100)}...`);
                    }

                    return result;
                }).join('\n');
            }
            res.set({
                'Content-Type': 'application/vnd.apple.mpegurl',
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': '*'
            });
            res.set('Cache-Control', 'no-store');
            return res.send(content);
        }

        // --- MP4/Webm/TS High-Performance Pipe with Range Support ---
        res.status(response.status);
        let contentType = response.headers['content-type'] || 'video/mp4';
        if (targetUrl.includes('.webm')) contentType = 'video/webm';
        if (targetUrl.includes('.ts') || (targetUrl.includes('.html') && (targetUrl.includes('htv-phoenix') || targetUrl.includes('hanime')))) {
            contentType = 'video/mp2t';
        }
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'no-store');

        ['content-range', 'accept-ranges', 'content-length'].forEach(h => {
            if (response.headers[h]) res.set(h, response.headers[h]);
        });

        response.data.pipe(res);

        // Clean up on client disconnect
        req.on('close', () => { if (response.data.destroy) response.data.destroy(); });
        response.data.on('error', (e) => { console.error('❌ [Stream Pipe Error]', e.message); });

    } catch (e) {
        const status = e.response ? e.response.status : 'No Status';
        console.error(`❌ [M3U8 Proxy Error] Status: ${status} | Error: ${e.message} | URL: ${targetUrl.substring(0, 100)}...`);
        if (!res.headersSent) res.status(e.response ? e.response.status : 500).send('Proxy Error: ' + e.message);
    }
});

// --- API: Fallback Stream Relay (Standard HTTP Bridge) ---
app.get('/api/stream', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send('Missing URL');

    // Normalize protocol-less URLs (XHamster common issue)
    if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;

    // Prevent double-proxying
    if (videoUrl.includes('/api/m3u8-proxy?url=')) {
        try { videoUrl = decodeURIComponent(videoUrl.split('url=')[1]); } catch (e) { }
    }

    console.log(`📡 [Relay Stream] Request for: ${videoUrl}`);

    // 2. Prepare Headers
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    if (req.headers.range) headers['Range'] = req.headers.range;

    // 3. Inject Site-Specific Headers
    try {
        const u = new URL(videoUrl);
        const host = u.hostname.toLowerCase();
        headers['Host'] = u.hostname;

        if (host.includes('xnxx') || host.includes('thumb-cdn77')) {
            headers['Referer'] = 'https://www.xnxx.com/';
            headers['Origin'] = 'https://www.xnxx.com';
            headers['Cookie'] = 'age_verified=1; bs=s;';
        } else if (host.includes('xvideos') || host.includes('xv-cdn')) {
            headers['Referer'] = 'https://www.xvideos.com/';
            headers['Origin'] = 'https://www.xvideos.com';
            headers['Cookie'] = 'age_verified=1; bs=s;';
        } else if (host.includes('eporner')) {
            headers['Referer'] = req.query.referer || 'https://www.eporner.com/';
            headers['Origin'] = 'https://www.eporner.com';
            headers['Cookie'] = 'age_verified=1; bs=s;';
            headers['Accept'] = '*/*';
            // Removed Sec-Fetch headers as they might be causing detection in streaming mode
        } else if (host.includes('pornhub') || host.includes('phncdn')) {
            headers['Referer'] = 'https://www.pornhub.com/';
            headers['Origin'] = 'https://www.pornhub.com';
            headers['Cookie'] = 'age_verified=1; platform=pc; bs=s;';

        } else if (host.includes('xhamster') || host.includes('xhcdn')) {
            headers['Referer'] = 'https://xhamster.com/';
            headers['Origin'] = 'https://xhamster.com';
        } else if (host.includes('3dporndude')) {
            headers['Referer'] = 'https://3dporndude.com/';
            headers['Origin'] = 'https://3dporndude.com';
        } else if (host.includes('porcore')) {
            headers['Referer'] = 'https://porcore.com/';
        } else if (host.includes('teenxy') || host.includes('ahvcdn')) {
            headers['Referer'] = 'https://teenxy.com/';
            headers['Origin'] = 'https://teenxy.com';
        }
    } catch (e) {
        // URL parsing failed, continue without site-specific headers
    }

    // 4. Make the request
    try {
        const response = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: headers,
            timeout: 30000,
            validateStatus: () => true
        });

        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}`);
        }

        res.status(response.status);
        res.set('Content-Type', response.headers['content-type'] || 'video/mp4');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'no-store');

        ['content-range', 'accept-ranges', 'content-length'].forEach(h => {
            if (response.headers[h]) res.set(h, response.headers[h]);
        });

        response.data.pipe(res);
        req.on('close', () => { if (response.data.destroy) response.data.destroy(); });
    } catch (e) {
        console.error(`❌ [Stream Error]: ${e.message}`);
        if (!res.headersSent) res.status(500).send('Stream Error');
    }
});

// --- 🎬 FFmpeg Stream Endpoint for Pornhub HLS (Transcode to MP4 on-the-fly) ---
app.get('/api/ffmpeg-stream', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send('Missing URL');

    // Check ffmpeg availability
    if (!ffmpegAvailable) {
        return res.status(503).send('FFmpeg not available');
    }

    console.log(`🎬 [FFmpeg Stream] Starting for: ${videoUrl.substring(0, 80)}...`);

    // Prepare Pornhub headers
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    let headersArr = [
        `User-Agent: ${userAgent}`,
        'Referer: https://www.pornhub.com/',
        'Origin: https://www.pornhub.com',
        'Cookie: age_verified=1; platform=pc; bs=s;'
    ];

    const headersStr = headersArr.join('\r\n') + '\r\n';

    // Set response headers
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    // FFmpeg command for live transcoding
    const command = ffmpeg(videoUrl)
        .inputOptions([
            '-headers', headersStr,
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '60',
            '-timeout', '30000000',
            '-analyzeduration', '10000000',
            '-probesize', '10000000',
            '-allowed_extensions', 'ALL'
        ])
        .outputOptions([
            '-c:v copy',           // Copy video codec (no re-encode)
            '-c:a aac',            // Re-encode audio to AAC for compatibility
            '-b:a 128k',
            '-f mp4',
            '-movflags', 'frag_keyframe+empty_moov+faststart'
        ])
        .on('start', (cmd) => {
            console.log(`🎬 [FFmpeg Stream] Command started`);
        })
        .on('error', (err) => {
            if (err.message && err.message.includes('Output stream closed')) {
                console.log(`ℹ️ [FFmpeg Stream] Client disconnected`);
            } else {
                console.error(`❌ [FFmpeg Stream Error]:`, err.message);
                if (!res.headersSent) res.status(500).send('Stream Error: ' + err.message);
            }
        })
        .on('end', () => {
            console.log(`✅ [FFmpeg Stream] Finished`);
        });

    // Handle client disconnect
    req.on('close', () => {
        try {
            console.log(`🛑 [FFmpeg Stream] Client aborted`);
            command.kill('SIGKILL');
        } catch (e) { }
    });

    // Pipe to response
    command.pipe(res, { end: true });
});




// --- 🟢 Global Favorites Memory Cache 🟢 ---
let cachedFavs = [];
const reloadFavs = () => {
    try {
        if (fs.existsSync(favoritesFile)) {
            let data = fs.readFileSync(favoritesFile, 'utf8').trim();
            if (!data || data === "") data = '[]';
            // Remove any potential BOM or invisible characters
            data = data.replace(/^\uFEFF/, '');
            cachedFavs = JSON.parse(data);
            console.log(`📡 [Memory Cache] Loaded ${cachedFavs.length} items from favorites.json`);
        }
    } catch (e) {
        console.error("❌ [Memory Cache] Failed to reload favorites:", e.message);
        cachedFavs = []; // Fallback to empty array to prevent crashes
    }
};

// --- 🛠️ Global Universal Media Wrapper 🛠️ ---

function wrapGlobalMedia(item) {
    if (!item) return item;

    const wrap = (url) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) return url;
        if (url.includes('/api/image-proxy?url=') || url.includes('/api/stream?url=') || url.includes('/api/m3u8-proxy?url=') || url.includes('/hanime-proxy/')) return url;

        // Specially handle Hanime addon URLs to use our new relay
        if (url.includes(':57888/')) {
            const parts = url.split(':57888/');
            return `${SERVER_BASE}/hanime-proxy/${parts[1]}`;
        }

        return `${SERVER_BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
    };

    const newItem = { ...item };
    if (newItem.poster) newItem.poster = wrap(newItem.poster);
    if (newItem.thumbnail) newItem.thumbnail = wrap(newItem.thumbnail);
    if (newItem.preview) newItem.preview = wrap(newItem.preview);
    if (newItem.background) newItem.background = wrap(newItem.background);

    // 📼 PROXY VIDEO STREAMS
    if (Array.isArray(newItem.streams)) {
        newItem.streams = newItem.streams.map(s => {
            if (!s.url || !s.url.startsWith('http')) return s;
            if (s.url.includes('/api/stream?url=') || s.url.includes('/api/m3u8-proxy?url=')) return s;

            const isHls = s.url.includes('.m3u8') || (s.title && s.title.toLowerCase().includes('hls'));
            const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
            return { ...s, url: `${SERVER_BASE}${proxyPath}?url=${encodeURIComponent(s.url)}` };
        });
    }

    if (Array.isArray(newItem.related)) {
        newItem.related = newItem.related.map(r => wrapGlobalMedia(r));
    }

    return newItem;
}
reloadFavs(); // Initial load

// 🔥 AUTO-RELOAD: Watch for manual edits in favorites.json
if (fs.existsSync(favoritesFile)) {
    try {
        fs.watch(favoritesFile, (eventType) => {
            if (eventType === 'change') {
                console.log("♻️ [Memory Cache] favorites.json changed on disk, reloading...");
                reloadFavs();
            }
        });
    } catch (watchErr) {
        console.error("⚠️ [Watch Error] Could not watch favorites.json:", watchErr.message);
    }
} else {
    console.warn("⚠️ [Watch Skip] favorites.json not found, creating it...");
    fs.writeFileSync(favoritesFile, "[]");
}

// Pre-create storage directories
const storageBase = path.join(__dirname, 'favorites_storage');
if (!fs.existsSync(storageBase)) fs.mkdirSync(storageBase, { recursive: true });
['images', 'previews'].forEach(dir => {
    const p = path.join(storageBase, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.get('/api/image-proxy', async (req, res) => {
    let imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('No URL');

    // Clean URL
    imageUrl = imageUrl.replace(/&amp;/g, '&').trim();
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    try {
        const cleanBaseUrl = imageUrl.split('?')[0];
        const urlHash = crypto.createHash('md5').update(cleanBaseUrl).digest('hex');
        const urlLower = imageUrl.toLowerCase();
        // Robust detection: Is it a video preview or a static image?
        const isVid = (urlLower.match(/\.(mp4|webm|ogg|mov|ts)(\?.*)?$/i) || urlLower.includes('preview') || urlLower.includes('index-f'));

        // Define separate dedicated folders
        const storageDirName = isVid ? 'previews' : 'images';
        const storagePath = path.join(__dirname, 'favorites_storage', storageDirName);

        let ext = path.extname(cleanBaseUrl);
        if (!ext || ext.length > 5) ext = isVid ? '.mp4' : '.jpg';
        const localPath = path.join(storagePath, `${urlHash}${ext}`);

        // 1. Check if media exists in our permanent storage
        if (fs.existsSync(localPath)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            return res.sendFile(localPath);
        }

        // 2. Check memory cache (Aggressive Debug)
        let shouldCache = false;
        const targetFile = cleanBaseUrl.split('/').pop();

        console.log(`🔎 [Proxy Trace] Checking: ${targetFile} | Cache Size: ${cachedFavs.length}`);

        if (targetFile && targetFile.length > 5) {
            shouldCache = cachedFavs.some(f => {
                const fPoster = (f.poster || "").split('?')[0];
                const fThumb = (f.thumbnail || "").split('?')[0];
                const fPrev = (f.preview || "").split('?')[0];

                const match = fPoster.includes(targetFile) || fThumb.includes(targetFile) || fPrev.includes(targetFile);
                if (match) console.log(`🎯 [Match Found] ID: ${f.id} | Link: ${fPoster}`);
                return match;
            });
        }

        if (shouldCache) {
            console.log(`⭐ [Smart Cache] WILL SAVE: ${targetFile}`);
        } else {
            // Log first 3 items for debugging
            if (cachedFavs.length > 0) {
                console.log(`❌ [No Match] Sample from cache: ${cachedFavs[0].poster}`);
            }
            console.log(`☁️ [Proxy Only] SKIPPING SAVE: ${targetFile}`);
        }

        // --- 📡 Parallel Fetch (Fast & Direct) ---
        const headers = {
            'User-Agent': UA,
            'Accept': isVid ? 'video/*,*/*' : 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        };

        // 🌍 SMART UNIVERSAL REFERER
        try {
            const urlObj = new URL(imageUrl);
            const host = urlObj.hostname.toLowerCase();

            if (host.includes('xnxx') || host.includes('xv-cdn') || host.includes('xvideos')) {
                const domain = host.includes('xnxx') ? 'xnxx.com' : 'xvideos.com';
                headers['Referer'] = `https://www.${domain}/`;
                headers['Origin'] = `https://www.${domain}`;
            } else if (host.includes('phncdn') || host.includes('pornhub')) {
                headers['Referer'] = 'https://www.pornhub.com/';
                headers['Origin'] = 'https://www.pornhub.com';
                headers['Cookie'] = 'age_verified=1;';
            } else if (host.includes('xhcdn') || host.includes('xhamster')) {
                headers['Referer'] = 'https://xhamster.com/';
            } else if (host.includes('eporner')) {
                headers['Referer'] = 'https://www.eporner.com/';
                headers['Origin'] = 'https://www.eporner.com';
                headers['Cookie'] = 'age_verified=1; bs=s;';
            } else if (host.includes('hanime') || host.includes('htv-services')) {
                headers['Referer'] = 'https://hanime.tv/';
                headers['Origin'] = 'https://hanime.tv';
            } else {
                headers['Referer'] = `${urlObj.protocol}//${urlObj.hostname}/`;
            }
        } catch (e) {
            headers['Referer'] = 'https://www.google.com/';
        }

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: headers,
            maxRedirects: 5,
            httpAgent,
            httpsAgent
        });

        const contentType = response.headers['content-type'] || (isVid ? 'video/mp4' : 'image/jpeg');
        const buffer = Buffer.from(response.data);

        // Save to permanent storage ONLY if it's a favorite item
        if (shouldCache) {
            if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
            fs.writeFile(localPath, buffer, (err) => {
                if (err) console.error(`[Storage Error] Failed to write ${storageDirName}:`, err);
            });
        }

        // Serve to user
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(buffer);

    } catch (e) {
        console.warn(`⚠️ [Proxy Error] Failed: ${imageUrl} - ${e.message}`);
        res.status(404).send('Resource Expired');
    }
});


// --- API: Native Server Placeholder ---
app.get('/api/placeholder', (req, res) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="16">No Image</text></svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(svg);
});

// --- API: Server Info (UI Badge) ---
app.get('/api/server-info', (req, res) => {
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.')) {
                    localIp = iface.address;
                }
            }
        }
    }

    res.json({
        ip: localIp,
        port: PORT,
        url: `http://${localIp}:${PORT}`
    });
});

// --- Modular Native Scraper Addons (Automated Discovery above) ---


// --- API: List Existing Downloads ---
app.get('/api/downloads/list', (req, res) => {
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) return res.json([]);
    try {
        const files = fs.readdirSync(downloadsDir);
        res.json(files);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read downloads folder' });
    }
});

// --- API: Favorites Media Cache ---
// Cache image for a favorite item
app.post('/api/favorites/cache/image', async (req, res) => {
    const { id, url, source } = req.body;
    if (!id || !url) return res.status(400).json({ error: 'Missing id or url' });

    try {
        // Create filename based on source and id
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const ext = url.match(/\.(jpg|jpeg|png|webp|gif)($|\?)/i)?.[1] || 'jpg';
        const filename = `${source || 'unknown'}_${safeId}.${ext}`;
        const filePath = path.join(favImagesDir, filename);

        // Check if already cached
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 1000) { // At least 1KB
                return res.json({ success: true, cached: true, path: `/favorites_storage/images/${filename}` });
            }
        }

        // Download and cache
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': url.includes('pornhub') ? 'https://www.pornhub.com' :
                    url.includes('eporner') ? 'https://www.eporner.com' :
                        url.includes('xvideos') ? 'https://www.xvideos.com' : ''
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`🖼️ Cached image: ${filename}`);
        res.json({ success: true, cached: true, path: `/favorites_storage/images/${filename}` });
    } catch (e) {
        console.error('Image cache error:', e.message);
        res.status(500).json({ error: 'Failed to cache image', details: e.message });
    }
});

// Cache preview video for a favorite item
app.post('/api/favorites/cache/preview', async (req, res) => {
    const { id, url, source } = req.body;
    if (!id || !url) return res.status(400).json({ error: 'Missing id or url' });

    try {
        // Create filename based on source and id
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const ext = url.match(/\.(mp4|webm|m3u8)($|\?)/i)?.[1] || 'mp4';
        const filename = `${source || 'unknown'}_${safeId}.${ext}`;
        const filePath = path.join(favPreviewsDir, filename);

        // Check if already cached
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 10000) { // At least 10KB
                return res.json({ success: true, cached: true, path: `/favorites_storage/previews/${filename}` });
            }
        }

        // Download and cache
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'video/webm,video/mp4,video/*,*/*;q=0.8',
                'Referer': url.includes('pornhub') ? 'https://www.pornhub.com' :
                    url.includes('eporner') ? 'https://www.eporner.com' :
                        url.includes('xvideos') ? 'https://www.xvideos.com' : ''
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`🎬 Cached preview: ${filename}`);
        res.json({ success: true, cached: true, path: `/favorites_storage/previews/${filename}` });
    } catch (e) {
        console.error('Preview cache error:', e.message);
        res.status(500).json({ error: 'Failed to cache preview', details: e.message });
    }
});

// Check cache status for a favorite item
app.get('/api/favorites/cache/status', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sources = ['pornhub', 'eporner', 'xvideos', 'xnxx', 'hanime', 'porcore'];

    let imageCached = false;
    let previewCached = false;
    let imagePath = null;
    let previewPath = null;

    // Check all possible filenames
    for (const source of sources) {
        // Check images
        const imageExts = ['jpg', 'jpeg', 'png', 'webp'];
        for (const ext of imageExts) {
            const imgPath = path.join(favImagesDir, `${source}_${safeId}.${ext}`);
            if (fs.existsSync(imgPath)) {
                const stats = fs.statSync(imgPath);
                if (stats.size > 1000) {
                    imageCached = true;
                    imagePath = `/favorites_storage/images/${source}_${safeId}.${ext}`;
                    break;
                }
            }
        }

        // Check previews
        const previewExts = ['mp4', 'webm'];
        for (const ext of previewExts) {
            const prvPath = path.join(favPreviewsDir, `${source}_${safeId}.${ext}`);
            if (fs.existsSync(prvPath)) {
                const stats = fs.statSync(prvPath);
                if (stats.size > 10000) {
                    previewCached = true;
                    previewPath = `/favorites_storage/previews/${source}_${safeId}.${ext}`;
                    break;
                }
            }
        }

        if (imageCached && previewCached) break;
    }

    res.json({ imageCached, previewCached, imagePath, previewPath });
});

// Serve cached favorites media
app.use('/favorites_storage', express.static(favoritesStorageDir));

// --- API: Delete Cached Media from favorites_storage ---
app.post('/api/favorites/cache/delete', (req, res) => {
    const { id, source } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });

    try {
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sources = source ? [source] : ['pornhub', 'eporner', 'xvideos', 'xnxx', 'hanime', 'porcore', 'unknown'];

        let deletedFiles = [];

        // Check and delete image files
        const imageExts = ['jpg', 'jpeg', 'png', 'webp'];
        for (const src of sources) {
            for (const ext of imageExts) {
                const imgPath = path.join(favImagesDir, `${src}_${safeId}.${ext}`);
                if (fs.existsSync(imgPath)) {
                    fs.unlinkSync(imgPath);
                    deletedFiles.push(`images/${src}_${safeId}.${ext}`);
                }
            }
        }

        // Check and delete preview files
        const previewExts = ['mp4', 'webm'];
        for (const src of sources) {
            for (const ext of previewExts) {
                const prvPath = path.join(favPreviewsDir, `${src}_${safeId}.${ext}`);
                if (fs.existsSync(prvPath)) {
                    fs.unlinkSync(prvPath);
                    deletedFiles.push(`previews/${src}_${safeId}.${ext}`);
                }
            }
        }

        console.log(`🗑️ Deleted cached media for ${id}:`, deletedFiles);
        res.json({ success: true, deletedFiles });
    } catch (e) {
        console.error('Error deleting cached media:', e);
        res.status(500).json({ error: 'Failed to delete cached media' });
    }
});

// --- API: Delete Downloaded File by Name Pattern ---
app.post('/api/downloads/delete', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    try {
        const downloadsDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDir)) return res.json({ success: false, message: 'Downloads folder not found' });

        const files = fs.readdirSync(downloadsDir);
        const cleanName = name.replace(/[\\/:*?"<>|]/g, '_').toLowerCase();

        // Find files that match the name (fuzzy matching)
        const matchedFiles = files.filter(file => {
            const fileLower = file.toLowerCase();
            const nameLower = cleanName.toLowerCase();
            // Check if filename contains the name or vice versa
            return fileLower.includes(nameLower) || nameLower.includes(fileLower.replace(/\.[^.]+$/, ''));
        });

        let deletedCount = 0;
        for (const file of matchedFiles) {
            try {
                fs.unlinkSync(path.join(downloadsDir, file));
                console.log(`🗑️ Deleted file on favorite removal: ${file}`);
                deletedCount++;
            } catch (e) { }
        }

        res.json({ success: true, deleted: deletedCount, files: matchedFiles });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete file' });
    }
});


function getLocalIp() {
    const interfaces = os.networkInterfaces();
    let bestIp = '127.0.0.1';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                // Prefer common local network ranges
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
                    return iface.address;
                }
                bestIp = iface.address;
            }
        }
    }
    return bestIp;
}

// --- MEDIA SERVER INTEGRATION ---
const MEDIA_SERVER_URL = 'http://localhost:7000';

// Proxy endpoint to fetch local videos from media_server.py
app.get('/api/local-videos', async (req, res) => {
    try {
        const response = await axios.get(`${MEDIA_SERVER_URL}/api/videos`, {
            timeout: 5000,
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json'
            }
        });
        res.json({
            success: true,
            source: 'local',
            videos: response.data,
            serverUrl: MEDIA_SERVER_URL
        });
    } catch (error) {
        console.warn('[Media Server] Could not fetch local videos:', error.message);
        res.status(503).json({
            success: false,
            error: 'Media Server unavailable',
            message: 'Make sure media_server.py is running on port 7000'
        });
    }
});

// Proxy video stream from media server
app.get('/api/local-video/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const videoUrl = `${MEDIA_SERVER_URL}/video/${encodeURIComponent(filename)}`;

        const response = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': UA,
                'Accept': '*/*',
                'Range': req.headers.range || 'bytes=0-'
            }
        });

        // Forward content type
        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.set('Content-Length', response.headers['content-length']);
        }
        if (response.headers['accept-ranges']) {
            res.set('Accept-Ranges', response.headers['accept-ranges']);
        }

        response.data.pipe(res);
    } catch (error) {
        console.error('[Media Server] Video proxy error:', error.message);
        res.status(502).json({
            success: false,
            error: 'Video unavailable',
            message: error.message
        });
    }
});

// Check media server status
app.get('/api/local-status', async (req, res) => {
    try {
        const response = await axios.get(`${MEDIA_SERVER_URL}`, {
            timeout: 3000,
            method: 'HEAD'
        });
        res.json({
            success: true,
            online: true,
            url: MEDIA_SERVER_URL,
            message: 'Media Server is online'
        });
    } catch (error) {
        res.json({
            success: true,
            online: false,
            url: MEDIA_SERVER_URL,
            message: 'Media Server is offline'
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Antigravity Core v4.0 is online!`);
    console.log(`📡 Local Access: http://localhost:${PORT}`);
    console.log(`🌍 Network Access: http://${getLocalIp()}:${PORT}`);
    console.log(`📁 Download Path: ${downloadsDir}`);
    console.log(`⭐ Favorites Cache: ${cachedFavs.length} items loaded`);
    console.log(`🔥 Media Server: ${MEDIA_SERVER_URL} (direct link)`);
    console.log(`--------------------------------------------------\n`);
}); console.log(`⭐ Favorites Cache: ${cachedFavs.length} items loaded`);
console.log(`🔥 Media Server: ${MEDIA_SERVER_URL} (direct link)`);
console.log(`--------------------------------------------------\n`);
;