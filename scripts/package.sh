#!/bin/bash
# Package AutoClipper for distribution via GitHub Releases
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$REPO_ROOT/dist/AutoClipper"
OUTPUT="$REPO_ROOT/dist/AutoClipper.zip"

echo "Packaging AutoClipper..."

# Clean previous build
rm -rf "$REPO_ROOT/dist"
mkdir -p "$BUILD_DIR"

# Copy extension
cp -R "$REPO_ROOT/extension" "$BUILD_DIR/extension"

# Copy install scripts
cp "$REPO_ROOT/install-mac.command" "$BUILD_DIR/"
cp "$REPO_ROOT/install-windows.bat" "$BUILD_DIR/"

# Ensure mac script is executable
chmod +x "$BUILD_DIR/install-mac.command"

# Copy README
cp "$REPO_ROOT/scripts/README.txt" "$BUILD_DIR/README.txt"

# Create zip (from dist/ so the zip contains "AutoClipper/" as root folder)
cd "$REPO_ROOT/dist"
zip -r "AutoClipper.zip" "AutoClipper" -x "*.DS_Store"

# Clean temp
rm -rf "$BUILD_DIR"

echo ""
echo "Done! Output: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
