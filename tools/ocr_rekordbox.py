#!/usr/bin/env python3
"""
OCR Rekordbox screenshots and extract track metadata.
Uses macOS Vision framework via Swift subprocess.

Usage:
    python3 ocr_rekordbox.py <screenshot_dir_or_file> [-o output.json]
"""

import subprocess
import sys
import os
import json
import glob
import tempfile

SWIFT_OCR = '''
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)
guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
      let originalImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    fputs("ERROR: Could not load image\\n", stderr)
    exit(1)
}

// Scale up 2x for better CJK character recognition
let scaleFactor: CGFloat = 2.0
let newW = Int(CGFloat(originalImage.width) * scaleFactor)
let newH = Int(CGFloat(originalImage.height) * scaleFactor)
let nsImage = NSImage(cgImage: originalImage, size: NSSize(width: originalImage.width, height: originalImage.height))
let scaledRep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: newW, pixelsHigh: newH,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: scaledRep)
NSGraphicsContext.current?.imageInterpolation = .high
nsImage.draw(in: NSRect(x: 0, y: 0, width: newW, height: newH))
NSGraphicsContext.restoreGraphicsState()
guard let cgImage = scaledRep.cgImage else {
    fputs("ERROR: Failed to scale image\\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        fputs("ERROR: No results\\n", stderr)
        return
    }
    for obs in observations {
        if let candidate = obs.topCandidates(1).first {
            let box = obs.boundingBox
            print(String(format: "%.4f|%.4f|%.4f|%@",
                box.origin.y, box.origin.x, box.width, candidate.string))
        }
    }
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US", "ja", "ko", "zh-Hans", "zh-Hant"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("ERROR: \\(error)\\n", stderr)
    exit(1)
}
'''

# Column X-position ranges (normalized 0-1 from Vision framework)
COLUMNS = {
    'row_num': (0.03, 0.08),
    'title':   (0.28, 0.48),
    'key':     (0.48, 0.52),
    'artist':  (0.55, 0.68),
    'bpm':     (0.68, 0.74),
    'time':    (0.74, 0.80),
}

HEADER_TEXTS = {'Track Title', 'Key', 'Artist', 'BPM', 'Time', 'Grouping',
                'Date Added', 'Preview', 'Artwork', '#'}


def run_ocr(image_path):
    """Run Vision OCR on a single image."""
    with tempfile.NamedTemporaryFile(suffix='.swift', mode='w', delete=False) as f:
        f.write(SWIFT_OCR)
        swift_path = f.name
    try:
        result = subprocess.run(
            ['swift', swift_path, image_path],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            print(f"  OCR error: {result.stderr.strip()[:200]}", file=sys.stderr)
            return []
        items = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split('|', 3)
            if len(parts) == 4:
                y, x, w, text = float(parts[0]), float(parts[1]), float(parts[2]), parts[3]
                items.append((y, x, w, text))
        return items
    finally:
        os.unlink(swift_path)


def classify_column(x):
    for col_name, (lo, hi) in COLUMNS.items():
        if lo <= x <= hi:
            return col_name
    return None


def group_into_rows(items, y_tolerance=0.008):
    """Group OCR items into rows by Y position."""
    items.sort(key=lambda i: -i[0])
    rows = []
    current_row = []
    current_y = None
    for y, x, w, text in items:
        if text in HEADER_TEXTS:
            continue
        if current_y is None or abs(y - current_y) > y_tolerance:
            if current_row:
                rows.append(current_row)
            current_row = [(y, x, w, text)]
            current_y = y
        else:
            current_row.append((y, x, w, text))
    if current_row:
        rows.append(current_row)
    return rows


def parse_rows(rows):
    """Convert grouped rows into track dicts. Returns (tracks, incomplete_rows)."""
    tracks = []
    incomplete = []

    for row_items in rows:
        track = {}
        row_num = None
        for y, x, w, text in row_items:
            col = classify_column(x)
            if col == 'row_num':
                # Extract just the number from things like "H-CUE 33"
                nums = ''.join(c for c in text if c.isdigit())
                if nums:
                    row_num = int(nums)
            elif col:
                track[col] = text

        if not track.get('title') and not track.get('artist'):
            continue

        # Clean BPM
        if 'bpm' in track:
            try:
                track['bpm'] = str(float(track['bpm'].replace(' ', '')))
            except ValueError:
                pass

        if row_num is not None:
            track['_row'] = row_num

        # Flag incomplete rows (missing title — likely CJK text that OCR missed)
        if not track.get('title'):
            incomplete.append(track)
        else:
            tracks.append(track)

    return tracks, incomplete


def process_screenshots(path):
    if os.path.isfile(path):
        files = [path]
    elif os.path.isdir(path):
        files = sorted(
            glob.glob(os.path.join(path, '*.png')) +
            glob.glob(os.path.join(path, '*.jpg'))
        )
    else:
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)

    all_tracks = []
    all_incomplete = []

    for i, f in enumerate(files):
        print(f"Processing {i+1}/{len(files)}: {os.path.basename(f)}", file=sys.stderr)
        items = run_ocr(f)
        rows = group_into_rows(items)
        tracks, incomplete = parse_rows(rows)

        all_tracks.extend(tracks)

        for t in incomplete:
            row = t.get('_row', '?')
            all_incomplete.append({'file': os.path.basename(f), 'row': row, **t})

        print(f"  {len(tracks)} tracks, {len(incomplete)} incomplete ({len(all_tracks)} total)",
              file=sys.stderr)

    return all_tracks, all_incomplete


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 ocr_rekordbox.py <screenshot_or_dir> [-o output.json]")
        sys.exit(1)

    path = sys.argv[1]
    output = None
    if '-o' in sys.argv:
        output = sys.argv[sys.argv.index('-o') + 1]

    tracks, incomplete = process_screenshots(path)

    # Remove internal _row field from output
    for t in tracks:
        t.pop('_row', None)

    print(f"\nExtracted {len(tracks)} tracks", file=sys.stderr)
    if incomplete:
        print(f"\n{len(incomplete)} INCOMPLETE ROWS (missing title — likely CJK text):", file=sys.stderr)
        for inc in incomplete:
            print(f"  File: {inc.get('file')} | Row: {inc.get('row')} | "
                  f"Artist: {inc.get('artist', '?')} | Key: {inc.get('key', '?')} | "
                  f"BPM: {inc.get('bpm', '?')}", file=sys.stderr)

    result = json.dumps(tracks, indent=2, ensure_ascii=False)
    if output:
        with open(output, 'w') as f:
            f.write(result)
        print(f"Saved to {output}", file=sys.stderr)

        # Save incomplete rows separately
        if incomplete:
            inc_path = output.replace('.json', '_incomplete.json')
            with open(inc_path, 'w') as f:
                json.dump(incomplete, f, indent=2, ensure_ascii=False)
            print(f"Incomplete rows saved to {inc_path}", file=sys.stderr)
    else:
        print(result)


if __name__ == '__main__':
    main()
