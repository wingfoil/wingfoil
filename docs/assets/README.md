# WingFoil brand assets

The project's logo and the images WingFoil shows on GitHub. They are versioned here so that every
image the repository displays, or that was uploaded to GitHub by hand, traces to a file in the
repository and can be regenerated from it.

None of them ships in the npm package: `package.json` `files` is `["dist", "README.md"]`, which
`npm pack --dry-run` confirms.

## Files

| File | What | Source | Used by |
|---|---|---|---|
| `wingfoil-logo.svg` | Full logo: mark plus the "WingFoil" wordmark, transparent background, 163×167 | source | reference |
| `wingfoil-logo.png` | the full logo, 512 px wide, transparent background | generated | wherever an SVG is not accepted |
| `wingfoil-mark.svg` | The mark alone, transparent background | source | `README.md` header |
| `wingfoil-mark.png` | the mark, 512 px wide, transparent background | generated | wherever an SVG is not accepted |
| `wingfoil-social-preview.svg` | 1280×640 banner, light background | source | — |
| `wingfoil-social-preview.png` | the light banner, rendered | generated | repository social preview (`svc-004-github-repository-settings`) |
| `wingfoil-social-preview-dark.svg` | 1280×640 banner, dark background | source | — |
| `wingfoil-social-preview-dark.png` | the dark banner, rendered | generated | alternative to the light banner |
| `wingfoil-avatar.png` | 500×500, the mark centred on white | generated | organisation avatar (`svc-001-github-organisation-wingfoil`) |
| `wingfoil-demo-first-project.gif` | terminal recording of example 01, 1200×760 | generated from `docs/examples/01-first-project/demo.tape` | `README.md` demo |

The SVGs are the sources, and the PNGs are generated from them. Edit an SVG, never a PNG. All text in
the SVGs is converted to paths, so they render the same on any machine without the Inter fonts.

## Regenerating the PNGs

