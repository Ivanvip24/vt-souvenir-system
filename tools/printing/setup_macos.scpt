(*
macOS Setup Script for PDF Auto-Print System
Validates folder structure, print presets, and system requirements
*)

-- Configuration
set watchFolder to "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
set archivedFolder to watchFolder & "/ARCHIVED"
set printPreset to "ADHESIVO"

on run
	display dialog "PDF Auto-Print System Setup" & return & return & "This will:" & return & "• Check folder structure" & return & "• Validate print preset" & return & "• Set up system requirements" buttons {"Cancel", "Continue"} default button "Continue" with icon note

	if button returned of result is "Continue" then
		set setupResults to performSetup()
		displaySetupResults(setupResults)
	end if
end run

on performSetup()
	set results to {}

	-- 1. Check and create folder structure
	set folderResult to setupFolders()
	set end of results to folderResult

	-- 2. Check print preset availability
	set presetResult to checkPrintPreset()
	set end of results to presetResult

	-- 3. Check system requirements
	set systemResult to checkSystemRequirements()
	set end of results to systemResult

	-- 4. Check Illustrator script installation location
	set illustratorResult to checkIllustratorSetup()
	set end of results to illustratorResult

	return results
end performSetup

-- Setup folder structure
on setupFolders()
	try
		-- Check if main watch folder exists
		tell application "Finder"
			if not (exists folder (watchFolder as POSIX file)) then
				return {success:false, component:"Folder Structure", message:"Watch folder does not exist: " & watchFolder & return & "Please create this folder manually."}
			end if

			-- Create ARCHIVED folder if it doesn't exist
			if not (exists folder (archivedFolder as POSIX file)) then
				try
					make new folder at (watchFolder as POSIX file) with properties {name:"ARCHIVED"}
				on error
					return {success:false, component:"Folder Structure", message:"Could not create ARCHIVED folder. Please check permissions."}
				end try
			end if

			-- Check write permissions
			try
				set testFile to (watchFolder & "/test_permission.tmp") as POSIX file
				close (open for access testFile with write permission)
				delete testFile
			on error
				return {success:false, component:"Folder Structure", message:"No write permission for watch folder. Please check folder permissions."}
			end try
		end tell

		return {success:true, component:"Folder Structure", message:"✓ Watch folder exists: " & watchFolder & return & "✓ ARCHIVED folder ready: " & archivedFolder & return & "✓ Write permissions confirmed"}

	on error errMsg
		return {success:false, component:"Folder Structure", message:"Error: " & errMsg}
	end try
end setupFolders

-- Check print preset availability
on checkPrintPreset()
	try
		-- This is a simplified check - in practice, print presets are system/printer specific
		-- We'll provide instructions for the user to verify manually

		set presetInstructions to "To verify ADHESIVO print preset:" & return & return & "1. Open any PDF in Preview" & return & "2. Press Cmd+P to open Print dialog" & return & "3. Check if 'ADHESIVO' appears in Presets dropdown" & return & return & "If ADHESIVO preset is not available:" & return & "• Set up your printer with adhesive paper settings" & return & "• Save these settings as a preset named 'ADHESIVO'" & return & "• Or modify the script to use your existing preset name"

		display dialog presetInstructions buttons {"Preset Exists", "Need to Create Preset"} default button "Preset Exists" with icon note

		if button returned of result is "Preset Exists" then
			return {success:true, component:"Print Preset", message:"✓ ADHESIVO preset confirmed by user"}
		else
			return {success:false, component:"Print Preset", message:"⚠ ADHESIVO preset needs to be created. See instructions in setup results."}
		end if

	on error errMsg
		return {success:false, component:"Print Preset", message:"Error checking print preset: " & errMsg}
	end try
end checkPrintPreset

