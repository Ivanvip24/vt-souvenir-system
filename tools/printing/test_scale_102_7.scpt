-- Test 102.7% Scaling
-- Tests the corrected scaling to achieve 30x39cm output

on run
	try
		-- Ask user to select a PDF file for testing
		set testFile to choose file with prompt "Select a PDF file to test 102.7% scaling:" of type {"pdf"}
		set filePath to POSIX path of testFile

		display dialog "Testing corrected scaling:" & return & return & "Target: 30cm x 39cm" & return & "Previous result: 29.2cm x 38cm" & return & "New scaling: 102.7%" & return & return & "This should give you exactly 30x39cm output." buttons {"Cancel", "Test Print"} default button "Test Print"

		if button returned of result is "Test Print" then
			-- Test the corrected scaling
			set shellCommand to "lp -d \"SHARP_MX_6580N__8513615400_\" -n 1 -o page-ranges=1 -o InputSlot=Bypass -o scaling=102.7 \"" & filePath & "\""

			try
				set printResult to do shell script shellCommand
				display dialog "✓ Print sent with 102.7% scaling!" & return & return & "Please measure the printed output:" & return & "• Should be 30cm width" & return & "• Should be 39cm height" & return & return & "If measurements are still off, we'll adjust further." & return & return & "Print job: " & printResult buttons {"OK"}

			on error errMsg
				display alert "Command line printing failed" message errMsg & return & return & "Try using Preview with ADHESIVO preset and manually set scale to 102.7%"
			end try
		end if

	on error errMsg
		display alert "Error" message errMsg
	end try
end run