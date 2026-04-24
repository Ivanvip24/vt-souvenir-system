-- PDF Auto-Print Corrected Version
-- Fixed syntax and proper print settings

property watchFolder : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
property archivedFolder : watchFolder & "/ARCHIVED"
property printerName : "SHARP_MX_6580N__8513615400_"

on run
	try
		-- Check if folders exist
		if not folderExists(watchFolder) then
			display alert "Error" message "Watch folder does not exist: " & watchFolder
			return
		end if

		-- Create archived folder if needed
		createArchivedFolder()

		-- Get PDF files
		set pdfFiles to getPDFFiles(watchFolder)

		if length of pdfFiles = 0 then
			display notification "No PDF files found in TO_PRINT folder" with title "PDF Auto-Print"
			return
		end if

		-- Show summary
		set fileCount to length of pdfFiles
		set summaryMsg to "Found " & fileCount & " PDF file"
		if fileCount > 1 then set summaryMsg to summaryMsg & "s"
		set summaryMsg to summaryMsg & " ready to process."

		display dialog summaryMsg buttons {"Cancel", "Start Processing"} default button "Start Processing"

		if button returned of result is "Cancel" then return

		-- Process files
		set processedCount to 0
		repeat with pdfFile in pdfFiles
			set filePath to watchFolder & "/" & pdfFile

			if previewAndConfirm(filePath, pdfFile) then
				set copyCount to getCopyCount()
				if copyCount > 0 then
					if printPDFWithSettings(filePath, copyCount) then
						moveToArchived(filePath, pdfFile)
						set processedCount to processedCount + 1
						display notification "Printed and archived: " & pdfFile with title "PDF Auto-Print"
					else
						display alert "Print Failed" message "Could not print: " & pdfFile
					end if
				end if
			end if
		end repeat

		-- Final message
		display dialog "Processing complete! Processed " & processedCount & " files." buttons {"OK"}

	on error errMsg
		display alert "Error" message errMsg
	end try
end run

on folderExists(folderPath)
	try
		tell application "Finder"
			return exists folder (folderPath as POSIX file)
		end tell
	on error
		return false
	end try
end folderExists

on createArchivedFolder()
	try
		tell application "Finder"
			if not (exists folder (archivedFolder as POSIX file)) then
				make new folder at (watchFolder as POSIX file) with properties {name:"ARCHIVED"}
			end if
		end tell
	end try
end createArchivedFolder

on getPDFFiles(folderPath)
	try
		tell application "Finder"
			set pdfFiles to {}
			set allFiles to name of files of folder (folderPath as POSIX file)
			repeat with fileName in allFiles
				if fileName ends with ".pdf" or fileName ends with ".PDF" then
					set end of pdfFiles to fileName
				end if
			end repeat
			return pdfFiles
		end tell
	on error
		return {}
	end try
end getPDFFiles

on previewAndConfirm(filePath, fileName)
	try
		-- Open in Preview
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		delay 2

		-- Ask for confirmation
		set confirmResult to display dialog "Do you want to print this PDF?" & return & return & "File: " & fileName buttons {"Skip", "Print"} default button "Print"

		-- Close Preview
		tell application "Preview"
			close front window
		end tell

		return button returned of confirmResult is "Print"

	on error
		return false
	end try
end previewAndConfirm

on getCopyCount()
	try
		set copyDialog to display dialog "How many copies do you need?" default answer "1" buttons {"Cancel", "Print"} default button "Print"

		if button returned of copyDialog is "Print" then
			set copyText to text returned of copyDialog
			try
				set copyCount to copyText as integer
				if copyCount > 0 and copyCount <= 99 then
					return copyCount
				end if
			end try
		end if
		return 0
	on error
		return 0
	end try
end getCopyCount

on printPDFWithSettings(filePath, copyCount)
	try
		-- Method 1: Try with custom paper size 33x48cm (936x1361 points) and bypass tray
		set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 -o InputSlot=Bypass -o PageSize=Custom.936x1361 -o fit-to-page \"" & filePath & "\""

		try
			do shell script shellCommand
			return true
		on error
			-- Method 2: Try with scaling option
			set shellCommand2 to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 -o InputSlot=Bypass -o scaling=100.2 \"" & filePath & "\""
			do shell script shellCommand2
			return true
		end try

	on error errMsg
		-- Fallback: Try Preview method with manual settings
		try
			tell application "Preview"
				open (filePath as POSIX file)
				activate
			end tell

			delay 2

			display dialog "Automated printing failed. Preview is open." & return & return & "Please manually:" & return & "1. Press Cmd+P" & return & "2. Select ADHESIVO preset" & return & "3. Set Bypass Tray (33x48cm)" & return & "4. Set Scale to 100.2%" & return & "5. Set Pages to 1-1" & return & "6. Set Copies to " & copyCount buttons {"Done"}

			tell application "Preview"
				close front window
			end tell

			return true

		on error
			return false
		end try
	end try
end printPDFWithSettings

on moveToArchived(filePath, fileName)
	try
		tell application "Finder"
			move (filePath as POSIX file) to (archivedFolder as POSIX file)
		end tell
		return true
	on error
		return false
	end try
end moveToArchived