-- Check system requirements
on checkSystemRequirements()
	try
		set systemInfo to {}

		-- Check macOS version
		set osVersion to system version of (system info)
		set end of systemInfo to "macOS version: " & osVersion

		-- Check if Preview app is available
		try
			tell application "Finder"
				set previewPath to path to application "Preview"
				set end of systemInfo to "✓ Preview.app found: " & (previewPath as string)
			end tell
		on error
			return {success:false, component:"System Requirements", message:"Preview.app not found. This app is required for PDF viewing and printing."}
		end try

		-- Check accessibility permissions info
		set accessibilityInfo to return & return & "IMPORTANT: This script requires Accessibility permissions to control print dialogs." & return & return & "To grant permissions:" & return & "1. Open System Preferences > Security & Privacy > Privacy" & return & "2. Click 'Accessibility' in the left panel" & return & "3. Click the lock icon and enter your password" & return & "4. Add and check the application that will run this script"

		return {success:true, component:"System Requirements", message:("✓ System checks passed:" & return & "  " & (item 1 of systemInfo) & return & "  " & (item 2 of systemInfo) & accessibilityInfo)}

	on error errMsg
		return {success:false, component:"System Requirements", message:"Error checking system: " & errMsg}
	end try
end checkSystemRequirements

-- Check Illustrator script installation
on checkIllustratorSetup()
	try
		-- Check if Illustrator is installed
		try
			tell application "Finder"
				set illustratorPath to path to application "Adobe Illustrator 2024" -- Adjust year as needed
			end tell
		on error
			try
				tell application "Finder"
					set illustratorPath to path to application "Adobe Illustrator 2023" -- Try different version
				end tell
			on error
				try
					tell application "Finder"
						set illustratorPath to path to application "Adobe Illustrator CC" -- Try CC version
					end tell
				on error
					return {success:false, component:"Illustrator Setup", message:"Adobe Illustrator not found. Please install Illustrator or adjust the script path."}
				end try
			end try
		end try

		-- Get user's home directory for script installation path
		set userHome to path to home folder
		set scriptsFolder to (userHome as string) & "Library:Application Support:Adobe:CEP:extensions:"

		set installInstructions to "✓ Adobe Illustrator found" & return & return & "To install the Illustrator script:" & return & return & "OPTION 1 - Scripts Menu (Recommended):" & return & "1. Copy 'illustrator_save.jsx' to:" & return & "   ~/Library/Application Support/Adobe/[Illustrator Version]/[Language]/Scripts/" & return & "2. Restart Illustrator" & return & "3. Access via File > Scripts > illustrator_save" & return & return & "OPTION 2 - Keyboard Shortcut:" & return & "1. Open Illustrator" & return & "2. Go to File > Scripts > Other Script..." & return & "3. Select illustrator_save.jsx" & return & "4. Create an Action and assign keyboard shortcut" & return & return & "Recommended shortcut: Cmd+Shift+S (or choose your preference)"

		return {success:true, component:"Illustrator Setup", message:installInstructions}

	on error errMsg
		return {success:false, component:"Illustrator Setup", message:"Error checking Illustrator: " & errMsg}
	end try
end checkIllustratorSetup

-- Display setup results
on displaySetupResults(results)
	set resultText to "PDF Auto-Print System Setup Results" & return & return

	set allSuccessful to true
	repeat with result in results
		set resultText to resultText & (component of result) & ":" & return
		set resultText to resultText & (message of result) & return & return

		if not (success of result) then
			set allSuccessful to false
		end if
	end repeat

	if allSuccessful then
		set resultText to resultText & "🟢 SETUP COMPLETE!" & return & return & "Next steps:" & return & "1. Run 'pdf_autoprint.scpt' to start monitoring" & return & "2. Install 'illustrator_save.jsx' in Illustrator" & return & "3. Test both scripts with sample files"

		display dialog resultText buttons {"Open Folder", "Done"} default button "Done" with icon note

		if button returned of result is "Open Folder" then
			tell application "Finder"
				open (POSIX file (watchFolder))
			end tell
		end if
	else
		set resultText to resultText & "⚠️ SETUP INCOMPLETE" & return & "Please resolve the issues above before running the system."
		display dialog resultText buttons {"OK"} default button "OK" with icon caution
	end if
end displaySetupResults