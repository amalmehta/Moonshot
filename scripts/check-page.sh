#!/bin/zsh
# Load a page in headless Chrome, print its browser console errors, and save a screenshot.
# Usage: scripts/check-page.sh <page.html> [out.png] [width,height]
# Serve the site first:  python3 -m http.server 47321 --bind 127.0.0.1   (PORT env overrides)
# Pages with endless requestAnimationFrame loops may never settle in virtual time: use REALTIME=8000 (ms).
page=${1:?usage: check-page.sh page.html [out.png] [w,h]}
out=${2:-${TMPDIR:-/tmp}/moonshot-${page%.html}.png}
size=${3:-1400,1000}
port=${PORT:-47321}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
prof=$(mktemp -d -t moonshot-chrome)
log=$(mktemp -t moonshot-log)
rm -f "$out"
"$CHROME" --headless=new --user-data-dir="$prof" --no-first-run --hide-scrollbars \
  --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
  --enable-logging=stderr --v=0 --window-size=$size $( [[ -n "$REALTIME" ]] && echo "--timeout=${REALTIME}" || echo "--virtual-time-budget=${VTB:-10000}" ) \
  --screenshot="$out" "http://127.0.0.1:$port/$page" 2>"$log" >/dev/null &
# Chrome on macOS writes the screenshot but often doesn't exit, so wait for the file (max 150 s),
# then stop only this Chrome instance (matched by its private profile dir).
for i in {1..300}; do [[ -s "$out" ]] && break; sleep 0.5; done
sleep 1
pkill -f -- "--user-data-dir=$prof" 2>/dev/null
grep -E 'CONSOLE|Uncaught' "$log" | sed -E 's/^\[[^]]*\] //' | head -40
echo "screenshot: $out"
sleep 1; rm -rf "$prof" "$log" 2>/dev/null
