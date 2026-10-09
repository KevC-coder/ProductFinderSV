# productFindersv — Plan de implementación y requerimientos

> Bot local para Windows que vigila Facebook Marketplace varias veces al día, filtra publicaciones según búsquedas definidas por el usuario y muestra los resultados en un dashboard web en `http://localhost:8787`.

---

## 0. Advertencias antes de empezar (leer primero)

| Riesgo | Detalle | Mitigación en el diseño |
|---|---|---|
| **Términos de Servicio de Meta** | Meta prohíbe la recolección automatizada (scraping) sin permiso. No existe API pública de Marketplace. | Uso personal, bajo volumen, comportamiento "humano". El README para amigos debe decir claramente que **lo usan bajo su propio riesgo**. |
| **Bloqueo / checkpoint de la cuenta** | Demasiadas peticiones o patrones robóticos → captcha, checkpoint o suspensión. | Límites duros de frecuencia, jitter aleatorio, horario "de día", pausa automática si se detecta checkpoint. Recomendar usar una cuenta secundaria. |
| **Credenciales** | Guardar contraseñas de Facebook es peligroso. | **La app nunca pide ni guarda la contraseña.** El usuario inicia sesión manualmente en una ventana del navegador; solo se reutiliza el perfil/cookies locales. |
| **Fragilidad** | Facebook cambia su HTML/GraphQL con frecuencia. | Capa de extracción aislada (un solo módulo) con estrategia doble (GraphQL + DOM) y tests con fixtures guardados. |
| **Captchas** | No se deben resolver automáticamente. | Si aparece, el bot se pausa y notifica al usuario para que lo resuelva a mano. |

---

## 1. Objetivo y alcance

### MVP (v1)
1. Panel web local para **crear/editar/pausar búsquedas** ("watchers").
2. Bot que ejecuta cada búsqueda **N veces al día** dentro de una ventana horaria.
3. Filtrado local por keywords (incluir/excluir, en título y descripción), rango de precio, ubicación/radio, antigüedad.
4. **Lista de resultados** con foto, precio, título, ubicación, fecha, link, estado (nuevo / visto / favorito / descartado).
5. **Notificaciones** de nuevos resultados (toast de Windows; Telegram opcional).
6. Arranque automático con Windows y ejecución en segundo plano.
7. **Instalador** sencillo (`.exe`) para compartir con amigos.

### Fuera de alcance v1 (fases futuras)
- Enviar mensajes al vendedor automáticamente (alto riesgo de ban; no recomendado).
- Multi-usuario / acceso remoto desde el celular.
- Puntuación con IA del "producto ideal" (ver Fase 5).

---

## 2. Requerimientos

### 2.1 Funcionales

**RF-01 Sesión de Facebook**
- Botón "Conectar Facebook" en el panel → abre una ventana de Edge con un perfil dedicado de la app → el usuario inicia sesión → la app detecta la sesión y la guarda en el perfil local.
- Indicador de estado: `Conectado` / `Sesión expirada` / `Checkpoint — requiere acción`.

**RF-02 Gestión de búsquedas (watchers)** — campos:
| Campo | Tipo | Ejemplo |
|---|---|---|
| Nombre | texto | "iPhone 13 barato" |
| Consulta principal (query que se envía a Marketplace) | texto | `iphone 13` |
| Keywords obligatorias (todas / alguna) | lista + modo AND/OR | `128gb`, `liberado` |
| Keywords excluidas | lista | `roto`, `icloud`, `piezas`, `caja` |
| Buscar keywords en | título / descripción / ambos | ambos |
| Precio mín / máx | número + moneda | 150 – 350 USD |
| "Precio ideal" (objetivo) | número | 250 → resalta resultados ≤ 250 |
| Ubicación + radio | ciudad / coordenadas + km | San Salvador, 40 km |
| Condición | nuevo / usado / cualquiera | usado |
| Antigüedad máxima | horas/días | últimas 24 h |
| Frecuencia | veces al día o cada X min (mín. 30 min) | 6 veces/día |
| Ventana horaria | hora inicio–fin | 07:00 – 23:00 |
| Activo | on/off | on |

