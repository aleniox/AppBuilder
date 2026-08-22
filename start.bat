@echo off
cd /d "%~dp0"

echo ====================================
echo  Video Editor - Khoi dong he thong
echo ====================================
echo.

:: Kiem tra Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python chua duoc cai dat. Tai tai: https://python.org
    pause
    exit /b 1
)

:: Cai dat dependencies
echo [1/3] Cai dat dependencies...
uv sync

:: Chay backend
echo [2/3] Khoi dong backend HTTPS (port 9090)...
start "Video Editor Backend" cmd /c "cd /d "%~dp0backend" && uv run python main.py"

:: Cho backend chay
timeout /t 3 /nobreak >nul

:: Mo frontend
echo [3/3] Mo frontend...
start "" "https://localhost:9090/"

echo.
echo ====================================
echo  He thong da khoi dong!
echo  - Backend: https://localhost:9090
echo  - Frontend: da mo trong trinh duyet
echo  - API docs: https://localhost:9090/docs
echo ====================================
echo.
echo Nhan Ctrl+C trong cua so backend de dung.
pause
