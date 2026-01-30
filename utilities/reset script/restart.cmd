@echo off

echo Killing ComfyUI...
for /f "tokens=2" %%a in ('tasklist ^| findstr /i "python.exe"') do (
    wmic process where processid=%%a get commandline | findstr /i "ComfyUI" >nul
    if not errorlevel 1 (
        echo Killing PID %%a
        taskkill /PID %%a /F
    )
)

echo Starting ComfyUI...
CALL "C:\Miniconda3\Scripts\activate.bat" comfy
cd /d D:\programovani\comfy\ComfyUI
python main.py --listen 0.0.0.0 --port 8188
