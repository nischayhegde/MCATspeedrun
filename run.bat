@echo off
pushd "%~dp0"

set PYTHONWARNINGS=default
set PYTHONPYCACHEPREFIX=out\pycache
set ANKIDEV=1
set QTWEBENGINE_REMOTE_DEBUGGING=8080
set QTWEBENGINE_CHROMIUM_FLAGS=--remote-allow-origins=http://localhost:8080
set ANKI_API_PORT=40000
set ANKI_API_HOST=127.0.0.1

rem Give the MCAT dev build its own single-instance key so it runs independently
rem of any regular Anki install (avoids "already running; reusing instance").
set ANKI_SINGLE_INSTANCE_KEY=mcat-dev

@if not defined PYENV set PYENV=out\pyenv
  
call tools\ninja pylib qt || exit /b 1

rem Default to the seeded MCAT profile (which holds the imported questions and
rem flashcards). Pass any args to override, e.g. run.bat -b <base> -p <profile>.
if "%~1"=="" (
    %PYENV%\Scripts\python tools\run.py -b out\mcat_base -p "User 1" || exit /b 1
) else (
    %PYENV%\Scripts\python tools\run.py %* || exit /b 1
)
popd
