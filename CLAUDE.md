# ProductFinderSV

Bot local para Windows que vigila Facebook Marketplace (El Salvador, USD) y muestra los resultados en un panel web en `http://localhost:8787`. Se comparte con amigos que lo instalan en sus PCs. Plan y fases: [PLAN.md](PLAN.md). Uso: [README.md](README.md).

## Convenciones generales

- Idioma de la interfaz, mensajes y comentarios: **español**. En textos comunes la marca se escribe **ProductFinderSV**.
- Monorepo npm: `apps/server` (Node 24 + TypeScript, Fastify, `node:sqlite`, Playwright con Edge del sistema) y `apps/web` (React + Vite + Tailwind v4).
- En PowerShell usar `npm.cmd` (la política de ejecución bloquea `npm.ps1`).
- Verificar siempre: `npm test`, `npm run typecheck`, `npm run build`.
- La app nunca pide ni guarda la contraseña de Facebook; el servidor escucha solo en `127.0.0.1`.

## Identidad visual — obligatoria en todo el desarrollo

Fuente de verdad: [productfindersv_guia_identidad_visual_web.md](productfindersv_guia_identidad_visual_web.md). Todo componente, pantalla, icono, instalador o material nuevo debe seguirla. Resumen operativo:

**Concepto:** precisión geométrica + claridad de datos + negro/blanco + lima eléctrico. Tech / industrial / digital-minimal. La experiencia de encontrar y comparar productos siempre tiene prioridad sobre los adornos.

**Color** (tokens en `apps/web/src/index.css`; usar siempre los tokens, nunca HEX sueltos):
- Lima `#8EF400` (`lime`) solo como acento, ~5 % de la pantalla: CTA primario, estados activos, foco, "precio ideal"/mejor coincidencia. Hover `#79D400`, suave `#F0FFD9`.
- Negro `#080A09`, carbón `#151817`, blanco, superficie `#F7F8F6`, borde `#E2E5E0`, texto secundario `#69706B`.
- **Nunca texto blanco sobre lima**: sobre lima va texto negro. Texto lima solo sobre fondos oscuros; en claro usar `lime-ink`.
- Sin azules, púrpuras, degradados, vidrio esmerilado, glows ni sombras luminosas. Los colores semánticos (éxito, aviso, error) se permiten y deben ir acompañados de texto o icono; el lima no significa "éxito".

**Tipografía** (incluidas con `@fontsource`, funcionan sin internet):
- Titulares: Space Grotesk 500–700 (`font-display`), tracking ligeramente negativo.
- Cuerpo y controles: Inter 400–600 (`font-sans`).
- Microetiquetas técnicas: IBM Plex Mono 400–500 en mayúsculas con tracking 0.12em (clase `label-tech`). Solo para etiquetas, IDs y cifras técnicas, no para todo.
- El panel es una herramienta de producto: escala tipográfica compacta (títulos de página 28–32 px), no la de una landing.

**Geometría:** ángulos de 90°, espaciado en múltiplos de 4/8 px, bordes de 1 px (2 px para énfasis). Radios: 8 px controles (`rounded-lg`), 14 px tarjetas (`rounded-card`), 22 px bloques protagonistas (`rounded-panel`). Sombras escasas. Iconos lucide de línea (1.75–2 px), **sin emojis** como iconos.

**Recursos de marca, con moderación:**
- Esquinas de enfoque (`<FocusFrame>`): para el dato o producto destacado, el hover de las tarjetas y los estados de carga. No en todos los componentes.
- Retícula tenue (`bg-grid`) y cruces `+`: solo en paneles protagonistas o vacíos, nunca detrás de texto pequeño.
- Flechas lineales para navegación y descubrimiento.

**Componentes:** botón primario lima con texto negro; secundario blanco con borde gris (hover borde negro); oscuro negro con texto blanco. Foco visible siempre (negro en claro, lima en oscuro). Elemento seleccionado (nav, tabs, chips) = fondo negro con texto blanco. Hover de tarjeta = **un solo** efecto (esquinas de enfoque). Fotos de producto con `object-contain` sobre contenedor claro, también en modo oscuro. Transiciones de 150–220 ms y respeto a `prefers-reduced-motion`.

**Modos:** claro por defecto (preferente); oscuro opcional (fondo casi negro, superficies carbón, lima como acento).

**Logo:** usar los componentes de `apps/web/src/components/brand/`. ⚠️ El isotipo y el logotipo actuales son **provisionales** (reconstruidos a partir de una imagen de referencia). Cuando lleguen los SVG oficiales, reemplazarlos solo ahí y en `apps/web/public/`. No estirar, inclinar ni aplicar efectos; en espacios estrechos usar solo el isotipo.

**Tono:** claro, directo, orientado a resultados ("Ajusta tus criterios", "Ver coincidencias"). No afirmar que algo es "lo mejor" sin explicar el criterio (la puntuación siempre explica qué mide). Sin promesas de IA mágica ni de "precio más bajo garantizado".

Antes de dar por terminada una pantalla: checklist de la sección 15 de la guía (contraste WCAG AA, foco de teclado, estados vacío/carga/error, móvil con objetivos táctiles de ~44 px, movimiento reducido).
