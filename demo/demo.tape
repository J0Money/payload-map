# Records demo/demo.gif for the README.
# Run from the repo root after "npm run build":  vhs demo/demo.tape
# Needs VHS (https://github.com/charmbracelet/vhs) with ttyd and ffmpeg.

Output demo/demo.gif

Set Shell "powershell"
Set FontSize 16
Set Width 900
Set Height 840
Set Padding 24
Set TypingSpeed 70ms

# Hidden setup: a short prompt (so no local paths show up), NO_COLOR removed (VHS
# sets it, and payload-map respects it) and a "payload-map" command that runs the
# local build, as if the package were installed.
Hide
Type "cd demo; Remove-Item Env:NO_COLOR; function prompt { '> ' }; function payload-map { node ..\dist\cli.js @args }; Clear-Host"
Enter
Sleep 1s
Show

Sleep 500ms
Type "payload-map"
Sleep 400ms
Enter
Sleep 6s
