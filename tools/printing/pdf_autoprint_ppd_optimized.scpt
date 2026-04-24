-- PDF Auto-Print with Optimized SHARP PPD Settings
-- Paper: 330mm x 480mm (ADHESIVE)
-- First page only, 100.3% scale
-- Uses SHARP MX-6580N PPD v10.4 with all optimal settings

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
					if printPDFWithPPD(filePath, copyCount) then
						moveToArchived(filePath, pdfFile)
						set processedCount to processedCount + 1
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

on printPDFWithPPD(filePath, copyCount)
	try
		-- Build command with ALL optimal SHARP PPD settings
		-- Paper: 330x480mm, Bypass tray, Graphics mode, High Quality, First page only
		set ppdOptions to "-o page-ranges=1 " & ¬
			"-o InputSlot=Bypass " & ¬
			"-o PageSize=Custom.330x480mm " & ¬
			"-o ARCOType=COTGraphics " & ¬
			"-o ARCPPriority=HQuality " & ¬
			"-o ARCMode=CMAuto " & ¬
			"-o Duplex=None " & ¬
			"-o ARCScreen=SDefault " & ¬
			"-o ARCSharpness=SNone " & ¬
			"-o ARSaveToner=False " & ¬
			"-o ARCOverp=True " & ¬
			"-o Collate=True " & ¬
			"-o scaling=100.3"

		set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " " & ppdOptions & " \"" & filePath & "\""

		-- Try command-line print first
		try
			do shell script shellCommand

			-- Success notification
			display notification "Print job sent with optimal PPD settings" with title "PDF Auto-Print"

			-- Ask user to verify the scale in print queue/settings
			display dialog "Print job sent!" & return & return & ¬
				"IMPORTANT: The SHARP printer may ignore the 100.3% scale setting." & return & return & ¬
				"If the print size is incorrect, cancel this job and use the manual print dialog option." & return & return & ¬
				"Did the print job send successfully?" buttons {"Failed - Retry Manually", "Success"} default button "Success"

			if button returned of result is "Success" then
				return true
			end if
		on error cmdError
			-- Command failed, fall through to manual method
		end try

		-- Fallback: Open print dialog for manual verification
		display notification "Opening print dialog for manual verification..." with title "PDF Auto-Print"

		-- Open PDF in Preview
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		delay 2

		-- Open print dialog
		tell application "System Events"
			tell process "Preview"
				keystroke "p" using command down
			end tell
		end tell

		delay 3

		-- Show detailed verification checklist
		set checklistMsg to "PRINT DIALOG VERIFICATION (SHARP MX-6580N PPD):" & return & return
		set checklistMsg to checklistMsg & "✓ Printer: SHARP MX-6580N (8513615400)" & return
		set checklistMsg to checklistMsg & "✓ PPD Driver: v10.4" & return
		set checklistMsg to checklistMsg & "✓ Paper Size: Custom 330 x 480 mm" & return
		set checklistMsg to checklistMsg & "✓ Input Tray: Bypass" & return
		set checklistMsg to checklistMsg & "✓ Pages: From 1 to 1" & return
		set checklistMsg to checklistMsg & "✓ Copies: " & copyCount & return & return
		set checklistMsg to checklistMsg & "PREVIEW/LAYOUT SECTION:" & return
		set checklistMsg to checklistMsg & "✓ Auto Rotate: UNCHECKED" & return
		set checklistMsg to checklistMsg & "✓ Scale: 100.3% (CRITICAL!)" & return
		set checklistMsg to checklistMsg & "✓ Print Entire Image: SELECTED" & return & return
		set checklistMsg to checklistMsg & "COLOR/QUALITY SETTINGS:" & return
		set checklistMsg to checklistMsg & "✓ Image Type: Graphics (COTGraphics)" & return
		set checklistMsg to checklistMsg & "✓ Print Mode: High Quality" & return & return
		set checklistMsg to checklistMsg & "Click OK, then verify ALL settings and Print."

		display dialog checklistMsg buttons {"OK"} default button "OK" with icon note

		-- Wait for user to complete printing
		delay 2

		-- Confirm print job was sent
		set printConfirm to display dialog "Did you click Print?" buttons {"No - Skip File", "Yes - Print Job Sent"} default button "Yes - Print Job Sent"

		if button returned of printConfirm is "Yes - Print Job Sent" then
			-- Close Preview
			tell application "Preview"
				close front window
			end tell
			return true
		else
			-- Close Preview
			tell application "Preview"
				close front window
			end tell
			return false
		end if

	on error errMsg
		display alert "Print Error" message errMsg
		return false
	end try
end printPDFWithPPD

on moveToArchived(filePath, fileName)
	try
		tell application "Finder"
			move (filePath as POSIX file) to (archivedFolder as POSIX file)
		end tell
		display notification "Archived: " & fileName with title "PDF Auto-Print"
		return true
	on error
		return false
	end try
end moveToArchived
