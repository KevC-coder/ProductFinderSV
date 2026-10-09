# ProductFinderSV — Guía de identidad visual para web

**Versión:** 1.0  
**Fecha:** 8 de octubre de 2026  
**Uso:** Diseño e implementación de la interfaz web de ProductFinderSV.  
**Referencia:** Composición de marca proporcionada (logotipo, isotipo y variantes cromáticas).

> **Alcance:** Esta guía interpreta la identidad a partir de una imagen de referencia, no de archivos vectoriales o un manual oficial. Los códigos HEX y las fuentes propuestas son aproximaciones y recomendaciones para desarrollo, no especificaciones oficiales de la marca. Si se dispone del logo en SVG y de las fuentes originales, deben prevalecer esos archivos.

## 1. Personalidad y concepto

ProductFinderSV es una plataforma de **descubrimiento automatizado de productos** que combina extracción de información de sitios web, comparación, filtrado y algoritmos personalizados.

Su identidad comunica:

- **Precisión:** retículas, miras, esquinas de encuadre y marcas de alineación.
- **Tecnología funcional:** geometría, alto contraste y construcción visual sistemática.
- **Velocidad y automatización:** flechas, indicadores de progreso y patrones discretos de exploración.
- **Inteligencia y confianza:** jerarquía clara, datos legibles y ausencia de ornamentos innecesarios.

**Concepto rector:** *Encontrar lo que importa, con precisión algorítmica.*

La dirección visual debe sentirse **tech / industrial / digital-minimal**, no futurismo genérico, cyberpunk recargado ni interfaz de videojuegos.

## 2. ADN visual extraído de la referencia

| Elemento | Interpretación y regla |
|---|---|
| Logotipo | Wordmark geométrico, negro, ancho y compacto; termina con una `v` verde lima como acento. Mantener el archivo original, sin recomponer sus letras con fuentes corrientes. |
| Isotipo | `P` blanca geométrica sobre fondo negro, con un pequeño módulo verde y cuatro esquinas de enfoque en verde lima. |
| Símbolo recurrente | Cuatro brackets de enfoque alrededor de un objeto o dato; evoca búsqueda y localización. |
| Colores | Negro, blanco y lima eléctrico, con grises neutrales de apoyo. |
| Geometría | Ángulos de 90°, bordes definidos, módulos cuadrados y curvas moderadas en elementos grandes. |
| Detalles | Cruces de puntería, líneas guía finas, microetiquetas monoespaciadas, flechas y retículas tenues. |
| Composición | Mucho espacio negativo, titulares sólidos, énfasis puntual en verde. |

## 3. Paleta cromática

Los colores son una **propuesta inicial derivada visualmente** de la imagen y deben verificarse con los originales.

| Token | HEX propuesto | Uso |
|---|---|---|
| `--pf-lime` | `#8EF400` | Color de marca: detalles del isotipo, acentos, estados activos y CTA principales. |
| `--pf-lime-hover` | `#79D400` | Hover para superficies lima. |
| `--pf-lime-subtle` | `#F0FFD9` | Fondo muy suave para indicadores o mensajes informativos. |
| `--pf-black` | `#080A09` | Textos principales, fondos oscuros, iconografía. |
| `--pf-charcoal` | `#151817` | Tarjetas y contenedores oscuros. |
| `--pf-white` | `#FFFFFF` | Fondo principal y texto sobre negro. |
| `--pf-surface` | `#F7F8F6` | Superficie secundaria clara. |
| `--pf-border` | `#E2E5E0` | Líneas divisorias, inputs y bordes discretos. |
| `--pf-muted` | `#69706B` | Texto secundario y metadatos. |

### Proporciones visuales

- **70–80 %:** superficies blancas o muy claras.
- **15–25 %:** negro y gris oscuro en textos, tarjetas y secciones.
- **5 % aproximadamente:** lima eléctrico como acento, no como relleno de toda la interfaz.

En páginas oscuras se invierte la proporción entre blanco y negro, **manteniendo el lima como acento**.

### Uso correcto del color

- CTA primario: fondo lima + texto casi negro, o fondo negro + texto blanco con detalles lima.
- CTA secundario: fondo transparente, borde gris/negro y texto de alto contraste.
- El texto largo debe ser negro sobre blanco o blanco sobre negro.
- **Evitar texto blanco sobre lima**: suele perder contraste. Comprobar WCAG AA para cada combinación final.
- No usar verde de marca automáticamente para indicar “éxito”: los estados funcionales deben distinguirse también por etiquetas e iconos.
- No multiplicar acentos azules, púrpuras o degradados no presentes en la identidad.

## 4. Tipografía

