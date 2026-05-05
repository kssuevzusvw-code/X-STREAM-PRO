const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// --- Hanime Modular Source ---
// This source bridges the X-STREAM platform with the Hanime Stremio Addon logic
// located in the 'hanime-stremio-main' directory.

const addonPath = path.join(__dirname, '../../hanime-stremio-main');
const libPath = path.join(addonPath, 'lib');

// Import logic from the addon folder
// We need to be careful with relative requires inside the addon
const config = require(path.join(libPath, 'config'));
const logger = require(path.join(libPath, 'logger'));
const constants = require(path.join(libPath, 'constants'));
const HanimeApiClient = require(path.join(libPath, 'clients', 'hanime_api_client'));
const UserApiManager = require(path.join(libPath, 'clients', 'user_api_manager'));
const { CatalogHandler, MetaHandler, StreamHandler } = require(path.join(libPath, 'handlers'));

// Initialize components
const apiClient = new HanimeApiClient(config);
const userApiManager = new UserApiManager();
const catalogHandler = new CatalogHandler(apiClient, logger, config);
const metaHandler = new MetaHandler(apiClient, logger, config);
const streamHandler = new StreamHandler(apiClient, logger, config, userApiManager);

// Default credentials from the previously hardcoded setup
const DEFAULT_CONFIG = {
    email: "alwaleedkh209@gmail.com",
    password: "waleed1w2"
};

/**
 * Helper to parse Stremio-style config from URL or use defaults
 */
function getArgs(req, id, extra = {}) {
    let userConfig = DEFAULT_CONFIG;
    
    const pathParts = req.originalUrl.split('/');
    const configPart = pathParts.find(p => p.startsWith('%7B') || p.startsWith('{'));
    
    if (configPart) {
        try {
            userConfig = JSON.parse(decodeURIComponent(configPart));
        } catch (e) {
            console.error("Failed to parse Hanime config from URL:", e.message);
        }
    }

    return {
        id: id,
        type: 'anime',
        config: userConfig,
        extra: extra
    };
}

/**
 * Helper to fix local URLs returned by the addon (e.g. 10.x.x.x or localhost)
 * to point to our proxy instead.
 */
function fixUrls(item) {
    const proxyBase = '/hanime-proxy';
    
    const rewrite = (url) => {
        if (!url || typeof url !== 'string') return url;
        if (url.includes('192.168.') || url.includes('10.25.')) {
            // Extract the path after the IP/Port
            const pathMatch = url.match(/http:\/\/[^/]+(\/.*)/);
            if (pathMatch) {
                let subPath = pathMatch[1];
                return `${proxyBase}${subPath}`;
            }
        }
        return url;
    };

    if (item.poster) item.poster = rewrite(item.poster);
    if (item.thumbnail) item.thumbnail = rewrite(item.thumbnail);
    if (item.background) item.background = rewrite(item.background);
    if (item.logo) item.logo = rewrite(item.logo);
    
    if (item.preview) item.preview = rewrite(item.preview);
    if (item.previewUrl) item.previewUrl = rewrite(item.previewUrl);
    
    return item;
}

// --- Routes ---

router.get('/manifest.json', (req, res) => {
    const manifest = require(path.join(addonPath, 'addon')).manifest;
    res.json(manifest);
});

// Catalog Route
router.get([
    '/catalog/:type/:id.json',
    '/catalog/:type/:id/search=:query.json',
    '/catalog/:type/:id/skip=:skip.json',
    '/catalog/:type/:id/search=:query/skip=:skip.json',
    '/catalog/:type/:id/genre=:genre.json',
    '/catalog/:type/:id/genre=:genre/skip=:skip.json'
], async (req, res) => {
    try {
        const { type, id, query, skip, genre } = req.params;
        const extra = {};
        if (query) extra.search = query.replace('.json', '');
        if (skip) extra.skip = parseInt(skip.replace('.json', ''));
        if (genre) extra.genre = genre.replace('.json', '');

        const args = getArgs(req, id, extra);
        const result = await catalogHandler.handle(args);
        
        // Ensure metas have the correct source info for X-STREAM UI
        if (result && result.metas) {
            result.metas = result.metas.map(m => {
                const fixed = fixUrls(m);
                return {
                    ...fixed,
                    _source: { id: 'hanime', name: 'Hanime', type: 'anime' }
                };
            });
        }
        
        res.json(result);
    } catch (e) {
        console.error("Hanime Source Error (Catalog):", e.message);
        res.status(500).json({ metas: [] });
    }
});

// Meta Route
router.get('/meta/:type/:id.json', async (req, res) => {
    try {
        const { type, id } = req.params;
        const args = getArgs(req, id.replace('.json', ''));
        const result = await metaHandler.handle(args);
        
        if (result && result.meta) {
            fixUrls(result.meta);
            result.meta._source = { id: 'hanime', name: 'Hanime', type: 'anime' };
        }
        
        res.json(result);
    } catch (e) {
        console.error("Hanime Source Error (Meta):", e.message);
        res.status(500).json({ meta: null });
    }
});

// Stream Route
router.get('/stream/:type/:id.json', async (req, res) => {
    try {
        const { type, id } = req.params;
        const args = getArgs(req, id.replace('.json', ''));
        const result = await streamHandler.handle(args);
        
        // Wrap streams with global proxy for reliability
        if (result && result.streams) {
            result.streams = result.streams.map(s => {
                // Determine the best proxy route based on the stream type
                let proxyUrl = s.url;
                if (s.url.includes('.m3u8')) {
                    proxyUrl = `/api/m3u8-proxy?url=${encodeURIComponent(s.url)}&headers=${encodeURIComponent(JSON.stringify({
                        'Referer': 'https://hanime.tv/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }))}`;
                } else {
                    proxyUrl = `/api/stream?url=${encodeURIComponent(s.url)}&headers=${encodeURIComponent(JSON.stringify({
                        'Referer': 'https://hanime.tv/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }))}`;
                }

                return {
                    ...s,
                    url: proxyUrl,
                    _source: { id: 'hanime', name: 'Hanime', type: 'anime' }
                };
            });
        }
        
        res.json(result);
    } catch (e) {
        console.error("Hanime Source Error (Stream):", e.message);
        res.status(500).json({ streams: [] });
    }
});

module.exports = router;
