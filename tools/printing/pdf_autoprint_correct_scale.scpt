-- PDF Auto-Print with Correct 102.7% Scaling
-- Configured for exact 30x39cm output (corrected from 29.2x38cm)

property watchFolder : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
property archivedFolder : watchFolder & "/ARCHIVED"
property printerName : "SHARP_MX_6580N__8513615400_"
property correctScaling : "102.7"

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
					if printPDFWithCorrectScale(filePath, copyCount) then
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

on printPDFWithCorrectScale(filePath, copyCount)
	try
		-- Method 1: Command line with corrected 102.7% scaling
		set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 -o InputSlot=Bypass -o scaling=" & correctScaling & " \"" & filePath & "\""

		try
			do shell script shellCommand
			display notification "Printed with " & correctScaling & "% scaling" with title "PDF Auto-Print"
			return true

		on error cmdError
			-- Method 2: Preview with ADHESIVO preset and manual scaling instructions
			tell application "Preview"
				open (filePath as POSIX file)
				activate
			end tell

			delay 2

			tell application "System Events"
				tell process "Preview"
					-- Open print dialog
					keystroke "p" using command down
					delay 3

					-- Try to select ADHESIVO preset
					try
						if exists pop up button "Presets:" of print panel 1 then
							click pop up button "Presets:" of print panel 1
							delay 1
							if exists menu item "ADHESIVO" of menu 1 of pop up button "Presets:" of print panel 1 then
								click menu item "ADHESIVO" of menu 1 of pop up button "Presets:" of print panel 1
								delay 2
							end if
						end if
					on error
						-- Preset selection failed
					end try

					-- Set page range to 1-1
					try
						if exists radio button "From:" of print panel 1 then
							click radio button "From:" of print panel 1
							delay 0.5

							tell text field 1 of print panel 1
								set focused to true
								keystroke "a" using command down
								keystroke "1"
							end tell

							tell text field 2 of print panel 1
								set focused to true
								keystroke "a" using command down
								keystroke "1"
							end tell
						end if
					on error
						-- Page range setting failed
					end try

					-- Set copy count
					try
						repeat with i from 1 to 10
							if exists text field i of print panel 1 then
								try
									tell text field i of print panel 1
										set focused to true
										keystroke "a" using command down
										keystroke (copyCount as string)
									end tell
									exit repeat
								on error
									-- Try next field
								end try
							end if
						end repeat
					on error
						-- Copy setting failed
					end try

				end tell
			end tell

			-- Show scaling instruction dialog
			display dialog "Print dialog is open. Please verify/adjust:" & return & return & "✓ ADHESIVO preset selected (if available)" & return & "✓ Bypass tray selected" & return & "✓ Scale: " & correctScaling & "% (for 30x39cm output)" & return & "✓ Pages: 1 to 1" & return & "✓ Copies: " & copyCount & return & return & "Then click Print button." buttons {"Print Job Sent"}

			delay 3

			-- Close Preview
			tell application "Preview"
				close front window
			end tell

			return true
		end try

	on error errMsg
		display alert "Print Error" message "Failed to print: " & errMsg
		return false
	end try
end printPDFWithCorrectScale

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