El logotipo tiene un lettering geométrico característico: **no se debe replicar con una fuente tipográfica web**.

### Fuentes sugeridas para el sitio

1. **Titulares / UI destacada:** `Space Grotesk` (pesos 500–700). Alternativa de carácter más técnico: `Chakra Petch` (500–700).
2. **Cuerpo / controles:** `Inter` (400–600), para legibilidad en tablas, filtros y fichas.
3. **Microetiquetas / datos técnicos:** `IBM Plex Mono` (400–500), en mayúsculas y con tracking moderado.

Estas son elecciones de implementación propuestas, **no fuentes identificadas con certeza en la imagen**.

| Rol | Escritorio | Móvil | Estilo |
|---|---|---|---|
| H1 | 52–72 px | 36–44 px | Semibold/Bold, tracking ligeramente negativo. |
| H2 | 36–48 px | 28–34 px | Semibold. |
| H3 | 22–28 px | 20–24 px | Semibold. |
| Cuerpo | 16–18 px | 15–16 px | Inter regular, line-height 1.5–1.65. |
| Label técnico | 11–13 px | 10–12 px | IBM Plex Mono, mayúsculas, letter-spacing 0.10–0.16em. |

**Ejemplo de microcopy:** `FIND / COMPARE / FILTER / DISCOVER`.

## 5. Logotipo, isotipo y variantes

La referencia muestra tres aplicaciones horizontales:

- **Clara:** isotipo con verde y negro + logotipo oscuro sobre blanco.
- **Oscura:** isotipo claro y verde + logotipo blanco y verde sobre negro.
- **Lima:** símbolo y letras oscuras sobre superficie verde lima.

Además muestra un **icono de aplicación**: cuadrado negro de esquinas bastante redondeadas, `P` blanca y marcas de enfoque verdes.

### Reglas

- Utilizar **SVG oficial** para el header, footer y pantallas de carga; PNG/WebP solo como respaldo cuando proceda.
- No estirar, inclinar, agregar sombras, brillos, biseles, degradados ni contornos al logo.
- No separar ni mover la `v` verde final del wordmark.
- No introducir el logo completo dentro de áreas estrechas: allí usar solamente el isotipo.
- Reservar un margen de protección no inferior a la altura aproximada de una de las esquinas de enfoque alrededor del símbolo.
- El favicon puede usar solo la `P` + brackets de enfoque; comprobar legibilidad real a 16, 24 y 32 px. A tamaños mínimos simplificar las líneas secundarias si el SVG oficial lo permite.

**Importante:** el texto de marca debe escribirse como **ProductFinderSV** en contenido común. En logotipos y archivos visuales prevalece su composición gráfica original.

## 6. Sistema geométrico y decorativo

### Elementos distintivos

**A. Brackets de enfoque**  
Cuatro esquinas abiertas en verde, negro o blanco. Deben rodear información relevante (producto elegido, dato destacado, imagen de resultado) y no aparecer en todos los componentes a la vez.

**B. Retículas**  
Cuadrículas de líneas de 1 px con opacidad muy baja, preferentemente en banners, fondos del dashboard o paneles de visualización. No ubicarlas detrás de texto pequeño.

**C. Cruces y ejes**  
Pequeños signos `+`, líneas de centro y guías discontinuas para enfatizar precisión. Son decorativos; no deben confundirse con controles clicables.

**D. Flechas**  
Flechas simples y lineales para indicar descubrimiento, navegación o procesamiento. No sobreutilizar triples flechas como adorno.

**E. Contenedores**  
Cuadrados o rectángulos de radio pequeño/medio; reservar redondeos amplios para el icono de la aplicación o bloques protagonistas.

### Valores geométricos sugeridos

- Escala de espaciado: múltiplos de 4 y 8 px.
- Bordes: 1 px neutro; 2 px cuando un campo necesita énfasis accesible.
- Radios: 8 px para controles, 12–16 px para tarjetas, 20–24 px para bloques grandes.
- Sombras: suaves y escasas. Priorizar contraste de superficies y bordes.
- Iconos: línea consistente de 1.75–2 px; evitar emojis o iconos 3D como sustitutos.

## 7. Arquitectura visual de la web

### 7.1 Header

- Fondo blanco o negro, según la sección; altura aproximada 72–80 px en escritorio.
- Logotipo a la izquierda, navegación breve en el centro o derecha.
- CTA `Empezar búsqueda` o `Explorar productos` con acabado lima.
- Estado sticky opcional con borde inferior sutil; evitar transparencias fuertes o efectos glassmorphism.

### 7.2 Hero / portada

