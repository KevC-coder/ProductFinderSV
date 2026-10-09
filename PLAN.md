# ProductFinderSV — Plan de implementación y requerimientos

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
5. **Notificaciones** de nuevos resultados (avisos de Windows; Telegram pospuesto, ver §12).
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
- Aviso de Windows al terminar una búsqueda automática con resultados nuevos o bajadas de precio: un aviso por búsqueda con el resultado de mayor puntuación; clic → abre sus resultados en la ventana de la app. "Probar ahora" no avisa (el resultado ya se ve en el panel).
- Configurable: todo / solo "precio ideal" / sin avisos.
- *Pospuesto:* bot de Telegram (token + chat id configurados por el usuario) para recibir alertas en el celular.

**RF-06 Ejecución en segundo plano**
- Proceso que arranca al iniciar sesión en Windows (desactivable en Ajustes), sin ventana visible, con icono en la bandeja del sistema (Abrir panel / Ver resultados / Pausar-Reanudar / Cerrar).
- Registro (logs) de cada corrida: hora, búsqueda, # resultados, # nuevos, errores.

**RF-07 Configuración**
- Límites globales (máx. corridas/hora, separación entre corridas, publicaciones por corrida, pausas por error y por verificación), modo del navegador (visible / fuera de pantalla / oculto), avisos e inicio con Windows. El máximo de detalles abiertos se define por búsqueda.
- Fijos por ahora: puerto 8787, idioma español y moneda USD; la ubicación se define en cada búsqueda.
- Exportar/importar búsquedas (JSON) para compartir búsquedas entre amigos (pantalla Búsquedas).

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
│  │  Navegador   │ ◄───────────────────────► │  ProductFinderSV (proceso Node.js) │  │
│  │  (dashboard) │      REST + SSE           │                                    │  │
│  └──────────────┘                           │  ├─ API HTTP (Fastify)             │  │
│                                             │  ├─ Scheduler (cola, 1 a la vez)   │  │
│  ┌──────────────┐                           │  ├─ Scraper (Playwright → Edge)    │──┼──► facebook.com/marketplace
│  │ Bandeja Win  │ ◄──── tray / toasts ───── │  ├─ Matcher (filtros + scoring)    │  │
│  └──────────────┘                           │  ├─ Notifier (avisos de Windows)   │  │
│                                             │  └─ SQLite (node:sqlite)           │  │
│                                             └────────────────────────────────────┘  │
│  %LOCALAPPDATA%\productFindersv\ → productfindersv.db, browser-profile\, logs\      │
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
| Notificaciones | API de avisos de Windows vía **PowerShell** (`ToastNotificationManager`) | Sin binarios nativos que empaquetar; Telegram pospuesto. |
| Bandeja del sistema | **PowerShell + WinForms** (`NotifyIcon`) que habla con la API local | Abrir panel / ver resultados / pausar / cerrar. |
| Empaquetado | **Node SEA**: un solo `ProductFinderSV.exe` autoinstalable (servidor, panel y Playwright embebidos) | Los amigos instalan con doble clic, sin permisos de administrador. |

> Alternativa equivalente: Python 3.11 + FastAPI + Playwright + SQLite + PyInstaller. Se elige Node por el empaquetado sin módulos nativos y el uso de Edge del sistema.

### 3.2 ¿"Servicio de Windows" real o proceso en segundo plano?

Un **Windows Service clásico** corre en la *Sesión 0* como `LocalSystem`: **no puede mostrar la ventana del navegador** para iniciar sesión en Facebook ni mostrar toasts, y usaría un perfil distinto al del usuario. Por eso se recomienda:

- **Opción elegida:** valor en la clave **`HKCU\...\CurrentVersion\Run`** que lanza `ProductFinderSV.exe --background` al iniciar sesión, + icono en bandeja. Se comporta como servicio (siempre activo, auto-arranque) pero en la sesión del usuario y, a diferencia de una tarea programada "al iniciar sesión", no requiere permisos de administrador.
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
Filtros (descartan): vendido, fuera del rango de precio, más antigua que la antigüedad máxima, contiene una keyword excluida, faltan keywords obligatorias (todas o alguna). Si las obligatorias podrían estar en la descripción y aún no se leyó, el resultado queda pendiente de abrir su detalle.

