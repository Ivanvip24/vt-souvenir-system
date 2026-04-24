-- Simple Print Test
-- Tests printing a PDF file directly

on run
	try
		-- Ask user to select a PDF file for testing
		set testFile to choose file with prompt "Select a PDF file to test printing:" of type {"pdf"}
		set filePath to POSIX path of testFile

		display dialog "Testing print of: " & (name of (info for testFile)) & return & return & "This will:" & return & "1. Print to SHARP_MX_6580N__8513615400_" & return & "2. Print first page only" & return & "3. Print 1 copy" buttons {"Cancel", "Print Test"} default button "Print Test"

		if button returned of result is "Print Test" then
			-- Method 1: Try command line printing
			try
				set shellCommand to "lp -d \"SHARP_MX_6580N__8513615400_\" -o page-ranges=1 -n 1 \"" & filePath & "\""
				set printResult to do shell script shellCommand
				display dialog "✓ Print job sent successfully!" & return & return & "Result: " & printResult & return & return & "Check your printer to see if it printed." buttons {"OK"}
			on error errMsg
				-- Method 2: Fallback to Preview
				display dialog "Command line printing failed. Trying Preview method..." buttons {"OK"}

				tell application "Preview"
					open (testFile)
					activate
				end tell

				delay 2

				display dialog "Preview is now open. Please:" & return & "1. Press Cmd+P to print" & return & "2. Select ADHESIVO preset if available" & return & "3. Set pages to 1-1" & return & "4. Click Print" & return & return & "This tests if the ADHESIVO preset works." buttons {"OK"}

				tell application "Preview"
					close front window
				end tell
			end try
		end if

	on error errMsg
		display alert "Error" message errMsg
	end try
end run