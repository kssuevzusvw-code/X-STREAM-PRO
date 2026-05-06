import requests
import sys
import os
import re
import time
import json
from tqdm import tqdm
from urllib.parse import urlparse, parse_qs, unquote
from bs4 import BeautifulSoup
import subprocess

# Global flag for machine-readable output
JSON_MODE = "--json" in sys.argv

def report_progress(item_id, percent, status="downloading", eta="", speed=""):
    if JSON_MODE:
        id_str = item_id if item_id else "direct"
        print(f"PROGRESS|{id_str}|{percent}|{status}|{eta}|{speed}", flush=True)

def report_log(msg):
    if JSON_MODE:
        print(f"LOG|{msg}", flush=True)
    else:
        print(f"ℹ️ {msg}")

def report_filename(item_id, filename):
    if JSON_MODE and item_id:
        print(f"FILENAME|{item_id}|{filename}", flush=True)

def download_one(input_url, custom_name=None, item_id=None):
    input_url = input_url.strip().strip('"').strip("'")
    if not input_url: return
    
    # Ensure downloads folder exists
    save_dir = "downloads"
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    video_url = input_url
    referer = "https://www.google.com/"
    title = custom_name

    report_progress(item_id, 0, "starting")

    # Disabled: Do not unwrap URL params - we want Node proxy URLs to remain intact so we can pipe through local proxy.
    
    if referer == "https://www.google.com/":
        if "3dporndude" in video_url: referer = "https://3dporndude.com/"
        elif "phncdn.com" in video_url: referer = "https://www.pornhub.com/"
        elif "xnxx-cdn" in video_url: referer = "https://www.xnxx.com/"
        elif "xv-cdn" in video_url: referer = "https://www.xvideos.com/"
        elif "xhcdn" in video_url: referer = "https://xhamster.com/"

    if not title:
        path_segments = urlparse(video_url).path.split('/')
        title = path_segments[-1] if path_segments[-1] else "video"
        if "?" in title: title = title.split('?')[0]
    
    clean_name = re.sub(r'[\\/:*?"<>|]', '_', title).strip()
    if not clean_name: clean_name = f"video_{int(time.time())}"
    if not clean_name.lower().endswith(('.mp4', '.webm', '.ts', '.mkv')):
        clean_name += ".mp4"
        
    # Truncate title if too long to avoid Windows 260-char path limit
    if len(clean_name) > 200:
        base, extension = os.path.splitext(clean_name)
        clean_name = base[:190] + extension

    abs_path = os.path.abspath(os.path.join(save_dir, clean_name))
    if os.name == 'nt' and not abs_path.startswith('\\\\?\\'):
        save_path = '\\\\?\\' + abs_path
    else:
        save_path = abs_path
        
    temp_path = save_path + '.tmp'  # Use temp file during download
    report_filename(item_id, clean_name)

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        'Cookie': 'age_verified=1; bs=s; platform=pc; ffVisitorId=1; _h1s=true; _h1c=true; m=1; w=1920; h=1080; c=24; il_vw=1; hasVisited=1; _h1d=true; PHPSESSID=1; credentials=1; gPconsent=CP; ADBLOCK=false; bs=1; desktopClickPosition=1; mediapref=MP4; entryOrigin=1; _h1x=true'
    }
    
    # Special handling for Pornhub - they need fresh cookies
    if 'phncdn.com' in video_url or 'pornhub' in referer.lower():
        headers['Cookie'] = 'age_verified=1; platform=pc; bs=s; m=1; w=1920; h=1080; c=24; il_vw=1; hasVisited=1; _h1d=true; mediapref=MP4; entryOrigin=1'
        headers['Origin'] = 'https://www.pornhub.com'

    if not JSON_MODE:
        print(f"\n📂 [{clean_name}]")
        print(f"📡 Link: {video_url}")

    try:
        is_m3u8 = ".m3u8" in video_url.lower() or "m3u8" in video_url.lower()
        
        if is_m3u8:
            if not JSON_MODE: print(f"🎬 HLS Detection (M3U8) - Using FFmpeg...")
            
            ffmpeg_path = os.path.join(os.getcwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
            if not os.path.exists(ffmpeg_path):
                ffmpeg_path = "ffmpeg"
            
            headers_str = f"Referer: {referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n"
            
            ffmpeg_cmd = [
                ffmpeg_path, "-hide_banner", "-stats",
                "-headers", headers_str,
                "-i", video_url,
                "-c", "copy", "-bsf:a", "aac_adtstoasc", "-y",
                save_path
            ]
            
            process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=False)
            
            pbar = None
            total_duration = None

            def get_seconds(time_str):
                try:
                    parts = time_str.split(':')
                    if len(parts) == 3:
                        h, m, s = parts
                        return int(h) * 3600 + int(m) * 60 + float(s)
                except: pass
                return 0

            buffer = ""
            last_pct = -1
            while True:
                char = process.stdout.read(1)
                if not char and process.poll() is not None:
                    break
                try:
                    char = char.decode('utf-8')
                except: continue

                buffer += char
                if char == '\r' or char == '\n':
                    line = buffer
                    buffer = ""
                    
                    if "Duration:" in line and not total_duration:
                        match = re.search(r"Duration: (\d+:\d+:\d+\.?\d*)", line)
                        if match:
                            total_duration = get_seconds(match.group(1))
                            if total_duration > 0 and not JSON_MODE:
                                pbar = tqdm(total=int(total_duration), unit='s', desc="💾 Progress", ascii=' █', dynamic_ncols=True)

                    if "time=" in line:
                        match = re.search(r"time=(\d+:\d+:\d+\.?\d*)", line)
                        if match:
                            current_seconds = get_seconds(match.group(1))
                            if total_duration and total_duration > 0:
                                percent = int((current_seconds / total_duration) * 100)
                                if percent > last_pct:
                                    # Extract speed from FFmpeg output (e.g., speed= 2.4x)
                                    speed_match = re.search(r'speed=\s*([\d.]+)x', line)
                                    speed_val = float(speed_match.group(1)) if speed_match else 0
                                    speed_str = f"{speed_val}x" if speed_val > 0 else ""
                                    
                                    eta_str = ""
                                    if speed_val > 0:
                                        rem_s = (total_duration - current_seconds) / speed_val
                                        eta_str = f"{int(rem_s // 60)}m {int(rem_s % 60)}s" if rem_s > 60 else f"{int(rem_s)}s"

                                    report_progress(item_id, percent, speed=speed_str, eta=eta_str)
                                    last_pct = percent
                                if pbar:
                                    pbar.n = min(int(current_seconds), int(total_duration))
                                    pbar.refresh()
            
            process.wait()
            if pbar: pbar.close()
            
            if process.returncode == 0:
                report_progress(item_id, 100, "completed")
                if not JSON_MODE: print(f"✅ Download Finished!")
            else:
                report_progress(item_id, 0, "error")
                raise Exception("FFmpeg failed")

        else:
            report_log(f"Starting direct download: {video_url[:100]}...")
            response = requests.get(video_url, headers=headers, stream=True, timeout=60)
            
            # Debug logging for Pornhub issues
            if 'phncdn.com' in video_url:
                report_log(f"Pornhub response status: {response.status_code}")
                report_log(f"Pornhub response headers: {dict(response.headers)}")
                if response.status_code != 200:
                    report_log(f"Pornhub response body preview: {response.text[:200]}")
            
            response.raise_for_status()
            report_log(f"Connection successful, size: {response.headers.get('content-length', 'unknown')}")
            
            total_size = int(response.headers.get('content-length', 0))
            if not JSON_MODE:
                t = tqdm(total=total_size, unit='iB', unit_scale=True, desc="💾 Progress", ascii=' █', dynamic_ncols=True)
            
            downloaded = 0
            start_time = time.time()
            last_report_time = 0
            
            with open(temp_path, 'wb') as f:
                for data in response.iter_content(1024 * 64):
                    if data:
                        f.write(data)
                        f.flush()
                        downloaded += len(data)
                        
                        current_time = time.time()
                        if total_size > 0 and current_time - last_report_time > 0.5:
                            last_report_time = current_time
                            percent = int((downloaded / total_size) * 100)
                            
                            # Calculate speed and ETA
                            elapsed = current_time - start_time
                            speed_bps = downloaded / elapsed if elapsed > 0 else 0
                            speed_mbps = (speed_bps * 8) / (1024 * 1024)
                            speed_str = f"{speed_mbps:.1f} Mbps"
                            
                            remaining_bytes = total_size - downloaded
                            eta_s = remaining_bytes / speed_bps if speed_bps > 0 else 0
                            eta_str = f"{int(eta_s // 60)}m {int(eta_s % 60)}s" if eta_s > 60 else f"{int(eta_s)}s"
                            
                            report_progress(item_id, percent, speed=speed_str, eta=eta_str)
                            
                        if not JSON_MODE: t.update(len(data))
            
            # Atomic rename only after successful download
            os.replace(temp_path, save_path)
            
            if not JSON_MODE: t.close()
            
            # Validate downloaded file
            if os.path.exists(save_path):
                file_size = os.path.getsize(save_path)
                if not JSON_MODE: print(f"📊 File size: {file_size} bytes")
                
                # Check if file is too small (likely an error page)
                if file_size < 10000:  # Less than 10KB is suspicious
                    report_progress(item_id, 0, "error")
                    os.remove(save_path)
                    if not JSON_MODE: print(f"❌ File too small, likely corrupted. Deleted.")
                    raise Exception("Downloaded file is too small, likely an error page")
                
                # Check if file starts with HTML (indicates error page)
                with open(save_path, 'rb') as f:
                    header = f.read(100).lower()
                    if b'<!doctype' in header or b'<html' in header:
                        report_progress(item_id, 0, "error")
                        os.remove(save_path)
                        if not JSON_MODE: print(f"❌ File is HTML error page. Deleted.")
                        raise Exception("Downloaded file is HTML, not video")
            
            report_progress(item_id, 100, "completed")
            if not JSON_MODE: print(f"✅ Download Finished!")

    except Exception as e:
        report_progress(item_id, 0, "error")
        # Special logging for Pornhub errors
        if 'phncdn.com' in video_url or 'pornhub' in referer.lower():
            report_log(f"Pornhub download failed: {str(e)}")
            report_log(f"Pornhub URL: {video_url[:100]}...")
            report_log(f"Pornhub referer used: {referer}")
        # Clean up partial/temp files
        for path in [save_path, temp_path]:
            if os.path.exists(path):
                try:
                    os.remove(path)
                    if not JSON_MODE: print(f"🗑️ Deleted incomplete file: {path}")
                except:
                    pass
        if not JSON_MODE: print(f"❌ Error: {e}")

