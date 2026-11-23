# Records demo/demo.gif for the README.
# Run from the repo root after "npm run build":  vhs demo/demo.tape
# Needs VHS (https://github.com/charmbracelet/vhs) with ttyd and ffmpeg.

Output demo/demo.gif

Set Shell "powershell"
Set FontSize 16
Set Width 900
Set Height 860
Set Padding 24
Set TypingSpeed 70ms
# The default frame rate is more than screen capture keeps up with on Windows, and missed
# frames make the GIF play faster than real time. 10 frames a second is plenty for text.
Set Framerate 10

# Hidden setup: a short prompt (so no local paths show up), NO_COLOR removed (VHS
# sets it, and payload-map respects it) and a "payload-map" command that runs the
# local build, as if the package were installed.
Hide
Type "cd demo; Remove-Item Env:NO_COLOR; function prompt { '> ' }; function payload-map { node ..\dist\cli.js @args }; Clear-Host"
Enter
Sleep 1s
Show

# Scene 1: the whole map.
Sleep 500ms
Type "payload-map"
Sleep 400ms
Enter
# Loading the config takes a moment, so the tree is on screen for less than this.
Sleep 9s

# Scene 2: what points at media. The screen is cleared off camera between scenes.
Hide
Type "Clear-Host"
Enter
Sleep 500ms
Show

Sleep 500ms
Type "payload-map --to media"
Sleep 400ms
Enter
Sleep 6s
