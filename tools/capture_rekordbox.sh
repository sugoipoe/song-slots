#!/bin/bash
# Captures Rekordbox table by taking screenshots and scrolling
# Usage: Run this, then quickly click on the Rekordbox track list table

OUTDIR="/Users/ericchen/Projects/random_mix/rb_screenshots"
mkdir -p "$OUTDIR"
NUM_SCREENSHOTS=${1:-40}
SCROLL_AMOUNT=${2:-10}

echo "=== Rekordbox Table Capture ==="
echo "Will take $NUM_SCREENSHOTS screenshots, scrolling $SCROLL_AMOUNT lines each time."
echo ""
echo "INSTRUCTIONS:"
echo "1. Switch to Rekordbox NOW"
echo "2. Click on the track list table so it has focus"
echo "3. Scroll to the TOP of the list"
echo "4. Come back here and press ENTER to start"
read -r

echo "Starting capture in 3 seconds — switch to Rekordbox!"
sleep 3

for i in $(seq 1 "$NUM_SCREENSHOTS"); do
    # Take screenshot of frontmost window
    screencapture -x -o -l "$(osascript -e 'tell application "System Events" to return id of first window of (first process whose frontmost is true)' 2>/dev/null)" "$OUTDIR/rb_$(printf '%03d' "$i").png" 2>/dev/null

    # Fallback: if window capture fails, capture whole screen
    if [ ! -f "$OUTDIR/rb_$(printf '%03d' "$i").png" ]; then
        screencapture -x "$OUTDIR/rb_$(printf '%03d' "$i").png"
    fi

    echo "Screenshot $i/$NUM_SCREENSHOTS taken"

    # Scroll down
    if [ "$i" -lt "$NUM_SCREENSHOTS" ]; then
        osascript -e "tell application \"System Events\" to key code 125 using {}" # down arrow
        # Send multiple down arrows for scrolling
        for j in $(seq 1 "$SCROLL_AMOUNT"); do
            osascript -e "tell application \"System Events\" to key code 125"
        done
        sleep 0.3
    fi
done

echo ""
echo "Done! Captured $NUM_SCREENSHOTS screenshots in $OUTDIR"
