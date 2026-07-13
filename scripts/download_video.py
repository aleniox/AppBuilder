import sys
import yt_dlp
import sys
import io

# Fix unicode encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def download_video(url):
    ydl_opts = {
        'outtmpl': '%(title)s.%(ext)s',
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        # Thêm các header giả lập trình duyệt nếu trang web chặn bot
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://phimmoi.kim/'
        }
    }
    print(f"Đang tải video từ: {url}")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([url])
            print("Tải video thành công!")
        except Exception as e:
            print(f"Lỗi khi tải video: {e}")
            print("\nLưu ý: Đối với các trang web xem phim, có thể bạn cần truyền trực tiếp link m3u8.")
            print("Cách lấy link m3u8: Nhấn F12 -> Network (Mạng) -> Lọc chữ 'm3u8' -> Chạy video -> Copy link m3u8 và chạy lại script với link đó.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Sử dụng: python download_video.py <video_url>")
        sys.exit(1)
    
    video_url = sys.argv[1]
    download_video(video_url)
