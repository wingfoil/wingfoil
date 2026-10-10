# WingFoil — the README's terminal demo (dl-128 item 2, Q1 (a)): a VHS tape, https://github.com/charmbracelet/vhs
#
# It records example 01 (run.sh, next to this file) and renders it to the GIF the README shows. The example
# checks itself, and the tape waits on screen for its closing `OK:` line: if the tool no longer matches the
# example, the wait lapses and `vhs` exits non-zero, so a stale animation is never rendered.
#
# Run from the repository root, after building the commit to record:
#
#   npm run build
#   vhs docs/examples/01-first-project/demo.tape
#
# VHS (with ttyd and ffmpeg) is a separate binary, not an npm dependency (dl-010). The example runs against
# that build (`dist/cli.js`), not against whatever `wingfoil` is on PATH. Commit hashes and timestamps differ
# on every recording; regenerate the GIF in `user-docs`' align-user-docs phase (demo.rendered).

Output docs/assets/wingfoil-demo-first-project.gif

Require bash
Require git
Require node

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 760
Set Padding 20
Set TypingSpeed 40ms

# Point the example at the build being recorded; not shown in the recording.
Hide
Type `export WINGFOIL="node $PWD/dist/cli.js" && clear`
Enter
Show

Type "bash docs/examples/01-first-project/run.sh"
Sleep 500ms
Enter

# The example prints `OK: …` as its last line only if every check passed; it prints `FAIL: …` otherwise.
Wait+Screen@120s /OK: first project/
Sleep 4s