Run from the repository root. [Inkscape](https://inkscape.org/) 1.x renders the SVGs, and
[ImageMagick](https://imagemagick.org/) pads the avatar. Neither is a project dependency: install
them on the machine that regenerates the assets.

```bash
# Logo and mark, 512 px wide, transparent background (height follows the aspect ratio)
inkscape docs/assets/wingfoil-logo.svg \
  --export-type=png --export-filename=docs/assets/wingfoil-logo.png -w 512
inkscape docs/assets/wingfoil-mark.svg \
  --export-type=png --export-filename=docs/assets/wingfoil-mark.png -w 512

# Social preview banners, 1280×640
inkscape docs/assets/wingfoil-social-preview.svg \
  --export-type=png --export-filename=docs/assets/wingfoil-social-preview.png -w 1280 -h 640
inkscape docs/assets/wingfoil-social-preview-dark.svg \
  --export-type=png --export-filename=docs/assets/wingfoil-social-preview-dark.png -w 1280 -h 640

# Organisation avatar, 500×500: the mark 380 px wide, centred on white, no transparency.
# Organisation avatars are shown as rounded squares, user avatars as circles; at 380 px the
# mark stays inside either crop.
inkscape docs/assets/wingfoil-mark.svg \
  --export-type=png --export-filename=/tmp/wingfoil-mark-380.png -w 380
convert /tmp/wingfoil-mark-380.png -background white -gravity center -extent 500x500 \
  -alpha remove -alpha off docs/assets/wingfoil-avatar.png
```

Check the result:

```bash
file docs/assets/*.png   # 1280 x 640 banners, 500 x 500 avatar, 512 x 525 logo, 512 x 364 mark
ls -l docs/assets/*.png  # each banner must stay under 1 MB (GitHub's limit)
```

## Regenerating the demo GIF

The README's demo is rendered by [VHS](https://github.com/charmbracelet/vhs) from a tape next to the example it
records (`dl-128` Q1 (a)). The tape runs `docs/examples/01-first-project/run.sh || exit 1` against the build in
`dist/` and waits for the shell's prompt to return. A build that no longer passes the example makes the example
exit non-zero, `|| exit 1` closes the shell, the prompt never returns, and `vhs` stops with
`timeout waiting for …` before rendering, so no new GIF is written. (The tape waits on the cursor's line, not with
`Wait+Screen`: the screen scope reads the top rows of the terminal buffer, which the example's output scrolls past.)
VHS (with its `ttyd` and `ffmpeg`) is not a project dependency: install it on the machine that
regenerates the asset. Rendering is a manual step of each release's `user-docs` phase (`align-user-docs`, check
`demo.rendered`), done by hand on the approver's ruling of 2026-10-10.

**1. Install the tools (Ubuntu/Debian).** VHS comes from Charm's apt repository; `ttyd` and `ffmpeg` from the
distribution:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
  | sudo tee /etc/apt/sources.list.d/charm.list
sudo apt update && sudo apt install vhs ttyd ffmpeg
vhs --version && ttyd --version && ffmpeg -version | head -1
```

If `vhs` refuses the distribution's `ttyd` as too old, install a newer `ttyd` from its GitHub releases page
(<https://github.com/tsl0922/ttyd/releases>) and put it first on `PATH`.
VHS drives a headless Chrome/Chromium: on a machine without one, its browser launcher downloads Chromium on the
first run. The approver's render of 2026-10-11 used vhs v0.12.1 with Ubuntu's `ttyd` 1.7.4.

**2. Render**, from the repository root:

```bash
npm run build && vhs docs/examples/01-first-project/demo.tape   # writes docs/assets/wingfoil-demo-first-project.gif
```

**3. Check the result:**

```bash
git diff --stat                                # lists docs/assets/wingfoil-demo-first-project.gif (new or changed)
npx jest test/docs/presentation.test.ts        # passes
```

Commit hashes and timestamps differ on every recording, so the GIF changes each time it is regenerated. Commit it
with the release's documentation changes.

## Editing the wordmark

The wordmark is stored as paths, so changing its text means drawing it again:

1. In Inkscape, delete the wordmark group: `text25` in the logo, `text47` in the banners.
2. Type the new text with the same font:
   - logo: Inter Bold, 25.5 px, letter-spacing −0.2, centred, fill `#081532`, baseline y = 157;
   - banners: Inter Display Bold, 112 px, letter-spacing −2, left edge x ≈ 556, baseline y = 262.

   The wordmark fill is `#081532` in the light banner and `#ffffff` in the dark one.
3. *Path → Object to Path*, save, and regenerate the PNGs.

The same can be done headless: replace the group with a `<text>` element carrying those attributes,
then run
`inkscape in.svg --export-text-to-path --export-type=svg --export-filename=out.svg`.

## Uploading to GitHub

GitHub has no API for either image. The approver uploads them by hand:

- **Social preview:** repository → *Settings → General → Social preview → Edit*. GitHub accepts
  PNG, JPG or GIF, under 1 MB; 1280×640 is the recommended size.
- **Organisation avatar:** organisation → *Settings → Profile → Profile picture*.

After an upload, update the matching `service` element (`svc-004` for the social preview, `svc-001`
for the avatar) so that it names the file and the commit it was uploaded from.

## Design notes

- The banner shows:
  - the mark;
  - the "WingFoil" wordmark;
  - the README's lead sentence *"A structured harness for AI-assisted software development, built to make it
    deterministic."* (`dl-112` Q3 (i): determinism is the goal, not a property already reached), on two lines in
    Inter Medium 28 px, left edge x = 560, baselines y = 322 and 360 (`text49`, `text51`, stored as paths: change
    them as the wordmark below, through a `<text>` element and `--export-text-to-path`);
  - the five pillar chips: Memory · DNA · Directives · Workflow · CLI + MCP;
  - `$ npm install -g wingfoil`;
  - "Open source · MIT";
  - a teal→blue bar along the bottom.

  If the README's lead sentence or the pillars change, the banner changes with them.
- Colours: mark gradient `#22CEC6` → `#1686C8` → `#0C469F` (the dark variant brightens the last stop
  to `#1C5CCC`); wordmark `#081532` on light, `#ffffff` on dark.