if __name__ == "__main__":
    tasks = []

    if JSON_MODE:
        # Read JSON from stdin
        try:
            line = sys.stdin.readline()
            if line:
                data = json.loads(line)
                if isinstance(data, list):
                    tasks = data
                elif isinstance(data, dict) and "items" in data:
                    tasks = data["items"]
                report_log(f"Received {len(tasks)} tasks via JSON")
        except Exception as e:
            report_log(f"JSON Parse Error: {e}")
            sys.exit(1)
    else:
        print("=" * 60)
        print("        🚀 X-STREAM BULK DOWNLOADER (PRO V3)        ")
        print("=" * 60)
        print("\n🔗 Paste the copied lines below (Ctrl+Z and Enter when done):")
        
        user_input_lines = []
        while True:
            try:
                line = input()
                user_input_lines.append(line)
            except EOFError:
                break
        
        full_text = "\n".join(user_input_lines)
        
        # Original detection logic for manual mode
        pairs = re.findall(r"(?:file name|title):\s*(.*?)\s*[\r\n]+\s*link:\s*(.*?)(?:[\r\n]+|$)", full_text, re.IGNORECASE | re.DOTALL)
        if pairs:
            for name, link in pairs:
                tasks.append({'name': name.split('\n')[0].strip(), 'link': link.strip(), 'id': None})
        
        if not tasks:
            lines = [l.strip() for l in user_input_lines if l.strip()]
            for i in range(len(lines) - 1):
                if not lines[i].startswith("http") and lines[i+1].startswith("http"):
                    tasks.append({'name': lines[i], 'link': lines[i+1], 'id': None})
        
        if not tasks:
            for w in full_text.split():
                if w.startswith("http"):
                    tasks.append({'name': None, 'link': w.strip(), 'id': None})

    if not tasks:
        if not JSON_MODE: print("⚠ No valid links detected.")
    else:
        # Deduplicate
        seen_links = set()
        unique_tasks = []
        for t in tasks:
            t_url = t.get('link') or t.get('url')
            if t_url and t_url not in seen_links:
                seen_links.add(t_url)
                unique_tasks.append(t)
        tasks = unique_tasks

        if not JSON_MODE: print(f"\n📈 Total tasks: {len(tasks)}")
        
        for i, task in enumerate(tasks):
            if not JSON_MODE: print(f"\n" + "-"*30 + f" Task {i+1}/{len(tasks)} " + "-"*30)
            target_url = task.get('link') or task.get('url')
            if target_url:
                download_one(target_url, task.get('name') or task.get('title'), task.get('id'))
            
            if i < len(tasks) - 1:
                time.sleep(1)
            
        if not JSON_MODE:
            print("\n" + "="*60)
            print("🎯 ALL DOWNLOADS FINISHED!")
            print("="*60)
            input("\nPress Enter to close...")
