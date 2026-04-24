#!/usr/bin/osascript
(*
Automator Service Wrapper for PDF Auto-Print System
This creates a service that can be assigned a keyboard shortcut
Save this as a .workflow file using Automator
*)

on run {input, parameters}
	-- Path to the on-demand script (update this path as needed)
	set scriptPath to (path to desktop as string) & "PRINTING_PJ:pdf_autoprint_ondemand.scpt"

	try
		-- Run the PDF auto-print script
		run script alias scriptPath

		return input

	on error errMsg
		-- If script not found at expected location, prompt user
		display alert "PDF Auto-Print Service Error" message "Could not find pdf_autoprint_ondemand.scpt script." & return & return & "Please ensure the script is in the correct location or update the path in this service." buttons {"OK"} default button "OK"

		return input
	end try
end run