- Botón **"Probar ahora"** que ejecuta la búsqueda inmediatamente y muestra resultados de previsualización.

**RF-03 Motor de búsqueda**
- Abre la URL de búsqueda de Marketplace con parámetros (`query`, `minPrice`, `maxPrice`, `daysSinceListed`, `sortBy=creation_time_descend`, `radius`, etc.).
- Extrae publicaciones (id, título, precio, moneda, ubicación, foto, url, fecha si existe).
- Para candidatos que pasan el filtro de título/precio y requieren keywords en descripción: abre el detalle (con límite por corrida) y extrae descripción, condición y vendedor.
- **Deduplicación** por `listing_id`; detecta **bajadas de precio** en publicaciones ya vistas.

**RF-04 Resultados**
- Tabla/grid filtrable por búsqueda, estado, rango de precio, fecha.
- Badges: `NUEVO`, `PRECIO IDEAL`, `BAJÓ DE PRECIO`.
- Acciones: abrir en Facebook, marcar visto, favorito, descartar (y no volver a mostrar).
- Historial de precio por publicación.

**RF-05 Notificaciones**
- Toast de Windows al encontrar resultados nuevos (con clic → abre el dashboard o el anuncio).
- Opcional: bot de Telegram (token + chat id configurados por el usuario) para recibir alertas en el celular.
- Configurable: notificar todo / solo "precio ideal" / resumen.

**RF-06 Ejecución en segundo plano**
- Proceso que arranca al iniciar sesión en Windows, sin ventana visible, con icono en la bandeja del sistema (Abrir panel / Pausar / Salir).
- Registro (logs) de cada corrida: hora, búsqueda, # resultados, # nuevos, errores.

**RF-07 Configuración**
- Puerto del dashboard, límites globales (máx. corridas/hora, máx. detalles abiertos por corrida), navegador headless sí/no, idioma, moneda por defecto, ubicación por defecto.
- Exportar/importar búsquedas (JSON) para compartir búsquedas entre amigos.

### 2.2 No funcionales
| ID | Requerimiento |
|---|---|
| RNF-01 | Todo corre en local; el servidor escucha **solo en `127.0.0.1`** (no expuesto a la red). |
| RNF-02 | Sin contraseñas guardadas; datos en `%LOCALAPPDATA%\productFindersv\`. |
| RNF-03 | Consumo bajo: navegador se abre solo durante la corrida y se cierra después. |
| RNF-04 | Tolerante a fallos: si una búsqueda falla, se reintenta con backoff y no detiene las demás. |
| RNF-05 | Anti-detección "honesta": delays aleatorios, una sola pestaña, scroll humano, nunca corridas en paralelo. |
| RNF-06 | Instalación en < 5 min por un usuario no técnico, sin instalar Node/Python a mano. |
| RNF-07 | Windows 10/11 x64. |

---

## 3. Arquitectura

```
┌───────────────────────────── PC del usuario (Windows) ─────────────────────────────┐
│                                                                                     │
│  ┌──────────────┐   http://127.0.0.1:8787   ┌────────────────────────────────────┐  │
│  │  Navegador   │ ◄───────────────────────► │  productFindersv (proceso Node.js) │  │
│  │  (dashboard) │      REST + SSE           │                                    │  │
│  └──────────────┘                           │  ├─ API HTTP (Fastify)             │  │
│                                             │  ├─ Scheduler (cola, 1 a la vez)   │  │
│  ┌──────────────┐                           │  ├─ Scraper (Playwright → Edge)    │──┼──► facebook.com/marketplace
│  │ Bandeja Win  │ ◄──── tray / toasts ───── │  ├─ Matcher (filtros + scoring)    │  │
│  └──────────────┘                           │  ├─ Notifier (toast / Telegram)    │  │
│                                             │  └─ SQLite (node:sqlite)           │  │
│                                             └────────────────────────────────────┘  │
│        %LOCALAPPDATA%\productFindersv\  → db.sqlite, browser-profile\, logs\        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Stack recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| Runtime | **Node.js 24 LTS + TypeScript** | Un solo lenguaje para backend y frontend; Playwright es de primera clase en Node. |
| Automatización | **playwright-core** con `channel: 'msedge'` | **Edge viene preinstalado en Windows 10/11** → no hay que distribuir Chromium (~150 MB). `launchPersistentContext` mantiene la sesión. |
| API | **Fastify** | Liviano, rápido, validación de esquemas. |
| Base de datos | **SQLite vía `node:sqlite`** (integrado en Node 24) | Sin dependencias nativas → empaquetado mucho más simple que `better-sqlite3`. |
| Scheduler | Implementación propia (cola + `setTimeout` con jitter) | Necesitamos jitter, ventanas horarias y ejecución serial; cron puro no basta. |
| Frontend | **React + Vite + Tailwind** (build estático servido por Fastify) | Dashboard moderno; en producción no requiere servidor aparte. |
| Tiempo real | Server-Sent Events | Para "nuevo resultado" y estado del bot en vivo sin recargar. |
| Notificaciones | `node-notifier` (toasts Windows) + Telegram Bot API (opcional) | |
| Bandeja del sistema | `systray2` (o similar) | Abrir panel / pausar / salir. |
| Empaquetado | Node portable + app compilada + **Inno Setup** → `productFindersv-setup.exe` | Los amigos instalan con doble clic. |

