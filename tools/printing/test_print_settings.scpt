-- Test Print with Correct Settings
-- Tests bypass tray, 33x48cm paper, and 100.2% scaling

on run
	try
		-- Ask user to select a PDF file for testing
		set testFile to choose file with prompt "Select a PDF file to test printing with correct settings:" of type {"pdf"}
		set filePath to POSIX path of testFile

		display dialog "Testing print of: " & (name of (info for testFile)) & return & return & "Settings:" & return & "• Printer: SHARP_MX_6580N__8513615400_" & return & "• Paper: Bypass tray" & return & "• Size: 33x48cm (Custom)" & return & "• Scale: 100.2%" & return & "• Pages: 1 only" & return & "• Copies: 1" buttons {"Cancel", "Print Test"} default button "Print Test"

		if button returned of result is "Print Test" then
			-- Create the print command with proper settings
			-- Using bypass tray, custom paper size 33x48cm, and fit-to-page scaling
			set shellCommand to "lp -d \"SHARP_MX_6580N__8513615400_\" -o InputSlot=Bypass -o PageSize=Custom.936x1361 -o page-ranges=1 -o fit-to-page -n 1 \"" & filePath & "\""

			try
				set printResult to do shell script shellCommand
				display dialog "✓ Print job sent with correct settings!" & return & return & "Command used:" & return & shellCommand & return & return & "Result: " & printResult & return & return & "Check your printer - it should use bypass tray with 33x48cm paper." buttons {"OK"}

			on error errMsg
				-- Try alternative command with scaling option
				set shellCommand2 to "lp -d \"SHARP_MX_6580N__8513615400_\" -o InputSlot=Bypass -o scaling=100.2 -o page-ranges=1 -n 1 \"" & filePath & "\""

				try
					set printResult2 to do shell script shellCommand2
					display dialog "✓ Print job sent with scaling option!" & return & return & "Command used:" & return & shellCommand2 & return & return & "Result: " & printResult2 buttons {"OK"}

				on error errMsg2
					display alert "Both print methods failed" message "Error 1: " & errMsg & return & return & "Error 2: " & errMsg2 & return & return & "You may need to use Preview with manual ADHESIVO preset selection."
				end try
			end try
		end if

	on error errMsg
		display alert "Error" message errMsg
	end try
end run