Puntuación 0–100 para ordenar los que pasan (`apps/server/src/matcher/evaluate.ts`):
- Base **50**.
- **Precio** — con precio ideal: ≤ ideal suma +20 a +30 (más cuanto más barato); por encima resta hasta −30 (proporcional entre el ideal y el máximo, o 1,5 × ideal si no hay máximo). Sin precio ideal pero con máximo: hasta +20 cuanto más cerca del mínimo.
- **Keywords deseables**: +5 cada una (máx. +15).
- **Frescura**: +10 si tiene menos de 2 h, +5 si menos de 24 h.
- Normalización de texto: minúsculas, sin acentos, números separados de letras (`iphone13` = `iphone 13`, `128GB` = `128 gb`) y comparación por palabras completas (`13` no coincide con `130`).

---

## 5. Modelo de datos (SQLite)

Esquema real en `apps/server/src/db/database.ts` (migraciones versionadas con `PRAGMA user_version`).

```sql
watchers(id, name, query, must_keywords JSON, must_mode ['all','any'], bonus_keywords JSON,
         exclude_keywords JSON, search_description, min_price, max_price, ideal_price,
         location_slug, radius_km, conditions JSON, max_age_hours, runs_per_day,
         window_start, window_end, max_details, active, next_run_at, consecutive_failures,
         created_at, updated_at)

listings(id PK = fb_listing_id, title, title_key, description, price, price_text, currency,
         location, image_url, url, seller_name, condition, listed_at, is_sold, is_pending,
         first_seen_at, last_seen_at, detail_fetched_at, previous_price, price_dropped_at)

matches(id, watcher_id FK, listing_id FK, score, is_ideal_price, matched_keywords JSON,
        status ['new','seen','favorite','dismissed'], duplicate_of, notified_at,
        created_at, updated_at, UNIQUE(watcher_id, listing_id))

price_history(listing_id FK, price, seen_at)

runs(id, watcher_id FK, started_at, finished_at, status ['running','ok','error','checkpoint','logged_out'],
     found_count, new_count, details_fetched, error_message)

settings(key PK, value JSON)
```

La moneda es siempre USD (El Salvador), por eso no hay `currency` en `watchers`. Las keywords "deseables" (`bonus_keywords`) suben la puntuación pero no son obligatorias.

---

## 6. API REST (local)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/status` | Estado del bot, sesión FB, próxima corrida, conteos |
| POST | `/api/session/connect` | Abre ventana de login de Facebook |
| POST | `/api/scheduler/resume` | Quita la pausa automática tras una verificación |
| GET/POST | `/api/watchers` | Listar / crear búsquedas |
| GET | `/api/watchers/export` | Archivo JSON con las búsquedas (solo criterios) |
| POST | `/api/watchers/import` | Crea búsquedas desde un archivo exportado (todas o ninguna) |
| GET/PATCH/DELETE | `/api/watchers/:id` | Ver / editar (parcial) / borrar |
| POST | `/api/watchers/:id/run` | Ejecutar ahora |
| GET | `/api/matches?watcherId=&status=&sort=` | Resultados |
| PATCH | `/api/matches/:id` | Cambiar estado (visto/favorito/descartado) |
| GET | `/api/listings/:id/price-history` | Historial de precio |
| GET | `/api/runs` | Log de corridas |
| GET/PATCH | `/api/settings` | Configuración |
| GET/PUT | `/api/system/autostart` | Inicio con Windows (solo app de escritorio) |
| POST | `/api/system/shutdown` | Cerrar el servicio |
| GET | `/api/events` | SSE (corrida iniciada/terminada, sesión) |

---

## 7. Dashboard (pantallas)

1. **Inicio** — tarjetas: búsquedas activas, nuevos hoy, mejores ofertas (top score), estado de sesión y próxima corrida.
2. **Búsquedas** — lista con toggle on/off, botón "Probar ahora", formulario de creación/edición con todos los campos de RF-02.
3. **Resultados** — grid de tarjetas con foto, precio (resaltado si es ideal), badges, filtros y acciones.
4. **Detalle** — descripción, historial de precio (mini gráfico), keywords que hicieron match, link a FB.
5. **Actividad** — log de corridas y errores.
6. **Ajustes** — sesión de Facebook, bot y modo del navegador, notificaciones, límites, inicio con Windows y cierre de la app.
7. **Bienvenida** (primer arranque) — aviso de riesgos que se acepta una vez; luego la tarjeta "Para empezar" de Inicio guía la conexión de Facebook y la primera búsqueda.