> Alternativa equivalente: Python 3.11 + FastAPI + Playwright + SQLite + PyInstaller. Se elige Node por el empaquetado sin módulos nativos y el uso de Edge del sistema.

### 3.2 ¿"Servicio de Windows" real o proceso en segundo plano?

Un **Windows Service clásico** corre en la *Sesión 0* como `LocalSystem`: **no puede mostrar la ventana del navegador** para iniciar sesión en Facebook ni mostrar toasts, y usaría un perfil distinto al del usuario. Por eso se recomienda:

- **Opción recomendada:** tarea del **Programador de tareas** "Al iniciar sesión" que lanza el proceso oculto (`productFindersv.exe --background`) + icono en bandeja. Se comporta como servicio (siempre activo, auto-arranque, auto-reinicio) pero en la sesión del usuario.
- **Opción avanzada (opcional):** servicio con **WinSW/NSSM** configurado para correr *como el usuario*, en modo headless, después de haber hecho el login una vez en modo interactivo. Sin toasts (solo Telegram).

---

## 4. Diseño del scraper (la parte crítica)

### 4.1 Flujo de una corrida
1. Scheduler toma el siguiente watcher pendiente (nunca dos a la vez).
2. Lanza Edge con el perfil persistente (`headless` configurable; headed minimizado es menos detectable).
3. Verifica sesión (si redirige a login/checkpoint → marca estado, notifica, pausa todo).
4. Navega a `https://www.facebook.com/marketplace/<ubicación>/search?query=...&minPrice=...&maxPrice=...&daysSinceListed=...&sortBy=creation_time_descend&exact=false`.
5. **Extracción doble:**
   - **Primaria — GraphQL:** escuchar `page.on('response')` de `/api/graphql/` y parsear los nodos de listings del JSON (más estable que el HTML ofuscado).
   - **Respaldo — DOM:** selectores sobre enlaces `a[href*="/marketplace/item/"]` + texto de precio/título.
6. Scroll humano 2–5 veces (delays 1.5–4 s) hasta N publicaciones o fin.
7. Filtro rápido (precio, keywords excluidas en título).
8. Para candidatos que requieren descripción: abrir detalle (máx. 5–10 por corrida, delay 3–8 s entre cada uno).
9. Matcher → guarda/actualiza en BD → detecta nuevos y bajadas de precio → notifica.
10. Cierra el navegador. Programa la próxima corrida con jitter ±20 %.

