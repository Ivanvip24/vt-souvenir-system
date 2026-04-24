-- PDF Auto-Print with Correct Scaling
-- Configured for exact 33x48cm output

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
					if printPDFCorrectSize(filePath, copyCount) then
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

on printPDFCorrectSize(filePath, copyCount)
	try
		-- Method 1: Use Preview with ADHESIVO preset (recommended for exact scaling)
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		delay 2

		-- Automated print dialog interaction
		tell application "System Events"
			tell process "Preview"
				-- Open print dialog
				keystroke "p" using command down
				delay 3

				-- Try to select ADHESIVO preset first
				try
					if exists pop up button "Presets:" of print panel 1 then
						click pop up button "Presets:" of print panel 1
						delay 1
						if exists menu item "ADHESIVO" of menu 1 of pop up button "Presets:" of print panel 1 then
							click menu item "ADHESIVO" of menu 1 of pop up button "Presets:" of print panel 1
							delay 2

							-- After selecting preset, set copies and print
							try
								-- Set copy count
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

								delay 1
								-- Click Print
								click button "Print" of print panel 1

							on error
								-- Manual fallback
								display dialog "Please manually set copies to " & copyCount & " and click Print. ADHESIVO preset should be selected." buttons {"Done"}
							end try
						else
							-- ADHESIVO preset not found, show manual instructions
							display dialog "ADHESIVO preset not found. Please manually:" & return & "1. Select bypass tray" & return & "2. Set paper size to 33x48cm" & return & "3. Set scale to maintain exact size" & return & "4. Set copies to " & copyCount & return & "5. Set pages to 1-1" & return & "6. Click Print" buttons {"Done"}
						end if
					else
						-- No presets dropdown, show manual instructions
						display dialog "Please manually configure print settings:" & return & "1. Select bypass tray" & return & "2. Set paper size to 33x48cm" & return & "3. Set scale to 87.1% width, 164.4% height (or use ADHESIVO preset)" & return & "4. Set copies to " & copyCount & return & "5. Set pages to 1-1" & return & "6. Click Print" buttons {"Done"}
					end if
				on error
					-- Fallback to manual instructions
					display dialog "Automated preset selection failed. Please manually:" & return & "1. Select ADHESIVO preset (if available)" & return & "2. Or set bypass tray + 33x48cm paper" & return & "3. Set copies to " & copyCount & return & "4. Set pages to 1-1" & return & "5. Click Print" buttons {"Done"}
				end try
			end tell
		end tell

		-- Wait for print job
		delay 3

		-- Close Preview
		tell application "Preview"
			close front window
		end tell

		return true

	on error errMsg
		-- Fallback: Command line with best available options
		try
			-- Try command line printing with bypass tray
			set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 -o InputSlot=Bypass \"" & filePath & "\""
			do shell script shellCommand

			display dialog "Printed using command line. Note: May not have correct scaling. Use ADHESIVO preset in Preview for exact 33x48cm output." buttons {"OK"}
			return true

		on error
			return false
		end try
	end try
end printPDFCorrectSize

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