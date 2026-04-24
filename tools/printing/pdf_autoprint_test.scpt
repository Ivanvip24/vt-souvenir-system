-- PDF Auto-Print Test Version
-- Uses Desktop folder for testing

on run
	try
		-- Use Desktop folder for testing
		set desktopPath to path to desktop
		set watchFolder to (desktopPath as string) & "TEST_TO_PRINT"
		set archivedFolder to watchFolder & ":ARCHIVED"

		-- Create test folders
		tell application "Finder"
			if not (exists folder watchFolder) then
				make new folder at desktop with properties {name:"TEST_TO_PRINT"}
				display dialog "Created test folder on Desktop: TEST_TO_PRINT" & return & return & "Please add some PDF files to this folder and run the script again." buttons {"OK"}
				return
			end if

			if not (exists folder archivedFolder) then
				make new folder at folder watchFolder with properties {name:"ARCHIVED"}
			end if
		end tell

		-- Convert to POSIX paths for processing
		set watchFolderPOSIX to POSIX path of (watchFolder as alias)
		set archivedFolderPOSIX to POSIX path of (archivedFolder as alias)

		-- Get PDF files
		tell application "Finder"
			set pdfFiles to {}
			set allFiles to name of files of folder watchFolder
			repeat with fileName in allFiles
				if fileName ends with ".pdf" or fileName ends with ".PDF" then
					set end of pdfFiles to fileName
				end if
			end repeat
		end tell

		if length of pdfFiles = 0 then
			display dialog "Test folder found but no PDF files." & return & return & "Please add some PDF files to:" & return & "Desktop/TEST_TO_PRINT" & return & return & "Then run this script again." buttons {"OK"}
			return
		end if

		-- Show found files
		set fileCount to length of pdfFiles
		set fileList to ""
		repeat with pdfFile in pdfFiles
			set fileList to fileList & "• " & pdfFile & return
		end repeat

		display dialog "Found " & fileCount & " PDF files:" & return & return & fileList & return & "Ready to process?" buttons {"Cancel", "Process"} default button "Process"

		if button returned of result is "Cancel" then return

		-- Process each file
		set processedCount to 0
		repeat with pdfFile in pdfFiles
			set filePath to watchFolderPOSIX & pdfFile

			-- Simple confirmation (no Preview for now)
			set confirmResult to display dialog "Process file: " & pdfFile & "?" buttons {"Skip", "Process"} default button "Process"

			if button returned of confirmResult is "Process" then
				-- Get copy count
				set copyDialog to display dialog "How many copies?" default answer "1" buttons {"Cancel", "Print"} default button "Print"

				if button returned of copyDialog is "Print" then
					set copyCount to text returned of copyDialog

					-- Simulate printing (just show message)
					display dialog "Would print: " & pdfFile & return & "Copies: " & copyCount & return & "Preset: ADHESIVO" & return & "Page: 1 only" buttons {"OK"}

					-- Move to archived
					tell application "Finder"
						move file pdfFile of folder watchFolder to folder archivedFolder
					end tell

					set processedCount to processedCount + 1
				end if
			end if
		end repeat

		display dialog "Test complete!" & return & return & "Processed: " & processedCount & " files" & return & "Files moved to: TEST_TO_PRINT/ARCHIVED" buttons {"OK"}

	on error errMsg
		display dialog "Error: " & errMsg buttons {"OK"}
	end try
end run