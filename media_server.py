import http.server
import socketserver
import os
import json
import subprocess
import re
from urllib.parse import unquote, quote
import socket
import random
import threading
import time

# Global to track preview generation progress
preview_progress = {} # {filename: percentage}
preview_lock = threading.Lock()

THUMBNAIL_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'thumbnails')
PREVIEW_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'previews')
os.makedirs(THUMBNAIL_FOLDER, exist_ok=True)
os.makedirs(PREVIEW_FOLDER, exist_ok=True)

# Cache for video durations
DURATION_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'video_durations.json')
duration_cache = {}

def load_duration_cache():
    """Load cached video durations from file"""
    global duration_cache
    try:
        if os.path.exists(DURATION_CACHE_FILE):
            with open(DURATION_CACHE_FILE, 'r', encoding='utf-8') as f:
                duration_cache = json.load(f)
    except:
        duration_cache = {}

def save_duration_cache():
    """Save video durations to cache file"""
    try:
        with open(DURATION_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(duration_cache, f, ensure_ascii=False)
    except:
        pass

def get_cached_duration(video_path):
    """Get duration from cache or calculate and cache it"""
    global duration_cache
    video_name = os.path.basename(video_path)
    mtime = os.path.getmtime(video_path)
    
    # Check if we have cached duration and file hasn't changed
    if video_name in duration_cache:
        cached = duration_cache[video_name]
        if cached.get('mtime') == mtime:
            return cached.get('duration', '--:--')
    
    # Calculate duration using ffprobe
    duration = get_video_duration(video_path)
    
    # Cache it
    duration_cache[video_name] = {
        'mtime': mtime,
        'duration': duration
    }
    save_duration_cache()
    
    return duration

def get_thumbnail(video_path):
    """Extract thumbnail from video using ffmpeg"""
    video_name = os.path.basename(video_path)
    thumbnail_name = os.path.splitext(video_name)[0] + '.jpg'
    thumbnail_path = os.path.join(THUMBNAIL_FOLDER, thumbnail_name)
    
    if os.path.exists(thumbnail_path):
        return thumbnail_path
    
    try:
        # Extract thumbnail at 10 seconds or 10% of video
        cmd = [
            'ffmpeg', '-i', video_path,
            '-ss', '00:00:10',  # 10 seconds
            '-vframes', '1',
            '-q:v', '2',  # High quality
            '-y',  # Overwrite if exists
            thumbnail_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        if result.returncode == 0 and os.path.exists(thumbnail_path):
            return thumbnail_path
    except:
        pass
    
    return None

def get_preview(video_path):
    """Extract a 10-second preview clip composed of random segments using fast seeking"""
    video_name = os.path.basename(video_path)
    preview_name = os.path.splitext(video_name)[0] + '.mp4'
    preview_path = os.path.join(PREVIEW_FOLDER, preview_name)
    
    if os.path.exists(preview_path):
        return preview_path
    
    with preview_lock:
        if video_name in preview_progress:
            return None
        preview_progress[video_name] = 0
    
    try:
        duration = get_video_duration_raw(video_path)
        if duration <= 0:
            with preview_lock:
                if video_name in preview_progress: del preview_progress[video_name]
            return None
            
        segment_count = 5
        segment_duration = 2
        
        start_buffer = duration * 0.05
        end_buffer = duration * 0.90
        available_duration = end_buffer - start_buffer
        
        if available_duration < (segment_count * segment_duration):
            # Fallback for very short videos
            cmd = [
                'ffmpeg', '-ss', str(max(0, duration/2 - 5)), '-t', '10', '-i', video_path,
                '-vf', 'scale=480:-1', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '35', '-y',
                preview_path
            ]
        else:
            starts = [random.uniform(start_buffer, end_buffer - segment_duration) for _ in range(segment_count)]
            starts.sort()
            
            # FAST SEEKING method: use multiple inputs with -ss BEFORE -i
            inputs = []
            filter_parts = []
            for i, s in enumerate(starts):
                inputs.extend(['-ss', f"{s:.2f}", '-t', str(segment_duration), '-i', video_path])
                # Normalize each segment to 720p width and better pixel format
                filter_parts.append(f"[{i}:v]scale=720:-2,setpts=PTS-STARTPTS,format=yuv420p[v{i}]")
            
            # Combine filters with semicolons
            filter_str = ";".join(filter_parts) + ";" + "".join([f"[v{i}]" for i in range(len(starts))]) + f"concat=n={len(starts)}:v=1[outv]"
            
            cmd = [
                'ffmpeg', *inputs,
                '-filter_complex', filter_str,
                '-map', '[outv]',
                '-pix_fmt', 'yuv420p',
                '-an', '-c:v', 'libx264', '-preset', 'faster', '-crf', '26', '-y',
                preview_path
            ]
            
        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        start_time = time.time()
        while process.poll() is None:
            elapsed = time.time() - start_time
            # This method is much faster, so progress can move quicker
            prog = min(95, int((elapsed / 5.0) * 100)) 
            with preview_lock:
                preview_progress[video_name] = prog
            time.sleep(0.3)
            if elapsed > 30: # Fast method should definitely finish in < 30s
                process.kill()
                break
        
        if process.returncode == 0 and os.path.exists(preview_path):
            with preview_lock:
                preview_progress[video_name] = 100
            return preview_path
            
    except Exception as e:
        print(f"Error generating preview for {video_name}: {e}")
    finally:
        def cleanup():
            time.sleep(1)
            with preview_lock:
                if video_name in preview_progress: del preview_progress[video_name]
        threading.Thread(target=cleanup).start()
    
    return None

def get_video_duration_raw(video_path):
    """Get video duration in seconds (float) using ffprobe"""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=10)
        if result.returncode == 0:
            return float(result.stdout.strip())
    except:
        pass
    return 0.0

def get_video_duration(video_path):
    """Get video duration in seconds using ffprobe"""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=10)
        if result.returncode == 0:
            duration = float(result.stdout.strip())
            # Format as MM:SS or HH:MM:SS
            hours = int(duration // 3600)
            minutes = int((duration % 3600) // 60)
            seconds = int(duration % 60)
            if hours > 0:
                return f"{hours}:{minutes:02d}:{seconds:02d}"
            else:
                return f"{minutes}:{seconds:02d}"
    except:
        pass
    return "--:--"

def clean_filename_for_display(name):
    """Clean filename from encoding artifacts and replace with clean text"""
    # Fix common encoding issues (mojibake from UTF-8 → Latin-1)
    replacements = {
        # Emojis
        'ðŸ''«': '💫', 'ðŸ''‹': '💋', 'ðŸ""¥': '🔥',
        # Quotes and dashes
        'Â\xa0': ' ', 'â€™': "'", 'â€œ': '"', 'â€"': '"',
        'â€“': '-', 'â€"': '-', 'â€˜': "'", 'â€™': "'",
        # Special chars
        'Â©': '©', 'Â®': '®', 'Â°': '°', 'Â±': '±',
        # Spanish/Portuguese accents (UTF-8 mojibake)
        'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
        'Ã ': 'à', 'Ã¨': 'è', 'Ã¬': 'ì', 'Ã²': 'ò', 'Ã¹': 'ù',
        'Ã¢': 'â', 'Ãª': 'ê', 'Ã®': 'î', 'Ã´': 'ô', 'Ã»': 'û',
        'Ã£': 'ã', 'Ãµ': 'õ', 'Ã±': 'ñ', 'Ã§': 'ç',
        'Ã€': 'À', 'Ãˆ': 'È', 'ÃŒ': 'Ì', 'Ã’': 'Ò', 'Ã™': 'Ù',
        'Ã‚': 'Â', 'ÃŠ': 'Ê', 'ÃŽ': 'Î', 'Ã”': 'Ô', 'Ã›': 'Û',
        'Ãƒ': 'Ã', 'Ã•': 'Õ', 'Ã‘': 'Ñ', 'Ã‡': 'Ç',
        'Ã„': 'Ä', 'Ã‹': 'Ë', 'Ã\x8f': 'Ï', 'Ã–': 'Ö', 'Ãœ': 'Ü',
        'Ã˜': 'Ø', 'Ã…': 'Å', 'Ã†': 'Æ', 'Ãž': 'Þ', 'ÃŸ': 'ß',
        # Common Windows-1252 issues
        'â€': '†', 'â€¡': '‡', 'â€°': '‰',
    }
    for bad, good in replacements.items():
        name = name.replace(bad, good)
    # Remove any remaining control chars
    name = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]', '', name)
    return name

PORT = 7000
VIDEO_FOLDER = r'C:\Users\walee\OneDrive\Desktop\Folders\New folder (4)\New folder\downloads'
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'}

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"

def load_favorites():
    """Load favorites from favorites.json with exact name matching support"""
    favorites = []
    try:
        fav_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'favorites.json')
        if os.path.exists(fav_file):
            with open(fav_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    favorites = [item.get('name', item.get('id', '')) for item in data if isinstance(item, dict)]
                elif isinstance(data, dict) and 'favorites' in data:
                    favorites = [item.get('name', item.get('id', '')) for item in data['favorites'] if isinstance(item, dict)]
    except Exception as e:
        print(f"Error loading favorites: {e}")
    return favorites

def normalize_for_comparison(name):
    """Remove emojis and special symbols, keep only alphanumeric and spaces"""
    # Remove emojis (simplified approach for Python)
    name = re.sub(r'[^\w\s.-]', '', name)  # Remove all non-alphanumeric except spaces, dots, hyphens
    name = re.sub(r'\s+', ' ', name)       # Collapse multiple spaces
    return name.strip().lower()

def is_in_favorites(video_name, favorites):
    """Check if video is in favorites - EXACT name match (ignoring extension, emojis, and symbols)"""
    base_video = normalize_for_comparison(os.path.splitext(video_name)[0])
    for fav in favorites:
        base_fav = normalize_for_comparison(os.path.splitext(fav)[0])
        # EXACT match required (ignoring emojis and symbols)
        if base_video == base_fav:
            return True
    return False

def list_videos():
    videos = []
    favorites = load_favorites()  # Load favorites for comparison
    # Load duration cache once
    load_duration_cache()
    
    # Use absolute path and add prefix for Windows long path support
    base_folder = os.path.abspath(VIDEO_FOLDER)
    if os.name == 'nt' and not base_folder.startswith('\\\\?\\'):
        base_folder = '\\\\?\\' + base_folder
        
    try:
        if not os.path.exists(base_folder):
            return []
            
        for raw_filename in os.listdir(base_folder):
            # Clean surrogate characters (invalid unicode) for display/json only
            # Surrogates (0xD800 to 0xDFFF) cause crashes in JSON and various encoding steps
            clean_name = "".join(c for c in raw_filename if not (0xD800 <= ord(c) <= 0xDFFF))
            
            # AUTO-FIX: If the filename contains surrogates, rename the file to the clean version
            if raw_filename != clean_name:
                try:
                    old_path = os.path.join(base_folder, raw_filename)
                    new_path = os.path.join(base_folder, clean_name)
                    if not os.path.exists(new_path):
                        os.rename(old_path, new_path)
                        raw_filename = clean_name
                        print(f"✅ [Auto-Fix] Renamed corrupted filename to: {clean_name}")
                except Exception as rename_err:
                    print(f"❌ [Auto-Fix] Failed to rename {raw_filename}: {rename_err}")

            if os.path.splitext(clean_name)[1].lower() in VIDEO_EXTENSIONS:
                filepath = os.path.join(base_folder, raw_filename)
                
                # Get modification time using original name
                try:
                    mtime = os.path.getmtime(filepath)
                except Exception as e:
                    # Log the specific error but don't crash
                    print(f"Error getting mtime for {clean_name}: {e}")
                    mtime = 0
                
                # Check favorites using cleaned name
                is_fav = is_in_favorites(clean_name, favorites)
                # Get video duration using original name
                duration = get_cached_duration(filepath)
                
                # Store original raw_filename for file serving
                videos.append((raw_filename, mtime, is_fav, duration))
    except Exception as e:
        print(f"Error listing videos in {VIDEO_FOLDER}: {e}")
    
    # Sort by modification time (newest first)
    videos.sort(key=lambda x: x[1], reverse=True)
    return videos

HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 X-STREAM | Premium Adult Collection</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-dark: #050505;
            --bg-card: #0a0a0a;
            --primary: #f0a500;
            --primary-glow: rgba(240, 165, 0, 0.25);
            --accent: #d4af37;
            --text-main: #f5f5f5;
            --text-muted: #888888;
            --glass: rgba(8, 8, 8, 0.75);
            --glass-border: rgba(255, 255, 255, 0.04);
            --radius: 12px;
            --font-main: 'Outfit', sans-serif;
            --transition-smooth: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        body {
            font-family: var(--font-main);
            background: var(--bg-dark);
            min-height: 100vh;
            color: var(--text-main);
            line-height: 1.6;
            background-image: 
                radial-gradient(ellipse at top, rgba(240,165,0,0.05) 0%, transparent 50%),
                radial-gradient(ellipse at bottom, rgba(212,175,55,0.03) 0%, transparent 50%);
        }
        .navbar {
            background: rgba(5, 5, 5, 0.85);
            padding: 15px 4%;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            display: flex;
            justify-content: space-between;
            align-items: center;
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .logo {
            font-size: 2em;
            font-weight: 900;
            background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .logo::before {
            content: '🔥';
            font-size: 1.2em;
            -webkit-text-fill-color: initial;
        }
        .nav-actions {
            display: flex;
            gap: 15px;
            align-items: center;
        }
        .search-container {
            position: relative;
        }
        .search-box {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border);
            border-radius: 25px;
            padding: 12px 20px 12px 45px;
            color: var(--text-primary);
            font-size: 0.95em;
            width: 300px;
            transition: all 0.3s ease;
            outline: none;
        }
        .search-box:focus {
            background: rgba(255,255,255,0.1);
            border-color: var(--primary);
            width: 380px;
            box-shadow: 0 0 20px var(--primary-glow);
        }
        .search-box::placeholder { color: var(--text-secondary); }
        .search-icon {
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--primary);
            font-size: 1.1em;
        }
        .refresh-btn {
            background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
            border: none;
            color: black;
            padding: 12px 25px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: 800;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 15px var(--primary-glow);
        }
        .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 25px var(--primary-glow);
        }
        .refresh-btn.spinning i {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .hero {
            padding: 140px 4% 60px;
            background: linear-gradient(to bottom, rgba(240,165,0,0.1) 0%, var(--bg-dark) 100%);
            position: relative;
        }
        .hero::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 300px;
            background: radial-gradient(ellipse at center, rgba(240,165,0,0.15) 0%, transparent 70%);
            pointer-events: none;
        }
        .hero-content h1 {
            font-size: 3.5em;
            font-weight: 900;
            margin-bottom: 15px;
            background: linear-gradient(135deg, #fff 0%, var(--primary) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-transform: uppercase;
            letter-spacing: 3px;
        }
        .hero-content p {
            color: var(--text-secondary);
            font-size: 1.2em;
            font-weight: 300;
        }
        .video-count {
            color: var(--primary);
            font-weight: 900;
            text-shadow: 0 0 20px var(--primary-glow);
        }
        .content {
            padding: 40px 4%;
        }
        .section-title {
            font-size: 1.5em;
            font-weight: 700;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: var(--text-primary);
        }
        .section-title::after {
            content: '';
            flex: 1;
            height: 2px;
            background: linear-gradient(to right, var(--primary), transparent);
            margin-left: 15px;
        }
        .video-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
        }
        .video-card {
            background: transparent;
            display: flex;
            flex-direction: column;
            cursor: pointer;
            transition: var(--transition-smooth);
        }
        .video-thumb {
            width: 100%;
            aspect-ratio: 16/9;
            background: #0a0a0a;
            position: relative;
            overflow: hidden;
            border-radius: var(--radius);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
            border: 1px solid var(--glass-border);
            transition: var(--transition-smooth);
        }
        /* Skeleton Pulse Effect */
        .video-thumb::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
            animation: skeleton-shimmer 1.5s infinite linear;
            z-index: 1;
        }
        @keyframes skeleton-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .video-card:hover .video-thumb {
            transform: translateY(-8px) scale(1.03);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.9), 0 0 25px var(--primary-glow);
            border-color: rgba(240, 165, 0, 0.3);
        }
        .video-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            position: relative;
            z-index: 2;
            transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s;
            opacity: 0;
        }
        .video-thumb img.loaded {
            opacity: 1;
        }
        .video-card:hover .video-thumb img {
            transform: scale(1.1);
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .video-card {
            animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .play-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 2;
        }
        .video-card:hover .play-overlay {
            opacity: 1;
        }
        .play-icon {
            width: 55px;
            height: 55px;
            background: var(--primary);
            color: black;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5em;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .video-duration {
            position: absolute;
            bottom: 12px;
            right: 12px;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(8px);
            color: #fff;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 800;
            z-index: 5;
        }
        .preview-video {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            z-index: 3;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }
        .video-card:hover .preview-video {
            opacity: 1;
        }
        .preview-progress-container {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.1);
            z-index: 10;
            display: none;
        }
        .preview-progress-bar {
            height: 100%;
            width: 0%;
            background: var(--primary);
            box-shadow: 0 0 10px var(--primary-glow);
            transition: width 0.3s ease;
        }
        .preview-loading-status {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 11;
            display: none;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            pointer-events: none;
        }
        .preview-loading-status span {
            font-size: 0.75rem;
            font-weight: 800;
            color: var(--primary);
            text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .regenerate-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 32px;
            height: 32px;
            background: rgba(0,0,0,0.6);
            border: 1px solid var(--glass-border);
            border-radius: 50%;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 20;
            opacity: 0;
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
        }
        .video-card:hover .regenerate-btn {
            opacity: 1;
        }
        .regenerate-btn:hover {
            background: var(--primary);
            color: #000;
            transform: rotate(180deg);
            box-shadow: 0 0 15px var(--primary-glow);
        }
        .video-info {
            padding: 12px 4px 4px 4px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .video-title {
            font-size: 0.95rem;
            font-weight: 700;
            line-height: 1.4;
            color: #f8f8f8;
            transition: color 0.3s ease;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            white-space: normal;
        }
        .video-card:hover .video-title {
            color: var(--primary);
        }
        .video-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        .video-link {
            margin-top: 4px;
            font-size: 0.7rem;
            color: var(--primary);
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .video-link:hover {
            opacity: 1;
            text-decoration: underline;
        }
        .video-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .action-btn {
            flex: 1;
            padding: 10px 15px;
            border: none;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .watch-btn {
            background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
            color: black;
            box-shadow: 0 4px 15px var(--primary-glow);
        }
        .watch-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px var(--primary-glow);
        }
        .download-btn {
            background: rgba(255,255,255,0.08);
            color: var(--text-muted);
            border: 1px solid var(--glass-border);
        }
        .download-btn:hover {
            background: rgba(255,165,0,0.1);
            color: var(--primary);
            border-color: var(--primary);
        }
        .no-videos {
            text-align: center;
            padding: 120px 20px;
            color: var(--text-secondary);
        }
        .no-videos i {
            font-size: 5em;
            margin-bottom: 25px;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            opacity: 0.8;
        }
        .no-videos h2 {
            font-size: 2em;
            margin-bottom: 15px;
            color: var(--text-primary);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 3px;
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(8,8,8,0.98);
            z-index: 2000;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(10px);
        }
        .modal.active { display: flex; }
        .modal-content {
            width: 95%;
            max-width: 1400px;
            position: relative;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 0 100px rgba(240, 165, 0, 0.15);
            background: #000;
        }
        .close-btn {
            position: absolute;
            top: -60px;
            right: 0;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            border: none;
            color: black;
            font-size: 1.5em;
            cursor: pointer;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            box-shadow: 0 4px 15px var(--primary-glow);
            z-index: 10;
        }
        .close-btn:hover {
            transform: scale(1.1) rotate(90deg);
            box-shadow: 0 6px 25px var(--primary-glow);
        }
        .video-wrapper {
            background: #000;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 25px 80px rgba(0,0,0,0.8);
            border: 2px solid rgba(240,165,0,0.2);
        }
        video {
            width: 100%;
            max-height: 80vh;
            display: block;
        }
        .modal-controls {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        .modal-btn {
            padding: 14px 28px;
            border: none;
            border-radius: 25px;
            background: rgba(255,255,255,0.08);
            color: var(--text-primary);
            cursor: pointer;
            font-size: 0.9em;
            font-weight: 600;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            border: 1px solid rgba(255,255,255,0.15);
        }
        .modal-btn:hover {
            background: rgba(255,23,68,0.15);
            border-color: var(--accent);
            transform: translateY(-2px);
        }
        .modal-btn.primary {
            background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
            border: none;
            color: black;
            box-shadow: 0 4px 20px var(--primary-glow);
        }
        .modal-btn.primary:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 30px var(--primary-glow);
        }
        .speed-select {
            padding: 14px 20px;
            border-radius: 25px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.08);
            color: var(--text-primary);
            font-size: 0.9em;
            font-weight: 600;
            cursor: pointer;
            outline: none;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .speed-select option {
            background: var(--bg-secondary);
            color: var(--text-primary);
        }
        .video-title-bar {
            position: absolute;
            top: -60px;
            left: 0;
            right: 80px;
            color: var(--text-primary);
            font-size: 1.3em;
            font-weight: 700;
            text-shadow: 0 2px 10px rgba(0,0,0,0.5);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        /* Mobile Responsive Styles */
        @media (max-width: 992px) {
            .hero-content h1 { font-size: 2.5em; }
        }

        @media (max-width: 768px) {
            .navbar { 
                padding: 12px 15px; 
                background: rgba(5, 5, 5, 0.9);
                gap: 10px;
            }
            .logo { font-size: 1.3em; gap: 8px; }
            .logo::before { font-size: 1.1em; }
            
            .nav-actions { 
                flex: 1;
                justify-content: flex-end;
                gap: 8px;
            }
            
            .search-container { flex: 1; max-width: 180px; }
            .search-box { 
                width: 100% !important; 
                padding: 10px 15px 10px 35px; 
                font-size: 0.85em;
                border-radius: 20px;
            }
            .search-icon { left: 12px; font-size: 0.9em; }
            
            .refresh-btn { 
                padding: 10px;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                justify-content: center;
                gap: 0;
            }
            .refresh-btn span { display: none; }
            
            .hero { padding: 100px 4% 30px; }
            .hero-content h1 { font-size: 1.8em; letter-spacing: 1px; }
            .hero-content p { font-size: 1em; }
            
            .content { padding: 20px 15px; }
            .section-title { font-size: 1.1em; margin-bottom: 20px; letter-spacing: 1px; }
            
            .video-grid { 
                gap: 12px;
            }
            
            .video-card {
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                padding: 6px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            
            .video-thumb { 
                border-radius: 8px;
                border: none;
            }
            
            .video-title { 
                font-size: 0.82rem; 
                padding: 4px 2px;
                -webkit-line-clamp: 2;
                height: 2.8em;
            }
            
            .video-duration { 
                font-size: 0.65em; 
                padding: 2px 6px; 
                bottom: 8px; 
                right: 8px; 
            }
            
            .play-icon { width: 40px; height: 40px; font-size: 1.2em; }
        }
        
        @media (max-width: 480px) {
            .video-grid { 
                gap: 10px;
            }
            .logo span { display: none; }
            .hero-content h1 { font-size: 1.5em; }
            .search-container { max-width: 140px; }
        }
        
        /* Modern Scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg-dark); }
        ::-webkit-scrollbar-thumb { 
            background: rgba(240, 165, 0, 0.2); 
            border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover { background: var(--primary); }
    </style>
</head>
<body>
    <nav class="navbar">
        <a href="/" class="logo">
            <span>X-STREAM</span>
        </a>
        <div class="nav-actions">
            <div class="search-container">
                <i class="fas fa-search search-icon"></i>
                <input type="text" class="search-box" placeholder="Search..." id="searchInput">
            </div>
            <button class="refresh-btn" onclick="refreshVideos()" title="Refresh">
                <i class="fas fa-sync-alt"></i>
                <span>Refresh</span>
            </button>
        </div>
    </nav>
    
    <section class="hero">
        <div class="hero-content">
            <h1>🔥 Premium Collection</h1>
            <p><span class="video-count">{count}</span> exclusive videos ready</p>
        </div>
    </section>
    
    <section class="content">
        <h2 class="section-title"><i class="fas fa-fire"></i> Your Library</h2>
        <div id="videoGrid" class="video-grid">
            {videos}
        </div>
        
        <div id="noVideos" class="no-videos" style="display:none;">
            <i class="fas fa-folder-open"></i>
            <h2>No Videos Found</h2>
            <p>Add video files to your media folder</p>
        </div>
    </section>
    
    <div id="videoModal" class="modal">
        <div class="modal-content">
            <button class="close-btn" onclick="closeModal()">&times;</button>
            <div class="video-title-bar" id="videoTitle">Now Playing</div>
            <div class="video-wrapper">
                <video id="videoPlayer" controls autoplay playsinline></video>
            </div>
            <div class="modal-controls">
                <button class="modal-btn primary" onclick="toggleFullscreen()">
                    <i class="fas fa-expand"></i> Fullscreen
                </button>
                <select class="speed-select" id="speedSelect" onchange="changeSpeed()">
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1" selected>1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                </select>
                <button class="modal-btn" onclick="skipBackward()">
                    <i class="fas fa-backward"></i> -10s
                </button>
                <button class="modal-btn" onclick="skipForward()">
                    <i class="fas fa-forward"></i> +10s
                </button>
                <button class="modal-btn" onclick="downloadVideo()">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    </div>

    <script>
        // Parse video data - now includes display_name from server
        const videoData = {video_list};
        const videos = videoData.map(v => {
            if (typeof v === 'string') {
                // Fallback for old format
                return {
                    name: v,
                    display_name: v.replace(/\.[^/.]+$/, ''),
                    is_favorite: false,
                    duration: '--:--'
                };
            }
            // New format with display_name
            return {
                ...v,
                display_name: v.display_name || v.name.replace(/\.[^/.]+$/, ''),
                duration: v.duration || '--:--'
            };
        });
        
        function renderVideos(filter = '') {
            const grid = document.getElementById('videoGrid');
            const noVideos = document.getElementById('noVideos');
            const filtered = videos.filter(v => v.name.toLowerCase().includes(filter.toLowerCase()));
            
            if (filtered.length === 0) {
                grid.style.display = 'none';
                noVideos.style.display = 'block';
                return;
            }
            
            grid.style.display = 'grid';
            noVideos.style.display = 'none';
            
            grid.innerHTML = filtered.map((video, index) => {
                // Use backticks in onclick to avoid escaping issues with quotes
                const encodedVideo = encodeURIComponent(video.name);
                // Use display_name from API (cleaned from encoding issues)
                const displayName = video.display_name || video.name.replace(/\.[^/.]+$/, '');
                // Duration badge
                const durationBadge = video.duration && video.duration !== '--:--' ? 
                    `<div class="video-duration">${video.duration}</div>` : '';
                
                // Staggered delay for gradual loading
                const delay = (index % 20) * 0.05; 
                
                return `
                <div class="video-card" style="animation-delay: ${delay}s" 
                     onclick="playVideo(\`${video.name.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"
                     onmouseenter="handlePreview(this, '${encodedVideo}', true)"
                     onmouseleave="handlePreview(this, '${encodedVideo}', false)">
                    <div class="video-thumb">
                        <img src="/thumbnail/${encodedVideo}" alt="${displayName}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'; this.parentElement.innerHTML='🎬'">
                        <video class="preview-video" src="/preview/${encodedVideo}" muted loop playsinline preload="none"></video>
                        <div class="regenerate-btn" title="Regenerate Preview" onclick="regeneratePreview(event, this, '${encodedVideo}')">
                            <i class="fas fa-sync-alt"></i>
                        </div>
                        <div class="preview-loading-status">
                            <i class="fas fa-circle-notch fa-spin" style="color:var(--primary); font-size:1.5em;"></i>
                            <span>Generating...</span>
                        </div>
                        <div class="preview-progress-container">
                            <div class="preview-progress-bar"></div>
                        </div>
                        ${durationBadge}
                        <div class="play-overlay"></div>
                    </div>
                    <div class="video-info">
                        <h3 class="video-title">${displayName}</h3>
                    </div>
                </div>
            `}).join('');
        }
        
        let currentVideo = '';
        const activePolls = new Map();

        async function handlePreview(card, videoName, start) {
            const video = card.querySelector('.preview-video');
            const status = card.querySelector('.preview-loading-status');
            const progressContainer = card.querySelector('.preview-progress-container');
            const progressBar = card.querySelector('.preview-progress-bar');
            
            if (!start) {
                video.pause();
                video.currentTime = 0;
                status.style.display = 'none';
                progressContainer.style.display = 'none';
                if (activePolls.has(videoName)) {
                    clearInterval(activePolls.get(videoName));
                    activePolls.delete(videoName);
                }
                return;
            }

            // Check if preview already loaded/ready
            if (video.readyState >= 3) {
                video.play();
                return;
            }

            // Start polling progress
            progressContainer.style.display = 'block';
            status.style.display = 'flex';
            
            const poll = setInterval(async () => {
                try {
                    const res = await fetch(`/api/preview_status?video=${videoName}`);
                    const data = await res.json();
                    
                    if (data.progress === 100 || data.progress === -1 && video.readyState >= 3) {
                        progressBar.style.width = '100%';
                        setTimeout(() => {
                            progressContainer.style.display = 'none';
                            status.style.display = 'none';
                        }, 500);
                        video.play();
                        clearInterval(poll);
                        activePolls.delete(videoName);
                    } else if (data.progress >= 0) {
                        progressBar.style.width = data.progress + '%';
                        status.querySelector('span').textContent = `Generating ${data.progress}%`;
                        // If progress started, trigger the /preview/ request to ensure it is being made
                        if (video.paused && !video.src.includes('?')) {
                             video.load(); 
                        }
                    }
                } catch (e) {
                    console.error("Poll error", e);
                }
            }, 1000);
            
            activePolls.set(videoName, poll);
            
            // Also trigger initial load
            video.play().catch(e => {
                // Video might not be ready, that's fine, poll will handle it
            });
        }

        async function regeneratePreview(event, btn, videoName) {
            event.stopPropagation();
            const card = btn.closest('.video-card');
            const video = card.querySelector('.preview-video');
            
            btn.querySelector('i').classList.add('fa-spin');
            
            try {
                const res = await fetch(`/api/regenerate_preview?video=${videoName}`);
                const data = await res.json();
                
                if (data.success) {
                    // Force video reload by adding a timestamp
                    video.src = `/preview/${videoName}?t=${Date.now()}`;
                    // Trigger preview handling to show progress
                    handlePreview(card, videoName, true);
                }
            } catch (e) {
                console.error("Regeneration error", e);
            } finally {
                setTimeout(() => btn.querySelector('i').classList.remove('fa-spin'), 1000);
            }
        }
        
        function playVideo(filename) {
            // Navigate to watch page on same server (port 7000)
            // filename comes with escaped quotes (\'), remove them
            const rawName = filename
                .replace(/\\'/g, "'")   // Escaped single quote
                .replace(/\\"/g, '"');  // Escaped double quote
            const encodedName = encodeURIComponent(rawName);
            const watchUrl = `/watch?video=${encodedName}`;
            window.location.href = watchUrl;
        }
        
        // Version using backticks - no escaping needed
        function playVideoBacktick(filename) {
            // No escaping needed with backticks
            const encodedName = encodeURIComponent(filename);
            const watchUrl = `/watch?video=${encodedName}`;
            window.location.href = watchUrl;
        }
        
        function toggleFullscreen() {
            const wrapper = document.querySelector('.video-wrapper');
            if (!document.fullscreenElement) {
                wrapper.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen();
            }
        }
        
        function changeSpeed() {
            const player = document.getElementById('videoPlayer');
            const speed = document.getElementById('speedSelect').value;
            player.playbackRate = parseFloat(speed);
        }
        
        function skipForward() {
            const player = document.getElementById('videoPlayer');
            player.currentTime += 10;
        }
        
        function skipBackward() {
            const player = document.getElementById('videoPlayer');
            player.currentTime -= 10;
        }
        
        function downloadVideo() {
            if (currentVideo) {
                window.location.href = '/download/' + encodeURIComponent(currentVideo);
            }
        }
        
        async function refreshVideos() {
            const btn = document.querySelector('.refresh-btn');
            btn.classList.add('spinning');
            
            try {
                const response = await fetch('/api/videos');
                const newVideos = await response.json();
                // Normalize video data - support both old string format and new object format with display_name and duration
                const normalized = newVideos.map(v => {
                    if (typeof v === 'string') {
                        return {
                            name: v,
                            display_name: v.replace(/\.[^/.]+$/, ''),
                            is_favorite: false,
                            duration: '--:--'
                        };
                    }
                    return {
                        ...v,
                        display_name: v.display_name || v.name.replace(/\.[^/.]+$/, ''),
                        duration: v.duration || '--:--'
                    };
                });
                videos.length = 0;
                videos.push(...normalized);
                
                document.querySelector('.video-count').textContent = newVideos.length;
                renderVideos(document.getElementById('searchInput').value);
            } catch (err) {
                console.error('Error refreshing:', err);
            } finally {
                btn.classList.remove('spinning');
            }
        }
        
        function closeModal() {
            const modal = document.getElementById('videoModal');
            const player = document.getElementById('videoPlayer');
            player.pause();
            player.src = '';
            modal.classList.remove('active');
        }
        
        document.getElementById('searchInput').addEventListener('input', (e) => {
            renderVideos(e.target.value);
        });
        
        document.getElementById('videoModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
        
        renderVideos();
        
        // Smart auto-refresh: check every 5 seconds, only update if count changes
        let lastVideoCount = videos.length;
        setInterval(async () => {
            try {
                const response = await fetch('/api/videos');
                const newVideos = await response.json();
                
                if (newVideos.length !== lastVideoCount) {
                    // Videos added or removed - update display
                    const normalized = newVideos.map(v => {
                        if (typeof v === 'string') {
                            return {
                                name: v,
                                display_name: v.replace(/\.[^/.]+$/, ''),
                                is_favorite: false,
                                duration: '--:--'
                            };
                        }
                        return {
                            ...v,
                            display_name: v.display_name || v.name.replace(/\.[^/.]+$/, ''),
                            duration: v.duration || '--:--'
                        };
                    });
                    videos.length = 0;
                    videos.push(...normalized);
                    lastVideoCount = newVideos.length;
                    
                    document.querySelector('.video-count').textContent = newVideos.length;
                    renderVideos(document.getElementById('searchInput').value);
                    
                    console.log(`[Auto-refresh] Updated: ${newVideos.length} videos`);
                }
            } catch (err) {
                // Silent fail - don't spam console
            }
        }, 5000);
    </script>
</body>
</html>
'''

class MediaHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            
            videos = list_videos()
            # Convert to list of objects with all data including display_name
            video_list_data = [{
                'name': v[0],
                'display_name': clean_filename_for_display(os.path.splitext(v[0])[0]),
                'duration': v[3]
            } for v in videos]
            video_list_json = json.dumps(video_list_data, ensure_ascii=False)
            
            if videos:
                video_cards = ''
                for i, video_data in enumerate(videos):
                    filename, mtime, is_fav, duration = video_data
                    # Use errors='replace' to avoid UnicodeEncodeError with surrogates
                    encoded_video = quote(filename, safe='', errors='replace')
                    thumbnail_url = f'/thumbnail/{encoded_video}'
                    # Remove extension and clean display name from encoding issues
                    display_name = clean_filename_for_display(os.path.splitext(filename)[0])
                    # Duration badge
                    duration_badge = f'<div class="video-duration">{duration}</div>' if duration != "--:--" else ''
                    
                    # Staggered delay for first batch
                    delay = (i % 20) * 0.05
                    
                    # Use backticks in onclick to avoid escaping issues with quotes in filename
                    js_safe_filename = filename.replace('`', '\\`').replace('$', '\\$').replace("'", "\\'")
                    video_cards += f'''<div class="video-card" style="animation-delay: {delay}s" onclick="playVideo(`{js_safe_filename}`)" onmouseenter="handlePreview(this, '{encoded_video}', true)" onmouseleave="handlePreview(this, '{encoded_video}', false)"><div class="video-thumb"><img src="{thumbnail_url}" alt="{display_name}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'; this.parentElement.innerHTML='🎬'"><video class="preview-video" src="/preview/{encoded_video}" muted loop playsinline preload="none"></video><div class="regenerate-btn" title="Regenerate Preview" onclick="regeneratePreview(event, this, '{encoded_video}')"><i class="fas fa-sync-alt"></i></div><div class="preview-loading-status"><i class="fas fa-circle-notch fa-spin" style="color:var(--primary); font-size:1.5em;"></i><span>Generating...</span></div><div class="preview-progress-container"><div class="preview-progress-bar"></div></div>{duration_badge}<div class="play-overlay"></div></div><div class="video-info"><h3 class="video-title">{display_name}</h3></div></div>'''
            else:
                video_cards = ''
            
            html = HTML_TEMPLATE.replace('{count}', str(len(videos))).replace('{videos}', video_cards).replace('{video_list}', video_list_json)
            # Final safety: use errors='replace' to prevent ANY surrogate from crashing the server
            self.wfile.write(html.encode('utf-8', errors='replace'))
            
        elif self.path == '/api/videos':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            videos = list_videos()
            # Return list of dicts with name, display_name and duration
            video_data = [{
                'name': v[0],
                'display_name': clean_filename_for_display(os.path.splitext(v[0])[0]),
                'mtime': v[1],
                'duration': v[3]
            } for v in videos]
            self.wfile.write(json.dumps(video_data, ensure_ascii=False).encode('utf-8'))

        elif self.path.startswith('/api/preview_status'):
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            video_name = params.get('video', [''])[0]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            progress = -1 # -1 means not processing
            with preview_lock:
                if video_name in preview_progress:
                    progress = preview_progress[video_name]
                elif os.path.exists(os.path.join(PREVIEW_FOLDER, os.path.splitext(video_name)[0] + '.mp4')):
                    progress = 100
            
            self.wfile.write(json.dumps({'progress': progress}).encode('utf-8'))

        elif self.path.startswith('/api/regenerate_preview'):
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            video_name = params.get('video', [''])[0]
            
            preview_file = os.path.join(PREVIEW_FOLDER, os.path.splitext(video_name)[0] + '.mp4')
            
            success = False
            with preview_lock:
                if video_name not in preview_progress:
                    if os.path.exists(preview_file):
                        try:
                            # Use a brief delay or retry if file is locked
                            os.remove(preview_file)
                            success = True
                        except:
                            pass
                    else:
                        success = True # Already gone
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': success}).encode('utf-8'))
            
        elif self.path.startswith('/watch'):
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            video_name = params.get('video', [''])[0]
            
            if not video_name:
                self.send_error(400, "Missing video parameter")
                return
                
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            
            video_url = '/video/' + quote(video_name, safe='')
            # Remove extension for display name
            display_name = os.path.splitext(video_name)[0]
            watch_html = rf'''<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 X-STREAM | {display_name}</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        :root {{
            --bg-primary: #080808;
            --accent: #ff1744;
            --accent-hover: #ff4569;
            --hot-pink: #ff4081;
            --deep-red: #c62828;
            --accent-glow: rgba(255, 23, 68, 0.4);
        }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--bg-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px;
            background-image: 
                radial-gradient(ellipse at top, rgba(255,23,68,0.08) 0%, transparent 50%),
                radial-gradient(ellipse at bottom, rgba(255,64,129,0.05) 0%, transparent 50%);
        }}
        .header {{
            width: 100%;
            max-width: 1400px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
            padding: 18px 30px;
            background: rgba(255,255,255,0.03);
            border-radius: 16px;
            border: 1px solid rgba(255,23,68,0.1);
            backdrop-filter: blur(10px);
        }}
        .logo {{
            font-size: 1.8em;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent) 0%, var(--hot-pink) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-transform: uppercase;
            letter-spacing: 2px;
        }}
        .title {{
            color: #fff;
            font-size: 1.2em;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 50%;
            text-align: center;
            letter-spacing: 1px;
        }}
        .back-btn {{
            padding: 12px 25px;
            border: none;
            border-radius: 25px;
            background: linear-gradient(135deg, var(--accent) 0%, var(--deep-red) 100%);
            color: #fff;
            text-decoration: none;
            font-size: 0.95em;
            font-weight: 600;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 15px rgba(255,23,68,0.3);
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .back-btn:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(255,23,68,0.5);
        }}
        .video-wrapper {{
            width: 100%;
            max-width: 1400px;
            background: linear-gradient(135deg, #000 0%, #1a0a0a 100%);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 25px 80px rgba(255,23,68,0.25);
            border: 2px solid rgba(255,23,68,0.2);
        }}
        .video-container {{
            position: relative;
            width: 100%;
        }}
        video {{
            width: 100%;
            max-height: 75vh;
            display: block;
        }}
        .video-overlay {{
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(to bottom, transparent 60%, rgba(255,23,68,0.1) 100%);
            pointer-events: none;
        }}
        .controls {{
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 25px;
            flex-wrap: wrap;
        }}
        .control-btn {{
            padding: 14px 28px;
            border: none;
            border-radius: 25px;
            background: rgba(255,255,255,0.08);
            color: #fff;
            cursor: pointer;
            font-size: 0.95em;
            font-weight: 600;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
            border: 1px solid rgba(255,255,255,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .control-btn:hover {{
            background: rgba(255,23,68,0.15);
            border-color: var(--accent);
            transform: translateY(-2px);
        }}
        .control-btn.primary {{
            background: linear-gradient(135deg, var(--accent) 0%, var(--deep-red) 100%);
            border: none;
            box-shadow: 0 4px 20px rgba(255,23,68,0.4);
        }}
        .control-btn.primary:hover {{
            transform: translateY(-3px);
            box-shadow: 0 8px 30px rgba(255,23,68,0.6);
        }}
        .info-section {{
            width: 100%;
            max-width: 1400px;
            margin-top: 25px;
            padding: 25px;
            background: linear-gradient(135deg, rgba(26,26,26,0.8) 0%, rgba(255,23,68,0.05) 100%);
            border-radius: 16px;
            border: 1px solid rgba(255,23,68,0.15);
        }}
        .info-title {{
            font-size: 1.4em;
            font-weight: 700;
            background: linear-gradient(135deg, #fff 0%, var(--hot-pink) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 15px;
            letter-spacing: 1px;
        }}
        .link-box {{
            display: flex;
            gap: 12px;
            align-items: center;
        }}
        .link-input {{
            flex: 1;
            padding: 14px 20px;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 12px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-family: monospace;
            font-size: 0.9em;
            transition: all 0.3s;
        }}
        .link-input:focus {{
            border-color: var(--accent);
            box-shadow: 0 0 15px var(--accent-glow);
            outline: none;
        }}
        .copy-btn {{
            padding: 14px 25px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--accent) 0%, var(--hot-pink) 100%);
            color: #fff;
            cursor: pointer;
            font-weight: 700;
            font-size: 0.9em;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 15px rgba(255,23,68,0.3);
        }}
        .copy-btn:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(255,23,68,0.5);
        }}
        .video-stats {{
            display: flex;
            gap: 25px;
            margin-top: 15px;
            color: #888;
            font-size: 0.9em;
        }}
        .stat-item {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .stat-item i {{
            color: var(--accent);
        }}
        /* Mobile Responsive Styles for Watch Page */
        @media (max-width: 992px) {{
            body {{ padding: 15px; }}
            .header {{ padding: 15px 20px; margin-bottom: 20px; }}
            .video-wrapper {{ max-width: 100%; }}
        }}

        @media (max-width: 768px) {{
            body {{ padding: 0; }}
            .header {{ 
                border-radius: 0; 
                margin-bottom: 0; 
                border-left: none; 
                border-right: none;
                border-top: none;
                padding: 12px 15px;
                position: sticky;
                top: 0;
                z-index: 100;
            }}
            .logo {{ font-size: 1.2em; }}
            .title {{ display: none; }}
            .back-btn {{ 
                padding: 8px 15px; 
                font-size: 0.85em; 
            }}
            
            .video-wrapper {{ 
                border-radius: 0; 
                border-left: none; 
                border-right: none;
                box-shadow: none;
            }}
            
            .video-container video {{ 
                max-height: 100vh;
                background: #000;
            }}
            
            .info-section {{ 
                margin: 20px 15px; 
                padding: 15px;
                border-radius: 12px;
            }}
            
            .info-title {{ font-size: 1.1em; }}
            .link-box {{ flex-direction: column; align-items: stretch; }}
            .copy-btn {{ width: 100%; }}
            
            .controls {{
                padding: 0 15px;
                gap: 10px;
            }}
            .control-btn {{
                flex: 1;
                padding: 12px;
                font-size: 0.85em;
                border-radius: 12px;
            }}
            
            .video-stats {{
                flex-wrap: wrap;
                gap: 15px;
                font-size: 0.8em;
            }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">🔥 X-STREAM</div>
        <div class="title">{display_name}</div>
        <a href="/" class="back-btn"><i class="fas fa-arrow-left"></i> Back</a>
    </div>
    
    <div class="video-wrapper">
        <div class="video-container">
            <video controls autoplay playsinline>
                <source src="{video_url}" type="video/mp4">
                Your browser does not support this video
            </video>
            <div class="video-overlay"></div>
        </div>
    </div>
    
    <div class="controls">
        <button class="control-btn primary" onclick="toggleFullscreen()"><i class="fas fa-expand"></i> Fullscreen</button>
        <button class="control-btn" onclick="downloadVideo()"><i class="fas fa-download"></i> Download</button>
    </div>
    
    <div class="info-section">
        <div class="info-title"><i class="fas fa-share-alt"></i> Share Video</div>
        <div class="link-box">
            <input type="text" class="link-input" id="videoLink" value="http://{get_local_ip()}:{PORT}/watch?video={quote(video_name, safe='')}" readonly>
            <button class="copy-btn" onclick="copyLink()"><i class="fas fa-copy"></i> Copy</button>
        </div>
        <div class="video-stats">
            <div class="stat-item"><i class="fas fa-play-circle"></i> Now Playing</div>
            <div class="stat-item"><i class="fas fa-video"></i> HD Quality</div>
            <div class="stat-item"><i class="fas fa-shield-alt"></i> Private</div>
        </div>
    </div>
    
    <script>
        function toggleFullscreen() {{
            const container = document.querySelector('.video-wrapper');
            if (!document.fullscreenElement) {{
                container.requestFullscreen().catch(err => console.log(err));
            }} else {{
                document.exitFullscreen();
            }}
        }}
        
        function downloadVideo() {{
            const videoSrc = document.querySelector('video source').src;
            const videoName = decodeURIComponent(videoSrc.split('/video/')[1]);
            window.location.href = '/download/' + encodeURIComponent(videoName);
        }}
        
        function copyLink() {{
            const input = document.getElementById('videoLink');
            input.select();
            document.execCommand('copy');
            const btn = document.querySelector('.copy-btn');
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.style.background = 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)';
            setTimeout(() => {{
                btn.innerHTML = original;
                btn.style.background = '';
            }}, 2000);
        }}
    </script>
</body>
</html>'''
            self.wfile.write(watch_html.encode('utf-8'))
            
        elif self.path.startswith('/download/'):
            video_name = unquote(self.path[10:])
            video_path = os.path.join(VIDEO_FOLDER, video_name)
            
            if os.path.exists(video_path) and os.path.isfile(video_path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Disposition', f'attachment; filename="{video_name}"')
                self.send_header('Content-Length', str(os.path.getsize(video_path)))
                self.end_headers()
                
                with open(video_path, 'rb') as f:
                    chunk_size = 64 * 1024
                    while True:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            else:
                self.send_error(404, "Video not found")
                
        elif self.path.startswith('/video/'):
            video_name = unquote(self.path[7:])
            video_path = os.path.join(VIDEO_FOLDER, video_name)
            
            if os.path.exists(video_path) and os.path.isfile(video_path):
                ext = os.path.splitext(video_path)[1].lower()
                content_type = {
                    '.mp4': 'video/mp4',
                    '.webm': 'video/webm',
                    '.ogg': 'video/ogg',
                    '.mkv': 'video/x-matroska',
                    '.avi': 'video/x-msvideo',
                    '.mov': 'video/quicktime',
                    '.wmv': 'video/x-ms-wmv',
                    '.flv': 'video/x-flv',
                    '.m4v': 'video/mp4',
                    '.mpg': 'video/mpeg',
                    '.mpeg': 'video/mpeg',
                }.get(ext, 'application/octet-stream')
                
                file_size = os.path.getsize(video_path)
                
                if 'Range' in self.headers:
                    range_header = self.headers['Range']
                    range_start, range_end = range_header.replace('bytes=', '').split('-')
                    range_start = int(range_start) if range_start else 0
                    range_end = int(range_end) if range_end else file_size - 1
                    
                    self.send_response(206)
                    self.send_header('Content-Length', str(range_end - range_start + 1))
                    self.send_header('Content-Range', f'bytes {range_start}-{range_end}/{file_size}')
                    self.send_header('Content-type', content_type)
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()
                    
                    with open(video_path, 'rb') as f:
                        f.seek(range_start)
                        remaining = range_end - range_start + 1
                        chunk_size = 64 * 1024  # 64KB chunks
                        while remaining > 0:
                            chunk = f.read(min(chunk_size, remaining))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                else:
                    self.send_response(200)
                    self.send_header('Content-Length', str(file_size))
                    self.send_header('Content-type', content_type)
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()
                    with open(video_path, 'rb') as f:
                        chunk_size = 64 * 1024  # 64KB chunks
                        while True:
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
            else:
                self.send_error(404, "Video not found")
                
        elif self.path.startswith('/thumbnail/'):
            video_name = unquote(self.path[11:])
            video_path = os.path.join(VIDEO_FOLDER, video_name)
            
            if os.path.exists(video_path) and os.path.isfile(video_path):
                thumbnail_path = get_thumbnail(video_path)
                
                if thumbnail_path and os.path.exists(thumbnail_path):
                    self.send_response(200)
                    self.send_header('Content-type', 'image/jpeg')
                    self.send_header('Cache-Control', 'max-age=86400')
                    self.end_headers()
                    with open(thumbnail_path, 'rb') as f:
                        self.wfile.write(f.read())
                else:
                    self.send_response(200)
                    self.send_header('Content-type', 'image/svg+xml')
                    self.end_headers()
                    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
                        <rect width="320" height="180" fill="#333"/>
                        <circle cx="160" cy="90" r="40" fill="#667eea"/>
                        <polygon points="145,70 145,110 185,90" fill="#fff"/>
                    </svg>'''
                    self.wfile.write(svg.encode('utf-8'))
            else:
                self.send_error(404, "Video not found")

        elif self.path.startswith('/preview/'):
            video_name = unquote(self.path[9:])
            video_path = os.path.join(VIDEO_FOLDER, video_name)
            
            if os.path.exists(video_path) and os.path.isfile(video_path):
                preview_path = get_preview(video_path)
                
                if preview_path and os.path.exists(preview_path):
                    self.send_response(200)
                    self.send_header('Content-type', 'video/mp4')
                    self.send_header('Cache-Control', 'max-age=86400')
                    self.send_header('Content-Length', str(os.path.getsize(preview_path)))
                    self.end_headers()
                    with open(preview_path, 'rb') as f:
                        self.wfile.write(f.read())
                else:
                    self.send_error(404, "Preview not available")
            else:
                self.send_error(404, "Video not found")
        else:
            super().do_GET()
    
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")

if __name__ == '__main__':
    local_ip = get_local_ip()
    
    print("=" * 60)
    print("🎬 Local Media Server")
    print("=" * 60)
    print(f"📁 Video Folder: {VIDEO_FOLDER}")
    print(f"🌐 Local Access: http://localhost:{PORT}")
    print(f"🌐 Network Access: http://{local_ip}:{PORT}")
    print("=" * 60)
    print("📱 Open the link on any device on the network")
    print("⛔ Press Ctrl+C to stop the server")
    print("=" * 60)
    
    videos = list_videos()
    print(f"✅ Found {len(videos)} videos")
    for v in videos:
        print(f"   • {v}")
    print("=" * 60)
    
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), MediaHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n⛔ Server stopped")
