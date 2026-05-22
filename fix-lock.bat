@echo off
cd /d "%~dp0"
echo Deleting lock file and node_modules...
if exist package-lock.json del /F /Q package-lock.json
if exist node_modules rmdir /S /Q node_modules
echo Reinstalling dependencies...
call npm install
echo Pushing changes...
git add package-lock.json
git commit -m "Fix package-lock.json missing dependencies"
git push
echo Done!
