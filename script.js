// ═══════════════════════════════════════════════════════════════
// X-STREAM - Premium 8K Video Aggregator Platform
// Enhanced with Smart Fetching, IndexedDB, HLS.js, Privacy Features
// ═══════════════════════════════════════════════════════════════

// --- Configuration ---
const CONFIG = {
    APP_NAME: 'X-STREAM',
    VERSION: '3.5.0',
    DEBUG_MODE: true,

    // UI Settings
    UI: {
        PAGE_SIZE: 40,
        CAROUSEL_INTERVAL: 5000,
        THEME: 'dark',
        LANGUAGE: 'en', // Default to English for user interface
    },

    // Storage Keys
    STORAGE: {
        AGE_VERIFIED: 'x_stream_age_verified',
        CACHE_KEY: 'x_stream_content_cache',
        ACTIVE_ITEM: 'x_stream_current_playing',
        HISTORY: 'x_stream_watch_history',
        CONTINUE: 'x_stream_continue_progress'
    },

    // Player Settings
    PLAYER: {
        DEFAULT_QUALITY: 1080,
        AUTO_PLAY: true,
        ASPECT_RATIO: '16:9',
        SEEK_STEP: 10, // Seconds for forward/rewind
    },

    // Network & API
    API: {
        RETRIES: 3,
        TIMEOUT: 10000,
        PROXIES: [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?'
        ]
    },
    SERVER_IP: window.location.hostname,
    SERVER_URL: window.location.origin,
    MEDIA_SERVER_URL: window.location.protocol + '//' + window.location.hostname + ':7000'
};

const OnlyPornConfig = {
    addonId: "org.masterchief.onlyporn",
    version: "0.4.11",
    name: "OnlyPorn",

    catalogs: {
        eporner: {
            name: "Eporner",
            qualities: ["4k", "1080p", "60fps"],
            genres: ["Amateur", "Japanese", "Asian", "Big Tits", "Teens"]
        }



    }
};

// Default metadata for known sources to keep the rich UI experience
const SOURCE_METADATA = {
    eporner: {
        tags: ['OnlyPorn', 'HD', '4K', 'Eporner'],
        genres: ["4k Porn", "HD 1080p", "60fps", "Amateur", "Students", "Japanese", "Asian Porn", "Big Tits", "Teens", "Family", "Creampie", "Small Tits", "Uncategorized"],
        priority: ['eporner']
    },
    hanime: {
        tags: ['Hentai', 'Anime', 'Uncensored', 'HD'],
        genres: ['Recent', 'Most Likes', 'Most Views', 'Newest', 'Series'],
        priority: ['hanime', 'hanime-recent', 'hanime-mostlikes', 'hanime-mostviews', 'hanime-newest', 'hanime-series']
    },
    xvideos: {
        tags: ['Porn', 'HD', 'Amateur', 'Milf'],
        genres: ["Straight"],
        priority: ['xvideos']
    },
    pornhub: {
        tags: ['Porn', 'HD'],
        genres: ["Straight"],
        priority: ['pornhub']
    },
    xnxx: {
        tags: ['Porn', 'Amateur'],
        genres: ["Straight"],
        priority: ['xnxx']
    },
    '3dporndude': {
        tags: ['3D', 'Hentai', 'Games'],
        genres: ["3D Porn", "SFM", "Blender"],
        priority: ['3dporndude']
    },
    porcore: {
        tags: ['Porn', 'Hardcore'],
        genres: ["Straight", "Hardcore"],
        priority: ['porcore']
    },
    xhamster: {
        tags: ['Porn', 'HD', 'Amateur'],
        genres: ["Straight", "Amateur"],
        priority: ['xhamster']
    }
};

let SOURCES = [];

async function fetchDynamicSources() {
    try {
        console.log('📡 Fetching available sources...');
        const res = await fetch('/api/sources');
        const dynamicSources = await res.json();

        SOURCES = dynamicSources.map(s => {
            const meta = SOURCE_METADATA[s.id] || { tags: [s.name], genres: ['All'], priority: [s.id] };
            return {
                ...s,
                baseUrl: s.baseUrl || `http://${window.location.hostname}:3000/${s.id}/manifest.json`,
                tags: meta.tags,
                genres: meta.genres,
                priority: meta.priority
            };
        });

        console.log(`✅ Loaded ${SOURCES.length} dynamic sources.`);

        // After fetching sources, render the filters if on home/search/real pages
        renderDynamicSourceFilters();

        return SOURCES;
    } catch (e) {
        console.error('❌ Failed to fetch dynamic sources:', e);
        // Fallback to minimal sources if API fails
        SOURCES = [
            { id: 'eporner', name: 'Eporner', type: 'real', tags: ['Porn'], genres: ['All'], priority: ['eporner'], baseUrl: `http://${window.location.hostname}:3000/eporner/manifest.json` }
        ];
        return SOURCES;
    }
}

function renderDynamicSourceFilters() {
    // 1. Home Page "Hot Real Life" Filters
    const homeFilterContainer = document.getElementById('homeRealSourceFilters');
    if (homeFilterContainer && CURRENT_PAGE === 'home') {
        const realSources = SOURCES.filter(s => s.type === 'real');
        let html = `<button class="genre-pill ${window.currentHomeRealSource === 'all' ? 'active' : ''}" data-source="all">All</button>`;

        realSources.forEach(s => {
            html += `<button class="genre-pill ${window.currentHomeRealSource === s.id ? 'active' : ''}" data-source="${s.id}">${s.name}</button>`;
        });

        homeFilterContainer.innerHTML = html;

        // Re-attach click events
        homeFilterContainer.querySelectorAll('button').forEach(btn => {
            btn.onclick = () => {
                homeFilterContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.currentHomeRealSource = btn.dataset.source;
                const realGrid = document.getElementById('realGrid');
                if (realGrid) {
                    realGrid.innerHTML = '';
                    renderCategoryGrid('real', realGrid, false, 20, window.currentHomeRealSource);
                }
            };
        });
    }

    // 2. Generic Source Bar (Search, Real, Anime pages)
    const sourceBar = document.getElementById('source-bar');
    if (sourceBar) {
        const relevantSources = CURRENT_PAGE === 'anime'
            ? SOURCES.filter(s => s.type === 'anime')
            : (CURRENT_PAGE === 'real' ? SOURCES.filter(s => s.type === 'real') : SOURCES);

        let html = `<button class="source-pill genre-pill ${currentSourceFilter === 'all' ? 'active' : ''}" data-source="all" onclick="filterBySource('all')">All Sources</button>`;

        relevantSources.forEach(s => {
            html += `<button class="source-pill genre-pill ${currentSourceFilter === s.id ? 'active' : ''}" data-source="${s.id}" onclick="filterBySource('${s.id}')">${s.name}</button>`;
        });

        sourceBar.innerHTML = html;
    }
}


// Explicit terminology
const KEYWORD_ALIASES = {}; // Removed obfuscation to favor direct explicit terms

// --- DOM Selection Methods (Examples for learning) ---
/*
  Ways to select elements:
  1. document.getElementById('id'): Selects a single element by its ID.
  2. document.getElementsByClassName('class'): Selects a collection of elements by class name.
  3. document.getElementsByTagName('tag'): Selects a collection of elements by tag name (e.g., 'div', 'button').
  4. document.querySelector('.class / #id / tag'): Selects the FIRST element that matches a CSS selector.
  5. document.querySelectorAll('.class / tag'): Selects ALL elements that match a CSS selector (returns NodeList).
*/

// Usage examples:
const gridElement = document.getElementById('mainGrid'); // By ID
const allNavLinks = document.getElementsByClassName('nav-btn'); // By Class
const allButtons = document.getElementsByTagName('button'); // By Tag
const activeLink = document.querySelector('.nav-btn.active'); // By CSS Selector (first match)
const allCards = document.querySelectorAll('.card'); // By CSS Selector (all matches)

// --- Shorthand Helpers (Modern Way) ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Now you can use:
// const grid = $('#mainGrid');
// const buttons = $$('button');


// --- IndexedDB Setup ---
const DB_NAME = 'XStreamDB';
const DB_VERSION = 1;
const STORE_NAME = 'favorites';
let db = null;

async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function saveFavoriteDB(item) {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const itemWithTimestamp = { ...item, timestamp: Date.now() };
        const request = store.put(itemWithTimestamp);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function removeFavoriteDB(id) {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadFavoritesDB() {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// --- ☁️ Supabase Cloud Sync Helpers ---

async function saveFavoriteCloud(item) {
    if (typeof supabaseClient === 'undefined' || !window.userProfile) return;
    try {
        const { error } = await supabaseClient
            .from('user_favorites')
            .upsert({
                user_id: window.userProfile.id,
                media_id: item.id,
                media_data: item
            });
        if (error) console.error('Cloud Favorite Save Error:', error.message);
    } catch (e) { console.error('Cloud Sync Failed:', e); }
}

async function removeFavoriteCloud(id) {
    if (typeof supabaseClient === 'undefined' || !window.userProfile) return;
    try {
        const { error } = await supabaseClient
            .from('user_favorites')
            .delete()
            .eq('user_id', window.userProfile.id)
            .eq('media_id', id);
        if (error) console.error('Cloud Favorite Delete Error:', error.message);
    } catch (e) { console.error('Cloud Sync Failed:', e); }
}

// Throttling for cloud history saves
let lastHistorySave = {};

async function saveHistoryCloud(item, progress = 0) {
    if (typeof supabaseClient === 'undefined' || !window.userProfile) return;

    // Only save to cloud every 10 seconds per item to avoid spamming
    const now = Date.now();
    if (lastHistorySave[item.id] && (now - lastHistorySave[item.id] < 10000)) return;
    lastHistorySave[item.id] = now;

    try {
        const { error } = await supabaseClient
            .from('user_history')
            .upsert({
                user_id: window.userProfile.id,
                media_id: item.id,
                media_data: item,
                progress_percent: progress,
                last_watched: new Date().toISOString()
            });
        if (error) console.error('Cloud History Save Error:', error.message);
    } catch (e) { console.error('Cloud Sync Failed:', e); }
}

async function clearFavoritesDB() {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function syncUserCloudData() {
    if (typeof supabaseClient === 'undefined' || !window.userProfile) return;
    console.log('🔄 Syncing user data with cloud...');

    // Only show skeletons if we have nothing yet
    if (CURRENT_PAGE === 'favorites' && favorites.length === 0) showSkeletons();

    // 0. Clear local data to ensure user isolation
    await clearFavoritesDB();
    localStorage.removeItem(CONFIG.STORAGE.CONTINUE);

    // 1. Sync Favorites
    const { data: cloudFavs } = await supabaseClient
        .from('user_favorites')
        .select('media_data')
        .eq('user_id', window.userProfile.id);

    if (cloudFavs) {
        for (const f of cloudFavs) {
            await saveFavoriteDB(f.media_data);
        }
    }

    // 2. Sync History
    const { data: cloudHistory } = await supabaseClient
        .from('user_history')
        .select('*')
        .eq('user_id', window.userProfile.id)
        .order('last_watched', { ascending: false });

    if (cloudHistory) {
        const localHistory = {};
        cloudHistory.forEach(h => {
            localHistory[h.media_id] = h.media_data;
        });
        localStorage.setItem(CONFIG.STORAGE.CONTINUE, JSON.stringify(localHistory));
    }

    // Refresh UI
    if (typeof loadFavoritesFromDB === 'function') await loadFavoritesFromDB();
    if (typeof renderContinueWatching === 'function') renderContinueWatching();
}

// --- State ---
let allItems = [];
window.isFetchingMore = false;
let pageBySource = {}; // Track pages per source to allow infinite scrolling even with filters

let favorites = [];
let selectedItems = [];
let isBulkMode = false;
let triggeredDownloads = new Set();
let favoritesType = 'real';
let favoritesSource = 'all';
let currentView = 'home'; // 'home', 'search', 'favorites', 'anime', 'real'
let copiedItems = []; // Tracking successfully copied items
let currentFilter = 'all';
let currentSourceFilter = 'all';
let currentGenre = 'all';
let page = 0;
let sourcePages = {};
let art = null;
let currentSort = 'mixed';
let isSearching = false;
let searchDebounce = null;
window._gridItems = window._gridItems || {};
window.triggeredDownloads = new Set();

async function triggerCardDownload(itemId) {
    // Use the lookup map for reliable item data
    const item = window._gridItems[itemId] || favorites.find(i => i.id === itemId);
    if (!item) {
        console.error("Item data not found for download:", itemId);
        return;
    }

    // Mark as triggered in current session, but don't block subsequent clicks
    window.triggeredDownloads.add(itemId);

    // Update UI button state temporarily
    const btn = document.getElementById(`card-dl-${itemId}`);
    if (btn) {
        btn.classList.add('active-trigger');
        setTimeout(() => btn.classList.remove('active-trigger'), 500);
    }

    // 2. Show the progress overlay immediately
    const overlay = document.getElementById(`progress-${itemId}`);
    if (overlay) {
        overlay.classList.add('active');
        const statusText = overlay.querySelector('.status-text');
        if (statusText) statusText.innerText = 'Starting...';
    }

    // Perform download
    try {
        const rawName = decodeEntities(item.name || item.title || 'video');
        const cleanName = rawName.replace(/[\\/:*?"<>|]/g, '_');

        // Resolve streams if needed
        let videoUrl = item.videoUrl || item.url;
        if (!videoUrl) {
            const resolved = await resolveAllStreams(item);
            if (resolved && resolved.length > 0) {
                videoUrl = resolved[0].url;
            }
        }

        if (!videoUrl) throw new Error("Could not find download link");

        // 🚀 Browser-based direct download
        const downloadUrl = getDownloadUrl(videoUrl, cleanName);

        // Trigger browser download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${cleanName}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        toast("⬇️ Download started in browser", "var(--primary)");

        // Reset overlay after a delay since we can't track browser download progress easily here
        setTimeout(() => {
            if (overlay) overlay.classList.remove('active');
        }, 2000);

    } catch (e) {
        console.error("Card download failed:", e);
        window.triggeredDownloads.delete(itemId);
        // Reset UI if failed
        if (btn) {
            btn.classList.remove('done');
            btn.innerHTML = '<i class="fa-solid fa-download"></i>';
        }
        if (overlay) overlay.classList.remove('active');
        toast("❌ Download failed", "#ff4444");
    }
}
let currentPlayingIndex = -1;
let carouselItems = [];
let isAgeVerified = localStorage.getItem(CONFIG.STORAGE.AGE_VERIFIED) === 'true';
const CURRENT_PAGE = document.body.dataset.page || 'home';

let currentSlide = 0;
let revealObserver = null;
window.currentHomeRealSource = 'all';

const SOURCE_LOGOS = {
    eporner: 'https://www.google.com/s2/favicons?domain=eporner.com&sz=64',
    xvideos: 'https://www.google.com/s2/favicons?domain=xvideos.com&sz=64',
    xhamster: 'https://www.google.com/s2/favicons?domain=xhamster.com&sz=64',
    pornhub: 'https://www.google.com/s2/favicons?domain=pornhub.com&sz=64',
    xnxx: 'https://www.google.com/s2/favicons?domain=xnxx.com&sz=64',
    missav: 'https://www.google.com/s2/favicons?domain=missav.com&sz=64',
    hanime: 'https://www.google.com/s2/favicons?domain=hanime.tv&sz=64',
    '3dporndude': 'https://www.google.com/s2/favicons?domain=3dporndude.com&sz=64',
    cartoonpornvideos: 'https://www.google.com/s2/favicons?domain=cartoonpornvideos.com&sz=64',
    porcore: 'https://www.google.com/s2/favicons?domain=porcore.com&sz=64',
    default: 'https://www.google.com/s2/favicons?domain=github.com&sz=64'
};

// --- Helper Functions ---
function getProxiedUrl(url) {
    // Professional Dark Placeholder for missing/loading images
    if (!url || url === 'undefined' || url.length < 5) return 'https://placehold.co/600x400/1a1a1a/ffffff?text=No+Image';

    // Convert protocol-relative URLs (//)
    if (url.startsWith('//')) url = 'https:' + url;

    // Skip proxy for local base64 or relative images
    if (url.startsWith('data:') || url.startsWith('/') || url.startsWith('./')) return url;

    // 🛡️ Fix legacy URLs with hardcoded old IP (192.168.0.100) or internal ports (57888)
    if (url.includes('192.168.0.100') || url.includes(':57888')) {
        url = url.replace(/http:\/\/[^/:]+:3000/g, '');
        url = url.replace(/http:\/\/[^/:]+:57888/g, '/hanime-proxy');
    }

    // Check if it's already proxied by the root server or is a local URL
    const serverBase = CONFIG.SERVER_URL;
    if (url.includes('/api/image-proxy?url=') || url.includes('/proxy-image?url=') || url.includes(CONFIG.SERVER_IP) || url.includes('localhost')) {
        // If it's already a proxy URL but relative, make it absolute with the current origin
        if (url.startsWith('/api/')) return serverBase + url;
        return url;
    }

    const lower = url.toLowerCase();
    const isImg = lower.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i);
    const isVid = !isImg && (
        lower.match(/\.(mp4|m3u8|webm|ogg|mkv|mov|ts)(\?.*)?$/i) ||
        lower.includes('m3u8') ||
        lower.includes('preview') ||
        lower.includes('index-f')
    );

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Always proxy protected/IP-sensitive content
    const forcedProxy = url.includes('phncdn') || url.includes('cdn-eporner') || url.includes('xv-cdn') || url.includes('xhcdn') || url.includes('teenxy');

    if (!forcedProxy && !isVid && !isMobile) return url;

    // MANDATORY PROXY HOSTING
    const endpoint = isVid ? '/api/m3u8-proxy' : '/api/image-proxy';
    return `${serverBase}${endpoint}?url=${encodeURIComponent(url)}`;
}


function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}


// --- Helpers ---
function getCleanBase(url) {
    if (!url) return '';
    return url.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
}

function formatDuration(rawDuration) {
    if (!rawDuration) return "";
    let str = rawDuration.toString().toLowerCase().trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str;

    let hours = 0, minutes = 0, seconds = 0;
    const hMatch = str.match(/(\d+)\s*h/);
    const mMatch = str.match(/(\d+)\s*m/);
    const sMatch = str.match(/(\d+)\s*s/);

    if (hMatch) hours = parseInt(hMatch[1]);
    if (mMatch) minutes = parseInt(mMatch[1]);
    if (sMatch) seconds = parseInt(sMatch[1]);

    if (!hMatch && !mMatch && !sMatch) {
        const numMatch = str.match(/^(\d+)$/);
        if (numMatch) {
            minutes = parseInt(numMatch[1]);
        } else if (str.includes('sec')) {
            const secMatch = str.match(/(\d+)\s*sec/);
            if (secMatch) seconds = parseInt(secMatch[1]);
        } else if (str.includes('min')) {
            const minMatch = str.match(/(\d+)\s*min/);
            if (minMatch) minutes = parseInt(minMatch[1]);
        }
    }

    if (hours === 0 && minutes === 0 && seconds === 0) return str;

    let timeStr = "";
    if (hours > 0) {
        timeStr += hours + ":" + minutes.toString().padStart(2, '0') + ":";
    } else {
        timeStr += minutes + ":";
    }
    timeStr += seconds.toString().padStart(2, '0');
    return timeStr;
}

function decodeEntities(text) {
    if (!text) return "";
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// 🛡️ Smart Recovery for broken images with Persistent Retries
async function handleImageError(img, id, sourceId, type = 'movie') {
    const maxRetries = 5;
    let retries = parseInt(img.dataset.retries || '0');

    if (retries >= maxRetries) {
        console.warn(`🛑 [Recovery] Max retries reached for: ${id}`);
        img.src = 'https://placehold.co/600x400/1a1a1a/ffffff?text=Image+Unavailable';
        return;
    }

    img.dataset.retries = (retries + 1).toString();
    // Use random jitter (0-2000ms) plus backoff to spread out concurrent requests
    const jitter = Math.floor(Math.random() * 2000);
    const delay = (Math.pow(2, retries) * 500) + jitter;

    console.log(`📡 [Recovery] Scheduled recovery for ${id} in ${delay}ms...`);

    // Show a loading style
    img.style.filter = 'grayscale(100%) opacity(0.3)';

    setTimeout(async () => {
        const source = SOURCES.find(s => s.id === sourceId);
        if (!source) return;

        try {
            const cleanBase = getCleanBase(source.baseUrl);

            // 🧼 Deep Clean ID for Pornhub/Eporner/XNXX
            let cleanId = id;
            if (sourceId === 'pornhub') {
                cleanId = cleanId.replace('pornhub_', '').replace(/^ph/, '').replace(/^ph/, '');
            } else if (sourceId === 'eporner') {
                cleanId = cleanId.replace('eporner_', '').replace('ep_', '');
            } else if (sourceId === 'xnxx') {
                cleanId = cleanId.replace('xnxx_', '').replace('xn_', '');
            }

            // Ensure we bypass server-side caching for meta
            const metaUrl = `${cleanBase}/meta/${type}/${encodeURIComponent(cleanId)}.json?nocache=${Date.now()}`;

            const data = await fetchJsonWithRetry(metaUrl, 1);
            let freshMeta = null;
            if (data && data.meta) {
                // Merge with existing but prefer fresh URLs
                freshMeta = normalizeItem(data.meta, source);
            }

            if (freshMeta && (freshMeta.poster || freshMeta.thumbnail)) {
                const freshPoster = freshMeta.poster || freshMeta.thumbnail;
                console.log(`✅ [Recovery Success] ${id} URL Refreshed.`);
                img.src = getProxiedUrl(freshPoster);
                img.style.filter = '';

                // Update favorites & persist
                if (typeof favorites !== 'undefined') {
                    const idx = favorites.findIndex(f => f.id === id);
                    if (idx !== -1) {
                        favorites[idx] = { ...favorites[idx], ...freshMeta };
                        if (typeof saveFavoriteDB === 'function') saveFavoriteDB(favorites[idx]);
                    }
                }
            } else {
                if (retries < maxRetries - 1) {
                    // Try again
                    img.src = 'https://placehold.co/600x400/1a1a1a/ffffff?text=Retrying...';
                }
            }
        } catch (e) {
            console.warn(`❌ [Recovery Error] ${id}:`, e.message);
        }
    }, delay);
}

/**
 * Radical Solution: Standardizes inconsistent metadata from various sources.
 * Replaces "undefined" with smart fallbacks from IDs/URLs.
 */
function normalizeItem(item, source) {
    // 🛡️ Safety: Ensure source is always defined to prevent crashes
    source = source || item._source || { id: 'eporner', name: 'Eporner', type: 'real' };
    // 1. Safe Title Recovery
    let name = decodeEntities(item.name || item.title || item.label || "");
    console.log(`🔍 [DEBUG] Video Metadata for: ${name}`, item);

    if (!name && item.id) {
        if (item.id.includes('3dporndude_')) {
            try {
                const b64 = item.id.split('_')[1];
                const url = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
                const slug = url.split('/').filter(Boolean).pop();
                name = slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
            } catch (e) { name = "3D Animation"; }
        } else if (item.id.startsWith('porcore_')) {
            name = "Porcore Video #" + item.id.split('_')[1];
        } else if (item.id.includes('http')) {
            try {
                const parts = item.id.split('/');
                const last = parts[parts.length - 1];
                name = last.split('?')[0].replace(/-/g, ' ')
                    .replace(/xh[a-zA-Z0-9]+$/, '') // Clean xhamster IDs
                    .replace(/^\w/, c => c.toUpperCase())
                    .trim();
            } catch (e) { name = "Porn Video"; }
        } else if (item.id.startsWith('xh_')) {
            try {
                const slug = item.id.replace('xh_', '').split('-').filter(s => isNaN(s) && s.length > 2).join(' ');
                if (slug) name = slug.replace(/^\w/, c => c.toUpperCase());
            } catch (e) { }
        }
    }
    if (!name) name = "Untitled Video";
    name = name.replace(/<[^>]*>?/gm, '').trim();

    // 2. Poster Fallback Chain (Exclude video formats)
    const isVid = (url) => typeof url === 'string' && url.match(/\.(mp4|m3u8|webm)(\?.*)?$/i);
    const posterCandidates = [item.poster, item.thumbnail, item.background, item.image, item.thumbnail_url];
    let poster = posterCandidates.find(p => p && !isVid(p)) || "";

    // Last resort: Only use preview if it's NOT a video
    if (!poster && item.preview && !isVid(item.preview)) {
        poster = item.preview;
    }

    // 3. Preview URL extraction from various potential fields
    let preview = item.preview || item.previewUrl || item.thumbnail_video || item.videopv || item.previd || item.preview_url || item.thumbnail_preview || item.trailer || (item.trailers && item.trailers[0] ? item.trailers[0].url : "");

    // 🌟 Multi-Source Detection & Preview Reconstruction (Enhanced)
    if (item.id) {
        const idLower = item.id.toLowerCase();
        let targetSourceId = source.id; // Fallback to current source (eporner)
        let alphaId = ""; // Real alphanumeric ID for the site
        let numericId = ""; // Real numeric CID or ID

        // Detect actual site from ID prefix (OnlyPorn uses prefixes like xh_, xv_, ph, etc)
        if (idLower.startsWith('xh_')) targetSourceId = 'xhamster';
        else if (idLower.startsWith('xv_')) targetSourceId = 'xvideos';
        else if (idLower.startsWith('ph')) targetSourceId = 'pornhub';
        else if (idLower.startsWith('xn_')) targetSourceId = 'xnxx';
        else if (idLower.startsWith('sb_')) targetSourceId = 'spankbang';
        else if (idLower.startsWith('rh_')) targetSourceId = 'redtube';
        else if (idLower.startsWith('ma_')) targetSourceId = 'missav';
        else if (idLower.startsWith('3dporndude_')) targetSourceId = '3dporndude';
        else if (idLower.startsWith('porcore_')) targetSourceId = 'porcore';

        // Attempt to extract Site ID from various identifiers
        const rawId = item.id.split(':').pop();
        if (rawId.includes('L3') || rawId.startsWith('ep_L3')) {
            try {
                // Remove prefix if present before decoding
                const base64Data = rawId.replace(/^(xh_|xv_|ep_|xn_|sb_|ph)/i, '');
                const decoded = atob(base64Data.replace(/-/g, '+').replace(/_/g, '/'));
                const parts = decoded.split('/');
                alphaId = parts.find(p => p.length > 5 && /^[a-zA-Z0-9_-]+$/.test(p)) || "";
                numericId = decoded.match(/\d{5,}/) ? decoded.match(/\d{5,}/)[0] : "";
            } catch (e) { }
        } else {
            alphaId = rawId.replace(/^(xh_|xv_|ep_|xn_|sb_|ph)/i, '');
            numericId = alphaId.match(/\d{5,}/) ? alphaId.match(/\d{5,}/)[0] : "";
        }

        const actualSource = SOURCES.find(s => s.id === targetSourceId) || source;

        // --- Site-Specific Poster/Preview Improvements ---
        let finalPoster = poster;

        // --- Site-Specific Preview Generators ---
        if (!preview) {
            // A. Eporner ...
            if (targetSourceId === 'eporner' || source.id === 'eporner') {
                if (finalPoster && (finalPoster.includes('/thumbs/'))) {
                    const parts = finalPoster.split('/');
                    if (parts.length >= 2) {
                        if (numericId) {
                            preview = parts.slice(0, -1).join('/') + `/${numericId}-preview.webm`;
                        } else {
                            preview = parts.slice(0, -1).join('/') + '/preview.mp4';
                        }
                    }
                }
                if (!preview && numericId && numericId.length >= 5) {
                    const d1 = numericId.substring(0, 1), d2 = numericId.substring(0, 2), d3 = numericId.substring(0, 3);
                    preview = `https://static-ca-cdn.eporner.com/thumbs/static4/${d1}/${d2}/${d3}/${numericId}/${numericId}-preview.webm`;
                }
                if (!preview && numericId) {
                    const prefix = numericId.substring(0, 2);
                    preview = `https://static-cdn.eporner.com/thumbs/static/${prefix}/${numericId}/preview.mp4`;
                }
            }
            // C. PornHub 
            else if (targetSourceId === 'pornhub' && finalPoster.includes('phncdn.com')) {
                // DON'T strip tokens here anymore! We need them for the first fetch to cache the image.
                // The image-proxy will handle hashing only the base path.
                if (!preview) {
                    preview = finalPoster.split('?')[0].replace(/\/\d+(?:_\d+)?\.(?:jpg|webp|png)$/, '/preview.mp4');
                }
            }
            // D. XVideos ...
            else if (targetSourceId === 'xvideos' && (finalPoster.includes('xv-cdn') || finalPoster.includes('xvideos-cdn'))) {
                preview = finalPoster.replace(/\/\d+\.(?:jpg|webp)$/, '/preview.mp4').split('?')[0];
            }
        }

        // Check for cached media paths (favorites_storage)
        const cachedImagePath = getCachedMediaPath(item.id, targetSourceId, 'image');
        const cachedPreviewPath = getCachedMediaPath(item.id, targetSourceId, 'preview');

        // Use cached paths if available, otherwise use original URLs
        const finalPosterToUse = cachedImagePath && !cachedImagePath.includes('undefined') ? cachedImagePath : finalPoster;
        const finalPreviewToUse = cachedPreviewPath && !cachedPreviewPath.includes('undefined') ? cachedPreviewPath : preview;

        // Return updated object
        return {
            ...item,
            name: name,
            title: name,
            poster: finalPosterToUse,
            thumbnail: finalPosterToUse,
            preview: finalPreviewToUse,
            duration: item.duration || "",
            _source: actualSource,
            _tags: generateTags(item, actualSource)
        };
    }

    // Check for cached media paths (favorites_storage) for non-ID items
    const cachedImagePath2 = getCachedMediaPath(item.id, source.id, 'image');
    const cachedPreviewPath2 = getCachedMediaPath(item.id, source.id, 'preview');

    const finalPoster2 = cachedImagePath2 && !cachedImagePath2.includes('undefined') ? cachedImagePath2 : poster;
    const finalPreview2 = cachedPreviewPath2 && !cachedPreviewPath2.includes('undefined') ? cachedPreviewPath2 : preview;

    return {
        ...item,
        name: name,
        title: name,
        poster: finalPoster2,
        thumbnail: finalPoster2,
        preview: finalPreview2,
        duration: item.duration || "",
        _source: source,
        _tags: generateTags(item, source)
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Favorites Media Cache Helper ---
// Cache status store - populated when favorites page loads
window._favoritesCacheStatus = {};

// Check if media exists in favorites_storage and return local path
// Only returns cached path if we're on favorites page AND cache is confirmed
function getCachedMediaPath(itemId, source, type = 'image') {
    // Only use cached media for favorites page
    if (CURRENT_PAGE !== 'favorites') {
        return null;
    }

    const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cacheStatus = window._favoritesCacheStatus[safeId];

    // If we have confirmed cache status, use it
    if (cacheStatus) {
        if (type === 'image' && cacheStatus.imageCached && cacheStatus.imagePath) {
            return cacheStatus.imagePath;
        }
        if (type === 'preview' && cacheStatus.previewCached && cacheStatus.previewPath) {
            return cacheStatus.previewPath;
        }
    }

    return null;
}

// Populate cache status for all favorites
async function populateFavoritesCacheStatus() {
    if (CURRENT_PAGE !== 'favorites') return;

    for (const item of favorites) {
        const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        try {
            const res = await fetch(`/api/favorites/cache/status?id=${encodeURIComponent(item.id)}`);
            if (res.ok) {
                const data = await res.json();
                window._favoritesCacheStatus[safeId] = data;
            }
        } catch (e) {
            console.log('Cache status check failed for:', item.id);
        }
    }
    console.log('✅ Favorites cache status populated');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Fetch Dynamic Sources First
    await fetchDynamicSources();

    // Check age verification first
    if (!isAgeVerified) {
        showAgeGate();
        return;
    }

    await initIndexedDB();
    // Detect mobile for optimizations
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) CONFIG.UI.PAGE_SIZE = 24;

    await loadFavoritesFromDB();

    // 🚀 QUICK FEATURE: Direct URL Playback from parameters
    const params = new URLSearchParams(window.location.search);
    const directUrl = params.get('directUrl') || params.get('url');
    const sourceParam = params.get('source');

    if (sourceParam) {
        currentSourceFilter = sourceParam;
        console.log(`🎯 Filtering by source: ${sourceParam}`);

        // Sync UI pills shortly after DOM paint
        setTimeout(() => {
            document.querySelectorAll('.source-pill').forEach(pill => {
                pill.classList.toggle('active', pill.dataset.source === sourceParam);
            });
        }, 50);
    }

    if (directUrl) {
        console.log("🎬 Direct URL Playback Triggered:", directUrl);

        // Ensure we have a clean target URL
        let finalUrl = directUrl;
        if (directUrl.includes('url=')) {
            try {
                const potential = directUrl.split('url=')[1].split('&')[0];
                const decoded = decodeURIComponent(potential);
                if (decoded.startsWith('http')) finalUrl = decoded;
            } catch (e) { }
        }

        const virtualItem = {
            id: 'direct_' + Date.now(),
            name: "External Stream: " + finalUrl.split('/').pop().split('?')[0],
            url: finalUrl,
            _source: { id: 'direct', name: 'Direct Link', baseUrl: '' },
            poster: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop'
        };

        window.currentWatchItem = virtualItem;

        // Wait for player initialization
        const checkPlayerInit = setInterval(() => {
            if (typeof openPlayer === 'function' && typeof playUrl === 'function') {
                clearInterval(checkPlayerInit);
                openPlayer(virtualItem);
                // Force playUrl after a short delay to ensure DOM is ready
                setTimeout(() => playUrl(finalUrl, virtualItem), 500);
            }
        }, 100);

        // Cleanup interval after 5s if it fails
        setTimeout(() => clearInterval(checkPlayerInit), 5000);
    }

    // 1. Initialize UI Helpers first
    initRevealObserver();
    initServerStatus();
    initExtraFeatures();
    initVideoPreviewManager();
    await fetchDownloadedFiles();

    // Global Download Synchronization Loop
    setInterval(() => {
        if (typeof fetchDownloads === 'function') fetchDownloads();
        if (typeof fetchDownloadedFiles === 'function') fetchDownloadedFiles();
    }, 1500);

    initDownloadManager();
    initAutocomplete();

    // 2. Load and Render Content
    if (CURRENT_PAGE === 'watch') {
        showWatchSkeletons();
        initPlayer();
        await handleWatchPage();

        // Handle auto external player trigger
        if (localStorage.getItem('auto_external') === 'true') {
            localStorage.removeItem('auto_external');
            const checkReady = setInterval(() => {
                if (window.currentHlsUrl) {
                    clearInterval(checkReady);
                    showExternalPlayerOptions(window.currentHlsUrl, window.currentWatchItem?.name || 'Video');
                }
            }, 500);
            setTimeout(() => clearInterval(checkReady), 10000); // 10s timeout
        }
    } else if (CURRENT_PAGE === 'search') {
        const params = new URLSearchParams(window.location.search);
        const query = params.get('q');
        const type = params.get('type') || 'all';

        // Set UI values
        const searchInput = document.getElementById('searchInput');
        const searchType = document.getElementById('searchType');
        if (searchInput) searchInput.value = query || '';
        if (searchType) searchType.value = type;

        if (query) {
            await handleSearchPage(query, type);
        } else {
            await loadInitialContent();
        }
    } else {
        // Home, Anime, Real
        if (CURRENT_PAGE !== 'favorites') {
            await loadInitialContent();

            // Fetch local media videos on home page
            if (CURRENT_PAGE === 'home') {
                fetchLocalVideos();
                initContinueWatching();
            }
        } else {
            // Favorites page only
            initFavoritesFilters();

            // 🚀 Force immediate load and render on startup
            (async () => {
                await loadFavoritesFromDB();
                renderFavorites();
            })();

            // Smart auto-refresh: check favorites.json every 3 seconds
            let lastFavCount = favorites.length;
            setInterval(async () => {
                // Reload favorites from server (favorites.json)
                await loadFavoritesFromDB();

                // Check download status
                await updateFavoritesDownloadStatus();

                // Check if new favorites added
                if (favorites.length !== lastFavCount) {
                    lastFavCount = favorites.length;
                    // Re-render favorites grid
                    renderFavorites();
                    updateFavoritesUI();
                    console.log(`[Favorites] Updated from favorites.json: ${favorites.length} items`);
                }
            }, 3000);
        }
    }

    // Hot Real Life Filters (Home Page) - Handled by renderDynamicSourceFilters()


    setupSearch();
    setupInfiniteScroll();
    updateFavoritesUI();
    updateGenreBar('all');

    // Reload Data Button
    const reloadBtn = document.getElementById('btn-reload');
    if (reloadBtn) {
        reloadBtn.onclick = async (e) => {
            e.preventDefault();
            console.log('🔄 Full reload of video data...');
            showWatchSkeletons();
            await handleWatchPage();
        };
    }

    // Watch Page Favorite Button
    const watchFavBtn = document.getElementById('btn-watch-favorite');
    if (watchFavBtn) {
        watchFavBtn.onclick = (e) => toggleWatchFavorite(e);
    }

    // Safety Reveal Fallback: Ensure everything is visible after 3s even if observer fails
    setTimeout(() => {
        console.log("🛡️ Safety reveal triggered...");
        document.querySelectorAll('.card:not(.revealed), .skeleton-card:not(.revealed)').forEach(el => {
            el.classList.add('revealed');
        });
    }, 3000);
});

// --- Extra Features (Continue Watching, Back to Top, etc) ---
function initExtraFeatures() {
    // 1. Back to Top Button
    const topBtn = document.createElement('div');
    topBtn.className = 'back-to-top';
    topBtn.innerHTML = '↑';
    topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(topBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) topBtn.classList.add('visible');
        else topBtn.classList.remove('visible');
    });

    // Continue Watching removed as per user request
}

// --- Server Status ---
async function initServerStatus() {
    const badge = document.getElementById('server-status');
    const text = document.getElementById('server-ip');
    if (!badge || !text) return;

    try {
        const res = await fetch('/api/server-info');
        const data = await res.json();
        if (data && data.url) {
            badge.style.display = 'flex';
            badge.dataset.url = data.url;
            text.textContent = `Server: ${data.ip}:${data.port}`;
            console.log(`📡 [Server Info] Connected to: ${data.url}`);
        }
    } catch (e) {
        console.warn('Could not connect to server info API');
        badge.style.display = 'none';
    }
}

// --- Age Verification ---
function showAgeGate() {
    const ageGate = document.querySelector('#age-gate'); // Using querySelector instead of getElementById
    const confirmBtn = document.getElementById('age-confirm-btn');
    const checkbox = document.querySelector('input[type="checkbox"]#age-confirm-check'); // Using a specific CSS selector

    ageGate.classList.add('active');

    // Disable button until checkbox is checked
    confirmBtn.disabled = true;
    checkbox.addEventListener('change', () => {
        confirmBtn.disabled = !checkbox.checked;
    });

    confirmBtn.addEventListener('click', () => {
        if (checkbox.checked) {
            localStorage.setItem(CONFIG.STORAGE.AGE_VERIFIED, 'true');
            isAgeVerified = true;
            ageGate.classList.remove('active');

            // Initialize app
            setTimeout(async () => {
                try {
                    await initIndexedDB();
                    await loadFavoritesFromDB();
                    initRevealObserver();
                    initPlayer();
                    await loadInitialContent();
                    setupSearch();
                    setupInfiniteScroll();
                    updateFavoritesUI();
                    if (CURRENT_PAGE === 'favorites') {
                        initFavoritesFilters();
                        const refreshBtn = document.getElementById('refresh-library-btn');
                        if (refreshBtn) refreshBtn.onclick = refreshLibrary;
                        // Populate cache status for favorites media
                        populateFavoritesCacheStatus();
                    }
                    setInterval(nextSlide, CONFIG.UI.CAROUSEL_INTERVAL);

                    // Safety reveal after confirm
                    setTimeout(() => {
                        document.querySelectorAll('.card:not(.revealed), .skeleton-card:not(.revealed)').forEach(el => el.classList.add('revealed'));
                    }, 2000);
                } catch (e) {
                    console.error("Age confirmation init error:", e);
                }
            }, 300);
        }
    });
}

/**
 * Force Refresh Library Metadata
 * Loops through existing favorites and fetches fresh data (images, stream URLs) from sources.
 * This is useful after a VPN change or link expiration.
 */
async function refreshLibrary() {
    const btn = document.getElementById('refresh-library-btn');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = '<i class="fa-solid fa-sync fa-spin"></i> Refreshing...';

    // Support all scrapable sources for full library refresh
    const targetSources = ['pornhub', 'xnxx', 'eporner', 'porcore', '3dporndude', 'xvideos', 'hqporner', 'missav'];
    const targets = favorites.filter(f => {
        const s = f.source || (f._source ? f._source.id : "");
        return targetSources.includes(s);
    });

    if (targets.length === 0) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Library Healthy';
        setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; btn.classList.remove('loading'); }, 2000);
        return;
    }

    let updatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        const sId = item.source || (item._source ? item._source.id : "");
        btn.innerHTML = `<i class="fa-solid fa-sync fa-spin"></i> ${i + 1}/${targets.length}...`;

        try {
            const source = SOURCES.find(s => s.id === sId);
            if (!source) continue;

            // 🧼 Aggressive ID Cleaning per source
            let cleanId = item.id;
            if (sId === 'pornhub') {
                cleanId = cleanId.replace('pornhub_', '').replace(/^ph/, '').replace(/^ph/, '');
            } else if (sId === 'eporner') {
                cleanId = cleanId.replace('eporner_', '').replace('ep_', '');
            } else if (sId === 'xnxx') {
                cleanId = cleanId.replace('xnxx_', '').replace('xn_', '');
            } else if (sId === '3dporndude') {
                cleanId = cleanId.replace('3dporndude_', '');
            } else if (sId === 'hqporner') {
                cleanId = cleanId.replace('hqporner_', '').replace('hp_', '');
            }

            const metaUrl = `/${sId}/meta/movie/${encodeURIComponent(cleanId)}.json?nocache=${Date.now()}`;

            const res = await fetch(metaUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();

            if (data && data.meta) {
                const fresh = normalizeItem(data.meta, source);
                const idx = favorites.findIndex(f => f.id === item.id);
                if (idx !== -1) {
                    favorites[idx] = { ...favorites[idx], ...fresh };
                    // 1. Save to Local IndexedDB
                    await saveFavoriteDB(favorites[idx]);
                    // 2. Sync to Server
                    await fetch('/api/favorites', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(favorites[idx])
                    });
                    updatedCount++;
                }
            } else {
                failedCount++;
            }
        } catch (e) {
            console.warn(`❌ [Refresh] Failed for ${item.id}:`, e.message);
            failedCount++;
        }
    }

    btn.innerHTML = `<i class="fa-solid fa-check"></i> Fixed: ${updatedCount} | Failed: ${failedCount}`;
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        btn.classList.remove('loading');
        if (updatedCount > 0) renderFavorites();
    }, 4000);
}

