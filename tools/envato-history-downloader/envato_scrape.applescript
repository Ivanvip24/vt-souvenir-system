-- Drive Chrome to scroll generation-history and collect every gen-asset URL.
-- Prints URLs one per line on stdout. Prints "ERR: ..." if no Envato tab.
-- Usage: osascript envato_scrape.applescript /absolute/path/to/envato_scrape.js

on run argv
  if (count of argv) < 1 then
    return "ERR: pass /absolute/path/to/envato_scrape.js as first arg"
  end if
  set jsPath to item 1 of argv

  tell application "Google Chrome"
    set foundTab to missing value
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t contains "generation-history" then
          set foundTab to t
          exit repeat
        end if
      end repeat
      if foundTab is not missing value then exit repeat
    end repeat

    if foundTab is missing value then
      return "ERR: open https://app.envato.com/generation-history in Chrome first"
    end if

    -- Bring tab to foreground so Chrome doesn't throttle scrolling
    repeat with w in windows
      set tabIdx to 0
      repeat with t in tabs of w
        set tabIdx to tabIdx + 1
        if URL of t contains "generation-history" then
          set active tab index of w to tabIdx
          set index of w to 1
          exit repeat
        end if
      end repeat
    end repeat
    activate

    set initJS to my readFile(jsPath)
    execute foundTab javascript initJS

    set pollJS to "(window.__envatoDone === true) ? 'DONE:' + (window.__envatoUrls||[]).length : 'WAIT:' + (document.querySelectorAll('img').length)"
    set tries to 0
    repeat
      delay 1
      set pollResult to execute foundTab javascript pollJS
      if pollResult starts with "DONE:" then exit repeat
      set tries to tries + 1
      if tries > 700 then exit repeat
    end repeat

    set fetchJS to "(window.__envatoUrls || []).join(String.fromCharCode(10))"
    set urlList to execute foundTab javascript fetchJS
    return urlList
  end tell
end run

on readFile(thePath)
  set fileRef to open for access POSIX file thePath
  set theText to read fileRef as «class utf8»
  close access fileRef
  return theText
end readFile
