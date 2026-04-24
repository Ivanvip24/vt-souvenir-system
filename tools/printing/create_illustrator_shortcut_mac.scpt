(*
Automator Service Creator for Illustrator Dual PDF Save
Creates a system service that can be assigned CMD+OPT+CTRL+S
*)

on run
	display dialog "This will create an Automator Service for Illustrator Dual PDF Save." & return & return & "The service will be assigned to:" & return & "CMD + OPTION + CONTROL + S" & return & return & "This shortcut will work system-wide when Illustrator is active." buttons {"Cancel", "Create Service"} default button "Create Service" with icon note

	if button returned of result is "Create Service" then
		createIllustratorService()
	end if
end run

on createIllustratorService()
	try
		-- Get the path to the main Illustrator script
		set scriptPath to (path to me as string)
		tell application "Finder"
			set parentFolder to container of alias scriptPath
			set scriptFolder to POSIX path of (parentFolder as alias)
		end tell

		set illustratorScriptPath to scriptFolder & "illustrator_pdf_save_mac.scpt"

		-- Check if the main script exists
		try
			alias (illustratorScriptPath as POSIX file)
		on error
			display alert "Script Not Found" message "Could not find illustrator_pdf_save_mac.scpt in the same folder as this setup script." & return & return & "Please ensure both scripts are in the same directory." buttons {"OK"} default button "OK"
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

				-- Add "Run AppleScript" action
				set scriptAction to make new action with properties {name:"Run AppleScript"}

				-- Set the script content
				set scriptContent to "on run {input, parameters}" & return
				set scriptContent to scriptContent & "    try" & return
				set scriptContent to scriptContent & "        -- Run the Illustrator dual save script" & return
				set scriptContent to scriptContent & "        run script alias \"" & illustratorScriptPath & "\"" & return
				set scriptContent to scriptContent & "    on error errMsg" & return
				set scriptContent to scriptContent & "        display alert \"Illustrator Save Error\" message errMsg buttons {\"OK\"}" & return
				set scriptContent to scriptContent & "    end try" & return
				set scriptContent to scriptContent & "    return input" & return
				set scriptContent to scriptContent & "end run"

				tell scriptAction
					set contents of script editor to scriptContent
				end tell
			end tell
		end tell

		-- Show completion instructions
		display dialog "Automator is now open with your service configured!" & return & return & "To complete setup:" & return & return & "1. Press CMD+S to save" & return & "2. Name it: 'Illustrator Dual PDF Save'" & return & "3. It will be saved as a Service automatically" & return & return & "4. Go to System Preferences > Keyboard > Shortcuts" & return & "5. Click 'Services' in the left panel" & return & "6. Find 'Illustrator Dual PDF Save' under General" & return & "7. Assign shortcut: CMD+OPT+CTRL+S" & return & return & "The shortcut will work system-wide!" buttons {"Got It!"} default button "Got It!" with icon note

	on error errMsg
		display alert "Service Creation Error" message "Could not create Automator service: " & errMsg & return & return & "Please create the service manually using the instructions in the documentation." buttons {"OK"} default button "OK"
	end try
end createIllustratorService