async function loadFavoritesFromDB() {
    // Only show skeletons if we have no items in memory yet
    if (CURRENT_PAGE === 'favorites' && favorites.length === 0) showSkeletons();
    try {
        // 🔒 User Isolation: If logged in, skip global shared favorites
        if (window.userProfile) {
            console.log('👤 User logged in, using private cloud favorites only.');
            const raw = await loadFavoritesDB(); // Load from local IndexedDB (which syncUserCloudData populates)
            favorites = raw.map(item => normalizeItem(item, item._source));
            return;
        }

        // 1. Try to load from Server (Global Shared Favorites for guests)
        const serverRes = await fetch('/api/favorites');
        if (serverRes.ok) {
            const serverFavorites = await serverRes.json();
            // Re-normalize items to ensure latest preview URLs are reconstructed
            favorites = serverFavorites.map(item => normalizeItem(item, item._source));
            console.log(`Synced ${favorites.length} global favorites from Server`);

            // 2. Clear and update Local DB as Backup
            try {
                // We don't clear it every time, but maybe we should ensure it's in sync
                // For now, let the server be truth.
            } catch (dbE) { }
        } else {
            throw new Error("Server response not OK");
        }
    } catch (e) {
        console.warn('Sync failed, falling back to local storage:', e.message);
        try {
            const raw = await loadFavoritesDB();
            favorites = raw.map(item => normalizeItem(item, item._source));
            console.log(`Loaded ${favorites.length} favorites from local backup`);
        } catch (dbE) {
            favorites = [];
        }
    }
    // Sort newest first
    favorites.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // 🚀 Refresh UI
    if (typeof renderFavorites === 'function') renderFavorites();
}