### 4.2 Reglas de seguridad (rate limits)
- Mínimo 30 min entre corridas del mismo watcher; tope global configurable (p. ej. 12 corridas/hora).
- Ventana horaria por defecto 07:00–23:30 (un humano no busca a las 4 a.m. cada 30 min).
- Backoff exponencial ante errores; pausa total de 6–12 h ante checkpoint/captcha.
- Nunca enviar mensajes, dar likes ni interactuar.

### 4.3 Matcher y "producto ideal"
Score 0–100 para ordenar resultados:
- +40 si precio ≤ precio ideal (proporcional a cuánto más barato).
- +20 por cada keyword "deseable" encontrada (con tope).
- +10 si publicación < 2 h (oportunidad).
- −100 (descartar) si contiene keyword excluida.
- Normalización de texto: minúsculas, sin acentos, sinónimos opcionales (`iphone13` = `iphone 13`).

---

## 5. Modelo de datos (SQLite)

```sql
watchers(id, name, query, must_keywords JSON, must_mode, any_keywords JSON,
         exclude_keywords JSON, search_in, min_price, max_price, ideal_price, currency,
         location_slug, radius_km, condition, max_age_hours,
         runs_per_day, window_start, window_end, active, created_at, updated_at)

listings(id PK = fb_listing_id, title, description, price, currency, location,
         image_url, url, seller_name, condition, listed_at,
         first_seen_at, last_seen_at, is_available)

matches(id, watcher_id FK, listing_id FK, score, status ['new','seen','favorite','dismissed'],
        matched_keywords JSON, notified_at, created_at, UNIQUE(watcher_id, listing_id))

price_history(listing_id FK, price, seen_at)

runs(id, watcher_id FK, started_at, finished_at, status ['ok','error','checkpoint'],
     found_count, new_count, error_message)

settings(key PK, value JSON)
```

---

## 6. API REST (local)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/status` | Estado del bot, sesión FB, próxima corrida |
| POST | `/api/session/connect` | Abre ventana de login de Facebook |
| GET/POST | `/api/watchers` | Listar / crear búsquedas |
| GET/PUT/DELETE | `/api/watchers/:id` | Ver / editar / borrar |
| POST | `/api/watchers/:id/run` | Ejecutar ahora |
| GET | `/api/matches?watcher=&status=&sort=` | Resultados |
| PATCH | `/api/matches/:id` | Cambiar estado (visto/favorito/descartado) |
| GET | `/api/listings/:id/price-history` | Historial de precio |
| GET | `/api/runs` | Log de corridas |
| GET/PUT | `/api/settings` | Configuración |
| GET | `/api/events` | SSE (nuevos resultados, estado) |

---

## 7. Dashboard (pantallas)

1. **Inicio** — tarjetas: búsquedas activas, nuevos hoy, mejores ofertas (top score), estado de sesión y próxima corrida.
2. **Búsquedas** — lista con toggle on/off, botón "Probar ahora", formulario de creación/edición con todos los campos de RF-02.
3. **Resultados** — grid de tarjetas con foto, precio (resaltado si es ideal), badges, filtros y acciones.
4. **Detalle** — descripción, historial de precio (mini gráfico), keywords que hicieron match, link a FB.
5. **Actividad** — log de corridas y errores.
6. **Ajustes** — sesión de Facebook, límites, notificaciones (Telegram), exportar/importar búsquedas.

---

## 8. Estructura del proyecto

