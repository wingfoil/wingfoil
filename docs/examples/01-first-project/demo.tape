# WingFoil — the README's terminal demo (dl-128 item 2, Q1 (a)): a VHS tape, https://github.com/charmbracelet/vhs
#
# It records example 01 (run.sh, next to this file) and renders it to the GIF the README shows. The example
# checks itself and exits non-zero on its first failed check; the typed `|| exit 1` then closes the shell, so the
# prompt never comes back, the wait for it lapses, and `vhs` stops with an error before rendering: a stale
# animation is never produced.
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

Type "bash docs/examples/01-first-project/run.sh || exit 1"
Sleep 500ms
Enter

# Wait for the prompt (VHS's bash prompt is `> `) on the cursor's line. Not `Wait+Screen /OK: …/`: the screen scope
# reads the top rows of the terminal buffer, not the scrolled view, and the example's output is taller than the
# window, so its closing `OK:` line is never there (the render of 2026-10-10 timed out on it). The line scope reads
# the row the cursor is on, where the prompt returns only after `OK: …` has been printed.
Wait@120s /^>$/
# Hold the last frame, which shows the `OK: …` line above the prompt.
Sleep 4s