async function renderFavorites() {
    const grid = document.getElementById('mainGrid');
    if (!grid || CURRENT_PAGE !== 'favorites') return;

    // Clear grid
    grid.innerHTML = '';

    // 1. Ensure absolute chronological sorting (Newest First)
    favorites.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let filtered = [...favorites];

    // 2. Filter by Type (Anime vs Real)
    if (favoritesType !== 'all') {
        filtered = filtered.filter(item => {
            const isAnime = (item.type === 'anime' || (item._source && item._source.id === 'hanime') || (item._source && item._source.type === 'anime'));
            return favoritesType === 'anime' ? isAnime : !isAnime;
        });
    }

    // 3. Filter by Source (Only for Real Life tab)
    if (favoritesType === 'real' && favoritesSource !== 'all') {
        filtered = filtered.filter(item => item._source && item._source.id === favoritesSource);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 6rem 2rem; color: #666; animation: fadeIn 0.5s ease;">
                <h2 style="color: #fff; margin-bottom: 10px;">No ${favoritesType === 'anime' ? 'Anime' : 'Real Life'} favorites yet.</h2>
                <p style="font-size: 1.1rem;">You haven't saved any ${favoritesType === 'anime' ? 'Anime/Hentai' : 'Real Life'} videos to your list yet.</p>
                <a href="${favoritesType === 'anime' ? 'anime.html' : 'real.html'}" class="btn-primary" style="display: inline-block; margin-top: 25px; padding: 12px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; background: var(--primary); color: #000;">Explore Content</a>
            </div>
        `;
        return;
    }

    // 4. Render directly WITHOUT allowing renderTargetGrid to re-sort
    const isVertical = favoritesType === 'anime';
    renderTargetGrid(grid, filtered, false, isVertical, true); // Added 'true' flag to prevent internal sorting if supported

    // Update tab counts
    updateFavoriteCounts();
}

function updateFavoriteCounts() {
    const tabs = document.querySelectorAll('.tab-btn');
    if (!tabs.length) return;

    const isItemAnime = (item) => {
        if (item.type === 'anime' || (item._source && (item._source.type === 'anime' || item._source.id === 'hanime'))) return true;
        return false;
    };

    const animeCount = favorites.filter(item => isItemAnime(item)).length;
    const realCount = favorites.length - animeCount;

    tabs.forEach(tab => {
        const type = tab.dataset.type;
        const count = type === 'anime' ? animeCount : realCount;
        const label = type === 'anime' ? 'Anime' : 'Real Life';
        tab.innerHTML = `${label} <span class="tab-count">(${count})</span>`;
    });
}

// --- Skeleton Loading UI ---
function showSkeletons(append = false, customCount = null) {
    const grids = CURRENT_PAGE === 'home' ? [$('#trendingGrid'), $('#realGrid'), $('#animeGrid')] : [$('#mainGrid')];

    grids.forEach((grid) => {
        if (!grid) return;
        // Detect if it should be vertical based on grid ID or page type
        let isVertical = grid.id === 'animeGrid' || (CURRENT_PAGE === 'anime' && grid.id === 'mainGrid');

        // Handle Favorites Page specifically based on active tab
        if (CURRENT_PAGE === 'favorites' && grid.id === 'mainGrid') {
            isVertical = (favoritesType === 'anime');
        }

        let skeletonHtml = '';
        let count = customCount || 20;
        if (!customCount) {
            if (grid.id === 'trendingGrid') count = 20;
            else if (grid.id === 'animeGrid') count = 26;
            else if (grid.id === 'realGrid') count = 20;
        }

        for (let i = 0; i < count; i++) {
            skeletonHtml += `
                <div class="skeleton-card ${append ? 'temporary-skeleton' : ''} ${isVertical ? 'card-vertical' : ''}">
                    <div class="skeleton-img skeleton"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-text skeleton-title skeleton"></div>
                        <div class="skeleton-text skeleton-subtitle skeleton"></div>
                    </div>
                </div>
            `;
        }

        if (append) {
            const temp = document.createElement('div');
            temp.innerHTML = skeletonHtml;
            const fragment = document.createDocumentFragment();
            while (temp.firstChild) {
                const child = temp.firstChild;
                fragment.appendChild(child);
                if (revealObserver) revealObserver.observe(child);
            }
            grid.appendChild(fragment);
        } else {
            grid.innerHTML = skeletonHtml;
            const skeletons = grid.querySelectorAll('.skeleton-card');
            if (revealObserver) {
                skeletons.forEach(s => revealObserver.observe(s));
            } else {
                skeletons.forEach((s, idx) => {
                    setTimeout(() => s.classList.add('revealed'), idx * 30);
                });
            }
        }
    });

    if (CURRENT_PAGE === 'home' && !append) {
        const sources = $('#sourcesList');
        if (sources) {
            sources.innerHTML = Array(8).fill(0).map(() => `<div class="source-box skeleton" style="border:none;"></div>`).join('');
        }
    }
}

function showWatchSkeletons() {
    const title = $('#info-title');
    const desc = $('#info-desc');
    const streams = $('#source-list');
    const similar = $('#similar-grid'); // Fixed ID from similar-list to similar-grid

    if (title) title.innerHTML = '<div class="skeleton-text skeleton-title skeleton" style="width: 80%; height: 2.5rem; border-radius: 8px;"></div>';
    if (desc) desc.innerHTML = `
        <div class="skeleton-text skeleton skeleton-subtitle" style="width: 100%; height: 1.2rem; margin-bottom: 8px; border-radius: 4px;"></div>
        <div class="skeleton-text skeleton skeleton-subtitle" style="width: 90%; height: 1.2rem; border-radius: 4px;"></div>
    `;

    if (streams) {
        let streamSkeletonHtml = '';
        for (let i = 0; i < 3; i++) {
            streamSkeletonHtml += '<div class="skeleton-stream-card skeleton"></div>';
        }
        streams.innerHTML = streamSkeletonHtml;
    }

    if (similar) {
        let similarSkeletonHtml = '';
        const isAnime = window.location.href.includes('type=anime') || (window.currentWatchItem && window.currentWatchItem._source && window.currentWatchItem._source.id === 'hanime');
        for (let i = 0; i < 8; i++) {
            similarSkeletonHtml += `
                <div class="skeleton-card ${isAnime ? 'card-vertical' : ''}">
                    <div class="skeleton-img skeleton"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-text skeleton-title skeleton"></div>
                        <div class="skeleton-text skeleton-subtitle skeleton"></div>
                    </div>
                </div>
            `;
        }
        similar.innerHTML = similarSkeletonHtml;
        const skeletons = similar.querySelectorAll('.skeleton-card');
        if (revealObserver) skeletons.forEach(s => revealObserver.observe(s));
        else skeletons.forEach(s => s.classList.add('revealed'));
    }
}

// --- Smart Data Fetching with Wait-All Rendering ---
async function loadInitialContent() {
    if (allItems.length === 0) showSkeletons();
    console.log('🔄 Starting high-speed discovery... (Waiting for all data)');

    let loadedItems = [];
    const sourcesToFetch = currentSourceFilter === 'all'
        ? (CURRENT_PAGE === 'anime' ? SOURCES.filter(s => s.id === 'hanime') : [...SOURCES])
        : SOURCES.filter(s => s.id === currentSourceFilter);

    const collectItems = (newItems, src) => {
        loadedItems = [...loadedItems, ...newItems];
    };

    const processSource = async (src) => {
        const cleanBase = getCleanBase(src.baseUrl);
        const typesToTry = (src.id === 'eporner' || src.id === 'xvideos' || src.id === 'xnxx' || src.id === 'pornhub' || src.id === '3dporndude' || src.id === 'hqporner' || src.id === 'missav' || src.id === 'porcore' || src.id === 'cartoonpornvideos' || src.id === 'spankbang') ? ['movie'] : (src.type === 'anime' ? ['anime', 'series', 'movie'] : ['movie', 'series', 'anime']);

        // Primary Fetch
        const primaryCatalog = src.priority[0];
        const primaryType = typesToTry[0];
        const primaryUrl = `${cleanBase}/catalog/${primaryType}/${encodeURIComponent(primaryCatalog)}.json`;

        try {
            const data = await fetchJsonWithRetry(primaryUrl, 0);
            if (data && data.metas) {
                collectItems(data.metas.map(m => normalizeItem(m, src)), src);
            }
        } catch (e) {
            console.warn(`Primary discovery failed for ${src.name}`);
        }

        // Deep Discovery: Fetch remaining catalogs in parallel
        const deepTasks = [];
        for (const type of typesToTry) {
            for (const catalogId of src.priority) {
                if (type === primaryType && catalogId === primaryCatalog) continue;
                let url = `${cleanBase}/catalog/${type}/${encodeURIComponent(catalogId)}.json`;
                if (currentGenre !== 'all') {
                    url = `${cleanBase}/catalog/${type}/${encodeURIComponent(catalogId)}/genre=${encodeURIComponent(currentGenre)}.json`;
                }
                deepTasks.push({ url, type, catalogId });
            }
        }

        const chunks = [];
        for (let i = 0; i < deepTasks.length; i += 3) {
            chunks.push(deepTasks.slice(i, i + 3));
        }

        for (const chunk of chunks) {
            await Promise.allSettled(chunk.map(async (task) => {
                const data = await fetchJsonWithRetry(task.url, 1);
                if (data && data.metas) {
                    collectItems(data.metas.map(m => normalizeItem(m, src)), src);
                }
            }));
        }
    };

    // Begin fetching all sources
    const sourcePromises = sourcesToFetch.map(src => processSource(src));

    // Await strictly until all promises resolve/reject
    await Promise.allSettled(sourcePromises);
    console.log(`✨ Discovery complete. Processing ${loadedItems.length} fetched items...`);

    if (loadedItems.length > 0) {
        allItems = deduplicateItems(loadedItems);

        // Sort by popularity (Simulated Stable Rating)
        if (CURRENT_PAGE === 'real' || CURRENT_PAGE === 'anime') {
            allItems.forEach(item => {
                if (item._rating === undefined) {
                    item._rating = (Math.abs(hashString(item.id)) % 75) + 25;
                }
            });
            allItems.sort((a, b) => (b._rating || 0) - (a._rating || 0));
        }

        // Single Final Render
        requestAnimationFrame(() => {
            renderGrid();

            // Update Cache
            localStorage.setItem(CONFIG.STORAGE.CACHE_KEY, JSON.stringify(allItems.slice(0, 5000)));

            // Refresh recommendations if on watch page
            if (CURRENT_PAGE === 'watch' && window.currentWatchItem) {
                renderSimilarContent(window.currentWatchItem);
            }
        });
    } else {
        // Fallback if absolutely nothing returns
        renderGrid();
    }
}

// Generate automatic tags
function generateTags(item, source) {
    const tags = [...source.tags];

    // Add quality tags based on metadata
    if (item.name && item.name.match(/8K|4320p/i)) tags.push('8K');
    else if (item.name && item.name.match(/4K|2160p/i)) tags.push('4K');
    else if (item.name && item.name.match(/1080p|FHD/i)) tags.push('HD');

    // Add type-specific tags
    if (source.type === 'anime') tags.push('Anime');
    else tags.push('Real');

    return [...new Set(tags)]; // Remove duplicates
}

// Fetch with retry and exponential backoff
async function fetchJsonWithRetry(url, retries = CONFIG.API.RETRIES) {
    const cacheBuster = `_cb=${Date.now()}`;
    const urlWithCaster = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;

    // Direct fetch attempts (Optimized for faster failure on CORS/Speed)
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for robust fetch

            const res = await fetch(urlWithCaster, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const text = await res.text();
                return JSON.parse(text); // Handle potential non-JSON error pages
            }
            throw new Error(`Status ${res.status}`);
        } catch (e) {
            if (i === retries) break;
            await sleep(300);
        }
    }

    // Final attempt through local Node.js proxy (Reliable fallback)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(urlWithCaster)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout for proxy

        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                console.warn("Proxy returned non-JSON data (possibly an error page / ngrok warning)");
            }
        }
    } catch (e) {
        console.error('All fetch attempts failed:', url);
    }

    return null;
}

function updateHero(item) {
    const heroTitle = document.getElementById('hero-title');
    const heroDesc = document.getElementById('hero-desc');
    const heroBg = document.getElementById('hero-bg');
    const heroPlayBtn = document.getElementById('hero-play-btn');
    const heroFavBtn = document.getElementById('hero-fav-btn');

    if (!heroTitle || !item) return;

    heroTitle.textContent = item.name;
    heroDesc.textContent = item.description || "Premium high-quality video streaming from " + item._source.name + ". Watch now in high resolution.";

    if (item.poster || item.background) {
        const bgUrl = getProxiedUrl(item.background || item.poster);
        heroBg.classList.add('loading');
        heroBg.src = bgUrl;
        heroBg.onload = () => {
            heroBg.classList.remove('loading');
            heroBg.classList.add('loaded');
        };
        heroBg.onerror = () => {
            heroBg.classList.remove('loading');
        };
    }

    heroPlayBtn.onclick = () => {
        localStorage.setItem(CONFIG.STORAGE.ACTIVE_ITEM, JSON.stringify(item));
        window.location.href = `watch.html?id=${item.id}&source=${item._source.id}`;
    };

    const isFav = isFavorite(item);
    heroFavBtn.innerHTML = `<i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i> ${isFav ? 'In your List' : 'Add to List'}`;
    heroFavBtn.onclick = (e) => {
        toggleFavorite(e, item);
        const updatedIsFav = isFavorite(item);
        heroFavBtn.innerHTML = `<i class="fa-${updatedIsFav ? 'solid' : 'regular'} fa-heart"></i> ${updatedIsFav ? 'In your List' : 'Add to List'}`;
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Deduplicate items by ID and similar titles
function deduplicateItems(items) {
    const seen = new Map();
    return items.filter(item => {
        if (seen.has(item.id)) return false;
        seen.set(item.id, true);
        return true;
    });
}

// --- Video Preview Manager (HLS Supported) ---
const VideoPreviewManager = {
    activeHls: null,

    start: async function (card) {
        const video = card.querySelector('.preview-player');
        const loader = card.querySelector('.preview-loader');
        if (!video) return;

        let src = video.dataset.src;
        const itemId = card.dataset.id;
        const sourceId = card.dataset.sourceId || 'eporner';

        // 🌟 Lazy Metadata Fetching for Eporner & Broken Links (PornHub Fix)
        const isBroken = !src || src === 'undefined' || src.includes('undefined');
        if (isBroken && itemId) {
            if (loader) loader.classList.add('active');
            try {
                const source = SOURCES.find(s => s.id === sourceId);
                if (source) {
                    const cleanBase = getCleanBase(source.baseUrl);
                    const metaUrl = `${cleanBase}/meta/movie/${encodeURIComponent(itemId)}.json`;
                    const data = await fetchJsonWithRetry(metaUrl);
                    if (data && data.meta) {
                        const m = normalizeItem(data.meta, source);
                        const foundPreview = m.preview || m.previewUrl || "";
                        if (foundPreview) {
                            src = getProxiedUrl(foundPreview);
                            video.dataset.src = src;
                            // Also fix poster while we are at it
                            const posterImg = card.querySelector('.card-poster');
                            if (posterImg) posterImg.src = getProxiedUrl(m.poster || m.thumbnail);
                        }
                    }
                }
            } catch (e) {
                console.warn("Lazy Meta Fetch Failed for:", itemId);
            }
            if (!src || src.includes('undefined')) {
                if (loader) loader.classList.remove('active');
                return;
            }
        }

        if (!src || src === 'undefined') return;

        video.style.opacity = 1;

        // --- Loader Events ---
        if (loader) {
            video.onwaiting = () => loader.classList.add('active');
            video.onplaying = () => loader.classList.remove('active');
            video.oncanplay = () => loader.classList.remove('active');
            video.onerror = () => loader.classList.remove('active');

            // Initial show loader if not ready
            if (video.readyState < 3) loader.classList.add('active');
        }

        // If already playing or has src, just play
        if (video.src && video.src !== window.location.href) {
            video.play().catch(() => { });
            return;
        }

        if (src.includes('.m3u8')) {
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                this.stop(card); // Clear any existing HLS
                const hls = new Hls({
                    capLevelToPlayerSize: true,
                    maxBufferLength: 5,
                    maxMaxBufferLength: 10
                });
                hls.loadSource(src);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(e => console.log("Preview autoplay blocked:", e));
                });
                this.activeHls = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = src;
                video.play().catch(() => { });
            }
        } else {
            video.src = src;
            video.play().catch(() => { });
        }
    },

    stop: function (card) {
        if (this.activeHls) {
            this.activeHls.destroy();
            this.activeHls = null;
        }

        if (card) {
            const video = card.querySelector('.preview-player');
            const loader = card.querySelector('.preview-loader');
            if (video) {
                video.onwaiting = null;
                video.onplaying = null;
                video.oncanplay = null;
                video.style.opacity = 0;
                video.pause();
                // We keep src for fast resume if they hover again unless it's HLS
            }
            if (loader) loader.classList.remove('active');
        }
    }
};

// --- Optimized Rendering ---
function renderGrid(append = false) {
    if (CURRENT_PAGE === 'home' && currentFilter === 'all' && currentSourceFilter === 'all') {
        const container = document.getElementById('dynamicHomeContent');
        if (!container) return;

        // Only clear if not appending (initial load)
        if (!append) container.innerHTML = '';

        // Group items by source
        const bySource = {};
        allItems.forEach(item => {
            const sid = item._source.id;
            const sName = item._source.name;
            if (!bySource[sid]) bySource[sid] = { name: sName, items: [] };
            bySource[sid].items.push(item);
        });

        // Create a section for each source
        Object.entries(bySource).forEach(([sid, data]) => {
            let section = document.getElementById(`section-${sid}`);
            if (!section) {
                const logo = SOURCE_LOGOS[sid] || SOURCE_LOGOS.default;
                section = document.createElement('div');
                section.id = `section-${sid}`;
                section.className = 'row-section fade-in-up';
                section.innerHTML = `
                    <div class="section-header">
                        <h2 class="section-title" style="display: flex; align-items: center;">
                            <img src="${logo}" class="source-header-logo" style="width: 30px; height: 30px; border-radius: 8px; margin-right: 15px; border: 1px solid rgba(255,255,255,0.1); background: #000;">
                            ${data.name}
                        </h2>
                        <a href="${data.items[0]._source.type === 'anime' ? 'anime.html' : 'real.html'}?source=${sid}" class="see-all">See All <i class="fa-solid fa-chevron-right"></i></a>
                    </div>
                    <div class="grid" id="grid-${sid}"></div>
                `;
                container.appendChild(section);
            }

            const grid = document.getElementById(`grid-${sid}`);
            if (grid) {
                // Dynamic limits based on type to fill rows perfectly
                const isVertical = data.items[0]._source.type === 'anime';
                const limit = isVertical ? 16 : 12;
                const itemsToShow = data.items.slice(0, limit);
                renderTargetGrid(grid, itemsToShow, append, isVertical);
            }
        });

        // Update Hero Section with the top trending item from any source
        if (allItems.length > 0 && !append) {
            updateHero(allItems[0]);
        }
        return;
    }

    const grid = $('#mainGrid');
    if (!grid) return;

    let sourceArray = CURRENT_PAGE === 'favorites' ? favorites : allItems;

    // 🛡️ [Sorting Fix] If we are on favorites, NEVER re-sort by source here
    if (CURRENT_PAGE === 'favorites') {
        sourceArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    const isVertical = CURRENT_PAGE === 'anime' || (CURRENT_PAGE === 'search' && currentSearchType === 'anime') || (CURRENT_PAGE === 'favorites' && favoritesType === 'anime');
    renderTargetGrid(grid, sourceArray, append, isVertical);
}

function renderSourcesRow() {
    const container = $('#sourcesList');
    if (!container) return;

    container.innerHTML = SOURCES.map(src => {
        const logo = SOURCE_LOGOS[src.id] || SOURCE_LOGOS.default;
        return `
            <div class="source-box" onclick="location.href='${src.type === 'anime' ? 'anime.html' : 'real.html'}?source=${src.id}'">
                <img src="${logo}" class="source-box-logo" alt="${src.name}">
                <span class="source-box-name">${src.name}</span>
            </div>
        `;
    }).join('');
}

function renderCategoryGrid(type, grid, append, limit = 24, specificSource = null) {
    if (!grid) return;
    // Get all items for this type
    const items = allItems.filter(item => {
        const itemType = item._source ? item._source.type : (item.type || 'real');
        const matchesType = itemType === type;
        const matchesSource = (!specificSource || specificSource === 'all') ? true : (item._source && item._source.id === specificSource);
        return matchesType && matchesSource;
    });

    // Interleave by source to make it feel mixed
    const bySource = {};
    items.forEach(item => {
        const sid = item._source.id;
        if (!bySource[sid]) bySource[sid] = [];
        bySource[sid].push(item);
    });
    const sourceArrays = Object.values(bySource);
    const mixed = [];
    let hasMore = true;
    let i = 0;
    while (hasMore) {
        hasMore = false;
        for (const arr of sourceArrays) {
            if (arr[i]) { mixed.push(arr[i]); hasMore = true; }
        }
        i++;
    }
    renderTargetGrid(grid, mixed, append, type === 'anime', limit);
}

function renderTargetGrid(grid, sourceArray, append, isVertical = false, homeLimit = 24) {
    // If we're appending but the grid contains a loader or is currently "empty", clear it first
    const isCurrentlyEmpty = grid.querySelector('.main-loader') || (grid.children.length === 1 && grid.children[0].style.gridColumn === '1 / -1');
    if (!append || isCurrentlyEmpty) {
        grid.innerHTML = '';
    } else {
        // Remove temporary skeletons before appending real items
        grid.querySelectorAll('.temporary-skeleton').forEach(el => el.remove());
    }
    if (isVertical) grid.classList.add('vertical-grid');
    else if (!append) grid.classList.remove('vertical-grid');

    const filtered = sourceArray.filter(item => {
        if (currentSourceFilter !== 'all' && item._source.id !== currentSourceFilter) return false;

        if (CURRENT_PAGE === 'favorites') {
            const isAnime = (item) => {
                if (item.type === 'anime') return true;
                if (item._source) {
                    if (item._source.type === 'anime') return true;
                    if (item._source.id === 'hanime') return true;
                    if (item._source.name && item._source.name.toLowerCase().includes('hanime')) return true;
                }
                return false;
            };
            const animeStatus = isAnime(item);
            if (favoritesType === 'anime' && !animeStatus) return false;
            if (favoritesType === 'real' && animeStatus) return false;
            if (favoritesSource !== 'all' && item._source.id !== favoritesSource) return false;
            return true;
        }

        if (CURRENT_PAGE === 'search') {
            // Apply source filter if one is selected
            if (currentSourceFilter !== 'all' && item._source.id !== currentSourceFilter) return false;
            return true;
        }

        if (CURRENT_PAGE === 'anime') {
            const isAnime = item._source && item._source.type === 'anime';
            return isAnime;
        }
        if (CURRENT_PAGE === 'real') {
            const isReal = item._source && item._source.type === 'real';
            return isReal;
        }
        return true;
    });

    const isWaitAll = ['anime', 'real', 'favorites'].includes(CURRENT_PAGE);
    const pageSize = isWaitAll ? 999999 : (CONFIG.UI.PAGE_SIZE || 48);

    // Clear grid if starting fresh
    if (filtered.length === 0 && !append && !isSearching) {
        // If we're on the home page and allItems is empty, we're likely still loading, so don't show "No Results"
        if (CURRENT_PAGE === 'home' && allItems.length === 0) return;

        if (!append) grid.innerHTML = '';
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 100px 20px; animation: fadeIn 0.5s ease;">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 3rem; color: #666; margin-bottom: 20px;"></i>
                <h2 style="color: #fff; margin-bottom: 15px; font-weight: 800;">No Results Found</h2>
                <p style="color: #666; font-size: 1.2rem; max-width: 600px; margin: 0 auto; line-height: 1.6;">We couldn't find anything matching your filters. Try changing your search or source.</p>
                <div style="margin-top: 30px;">
                    <button onclick="location.reload()" class="btn-primary" style="padding: 12px 35px; border-radius: 50px; font-weight: 800; background: var(--primary); color: #000; border: none; cursor: pointer;">Retry Sync</button>
                </div>
            </div>
        `;
        return;
    }
    if (!append) grid.innerHTML = '';
    const start = append ? grid.children.length : 0;
    let itemsToShow = filtered.slice(start, start + pageSize);

    // Discovery pages should show everything discovered
    if (CURRENT_PAGE === 'home' && !append && currentFilter === 'all' && currentSourceFilter === 'all') {
        // Use the passed homeLimit if available, otherwise default to a reasonable amount
        itemsToShow = filtered.slice(0, homeLimit);
    }

    if (itemsToShow.length === 0 && !append) {
        // Show specialized loading for Wait-All pages (real/anime)
        let message = '🔄 Loading content...';
        let showSpinner = false;

        if (CURRENT_PAGE === 'search') {
            if (isSearching) {
                message = '';
                showSpinner = true;
            } else {
                message = `No results found for "${document.getElementById('searchInput')?.value || ''}"`;
                showSpinner = false;
            }
        } else if (['real', 'anime', 'favorites'].includes(CURRENT_PAGE)) {
            message = '';
            showSpinner = true;
        } else {
            message = '';
            showSpinner = true;
        }

        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 10rem 0;">
                ${showSpinner ? `
                <div class="main-loader">
                    <div class="spinner"></div>
                </div>` : `
                <div class="fade-up" style="animation-duration: 0.5s;">
                    <div style="font-size: 4rem; margin-bottom: 20px; color: var(--text-muted); opacity: 0.3;"><i class="fa-solid fa-magnifying-glass"></i></div>
                    <h2 style="color: var(--text-main); font-weight: 600;">${message}</h2>
                    ${CURRENT_PAGE === 'search' ? '<p style="color: var(--text-muted); margin-top: 10px;">Try different keywords or check your spelling.</p>' : ''}
                </div>
                `}
            </div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    itemsToShow.forEach(item => {
        // Design Update: Anime (hanime only) = Vertical (Portrait), Real = Horizontal (Landscape)
        const isVertical = item._source && item._source.id === 'hanime';

        const card = document.createElement('div');
        const isSelected = selectedItems.some(i => i.id === item.id);
        card.className = `card ${isSelected ? 'selected' : ''} ${isVertical ? 'card-vertical' : ''}`;
        card.dataset.id = item.id;
        card.dataset.sourceId = item._source.id;
        card.onclick = (e) => {
            if (isBulkMode) {
                toggleSelection(item);
                return;
            }
            localStorage.setItem(CONFIG.STORAGE.ACTIVE_ITEM, JSON.stringify(item));
            window.location.href = `watch.html?id=${item.id}&source=${item._source.id}`;
        };


        card.onmouseenter = () => VideoPreviewManager.start(card);
        card.onmouseleave = () => VideoPreviewManager.stop(card);

        const rawName = item.name || item.title || 'Untitled Video';
        const cleanName = rawName.replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
        let poster = item.poster || item.thumbnail || item.background;
        const sourceId = item._source ? (item._source.id || item._source) : '';

        if (!poster && (sourceId === 'pornhub' || sourceId === 'eporner' || sourceId === 'xnxx')) {
            poster = `minimal_recovery_trigger_${item.id}`;
        }

        if (!poster) poster = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const logo = SOURCE_LOGOS[item._source.id] || SOURCE_LOGOS.default;

        const isFav = isFavorite(item);
        const previewUrl = item.preview || item.previewUrl || "";
        const extraSourcesCount = (item.extraSources && item.extraSources.length) || 0;

        // Track source for debug purposes
        const itemSource = item._source?.id || '';
        if (itemSource === 'xnxx') window._lastDebugSource = 'xnxx';

        const isDownloaded = item.isDownloaded || (window.triggeredDownloads && window.triggeredDownloads.has(item.id));
        const isActiveTask = (window.currentActiveTaskIds || []).includes(item.id);
        const showDoneBadge = isDownloaded && !isActiveTask;

        // Debug for XNXX
        if (itemSource === 'xnxx' && showDoneBadge) {
            console.log('✅ [XNXX] Download badge showing for:', cleanName);
        }

        card.className = `card ${isSelected ? 'selected' : ''} ${isVertical ? 'card-vertical' : ''} ${showDoneBadge ? 'is-downloaded' : ''}`;

        // Store in global lookup for safe retrieval
        window._gridItems = window._gridItems || {};
        window._gridItems[item.id] = item;

        card.innerHTML = `
            <div class="card-image-wrap skeleton">
                <img src="${getProxiedUrl(poster)}" class="card-poster loading" loading="lazy" alt="${cleanName}" onload="this.classList.add('loaded'); this.classList.remove('loading'); this.parentElement.classList.remove('skeleton');" onerror="this.parentElement.classList.remove('skeleton'); handleImageError(this, '${item.id}', '${item._source.id}', '${item.type || 'movie'}')">
                <div class="download-progress-overlay" id="progress-${item.id}">
                    <button class="cancel-download-btn" title="Cancel Download" onclick="event.stopPropagation(); cancelDownload('${item.id}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <div class="progress-text">0%</div>
                    <div class="progress-container">
                        <div class="progress-bar-fill"></div>
                    </div>
                    <div class="status-text">Waiting...</div>
                </div>
                ${(!isVertical) ? `<video class="preview-player" data-src="${previewUrl ? getProxiedUrl(previewUrl) : 'undefined'}" loop muted playsinline></video>` : ''}
                <div class="preview-loader"><div class="spinner-small"></div></div>
                <div class="card-overlay"></div>
                <div class="favorite-card-btn ${isFav ? 'active' : ''}" 
                     onclick="event.stopPropagation(); window.lastFavoriteItem = ${JSON.stringify(item).replace(/"/g, '&quot;')}; toggleFavorite(event, window.lastFavoriteItem)">
                    <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
                </div>
                ${item.duration ? `<div class="duration-badge">${formatDuration(item.duration)}</div>` : ''}
            </div>
            <div class="card-info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <h3 class="card-title">${cleanName}</h3>
                </div>
                <div class="card-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; font-size: 0.8rem; color: #888;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span class="card-source" style="color:var(--primary); font-weight:bold;">${item._source.name}</span>
                    </div>
                    <span class="card-views">${item._rating || 85}% <i class="fa-solid fa-thumbs-up"></i></span>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);


    // Apply reveal observer to new cards
    if (revealObserver) {
        const newCards = grid.querySelectorAll('.card:not(.revealed)');
        newCards.forEach(card => revealObserver.observe(card));
    } else {
        const newCards = grid.querySelectorAll('.card:not(.revealed)');
        newCards.forEach((card, i) => {
            setTimeout(() => card.classList.add('revealed'), i * 50);
        });
    }

    // Hide sentinel if no more items to load
    const sentinel = document.getElementById('sentinel');
    if (sentinel) {
        const isInfinitePage = ['real', 'anime', 'search'].includes(CURRENT_PAGE);
        if (start + pageSize >= filtered.length && !isInfinitePage) {
            sentinel.style.display = 'none';
        } else {
            sentinel.style.display = 'flex';
        }
    }
}

// --- Reveal Observer for Gradual Appearance ---
function initRevealObserver() {
    const options = {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
    };

    revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Stagger the reveal slightly based on visibility order
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, index * 50);
                observer.unobserve(entry.target);
            }
        });
    }, options);
}

// --- Multiple Page Support Functions ---
async function handleWatchPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const sourceId = params.get('source');
    const localVideo = params.get('local');
    const directUrl = params.get('url') || params.get('directUrl');

    if (directUrl) {
        console.log("🎬 handleWatchPage: Detected Direct URL, skipping meta fetch.");
        return; // Already handled in DOMContentLoaded
    }

    // Handle local media server videos
    if (localVideo) {
        // Fix double encoding issue
        let decodedVideo = localVideo;
        try {
            // Try to decode if it contains %25 (double encoded)
            if (localVideo.includes('%25')) {
                decodedVideo = decodeURIComponent(localVideo);
            }
        } catch (e) {
            // If decode fails, use original
        }

        const videoName = decodedVideo.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const videoUrl = `${CONFIG.MEDIA_SERVER_URL}/video/${encodeURIComponent(decodedVideo)}`;

        const localItem = {
            id: 'local_' + decodedVideo,
            name: videoName,
            url: videoUrl,
            _source: { id: 'local', name: '🔥 Local Media', baseUrl: CONFIG.MEDIA_SERVER_URL },
            poster: `${CONFIG.MEDIA_SERVER_URL}/thumbnail/${encodeURIComponent(decodedVideo)}`,
            type: 'local'
        };

        window.currentWatchItem = localItem;
        openPlayer(localItem);

        // Update UI
        if (document.getElementById('info-title')) {
            document.getElementById('info-title').textContent = videoName;
        }
        if (document.getElementById('info-desc')) {
            document.getElementById('info-desc').textContent = 'Local video from Media Server';
        }
        return;
    }

    if (!id || !sourceId) {
        document.getElementById('info-desc').textContent = "Error: Video not recognized.";
        return;
    }

    // Start background loading to populate similar content if we came here directly
    if (allItems.length === 0) loadInitialContent();

    const source = SOURCES.find(s => s.id === sourceId);
    if (!source) return;

    // Check if we have the meta in localStorage (smoother transition)
    let item = null;
    const activeItem = localStorage.getItem(CONFIG.STORAGE.ACTIVE_ITEM);
    if (activeItem) {
        const parsed = JSON.parse(activeItem);
        if (parsed.id === id) item = { ...parsed, _source: source };
    }

    // Start background loading to populate fallback recommendations
    if (allItems.length === 0) loadInitialContent();

    // Start player with placeholder if available
    if (item) {
        console.log("🚀 Starting player with cached placeholder...");
        openPlayer(item);
    }

    // Refresh FULL meta from source (for related content, better descriptions, etc)
    const cleanBase = getCleanBase(source.baseUrl);
    const types = source.type === 'anime' ? ['anime', 'movie'] : ['movie', 'series'];

    let fullMetaFound = false;
    for (const t of types) {
        const metaUrl = `${cleanBase}/meta/${t}/${encodeURIComponent(id)}.json`;
        console.log(`📡 Background Fetching Full Meta: ${metaUrl}`);

        try {
            const data = await fetchJsonWithRetry(metaUrl, 1);
            if (data && data.meta) {
                // Merge fresh meta with existing item to ensure we don't lose poster/preview
                const merged = { ...(item || {}), ...data.meta };
                const fullMeta = normalizeItem(merged, source);
                window.currentWatchItem = fullMeta;

                if (!item) {
                    item = fullMeta;
                    openPlayer(item);
                } else {
                    // Update UI with fresh meta details that might have been missing in catalog
                    if (document.getElementById('info-title')) {
                        document.getElementById('info-title').textContent = decodeEntities(fullMeta.name);
                    }
                    if (document.getElementById('info-desc')) {
                        document.getElementById('info-desc').textContent = decodeEntities(fullMeta.description || fullMeta.name);
                    }
                    // Refresh similar content with source-specific related items
                    renderSimilarContent(fullMeta);
                }
                fullMetaFound = true;

                // NEW: Check if this item is currently downloading to restore button state
                if (window.currentWatchItem) {
                    const statusRes = await fetch('/api/download/status');
                    const statusData = await statusRes.json();
                    if (Array.isArray(statusData) && statusData.find(d => d.id === window.currentWatchItem.id)) {
                        const btn = document.getElementById('btn-direct-download');
                        if (btn && !btn.classList.contains('dl-btn-progress')) {
                            btn.classList.add('dl-btn-progress');
                            btn.innerHTML = `
                                <div class="progress-fill" style="width: 0%"></div>
                                <i class="fa-solid fa-sync fa-spin"></i> <span>Starting...</span>
                                <div class="dl-cancel-btn" title="Cancel Download"><i class="fa-solid fa-xmark"></i></div>
                            `;
                            btn.onclick = (e) => {
                                if (e.target.closest('.dl-cancel-btn')) cancelDownload(window.currentWatchItem.id);
                            };
                            startWatchButtonPolling(window.currentWatchItem.id);
                        }
                    }
                }
                break;
            }
        } catch (e) {
            console.warn(`Failed to fetch meta for ${id} via ${t}`);
        }
    }

    if (!item && !fullMetaFound) {
        // Ultimate fallback: Basic info from ID if it looks like a direct URL
        if (id.startsWith('http')) {
            item = normalizeItem({ id: id, name: 'Direct Link', url: id }, source);
            openPlayer(item);
        } else {
            document.getElementById('info-desc').textContent = "⚠️ Could not retrieve video info. The source might be down or blocked.";
        }
    }
}

function sanitizeSearchQuery(query) {
    if (!query) return "";
    // Allow all characters including symbols for search
    // Just trim and clean extra spaces
    return query.trim().replace(/\s+/g, ' ');
}

// --- Search logic ---
let currentSearchId = 0;
let currentSearchType = 'all';

async function handleSearchPage(query, explicitType = null, explicitSource = null) {
    const searchId = ++currentSearchId;
    isSearching = true;

    const params = new URLSearchParams(window.location.search);
    const resolvedType = explicitType || document.getElementById('searchType')?.value || params.get('type') || 'all';
    currentSearchType = resolvedType;

    // Track the source being searched
    const selectedSource = explicitSource || currentSourceFilter || 'all';
    currentSourceFilter = selectedSource;

    const sanitizedQuery = sanitizeSearchQuery(query);
    if (sanitizedQuery) document.title = "Porn Portal: " + sanitizedQuery;

    pageBySource = {};
    sourcePages = {};
    allItems = [];
    renderGrid();

    const grid = document.getElementById('mainGrid');
    if (grid) {
        showSkeletons();
    }

    // UI Adjustments - Hide/Show source pills based on type
    const sourceBar = document.getElementById('source-bar');
    if (sourceBar) {
        sourceBar.querySelectorAll('.source-pill').forEach(p => {
            const sid = p.dataset.source;
            const srcObj = SOURCES.find(s => s.id === sid);
            if (sid === 'all') {
                p.style.display = 'block';
            } else if (resolvedType === 'anime') {
                p.style.display = (sid === 'hanime') ? 'block' : 'none';
            } else if (resolvedType === 'real') {
                p.style.display = (sid === 'hanime') ? 'none' : 'block';
            }
            p.classList.toggle('active', sid === selectedSource);
        });
    }

    console.log(`🔍 [Focused Search] Querying ${selectedSource} for: "${sanitizedQuery}"`);

    try {
        const url = `/api/search?q=${encodeURIComponent(sanitizedQuery)}&type=${resolvedType}&sort=${currentSort}&source=${selectedSource}`;
        const response = await fetch(url);
        const data = await response.json();

        if (searchId !== currentSearchId) return;

        // Client-side deduplication as safety net
        const seenIds = new Set();
        allItems = (data.results || []).filter(item => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
        }).map(item => {
            const normalized = normalizeItem(item, item._source);
            normalized.extraSources = item.extraSources || [];
            return normalized;
        });

        isSearching = false;
        page = 0;
        sourcePages = {};
        renderGrid();
        console.log(`✅ [Focused Search] Complete. Unified ${allItems.length} results from ${selectedSource}.`);
    } catch (e) {
        console.error("Focused Search Error:", e);
        isSearching = false;
        if (grid) grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 100px 20px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: var(--accent); margin-bottom: 20px;"></i>
                <h2 style="color: #fff; margin-bottom: 15px;">خطأ في الخدمة!</h2>
                <p style="color: #888; font-size: 1.1rem;">حدث خطأ أثناء محاولة جلب النتائج. يرجى التحقق من اتصالك أو إعادة المحاولة لاحقاً.</p>
                <button onclick="location.reload()" class="btn-primary" style="margin-top: 25px; padding: 10px 30px; border-radius: 50px;">إعادة المحاولة</button>
            </div>
        `;
    }
}


async function resolveAllStreams(item, onPartialResult = null) {
    const mainSource = item._source;
    const sourcesToTry = [mainSource, ...(item.extraSources || [])];
    let allFoundStreams = [];

    console.log(`📡 [Legendary Stream Resolution] Attempting discovery across ${sourcesToTry.length} sources...`);

    // --- Direct URL support (for virtual items or explicit URLs) ---
    if (item.url && item.url.startsWith('http')) {
        const isMediaUrl = item.url.match(/\.(mp4|m3u8|mkv|webm|ts|avi)(\?|$)/i) !== null;
        const isLocalApi = item.url.includes(':4000') || item.url.includes('/api/');

        if (isMediaUrl || isLocalApi) {
            allFoundStreams.push({
                title: 'Direct Link (Virtual)',
                url: item.url,
                addon: 'System',
                quality: 'Direct'
            });
            if (onPartialResult) await onPartialResult(allFoundStreams);
        }
    }

    // --- Specialized direct resolution for Hanime ---
    if (mainSource.id === 'hanime') {
        try {
            const hanimeStreams = await resolveHanimeDirect(item);
            if (hanimeStreams && hanimeStreams.length > 0) {
                const results = hanimeStreams.map(s => ({
                    title: s.title || 'Hanime Stream',
                    url: s.url,
                    addon: 'Hanime',
                    quality: s.quality || detectQuality(s.title || '')
                }));
                allFoundStreams.push(...results);
                if (onPartialResult) await onPartialResult(allFoundStreams);
            }
        } catch (e) { }
    }

    const resolveFromSource = async (src, videoId) => {
        const cleanBase = getCleanBase(src.baseUrl);
        const types = src.type === 'anime' ? ['anime', 'movie'] : ['movie', 'series'];
        const results = [];

        console.log(`📡 [Resolver] Querying source: ${src.name} for ID: ${videoId}`);

        for (const t of types) {
            // Variant handling: original ID, and ID without source prefix
            const idVariants = [
                videoId,
                videoId.includes('_') ? videoId.split('_').slice(1).join('_') : videoId,
                videoId.includes(':') ? videoId.split(':').pop() : videoId
            ];

            for (const variant of [...new Set(idVariants)]) {
                const url = `${cleanBase}/stream/${t}/${encodeURIComponent(variant)}.json`;
                console.log(`   🔎 [Resolver] Fetching: ${url}`);
                try {
                    const data = await fetchJsonWithRetry(url, 1);
                    if (data && data.streams) {
                        console.log(`   ✅ [Resolver] Found ${data.streams.length} streams via ${variant}`);
                        data.streams.forEach(s => results.push({
                            ...s,
                            addon: src.name,
                            quality: detectQuality(s.title || s.name || '')
                        }));
                    }
                } catch (e) {
                    console.warn(`   ❌ [Resolver] Failed to fetch from: ${url}`, e.message);
                }
            }
            if (results.length > 0) break;
        }
        return results;
    };

    // Run resolution tasks in parallel and update progressively
    const settlementTasks = sourcesToTry.map(async (src) => {
        try {
            const streams = await resolveFromSource(src, item.id);
            if (streams && streams.length > 0) {
                // Ensure no duplicates by URL
                const newStreams = streams.filter(s => !allFoundStreams.some(existing => existing.url === s.url));
                if (newStreams.length > 0) {
                    allFoundStreams.push(...newStreams);
                    if (onPartialResult) await onPartialResult(allFoundStreams);
                }
            }
        } catch (e) { }
    });

    // We can await them to provide a final result for those who want it
    await Promise.allSettled(settlementTasks);

    // Last Resort: Scraper
    if (allFoundStreams.length === 0) {
        try {
            const scraped = await scrapeStream(item);
            if (scraped) {
                allFoundStreams.push({ title: 'Direct Scraper', url: scraped, addon: 'Deep Scraper', quality: 'HD' });
                if (onPartialResult) await onPartialResult(allFoundStreams);
            }
        } catch (e) { }
    }

    return deduplicateItemsByUrl(allFoundStreams);
}


async function openPlayer(item) {
    window.currentWatchItem = item; // Store for background updates
    const title = document.getElementById('info-title');
    const desc = document.getElementById('info-desc');
    const badge = document.getElementById('overlay-badge');
    const srcButton = document.getElementById('btn-source');
    const streamButton = document.getElementById('btn-new-tab');
    const topTitle = document.getElementById('overlay-title');
    const overlay = document.getElementById('player-overlay');

    currentPlayingIndex = allItems.findIndex(i => i.id === item.id);

    if (title) title.textContent = decodeEntities(item.name);
    if (topTitle) topTitle.textContent = decodeEntities(item.name);

    // Dynamically update the browser tab title
    document.title = "Porn Portal: " + decodeEntities(item.name);

    if (desc) desc.textContent = "🔄 Resolving stream links...";
    if (badge) badge.textContent = item._source.name;

    // Favorite Button State
    const watchFavBtn = document.getElementById('btn-watch-favorite');
    if (watchFavBtn) {
        const isFav = isFavorite(item);
        watchFavBtn.innerHTML = isFav ? '♥ Favorite' : '♡ Favorite';
        watchFavBtn.classList.toggle('active', isFav);
    }


    // Set Poster and Background
    const video = document.getElementById('player');
    const container = document.querySelector('.player-container');
    const poster = item.background || item.poster || item.logo;

    if (video && poster) {
        video.setAttribute('poster', getProxiedUrl(poster));
    }
    if (container && poster) {
        container.style.backgroundImage = `url('${getProxiedUrl(poster)}')`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
    }

    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    const sourceLink = item.website || item.url || (item.id && item.id.startsWith('https') ? item.id : null) || item._source.baseUrl;
    const extSourceBtn = document.getElementById('btn-external-source');
    if (extSourceBtn) {
        if (sourceLink) {
            extSourceBtn.style.display = 'inline-flex';
            // 🛡️ USER REQUEST: For Hanime, use the proxied stream link if available, otherwise fallback
            if (item._source?.id === 'hanime') {
                extSourceBtn.href = window.currentHlsUrl || sourceLink;
                extSourceBtn.title = "Open Proxied Video Link";
                extSourceBtn.innerHTML = '<i class="fa-solid fa-up-right-from-square"></i> <span>Open Stream</span>';
            } else {
                extSourceBtn.href = sourceLink;
                extSourceBtn.title = "Visit Source Website";
                extSourceBtn.innerHTML = '<i class="fa-solid fa-up-right-from-square"></i> <span>Open Website</span>';
            }
        } else {
            extSourceBtn.style.display = 'none';
        }
    }

    if (streamButton) {
        streamButton.style.display = 'inline-flex';
        streamButton.onclick = () => {
            const currentUrl = window.currentHlsUrl || '';
            showExternalPlayerOptions(currentUrl, item.name);
        };
    }

    let hasLoadedFirst = false;

    // 🔄 SHOW LOADING STATE IN AVAILABLE STREAMS
    const streamsList = document.getElementById('source-list');
    if (streamsList) {
        streamsList.innerHTML = `
            <div class="loading-streams-msg" style="padding: 30px 10px; text-align: center; color: var(--primary); animation: fadeIn 0.5s ease;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: 12px; display: block; filter: drop-shadow(0 0 8px var(--primary-glow));"></i>
                <span style="font-weight: 700; font-size: 0.9rem; letter-spacing: 0.5px; text-transform: uppercase;">Finding Streams...</span>
                <p style="color: #666; font-size: 0.75rem; margin-top: 8px;">Scanning multiple sources, please wait</p>
            </div>
        `;
    }

    // Call resolver progressively
    resolveAllStreams(item, async (partial) => {
        if (window.currentWatchItem?.id !== item.id) return;

        // Populate source list (this already handles sorting and rendering)
        await renderSourceButtons(partial, item);

        // 🎯 SMART AUTO-PLAY: Play the best available quality from the discovered streams
        if (partial.length > 0) {
            // Sort to find the actual best quality currently discovered
            const qMap = { '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'HD': 0 };
            const sorted = [...partial].sort((a, b) => {
                const qA = detectQuality(a.title || a.name || '');
                const qB = detectQuality(b.title || b.name || '');
                return (qMap[qB] || 0) - (qMap[qA] || 0);
            });

            const bestStream = sorted[0];
            const currentQWeight = window.currentPlayingQualityWeight || -1;
            const newQWeight = qMap[detectQuality(bestStream.title || bestStream.name || '')] || 0;

            // Conditions to play/switch:
            // 1. First time playing
            // 2. We found a better quality AND we are in the first 5 seconds of playback (upgrade)
            const isUpgrade = hasLoadedFirst && newQWeight > currentQWeight && (!art || art.currentTime < 5);

            if ((!hasLoadedFirst || isUpgrade) && bestStream.url) {
                const urlToPlay = bestStream.url;

                // Avoid redundant play calls for the same URL
                if (window.currentHlsUrl !== urlToPlay) {
                    console.log(`🚀 [Auto-Play] ${isUpgrade ? 'Upgrading to' : 'Starting'} best quality: ${detectQuality(bestStream.title || bestStream.name || '')}`);
                    hasLoadedFirst = true;
                    window.currentPlayingQualityWeight = newQWeight;
                    playUrl(urlToPlay, item);
                }

                // Restore progress if first time
                if (!isUpgrade) {
                    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');
                    if (saved[item.id] && saved[item.id]._time > 5) {
                        const resumeTime = saved[item.id]._time;
                        setTimeout(() => {
                            if (art) {
                                art.currentTime = resumeTime;
                                console.log(`🕒 Auto-resumed at ${resumeTime}s`);
                            }
                        }, 1000);
                    }
                }
            }
        }
    }).then((final) => {
        if (window.currentWatchItem?.id !== item.id) return;

        if (final.length === 0 && !hasLoadedFirst) {
            if (desc) desc.innerHTML = `<span style="color: var(--primary)">⚠️ Error:</span> Could not find a stream link. Try opening source directly.`;

            // ❌ SHOW ERROR STATE IN AVAILABLE STREAMS
            const streamsList = document.getElementById('source-list');
            if (streamsList) {
                streamsList.innerHTML = `
                    <div class="error-streams-msg" style="padding: 30px 10px; text-align: center; color: #ff4444; animation: shake 0.5s ease;">
                        <i class="fa-solid fa-circle-exclamation" style="font-size: 2.2rem; margin-bottom: 12px; display: block;"></i>
                        <span style="font-weight: 700; font-size: 0.95rem; text-transform: uppercase;">No Streams Found</span>
                        <p style="color: #777; font-size: 0.8rem; margin-top: 8px; line-height: 1.4;">The source might be down or requires an update. Try visiting the original website.</p>
                        <button onclick="location.reload()" class="btn-primary" style="margin-top: 15px; padding: 8px 20px; font-size: 0.8rem; border-radius: 50px;">Retry Discovery</button>
                    </div>
                `;
            }
        }

        // Always try to load similar content once discovery is moving
        renderSimilarContent(item);
    });

    if (desc) desc.textContent = decodeEntities(item.description || "No description available for this video.");
}

// ═══════════════════════════════════════════════════════════════
// NEW FEATURES IMPLEMENTATION (1, 3, 4)
// ═══════════════════════════════════════════════════════════════

// 1. Video Preview Manager
function initVideoPreviewManager() {
    document.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.card');
        if (card) {
            const video = card.querySelector('.preview-player');
            if (video) {
                video.classList.add('active');
                video.play().catch(e => { });
            }
        }
    });

    document.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.card');
        if (card) {
            const video = card.querySelector('.preview-player');
            if (video) {
                video.classList.remove('active');
                video.pause();
                video.currentTime = 0;
            }
        }
    });
}

