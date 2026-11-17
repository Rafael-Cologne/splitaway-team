@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Splitaway Team: test APK build ===

rem Java: use the JDK bundled with Android Studio if JAVA_HOME is not set
if not defined JAVA_HOME if exist "C:\Program Files\Android\Android Studio\jbr" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"

rem Android SDK path for Gradle (local file, not committed)
if not exist "android\local.properties" (
  if exist "%LOCALAPPDATA%\Android\Sdk" (
    > "android\local.properties" echo sdk.dir=%LOCALAPPDATA:\=\\%\\Android\\Sdk
  ) else (
    echo Android SDK not found in %LOCALAPPDATA%\Android\Sdk - install Android Studio first.
    goto fail
  )
)

rem no telemetry question from Capacitor
call npx.cmd cap telemetry off >nul 2>&1

echo --- 1/2: copy web app into Android project
call npx.cmd cap sync android || goto fail

rem Android build fails if the path has non-latin letters ("Мои проекты").
rem Build through a temporary drive letter T: that points to this folder.
set "PROJ=%~dp0"
if "%PROJ:~-1%"=="\" set "PROJ=%PROJ:~0,-1%"
subst T: /d >nul 2>&1
subst T: "%PROJ%" || (echo Could not create drive T: & goto fail)

echo --- 2/2: build debug APK (via T:\)
pushd T:\android
call gradlew.bat assembleDebug
set "RC=%ERRORLEVEL%"
popd
cd /d "%~dp0"
subst T: /d >nul 2>&1
if not "%RC%"=="0" goto fail

copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "SplitawayTeam-test.apk" >nul
echo.
echo === SUCCESS: SplitawayTeam-test.apk is in the project folder ===
pause
exit /b 0

:fail
subst T: /d >nul 2>&1
echo.
echo === BUILD FAILED - send a screenshot of the lines above ===
pause
exit /b 1
