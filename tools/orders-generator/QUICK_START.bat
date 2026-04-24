@echo off
echo ============================================================
echo PDF Reference Sheet Generator - Quick Start
echo ============================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH!
    echo.
    echo Please install Python from https://python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
)

echo Python found:
python --version
echo.

REM Check if dependencies are installed
echo Checking dependencies...
pip show reportlab >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
    echo.
) else (
    echo Dependencies already installed.
    echo.
)

REM Create sample template if it doesn't exist
if not exist sample_order.xlsx (
    echo Creating sample Excel template...
    python create_sample_excel.py
    echo.
)

echo ============================================================
echo Setup complete!
echo ============================================================
echo.
echo Next steps:
echo 1. Edit sample_order.xlsx with your order data
echo 2. Run: python generate_reference.py sample_order.xlsx
echo.
echo Or drag and drop your Excel file onto generate_reference.py
echo.
pause