// --- Download Manager Logic Consolidated at end of file ---

// 4. Search Autocomplete
function initAutocomplete() {
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('search-suggestions');
    if (!input || !suggestions) return;

    let history = JSON.parse(localStorage.getItem('search_history') || '[]');

    input.onfocus = () => {
        if (history.length > 0 && !input.value) {
            showHistory();
        }
    };

    input.oninput = () => {
        if (!input.value) {
            showHistory();
            return;
        }
        // Logic for actual suggestions could go here
        suggestions.style.display = 'none';
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar')) suggestions.style.display = 'none';
    });
}

function showHistory() {
    const history = JSON.parse(localStorage.getItem('search_history') || '[]');
    const suggestions = document.getElementById('search-suggestions');
    if (history.length === 0) return;

    suggestions.innerHTML = history.slice(0, 5).map(h => `
        <div class="suggestion-item" onclick="executeSearch('${h}')">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>${h}</span>
        </div>
    `).join('');
    suggestions.style.display = 'block';
}

window.executeSearch = (query) => {
    const input = document.getElementById('searchInput');
    const type = document.getElementById('searchType')?.value || 'all';
    input.value = query;
    let history = JSON.parse(localStorage.getItem('search_history') || '[]');
    history = [query, ...history.filter(h => h !== query)].slice(0, 10);
    localStorage.setItem('search_history', JSON.stringify(history));
    document.getElementById('search-suggestions').style.display = 'none';

    if (CURRENT_PAGE === 'search') {
        handleSearchPage(query, type);
    } else {
        window.location.href = `search.html?q=${encodeURIComponent(query)}&type=${type}`;
    }
};

// --- Favorites Filters ---
function initFavoritesFilters() {
    const tabs = document.querySelectorAll('.tab-btn');
    const sourceBar = document.getElementById('fav-source-filters');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.onclick = async () => {
            const grid = document.getElementById('mainGrid');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            favoritesType = tab.dataset.type;
            favoritesSource = 'all'; // Reset source when switching category

            if (favoritesType === 'real') {
                sourceBar.style.display = 'flex';
                if (grid) grid.classList.remove('vertical-grid');
                renderFavSourceButtons();
            } else {
                sourceBar.style.display = 'none';
                if (grid) grid.classList.add('vertical-grid');
            }
            renderFavorites();
        };
    });

    const renderFavSourceButtons = () => {
        const isItemAnime = (item) => {
            if (item.type === 'anime') return true;
            if (item._source) {
                if (item._source.type === 'anime') return true;
                if (item._source.id === 'hanime') return true;
            }
            return false;
        };

        const realFavs = favorites.filter(item => !isItemAnime(item));

        const sourceIds = [...new Set(realFavs.map(item => item._source ? item._source.id : null).filter(Boolean))];

        sourceBar.innerHTML = `
            <button class="source-btn ${favoritesSource === 'all' ? 'active' : ''}" data-source="all">All Sources <span class="source-count">(${realFavs.length})</span></button>
            ${sourceIds.map(s => {
            const count = realFavs.filter(item => item._source && item._source.id === s).length;
            const sourceInfo = SOURCES.find(src => src.id === s) || { name: s };
            return `<button class="source-btn ${favoritesSource === s ? 'active' : ''}" data-source="${s}">${sourceInfo.name} <span class="source-count">(${count})</span></button>`;
        }).join('')}
        `;


        sourceBar.querySelectorAll('.source-btn').forEach(btn => {
            btn.onclick = () => {
                sourceBar.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                favoritesSource = btn.dataset.source;
                renderFavorites();
            };
        });
    };

    // Add CSS for the dynamic buttons if not already in style.css
    if (!document.getElementById('fav-btn-styles')) {
        const style = document.createElement('style');
        style.id = 'fav-btn-styles';
        style.innerHTML = `
            .source-btn:hover { background: rgba(255,255,255,0.15) !important; transform: translateY(-2px); }
            .source-btn.active {
                background: var(--primary) !important;
                border-color: var(--primary) !important;
                color: #000 !important;
                font-weight: bold;
                box-shadow: 0 4px 12px var(--primary-glow);
            }
        `;
        document.head.appendChild(style);
    }

    // Initial trigger
    const grid = document.getElementById('mainGrid');
    if (favoritesType === 'real') {
        sourceBar.style.display = 'flex';
        if (grid) grid.classList.remove('vertical-grid');
        renderFavSourceButtons();
    } else {
        if (grid) grid.classList.add('vertical-grid');
    }
    const updateCategoryCounts = () => {
        updateFavoriteCounts();
    };

    updateCategoryCounts();
    renderFavorites();

    // Inject Bulk Button
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
        const isEnabled = localStorage.getItem('x_stream_auto_download') === 'true';
        navRight.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <label for="fav-auto-dl-switch" class="auto-dl-hoverable" style="cursor: pointer; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); padding: 5px 12px; border-radius: 50px; border: 1px solid rgba(255,255,255,0.1); transition: all 0.3s ease;">
                    <i class="fa-solid fa-robot" style="color: var(--primary);"></i>
                    <span style="color: #fff; font-size: 0.85rem; font-weight: bold; margin-right: 5px; user-select: none;">Auto-Downloader</span>
                    <div class="switch-premium" style="margin: 0; transform: scale(0.85); pointer-events: none;">
                        <input type="checkbox" id="fav-auto-dl-switch" ${isEnabled ? 'checked' : ''}>
                        <span class="slider-round"></span>
                    </div>
                </label>
            </div>
        `;

        const switchEl = document.getElementById('fav-auto-dl-switch');
        if (switchEl) {
            switchEl.onchange = (e) => {
                localStorage.setItem('x_stream_auto_download', e.target.checked);
                const toast = document.createElement('div');
                toast.className = 'toast-notif';
                toast.style = `position: fixed; top: 100px; left: 50%; transform: translateX(-50%); background: ${e.target.checked ? '#28a745' : '#666'}; color: white; padding: 12px 35px; border-radius: 50px; font-weight: 900; z-index: 10001; animation: fadeInUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: flex; align-items: center; gap: 10px;`;
                toast.innerHTML = e.target.checked ? "<i class='fa-solid fa-check'></i> Auto-Download Enabled" : "<i class='fa-solid fa-xmark'></i> Auto-Download Disabled";
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.animation = 'fadeOutDown 0.4s forwards';
                    setTimeout(() => toast.remove(), 400);
                }, 2500);

                if (e.target.checked) {
                    processNextAutoDownload();
                }
            };
            // Resume if previously enabled
            if (switchEl.checked) setTimeout(processNextAutoDownload, 1500);
        }
    }

    // Inject Bulk Bar if not exists
    if (!document.getElementById('bulk-bar')) {
        const bulkBar = document.createElement('div');
        bulkBar.id = 'bulk-bar';
        bulkBar.className = 'bulk-control-bar';
        bulkBar.innerHTML = `
            <div class="bulk-info-side">
                <div class="bulk-title-chip">Favorites Manager</div>
                <div class="bulk-count-box">Selected: <span id="selected-count">0</span></div>
            </div>
            <div class="bulk-actions-side">
                <button id="btn-select-all" class="bulk-btn-premium" onclick="selectAllItems()"><i class="fa-solid fa-check-double"></i> Select All</button>
                <button id="btn-download-selected" class="bulk-btn-premium download" onclick="downloadSelectedPython()" disabled><i class="fa-solid fa-download"></i> Download</button>
                <button class="bulk-btn-premium exit" onclick="toggleBulkMode()"><i class="fa-solid fa-xmark"></i> Exit</button>
            </div>
        `;
        document.body.appendChild(bulkBar);
    }
}

// --- Favorites ---
async function toggleFavorite(e, item) {
    if (e) e.stopPropagation();
    const index = favorites.findIndex(f => f.id === item.id);

    if (index === -1) {
        const sourceId = item._source ? (item._source.id || item._source) : (item.source || 'pornhub');
        let itemToSave = { ...item, timestamp: Date.now() };

        // 🌟 Minimal Save Strategy for Pornhub & Eporner (Links expire fast)
        if (sourceId === 'pornhub' || sourceId === 'eporner') {
            itemToSave = {
                id: item.id,
                name: item.name || item.title || "Video",
                source: sourceId,
                type: item.type || 'movie',
                timestamp: Date.now(),
                _source: item._source, // Keep source config
                duration: item.duration,
                poster: item.poster || item.thumbnail,
                thumbnail: item.thumbnail || item.poster,
                background: item.background,
                preview: item.preview // Video preview URL for hover playback
            };
        }

        // A. Add to Cloud (Primary for logged-in users)
        if (window.userProfile) {
            await saveFavoriteCloud(itemToSave);
        } else {
            // A. Add to Server (Global Shared Favorites for guests)
            try {
                await fetch('/api/favorites/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemToSave)
                });
            } catch (err) { console.error("Sync error:", err); }
        }

        favorites.unshift(itemToSave);
        await saveFavoriteDB(itemToSave); // B. Add to Local DB (Backup)

        // AUTO-CACHE IMAGES & PREVIEW for favorites_storage
        (async () => {
            try {
                const cacheSourceId = sourceId || 'unknown';
                const itemId = item.id;

                // Cache poster/thumbnail image
                const posterUrl = item.poster || item.thumbnail || item.background;
                if (posterUrl && posterUrl.startsWith('http')) {
                    fetch('/api/favorites/cache/image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: itemId,
                            url: posterUrl,
                            source: cacheSourceId
                        })
                    }).then(r => r.json()).then(data => {
                        if (data.success) console.log('🖼️ Image cached for:', itemId);
                    }).catch(e => console.log('Image cache failed:', e.message));
                }

                // Cache preview video
                const previewUrl = item.preview || item.previewUrl;
                if (previewUrl && previewUrl.startsWith('http')) {
                    fetch('/api/favorites/cache/preview', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: itemId,
                            url: previewUrl,
                            source: cacheSourceId
                        })
                    }).then(r => r.json()).then(data => {
                        if (data.success) console.log('🎬 Preview cached for:', itemId);
                    }).catch(e => console.log('Preview cache failed:', e.message));
                }
            } catch (cacheErr) {
                console.error('Cache error:', cacheErr);
            }
        })();

        // AUTO-DOWNLOAD FEATURE logic
        const autoDl = localStorage.getItem('x_stream_auto_download') === 'true';
        if (autoDl) {
            (async () => {
                try {
                    const sourceId = item._source ? (item._source.id || item._source) : '';
                    // Debug for XNXX
                    const isXNXX = sourceId === 'xnxx';
                    if (isXNXX) console.log('🔍 [XNXX Auto-DL] Starting auto download for:', item.id);

                    let finalLink = item.url || '';
                    if (!finalLink || finalLink === 'undefined') {
                        const sourceInfo = typeof SOURCES !== 'undefined' ? SOURCES.find(s => s.id === sourceId) : null;
                        const cleanBase = sourceInfo ? getCleanBase(sourceInfo.baseUrl) : `http://${window.location.hostname}:3000/${sourceId}`;
                        if (isXNXX) console.log('🔍 [XNXX Auto-DL] Fetching stream from:', cleanBase);

                        const resp = await fetch(`${cleanBase}/stream/movie/${encodeURIComponent(item.id)}.json`);
                        if (isXNXX) console.log('🔍 [XNXX Auto-DL] Stream response:', resp.status);

                        if (resp.ok) {
                            const data = await resp.json();
                            if (isXNXX) console.log('🔍 [XNXX Auto-DL] Streams found:', data.streams?.length || 0);

                            if (data.streams && data.streams.length > 0) {
                                // For XNXX, specifically prioritize XNXX High MP4
                                let stream = null;
                                if (sourceId === 'xnxx') {
                                    stream = data.streams.find(s => s.title && s.title.includes('XNXX High MP4')) ||
                                        data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4'));
                                } else {
                                    stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4'));
                                }
                                if (!stream) {
                                    stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('mp4') && !s.url.includes('.m3u8'));
                                }
                                if (!stream) {
                                    stream = data.streams[0];
                                }
                                if (isXNXX) console.log('🔍 [XNXX Auto-DL] Selected stream:', stream?.title || 'none');

                                if (stream && stream.url) {
                                    finalLink = stream.url;
                                    if (!finalLink.includes('/api/m3u8-proxy?url=') && !finalLink.includes('/api/stream?url=')) {
                                        const proxyPath = finalLink.includes('.m3u8') ? '/api/m3u8-proxy' : '/api/stream';
                                        finalLink = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(stream.url)}`;
                                    }
                                }
                            }
                        }
                    }
                    if (isXNXX) console.log('🔍 [XNXX Auto-DL] Final link:', finalLink ? 'exists' : 'none');

                    if (finalLink && finalLink !== 'undefined') {
                        const cleanName = (item.name || item.title || '').replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
                        if (isXNXX) console.log('🔍 [XNXX Auto-DL] Sending download request for:', cleanName);

                        const downloadRes = await fetch('/api/download/python', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                items: [{
                                    id: item.id,
                                    name: cleanName,
                                    link: finalLink,
                                    url: finalLink,
                                    source: sourceId
                                }]
                            })
                        });
                        if (isXNXX) console.log('🔍 [XNXX Auto-DL] Download API response:', downloadRes.status);
                        console.log('✅ Auto-DL started for:', cleanName);
                    } else {
                        if (isXNXX) console.error('❌ [XNXX Auto-DL] No valid link found!');
                    }
                } catch (e) {
                    console.error('❌ [XNXX Auto-DL] Failed:', e);
                }
            })();
        }
    } else {
        // C. Remove from Cloud (Primary for logged-in users)
        if (window.userProfile) {
            await removeFavoriteCloud(item.id);
        } else {
            // C. Remove from Server (Global Shared Favorites for guests)
            try {
                await fetch('/api/favorites/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id })
                });
            } catch (err) { console.error("Sync error:", err); }
        }

        // E. Delete downloaded file if exists
        try {
            const cleanName = (item.name || item.title || '').replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
            if (cleanName) {
                await fetch('/api/downloads/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: cleanName })
                });
            }
        } catch (err) { console.error("Delete file error:", err); }

        // F. Delete cached media from favorites_storage
        try {
            const sourceId = item._source?.id || item.source || 'unknown';
            await fetch('/api/favorites/cache/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, source: sourceId })
            });
            console.log('🗑️ Deleted cached media from favorites_storage for:', item.id);
        } catch (err) { console.error("Delete cached media error:", err); }

        favorites.splice(index, 1);
        await removeFavoriteDB(item.id); // D. Remove from Local DB (Backup)
        removeFavoriteCloud(item.id); // ☁️ E. Remove from Cloud (Global)
    }

    updateFavoritesUI();
    if (CURRENT_PAGE === 'favorites') renderFavorites();

    // Update active UI elements
    const btns = document.querySelectorAll(`.favorite-card-btn`);
    btns.forEach(btn => {
        const card = btn.closest('.card');
        if (card && card.dataset.id === item.id) {
            btn.classList.toggle('active', index === -1);
            btn.innerHTML = `<i class="fa-${index === -1 ? 'solid' : 'regular'} fa-heart"></i>`;
        }
    });

    // Sync if we are on watch page
    const watchFavBtn = document.getElementById('btn-watch-favorite');
    if (watchFavBtn && window.currentWatchItem && window.currentWatchItem.id === item.id) {
        watchFavBtn.innerHTML = `<i class="fa-${index === -1 ? 'solid' : 'regular'} fa-heart"></i> Favorite`;
        watchFavBtn.classList.toggle('active', index === -1);
    }
}


async function toggleWatchFavorite(e) {
    if (!window.currentWatchItem) return;
    await toggleFavorite(e, window.currentWatchItem);
}

function initAutoDownloadToggle() {
    const panel = document.getElementById('download-panel');
    if (!panel) return;

    if (!document.getElementById('auto-dl-wrap')) {
        const dlHeader = panel.querySelector('.dl-header');
        const wrap = document.createElement('label');
        wrap.id = 'auto-dl-wrap';
        wrap.className = 'auto-dl-bar';
        wrap.htmlFor = 'auto-dl-switch';
        wrap.style.cursor = 'pointer';
        const isEnabled = localStorage.getItem('x_stream_auto_download') === 'true';
        wrap.innerHTML = `
            <div class="auto-dl-info" style="pointer-events: none;">
                <i class="fa-solid fa-robot"></i>
                <div class="auto-dl-text">
                    <span class="auto-dl-title">Auto-Download</span>
                    <span class="auto-dl-sub">Download on favorite</span>
                </div>
            </div>
            <div class="switch-premium" style="pointer-events: none;">
                <input type="checkbox" id="auto-dl-switch" ${isEnabled ? 'checked' : ''}>
                <span class="slider-round"></span>
            </div>
        `;
        dlHeader.after(wrap);

        document.getElementById('auto-dl-switch').onchange = (e) => {
            localStorage.setItem('x_stream_auto_download', e.target.checked);
            toast(e.target.checked ? "Auto-Download Enabled" : "Auto-Download Disabled", e.target.checked ? "#28a745" : "#666");
        };
    }
}


// Duplicate toggleWatchFavorite removed here.

function updateFavoritesUI() {
    const favBtn = document.getElementById('btn-fav');
    if (favBtn && favorites.length > 0) {
        favBtn.innerHTML = `<i class="fa-solid fa-heart"></i> Favorites (${favorites.length})`;
    } else if (favBtn) {
        favBtn.innerHTML = `<i class="fa-regular fa-heart"></i> Favorites`;
    }
}

// Auto-refresh download status on favorites page
async function updateFavoritesDownloadStatus() {
    await fetchDownloadedFiles();

    // Update badges on favorite cards - EXACT name matching (ignoring emojis and symbols)
    document.querySelectorAll('.favorite-card').forEach(card => {
        const itemName = card.querySelector('.card-title')?.textContent?.trim() ||
            card.querySelector('.favorite-title')?.textContent?.trim() || '';

        // Normalize item name (remove extension, emojis, and symbols)
        const normalizedItem = normalizeForComparison(itemName.replace(/\.[^/.]+$/, ''));

        // Check exact match with any downloaded file
        const isDownloaded = downloadedFiles.some(f => {
            const downloadedName = f.name || f;
            const normalizedDownloaded = normalizeForComparison(downloadedName.replace(/\.[^/.]+$/, ''));

            // EXACT match: names must be identical (ignoring extension, case, emojis, and symbols)
            return normalizedDownloaded === normalizedItem;
        });

        if (isDownloaded) {
            card.classList.add('is-downloaded');
            const badge = card.querySelector('.downloaded-badge');
            if (badge) badge.classList.add('active');
        }
    });
}

function isFavorite(item) {
    return favorites.some(f => f.id === item.id);
}

// --- Carousel Logic ---
function renderCarousel() {
    const container = document.getElementById('hero-carousel');
    if (!container) return;

    if (carouselItems.length === 0) {
        // Show Carousel Skeleton
        container.innerHTML = `<div class="skeleton-img skeleton" style="width:100%; height:100%;"></div>`;
        return;
    }

    container.innerHTML = '';

    carouselItems.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;

        // وكيل الصور العلوي (Hero) لضمان عدم ظهور أخطاء بالصور الكبيرة
        const bg = item.background || item.poster;
        const proxiedBg = getProxiedUrl(bg);

        slide.innerHTML = `
            <div class="skeleton-img skeleton" style="position:absolute; inset:0; z-index:-1;"></div>
            <img src="${proxiedBg}" class="hero-img loading" alt="${item.name}" onload="this.classList.remove('loading'); this.classList.add('loaded');" onerror="handleImageError(this, '${item.id}', '${item._source.id}', '${item.type || 'movie'}')">
            <div class="hero-content" onclick="location.href='watch.html?id=${item.id}&source=${item._source.id}'">
                <h1 class="hero-title">${item.name}</h1>
            </div>
        `;
        container.appendChild(slide);
    });
}

function nextSlide() {
    const slides = document.getElementsByClassName('carousel-slide');
    if (slides.length === 0) return;


    if (allFoundStreams.length > 0) return deduplicateItemsByUrl(allFoundStreams);

    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
}




// --- Specialized Hanime Link Resolver ---
async function resolveHanimeDirect(item) {
    try {
        const slug = item.slug || (item.id.startsWith('hanime:') ? item.id.substring(7) : item.id);

        console.log(`📡 Fetching Hanime via Local API for: ${slug}`);
        const response = await fetch(`/api/get-video/${slug}`);
        const data = await response.json();

        // New API returns { streams: [...] }
        if (data && data.streams && data.streams.length > 0) {
            return data.streams;
        }

        // Legacy/Fallback support
        if (data && data.streamUrl) {
            return [{ title: 'Hanime Direct', url: data.streamUrl }];
        }

        return [];
    } catch (e) {
        console.warn("Local Hanime resolver failed", e);
        return [];
    }
}

function deduplicateItemsByUrl(streams) {
    const unique = [];
    const seen = new Set();
    streams.forEach(s => {
        const key = s.url || s.infoHash;
        if (key && !seen.has(key)) {
            seen.add(key);
            unique.push(s);
        }
    });
    return unique;
}

function detectQuality(text) {
    const t = text.toLowerCase();
    if (t.match(/2160p|4k|uhd/i)) return '2160p';
    if (t.match(/1440p|2k/i)) return '1440p';
    if (t.match(/1080p|fhd/i)) return '1080p';
    if (t.match(/720p|hd/i)) return '720p';
    if (t.match(/480p|sd/i)) return '480p';
    if (t.match(/360p/i)) return '360p';
    if (t.match(/240p/i)) return '240p';
    if (t.match(/144p/i)) return '144p';
    if (t.includes('high')) return '720p';
    if (t.includes('low')) return '360p';
    return 'HD';
}

async function validateStreamUrl(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

        let target = url;
        if (!target.includes(window.location.origin) && !target.includes('/api/m3u8-proxy')) {
            target = `${window.location.origin}/api/m3u8-proxy?url=${encodeURIComponent(target)}`;
        }

        const res = await fetch(target, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-1' },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return res.ok || res.status === 206;
    } catch (e) {
        return false;
    }
}

async function detectHlsQualities(url) {
    try {
        const proxyBase = `${window.location.origin}/api/m3u8-proxy?url=`;
        let target = url;
        if (!target.includes(window.location.origin) && !target.includes('/api/m3u8-proxy')) {
            target = proxyBase + encodeURIComponent(target);
        }

        const res = await fetch(target);
        const text = await res.text();
        if (!text.includes('#EXTM3U')) return null;

        const qualities = [];
        const lines = text.split('\n');

        // Resolve base URL for relative paths
        let baseUrl = url;
        if (url.includes('?url=')) {
            baseUrl = decodeURIComponent(url.split('?url=')[1].split('&')[0]);
        }
        const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('#EXT-X-STREAM-INF:')) {
                let q = null;

                // 1. Try Resolution
                const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
                if (resMatch) {
                    const h = parseInt(resMatch[1]);
                    const commonQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160];
                    const closest = commonQualities.find(val => Math.abs(val - h) < 10) || h;
                    q = closest + 'p';
                }

                // 2. Try Name if resolution missing
                if (!q) {
                    const nameMatch = line.match(/NAME="([^"]+)"/);
                    if (nameMatch) {
                        const name = nameMatch[1];
                        if (name.toLowerCase().includes('p')) q = name;
                        else if (name.match(/^\d+$/)) q = name + 'p';
                        else q = name;
                    }
                }

                // 3. Find URL on next line
                let subUrl = lines[i + 1] ? lines[i + 1].trim() : null;
                if (subUrl && !subUrl.startsWith('#') && q) {
                    // Resolve relative URL
                    if (!subUrl.startsWith('http')) {
                        if (subUrl.startsWith('/')) {
                            const u = new URL(baseUrl);
                            subUrl = u.origin + subUrl;
                        } else {
                            subUrl = baseDir + subUrl;
                        }
                    }
                    qualities.push({ q, url: subUrl });
                }
            }
        }

        // Sort by quality height
        const result = qualities.length > 0 ? qualities.sort((a, b) => parseInt(b.q) - parseInt(a.q)) : null;
        console.log(`✅ Detected qualities for ${url.substring(0, 50)}...:`, result);
        return result;
    } catch (e) {
        console.log('❌ Failed to detect HLS qualities:', e);
        return null;
    }
}

async function scrapeStream(item) {
    if (item.website || item.url) {
        const target = item.website || item.url;
        try {
            const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target);
            const html = await (await fetch(proxy)).text();
            const match = html.match(/https?:\/\/[^\s"']+\.mp4([^\s"']*)?/);
            if (match) return match[0];
        } catch (e) { }
    }
    return null;
}

async function renderSourceButtons(streams, item) {
    const container = document.getElementById('source-list');
    const sidebarSection = container ? container.closest('.sidebar-section') : null;
    if (!container) return;

    // 🎯 USER REQUEST: For Pornhub, only show the HLS server
    let filteredStreams = [...streams];
    const isPornhub = item._source?.id === 'pornhub' || (item.id && item.id.startsWith('ph'));

    if (isPornhub) {
        filteredStreams = streams.filter(s => s.title && s.title.toLowerCase().includes('hls'));
        // If no HLS, keep whatever we have, but usually HLS is there
        if (filteredStreams.length === 0) filteredStreams = [streams[0]];
    }

    // 🎯 STRICT DEDUPLICATION: Only show ONE entry per quality label
    const uniqueStreams = [];
    const seenQualities = new Set();

    // Sort by quality weight first to ensure we keep the best version of each quality if multiple exist
    const qMap = { '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'HD': 0 };
    const sortedInput = [...streams].sort((a, b) => {
        const qA = detectQuality(a.title || a.name || '');
        const qB = detectQuality(b.title || b.name || '');
        return (qMap[qB] || 0) - (qMap[qA] || 0);
    });

    sortedInput.forEach(s => {
        const q = detectQuality(s.title || s.name || '');
        if (!seenQualities.has(q)) {
            seenQualities.add(q);
            uniqueStreams.push(s);
        }
    });

    filteredStreams = uniqueStreams;

    if (filteredStreams.length === 0) {
        if (sidebarSection) sidebarSection.style.display = 'none';
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No streams found for this content.</p>';
        return;
    }

    // 🎯 USER REQUEST: Always show sidebar if servers are found (don't hide if only one)
    if (sidebarSection) sidebarSection.style.display = 'block';

    console.log(`🎬 Processing ${filteredStreams.length} streams for quality detection...`);

    // 🎯 Fetch all qualities for each stream
    const streamsWithQualities = await Promise.all(filteredStreams.map(async (stream) => {
        const isHls = stream.url && (stream.url.toLowerCase().includes('m3u8') || stream.url.toLowerCase().includes('master'));
        let allQualities = null;

        if (isHls && stream.url) {
            console.log(`🔍 Detecting qualities for: ${stream.url.substring(0, 60)}...`);
            allQualities = await detectHlsQualities(stream.url);
            console.log(`📊 Found qualities:`, allQualities);
        }

        return { ...stream, allQualities };
    }));

    // 🎯 Store globally for ArtPlayer quality menu
    window.currentStreams = streamsWithQualities;

    // 🎯 Clear container ONLY AFTER results are ready to be rendered
    container.innerHTML = '';

    streamsWithQualities.forEach((stream, idx) => {
        const card = document.createElement('div');
        card.className = 'stream-card';
        if (idx === 0) card.classList.add('active');

        const isTorrent = stream.isTorrent || (!stream.url && stream.infoHash);
        const quality = isTorrent ? 'TORRENT' : (stream.quality || detectQuality(stream.title || stream.name || ''));
        const addon = stream.addon || item._source.name;

        // 🎯 Show all available qualities as badges with individual download buttons
        let qualitiesHtml = '';
        const hasMultipleQualities = stream.allQualities && stream.allQualities.length > 0;

        if (hasMultipleQualities) {
            const badges = stream.allQualities.map(itemQ => {
                const qLabel = itemQ.q;
                const qUrl = itemQ.url;
                const height = parseInt(qLabel);
                let color = '#888';
                let labelExtra = '';

                if (height >= 1080) {
                    color = '#00ff7f'; // Ultra/Full HD
                } else if (height >= 720) {
                    color = '#f0a500'; // HD
                } else {
                    color = '#00d2ff'; // SD (Sky Blue)
                    labelExtra = ' <span style="font-size:8px; opacity:0.7; margin-left:2px;">SD</span>';
                }

                let downloadUrl = qUrl;
                if (!downloadUrl.includes('/api/m3u8-proxy?url=') && downloadUrl.includes('.m3u8')) {
                    const parentReferer = stream.url.includes('referer=') ? stream.url.split('referer=')[1].split('&')[0] : '';
                    downloadUrl = `${window.location.origin}/api/m3u8-proxy?url=${encodeURIComponent(qUrl)}${parentReferer ? '&referer=' + parentReferer : ''}`;
                }

                return `
                    <div class="quality-badge-wrapper" style="display:flex; align-items:center; gap:6px; background:${color}15; border:1px solid ${color}30; border-radius:6px; padding:6px 10px; flex: 1 1 45%; min-width:80px; transition:all 0.2s ease;">
                        <span class="quality-badge-small" style="color:${color}; font-size:11px; font-weight:800; flex-grow:1;">${qLabel}${labelExtra}</span>
                        <button class="quality-dl-mini-btn" title="Download ${qLabel}" 
                                style="background:none; border:none; color:${color}; cursor:pointer; padding:2px; font-size:12px; opacity:0.8; transition:all 0.2s ease;">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    </div>
                `;
            }).join('');
            qualitiesHtml = `<div class="qualities-dropdown" style="display:none; gap:8px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); animation: slideDown 0.3s ease-out;">${badges}</div>`;
        }

        const displayTitle = (quality && quality !== 'HD' && quality !== 'MULTI') ? quality :
            (formatStreamTitle(stream.title || stream.name) || `Server ${idx + 1}`);

        const dlIcon = hasMultipleQualities ? 'fa-chevron-down' : 'fa-download';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <div class="stream-info" style="flex-grow:1;">
                    <span class="stream-name" style="color:var(--primary); font-weight:800; font-size:1rem; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayTitle}</span>
                </div>
                <button class="server-dl-btn" title="${hasMultipleQualities ? 'Select Quality' : 'Download Video'}" 
                        style="transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); flex-shrink:0;">
                    <i class="fa-solid ${dlIcon}"></i>
                </button>
            </div>
            ${qualitiesHtml}
        `;

        // 🛠️ Set click handlers programmatically to avoid escaping hell
        const dlBtn = card.querySelector('.server-dl-btn');
        if (dlBtn) {
            dlBtn.onclick = (e) => {
                e.stopPropagation();
                if (hasMultipleQualities) {
                    const dropdown = card.querySelector('.qualities-dropdown');
                    if (dropdown) {
                        const isHidden = dropdown.style.display === 'none';
                        dropdown.style.display = isHidden ? 'flex' : 'none';
                        dlBtn.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
                    }
                } else {
                    triggerServerDownload(stream.url, (item.name || item.title || 'video'), dlBtn);
                }
            };
        }

        // 🛠️ Set click handlers for mini quality buttons (Entire wrapper is now clickable)
        if (hasMultipleQualities) {
            const badgeWrappers = card.querySelectorAll('.quality-badge-wrapper');
            stream.allQualities.forEach((itemQ, qIdx) => {
                const wrapper = badgeWrappers[qIdx];
                if (wrapper) {
                    wrapper.style.cursor = 'pointer';
                    wrapper.onclick = (e) => {
                        e.stopPropagation();
                        const miniBtn = wrapper.querySelector('.quality-dl-mini-btn');
                        let downloadUrl = itemQ.url;
                        if (!downloadUrl.includes('/api/m3u8-proxy?url=') && downloadUrl.includes('.m3u8')) {
                            const parentReferer = stream.url.includes('referer=') ? stream.url.split('referer=')[1].split('&')[0] : '';
                            downloadUrl = `${window.location.origin}/api/m3u8-proxy?url=${encodeURIComponent(itemQ.url)}${parentReferer ? '&referer=' + parentReferer : ''}`;
                        }
                        triggerServerDownload(downloadUrl, `${item.name || item.title || 'video'} - ${itemQ.q}`, miniBtn || wrapper);
                    };
                }
            });
        }

        card.onclick = () => {
            document.querySelectorAll('.stream-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            // Store qualities for player
            if (stream.allQualities) {
                window._availableQualities = stream.allQualities;
            }

            playUrl(stream.url, item);
        };

        container.appendChild(card);

        // 🛡️ BACKGROUND VALIDATION (DISABLED PER USER REQUEST: Show all servers even if not working)
        /*
        if (!isTorrent && stream.url) {
            validateStreamUrl(stream.url).then(isValid => {
                if (!isValid) {
                    card.style.display = 'none'; 
                    const visibleCards = Array.from(container.querySelectorAll('.stream-card')).filter(c => c.style.display !== 'none');
                    if (visibleCards.length <= 1 && sidebarSection) {
                        sidebarSection.style.display = 'none';
                    }
                }
            });
        }
        */
    });

    // Apply reveal observer to stream cards
    if (revealObserver) {
        const streamCards = container.querySelectorAll('.stream-card:not(.revealed)');
        streamCards.forEach(card => revealObserver.observe(card));
    } else {
        const streamCards = container.querySelectorAll('.stream-card:not(.revealed)');
        streamCards.forEach((card, idx) => setTimeout(() => card.classList.add('revealed'), idx * 50));
    }

    // Support for episodes if available in meta
    if (item.videos && item.videos.length > 0) {
        renderEpisodes(item.videos, item);
    }
}