Exportar/importar búsquedas está en **Búsquedas**.

---

## 8. Estructura del proyecto

```
ProductFinderSV/
├─ apps/
│  ├─ server/            # Node + TS: API, scheduler, scraper, matcher, notifier, db
│  │  ├─ src/
│  │  │  ├─ api/         # rutas Fastify, esquemas y errores en español, SSE
│  │  │  ├─ scheduler/   # bot (cola, límites, backoff) y cálculo de horarios
│  │  │  ├─ runner/      # una corrida completa y la cola serial del navegador
│  │  │  ├─ scraper/     # Edge + sesión, búsqueda, detalle, parsers/ (JSON de Facebook y DOM)
│  │  │  ├─ matcher/     # normalización de texto, filtros y puntuación
│  │  │  ├─ notifier/    # avisos de Windows
│  │  │  ├─ desktop/     # bandeja, inicio con Windows, enlaces y scripts de instalación (PowerShell)
│  │  │  ├─ db/          # esquema, migraciones y repositorios
│  │  │  └─ spike/       # scripts de la Fase 0
│  │  └─ test/           # node:test; los parsers se prueban con respuestas de Facebook de ejemplo en el propio test
│  ├─ web/               # React + Vite + Tailwind (dashboard)
│  └─ desktop/           # lanzador e instalador: ProductFinderSV.exe (Node SEA)
├─ .github/workflows/    # CI y publicación de releases
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
| ✅ **F4 — Notificaciones + bandeja + auto-arranque** | Avisos de Windows, icono en la bandeja e inicio con Windows (clave Run). Telegram pospuesto. | 2 días |
| ✅ **F5 — Instalador y distribución** (adelantada: `.exe` autoinstalable con Node SEA en lugar de Inno Setup) | `ProductFinderSV.exe` que se instala solo, desinstalador en Configuración → Aplicaciones, pantalla de bienvenida, exportar/importar búsquedas, publicación por GitHub Releases. | 2 días |
| **F6 — Mejoras (opcional)** | Scoring con IA (Claude API) para evaluar si la descripción describe "el producto ideal", detección de estafas, multi-ubicación, Telegram, aviso de actualizaciones. | — |

\* Estimados para un desarrollador con ayuda de Claude Code.

---

## 10. Distribución a amigos

- Un solo `ProductFinderSV.exe` (GitHub Releases) que al abrirlo: se copia a `%LOCALAPPDATA%\Programs\ProductFinderSV`, crea accesos directos (escritorio y menú Inicio), se registra en Configuración → Aplicaciones (con desinstalador), activa el inicio con Windows y abre el panel en su propia ventana.
- Primer arranque → pantalla de bienvenida: (1) aceptar aviso de riesgos; luego Inicio guía (2) conectar Facebook y (3) crear la primera búsqueda.
- Cada amigo usa **su propia cuenta y su propio PC**; nada se comparte entre instalaciones (salvo exportar/importar búsquedas en JSON).
- Firma de código: sin certificado, Windows SmartScreen mostrará advertencia ("Más información → Ejecutar de todas formas"); documentado en el README.
- Actualizaciones: descargar el nuevo `.exe` y abrirlo (cierra la versión en ejecución y la reemplaza conservando los datos). *Pendiente (F6):* aviso de versión nueva en el panel.

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

4. Ventana del navegador: **fuera de pantalla** por defecto (ventana normal colocada fuera de la vista: tan discreta para Facebook como una visible, sin molestar al usuario). Configurable en Ajustes: visible / fuera de pantalla / oculto (headless).

**Tomadas (2026-10-09)**

5. Auto-arranque con la clave **Run** de HKCU en lugar del Programador de tareas (no requiere administrador).
6. Avisos y bandeja con **PowerShell** (API de avisos de Windows y WinForms) en lugar de `node-notifier`/`systray2`: sin binarios nativos dentro del ejecutable SEA.
7. Empaquetado con **Node SEA** (un único `.exe` que se instala solo) en lugar de Inno Setup.