- Un titular principal contundente con la idea de **búsqueda automatizada**.
- Ejemplo: **«Encuentra mejores productos. Sin buscar uno por uno.»**
- Subtítulo explicando comparación, filtros y criterios algorítmicos.
- Un CTA de acción principal y uno secundario.
- Visual protagonista: interfaz real de búsqueda, resultados de productos o gráfico de flujo de descubrimiento. **Evitar ilustraciones genéricas de robots, chips o cerebros**.
- Se puede integrar una retícula tenue y un marco de enfoque alrededor del producto destacado.

### 7.3 Buscador y filtros

Esta es la principal herramienta del producto: debe priorizarse sobre la decoración.

- Buscador grande y contrastado, con placeholder específico: `¿Qué producto quieres encontrar?`.
- Filtros agrupados en categorías comprensibles: precio, fuente, especificaciones, valoración, disponibilidad u otros realmente implementados.
- Chips activos con estados visibles y acción inequívoca para eliminarlos.
- Resultados con precio, comercio/fuente, imagen, atributos comparables y enlace a origen cuando exista.
- Indicar claramente cuándo los resultados son recientes, cuándo se actualizaron y si la búsqueda sigue procesándose, cuando el sistema disponga de esos datos.

### 7.4 Tarjetas de producto

- Superficie predominantemente blanca, borde fino y 12–16 px de radio.
- Imagen clara y proporcionada del producto; evitar marcos verdes permanentes alrededor de todas las tarjetas.
- Nombre con tipografía legible, precio destacado, información secundaria discreta.
- Acción primaria accesible: `Ver producto` o `Comparar`.
- Usar verde para **selección, mejor coincidencia o foco**, siempre acompañado de texto explicativo; no indicar que un artículo es “el mejor” sin exponer el criterio del algoritmo.
- En hover: borde más oscuro, sombra apenas visible o un bracket de enfoque. No apilar los tres efectos.

### 7.5 Tablas y comparaciones

- Números alineados a la derecha, etiquetas alineadas a la izquierda.
- Tipografía monoespaciada solo para IDs, cifras técnicas o pequeñas etiquetas, no para todos los valores.
- Diferencias importantes resaltadas mediante color + texto/icono, nunca solo con color.
- Cabeceras fijas cuando la tabla sea extensa y horizontal scroll en móvil cuando no exista alternativa clara.

### 7.6 Estados vacíos, carga y errores

- **Vacío:** ejemplo de consulta y botón para iniciar una nueva búsqueda.
- **Cargando:** animación sutil basada en escaneo, líneas o brackets; respetar `prefers-reduced-motion`.
- **Sin coincidencias:** explicar qué filtros pueden ampliarse.
- **Error de scraping / fuente externa:** describir el problema sin hacer promesas falsas y ofrecer reintento cuando esté disponible.

## 8. Botones, inputs y estados

| Componente | Estado base | Hover / focus |
|---|---|---|
| Botón primario | Lima, texto negro, peso 600. | Lima ligeramente más oscuro; focus visible. |
| Botón secundario | Blanco, texto negro, borde gris. | Borde negro; focus visible. |
| Botón oscuro | Negro, texto blanco. | Gris carbón; focus visible lima. |
| Input | Fondo blanco, borde gris claro. | Focus con borde negro y anillo de foco visible. |
| Chip seleccionado | Fondo negro, texto blanco o borde lima. | Botón de eliminación separado y accesible. |
| Enlace | Texto oscuro subrayado o icono de dirección claro. | Subrayado reforzado; evitar depender solo del color. |

Las interacciones deben ser rápidas (aprox. 150–220 ms) y discretas. Evitar *glows* intensos, rebotes y pulsaciones permanentes.

## 9. Estilo de imágenes y fotografía

- Fotografías de producto **reales y claras**, tomadas de las fuentes permitidas.
- Fondos blancos o neutros para facilitar comparaciones.
- Recortes consistentes y proporciones estables (`object-fit: contain` para catálogo general).
- Para imágenes promocionales, usar composiciones editoriales de producto real con acentos de enfoque.
- Evitar renders de hardware ficticio, exceso de neón y efectos de inteligencia artificial estereotipados.

## 10. Modo claro y modo oscuro

**Modo claro (preferente para búsqueda y comparaciones):** blanco dominante, texto negro, acentos lima y bordes discretos.

**Modo oscuro (opcional):** fondo casi negro, superficies carbón, texto blanco y acentos lima. Las imágenes de productos deben conservar contenedores claros si requieren ese contraste.

No aplicar filtros invertidos al logotipo ni a fotografías. Usar variantes de marca correctas.

## 11. Responsive

