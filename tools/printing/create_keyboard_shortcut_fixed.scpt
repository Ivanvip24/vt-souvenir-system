-- PDF Auto-Print Keyboard Shortcut Setup
-- Creates Automator Service

on run
	display dialog "This will help you create a keyboard shortcut for PDF Auto-Print." & return & return & "We'll open Automator and guide you through the setup." buttons {"Cancel", "Continue"} default button "Continue"

	if button returned of result is "Continue" then
		setupService()
	end if
end run

on setupService()
	try
		-- Get the path to the on-demand script
		set scriptPath to "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/PRINTING_PJ/pdf_autoprint_ondemand.scpt"

		-- Check if script exists
		try
			alias (scriptPath as POSIX file)
		on error
			display alert "Script Not Found" message "Could not find pdf_autoprint_ondemand.scpt at expected location." buttons {"OK"}
			return
		end try

		-- Open Automator
		tell application "Automator"
			activate

			-- Create new service
			set newDoc to make new document with properties {document type:service}

			-- Configure service settings
			tell newDoc
				set input type to "no input"
				set application to "any application"

				-- Add Run AppleScript action
				set scriptAction to make new action with properties {name:"Run AppleScript"}

				-- Set the script content
				set scriptContent to "on run {input, parameters}" & return
				set scriptContent to scriptContent & "try" & return
				set scriptContent to scriptContent & "run script alias \"" & scriptPath & "\"" & return
				set scriptContent to scriptContent & "on error errMsg" & return
				set scriptContent to scriptContent & "display alert \"Error\" message errMsg" & return
				set scriptContent to scriptContent & "end try" & return
				set scriptContent to scriptContent & "return input" & return
				set scriptContent to scriptContent & "end run"

				tell scriptAction
					set contents of script editor to scriptContent
				end tell
			end tell
		end tell

		-- Show next steps
		display dialog "Automator is now open with your service ready!" & return & return & "Next steps:" & return & "1. Press Cmd+S to save" & return & "2. Name it: PDF Auto-Print" & return & "3. Go to System Preferences > Keyboard > Shortcuts > Services" & return & "4. Find 'PDF Auto-Print' and assign keyboard shortcut" & return & return & "Recommended shortcut: Cmd+Option+P" buttons {"OK"}

	on error errMsg
		display alert "Setup Error" message errMsg buttons {"OK"}
	end try
end setupService