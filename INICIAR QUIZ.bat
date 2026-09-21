@echo off
pushd "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  start "Servidor do Quiz" /min py -m http.server 8780
) else (
  start "Servidor do Quiz" /min python -m http.server 8780
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8780/"
popd
exit