function renderEpisodes(videos, item) {
    const section = document.getElementById('episodes-section');
    const container = document.getElementById('episodes-list');
    if (!section || !container) return;

    section.style.display = 'block';
    container.innerHTML = '';

    videos.forEach((vid, idx) => {
        const card = document.createElement('div');
        card.className = 'stream-card';

        card.innerHTML = `
            <div class="stream-info">
                <span class="stream-name">E${vid.episode || idx + 1}: ${vid.title || vid.name || 'Episode ' + (idx + 1)}</span>
            </div>
        `;

        card.onclick = () => {
            const newId = vid.id || vid.url;
            window.location.href = `watch.html?id=${encodeURIComponent(newId)}&source=${item._source.id}`;
        };

        container.appendChild(card);
    });
}

function formatStreamTitle(rawTitle) {
    if (!rawTitle) return null;
    const match = rawTitle.match(/^(.*?) (?:💾|⌚) (.*?)(?: (?:⌚|💾)|$)/);
    if (match) return `${match[1]} (${match[2]})`;
    return rawTitle;
}

function createSourceList() {
    const infoDiv = document.querySelector('.movie-info');
    const div = document.createElement('div');
    div.id = 'source-list';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginTop = '10px';
    div.style.flexWrap = 'wrap';
    infoDiv.appendChild(div);
    return div;
}

// --- Player Engine ---
/**
 * 🎯 Dynamically updates ArtPlayer's quality menu with discovered streams
 */
function updateArtPlayerQualityMenu() {
    if (!window.art || !window.currentStreams || window.currentStreams.length === 0) return;

    const streams = window.currentStreams;
    let qualities = [];

    // 1. Flatten all available qualities from all streams
    streams.forEach(stream => {
        if (stream.allQualities && stream.allQualities.length > 0) {
            stream.allQualities.forEach(q => {
                qualities.push({
                    html: q.q.includes('p') ? q.q : q.q + 'p',
                    url: q.url,
                    height: parseInt(q.q) || 0
                });
            });
        } else if (stream.url) {
            const q = stream.quality || detectQuality(stream.title || stream.name || '');
            qualities.push({
                html: q.includes('p') ? q : q + 'p',
                url: stream.url,
                height: parseInt(q) || 0
            });
        }
    });

    // 2. Remove duplicates and sort by height
    const unique = [];
    const seen = new Set();
    qualities.forEach(q => {
        const key = q.html.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(q);
        }
    });
    unique.sort((a, b) => b.height - a.height);

    if (unique.length <= 1) return; // Don't show menu if only one quality

    // 3. Prepare selector items
    const selector = unique.map(q => {
        // Wrap URL in proxy if needed for bypassing blocks
        let finalUrl = q.url;
        if (finalUrl && !finalUrl.startsWith('/') && !finalUrl.includes(window.location.hostname)) {
            const isHls = finalUrl.includes('.m3u8') || finalUrl.includes('master.');
            const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
            finalUrl = `${proxyPath}?url=${encodeURIComponent(finalUrl)}`;
        }

        return {
            html: q.html,
            url: finalUrl,
            default: window.currentHlsUrl === finalUrl || window.currentHlsUrl === q.url
        };
    });

    // 4. Update ArtPlayer Settings
    window.art.setting.update('quality', {
        html: '<i class="fa-solid fa-sliders" style="margin-right:8px;"></i> Quality',
        selector: selector,
        onSelect: function (item) {
            if (item.url) {
                console.log(`🎯 [Quality Switch] Changing to ${item.html}: ${item.url.substring(0, 50)}...`);
                window.currentHlsUrl = item.url;
                
                // ?? USER REQUEST: Save current time before switching quality
                const currentTime = window.art.currentTime;
                
                window.art.switchUrl(item.url).then(() => {
                    if (currentTime > 0) {
                        window.art.currentTime = currentTime;
                        window.art.play();
                    }
                });
            }
            return item.html;
        }
    });

    console.log(`✅ ArtPlayer Quality Menu updated with ${unique.length} options.`);
}

function initPlayer(initialUrl = '') {
    if (art) return;
    const container = document.querySelector('.player-container');
    if (!container) return;

    art = new Artplayer({
        container: container,
        url: initialUrl,
        title: window.currentWatchItem ? window.currentWatchItem.name : 'Video',
        poster: window.currentWatchItem ? (window.currentWatchItem.background || window.currentWatchItem.poster || '') : '',
        volume: 1,
        isLive: false,
        muted: false,
        autoplay: false,
        pip: false,
        autoSize: true,
        autoMini: false,
        screenshot: false,
        setting: false,
        loop: false,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: true,
        airplay: true,
        theme: '#f0a500', // Premium Dark Amber Theme
        moreVideoAttr: {
            // crossOrigin: 'anonymous', // 🛡️ REMOVED to fix proxy compatibility issues
            playsInline: true,
        },
        settings: [
            {
                html: 'Quality',
                name: 'quality',
                width: 150,
                tooltip: 'Auto',
                selector: [
                    {
                        default: true,
                        html: 'Auto',
                        level: -1
                    },
                ],
                onSelect: function (item) {
                    if (art.hls) {
                        art.hls.currentLevel = item.level;
                    }
                    return item.html;
                },
            },
        ],
        customType: {
            m3u8: function (video, url, art) {
                window._forcedHighestQuality = false;
                if (Hls.isSupported()) {
                    if (art.hls) art.hls.destroy();
                    const hls = new Hls();
                    hls.loadSource(url);
                    hls.attachMedia(video);
                    art.hls = hls;

                    const updateQualityMenu = () => {
                        const levels = hls.levels;
                        if (levels && levels.length > 1) {
                            // Sort levels by height (highest first)
                            const sortedLevels = [...levels].map((level, index) => ({
                                level: index,
                                height: level.height || 0,
                                bitrate: level.bitrate || 0
                            })).sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);

                            const qualityItems = sortedLevels.map((item) => {
                                const level = levels[item.level];
                                let label = level.height ? level.height + 'p' : 'HD';
                                const commonQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160];
                                const match = commonQualities.find(q => Math.abs(q - level.height) < 10);
                                if (match) label = match + 'p';

                                return {
                                    html: label,
                                    level: item.level,
                                };
                            });

                            // Add Auto option at the end
                            qualityItems.push({
                                html: 'Auto',
                                level: -1,
                            });

                            // 🎯 USER REQUEST: Force highest quality on first load
                            if (!window._forcedHighestQuality) {
                                console.log(`🚀 Forcing highest quality: ${qualityItems[0].html}`);
                                hls.currentLevel = qualityItems[0].level;
                                window._forcedHighestQuality = true;
                                art.setting.update('quality', { tooltip: qualityItems[0].html });
                            }

                            // Update the existing settings menu
                            art.setting.update('quality', {
                                html: '<i class="fa-solid fa-sliders" style="margin-right:8px;"></i> Quality',
                                selector: qualityItems.map(item => ({
                                    ...item,
                                    default: item.level === hls.currentLevel
                                })),
                            });
                            console.log(`✅ Quality Menu Updated: ${qualityItems.length} levels found.`);
                        }
                    };

                    hls.on(Hls.Events.MANIFEST_PARSED, updateQualityMenu);
                    hls.on(Hls.Events.LEVEL_LOADED, updateQualityMenu);

                    // Fallback timer for slow manifests
                    setTimeout(updateQualityMenu, 2000);

                    art.on('destroy', () => hls.destroy());
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                }
            },
        },
        icons: {
            loading: '<div class="spinner"></div>',
            state: '<div class="play-icon-circle"><i class="fas fa-play"></i></div>',
        },
        controls: [],
    });

    // 1. Progress Saving (Continue Watching)
    art.on('video:timeupdate', () => {
        if (!window.currentWatchItem) return;
        const currentTime = art.currentTime;
        const duration = art.duration;
        if (currentTime > 10 && duration > 0) {
            saveVideoProgress(window.currentWatchItem, currentTime, duration);
        }
    });

    // 2. Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('player-overlay');
        const isActive = (overlay && overlay.classList.contains('active')) || CURRENT_PAGE === 'watch';
        if (!isActive || !art) return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                art.toggle();
                break;
            case 'ArrowLeft':
                art.seek = art.currentTime - 10;
                break;
            case 'ArrowRight':
                art.seek = art.currentTime + 10;
                break;
            case 'f':
            case 'F':
                art.fullscreen = !art.fullscreen;
                break;
            case 'm':
            case 'M':
                art.muted = !art.muted;
                break;
        }
    });
    // 3. YouTube-style Double Tap to Seek (Optimized & Fixed)
    art.on('view:click', (e) => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;

        if (now - (art._lastTap || 0) < DOUBLE_TAP_DELAY) {
            // Double Tap Detected
            art._lastTap = 0;

            // Undo the play/pause toggle from the first click
            art.toggle();

            const rect = art.container.getBoundingClientRect();
            const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
            const width = rect.width;
            const side = x < width / 2 ? 'left' : 'right';
            const seekAmount = 5;

            if (side === 'left') {
                art.seek = Math.max(0, art.currentTime - seekAmount);
                showSeekFeedback('left', seekAmount);
            } else {
                art.seek = Math.min(art.duration, art.currentTime + seekAmount);
                showSeekFeedback('right', seekAmount);
            }
        } else {
            art._lastTap = now;
        }
    });

    function showSeekFeedback(side, amount) {
        let feedback = document.querySelector('.seek-feedback');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'seek-feedback';
            art.container.appendChild(feedback);
        }

        feedback.className = `seek-feedback ${side} active`;
        feedback.innerHTML = `
            <div class="seek-icon-wrap">
                <i class="fa-solid fa-angles-${side === 'left' ? 'left' : 'right'}"></i>
                <span>${amount}s</span>
            </div>
        `;

        setTimeout(() => {
            feedback.classList.remove('active');
        }, 600);
    }
}

function saveVideoProgress(item, time, duration) {
    if (!item) return;
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');

    // Ensure we capture the source ID reliably
    const sourceId = item._source?.id || item.sourceId || currentSourceFilter || '';

    saved[item.id] = {
        ...item,
        _sourceId: sourceId,
        _time: time,
        _duration: duration,
        _lastWatched: Date.now()
    };

    // Clean up old entries (limit to 20)
    const entries = Object.entries(saved);
    if (entries.length > 20) {
        const sorted = entries.sort((a, b) => b[1]._lastWatched - a[1]._lastWatched);
        localStorage.setItem(CONFIG.STORAGE.CONTINUE, JSON.stringify(Object.fromEntries(sorted.slice(0, 20))));
    } else {
        localStorage.setItem(CONFIG.STORAGE.CONTINUE, JSON.stringify(saved));
    }

    // ☁️ Sync with cloud
    const progress = duration > 0 ? Math.round((time / duration) * 100) : 0;
    saveHistoryCloud(item, progress);
}

// --- Continue Watching Logic ---
function initContinueWatching() {
    if (CURRENT_PAGE !== 'home') return;

    const grid = document.getElementById('continueWatchingGrid');
    const section = document.getElementById('continue-watching-section');
    if (!grid || !section) return;

    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');
    if (Object.keys(saved).length === 0) return;

    section.style.display = 'block';

    // Set initial layout for default 'real' filter
    grid.style.display = 'grid';
    grid.style.gridAutoFlow = 'column';
    grid.style.gridAutoColumns = '260px';
    grid.style.overflowX = 'auto';

    // Show Skeletons briefly
    let skeletonHtml = '';
    for (let i = 0; i < 4; i++) {
        skeletonHtml += `
            <div class="skeleton-card" style="width: 100%; flex: 0 0 auto;">
                <div class="skeleton-img skeleton"></div>
                <div class="skeleton-info">
                    <div class="skeleton-text skeleton-title skeleton"></div>
                    <div class="skeleton-text skeleton-subtitle skeleton"></div>
                </div>
            </div>`;
    }
    grid.innerHTML = skeletonHtml;

    setTimeout(() => {
        renderContinueWatching();
    }, 800);
}

let currentContinueFilter = 'real';

function filterContinue(type) {
    if (currentContinueFilter === type) return;
    currentContinueFilter = type;

    // Update UI active state
    document.querySelectorAll('.continue-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${type}'`));
    });

    // Show Skeletons during transition
    const grid = document.getElementById('continueWatchingGrid');
    if (grid) {
        let skeletonHtml = '';
        const isVertical = (type === 'anime');

        if (isVertical) {
            // Apply full grid for Anime
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
            grid.style.gridAutoFlow = 'row';
            grid.style.overflowX = 'hidden';
        } else {
            // Apply horizontal scroll for Real
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'none';
            grid.style.gridAutoFlow = 'column';
            grid.style.gridAutoColumns = '260px';
            grid.style.overflowX = 'auto';
        }

        for (let i = 0; i < 4; i++) {
            skeletonHtml += `
                <div class="skeleton-card ${isVertical ? 'card-vertical' : ''}" style="width: 100%; flex: 0 0 auto;">
                    <div class="skeleton-img skeleton"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-text skeleton-title skeleton"></div>
                        <div class="skeleton-text skeleton-subtitle skeleton"></div>
                    </div>
                </div>`;
        }
        grid.innerHTML = skeletonHtml;
    }

    // Render real content after a short delay
    setTimeout(() => {
        renderContinueWatching();
    }, 400);
}

function renderContinueWatching() {
    const grid = document.getElementById('continueWatchingGrid');
    const section = document.getElementById('continue-watching-section');
    if (!grid || !section) return;

    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');
    let entries = Object.values(saved).sort((a, b) => b._lastWatched - a._lastWatched);

    // Apply Filter
    if (currentContinueFilter === 'real') {
        entries = entries.filter(item => {
            const type = (item.type || '').toLowerCase();
            const sId = (item._sourceId || item._source?.id || '').toLowerCase();
            const sourceName = (item._source?.name || '').toLowerCase();
            const isAnime = type === 'anime' || type === 'hentai' ||
                sId.includes('hanime') || sId.includes('hentai') ||
                sourceName.includes('hanime') || sourceName.includes('hentai');
            return !isAnime;
        });
    } else if (currentContinueFilter === 'anime') {
        entries = entries.filter(item => {
            const type = (item.type || '').toLowerCase();
            const sourceId = (item._source?.id || '').toLowerCase();
            const sourceName = (item._source?.name || '').toLowerCase();
            const isAnime = type === 'anime' || type === 'hentai' ||
                sourceId.includes('hanime') || sourceName.includes('hanime') ||
                sourceId === 'hentai';
            return isAnime;
        });
    }

    // Limit to 20
    entries = entries.slice(0, 20);

    if (entries.length === 0) {
        if (currentContinueFilter === 'all') {
            section.style.display = 'none';
        } else {
            grid.innerHTML = `<div style="padding: 20px; color: #666; width: 100%; text-align: center;">No ${currentContinueFilter} history found.</div>`;
        }
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const isVerticalPage = (currentContinueFilter === 'anime');

    entries.forEach(item => {
        const progress = (item._time / item._duration * 100).toFixed(0);
        const card = document.createElement('article');
        const cleanName = (item.name || item.title || 'Video').replace(/<[^>]*>?/gm, '');
        const posterUrl = getProxiedUrl(item.poster || item.thumbnail);
        const isFav = isFavorite(item);
        const previewUrl = item.preview || item.previewUrl || "";

        // Use card-vertical for anime
        card.className = `card reveal-item ${isVerticalPage ? 'card-vertical' : ''}`;
        if (isVerticalPage) {
            card.style.width = '180px';
            card.style.minWidth = '180px';
            card.style.flex = '0 0 auto';
        }

        card.dataset.id = item.id;
        card.dataset.sourceId = item._source?.id || '';
        card.onclick = () => location.href = `watch.html?id=${item.id}&source=${item._source?.id || ''}`;

        // --- Fix Hover Preview ---
        card.onmouseenter = () => VideoPreviewManager.start(card);
        card.onmouseleave = () => VideoPreviewManager.stop(card);

        card.innerHTML = `
            <div class="card-image-wrap">
                <img src="${posterUrl}" class="card-poster" loading="lazy" alt="${cleanName}" 
                     onerror="handleImageError(this, '${item.id}', '${item._source?.id || ''}', 'movie')">
                
                <div class="progress-bar-container" style="bottom: 0; opacity: 1; z-index: 20;">
                    <div class="progress-bar-fill" style="width: ${progress}%"></div>
                </div>

                <div class="card-overlay"></div>
                <video class="preview-player" data-src="${previewUrl ? getProxiedUrl(previewUrl) : 'undefined'}" loop muted playsinline></video>
                <div class="preview-loader"><div class="spinner-small"></div></div>
                
                <div class="favorite-card-btn ${isFav ? 'active' : ''}" 
                     onclick="event.stopPropagation(); window.lastFavoriteItem = ${JSON.stringify(item).replace(/"/g, '&quot;')}; toggleFavorite(event, window.lastFavoriteItem)">
                    <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
                </div>
                ${item.duration ? `<div class="duration-badge">${formatDuration(item.duration)}</div>` : ''}
            </div>
            <div class="card-info">
                <h3 class="card-title">${cleanName}</h3>
                <div class="card-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; font-size: 0.8rem; color: #888;">
                    <span class="card-source" style="color:var(--primary); font-weight:bold;">${item._source?.name || 'Unknown'}</span>
                    ${(isVerticalPage && item.duration) ? `<span class="card-duration">${formatDuration(item.duration)}</span>` : ''}
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });

    grid.appendChild(fragment);

    // Force reveal items immediately if observer doesn't catch them
    setTimeout(() => {
        grid.querySelectorAll('.reveal-item').forEach(el => el.classList.add('revealed'));
    }, 50);

    if (typeof initVideoPreviewManager === 'function') initVideoPreviewManager();
}

function clearWatchHistory() {
    if (confirm('Are you sure you want to clear your watch history?')) {
        localStorage.removeItem(CONFIG.STORAGE.CONTINUE);
        renderContinueWatching();
    }
}

// Restore saved progress when video loads
function restoreVideoProgress(item) {
    if (!item || !item.id) return 0;
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');
    const savedItem = saved[item.id];
    if (savedItem && savedItem._time && savedItem._duration) {
        // Resume if not finished (less than 90% watched)
        const progress = savedItem._time / savedItem._duration;
        if (progress < 0.9) {
            console.log(`▶️ Continue Watching: Resuming ${item.name} at ${formatDuration(savedItem._time)}`);
            return savedItem._time;
        }
    }
    return 0;
}

// Get Continue Watching items for display
function getContinueWatchingItems() {
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');
    const items = Object.values(saved).filter(item => {
        if (!item._time || !item._duration) return false;
        const progress = item._time / item._duration;
        return progress > 0.05 && progress < 0.9; // More than 5% but not finished
    });
    // Sort by last watched time (newest first)
    return items.sort((a, b) => b._lastWatched - a._lastWatched);
}

