const puppeteer = require('puppeteer');

/**
 * 🕵️‍♂️ Advanced Eporner Browser Resolver
 * Uses a headless browser to capture signed HLS URLs with security tokens.
 */
async function resolveEpornerWithBrowser(targetUrl) {
    console.log(`🕵️‍♂️ [Browser Resolver] Starting for: ${targetUrl}`);

    let browser = null;
    try {
        console.log(`🚀 [Browser Resolver] Launching Puppeteer...`);
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        console.log(`📄 [Browser Resolver] Opening new page...`);
        const page = await browser.newPage();

        // 🛡️ Set realistic headers
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });

        let signedUrls = [];

        // 🕸️ Network Interception: Catch the m3u8 requests
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            const isHls = url.includes('.m3u8');
            const isCdn = url.includes('cdn.eporner.com') || url.includes('xnxx-cdn.com');

            if (isHls && isCdn) {
                console.log(`🎯 [Browser Resolver] Captured URL: ${url.substring(0, 100)}...`);
                signedUrls.push(url);
            }
            request.continue();
        });

        // 🚀 Navigate and wait
        console.log(`🌐 [Browser Resolver] Navigating to target...`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for potential player container
        try {
            console.log(`⏳ [Browser Resolver] Waiting for player tech...`);
            await page.waitForSelector('.vjs-tech, video, #video-player', { timeout: 10000 });
        } catch (e) {
            console.log("⚠️ [Browser Resolver] Player selector not found, waiting for network...");
        }

        // 🖱️ Click play if needed
        try {
            const playButton = await page.$('.vjs-big-play-button');
            if (playButton) {
                console.log(`🖱️ [Browser Resolver] Clicking play button...`);
                await playButton.click();
            }
        } catch (e) { }

        // ⏱️ Wait for network activity to settle
        console.log(`⏳ [Browser Resolver] Settling (8s)...`);
        await new Promise(r => setTimeout(r, 8000));

        const finalUA = await page.evaluate(() => navigator.userAgent);
        console.log(`✅ [Browser Resolver] Done. Found ${signedUrls.length} links.`);

        await browser.close();

        return {
            urls: [...new Set(signedUrls)],
            userAgent: finalUA
        };
    } catch (err) {
        console.error(`❌ [Browser Resolver] Fatal Error:`, err.message);
        if (browser) await browser.close();
        return { urls: [], userAgent: null };
    }
}

module.exports = { resolveEpornerWithBrowser };
