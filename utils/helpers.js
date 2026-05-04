const axios = require('axios');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 10000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 10000, rejectUnauthorized: false });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PORT = 3000;
const SERVER_BASE = ''; // Make relative to work on any LAN IP

const scraperFetch = async (targetUrl, timeout = 25000, headers = {}) => {
    const defaultHeaders = {
        'User-Agent': UA,
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
    if (urlLower.includes('eporner')) {
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
    } else if (urlLower.includes('xhamster')) {
        defaultHeaders['Referer'] = 'https://xhamster.com/';
        defaultHeaders['Cookie'] = 'age_verified=1; bs=s;';
    }

    const finalHeaders = { ...defaultHeaders, ...headers };

    try {
        console.log(`📡 [scraperFetch] Direct: ${targetUrl.substring(0, 100)}...`);
        const fetchTimeout = urlLower.includes('eporner') ? 12000 : timeout;
        const res = await axios.get(targetUrl, {
            timeout: fetchTimeout,
            headers: finalHeaders,
            httpAgent,
            httpsAgent
        });
        if (!res.data) throw new Error('Empty response');
        return res.data;
    } catch (e) {
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

function wrapGlobalMedia(item) {
    if (!item) return item;

    const wrap = (url) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) return url;
        if (url.includes('/api/image-proxy?url=') || url.includes('/api/stream?url=') || url.includes('/api/m3u8-proxy?url=') || url.includes('/hanime-proxy/')) return url;

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

module.exports = {
    scraperFetch,
    wrapGlobalMedia,
    UA,
    SERVER_BASE,
    httpAgent,
    httpsAgent
};