// Remove from Continue Watching
function removeFromContinueWatching(itemId) {
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.CONTINUE) || '{}');
    if (saved[itemId]) {
        delete saved[itemId];
        localStorage.setItem(CONFIG.STORAGE.CONTINUE, JSON.stringify(saved));
    }
}

// Mobile download function
function mobileDownloadItem(itemId, title, sourceId) {
    // Check if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        // Find the item from allItems
        const item = allItems.find(i => i.id === itemId);
        if (!item) {
            console.error('Item not found for mobile download:', itemId);
            return;
        }

        // Get the stream URL
        (async () => {
            try {
                const sourceId = item._source?.id || sourceId;
                const sourceInfo = typeof SOURCES !== 'undefined' ? SOURCES.find(s => s.id === sourceId) : null;
                const cleanBase = sourceInfo ? getCleanBase(sourceInfo.baseUrl) : `http://${window.location.hostname}:3000/${sourceId}`;

                const resp = await fetch(`${cleanBase}/stream/movie/${encodeURIComponent(itemId)}.json`);
                const data = await resp.json();

                if (data.streams && data.streams.length > 0) {
                    // Find the best stream for mobile
                    let stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4')) ||
                        data.streams.find(s => s.title && s.title.toLowerCase().includes('mp4'));

                    if (!stream) stream = data.streams[0];

                    const mobileUrl = `/api/download/mobile?url=${encodeURIComponent(stream.url)}&title=${encodeURIComponent(title)}`;
                    console.log(`📱 Mobile download: ${title} -> ${mobileUrl}`);
                    window.location.href = mobileUrl;
                } else {
                    console.error('No streams found for mobile download:', itemId);
                }
            } catch (e) {
                console.error('Mobile download error:', e);
            }
        })();
    } else {
        console.log('📱 Mobile download called on non-mobile device');
    }
}

function playNextVideo() {
    if (allItems.length === 0) return;

    // Increment index
    currentPlayingIndex++;
    if (currentPlayingIndex >= allItems.length) currentPlayingIndex = 0;

    const nextItem = allItems[currentPlayingIndex];
    if (nextItem) {
        console.log(`▶ Playing Next: ${nextItem.name}`);
        if (CURRENT_PAGE === 'watch') {
            window.location.href = `watch.html?id=${nextItem.id}&source=${nextItem._source.id}`;
        } else {
            openPlayer(nextItem);
        }
    }
}


// --- Enhanced Player with HLS.js & CORS Fallback (Smart Player V3) ---
// ═══════════════════════════════════════════════════════════════
// SMART PLAYER V3 (Consolidated & Non-Redundant)
// ═══════════════════════════════════════════════════════════════

async function playUrl(url, item = null, useProxy = false, proxyIndex = 0) {
    // 🎯 Reset forced highest quality for new video
    window._forcedHighestQuality = false;

    // 🔓 DEEP UNWRAP: Remove any existing proxy or API wrappers first
    let cleanUrl = url;
    if (cleanUrl.includes('url=')) {
        try {
            const potential = cleanUrl.split('url=')[1].split('&')[0];
            const decoded = decodeURIComponent(potential);
            if (decoded.startsWith('http') || decoded.startsWith('/api/stream')) {
                cleanUrl = decoded;
                // If it was /api/stream?url=... unwrap again
                if (cleanUrl.includes('url=')) {
                    const inner = cleanUrl.split('url=')[1].split('&')[0];
                    cleanUrl = decodeURIComponent(inner);
                }
            }
        } catch (e) { }
    }

    url = cleanUrl;
    window.currentHlsUrl = url;
    let targetUrl = url;
    const container = document.querySelector('.player-container');

    // 🛡️ [MANDATORY PROXY] Force all external URLs through local proxy
    const isHls = targetUrl.includes('.m3u8') || targetUrl.includes('master.') || targetUrl.includes('index-f') || targetUrl.includes('teenxy.com/get_file/') || targetUrl.includes('media=hls');
    const isLocal = targetUrl.includes(CONFIG.SERVER_IP) || targetUrl.includes('localhost') || targetUrl.includes('/api/');

    if (!isLocal && targetUrl.startsWith('http')) {
        const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
        const serverBase = CONFIG.SERVER_URL;
        targetUrl = `${serverBase}${proxyPath}?url=${encodeURIComponent(targetUrl)}`;
        console.log(`🛡️ [Mandatory Proxy] Applied for all sources: ${targetUrl.substring(0, 80)}...`);
    }

    // 🛡️ [USER REQUEST: ULTIMATE FORCE] Override targetUrl with exact proxy URL and headers for Hanime
    if (item?._source?.id === 'hanime' || targetUrl.includes('hanime') || targetUrl.includes('highwinds-cdn')) {
        // Extract the raw URL first if it was already wrapped
        let rawUrlForHanime = url;
        if (rawUrlForHanime.includes('/api/m3u8-proxy?url=')) {
            rawUrlForHanime = decodeURIComponent(rawUrlForHanime.split('url=')[1].split('&')[0]);
        }

        const proxyPath = rawUrlForHanime.includes('.m3u8') ? '/api/m3u8-proxy' : '/api/stream';
        const hanimeHeaders = {
            'Referer': 'https://hanime.tv/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        // Construct the EXACT string the user wants
        targetUrl = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(rawUrlForHanime)}&headers=${encodeURIComponent(JSON.stringify(hanimeHeaders))}`;
        console.log(`🎯 [HANIME FORCE] Player URL fully overridden: ${targetUrl.substring(0, 100)}...`);
    }

    // Final URL is already proxied via /api/ if it was external (see lines 4405-4410)
    console.log(`🎯 [Final URL] Ready for player: ${targetUrl.substring(0, 80)}...`);

    if (container) {
        if (art) {
            console.log(`🎬 [Native Player] Switching URL: ${targetUrl.substring(0, 80)}...`);
            
            // ?? USER REQUEST: Save current time before switching to resume from same spot
            const currentTime = art.currentTime;
            
            art.switchUrl(targetUrl).then(() => {
                if (currentTime > 0) {
                    console.log(`⏳ Resuming from ${currentTime.toFixed(2)}s after server switch`);
                    art.currentTime = currentTime;
                    art.play();
                }
            });

            const coverImage = (item && (item.background || item.poster)) || (window.currentWatchItem && (window.currentWatchItem.background || window.currentWatchItem.poster)) || '';
            if (coverImage) {
                art.poster = coverImage;
                // Also set the container background just to be safe
                container.style.backgroundImage = `url("${coverImage}")`;
                container.style.backgroundSize = 'cover';
                container.style.backgroundPosition = 'center center';
            }
        } else {
            container.innerHTML = '';
            console.log(`🎬 [Native Player] Initializing: ${targetUrl.substring(0, 80)}...`);
            initPlayer(targetUrl);
        }
    }

    // 🚀 NEW: Update Quality Menu from discovered streams
    updateArtPlayerQualityMenu();

    // Always render buttons for both native player and iframes
    let videoTitle = item ? decodeEntities(item.name || item.title) : 'Video';
    const streamButton = document.getElementById('btn-new-tab');
    const extSourceBtn = document.getElementById('btn-external-source');
    const dlButton = document.getElementById('btn-direct-download');

    if (streamButton) {
        streamButton.style.display = 'inline-flex';
        streamButton.onclick = (e) => {
            e.preventDefault();
            if (url.startsWith('iframe:')) {
                window.open(url.replace('iframe:', ''), '_blank');
            } else {
                showExternalPlayerOptions(targetUrl, videoTitle);
            }
        };
    }

    if (extSourceBtn && targetUrl) {
        // 🛡️ USER REQUEST: For Hanime, ensure we use the proxied version with headers
        if (item?._source?.id === 'hanime' || targetUrl.includes('hanime')) {
            let finalProxyUrl = targetUrl;
            // If not already proxied, wrap it now
            if (!finalProxyUrl.includes('/api/m3u8-proxy')) {
                const proxyPath = finalProxyUrl.includes('.m3u8') ? '/api/m3u8-proxy' : '/api/stream';
                const headers = {
                    'Referer': 'https://hanime.tv/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                };
                finalProxyUrl = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(finalProxyUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
            }
            extSourceBtn.href = finalProxyUrl;
            extSourceBtn.title = "Open Proxied Video Link";
            extSourceBtn.innerHTML = '<i class="fa-solid fa-up-right-from-square"></i> <span>Open Stream</span>';
        } else {
            extSourceBtn.href = targetUrl;
            extSourceBtn.title = "Visit Source Website";
            extSourceBtn.innerHTML = '<i class="fa-solid fa-up-right-from-square"></i> <span>Open Website</span>';
        }
        extSourceBtn.style.display = 'inline-flex';
    }

    if (dlButton && targetUrl) {
        dlButton.style.display = 'inline-flex';

        // Direct download for all devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const buttonText = isMobile ? 'Download to Phone' : 'Download Video';

        // Create or update download URL display box
        let urlDisplayBox = document.getElementById('download-url-display');
        if (!urlDisplayBox) {
            urlDisplayBox = document.createElement('div');
            urlDisplayBox.id = 'download-url-display';
            urlDisplayBox.style.cssText = `
                margin-top: 10px;
                padding: 10px 12px;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                font-size: 10px;
                color: #aaa;
                word-break: break-all;
                max-height: 200px;
                overflow-y: auto;
                font-family: monospace;
                line-height: 1.5;
            `;
            dlButton.parentNode.insertBefore(urlDisplayBox, dlButton.nextSibling);
        }

        // Show the URL that will be downloaded
        const isHlsDownload = targetUrl.includes('.m3u8') || targetUrl.includes('master.') || targetUrl.includes('index-f') || targetUrl.includes('media=hls') || targetUrl.includes('teenxy.com/get_file/');
        let displayUrl = targetUrl;
        let realUrl = targetUrl;

        // Extract real URL if it's wrapped in proxy
        if (targetUrl.includes('/api/m3u8-proxy?url=') || targetUrl.includes('/api/stream?url=') || targetUrl.includes(':4000/')) {
            try {
                const proxyParams = new URL(url).searchParams;
                const extracted = proxyParams.get('url');
                if (extracted) {
                    realUrl = decodeURIComponent(extracted);
                    console.log(`🔓 Extracted real URL from proxy: ${realUrl.substring(0, 80)}...`);
                }
            } catch (e) { }
        }

        if (isHls) {
            // Show server download URL with real URL (not proxy wrapped)
            const videoTitle = window.currentWatchItem?.name || 'video';
            let refererHint = '';
            if (realUrl.includes('pornhub') || realUrl.includes('phncdn')) {
                refererHint = '&referer=https://www.pornhub.com/';
            } else if (realUrl.includes('eporner')) {
                refererHint = '&referer=https://www.eporner.com/';
            } else if (realUrl.includes('xvideos') || realUrl.includes('xnxx')) {
                refererHint = realUrl.includes('xnxx') ? '&referer=https://www.xnxx.com/' : '&referer=https://www.xvideos.com/';
            } else if (realUrl.includes('xhamster') || realUrl.includes('xhcdn')) {
                refererHint = '&referer=https://xhamster.com/';
            } else if (realUrl.includes('3dporndude')) {
                refererHint = '&referer=https://3dporndude.com/';
            } else if (realUrl.includes('porcore')) {
                refererHint = '&referer=https://porcore.com/';
            }
            displayUrl = `${window.location.origin}/api/download/direct?url=${encodeURIComponent(realUrl)}&title=${encodeURIComponent(videoTitle)}${refererHint}`;
        }

        // Show full URL with larger display area
        urlDisplayBox.style.maxHeight = '200px';
        urlDisplayBox.style.fontSize = '10px';

        urlDisplayBox.innerHTML = `
            <div style="color: #888; margin-bottom: 4px; font-size: 10px;">📥 Download URL (click to copy):</div>
            <div style="color: #4fc3f7; cursor: pointer; line-height: 1.4;" 
                 onclick="navigator.clipboard.writeText(this.textContent); this.style.color='#81c784'; this.innerHTML='✅ Copied!'; setTimeout(()=>{this.style.color='#4fc3f7'; this.textContent='${displayUrl.replace(/'/g, "\\'")}';},1500);" 
                 title="Click to copy">
                ${displayUrl}
            </div>
        `;
        urlDisplayBox.style.display = 'block';

        dlButton.innerHTML = `<i class="fa-solid fa-download"></i> ${buttonText}`;
        dlButton.onclick = async (e) => {
            e.preventDefault();

            if (dlButton.disabled) return;

            const videoTitle = (window.currentWatchItem ? (window.currentWatchItem.name || window.currentWatchItem.title) : 'video') || 'video';
            const cleanName = videoTitle.replace(/[\\/:*?"<>|]/g, '_');
            const downloadUrl = `/api/download/direct?url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent(cleanName)}`;

            // UI: Feedback that download is starting
            // dlButton.disabled = true; // REMOVED PER USER REQUEST
            const originalHTML = dlButton.innerHTML;
            // dlButton.innerHTML = `Starting Download...`; // REMOVED PER USER REQUEST

            try {
                // Trigger browser download
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${cleanName}.mp4`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                toast("⬇️ Download started in browser", "var(--primary)");

                setTimeout(() => {
                    dlButton.innerHTML = `<i class="fa-solid fa-check"></i> Started!`;
                    setTimeout(() => {
                        dlButton.disabled = false;
                        dlButton.innerHTML = originalHTML;
                    }, 3000);
                }, 1500);
            } catch (err) {
                console.error('Download trigger error:', err);
                toast("❌ Failed to trigger download", "#ff4444");
                // dlButton.disabled = false; // REMOVED PER USER REQUEST
                dlButton.innerHTML = originalHTML;
            }
        };

    } else if (dlButton) {
        dlButton.style.display = 'none';
        // Hide URL display box when no download available
        const urlDisplayBox = document.getElementById('download-url-display');
        if (urlDisplayBox) {
            urlDisplayBox.style.display = 'none';
        }
    }

    // --- Query Parameter URL Unwrapping ---
    if (url.includes('?url=http') || url.includes('&url=http')) {
        try {
            const potential = url.split('url=')[1].split('&')[0];
            const decoded = decodeURIComponent(potential);
            if (decoded.startsWith('http')) {
                console.log("🔓 Unwrapped Query URL:", decoded);
                url = decoded;
            }
        } catch (e) { }
    }

    if (url.startsWith('iframe:')) {
        const iframeUrl = url.replace('iframe:', '');
        if (container) {
            art.destroy();
            art = null;
            container.innerHTML = `<iframe src="${iframeUrl}" width="100%" height="100%" frameborder="0" scrolling="no" allowfullscreen style="background: #000; position:absolute; top:0; left:0; width:100%; height:100%; border-radius:12px;"></iframe>`;
        }
        return;
    }

    // 🛡️ [AV1 Auto-Fix] Clean URL for compatibility
    if (targetUrl.toLowerCase().includes('-av1') || targetUrl.toLowerCase().includes('_av1')) {
        targetUrl = targetUrl.replace(/-av1/gi, '').replace(/_av1/gi, '');
    }

    // 🎬 [ArtPlayer] Final target URL for direct playback
    window.currentHlsUrl = targetUrl;
    console.log(`🎬 [ArtPlayer] Playing URL: ${targetUrl.substring(0, 120)}...`);

    // --- Quality Menu Support ---
    if (art && art.setting) {
        if (window._availableQualities && window._availableQualities.length > 0) {
            console.log(`📊 Updating Player Qualities:`, window._availableQualities);
            const qualityItems = window._availableQualities.map(qObj => {
                const label = typeof qObj === 'string' ? qObj : qObj.q;
                const qUrl = typeof qObj === 'string' ? null : qObj.url;
                return {
                    html: label,
                    url: qUrl || targetUrl,
                    level: parseInt(label) || 0,
                    default: label.includes('1080') || label.includes('720')
                };
            });

            // For MP4 (non-HLS) streams with multiple qualities
            if (!isHls) {
                art.setting.update('quality', {
                    selector: qualityItems,
                    onSelect: function (item) {
                        const currentTime = art.currentTime;
                        art.switchUrl(item.url).then(() => {
                            if (currentTime > 0) {
                                art.currentTime = currentTime;
                                art.play();
                            }
                        });
                        return item.html;
                    }
                });
            }
        } else {
            // Reset to Auto if no qualities detected (HLS will repopulate via its own listener)
            art.setting.update('quality', {
                selector: [{ default: true, html: 'Auto', level: -1 }]
            });
        }
    }

    // Only switch if the player already existed and didn't need a hard reset
    const switchOptions = {
        url: targetUrl,
        type: isHls ? 'm3u8' : (targetUrl.includes('.mp4') ? 'mp4' : 'auto')
    };

    if (art.url !== targetUrl) {
        art.switchUrl(switchOptions).then(() => {
            if (item) {
                const p = getProxiedUrl(item.poster || item.thumbnail);
                if (p) art.poster = p;
                // Restore saved progress
                const savedTime = restoreVideoProgress(item);
                if (savedTime > 0) {
                    setTimeout(() => {
                        art.seek = savedTime;
                        art.play();
                        // Show continue watching toast
                        const progress = (savedTime / item.duration * 100).toFixed(0);
                        console.log(`▶️ Resumed from ${formatDuration(savedTime)} (${progress}%)`);
                    }, 500);
                }
            }
        }).catch(e => {
            console.warn("ArtPlayer switch failed, trying relay...", e);
            // 🛡️ Prevent double-proxying: Only fallback to relay if the URL isn't already proxied
            if (!useProxy && !window.currentHlsUrl.includes(':4000/')) {
                const relayUrl = `/api/stream?url=${encodeURIComponent(window.currentHlsUrl)}`;
                console.log(`🔄 Fallback to relay: ${relayUrl.substring(0, 80)}...`);
                art.switchUrl(relayUrl);
            }
        });
    }

    art.on('video:error', () => {
        const currentUrl = art.url || window.currentHlsUrl;
        console.error("❌ [Artplayer Error] Failed to load video:", currentUrl);

        const isInternalApi = currentUrl.includes('/api/stream') || currentUrl.includes('/api/eporner/') || currentUrl.includes('/api/m3u8-proxy');
        if (!useProxy && !currentUrl.includes(':4000/') && !isInternalApi) {
            console.log("🔄 Artplayer error, switching to relay...");
            const relayUrl = `/api/stream?url=${encodeURIComponent(currentUrl)}`;
            art.switchUrl(relayUrl);
        }
    });
}


