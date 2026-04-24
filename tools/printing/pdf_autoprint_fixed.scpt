-- PDF Auto-Print Fixed Version
-- Uses proper printer name and Preview app for ADHESIVO preset

property watchFolder : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
property archivedFolder : watchFolder & "/ARCHIVED"
property printerName : "SHARP_MX_6580N__8513615400_"
property printPreset : "ADHESIVO"

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
					if printPDFWithPreview(filePath, copyCount) then
						moveToArchived(filePath, pdfFile)
						set processedCount to processedCount + 1
						display notification "✓ Printed and archived: " & pdfFile with title "PDF Auto-Print"
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

on printPDFWithPreview(filePath, copyCount)
	try
		-- Open PDF in Preview
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		delay 1

		-- Open print dialog using System Events
		tell application "System Events"
			tell process "Preview"
				-- Open print dialog
				keystroke "p" using command down
				delay 3

				-- Try to select ADHESIVO preset
				try
					-- Look for Presets dropdown
					if exists pop up button "Presets:" of print panel 1 then
						click pop up button "Presets:" of print panel 1
						delay 1
						-- Try to select ADHESIVO preset
						if exists menu item printPreset of menu 1 of pop up button "Presets:" of print panel 1 then
							click menu item printPreset of menu 1 of pop up button "Presets:" of print panel 1
							delay 1
						end if
					end if
				on error
					-- If preset selection fails, continue with current settings
				end try

				-- Set page range to first page only
				try
					-- Look for page range controls
					if exists radio button "From:" of print panel 1 then
						click radio button "From:" of print panel 1
						delay 0.5

						-- Set page range 1 to 1
						if exists text field 1 of print panel 1 then
							tell text field 1 of print panel 1
								set focused to true
								keystroke "a" using command down
								keystroke "1"
							end tell
						end if

						if exists text field 2 of print panel 1 then
							tell text field 2 of print panel 1
								set focused to true
								keystroke "a" using command down
								keystroke "1"
							end tell
						end if
					end if
				on error
					-- Page range setting failed, continue
				end try

				-- Set copy count
				try
					-- Look for copies field
					repeat with i from 1 to 10
						try
							if exists text field i of print panel 1 then
								set fieldName to name of text field i of print panel 1
								if fieldName contains "copies" or fieldName contains "Copies" then
									tell text field i of print panel 1
										set focused to true
										keystroke "a" using command down
										keystroke (copyCount as string)
									end tell
									exit repeat
								end if
							end if
						on error
							-- Continue to next field
						end try
					end repeat
				on error
					-- Copy count setting failed, continue
				end try

				delay 1

				-- Click Print button
				click button "Print" of print panel 1
				delay 2
			end tell
		end tell

		-- Wait for print job to start
		delay 3

		-- Close Preview
		tell application "Preview"
			close front window
		end tell

		return true

	on error errMsg
		-- Try to close Preview if still open
		try
			tell application "Preview"
				close front window
			end tell
		end try

		-- Fallback: Use command line printing
		try
			set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 \"" & filePath & "\""
			do shell script shellCommand
			return true
		on error
			return false
		end try
	end try
end printPDFWithPreview

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