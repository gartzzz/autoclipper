# AutoClipper

Plugin de Adobe Premiere Pro que usa IA (Kimi K2 gratis) para detectar momentos virales y generar clips automaticamente.

## Caracteristicas

- Analiza transcripciones con IA para detectar momentos con potencial viral
- Interfaz keyboard-first para revisar clips rapidamente (← → para rechazar/aprobar)
- Genera secuencias independientes por cada clip aprobado
- Soporta presets de subtitulos
- **Sin servidor** - el plugin llama directamente a OpenRouter
- **Gratis** - usa Kimi K2 (moonshotai/kimi-k2:free)

## Instalacion

### 1. Copiar plugin a CEP

```bash
# macOS
cp -r extension ~/Library/Application\ Support/Adobe/CEP/extensions/com.gartzzz.autoclipper

# Windows
xcopy extension "%APPDATA%\Adobe\CEP\extensions\com.gartzzz.autoclipper" /E /I
```

### 2. Habilitar modo debug (solo desarrollo)

```bash
# macOS
defaults write com.adobe.CSXS.11 PlayerDebugMode 1

# Windows (ejecutar como admin)
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1
```

### 3. Reiniciar Premiere Pro

Window > Extensions > AutoClipper

### 4. Configurar API Key

1. Obtener key gratis en: https://openrouter.ai/keys
2. Pegarla en Settings del plugin (icono de engranaje)

## Uso

1. Transcribe tus clips en Premiere (Speech to Text)
2. Click derecho en panel Transcripcion > "Copy Transcript"
3. Pega en AutoClipper (Cmd+V)
4. Click "Analizar Momentos Virales"
5. Revisa con ← → (rechazar/aprobar)
6. Genera secuencias

## Atajos de teclado

| Tecla | Accion |
|-------|--------|
| → | Aprobar clip |
| ← | Rechazar clip |
| Espacio | Reproducir clip |

## Estructura

```
autoclipper/
├── extension/          # Plugin CEP
│   ├── CSXS/          # Manifest
│   ├── client/        # UI (HTML/CSS/JS)
│   └── host/          # ExtendScript (Premiere API)
└── server/            # (opcional) Servidor para Ollama local
```

## Licencia

MIT
