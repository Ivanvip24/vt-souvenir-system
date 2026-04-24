-- Automator Service Creator for Illustrator Dual PDF Save (Fixed)
-- Creates a system service that can be assigned CMD+OPT+CTRL+S

on run
	display dialog "This will create an Automator Service for Illustrator Dual PDF Save." & return & return & "The service will be assigned to:" & return & "CMD + OPTION + CONTROL + S" & return & return & "This shortcut will work system-wide when Illustrator is active." buttons {"Cancel", "Create Service"} default button "Create Service"

	if button returned of result is "Create Service" then
		createIllustratorService()
	end if
end run

on createIllustratorService()
	try
		-- Get the path to the main Illustrator script
		set scriptPath to "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/PRINTING_PJ/illustrator_pdf_save_mac.scpt"

		-- Check if the main script exists
		try
			alias (scriptPath as POSIX file)
		on error
			display alert "Script Not Found" message "Could not find illustrator_pdf_save_mac.scpt at expected location." buttons {"OK"}
			return
		end try

		-- Create the Automator service
		tell application "Automator"
			activate

			-- Create a new service document
			set newDoc to make new document with properties {document type:service}

			tell newDoc
				-- Set service to receive no input in any application
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

		-- Show completion instructions
		display dialog "Automator is now open with your service ready!" & return & return & "Next steps:" & return & "1. Press CMD+S to save" & return & "2. Name it: Illustrator Dual PDF Save" & return & "3. Go to System Preferences > Keyboard > Shortcuts > Services" & return & "4. Find your service and assign CMD+OPT+CTRL+S" buttons {"Got It!"}

	on error errMsg
		display alert "Service Creation Error" message errMsg buttons {"OK"}
	end try
end createIllustratorService