# AutoClipper

Plugin de Adobe Premiere Pro que usa IA para detectar momentos virales y generar clips automaticamente.

## Caracteristicas

- Analiza transcripciones con LLM para detectar momentos con potencial viral
- Interfaz keyboard-first para revisar clips rapidamente
- Genera secuencias independientes por cada clip aprobado
- Soporta presets de subtitulos
- 100% local o via OpenRouter (Kimi K2 gratis)

## Estructura

```
autoclipper/
├── extension/          # Plugin CEP de Premiere
│   ├── CSXS/          # Manifest
│   ├── client/        # Panel HTML/JS
│   └── host/          # ExtendScript
└── server/            # Servidor Node.js
    └── src/           # TypeScript source
```

## Instalacion

### 1. Servidor

```bash
cd server
npm install
npm run dev
```

### 2. Plugin CEP

```bash
# Copiar extension a carpeta de Adobe CEP
cp -r extension ~/Library/Application\ Support/Adobe/CEP/extensions/com.gartzzz.autoclipper

# Habilitar modo debug de CEP (solo desarrollo)
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

### 3. En Premiere Pro

Window > Extensions > AutoClipper

## Uso

1. Transcribe tus clips en Premiere (Speech to Text)
2. Copia la transcripcion (click derecho > Copy Transcript)
3. Pega en AutoClipper
4. Revisa los momentos detectados con ← →
5. Genera secuencias de los clips aprobados

## Configuracion

Variables de entorno para el servidor:

```bash
# OpenRouter (por defecto)
OPENROUTER_API_KEY=sk-or-...

# O usar Ollama local
USE_OLLAMA=true
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
```

## Desarrollo

```bash
# Servidor en modo desarrollo
cd server && npm run dev

# Ver logs de CEP
/Applications/Adobe\ Premiere\ Pro\ 2024/Adobe\ Premiere\ Pro\ 2024.app/Contents/MacOS/Adobe\ Premiere\ Pro\ 2024 --enable-cep-logging
```

## Licencia

MIT
