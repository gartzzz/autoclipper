# AutoClipper

Plugin de Adobe Premiere Pro que usa IA para detectar momentos virales y generar clips automaticamente. Optimizado para clases, mentorias y contenido educativo.

## Caracteristicas

- Analiza transcripciones con IA para detectar momentos con potencial viral
- **Algoritmo optimizado** para clases/mentorias con marca irreverente
- Interfaz keyboard-first para revisar clips rapidamente (← → para rechazar/aprobar)
- Genera secuencias independientes por cada clip aprobado
- Soporta presets de subtitulos
- **Sin servidor** - el plugin llama directamente a OpenRouter
- **Gratis** - usa DeepSeek R1 (64K contexto, optimizado para razonamiento)

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

## Algoritmo de Viralidad

Cada clip se puntua (0-100) con estos factores:

| Factor | Peso | Descripcion |
|--------|------|-------------|
| Insight | 25% | Momento "aha", cambio de perspectiva |
| Raw | 20% | Lenguaje directo, slang, personalidad |
| Actionable | 20% | Consejo aplicable inmediatamente |
| Hook | 15% | Gancho inicial que atrapa |
| Relatable | 10% | Problema comun que muchos tienen |
| Standalone | 10% | Funciona sin contexto previo |

**Calibracion:**
- 85-100: Oro - viral garantizado
- 70-84: Fuerte - buen potencial
- 55-69: Decente - necesita buen hook/edicion
- <55: Descartado automaticamente

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