```
productFindersv/
├─ apps/
│  ├─ server/            # Node + TS: API, scheduler, scraper, matcher, notifier, db
│  │  └─ src/
│  │     ├─ api/         # rutas Fastify
│  │     ├─ scheduler/
│  │     ├─ scraper/     # fb-session.ts, marketplace-search.ts, parsers/ (graphql, dom)
│  │     ├─ matcher/
│  │     ├─ notifier/
│  │     ├─ db/          # esquema + migraciones
│  │     └─ tray/
│  └─ web/               # React + Vite + Tailwind (dashboard)
├─ installer/            # script Inno Setup, iconos, tarea programada
├─ tests/fixtures/       # respuestas GraphQL/HTML guardadas para tests del parser
├─ PLAN.md
└─ README.md
```

---

## 9. Fases y entregables

| Fase | Entregable | Estimado* |
|---|---|---|
| ✅ **F0 — Spike técnico** | Script que abre Edge con perfil persistente, login manual, busca "iphone" y extrae 20 listings vía GraphQL/DOM. **Valida la viabilidad antes de construir lo demás.** | 1–2 días |
| ✅ **F1 — Núcleo backend** | Esquema SQLite, CRUD de watchers, scraper modular, matcher, deduplicación, API REST. | 3–4 días |
| ✅ **F2 — Scheduler + seguridad** | Cola serial, frecuencias, ventanas horarias, jitter, backoff, detección de checkpoint, logs. | 2 días |
| ✅ **F3 — Dashboard** | Pantallas 1–6, SSE en vivo. | 3–4 días |
| **F4 — Notificaciones + bandeja + auto-arranque** | Toasts, Telegram opcional, systray, tarea programada al iniciar sesión. | 2 días |
| ✅ **F5 — Instalador y distribución** (adelantada: `.exe` autoinstalable con Node SEA en lugar de Inno Setup; publicación por GitHub Releases) | `productFindersv-setup.exe` (Inno Setup), README para amigos, desinstalador limpio, actualización por GitHub Releases. | 2 días |
| **F6 — Mejoras (opcional)** | Scoring con IA (Claude API) para evaluar si la descripción describe "el producto ideal", detección de estafas, multi-ubicación. | — |

\* Estimados para un desarrollador con ayuda de Claude Code.

---

## 10. Distribución a amigos

- Instalador `.exe` que: copia Node portable + app a `%LOCALAPPDATA%\Programs\productFindersv`, crea acceso directo, registra la tarea "al iniciar sesión", y abre `http://localhost:8787` al terminar.
- Primer arranque → asistente: (1) aceptar aviso de riesgos, (2) conectar Facebook, (3) crear primera búsqueda.
- Cada amigo usa **su propia cuenta y su propio PC**; nada se comparte entre instalaciones (salvo exportar/importar búsquedas en JSON).
- Firma de código: sin certificado, Windows SmartScreen mostrará advertencia ("Más información → Ejecutar de todas formas"); documentarlo en el README.
- Actualizaciones: chequeo opcional contra GitHub Releases y aviso en el dashboard.

---

## 11. Criterios de aceptación del MVP

- [ ] Instalar en un PC limpio con Windows 11 en < 5 min sin instalar nada más.
- [ ] Conectar Facebook sin escribir la contraseña en la app.
- [ ] Crear una búsqueda con keywords incluidas/excluidas y rango de precio; "Probar ahora" muestra resultados correctos.
- [ ] Con 3 búsquedas activas a 6 corridas/día, la app corre 7 días seguidos sin intervención ni bloqueo de cuenta.
- [ ] Un resultado nuevo genera notificación en < 1 min tras la corrida.
- [ ] Reiniciar el PC → el bot vuelve a arrancar solo.
- [ ] El puerto 8787 no es accesible desde otro equipo de la red.

---

## 12. Decisiones

**Tomadas (2026-10-08)**
1. Stack: **Node.js 24 + TypeScript**.
2. País/moneda: **El Salvador, USD** (locale `es-SV`, zona `America/El_Salvador`).
3. Telegram: **se pospone** a una fase posterior; el MVP usa solo notificaciones de Windows.

**Abiertas**
4. ¿Ventana del navegador visible minimizada (más seguro) o headless (más discreto)? Se decidirá con los resultados de la Fase 0.
