@echo off
REM simple_push.bat - add, commit and push with minimal interaction
cd /d "%~dp0"
echo Working directory: %CD%
echo.
echo Staging all changes...
git add .
echo Committing with fixed message...
git commit -m "Update site" 2>nul || echo No changes to commit.
echo Pushing to origin main...
git push origin main
if errorlevel 1 (
  echo.
  echo Push failed. If authentication is required, open PowerShell and run the following command to authenticate:
  echo git push origin main
  echo Then follow the browser or credential prompt.
) else (
  echo Push succeeded.
)
pause
