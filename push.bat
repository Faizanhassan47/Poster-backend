@echo off
echo Pushing backend code to GitHub...
cd /d "%~dp0"
git init
git remote remove origin 2>nul
git remote add origin https://github.com/Faizanhassan47/Poster-backend.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
echo Done!
pause
