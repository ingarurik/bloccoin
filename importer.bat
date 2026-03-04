@echo off
REM importer.bat - helper to add/commit/push the site to GitHub (bloccoin)
REM Place this file in the "site" folder and double-click it or run from PowerShell

REM Work in the script directory
cd /d "%~dp0"
echo Working directory: %CD%

echo.
echo Checking for Git...
git --version >nul 2>&1
if errorlevel 1 (
  echo Git n'est pas installe ou n'est pas dans le PATH.
  echo Installe Git depuis https://git-scm.com/download/win puis relance ce script.
  pause
  exit /b 1
)

REM Create a minimal .gitignore if it doesn't exist
if not exist ".gitignore" (
  echo # Minimal .gitignore for Bloc-Coin > .gitignore
  echo # Ignore OS files >> .gitignore
  echo Thumbs.db >> .gitignore
  echo desktop.ini >> .gitignore
  echo .DS_Store >> .gitignore
  echo # Node modules (if any) >> .gitignore
  echo node_modules/ >> .gitignore
  echo .gitignore created.
) else (
  echo .gitignore already exists.
)

REM Ensure we're in a git repo; if not, initialize






























































pauseecho Une fois le deploiement "Succeeded", rafraichissez https://bloccoin.pages.dev (Ctrl+F5 si besoin).echo Ouvrez : https://dash.cloudflare.com/ puis Workers & Pages -> Pages -> votre projet -> Deployments pour suivre le deploiement.echo Cloudflare Pages devrait detecter le push et lancer un deploiement automatique.echo.)  echo Push reussi.) else (  exit /b 1  pause  echo Pour eviter les invites, configurez Git Credential Manager ou utilisez une cle SSH (recommande).  echo Si une authentification graphique ne s'ouvre pas, lancez PowerShell et essayez : git push -u origin main  echo Le push a echoue. Il se peut que vous deviez vous authentifier dans la fenetre qui s'ouvre.  echo.if errorlevel 1 (git push -u origin mainecho Pushing to GitHub (origin main)...)  echo Commit enregistre.) else (  echo Aucun changement a committer ou commit a echoue (peut-etre aucun changement).if errorlevel 1 (REM Commit (if no changes, this will fail harmlessly)
ngit commit -m "%CM%" 2>nulif "%CM%"=="" set "CM=Update site"set /p CM=Entrez le message de commit (ou appuyez sur Entrée pour utiliser "Update site"): REM Ask for commit messagegit add .echo Adding changed files...REM Stage all changesgit checkout -B mainecho Switching to branch 'main'...REM Ensure branch main exists and is current)  )    echo Remote origin is already correct.  ) else (    git remote add origin %REPO_URL%    git remote remove origin    echo Updating remote origin to %REPO_URL%...    echo Remote origin differs: %ORIGIN_URL%  if /I not "%ORIGIN_URL%"=="%REPO_URL%" () else (  git remote add origin %REPO_URL%  echo Adding remote origin %REPO_URL%...if "%ORIGIN_URL%"=="" (for /f "usebackq tokens=*" %%r in (`git remote get-url origin 2^>nul`) do set "ORIGIN_URL=%%r"set "REPO_URL=https://github.com/ingarurik/bloccoin.git"REM Set the remote origin to your GitHub repo (adjust if needed))  echo Git repository detected.) else (  git init  echo Initializing new git repository...if errorlevel 1 (ngit rev-parse --is-inside-work-tree >nul 2>&1