#!/bin/bash
# AutoClipper Installer for macOS

set -e

echo ""
echo "=================================="
echo "  AutoClipper - Instalador macOS"
echo "=================================="
echo ""

# Resolve the directory where this script lives (the unzipped folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_SRC="$SCRIPT_DIR/extension"

# Target: CEP extensions folder
TARGET_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.gartzzz.autoclipper"

# 1. Copy extension
echo "[1/3] Copiando extension a CEP..."
mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_DIR"/*
cp -R "$EXTENSION_SRC/"* "$TARGET_DIR/"
echo "      -> $TARGET_DIR"

# 2. Enable PlayerDebugMode for CSXS.11 and CSXS.12
echo "[2/3] Habilitando modo debug para CEP..."
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
echo "      -> CSXS.11 y CSXS.12 habilitados"

# 3. Done
echo "[3/3] Listo!"
echo ""
echo "=================================="
echo "  Instalacion completada"
echo "=================================="
echo ""
echo "Ahora:"
echo "  1. Abre (o reinicia) Adobe Premiere Pro"
echo "  2. Ve a Window > Extensions > AutoClipper"
echo ""
echo "Presiona cualquier tecla para cerrar..."
read -n 1 -s
