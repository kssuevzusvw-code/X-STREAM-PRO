const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');
const url = require('url');
const os = require('os');

const app = express();
app.use(cors());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 🛡️ Rate limiting for Eporner
const epornerLastRequest = { time: 0, count: 0 };
const epornerCache = new Map(); // Cache for video IDs

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Prevent the server from crashing on unhandled exceptions
process.on('uncaughtException', (err) => {
    console.error('🔥 [FATAL] Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// واجهة رئيسية بسيطة للتحقق من عمل السيرفر
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                <h1>📱 VPN Video Proxy Server is Running! 🖥️</h1>
                <p>This PC is acting as a proxy server.</p>
                <p>Use the endpoint <b>/proxy?url=YOUR_VIDEO_URL</b> to stream videos safely through this PC.</p>
            </body>
        </html>
    `);
});

app.get('/proxy', (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('Error: Missing video URL');
    }

    const originalUrl = videoUrl;
    let targetUrl = videoUrl;

    console.log(`\n▶️ [VPN Proxy] Request: ${targetUrl}`);

    const performRequest = async (urlToFetch, isFallBack = false) => {
        const parsedUrl = url.parse(urlToFetch);
        const isHanimeCDN = (urlToFetch.includes('hanime.tv') || urlToFetch.includes('streamable.cloud') || urlToFetch.includes('mcloud.to') || urlToFetch.includes('htv-services.com') || urlToFetch.includes('cloudvideo') || urlToFetch.includes('highwinds-cdn') || urlToFetch.includes('hydaelyn') || urlToFetch.includes('seg.prod.net'));
        const isEporner = urlToFetch.includes('eporner.com');
        const isPornhub = urlToFetch.includes('pornhub.com') || urlToFetch.includes('phncdn.com');

        // Smart Referer Guessing for Eporner if not provided
        let guessedReferer = req.query.referer;
        if (!guessedReferer && isEporner) {
            // If it's a dload link, try to guess the video page referer
            const idMatch = urlToFetch.match(/\/dload\/([a-zA-Z0-9]+)\//);
            if (idMatch) {
                guessedReferer = `https://www.eporner.com/video-${idMatch[1]}/`;
            } else {
                guessedReferer = 'https://www.eporner.com/';
            }
        }

        // 🛡️ Rate limiting for Eporner - more dynamic
        if (isEporner) {
            const now = Date.now();
            const timeSinceLast = now - epornerLastRequest.time;
            const minWait = epornerLastRequest.count % 5 === 0 ? 3000 : 800; // Occasionally wait longer, but usually fast
            if (timeSinceLast < minWait) {
                const waitTime = Math.floor(minWait - timeSinceLast);
                console.log(`⏳ [Rate Limit] Dynamic wait: ${waitTime}ms for Eporner...`);
                await sleep(waitTime);
            }
            epornerLastRequest.time = Date.now();
            epornerLastRequest.count++;
        }

        const selectedUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        const randomIp = () => `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        const fakeIp = randomIp();

        const headers = {
            'User-Agent': selectedUA,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
            'Accept-Encoding': 'identity',
            'X-Forwarded-For': fakeIp,
            'X-Real-IP': fakeIp,
            'Referer': guessedReferer || (isHanimeCDN ? 'https://hanime.tv/' : (isEporner ? 'https://www.eporner.com/' : (isPornhub ? 'https://www.pornhub.com/' : (parsedUrl.protocol + '//' + parsedUrl.hostname + '/')))),
            'Cookie': (isPornhub || isEporner) ? 'age_verified=1; platform=pc; bs=s; ss=1; hide_ads=1; mediapref=MP4; _h1s=true; _h1c=true; m=1; w=1920; h=1080; c=24; il_vw=1; hasVisited=1; _h1d=true;' : '',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'same-origin',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        };

        // Remove Origin for Eporner to avoid detection on direct MP4 links
        if (!isEporner && !isPornhub) {
            headers['Origin'] = isHanimeCDN ? 'https://hanime.tv' : (parsedUrl.protocol + '//' + parsedUrl.hostname);
        }

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        console.log(`📡 [VPN Proxy] Outgoing Headers for ${isEporner ? 'Eporner' : (isPornhub ? 'Pornhub' : 'Source')}:`);
        console.log(`   - Referer: ${headers['Referer']}`);
        console.log(`   - Cookie: ${headers['Cookie'] ? 'Present' : 'None'}`);

        // 🛡️ Special Eporner Session Fix for 4K/2K
        const fetchWithSession = async (currentUrl) => {
            if (isEporner && (currentUrl.includes('/2160/') || currentUrl.includes('/1440/'))) {
                try {
                    console.log(`🔐 [Eporner Session] Fetching fresh session for high-res...`);
                    const pageUrl = headers['Referer'] || 'https://www.eporner.com/';
                    const pageResp = await axios.get(pageUrl, { headers: { 'User-Agent': selectedUA, 'Cookie': 'age_verified=1; bs=s;' }, timeout: 10000 });
                    const pageHtml = pageResp.data;
                    const hashMatch = pageHtml.match(/hash\s*[:=]\s*["']([a-z0-9]+)["']/i);

                    if (hashMatch) {
                        const newHash = hashMatch[1];
                        console.log(`✅ [Eporner Session] New Hash: ${newHash}`);
                        // Update the URL with the fresh hash
                        currentUrl = currentUrl.replace(/[a-z0-9]{32}/i, newHash);
                        // Sync cookies from response
                        if (pageResp.headers['set-cookie']) {
                            headers['Cookie'] = pageResp.headers['set-cookie'].join('; ');
                        }
                    }
                } catch (sessErr) {
                    console.warn(`⚠️ [Eporner Session] Failed to refresh: ${sessErr.message}`);
                }
            }
            return currentUrl;
        };

        let retries = 0;
        const maxRetries = 3;
        const baseDelay = 1000;

        const doRequest = async () => {
            const finalUrl = await fetchWithSession(urlToFetch);
            try {
                const response = await axios({
                    method: 'get',
                    url: finalUrl,
                    responseType: 'stream',
                    headers: headers,
                    timeout: 60000,
                    maxRedirects: 10,
                    decompress: true,
                    validateStatus: (status) => status >= 200 && status < 400
                });
                return response;
            } catch (err) {
                if ((err.response?.status === 429 || err.response?.status === 403) && retries < maxRetries) {
                    retries++;
                    const delay = baseDelay * Math.pow(2, retries - 1);
                    console.log(`🔄 [Retry ${retries}/${maxRetries}] Error ${err.response?.status}, waiting ${delay}ms...`);
                    await sleep(delay);
                    return doRequest();
                }
                throw err;
            }
        };

        doRequest().then(response => {
            console.log(`📥 [VPN Proxy] Response: ${response.status} | Size: ${response.headers['content-length'] || 'unknown'}`);

            const safeHeaders = { ...response.headers };
            safeHeaders['Access-Control-Allow-Origin'] = '*';
            safeHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS, HEAD';
            safeHeaders['Access-Control-Allow-Headers'] = '*';
            safeHeaders['Cache-Control'] = 'public, max-age=3600';

            // Forward important headers for seeking
            if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);

            res.writeHead(response.status, safeHeaders);

            // Use pipeline for more robust streaming
            const stream = require('stream');
            stream.pipeline(response.data, res, (err) => {
                if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
                    console.error('❌ [VPN Proxy] Pipeline Error:', err.message);
                }
            });
        }).catch(err => {
            if (!isFallBack && err.response?.status === 404 && urlToFetch !== originalUrl) {
                console.warn(`⚠️ [VPN Proxy] Cleaned URL failed (404). Falling back to original: ${originalUrl}`);
                performRequest(originalUrl, true);
                return;
            }

            console.error(`❌ [VPN Proxy] Error fetching ${urlToFetch.substring(0, 50)}... :`, err.message);
            if (!res.headersSent) {
                const status = err.response?.status || 500;
                res.status(status).send(`Proxy Error (${status}): ${err.message}`);
            }
        });
    };

    (async () => {
        await performRequest(targetUrl);
    })();
});

// بروكسي للتعامل مع ملفات HLS (M3U8) وقوائم التشغيل
app.get('/manifest', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("No URL provided");

    const originalUrl = videoUrl;
    let targetUrl = videoUrl;

    const fetchManifest = async (urlToFetch, isFallBack = false) => {
        try {
            const isHanimeCDN = (urlToFetch.includes('hanime.tv') || urlToFetch.includes('streamable.cloud') || urlToFetch.includes('mcloud.to') || urlToFetch.includes('htv-services.com'));
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': isHanimeCDN ? 'https://hanime.tv/' : (urlToFetch.includes('eporner.com') ? 'https://www.eporner.com/' : (url.parse(urlToFetch).protocol + '//' + url.parse(urlToFetch).hostname + '/')),
                'Origin': isHanimeCDN ? 'https://hanime.tv' : (urlToFetch.includes('eporner.com') ? 'https://www.eporner.com' : (url.parse(urlToFetch).protocol + '//' + url.parse(urlToFetch).hostname)),
                'Cookie': urlToFetch.includes('eporner.com') || urlToFetch.includes('pornhub.com') ? 'age_verified=1; bs=s;' : ''
            };
            const response = await axios.get(urlToFetch, { headers: headers });

            let content = response.data;
            if (typeof content === 'string' && content.includes('#EXTM3U')) {
                const baseUrl = urlToFetch.substring(0, urlToFetch.lastIndexOf('/') + 1);

                content = content.replace(/^([^\s#]+)$/gm, (match) => {
                    const fullUrl = match.startsWith('http') ? match : (baseUrl + match);
                    if (fullUrl.includes('.m3u8')) return `/manifest?url=${encodeURIComponent(fullUrl)}`;
                    return `/proxy?url=${encodeURIComponent(fullUrl)}`;
                });

                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            } else {
                res.setHeader('Content-Type', response.headers['content-type'] || 'text/plain');
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(content);
        } catch (err) {
            if (!isFallBack && err.response?.status === 404 && urlToFetch !== originalUrl) {
                return fetchManifest(originalUrl, true);
            }
            if (!res.headersSent) res.status(err.response?.status || 500).send("Error fetching manifest");
        }
    };

    fetchManifest(targetUrl);
});

app.get('/play', (req, res) => {
    const videoUrl = req.query.url;
    const referer = req.query.referer || "";
    if (!videoUrl) return res.status(400).send("No URL provided");

    const isM3u8 = videoUrl.toLowerCase().includes('.m3u8') || videoUrl.toLowerCase().includes('m3u8') || videoUrl.toLowerCase().includes('index-f');
    const isEporner = videoUrl.includes('eporner.com');
    const proxyEndpoint = isM3u8 ? '/manifest' : '/proxy';
    const streamUrl = `${proxyEndpoint}?url=${encodeURIComponent(videoUrl)}${referer ? '&referer=' + encodeURIComponent(referer) : ''}`;

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>مشغل الفيديو - VPN Proxy</title>
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; background-color: #000; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; }
                .player-wrapper { width: 100%; max-width: 1200px; position: relative; display: flex; flex-direction: column; align-items: center; }
                video { width: 100%; max-height: 100vh; background: #000; outline: none; box-shadow: 0 10px 50px rgba(0,0,0,0.8); }
                .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; z-index: 10; pointer-events: none; }
                .spinner { width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.1); border-top-color: #ffa500; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .error-msg { display: none; color: #ff4444; background: rgba(255,0,0,0.1); padding: 15px; border-radius: 8px; border: 1px solid #ff4444; margin: 20px; text-align: center; }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
        </head>
        <body>
            <div class="player-wrapper">
                <div id="error" class="error-msg"></div>
                <div class="loading" id="loader">
                    <div class="spinner"></div>
                    <div>جاري التحميل الآمن...</div>
                </div>
                <video id="video" controls autoplay playsinline></video>
            </div>

            <script>
                const video = document.getElementById('video');
                const loader = document.getElementById('loader');
                const error = document.getElementById('error');
                const videoSrc = "${streamUrl}";
                const isM3u8 = ${isM3u8};

                video.addEventListener('playing', () => { loader.style.display = 'none'; });
                
                video.addEventListener('error', (e) => {
                    loader.style.display = 'none';
                    error.style.display = 'block';
                    const isEporner = ${isEporner};
                    if (isEporner && video.error?.code === 4) {
                        error.innerHTML = " رابط Eporner منتهي الصلاحية!<br><small>روابط Eporner تعمل لمدة محدودة فقط.</small><br><br><button onclick='location.reload()' style='padding:10px 20px;background:#ffa500;border:none;border-radius:5px;cursor:pointer;'>🔄 تحديث الصفحة</button>";
                    } else {
                        error.textContent = "حدث خطأ أثناء تحميل الفيديو. قد يكون الرابط منتهي الصلاحية أو تم حظره من المصدر.";
                    }
                    console.error('Video Error:', video.error);
                });

                if (isM3u8 && Hls.isSupported()) {
                    const hls = new Hls({ debug: false, startLevel: -1 });
                    hls.loadSource(videoSrc);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        video.play().catch(e => console.log('Auto-play prevented'));
                    });
                    hls.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            loader.style.display = 'none';
                            error.style.display = 'block';
                            error.textContent = "فشل تحميل ملف البث (HLS Error).";
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = videoSrc;
                } else {
                    video.src = videoSrc;
                    video.play().catch(e => console.log('Auto-play prevented'));
                }
            </script>
        </body>
        </html>
    `);
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    let backupIp = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.')) {
                    return iface.address;
                }
                backupIp = iface.address;
            }
        }
    }
    return backupIp;
}

