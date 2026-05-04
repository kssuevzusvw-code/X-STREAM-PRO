/**
 * 🔐 X-STREAM AUTHENTICATION & SUBSCRIPTION GUARD
 * This script handles session management and subscription enforcement.
 */

// --- CONFIGURATION ---
// IMPORTANT: Replace these with your actual Supabase credentials
const SUPABASE_URL = 'https://nnrgsyhpdchjundzjqlx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Fvva1G3umVamIimFbB1G-g_6jqjspUM';

// Load Supabase Client from CDN if not already loaded
if (typeof supabase === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    document.head.appendChild(script);
}

let supabaseClient;

async function initAuth() {
    if (typeof supabase === 'undefined') {
        // Wait for script to load
        await new Promise(resolve => setTimeout(resolve, 500));
        return initAuth();
    }

    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isLoginPage = currentPage === 'login.html';

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
        if (!isLoginPage) {
            console.log('🚫 No active session. Redirecting to login...');
            window.location.href = 'login.html';
        }
        return;
    }

    // Check subscription status
    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (profileError || !profile) {
        console.error('❌ Error fetching profile:', profileError);
        return;
    }

    // Store user data globally
    window.userProfile = profile;

    // Check if subscription has expired
    const now = new Date();
    const expiry = new Date(profile.subscription_end);

    if (expiry < now) {
        if (!isLoginPage) {
            console.log('⚠️ Subscription expired. Blocking access.');
            showSubscriptionExpiredOverlay(profile.subscription_end);
        }
    } else {
        console.log(`✅ Authenticated as ${profile.email}. Subscription active until: ${expiry.toLocaleDateString()}`);
        
        // 🔄 Sync cloud data (Favorites/History)
        if (typeof syncUserCloudData === 'function') syncUserCloudData();

        if (isLoginPage) {
            window.location.href = 'index.html';
        }
    }
}

function showSubscriptionExpiredOverlay(expiryDate) {
    const overlay = document.createElement('div');
    overlay.id = 'subscription-expired-overlay';
    overlay.style = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.95); z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        color: white; font-family: 'Outfit', sans-serif; text-align: center;
        backdrop-filter: blur(10px);
    `;

    overlay.innerHTML = `
        <div style="max-width: 500px; padding: 40px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; background: rgba(255,255,255,0.05);">
            <i class="fa-solid fa-clock-rotate-left" style="font-size: 64px; color: #ff4757; margin-bottom: 24px;"></i>
            <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 16px;">Subscription Expired</h1>
            <p style="font-size: 18px; opacity: 0.8; margin-bottom: 32px;">
                Your access expired on <b>${new Date(expiryDate).toLocaleDateString()}</b>.<br>
                Please contact the administrator to renew your access.
            </p>
            <button onclick="handleLogout()" style="
                background: white; color: black; border: none; padding: 12px 32px;
                border-radius: 12px; font-weight: 600; cursor: pointer; transition: 0.3s;
            ">Log Out</button>
        </div>
    `;

    document.body.appendChild(overlay);
    // Block scrolling
    document.body.style.overflow = 'hidden';
}

async function handleLogout() {
    if (supabaseClient) {
        // 🧹 Clear local data first
        if (typeof clearFavoritesDB === 'function') await clearFavoritesDB();
        localStorage.removeItem('x_stream_continue_watching');
        
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    }
}

// Auto-init on load
window.addEventListener('DOMContentLoaded', initAuth);

// Helper for admin page access
function checkAdmin() {
    if (!window.userProfile || !window.userProfile.is_admin) {
        window.location.href = 'index.html';
    }
}