| Rango sugerido | Aplicación |
|---|---|
| ≥ 1200 px | Hero de dos columnas, filtros laterales y cuadrícula de 3–4 tarjetas cuando haya espacio. |
| 768–1199 px | Reducir navegación y tarjetas a 2–3 columnas según ancho real. |
| < 768 px | Hero apilado, buscador primero, filtros en panel desplegable, tarjetas a 1–2 columnas según densidad. |

- El CTA principal debe conservar visibilidad sin bloquear el contenido.
- Los elementos táctiles deben tener objetivo cercano a 44 × 44 px.
- Reducir la decoración: menos retículas y brackets en pantallas pequeñas.
- No reducir el wordmark al punto de hacerlo ilegible; cambiar al isotipo cuando sea necesario.

## 12. Tokens CSS de referencia

```css
:root {
  /* Paleta propuesta: confirmar contra fuentes oficiales */
  --pf-lime: #8ef400;
  --pf-lime-hover: #79d400;
  --pf-lime-subtle: #f0ffd9;
  --pf-black: #080a09;
  --pf-charcoal: #151817;
  --pf-white: #ffffff;
  --pf-surface: #f7f8f6;
  --pf-border: #e2e5e0;
  --pf-muted: #69706b;

  --pf-font-display: "Space Grotesk", sans-serif;
  --pf-font-body: "Inter", sans-serif;
  --pf-font-mono: "IBM Plex Mono", monospace;

  --pf-radius-control: 8px;
  --pf-radius-card: 14px;
  --pf-radius-panel: 22px;
  --pf-container-max: 1280px;
  --pf-motion-fast: 180ms;
}

.pf-button-primary {
  background: var(--pf-lime);
  color: var(--pf-black);
  border: 1px solid transparent;
  border-radius: var(--pf-radius-control);
  font-family: var(--pf-font-body);
  font-weight: 600;
  transition: background var(--pf-motion-fast) ease;
}

.pf-button-primary:hover {
  background: var(--pf-lime-hover);
}

.pf-button-primary:focus-visible {
  outline: 2px solid var(--pf-black);
  outline-offset: 3px;
}

.pf-technical-label {
  font-family: var(--pf-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 13. Guía de tono y contenido

La voz de ProductFinderSV debe ser **clara, directa, técnica cuando sea necesario y orientada a resultados**.

- Preferir: `Busca en múltiples fuentes`, `Compara resultados`, `Ajusta tus criterios`, `Ver coincidencias`.
- Evitar: `La revolución definitiva de la inteligencia artificial`, `Magia impulsada por IA`, promesas como `Siempre encontrarás el precio más bajo` si no hay evidencia.
- Mostrar los beneficios mediante funcionalidad observable: automatización, criterios personalizados, ahorro de tiempo y comparación transparente.

## 14. Qué evitar

1. Llenar toda la web de verde lima: debe dirigir la atención, no competir con el contenido.
2. Repetir miras y retículas en cada componente: el recurso pierde personalidad si aparece en exceso.
3. Usar iconos genéricos flotando encima de tarjetas enormes sin información útil.
4. Sustituir las fichas reales por ilustraciones de tecnología no relacionadas con productos.
5. Usar degradados, vidrio esmerilado, efectos 3D o sombras luminosas sin justificación.
6. Sacrificar legibilidad por una tipografía excesivamente futurista.
7. Confundir rankings algorítmicos con resultados garantizados.

## 15. Checklist de aceptación para la implementación

- [ ] Uso del logo original y variantes apropiadas sobre fondos claros y oscuros.
- [ ] Paleta limitada a blanco, negro, grises y verde lima, salvo colores semánticos justificados.
- [ ] Tipografía de lectura cómoda, distinta del lettering del logo.
- [ ] CTA principal identificable y accesible.
- [ ] Interfaz de búsqueda, filtros y comparación priorizada sobre decoraciones.
- [ ] Uso moderado de brackets, guías y retículas.
- [ ] Estados de carga, sin resultados, error y selección diseñados.
- [ ] Contraste y foco de teclado comprobados bajo WCAG AA.
- [ ] Adaptación móvil con controles táctiles cómodos.
- [ ] Soporte para usuarios con movimiento reducido.
- [ ] Evitar afirmaciones comerciales que el algoritmo no pueda demostrar.

---

### Resumen de dirección para diseño y desarrollo

**ProductFinderSV = precisión geométrica + claridad de datos + negro/blanco + lima eléctrico.** La identidad se manifiesta en la estructura, las transiciones discretas y el enfoque de elementos importantes. **La experiencia de encontrar y comparar productos siempre tiene prioridad sobre los adornos gráficos.**