function closePlayer() {
    const overlay = document.getElementById('player-overlay');
    if (art) {
        art.pause();
        art.destroy();
        art = null;
    }

    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Auto-play functions removed

// ═══════════════════════════════════════════════════════════════
// UI & RECOMMENDATION LOGIC
// ═══════════════════════════════════════════════════════════════

function renderSimilarContent(item) {
    const container = document.getElementById('similar-grid');
    if (!container) return;

    container.innerHTML = '';

    // Toggle vertical grid for anime (Hanime) content
    const isVerticalList = item._source && item._source.id === 'hanime';
    if (isVerticalList) container.classList.add('vertical-grid');
    else container.classList.remove('vertical-grid');

    // 1. Check for explicit related videos in meta
    let relatedItems = [];
    const limit = isVerticalList ? 16 : 15;

    if (item.relatedMetas && item.relatedMetas.length > 0) {
        relatedItems = item.relatedMetas;
    } else if (item.related && item.related.length > 0) {
        relatedItems = item.related;
    } else if (item._source && allItems.length > 0) {
        // Fallback: Pick items from the same source or items with similar tags
        const currentTags = item._tags || [];
        const sameSourceItems = allItems.filter(i => i.id !== item.id && (
            (i._source && i._source.id === item._source.id) ||
            (i._tags && i._tags.some(t => currentTags.includes(t)))
        ));

        // Shuffle
        relatedItems = sameSourceItems.sort(() => 0.5 - Math.random());
    }

    // Apply the dynamic limit
    relatedItems = relatedItems.slice(0, limit);

    if (relatedItems.length === 0) {
        container.innerHTML = '<p style="color:#666; font-size:0.9rem; grid-column: 1/-1; text-align: center; padding: 2rem;">No similar content found.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    relatedItems.forEach(rel => {
        const relItem = normalizeItem(rel, item._source);
        const card = document.createElement('div');
        const isSelected = selectedItems.some(i => i.id === relItem.id);
        const isVertical = relItem._source && relItem._source.id === 'hanime';

        card.className = `card ${isSelected ? 'selected' : ''} ${isVertical ? 'card-vertical' : ''}`;
        card.dataset.id = relItem.id;
        card.dataset.sourceId = relItem._source.id;

        card.onclick = () => {
            localStorage.setItem(CONFIG.STORAGE.ACTIVE_ITEM, JSON.stringify(relItem));
            // If we are on real.html, just open the player overlay
            if (document.body.dataset.page === 'real') {
                openPlayer(relItem);
            } else {
                window.location.href = `watch.html?id=${relItem.id}&source=${relItem._source.id}`;
            }
        };

        // Reuse the preview manager if available
        if (typeof VideoPreviewManager !== 'undefined') {
            card.onmouseenter = () => VideoPreviewManager.start(card);
            card.onmouseleave = () => VideoPreviewManager.stop(card);
        }

        const rawName = relItem.name || relItem.title || 'Untitled Video';
        const cleanName = rawName.replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
        let poster = relItem.poster || relItem.thumbnail || relItem.background;
        const sId = relItem._source ? (relItem._source.id || relItem._source) : '';

        if (!poster && (sId === 'pornhub' || sId === 'eporner' || sId === 'xnxx')) {
            poster = `minimal_recovery_trigger_${relItem.id}`;
        }

        if (!poster) poster = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const logo = SOURCE_LOGOS[relItem._source.id] || SOURCE_LOGOS.default;
        const isFav = isFavorite(relItem);
        const previewUrl = relItem.preview || relItem.previewUrl || "";

        card.innerHTML = `
            <div class="card-image-wrap">
                <img src="${getProxiedUrl(poster)}" class="card-poster" loading="lazy" alt="${cleanName}" onerror="handleImageError(this, '${relItem.id}', '${relItem._source.id}', '${relItem.type || 'movie'}')">
                ${(!isVertical) ? `<video class="preview-player" data-src="${previewUrl ? getProxiedUrl(previewUrl) : 'undefined'}" loop muted playsinline></video>` : ''}
                <div class="preview-loader"><div class="spinner-small"></div></div>
                <div class="card-overlay"></div>
                <div class="favorite-card-btn ${isFav ? 'active' : ''}" 
                     onclick="event.stopPropagation(); window.lastFavoriteItem = ${JSON.stringify(relItem).replace(/"/g, '&quot;')}; toggleFavorite(event, window.lastFavoriteItem)">
                    <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
                </div>
                ${relItem.duration ? `<div class="duration-badge">${formatDuration(relItem.duration)}</div>` : ''}
            </div>
            <div class="card-info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <h3 class="card-title">${cleanName}</h3>
                </div>
                <div class="card-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; font-size: 0.8rem; color: #888;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span class="card-source" style="color:var(--primary); font-weight:bold;">${relItem._source.name}</span>
                    </div>
                    <span class="card-views">${relItem._rating || 85}% <i class="fa-solid fa-thumbs-up"></i></span>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });
    container.appendChild(fragment);

    // Apply reveal observer if available
    if (revealObserver) {
        const newCards = container.querySelectorAll('.card:not(.revealed)');
        newCards.forEach(card => revealObserver.observe(card));
    }
}

// --- Search with Keyword Aliasing ---
function sanitizeSearchQuery(query) {
    let sanitized = query.toLowerCase();

    // Replace sensitive keywords with aliases
    Object.keys(KEYWORD_ALIASES).forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        sanitized = sanitized.replace(regex, KEYWORD_ALIASES[keyword]);
    });

    return sanitized;
}

function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    const form = input.closest('form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        const query = input.value.trim();
        if (query.length < 1) {
            e.preventDefault();
            return;
        }

        // 🚀 SMART FEATURE: Direct URL Playback
        if (query.startsWith('http')) {
            e.preventDefault();
            console.log("🚀 Direct URL detected! Opening player...");

            const isPH = query.includes('phncdn') || query.includes('pornhub');
            const fileName = query.split('/').pop().split('?')[0];

            // Create a virtual item for the URL
            const virtualItem = {
                id: 'direct_' + Date.now(),
                name: (isPH ? "PornHub Link: " : "Direct Playback: ") + (fileName.length > 5 ? fileName : "External Stream"),
                url: query,
                _source: { id: isPH ? 'pornhub' : 'direct', name: isPH ? 'PornHub' : 'Direct Link', baseUrl: '' },
                poster: isPH ? 'https://www.google.com/s2/favicons?domain=pornhub.com&sz=128' : 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop'
            };

            // Smart Title Recovery for PH Proxied Links
            if (isPH && query.includes('master.m3u8')) {
                try {
                    const decoded = decodeURIComponent(query);
                    const slugMatch = decoded.match(/\/videos\/.*\/([^\/]+)\/master\.m3u8/);
                    if (slugMatch) virtualItem.name = "PH Stream: " + slugMatch[1].replace(/_/g, ' ');
                } catch (e) { }
            }

            // If we are on watch.html, just open it. If not, redirect with a special param?
            // Actually simplest is to open player if the function exists
            if (typeof openPlayer === 'function') {
                openPlayer(virtualItem);

                // Immediately force play the URL
                setTimeout(() => {
                    if (typeof playUrl === 'function') {
                        playUrl(query, virtualItem);
                    }
                }, 500);
            } else {
                window.location.href = `index.html?directUrl=${encodeURIComponent(query)}`;
            }
        } else {
            // Standard Search
            e.preventDefault(); // Prevent native form submission which loses query parameters
            const typeValue = document.getElementById('searchType')?.value || 'all';
            const sourceParam = currentSourceFilter === 'all' ? '' : `&source=${currentSourceFilter}`;
            const typeParam = typeValue === 'all' ? '' : `&type=${typeValue}`;

            if (CURRENT_PAGE === 'search') {
                const newUrl = `search.html?q=${encodeURIComponent(query)}${typeParam}${sourceParam}`;
                window.history.pushState({}, '', newUrl);
                handleSearchPage(query, typeValue, currentSourceFilter);
            } else {
                window.location.href = `search.html?q=${encodeURIComponent(query)}${typeParam}${sourceParam}`;
            }
        }
    });

    // URL-based UI adjustment for Anime/Hentai source filtering
    const updateSourceBarVisibility = () => {
        const sourceBar = document.getElementById('source-bar');
        if (!sourceBar) return;
        const urlParams = new URLSearchParams(window.location.search);
        const type = urlParams.get('type') || document.getElementById('searchType')?.value || 'all';
        sourceBar.style.display = (type === 'anime') ? 'none' : 'flex';
    };

    // Listen to history changes (Back/Forward)
    window.addEventListener('popstate', updateSourceBarVisibility);

    // Check on initial load
    updateSourceBarVisibility();
}



function updateGenre(el, genre) {
    document.querySelectorAll('.genre-pill').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    filterByGenre(genre);
}

function filterByGenre(genre) {
    currentGenre = genre;
    pageBySource = {};
    allItems = [];
    renderGrid();
    loadInitialContent();
}

async function filterBySource(sourceId) {
    if (currentSourceFilter === sourceId) return;

    // Update URL instantly without reloading the page
    if (CURRENT_PAGE !== 'favorites') {
        const url = new URL(window.location);
        if (sourceId === 'all') {
            url.searchParams.delete('source');
        } else {
            url.searchParams.set('source', sourceId);
        }
        window.history.pushState({}, '', url);
    }

    currentSourceFilter = sourceId;
    pageBySource = {}; // Reset pages for infinite scroll tracking

    if (CURRENT_PAGE === 'search') {
        const query = document.getElementById('searchInput')?.value || new URLSearchParams(window.location.search).get('q');
        const typeValue = document.getElementById('searchType')?.value || 'all';
        handleSearchPage(query, typeValue, sourceId);
        return;
    }

    if (CURRENT_PAGE === 'favorites') {
        window.location.href = 'index.html';
        return;
    }

    document.querySelectorAll('.source-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.source === sourceId);
    });

    updateGenreBar(sourceId);

    // Filter existing items to see if we already have items from this source
    let existingItemsForSource = [];
    if (sourceId === 'all') {
        existingItemsForSource = allItems;
    } else {
        existingItemsForSource = allItems.filter(item => item._source && item._source.id === sourceId);
    }

    if (existingItemsForSource.length < 24 || sourceId === 'all') {
        allItems = [];
        const grid = document.getElementById('mainGrid') || document.getElementById('realGrid') || document.getElementById('animeGrid');
        if (grid) grid.innerHTML = '';
        loadInitialContent();
    } else {
        const grid = document.getElementById('mainGrid') || document.getElementById('realGrid') || document.getElementById('animeGrid');
        if (grid) grid.innerHTML = '';
        renderGrid();

        const sentinel = document.getElementById('sentinel');
        if (sentinel && window.setupInfiniteScrollObserver) {
            window.setupInfiniteScrollObserver.unobserve(sentinel);
            setTimeout(() => window.setupInfiniteScrollObserver.observe(sentinel), 100);
        }
    }
}

function updateGenreBar(sourceId) {
    const genreBar = document.getElementById('genre-bar');
    if (!genreBar) return;
    genreBar.innerHTML = `<button class="genre-pill ${currentGenre === 'all' ? 'active' : ''}" onclick="updateGenre(this, 'all')">All Genres</button>`;
    let genres = [];
    if (sourceId === 'all') {
        const allGenres = SOURCES.flatMap(s => s.genres || []);
        genres = [...new Set(allGenres)];
    } else {
        const source = SOURCES.find(s => s.id === sourceId);
        if (source && source.genres) genres = source.genres;
    }
    genres.forEach(genre => {
        const btn = document.createElement('button');
        btn.className = `genre-pill ${currentGenre === genre ? 'active' : ''}`;
        btn.textContent = genre;
        btn.onclick = () => updateGenre(btn, genre);
        genreBar.appendChild(btn);
    });
}

function setupInfiniteScroll() {
    const sentinel = document.getElementById('sentinel');
    if (!sentinel) return;

    // Add a loading spinner if it doesn't exist
    if (!sentinel.innerHTML) {
        sentinel.innerHTML = `<div class="loader-spinner" style="display: none; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
    }

    if (window.setupInfiniteScrollObserver) window.setupInfiniteScrollObserver.disconnect();

    const observer = new IntersectionObserver((entries) => {
        window.setupInfiniteScrollObserver = observer;
        if (entries[0].isIntersecting) {
            if (window.isFetchingMore) return;

            // Show the spinner
            const spinner = sentinel.querySelector('.loader-spinner');
            if (spinner) spinner.style.display = 'block';

            if (typeof window.loadMoreContent === 'function') {
                window.loadMoreContent();
                observer.unobserve(sentinel);
                setTimeout(() => {
                    const fresh = document.getElementById('sentinel');
                    if (fresh) {
                        // Hide spinner after a short delay or once content is loaded
                        if (spinner) spinner.style.display = 'none';
                        observer.observe(fresh);
                    }
                }, 1500);
            }
        }
    }, { rootMargin: '250px' });
    observer.observe(sentinel);
}


async function checkAndFetchMoreData() {
    if (window.isFetchingMore) return;
    window.isFetchingMore = true;
    let searchQuery = null;
    if (CURRENT_PAGE === 'search') searchQuery = new URLSearchParams(window.location.search).get('q');
    let sourcesToFetch = [];
    if (currentSourceFilter === 'all') {
        if (searchQuery) {
            sourcesToFetch = SOURCES;
        } else if (CURRENT_PAGE === 'favorites') {
            sourcesToFetch = [];
        } else {
            // Include all sources that match the current page type (Real, Anime, etc.)
            // This now automatically includes new sources like Teenxy
            sourcesToFetch = SOURCES.filter(s => {
                if (CURRENT_PAGE === 'home') return s.type === 'real' || s.type === 'anime';
                return s.type === CURRENT_PAGE;
            });
        }
    } else {
        sourcesToFetch = SOURCES.filter(s => s.id === currentSourceFilter);
    }

    if (sourcesToFetch.length === 0) { window.isFetchingMore = false; return; }
    let fetchedAny = false;
    const fetchPromises = [];
    const sentinel = document.getElementById('sentinel');
    if (sentinel) {
        let loadingIcon = document.createElement('div');
        loadingIcon.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; color:var(--primary); margin: 30px 0;"><div class="spinner-small"></div></div>';
        sentinel.innerHTML = '';
        sentinel.appendChild(loadingIcon);
    }
    if (searchQuery) {
        const resolvedType = document.getElementById('searchType')?.value || 'all';
        let currentPageOffset = (sourcePages[currentSourceFilter] || 0);
        const skipCount = currentPageOffset * 30;
        const serverUrl = `/api/search?q=${encodeURIComponent(searchQuery)}&type=${resolvedType}&skip=${skipCount}&source=${currentSourceFilter}`;
        fetchPromises.push(fetchJsonWithRetry(serverUrl, 0).then(data => {
            if (data && data.results && data.results.length > 0) {
                const items = data.results.map(item => { const normalized = normalizeItem(item, item._source); normalized.extraSources = item.extraSources || []; return normalized; });
                const unique = items.filter(m => !allItems.some(existing => existing.id === m.id));
                if (unique.length > 0) { allItems = [...allItems, ...unique]; fetchedAny = true; }
            }
        }).catch(e => console.error("Search fetch failed", e)));
    } else {
        for (const src of sourcesToFetch) {
            const cleanBase = getCleanBase(src.baseUrl);
            const catalogId = src.priority[0];
            const sourceId = src.id;

            if (!pageBySource[sourceId]) pageBySource[sourceId] = 1; else pageBySource[sourceId]++;
            const currentSourcePage = pageBySource[sourceId];

            // Determine content types based on source type (anime vs real)
            const types = src.type === 'anime' ? ['anime', 'series', 'movie'] : ['movie'];

            // Use a larger skip multiplier to ensure we actually hit the next page on the server
            // Hanime uses 48 per page, others vary. 48 is a safe bet for a "step".
            let skipMultiplier = (src.id === 'hanime') ? 48 : 24;

            for (const type of types) {
                const skip = currentSourcePage * skipMultiplier;
                let url = `${cleanBase}/catalog/${type}/${encodeURIComponent(catalogId)}/skip=${skip}.json?_cb=${Date.now()}`;
                if (currentGenre && currentGenre !== 'all') url = `${cleanBase}/catalog/${type}/${encodeURIComponent(catalogId)}/genre=${encodeURIComponent(currentGenre)}/skip=${skip}.json?_cb=${Date.now()}`;

                fetchPromises.push(fetchJsonWithRetry(url, 0).then(data => {
                    if (data && data.metas && data.metas.length > 0) {
                        let items = data.metas.map(m => normalizeItem(m, src));
                        const unique = items.filter(m => !allItems.some(existing => existing.id === m.id));
                        if (unique.length > 0) { allItems = [...allItems, ...unique]; fetchedAny = true; }
                    }
                }).catch(e => { console.warn('Fetch error:', e); }));
            }
        }

    }
    try { await Promise.allSettled(fetchPromises); } catch (e) { }
    window.isFetchingMore = false;
    if (sentinel) {
        sentinel.innerHTML = '';
        if (!fetchedAny && fetchPromises.length > 0) {
            sentinel.innerHTML = `
                <div style="color: #666; font-size:1rem; margin: 20px 0; display:flex; align-items:center; gap:10px;">
                    No more items found.
                    <button onclick="window.loadMoreContent()" style="background:var(--primary); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1) rotate(45deg)'" onmouseout="this.style.transform='scale(1) rotate(0deg)'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    </button>
                </div>`;
            // Keep it visible for 8 seconds instead of 3
            setTimeout(() => { if (sentinel.innerHTML.includes("No more")) sentinel.innerHTML = ''; }, 8000);
        }
    }
}

function showExternalPlayerOptions(videoUrl, title) {
    // 🧠 Recursive unwrapping to find the absolute raw URL
    let rawVideoUrl = videoUrl;
    try {
        let current = videoUrl;
        let lastExtracted = null;

        while (current.includes('?url=') || current.includes('&url=')) {
            const searchPart = current.includes('?') ? current.split('?')[1] : current;
            const params = new URLSearchParams(searchPart);
            const extracted = params.get('url');

            if (extracted && extracted !== current) {
                current = decodeURIComponent(extracted);
                lastExtracted = current;
            } else {
                break; // No more url params found
            }
        }

        if (lastExtracted) rawVideoUrl = lastExtracted;
    } catch (e) { console.warn("Failed to extract raw URL:", e); }

    const oldModal = document.querySelector('.ext-modal-overlay');
    if (oldModal) oldModal.remove();
    const modal = document.createElement('div');
    modal.className = 'ext-modal-overlay';
    modal.style.display = 'flex';
    const players = [
        { name: 'VLC Player', icon: 'https://cdn.pixabay.com/photo/2016/04/01/10/47/vlc-1299991_1280.png', url: `vlc://${videoUrl}` },
        { name: 'MX Player (Android)', icon: 'https://vlc-player.en.softonic.com/android/images/icon_mx_player.png', url: `intent:${videoUrl}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(title)};end` },
        { name: 'PotPlayer (Windows)', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/PotPlayer_Icon.png/600px-PotPlayer_Icon.png', url: `potplayer://${videoUrl}` },
        { name: 'Open in Browser Tab', icon: 'https://cdn-icons-png.flaticon.com/512/1055/1055670.png', url: rawVideoUrl, blank: true }
    ];
    modal.innerHTML = `
        <div class="ext-modal-content">
            <div class="ext-modal-title">Select External Player 🎬</div>
            <div class="ext-option-list">
                <a href="${window.location.protocol}//${window.location.hostname}:4000/play?url=${encodeURIComponent(videoUrl)}" target="_blank" class="ext-option" style="border: 1px solid var(--accent); background: rgba(0, 229, 255, 0.05);">
                    <img src="https://cdn-icons-png.flaticon.com/512/716/716429.png" alt="Server Player">
                    <div class="ext-option-name" style="color: var(--accent); font-weight: bold;">X-Stream Server Player</div>
                </a>
                ${players.map(p => `<a href="${p.url}" ${p.blank ? 'target="_blank"' : ''} class="ext-option"><img src="${p.icon}" alt="${p.name}"><div class="ext-option-name">${p.name}</div></a>`).join('')}
            </div>
            <button class="ext-close">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('.ext-close');
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function initParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    function resize() { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();
    const particles = [];
    for (let i = 0; i < 80; i++) {
        particles.push({
            x: Math.random() * width, y: Math.random() * height,
            radius: Math.random() * 2 + 0.5, color: '#ffffff',
            vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 1.5 + 0.5
        });
    }
    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.y -= p.vy; p.x += p.vx;
            if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width; }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color; ctx.globalAlpha = 0.6; ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    animate();
}
function initCustomDropdown() {
    const originalSelect = document.getElementById('searchType');
    if (!originalSelect) return;

    // Check if already initialized
    if (originalSelect.classList.contains('custom-hidden')) return;

    // Create container
    const container = document.createElement('div');
    container.className = 'custom-select-container';
    originalSelect.parentNode.insertBefore(container, originalSelect);

    // Create Trigger
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const initialText = originalSelect.options[originalSelect.selectedIndex].text;
    trigger.innerHTML = `<span>${initialText}</span> <i class="fa-solid fa-chevron-down"></i>`;
    container.appendChild(trigger);

    // Create Options List
    const optionsList = document.createElement('div');
    optionsList.className = 'custom-select-options';

    Array.from(originalSelect.options).forEach(opt => {
        const option = document.createElement('div');
        option.className = 'custom-select-option';
        const icon = opt.value === 'anime' ? '<i class="fa-solid fa-tv"></i>' : '<i class="fa-solid fa-clapperboard"></i>';
        option.innerHTML = `${icon} <span>${opt.text}</span>`;
        option.dataset.value = opt.value;

        if (opt.selected) option.classList.add('selected');

        option.onclick = (e) => {
            e.stopPropagation();
            originalSelect.value = opt.value;
            trigger.querySelector('span').textContent = opt.text;
            optionsList.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            optionsList.classList.remove('open');
            trigger.classList.remove('active');

            // Trigger standard events
            originalSelect.dispatchEvent(new Event('change'));

            // Update visibility of source bars if applicable
            if (typeof updateSourceBarVisibility === 'function') updateSourceBarVisibility();
        };
        optionsList.appendChild(option);
    });

    container.appendChild(optionsList);

    // Toggle logic
    trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = optionsList.classList.contains('open');
        // Close all other instances if any
        document.querySelectorAll('.custom-select-options').forEach(el => el.classList.remove('open'));
        document.querySelectorAll('.custom-select-trigger').forEach(el => el.classList.remove('active'));

        if (!isOpen) {
            optionsList.classList.add('open');
            trigger.classList.add('active');
        }
    };

    // Close on outside click
    document.addEventListener('click', () => {
        optionsList.classList.remove('open');
        trigger.classList.remove('active');
    });

    // Sync with original select if it changes externally
    originalSelect.addEventListener('change', () => {
        const text = originalSelect.options[originalSelect.selectedIndex].text;
        trigger.querySelector('span').textContent = text;
        optionsList.querySelectorAll('.custom-select-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.value === originalSelect.value);
        });
    });

    originalSelect.classList.add('custom-hidden');
}

function initSearchClear() {
    const input = document.getElementById('searchInput');
    if (!input) {
        // Retry shortly if not found immediately (useful for dynamic headers)
        setTimeout(initSearchClear, 200);
        return;
    }

    if (document.getElementById('clearSearch')) return;

    const clearBtn = document.createElement('i');
    clearBtn.className = 'fa-solid fa-xmark clear-search';
    clearBtn.id = 'clearSearch';
    clearBtn.style.zIndex = "10";

    input.parentNode.insertBefore(clearBtn, input.nextSibling);

    const toggleClear = () => {
        clearBtn.style.display = input.value.length > 0 ? 'block' : 'none';
    };

    input.addEventListener('input', toggleClear);
    input.addEventListener('change', toggleClear);

    clearBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        input.dispatchEvent(new Event('input')); // Trigger toggleClear
        input.focus();
        const suggestions = document.getElementById('search-suggestions');
        if (suggestions) suggestions.style.display = 'none';
    };

    toggleClear();
}

// Safer initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initCustomDropdown();
        initSearchClear();
    });
} else {
    initCustomDropdown();
    initSearchClear();
}

window.addEventListener('load', () => {
    initParticles();
    initCustomDropdown();
    initSearchClear();
    if (CURRENT_PAGE === 'favorites') {
        injectBulkUI();
    }
});

function injectBulkUI() {
    const navRight = document.querySelector('.nav-right');
    if (navRight && !document.getElementById('btn-bulk')) {
        const bulkBtn = document.createElement('button');
        bulkBtn.id = 'btn-bulk';
        bulkBtn.className = 'btn-secondary';
        bulkBtn.style = 'margin-right: 10px; padding: 10px 24px; border-radius: 50px; background: rgba(255,153,0,0.1); color: var(--primary); cursor: pointer; border: 1px solid rgba(255,153,0,0.3); font-weight: 800; transition: all 0.3s;';
        bulkBtn.innerHTML = '<i class="fa-solid fa-list-check"></i> Bulk Select';
        bulkBtn.onclick = toggleBulkMode;
        navRight.insertBefore(bulkBtn, navRight.firstChild);
    }

    if (!document.getElementById('bulk-bar')) {
        const bar = document.createElement('div');
        bar.id = 'bulk-bar';
        bar.className = 'bulk-control-bar';
        bar.innerHTML = `
            <div class="bulk-info-side">
                <div class="bulk-title-chip">Favorites Manager</div>
                <div class="bulk-count-box">Selected: <span id="selected-count">0</span></div>
            </div>
            <div class="bulk-actions-side">
                <button id="btn-select-all" class="bulk-btn-premium" onclick="selectAllItems()"><i class="fa-solid fa-check-double"></i> Select All</button>
                <button id="btn-download-selected" class="bulk-btn-premium download" onclick="downloadSelectedPython()" disabled><i class="fa-solid fa-download"></i> Download</button>
                <button class="bulk-btn-premium exit" onclick="toggleBulkMode()"><i class="fa-solid fa-xmark"></i> Exit</button>
            </div>
        `;
        document.body.appendChild(bar);

        // Add slideDown animation if not exists
        if (!document.getElementById('bulk-anim')) {
            const style = document.createElement('style');
            style.id = 'bulk-anim';
            style.textContent = '@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }';
            document.head.appendChild(style);
        }
    }
}






function initDownloadManager() {
    const btn = document.getElementById('download-manager-btn');
    const panel = document.getElementById('download-panel');
    const closeBtn = document.getElementById('close-dl-panel');
    const clearBtn = document.getElementById('clear-dl-history');

    if (btn && panel) {
        btn.onclick = () => {
            panel.classList.toggle('active');
            if (panel.classList.contains('active')) fetchDownloads();
        };

        if (closeBtn) {
            closeBtn.onclick = () => panel.classList.remove('active');
        }

        if (clearBtn) {
            clearBtn.onclick = async () => {
                try {
                    await fetch('/api/download/clear', { method: 'POST' });
                    fetchDownloads();
                } catch (e) { }
            };
        }

        // Auto-refresh when open
        setInterval(() => {
            if (panel.classList.contains('active')) fetchDownloads();
        }, 2000);
    }
}


async function fetchDownloads() {
    try {
        const res = await fetch('/api/download/status');
        const data = await res.json();
        const downloads = Array.isArray(data) ? data : [];

        window.currentActiveTaskIds = downloads.filter(d => d.status === 'downloading' || d.status === 'starting').map(d => d.id);

        renderDownloadList(downloads);
        if (typeof updateDownloadUIs === 'function') updateDownloadUIs(downloads);

        const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'starting').length;
        document.querySelectorAll('.dl-badge, #header-dl-badge, #dl-count').forEach(badge => {
            badge.innerText = activeCount;
            badge.style.display = activeCount > 0 ? 'inline-block' : 'none';
        });

        document.querySelectorAll('.header-dl-btn i, #header-download-trigger i').forEach(icon => {
            if (activeCount > 0) {
                icon.classList.add('fa-spin');
                icon.style.color = 'var(--primary)';
            } else {
                icon.classList.remove('fa-spin');
                icon.style.color = '';
            }
        });
    } catch (e) { }
}

function renderDownloadList(downloads) {
    const list = document.getElementById('dl-list');
    if (!list) return;

    if (downloads.length === 0) {
        list.innerHTML = `<div class="dl-empty">No active downloads</div>`;
        return;
    }

    const triggeredDownloads = window._triggeredDownloads || new Set();
    window._triggeredDownloads = triggeredDownloads;

    list.innerHTML = downloads.map(dl => {
        let statusColor = '#888';
        if (dl.status === 'completed') statusColor = '#00ff7f';
        if (dl.status === 'downloading') statusColor = 'var(--primary)';
        if (dl.status === 'error') statusColor = '#ff4444';

        const isActionable = dl.status === 'downloading' || dl.status === 'starting';
        const displayStatus = dl.status === 'starting' ? 'loading...' : dl.status;

        // Auto-trigger browser download if just completed
        if (dl.status === 'completed' && !triggeredDownloads.has(dl.id)) {
            triggeredDownloads.add(dl.id);
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = `/downloads/${encodeURIComponent(dl.file)}`;
                link.download = dl.file;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                console.log("🚀 Auto-downloading to browser:", dl.file);
            }, 500);
        }

        return `
            <div class="dl-item" style="border-left: 3px solid ${statusColor}; padding: 10px; margin-bottom: 8px; background: rgba(255,255,255,0.02); border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div style="font-weight: 700; font-size: 0.85rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;" title="${dl.title}">${dl.title}</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <div style="font-size: 0.65rem; font-weight: 900; color: ${statusColor}; text-transform: uppercase; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${displayStatus}</div>
                        ${isActionable ? `
                            <button onclick="cancelDownload('${dl.id}')" style="background: rgba(255,255,255,0.05); border: none; color: #ff4444; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Cancel & Delete">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                ${(dl.status === 'downloading' || dl.status === 'completed' || dl.status === 'starting') ? `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="dl-progress-bar" style="flex: 1; margin: 0; background: rgba(255,255,255,0.05); height: 8px; border-radius: 4px; overflow: hidden;">
                            <div class="dl-progress-fill" style="width: ${dl.progress}%; background: ${dl.status === 'completed' ? '#00ff7f' : 'var(--primary)'}; height: 100%; transition: width 0.3s ease;"></div>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 900; color: ${dl.status === 'completed' ? '#00ff7f' : 'var(--primary)'}; min-width: 40px; text-align: right;">${dl.progress}%</span>
                    </div>
                ` : ''}
                
                ${dl.error ? `<div style="font-size: 0.7rem; color: #ff4444; margin-top: 8px; padding: 5px; background: rgba(255,0,0,0.1); border-radius: 4px;">${dl.error}</div>` : ''}
                ${(dl.timeMark && dl.status !== 'completed') ? `<div style="font-size: 0.65rem; color: #888; margin-top: 6px; display: flex; align-items: center; gap: 4px;"><i class="fa-regular fa-clock"></i> Time: ${dl.timeMark}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.cancelDownload = async (id) => {
    try {
        await fetch('/api/download/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        const btn = document.getElementById('btn-direct-download');
        if (btn && window.currentWatchItem && window.currentWatchItem.id === id) {
            btn.classList.remove('dl-btn-progress');
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.innerHTML = `<i class="fa-solid fa-download"></i> Download Video`;
            if (window._watchBtnInterval) clearInterval(window._watchBtnInterval);
        }

        const overlay = document.getElementById(`progress-${id}`);
        if (overlay) {
            const st = overlay.querySelector('.status-text');
            if (st) { st.innerText = 'Cancelled & Deleted'; st.style.color = '#ff4444'; }
            setTimeout(() => overlay.classList.remove('active'), 2000);
        }

        toast("🛑 Download cancelled & file deleted", "#ff4444");
        fetchDownloads();
    } catch (e) { }
};

function updateSort(el, sortValue) {
    if (currentSort === sortValue) return;
    document.querySelectorAll('.sort-pill').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    currentSort = sortValue;
    const query = new URLSearchParams(window.location.search).get('q');
    if (query && CURRENT_PAGE === 'search') handleSearchPage(query);
}

function initAutocomplete() {
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('search-suggestions');
    if (!input || !suggestions) return;
    input.addEventListener('input', async () => {
        const q = input.value.trim();
        if (q.length < 2) { suggestions.style.display = 'none'; return; }
        try {
            const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
            const items = await res.json();
            if (items && items.length > 0) {
                suggestions.innerHTML = items.map(text => `<div class="suggestion-item" onclick="selectSuggestion('${text.replace(/'/g, "\\'")}')">${text}</div>`).join('');
                suggestions.style.display = 'block';
            } else suggestions.style.display = 'none';
        } catch (e) { }
    });
    document.addEventListener('click', (e) => { if (!input.contains(e.target)) suggestions.style.display = 'none'; });
}

function selectSuggestion(text) {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = text;
        const suggestions = document.getElementById('search-suggestions');
        if (suggestions) suggestions.style.display = 'none';
        input.closest('form').dispatchEvent(new Event('submit'));
    }
}

function copyCurrentUrl() {
    const input = document.getElementById('debug-stream-url');
    if (input && input.value !== 'No stream selected') { input.select(); document.execCommand('copy'); }
}

window.loadMoreContent = function () {
    const grid = document.getElementById('mainGrid') || document.getElementById('realGrid') || document.getElementById('animeGrid');
    const renderedCount = grid ? grid.children.length : 0;
    const filteredLength = allItems.filter(item => {
        if (currentSourceFilter !== 'all' && item._source.id !== currentSourceFilter) return false;
        if (CURRENT_PAGE === 'anime' && item._source.type !== 'anime' && currentSourceFilter === 'all') return false;
        if (CURRENT_PAGE === 'real' && item._source.type !== 'real' && currentSourceFilter === 'all') return false;
        return true;
    }).length;
    if (renderedCount >= filteredLength) {
        const step = 1;
        if (CURRENT_PAGE === 'search') {
            if (sourcePages[currentSourceFilter] === undefined) sourcePages[currentSourceFilter] = 0;
            sourcePages[currentSourceFilter] += step;
        }
        page += step;
        checkAndFetchMoreData().then(() => {
            renderGrid(true);
        }).catch(e => { window.isFetchingMore = false; });
    } else renderGrid(true);
};
async function copyStreamUrl(id, source) {
    try {
        const toast = (msg, color = 'var(--primary)') => {
            const existing = document.querySelector('.toast-notif');
            if (existing) existing.remove();
            const t = document.createElement('div');
            t.className = 'toast-notif';
            t.style = `position: fixed; top: 30px; left: 50%; transform: translateX(-50%); background: ${color}; color: white; padding: 12px 30px; border-radius: 12px; font-weight: 800; font-size: 0.95rem; z-index: 99999; box-shadow: 0 15px 40px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.2); animation: fadeInUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: flex; align-items: center; gap: 10px;`;
            t.innerHTML = msg.includes('⌛') ? `<div class="spinner-small" style="border-width:2px; width:16px; height:16px;"></div> ${msg}` : msg;
            document.body.appendChild(t);
            setTimeout(() => {
                t.style.animation = 'fadeOutDown 0.4s forwards';
                setTimeout(() => t.remove(), 400);
            }, 2500);
        };

        toast("⌛ Extracting Link...");
        const sourceInfo = SOURCES.find(s => s.id === source);
        const cleanBase = sourceInfo ? getCleanBase(sourceInfo.baseUrl) : `http://${window.location.hostname}:3000/${source}`;
        const resp = await fetch(`${cleanBase}/stream/movie/${encodeURIComponent(id)}.json`);
        const data = await resp.json();

        if (data.streams && data.streams.length > 0) {
            const stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4')) ||
                data.streams.find(s => s.title && s.title.toLowerCase().includes('mp4') && !s.url.includes('.m3u8')) ||
                data.streams.find(s => s.quality === '1080' || (s.title && s.title.includes('1080'))) ||
                data.streams.find(s => s.quality === '720' || (s.title && s.title.includes('720'))) ||
                data.streams[0];

            let finalLink = stream.url;
            const isHls = finalLink.includes('.m3u8') || (stream.title && stream.title.toLowerCase().includes('hls'));

            if (!finalLink.includes('/api/m3u8-proxy?url=') && !finalLink.includes('/api/stream?url=')) {
                const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
                finalLink = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(stream.url)}`;
            }

            if (finalLink.startsWith('/')) {
                finalLink = window.location.origin + finalLink;
            }

            await navigator.clipboard.writeText(finalLink);
            toast("<i class='fa-solid fa-check-double'></i> Link Copied Successfully!");
        } else {
            toast("<i class='fa-solid fa-circle-exclamation'></i> No link found", "#ff4444");
        }
    } catch (e) {
        console.error(e);
    }
}

function getSourceReferer(url) {
    if (!url) return '';
    const lowUrl = url.toLowerCase();
    if (lowUrl.includes('pornhub') || lowUrl.includes('phncdn')) return 'https://www.pornhub.com/';
    if (lowUrl.includes('eporner')) return 'https://www.eporner.com/';
    if (lowUrl.includes('xvideos') || lowUrl.includes('xv-cdn')) return 'https://www.xvideos.com/';
    if (lowUrl.includes('xnxx')) return 'https://www.xnxx.com/';
    if (lowUrl.includes('xhamster') || lowUrl.includes('xhcdn')) return 'https://xhamster.com/';
    if (lowUrl.includes('3dporndude')) return 'https://3dporndude.com/';
    if (lowUrl.includes('porcore')) return 'https://porcore.com/';
    if (lowUrl.includes('hanime')) return 'https://hanime.tv/';
    if (lowUrl.includes('spankbang')) return 'https://spankbang.com/';
    return '';
}

function getDownloadUrl(videoUrl, title) {
    if (videoUrl.includes('/api/download/direct')) return videoUrl;
    const cleanName = (title || 'video').replace(/[\\/:*?"<>|]/g, '_');

    let unwrappedUrl = videoUrl;
    if (videoUrl.includes('/api/m3u8-proxy?url=') || videoUrl.includes('/api/stream?url=')) {
        try {
            const urlObj = new URL(videoUrl.startsWith('http') ? videoUrl : window.location.origin + videoUrl);
            const rawUrl = urlObj.searchParams.get('url');
            if (rawUrl) unwrappedUrl = rawUrl;
        } catch (e) {
            if (videoUrl.includes('url=')) {
                unwrappedUrl = decodeURIComponent(videoUrl.split('url=')[1].split('&')[0]);
            }
        }
    }

    // Check if URL already has a referer in query params
    let referer = "";
    if (videoUrl.includes('referer=')) {
        referer = decodeURIComponent(videoUrl.split('referer=')[1].split('&')[0]);
    } else {
        referer = getSourceReferer(unwrappedUrl);
    }

    const refererParam = referer ? `&referer=${encodeURIComponent(referer)}` : '';

    // If it's already a proxied stream/m3u8 URL, we still need to wrap it for download/direct
    // BUT we should preserve the internal URL
    return `/api/download/direct?url=${encodeURIComponent(unwrappedUrl)}&title=${encodeURIComponent(cleanName)}${refererParam}`;
}

async function triggerServerDownload(url, title, btn = null) {
    if (!url) {
        toast("Invalid server URL", "red");
        return;
    }

    const originalContent = btn ? btn.innerHTML : null;

    if (btn) {
        // btn.disabled = true; // REMOVED PER USER REQUEST
    }

    try {
        const downloadUrl = getDownloadUrl(url, title);

        // Trigger browser download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        toast("⬇️ Download started from selected server", "var(--primary)");

        if (btn) {
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                }, 2000);
            }, 1000);
        }
    } catch (err) {
        console.error('Server download error:', err);
        toast("❌ Download failed", "red");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

function unwrapProxyUrl(url) {
    if (!url) return url;
    if (url.includes('/api/m3u8-proxy?url=')) {
        return decodeURIComponent(url.split('?url=')[1].split('&')[0]);
    }
    // We intentionally do NOT unwrap /api/stream?url= to ensure sources like Eporner pipe through the Node.js proxy successfully.
    return url;
}

async function downloadWatchItem() {
    if (!window.currentWatchItem) {
        toast("No video meta found", "red");
        return;
    }

    const btn = document.getElementById('btn-direct-download');

    // Prevent duplicate downloads - check if already downloading
    if (btn && (btn.disabled || btn.classList.contains('dl-btn-progress'))) {
        console.log('⚠️ Download already in progress, ignoring click');
        return;
    }

    const item = window.currentWatchItem;
    const cleanName = (item.name || item.title || '').replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();

    // Debug for XNXX
    const isXNXX = item._source?.id === 'xnxx';
    if (isXNXX) {
        console.log('🔍 [XNXX Download] Starting download for:', cleanName);
        console.log('🔍 [XNXX Download] Item ID:', item.id);
        window._lastDebugSource = 'xnxx';
    }

    // PHASE 1: Try to get best available URL
    let finalUrl = unwrapProxyUrl(window.currentHlsUrl || item.url);

    // If no direct URL available, try to fetch from stream endpoint
    if (!finalUrl || finalUrl === 'undefined') {
        // UI: Show fetching status
        if (btn) {
            btn.classList.add('dl-btn-progress');
            btn.innerHTML = `
                <div class="progress-fill" style="width: 30%"></div>
                <i class="fa-solid fa-magnifying-glass fa-spin"></i> <span>Finding stream link...</span>
                <div class="dl-cancel-btn" title="Cancel"><i class="fa-solid fa-xmark"></i></div>
            `;
            btn.onclick = (e) => {
                if (e.target.closest('.dl-cancel-btn')) {
                    btn.classList.remove('dl-btn-progress');
                    btn.innerHTML = `<i class="fa-solid fa-download"></i> Download Video`;
                    btn.onclick = downloadWatchItem;
                }
            };
        }

        try {
            const sourceId = item._source ? (item._source.id || item._source) : '';
            const sourceInfo = typeof SOURCES !== 'undefined' ? SOURCES.find(s => s.id === sourceId) : null;
            const cleanBase = sourceInfo ? getCleanBase(sourceInfo.baseUrl) : `http://${window.location.hostname}:3000/${sourceId}`;

            const resp = await fetch(`${cleanBase}/stream/movie/${encodeURIComponent(item.id)}.json`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.streams && data.streams.length > 0) {
                    // For XNXX source, specifically prioritize XNXX High MP4
                    let stream = null;

                    if (sourceId === 'xnxx') {
                        // First try: XNXX High MP4 specifically
                        stream = data.streams.find(s => s.title && s.title.includes('XNXX High MP4')) ||
                            data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4'));
                    } else {
                        // For other sources: general high mp4 search
                        stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4'));
                    }

                    // Fallback: any MP4 that isn't HLS
                    if (!stream) {
                        stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('mp4') && !s.url.includes('.m3u8'));
                    }

                    // Final fallback: first available stream
                    if (!stream) {
                        stream = data.streams[0];
                    }

                    if (stream && stream.url) {
                        let link = stream.url;
                        const isHls = link.includes('.m3u8');
                        if (!link.includes('/api/m3u8-proxy?url=') && !link.includes('/api/stream?url=')) {
                            const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
                            link = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(stream.url)}`;
                        }
                        finalUrl = link;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch stream link:", e);
        }
    }

    // Check if we got a valid URL
    if (!finalUrl || finalUrl === 'undefined') {
        if (btn) {
            btn.classList.remove('dl-btn-progress');
            btn.style.background = '#ff4444';
            btn.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Link not found`;
            setTimeout(() => {
                btn.style.background = '';
                btn.innerHTML = `<i class="fa-solid fa-download"></i> Download Video`;
                btn.onclick = downloadWatchItem;
            }, 3000);
        }
        toast("❌ Could not find download link", "#ff4444");
        return;
    }

    // PHASE 2: Start actual download
    const downloadUrl = getDownloadUrl(finalUrl, cleanName);

    if (btn) {
        btn.disabled = true;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Starting...`;

        try {
            // Trigger browser download
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${cleanName}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            toast("⬇️ Download started in browser", "var(--primary)");

            setTimeout(() => {
                btn.innerHTML = `<i class="fa-solid fa-check"></i> Started!`;
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;
                }, 3000);
            }, 1500);
        } catch (err) {
            console.error("Download Trigger Failed:", err);
            toast("❌ Download failed", "#ff4444");
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    } else {
        // Fallback if button not found
        window.location.href = downloadUrl;
    }
}

function startWatchButtonPolling(itemId) {
    if (window._watchBtnInterval) clearInterval(window._watchBtnInterval);

    // Debug for XNXX
    const isXNXX = window.currentWatchItem?._source?.id === 'xnxx' || window._lastDebugSource === 'xnxx';
    if (isXNXX) console.log('🔍 [XNXX Polling] Starting for itemId:', itemId);

    window._watchBtnInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/download/status');
            const data = await res.json();
            const downloads = Array.isArray(data) ? data : [];

            // Debug for XNXX
            if (isXNXX) {
                console.log('🔍 [XNXX Polling] Total downloads:', downloads.length);
                console.log('🔍 [XNXX Polling] Looking for itemId:', itemId);
                console.log('🔍 [XNXX Polling] Downloads IDs:', downloads.map(d => d.id));
            }

            const dl = downloads.find(d => d.id === itemId);
            const btn = document.getElementById('btn-direct-download');

            // Debug for XNXX
            if (isXNXX) {
                console.log('🔍 [XNXX Polling] Found download:', dl ? 'YES' : 'NO');
                if (dl) console.log('🔍 [XNXX Polling] Download status:', dl.status, 'progress:', dl.progress);
            }

            if (!btn) {
                if (isXNXX) console.log('🔍 [XNXX Polling] Button not found, stopping');
                clearInterval(window._watchBtnInterval);
                return;
            }

            if (dl) {
                // Initialize inner HTML if not present or class missing
                if (!btn.classList.contains('dl-btn-progress') || !btn.querySelector('.progress-fill')) {
                    btn.classList.add('dl-btn-progress');
                    btn.innerHTML = `
                        <div class="progress-fill" style="width: ${dl.progress}%"></div>
                        <i class="fa-solid fa-sync fa-spin"></i> <span>Downloading... ${Math.round(dl.progress)}%</span>
                        <div class="dl-cancel-btn" title="Cancel Download"><i class="fa-solid fa-xmark"></i></div>
                    `;
                    btn.onclick = (e) => {
                        if (e.target.closest('.dl-cancel-btn')) {
                            e.stopPropagation();
                            cancelDownload(itemId);
                        }
                    };
                } else if (dl.status === 'completed') {
                    btn.classList.add('completed');
                    const fill = btn.querySelector('.progress-fill');
                    const text = btn.querySelector('span');
                    const icon = btn.querySelector('i');
                    if (fill) fill.style.width = '100%';
                    if (text) text.innerText = 'Download Complete!';
                    if (icon) { icon.className = 'fa-solid fa-check'; icon.classList.remove('fa-spin'); }
                    const cancelBtn = btn.querySelector('.dl-cancel-btn');
                    if (cancelBtn) cancelBtn.remove();
                    clearInterval(window._watchBtnInterval);
                    fetchDownloadedFiles();
                } else if (dl.status === 'error') {
                    // Auto-retry for XNXX on first failure
                    if (isXNXX && !window._xnxxRetryAttempted) {
                        window._xnxxRetryAttempted = true;
                        console.log('🔍 [XNXX Polling] Download failed, auto-retrying...');
                        btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Retrying...`;
                        setTimeout(() => {
                            // Re-trigger download
                            downloadWatchItem();
                        }, 2000);
                    } else {
                        btn.classList.remove('dl-btn-progress');
                        btn.innerHTML = `<i class="fa-solid fa-download"></i> Download Video`;
                        btn.onclick = downloadWatchItem;
                        clearInterval(window._watchBtnInterval);
                    }
                } else {
                    // Update existing structure
                    const fill = btn.querySelector('.progress-fill');
                    const text = btn.querySelector('span');
                    const icon = btn.querySelector('i');
                    if (fill) fill.style.width = dl.progress + '%';
                    if (text) text.innerText = `Downloading... ${Math.round(dl.progress)}%`;
                    if (icon) icon.className = 'fa-solid fa-sync fa-spin';
                }
            } else if (btn.classList.contains('dl-btn-progress')) {
                // Task disappeared (maybe cancelled or finished and cleared)
                // but if we didn't catch the 'completed' state, just reset
                btn.classList.remove('dl-btn-progress');
                btn.innerHTML = `<i class="fa-solid fa-download"></i> Download Video`;
                btn.onclick = downloadWatchItem;
                clearInterval(window._watchBtnInterval);
            }
        } catch (e) { }
    }, 1000);
}



