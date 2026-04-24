(*
Keyboard Shortcut Setup Helper
Creates Automator Service for PDF Auto-Print System
Run this script to automatically create the service
*)

on run
	display dialog "This will create an Automator Service for the PDF Auto-Print system." & return & return & "The service can then be assigned a keyboard shortcut in System Preferences." & return & return & "Recommended shortcut: ⌘⌥P (Command+Option+P)" buttons {"Cancel", "Create Service"} default button "Create Service" with icon note

	if button returned of result is "Create Service" then
		createAutomatorService()
	end if
end run

on createAutomatorService()
	try
		-- Get the current script's directory to find pdf_autoprint_ondemand.scpt
		set currentPath to path to me
		tell application "Finder"
			set parentFolder to container of currentPath
			set scriptFolder to POSIX path of (parentFolder as alias)
		end tell

		set onDemandScriptPath to scriptFolder & "pdf_autoprint_ondemand.scpt"

		-- Check if the on-demand script exists
		try
			alias (onDemandScriptPath as POSIX file)
		on error
			display alert "Script Not Found" message "Could not find pdf_autoprint_ondemand.scpt in the same folder as this setup script." & return & return & "Please ensure both scripts are in the same directory." buttons {"OK"} default button "OK"
			return
		end try

		-- Create the Automator service
		tell application "Automator"
			activate

			-- Create a new service document
			set newDoc to make new document with properties {document type:service}

			tell newDoc
				-- Set service to receive no input in any application
				set receive files and folders of newDoc to false
				set input type of newDoc to "no input"
				set application of newDoc to "any application"

				-- Add "Run AppleScript" action
				set runScriptAction to make new action with properties {name:"Run AppleScript"}

				-- Set the AppleScript content
				set actionScript to "on run {input, parameters}" & return
				set actionScript to actionScript & "    try" & return
				set actionScript to actionScript & "        -- Run the PDF auto-print script" & return
				set actionScript to actionScript & "        run script alias \"" & onDemandScriptPath & "\"" & return
				set actionScript to actionScript & "        return input" & return
				set actionScript to actionScript & "    on error errMsg" & return
				set actionScript to actionScript & "        display alert \"PDF Auto-Print Error\" message errMsg buttons {\"OK\"} default button \"OK\"" & return
				set actionScript to actionScript & "        return input" & return
				set actionScript to actionScript & "    end try" & return
				set actionScript to actionScript & "end run"

				tell runScriptAction
					set contents of script editor to actionScript
				end tell
			end tell

			-- Prompt to save the service
			display dialog "Automator is now open with your service configured." & return & return & "To complete setup:" & return & return & "1. Click 'File > Save'" & return & "2. Name it 'PDF Auto-Print'" & return & "3. It will be saved as a Service automatically" & return & return & "After saving, you can assign a keyboard shortcut in:" & return & "System Preferences > Keyboard > Shortcuts > Services" buttons {"OK"} default button "OK" with icon note

		end tell

	on error errMsg
		display alert "Service Creation Error" message "Could not create Automator service: " & errMsg & return & return & "Please create the service manually using the instructions in the documentation." buttons {"OK"} default button "OK"
	end try
end createAutomatorService