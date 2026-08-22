@echo off
setlocal enabledelayedexpansion
title Video Editor AI - Chia se Online

echo ======================================================================
echo          VIDEO EDITOR AI - CHIA SE DUNG CHUNG CHO MOI NGUOI
echo ======================================================================
echo.

:: 1. Hien thi dia chi mang noi bo (LAN / Wi-Fi)
echo [1] DIA CHI TRUY CAP NOI BO (Dung chung mang Wi-Fi):
echo     - Dien thoai / Laptop trong cung mang Wi-Fi truy cap:
echo       https://192.168.21.104:9090
echo.

:: 2. Kiem tra va tai Cloudflare Tunnel neu chua co
echo [2] KHOI TAO DUONG TRUYEN INTERNET (Moi nguoi o bat cu dau deu vao duoc):
if not exist "%~dp0cloudflared.exe" (
    echo     Dang tai cong cu Cloudflare Tunnel (chi tai 1 lan duy nhat, xin cho vai giay)...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
    if not exist "%~dp0cloudflared.exe" (
        echo     [!] Khong the tai cloudflared.exe tu dong.
        echo     Vui long kiem tra ket noi mang.
        pause
        exit /b 1
    )
    echo     [OK] Da tai xong!
)

echo.
echo ======================================================================
echo  DANG TAO LINK ONLINE... (Xin cho khoang 5-10 giay)
echo  Khi xuat hien dong chu dang: 
echo  https://xxxxxx.trycloudflare.com
echo  Hay copy duong link do gui cho moi nguoi de su dung nhe!
echo ======================================================================
echo.

"%~dp0cloudflared.exe" tunnel --url https://localhost:9090 --no-tls-verify
pause