// Replaced duplicated fetchDownloads

function updateDownloadUIs(downloads) {
    if (!Array.isArray(downloads)) return;

    if (!window._recentlyCompleted) window._recentlyCompleted = new Set();

    document.querySelectorAll('[id^="progress-"]').forEach(overlay => {
        const id = overlay.id.replace('progress-', '');
        const dl = downloads.find(d => d.id === id);

        if (dl) {
            if (dl.status === 'completed' || dl.status === 'error') {
                overlay.classList.remove('active');
                window._recentlyCompleted.add(id);

                // Show downloaded badge when completed successfully
                const dBadge = document.getElementById(`done-${id}`);
                if (dBadge && dl.status === 'completed') {
                    dBadge.classList.add('active');
                }
            } else {
                overlay.classList.add('active');
                const fill = overlay.querySelector('.progress-bar-fill');
                const text = overlay.querySelector('.progress-text');
                const statusText = overlay.querySelector('.status-text');

                if (fill) fill.style.width = dl.progress + '%';
                if (text) text.innerText = dl.progress + '%';
                if (statusText) {
                    let info = dl.status.charAt(0).toUpperCase() + dl.status.slice(1);
                    if (dl.speed) info += ` • ${dl.speed}`;
                    if (dl.eta) info += ` • ${dl.eta}`;
                    statusText.innerText = info;
                }

                // Hide downloaded badge while downloading
                const dBadge = document.getElementById(`done-${id}`);
                if (dBadge) dBadge.classList.remove('active');
            }
        } else {
            let isWaiting = false;

            if (window._recentlyCompleted && window._recentlyCompleted.has(id)) {
                isWaiting = false;
            } else if (localStorage.getItem('x_stream_auto_download') === 'true' && typeof favorites !== 'undefined') {
                const favItem = favorites.find(f => f.id === id);
                if (favItem) {
                    const cleanName = (favItem.name || favItem.title || 'video').replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
                    if (!isLocallyDownloaded(cleanName)) {
                        isWaiting = true;
                    }
                }
            }

            if (isWaiting) {
                overlay.classList.add('active');
                const fill = overlay.querySelector('.progress-bar-fill');
                const text = overlay.querySelector('.progress-text');
                const statusText = overlay.querySelector('.status-text');
                const badge = document.getElementById(`done-${id}`);

                if (fill) fill.style.width = '0%';
                if (text) text.innerText = '';
                if (statusText) statusText.innerText = 'Waiting...';
                if (badge) badge.classList.remove('active');
            } else {
                overlay.classList.remove('active');
            }
        }
    });

    // 2. Sync Watch Page Button
    const watchBtn = document.getElementById('btn-direct-download');
    if (watchBtn && window.currentWatchItem) {
        const watchDl = downloads.find(d => d.id === window.currentWatchItem.id);
        if (watchDl) {
            if (watchDl.status !== 'completed' && watchDl.status !== 'error') {
                if (!watchBtn.classList.contains('dl-btn-progress')) {
                    watchBtn.onclick = null;
                    watchBtn.classList.add('dl-btn-progress');
                    watchBtn.innerHTML = `
                        <div class="progress-fill" style="width: 0%"></div>
                        <i class="fa-solid fa-spinner fa-spin"></i> <span>Starting...</span>
                        <div class="dl-cancel-btn" title="Cancel Download"><i class="fa-solid fa-xmark"></i></div>
                    `;
                    watchBtn.onclick = (e) => {
                        if (e.target.closest('.dl-cancel-btn')) window.cancelDownload(window.currentWatchItem.id);
                    };
                }
                const pFill = watchBtn.querySelector('.progress-fill');
                const pSpan = watchBtn.querySelector('span');
                const pIcon = watchBtn.querySelector('i');
                if (pFill) pFill.style.width = watchDl.progress + '%';
                if (pSpan) pSpan.innerText = `Downloading... ${Math.round(watchDl.progress)}%`;
                if (pIcon) pIcon.className = 'fa-solid fa-sync fa-spin';
            } else if (watchDl.status === 'completed') {
                if (watchBtn.classList.contains('dl-btn-progress')) {
                    watchBtn.classList.remove('dl-btn-progress');
                    watchBtn.style.background = '#28a745';
                    watchBtn.style.borderColor = '#28a745';
                    watchBtn.innerHTML = `<i class="fa-solid fa-check"></i> Downloaded`;
                }
            }
        }
    }
}

// Replaced duplicated cancelDownload

function toggleBulkMode() {
    isBulkMode = !isBulkMode;
    const btn = document.getElementById('btn-bulk');
    if (btn) {
        btn.classList.toggle('active', isBulkMode);
        btn.innerHTML = isBulkMode ? '<i class="fa-solid fa-xmark"></i> Exit Selection' : '<i class="fa-solid fa-layer-group"></i> Select Multiple';
        btn.style.background = isBulkMode ? '#ff4444' : '';
    }
    document.body.classList.toggle('bulk-mode-active', isBulkMode);

    const bulkBar = document.getElementById('bulk-bar');
    if (bulkBar) {
        if (isBulkMode) {
            bulkBar.style.display = 'flex';
            setTimeout(() => bulkBar.classList.add('active'), 10);
        } else {
            bulkBar.classList.remove('active');
            setTimeout(() => { if (!isBulkMode) bulkBar.style.display = 'none'; }, 400);
        }
    }

    if (!isBulkMode) {
        selectedItems = [];
        updateBulkUI();
        // Remove selection class from all cards manually to avoid full render
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    }
    // No full renderGrid() here!
}

function toggleSelection(item) {
    const rawName = item.name || item.title || '';
    const cleanName = rawName.replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();

    if (isLocallyDownloaded(cleanName)) {
        toast("<i class='fa-solid fa-circle-info'></i> This item is already downloaded", "#17a2b8");
        return;
    }

    const idx = selectedItems.findIndex(i => i.id === item.id);
    if (idx === -1) selectedItems.push(item);
    else selectedItems.splice(idx, 1);

    updateBulkUI();
    renderGrid(true);
}

function updateBulkUI() {
    const countSpan = document.getElementById('selected-count');
    if (countSpan) countSpan.innerText = selectedItems.length;

    const copyBtn = document.getElementById('btn-copy-selected');
    if (copyBtn) copyBtn.disabled = selectedItems.length === 0;

    const downloadBtn = document.getElementById('btn-download-selected');
    if (downloadBtn) downloadBtn.disabled = selectedItems.length === 0;

    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
        const grid = document.getElementById('mainGrid') || document.getElementById('realGrid') || document.getElementById('animeGrid') || document.getElementById('trendingGrid');
        const visibleCount = grid ? grid.querySelectorAll('.card').length : 0;

        if (visibleCount > 0 && selectedItems.length >= visibleCount) {
            selectAllBtn.innerHTML = '<i class="fa-solid fa-square-minus"></i> Deselect All';
            selectAllBtn.style.color = '#ff4444';
        } else {
            selectAllBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Select All';
            selectAllBtn.style.color = '';
        }
    }
}

function selectAllItems() {
    const grid = document.getElementById('mainGrid') || document.getElementById('realGrid') || document.getElementById('animeGrid') || document.getElementById('trendingGrid');
    if (!grid) return;

    const visibleCards = grid.querySelectorAll('.card');
    const allVisibleIds = Array.from(visibleCards).map(c => c.dataset.id);
    const areAllSelected = allVisibleIds.every(id => selectedItems.some(si => si.id === id));

    if (areAllSelected) {
        // Deselect only the currently visible ones
        selectedItems = selectedItems.filter(si => !allVisibleIds.includes(si.id));
    } else {
        // Select all visible ones that ARE NOT downloaded
        visibleCards.forEach(card => {
            if (card.classList.contains('is-downloaded')) return;

            const id = card.dataset.id;
            const item = allItems.find(i => i.id === id) || favorites.find(i => i.id === id);
            if (item && !selectedItems.some(si => si.id === item.id)) {
                selectedItems.push(item);
            }
        });
    }

    updateBulkUI();
    renderGrid(true);
}

async function copySelectedLinks() {
    if (selectedItems.length === 0) return;

    const total = selectedItems.length;
    const toast = (msg, color = 'var(--primary)') => {
        let t = document.querySelector('.toast-notif');
        if (!t) {
            t = document.createElement('div');
            t.className = 'toast-notif';
            t.style = `position: fixed; top: 100px; left: 50%; transform: translateX(-50%); background: ${color}; color: white; padding: 12px 35px; border-radius: 50px; font-weight: 900; z-index: 10001; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 10px;`;
            document.body.appendChild(t);
        }
        t.style.background = color;
        t.innerHTML = msg;
    };

    toast(`<i class="fa-solid fa-spinner fa-spin"></i> Extracting ${total} links...`, '#ff9900');

    const linksToCopy = [];

    for (const item of selectedItems) {
        try {
            const sourceId = item._source ? (item._source.id || item._source) : '';
            if (!sourceId) {
                if (item.url && !item.url.includes('undefined')) linksToCopy.push(unwrapProxyUrl(item.url));
                continue;
            }
            const sourceInfo = typeof SOURCES !== 'undefined' ? SOURCES.find(s => s.id === sourceId) : null;
            const cleanBase = sourceInfo ? getCleanBase(sourceInfo.baseUrl) : `http://${window.location.hostname}:3000/${sourceId}`;
            const resp = await fetch(`${cleanBase}/stream/movie/${encodeURIComponent(item.id)}.json`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.streams && data.streams.length > 0) {
                    const stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4')) ||
                        data.streams.find(s => s.title && s.title.toLowerCase().includes('mp4') && !s.url.includes('.m3u8')) ||
                        data.streams[0];
                    if (stream && stream.url) {
                        let finalLink = stream.url;
                        const isHls = finalLink.includes('.m3u8');
                        if (!finalLink.includes('/api/m3u8-proxy?url=') && !finalLink.includes('/api/stream?url=')) {
                            const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
                            finalLink = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(stream.url)}`;
                        }
                        linksToCopy.push(unwrapProxyUrl(finalLink));
                    }
                }
            }
        } catch (e) { }
    }

    if (linksToCopy.length > 0) {
        const textToCopy = linksToCopy.join('\n');

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
                toast(`<i class="fa-solid fa-check"></i> Copied ${linksToCopy.length} links!`, '#28a745');
            } else {
                // HTTP Fallback
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                const successful = document.execCommand('copy');
                textArea.remove();

                if (successful) {
                    toast(`<i class="fa-solid fa-check"></i> Copied ${linksToCopy.length} links!`, '#28a745');
                } else {
                    throw new Error('execCommand failed');
                }
            }
        } catch (e) {
            console.error('Copy Failed:', e);
            toast(`<i class="fa-solid fa-xmark"></i> Failed to copy (HTTP blocked)`, '#ff4444');
        }
    } else {
        toast(`<i class="fa-solid fa-xmark"></i> Extraction failed`, '#ff4444');
    }

    setTimeout(() => {
        const t = document.querySelector('.toast-notif');
        if (t) {
            t.style.animation = 'fadeOutDown 0.4s forwards';
            setTimeout(() => t.remove(), 400);
        }
    }, 4000);

    toggleBulkMode();
}

async function downloadSelectedPython() {
    if (selectedItems.length === 0) return;

    const total = selectedItems.length;
    const createToast = (msg, color = 'var(--primary)') => {
        let t = document.querySelector('.toast-notif');
        if (!t) {
            t = document.createElement('div');
            t.className = 'toast-notif';
            t.style = `position: fixed; top: 100px; left: 50%; transform: translateX(-50%); background: ${color}; color: white; padding: 12px 35px; border-radius: 50px; font-weight: 900; z-index: 10001; box-shadow: 0 10px 30px rgba(0,0,0,0.5);`;
            document.body.appendChild(t);
        }
        t.innerHTML = msg;
        return t;
    };

    createToast(`🔍 Phase 1/2: Fetching stream links for ${total} items...`, '#ff9800');

    const itemsToDownload = [];
    const failedItems = [];

    for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        createToast(`🔍 Phase 1/2: Fetching link ${i + 1}/${total}: ${item.name.substring(0, 30)}...`, '#ff9800');

        try {
            const resolved = await resolveAllStreams(item);
            if (resolved && resolved.length > 0) {
                const stream = resolved.find(s => s.title && s.title.toLowerCase().includes('high mp4')) ||
                    resolved.find(s => s.title && s.title.toLowerCase().includes('mp4') && !s.url.includes('.m3u8')) ||
                    resolved[0];

                if (stream && stream.url) {
                    itemsToDownload.push({
                        id: item.id,
                        name: item.name,
                        link: stream.url,
                        source: item._source?.id || ''
                    });

                    window.triggeredDownloads.add(item.id);
                    if (isFavorite(item)) {
                        const favIdx = favorites.findIndex(f => f.id === item.id);
                        if (favIdx !== -1) favorites[favIdx].isDownloaded = true;
                    }
                } else {
                    failedItems.push(item.name);
                }
            } else {
                failedItems.push(item.name);
            }
        } catch (e) {
            console.error("Error resolved item:", item.id, e);
            failedItems.push(item.name);
        }
    }

    if (itemsToDownload.length === 0) {
        createToast(`❌ No downloadable links found for ${failedItems.length} items`, "#ff4444");
        setTimeout(() => {
            const t = document.querySelector('.toast-notif');
            if (t) t.remove();
        }, 5000);
        return;
    }

    createToast(`⬇️ Phase 2/2: Starting download for ${itemsToDownload.length}/${total} items...`, '#2196f3');

    try {
        const res = await fetch('/api/download/python', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToDownload })
        });

        if (res.ok) {
            const failMsg = failedItems.length > 0 ? ` (${failedItems.length} skipped)` : '';
            createToast(`✅ Download Started! ${itemsToDownload.length} items${failMsg}`, "#28a745");
            toggleBulkMode();

            for (const it of itemsToDownload) {
                const fav = favorites.find(f => f.id === it.id);
                if (fav) {
                    fav.isDownloaded = true;
                    fetch('/api/favorites', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(fav)
                    }).catch(() => { });
                }
            }

            setTimeout(() => {
                const t = document.querySelector('.toast-notif');
                if (t) t.remove();
            }, 4000);
        } else {
            createToast("❌ Failed to start downloader", "#ff4444");
        }
    } catch (e) {
        createToast("❌ Server Error", "#ff4444");
    }
}

// --- Local File Checking ---
let downloadedFiles = [];

async function fetchDownloadedFiles() {
    // Disabled physical folder checking as requested.
    downloadedFiles = [];
    return;
}

function normalizeForComparison(name) {
    if (!name) return "";
    try {
        // 1. Remove common video file extensions if present
        let clean = name.replace(/\.(mp4|mkv|avi|webm|mov|flv|m4v|3gp|wmv)$/i, '');

        // 2. Normalize Unicode (handle accented characters and combining marks)
        clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 3. Remove ALL non-letter and non-number characters (this removes emojis, symbols, and punctuation)
        // \p{L} matches any letter from any language, \p{N} matches any number
        clean = clean.replace(/[^\p{L}\p{N}]/gu, '');

        return clean.toLowerCase().trim();
    } catch (e) {
        // Fallback for older environments: strip anything that isn't a word character or space, then strip spaces
        return name.replace(/[^\w]/g, '').toLowerCase().trim();
    }
}

function isLocallyDownloaded(cleanName) {
    if (!downloadedFiles || downloadedFiles.length === 0) return false;

    // Remove extension and normalize (remove emojis and symbols)
    const baseCleanName = normalizeForComparison(cleanName.replace(/\.[^/.]+$/, ''));

    return downloadedFiles.some(f => {
        const filename = typeof f === 'string' ? f : (f.name || '');
        const baseFilename = normalizeForComparison(filename.replace(/\.[^/.]+$/, ''));

        // EXACT match: names must be identical (ignoring extension, case, emojis, and symbols)
        return baseFilename === baseCleanName;
    });
}

// --- Auto Download Favorites Worker ---
window._isAutoDownloadingFavs = false;

async function processNextAutoDownload() {
    if (localStorage.getItem('x_stream_auto_download') !== 'true') return;
    if (window._isAutoDownloadingFavs) return;

    // Check if there's already an active download to ensure strictly one by one
    if ((window.currentActiveTaskIds || []).length > 0) {
        setTimeout(processNextAutoDownload, 3000);
        return;
    }

    try {
        const toProcess = favorites.filter(item => {
            const rawName = item.name || item.title || 'Untitled Video';
            const cleanName = rawName.replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
            const isDownloaded = isLocallyDownloaded(cleanName);
            return !isDownloaded;
        });

        if (toProcess.length > 0) {
            window._isAutoDownloadingFavs = true;
            const item = toProcess[0]; // Exactly 1 item

            // PHASE 1: Show fetching link status
            const overlay = document.getElementById(`progress-${item.id}`);
            if (overlay) {
                overlay.classList.add('active');
                const statusText = overlay.querySelector('.status-text');
                const badge = document.getElementById(`done-${item.id}`);
                if (statusText) statusText.innerText = '🔍 Finding stream link...';
                if (badge) badge.classList.remove('active');
            }

            const itemsToDownload = [];
            try {
                const sourceId = item._source ? (item._source.id || item._source) : '';
                const sourceInfo = typeof SOURCES !== 'undefined' ? SOURCES.find(s => s.id === sourceId) : null;
                const cleanBase = sourceInfo ? getCleanBase(sourceInfo.baseUrl) : `http://${window.location.hostname}:3000/${sourceId}`;
                const resp = await fetch(`${cleanBase}/stream/movie/${encodeURIComponent(item.id)}.json`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.streams && data.streams.length > 0) {
                        const stream = data.streams.find(s => s.title && s.title.toLowerCase().includes('high mp4')) ||
                            data.streams.find(s => s.title && s.title.toLowerCase().includes('mp4') && !s.url.includes('.m3u8')) ||
                            data.streams[0];

                        if (stream && stream.url) {
                            let finalLink = stream.url;
                            const isHls = finalLink.includes('.m3u8');
                            if (!finalLink.includes('/api/m3u8-proxy?url=') && !finalLink.includes('/api/stream?url=')) {
                                const proxyPath = isHls ? '/api/m3u8-proxy' : '/api/stream';
                                finalLink = `${window.location.origin}${proxyPath}?url=${encodeURIComponent(stream.url)}`;
                            }
                            const cleanName = (item.name || item.title || 'video').replace(/<[^>]*>?/gm, '').replace(/\+/g, ' ').replace(/%20/g, ' ').trim();
                            itemsToDownload.push({
                                id: item.id,
                                name: cleanName,
                                url: unwrapProxyUrl(finalLink),
                                link: unwrapProxyUrl(finalLink),
                                source: sourceId,
                                poster: item.poster || item.thumbnail
                            });
                        }
                    }
                }
            } catch (e) { console.error('Extraction failed for auto dl', e); }

            if (itemsToDownload.length > 0) {
                // PHASE 2: Link found, now show downloading status
                if (overlay) {
                    const statusText = overlay.querySelector('.status-text');
                    if (statusText) statusText.innerText = '⬇️ Downloading...';
                }

                await fetch('/api/download/python', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: itemsToDownload })
                });
                if (typeof fetchDownloads === 'function') fetchDownloads();
            } else {
                // PHASE 1 Failed: Could not find stream link
                if (overlay) {
                    const statusText = overlay.querySelector('.status-text');
                    if (statusText) statusText.innerText = '❌ Link not found';
                    // Keep overlay active for 3 seconds then remove
                    setTimeout(() => {
                        overlay.classList.remove('active');
                    }, 3000);
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        window._isAutoDownloadingFavs = false;
        // Schedule next check
        setTimeout(processNextAutoDownload, 5000);
    }
}

// --- Local Media Server Integration ---
async function fetchLocalVideos() {
    const localSection = document.getElementById('localMediaSection');
    const localGrid = document.getElementById('localMediaGrid');

    if (!localSection || !localGrid) return;

    try {
        const response = await fetch('/api/local-videos');
        if (!response.ok) {
            console.log('[Local Media] Server not available');
            return;
        }

        const data = await response.json();
        if (!data.success || !data.videos || data.videos.length === 0) {
            console.log('[Local Media] No videos found');
            return;
        }

        // Show the section
        localSection.style.display = 'block';

        // Render videos as cards
        const videoCards = data.videos.map(video => {
            const videoName = video.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
            const encodedVideo = encodeURIComponent(video);
            const thumbnailUrl = `${CONFIG.MEDIA_SERVER_URL}/thumbnail/${encodedVideo}`;
            return `
                <article class="card" onclick="playLocalVideo('${encodedVideo}')">
                    <div class="thumb-wrapper">
                        <div class="thumb" style="background: linear-gradient(135deg, #1a1a1a 0%, #2a1a1a 100%);">
                            <img src="${thumbnailUrl}" alt="${videoName}" loading="lazy" onerror="this.style.display='none'; this.parentElement.querySelector('.fallback-icon').style.display='flex'">
                            <div class="fallback-icon" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 3em;">🎬</div>
                        </div>
                        <span class="source-badge local">🔥 LOCAL</span>
                    </div>
                    <div class="card-info">
                        <h3 class="card-title" title="${videoName}">${videoName}</h3>
                    </div>
                </article>
            `;
        }).join('');

        localGrid.innerHTML = videoCards;
        console.log(`[Local Media] Loaded ${data.videos.length} local videos`);

    } catch (error) {
        console.log('[Local Media] Error fetching videos:', error.message);
    }
}

function playLocalVideo(videoFile) {
    const xstreamUrl = `${CONFIG.SERVER_URL}/watch?local=${videoFile}`;
    window.open(xstreamUrl, '_blank');
}

// Check media server status
async function checkMediaServerStatus() {
    try {
        const response = await fetch('/api/local-status');
        const data = await response.json();
        console.log(`[Media Server] Status: ${data.online ? 'Online' : 'Offline'}`);
        return data.online;
    } catch (error) {
        console.log('[Media Server] Status check failed');
        return false;
    }
}
