(*
macOS Illustrator Dual PDF Save Script
Triggered by CMD+OPT+CTRL+S
Saves PDF to user location + automatic copy to TO_PRINT folder
*)

-- Configuration
property toPrintFolder : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"

on run
	try
		-- Check if Illustrator is running
		if not isIllustratorRunning() then
			display alert "Illustrator Not Running" message "Please open Adobe Illustrator and have a document ready." buttons {"OK"} default button "OK"
			return
		end if

		-- Check if document is open
		if not hasActiveDocument() then
			display alert "No Document Open" message "Please open a document in Illustrator before using this script." buttons {"OK"} default button "OK"
			return
		end if

		-- Check if TO_PRINT folder exists
		if not folderExists(toPrintFolder) then
			display alert "TO_PRINT Folder Not Found" message "The folder " & toPrintFolder & " does not exist. Please check the network connection or create the folder." buttons {"OK"} default button "OK"
			return
		end if

		-- Perform dual PDF save
		set saveResult to performDualPDFSave()

		if saveResult then
			display notification "PDF saved to both locations successfully!" with title "Illustrator Dual Save" sound name "Glass"
		else
			display alert "Save Failed" message "The PDF save operation was cancelled or failed." buttons {"OK"} default button "OK"
		end if

	on error errMsg
		display alert "Script Error" message "An error occurred: " & errMsg buttons {"OK"} default button "OK"
	end try
end run

-- Check if Illustrator is running
on isIllustratorRunning()
	try
		tell application "System Events"
			return exists (processes where name is "Adobe Illustrator 2024") or exists (processes where name is "Adobe Illustrator 2023") or exists (processes where name is "Adobe Illustrator CC")
		end tell
	on error
		return false
	end try
end isIllustratorRunning

-- Check if there's an active document
on hasActiveDocument()
	try
		tell application "Adobe Illustrator"
			return (count of documents) > 0
		end tell
	on error
		return false
	end try
end hasActiveDocument

-- Check if folder exists
on folderExists(folderPath)
	try
		tell application "Finder"
			return exists folder (folderPath as POSIX file)
		end tell
	on error
		return false
	end try
end folderExists

-- Main dual save function
on performDualPDFSave()
	try
		-- Get the active document name for default filename
		set docName to getDocumentName()

		-- Step 1: Show save dialog for user to choose PDF location
		set userPDFFile to choose file name with prompt "Save PDF as:" default name (docName & ".pdf")

		-- Ensure .pdf extension
		set userPath to userPDFFile as string
		if not (userPath ends with ".pdf") then
			set userPDFFile to (userPath & ".pdf") as alias
		end if

		-- Step 2: Export PDF to user's chosen location
		set exportSuccess to exportPDFToLocation(userPDFFile)

		if not exportSuccess then
			return false
		end if

		-- Step 3: Copy the PDF to TO_PRINT folder
		set userPOSIXPath to POSIX path of userPDFFile
		set copySuccess to copyPDFToToPrint(userPOSIXPath, docName)

		return copySuccess

	on error errMsg
		display alert "Save Process Error" message errMsg buttons {"OK"}
		return false
	end try
end performDualPDFSave

-- Get document name for default filename
on getDocumentName()
	try
		tell application "Adobe Illustrator"
			set docName to name of front document
			-- Remove .ai extension if present
			if docName ends with ".ai" then
				set docName to text 1 thru -4 of docName
			end if
			return docName
		end tell
	on error
		return "Untitled"
	end try
end getDocumentName

-- Export PDF using Illustrator's built-in export
on exportPDFToLocation(targetFile)
	try
		-- Use Illustrator's PDF export functionality
		tell application "Adobe Illustrator"
			activate

			-- Use the front document
			tell front document
				-- Export as PDF
				export in targetFile as PDF with options {PDF preset:"[High Quality Print]", artboard range:"1"}
			end tell
		end tell

		return true

	on error errMsg
		-- Fallback: Use Save As dialog manually
		try
			tell application "Adobe Illustrator"
				activate
			end tell

			-- Open File menu and trigger Save As
			tell application "System Events"
				tell process "Adobe Illustrator"
					-- Use keyboard shortcut for Save As
					keystroke "s" using {command down, shift down}
					delay 2

					-- The save dialog should now be open
					-- User will manually set format to PDF and choose location
				end tell
			end tell

			-- Wait for user to complete save
			display dialog "Please:" & return & "1. Set format to 'Adobe PDF'" & return & "2. Choose your save location" & return & "3. Click Save" & return & return & "Click OK when done." buttons {"OK"} default button "OK"

			return true

		on error
			return false
		end try
	end try
end exportPDFToLocation

-- Copy PDF to TO_PRINT folder
on copyPDFToToPrint(sourcePath, baseName)
	try
		-- Generate target filename
		set targetFileName to baseName & ".pdf"
		set targetPath to toPrintFolder & "/" & targetFileName

		-- Check if file already exists and generate unique name if needed
		set counter to 1
		repeat while fileExists(targetPath)
			set targetFileName to baseName & "_" & counter & ".pdf"
			set targetPath to toPrintFolder & "/" & targetFileName
			set counter to counter + 1
		end repeat

		-- Copy the file
		do shell script "cp \"" & sourcePath & "\" \"" & targetPath & "\""

		-- Show success message with both locations
		display notification "PDF copied to TO_PRINT folder as: " & targetFileName with title "Illustrator Dual Save"

		return true

	on error errMsg
		display alert "Copy Failed" message "Could not copy PDF to TO_PRINT folder: " & errMsg buttons {"OK"}
		return false
	end try
end copyPDFToToPrint

-- Check if file exists
on fileExists(filePath)
	try
		tell application "Finder"
			return exists file (filePath as POSIX file)
		end tell
	on error
		return false
	end try
end fileExists