// 🎯 استخراج روابط Eporner طازجة مباشرة من صفحة الفيديو
app.get('/extract-eporner', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl || !videoUrl.includes('eporner.com')) {
        return res.status(400).json({ error: 'Invalid Eporner URL' });
    }

    console.log(`\n🔍 [Eporner Extractor] Fetching fresh links from: ${videoUrl}`);

    try {
        // Fetch the video page
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cookie': 'age_verified=1; platform=pc; bs=s; ss=1;',
                'Referer': 'https://www.eporner.com/'
            },
            timeout: 15000
        });

        const html = response.data;

        // Extract video ID from the page
        const idMatch = html.match(/\/dload\/([a-zA-Z0-9]+)\//);
        const videoId = idMatch ? idMatch[1] : null;

        if (!videoId) {
            return res.status(404).json({ error: 'Could not extract video ID' });
        }

        console.log(`✅ Found Video ID: ${videoId}`);

        // Look for download hash in the page
        const hashMatch = html.match(/hash\s*=\s*["']([a-z0-9]+)["']/i) ||
            html.match(/"hash":"([a-z0-9]+)"/i);
        const downloadHash = hashMatch ? hashMatch[1] : null;

        // Try to find links directly in the HTML
        const downloadLinks = [];

        // Method 1: Find dload links directly in HTML
        const dloadMatches = html.matchAll(/\/dload\/[^"'\s]+\.mp4/g);
        for (const match of dloadMatches) {
            const fullUrl = match[0].startsWith('http') ? match[0] : `https://www.eporner.com${match[0]}`;
            const qualityMatch = fullUrl.match(/(\d+)p\.mp4/);
            if (qualityMatch) {
                downloadLinks.push({
                    quality: qualityMatch[1] + 'p',
                    url: fullUrl
                });
            }
        }

        // Method 2: Look for links with hash if found
        if (downloadHash && downloadLinks.length === 0) {
            const qualities = ['2160', '1440', '1080', '720', '480', '360', '240'];
            qualities.forEach(q => {
                downloadLinks.push({
                    quality: q + 'p',
                    url: `https://www.eporner.com/dload/${videoId}/${q}/${downloadHash}-${q}p.mp4`
                });
            });
        }

        // Remove duplicates and sort by quality
        const uniqueLinks = [...new Map(downloadLinks.map(item => [item.quality, item])).values()]
            .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

        if (uniqueLinks.length === 0) {
            return res.status(404).json({ error: 'No download links found' });
        }

        console.log(`✅ Found ${uniqueLinks.length} quality options`);

        res.json({
            videoId,
            downloadHash,
            qualities: uniqueLinks,
            source: videoUrl
        });

    } catch (err) {
        console.error('❌ [Eporner Extractor] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log('\\n═══════════════════════════════════════════════════════════════');
    console.log(`📡 الجهاز الآن يعمل كـ سيرفر (VPN PROXY SERVER active)`);
    console.log(`📱 لتشغيل الفيديوهات من الهاتف، تأكد أنك متصل بنفس شبكة الـ Wi-Fi.`);
    console.log(`🌐 للتشغيل المباشر للفيديوهات العادية (MP4):`);
    console.log(`   http://${localIp}:${PORT}/proxy?url=رابط_الفيديو`);
    console.log(`🌐 لتشغيل قوائم البث المستمر (M3U8 / HLS):`);
    console.log(`   http://${localIp}:${PORT}/manifest?url=رابط_ملف_البث`);
    console.log(`🎯 لاستخراج روابط Eporner طازجة:`);
    console.log(`   http://${localIp}:${PORT}/extract-eporner?url=https://www.eporner.com/video-XXXX/...`);
    console.log('═══════════════════════════════════════════════════════════════\\n');
});
