-- PDF Auto-Print Debug Version
-- Shows detailed information about what's happening

on run
	try
		set watchFolder to "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"

		-- Debug: Show what we're looking for
		display dialog "Debug Info:" & return & return & "Looking for folder: " & watchFolder & return & return & "Checking if folder exists..." buttons {"OK"}

		-- Check if folder exists
		tell application "Finder"
			set folderExists to exists folder (watchFolder as POSIX file)
		end tell

		if folderExists then
			display dialog "✓ Folder found!" & return & return & "Checking for PDF files..." buttons {"OK"}

			-- Get PDF files
			tell application "Finder"
				set pdfFiles to {}
				set allFiles to name of files of folder (watchFolder as POSIX file)
				repeat with fileName in allFiles
					if fileName ends with ".pdf" or fileName ends with ".PDF" then
						set end of pdfFiles to fileName
					end if
				end repeat
			end tell

			set fileCount to length of pdfFiles
			if fileCount = 0 then
				display dialog "✓ Folder found but no PDF files inside." & return & return & "The folder exists but is empty of PDF files." buttons {"OK"}
			else
				display dialog "✓ Found " & fileCount & " PDF files:" & return & return & (pdfFiles as string) buttons {"OK"}
			end if
		else
			-- Folder doesn't exist - let's check what volumes are available
			tell application "Finder"
				set volumeList to name of disks
			end tell

			display dialog "✗ Folder not found!" & return & return & "Available volumes:" & return & (volumeList as string) & return & return & "The folder '/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT' does not exist on your system." buttons {"OK"}
		end if

	on error errMsg
		display dialog "Error occurred: " & errMsg buttons {"OK"}
	end try
end run