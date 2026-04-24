@echo off
REM Windows Setup Script for PDF Auto-Print System
REM Validates folder structure and Illustrator script installation

title PDF Auto-Print System - Windows Setup

echo ================================================================
echo PDF Auto-Print System - Windows Setup
echo ================================================================
echo.
echo This setup will:
echo - Check folder structure
echo - Validate Illustrator installation
echo - Provide installation instructions
echo.
pause

REM Configuration - MODIFY THESE PATHS FOR YOUR SYSTEM
set "TO_PRINT_FOLDER=D:\TRABAJOS\2025\ARMADOS VT\TO_PRINT"
set "ARCHIVED_FOLDER=%TO_PRINT_FOLDER%\ARCHIVED"

echo.
echo ================================================================
echo 1. CHECKING FOLDER STRUCTURE
echo ================================================================

REM Check if TO_PRINT folder exists
if exist "%TO_PRINT_FOLDER%" (
    echo [OK] TO_PRINT folder exists: %TO_PRINT_FOLDER%
) else (
    echo [ERROR] TO_PRINT folder does not exist: %TO_PRINT_FOLDER%
    echo Please create this folder manually before proceeding.
    echo.
    pause
    exit /b 1
)

REM Create ARCHIVED folder if it doesn't exist
if exist "%ARCHIVED_FOLDER%" (
    echo [OK] ARCHIVED folder exists: %ARCHIVED_FOLDER%
) else (
    echo [INFO] Creating ARCHIVED folder...
    mkdir "%ARCHIVED_FOLDER%" 2>nul
    if exist "%ARCHIVED_FOLDER%" (
        echo [OK] ARCHIVED folder created: %ARCHIVED_FOLDER%
    ) else (
        echo [ERROR] Could not create ARCHIVED folder. Please check permissions.
        pause
        exit /b 1
    )
)

REM Test write permissions
echo. > "%TO_PRINT_FOLDER%\test_permission.tmp" 2>nul
if exist "%TO_PRINT_FOLDER%\test_permission.tmp" (
    del "%TO_PRINT_FOLDER%\test_permission.tmp" >nul 2>&1
    echo [OK] Write permissions confirmed for TO_PRINT folder
) else (
    echo [ERROR] No write permission for TO_PRINT folder. Please check permissions.
    pause
    exit /b 1
)

echo.
echo ================================================================
echo 2. CHECKING ILLUSTRATOR INSTALLATION
echo ================================================================

REM Check for Adobe Illustrator installation
set "AI_FOUND=0"
set "AI_VERSION="

REM Check common installation paths
if exist "C:\Program Files\Adobe\Adobe Illustrator 2024\" (
    set "AI_FOUND=1"
    set "AI_VERSION=2024"
    set "AI_PATH=C:\Program Files\Adobe\Adobe Illustrator 2024\"
) else if exist "C:\Program Files\Adobe\Adobe Illustrator 2023\" (
    set "AI_FOUND=1"
    set "AI_VERSION=2023"
    set "AI_PATH=C:\Program Files\Adobe\Adobe Illustrator 2023\"
) else if exist "C:\Program Files\Adobe\Adobe Illustrator CC\" (
    set "AI_FOUND=1"
    set "AI_VERSION=CC"
    set "AI_PATH=C:\Program Files\Adobe\Adobe Illustrator CC\"
) else if exist "C:\Program Files (x86)\Adobe\Adobe Illustrator 2024\" (
    set "AI_FOUND=1"
    set "AI_VERSION=2024"
    set "AI_PATH=C:\Program Files (x86)\Adobe\Adobe Illustrator 2024\"
) else if exist "C:\Program Files (x86)\Adobe\Adobe Illustrator 2023\" (
    set "AI_FOUND=1"
    set "AI_VERSION=2023"
    set "AI_PATH=C:\Program Files (x86)\Adobe\Adobe Illustrator 2023\"
)

if %AI_FOUND%==1 (
    echo [OK] Adobe Illustrator %AI_VERSION% found at: %AI_PATH%
) else (
    echo [WARNING] Adobe Illustrator not found in standard locations.
    echo Please verify Illustrator is installed and note its installation path.
)

echo.
echo ================================================================
echo 3. SETUP INSTRUCTIONS
echo ================================================================

echo.
echo ILLUSTRATOR SCRIPT INSTALLATION:
echo.
echo The illustrator_save.jsx script needs to be accessible from Illustrator.
echo.
echo OPTION 1 - Scripts Folder (Recommended):
echo 1. Copy "illustrator_save.jsx" to:

if %AI_FOUND%==1 (
    echo    "%AI_PATH%Presets\Scripts\"
) else (
    echo    "[Your Illustrator Installation]\Presets\Scripts\"
)

echo 2. Restart Adobe Illustrator
echo 3. Access via File ^> Scripts ^> illustrator_save
echo.
echo OPTION 2 - Custom Location:
echo 1. Place "illustrator_save.jsx" anywhere on your computer
echo 2. In Illustrator: File ^> Scripts ^> Other Script...
echo 3. Browse and select the illustrator_save.jsx file
echo.
echo KEYBOARD SHORTCUT SETUP:
echo 1. In Illustrator, go to Edit ^> Keyboard Shortcuts
echo 2. Create new shortcut set or edit existing
echo 3. Assign shortcut to your script (e.g., Ctrl+Shift+S)
echo.
echo SCRIPT CONFIGURATION:
echo Edit the paths in illustrator_save.jsx if needed:
echo - WIN_TO_PRINT_FOLDER should match: %TO_PRINT_FOLDER%
echo.

echo ================================================================
echo 4. WINDOWS-SPECIFIC NOTES
echo ================================================================
echo.
echo IMPORTANT: The PDF auto-print functionality (pdf_autoprint.scpt)
echo is designed for macOS only, as it uses AppleScript for system
echo integration and print dialog control.
echo.
echo For Windows PDF auto-printing, you would need:
echo - Alternative solution using PowerShell or VBScript
echo - Third-party PDF printing tools
echo - Different approach for print preset management
echo.
echo The Illustrator script (illustrator_save.jsx) works perfectly
echo on Windows and will save your PDFs to the TO_PRINT folder.
echo.

echo ================================================================
echo SETUP COMPLETE
echo ================================================================
echo.

if %AI_FOUND%==1 (
    echo [✓] Folder structure validated
    echo [✓] Illustrator installation confirmed
    echo [✓] Ready to install illustrator_save.jsx script
) else (
    echo [✓] Folder structure validated
    echo [!] Please verify Illustrator installation
    echo [!] Adjust script paths if necessary
)

echo.
echo Next steps:
echo 1. Install illustrator_save.jsx in Illustrator (see instructions above)
echo 2. Configure keyboard shortcut for the script
echo 3. Test the script with a sample Illustrator document
echo.
echo For PDF auto-printing on Windows, consider alternative solutions
echo or use the macOS version of this system.
echo.

pause

REM Optional: Open the TO_PRINT folder
choice /c YN /m "Would you like to open the TO_PRINT folder now? (Y/N)"
if %errorlevel%==1 (
    explorer "%TO_PRINT_FOLDER%"
)