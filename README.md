# ProductFinderSV

Bot local para Windows que vigila Facebook Marketplace (El Salvador, USD) y muestra los resultados en un dashboard local. Ver el plan completo en [PLAN.md](PLAN.md).

> ⚠️ Facebook no permite la automatización en sus términos de servicio. Úsalo con moderación y bajo tu propio riesgo; idealmente con una cuenta secundaria. La app **nunca** pide ni guarda tu contraseña.

## Instalar (usuarios)

1. Descarga **`ProductFinderSV.exe`** de la sección [Releases](../../releases) del repositorio.
2. Ábrelo con doble clic. Como el ejecutable no está firmado, Windows puede mostrar *"Windows protegió su PC"*: pulsa **Más información → Ejecutar de todas formas**.
3. ProductFinderSV se instala solo (sin permisos de administrador), crea accesos directos en el **escritorio** y el **menú Inicio**, queda en **Configuración → Aplicaciones**, se configura para **iniciar con Windows** y abre el panel en su propia ventana.
4. En el panel: acepta el aviso de riesgos → **Conectar Facebook** → inicia sesión en la ventana de Edge que se abre → crea tu primera búsqueda.

Requisitos: Windows 10/11 con Microsoft Edge (ya viene instalado). No hace falta instalar nada más.

- **Cerrar la ventana no detiene el bot**: sigue buscando en segundo plano, con su icono junto al reloj de Windows (clic → abre el panel; clic derecho → ver resultados, pausar/reanudar las búsquedas automáticas o cerrar). Para detenerlo: *icono → Cerrar ProductFinderSV* o *Ajustes → Aplicación → Cerrar ProductFinderSV*. Para volver a abrirlo, usa el acceso directo.
- **Inicio con Windows**: activado de fábrica; se cambia en *Ajustes → Aplicación → Iniciar con Windows*.
- **Avisos**: cuando una búsqueda automática encuentra resultados nuevos o una bajada de precio, Windows muestra un aviso; al hacer clic se abren esos resultados. En *Ajustes → Notificaciones* eliges todos, solo precio ideal o ninguno.
- **Compartir búsquedas**: en *Búsquedas → Exportar* se descarga un `.json` con tus criterios (sin resultados ni datos de tu cuenta); tu amigo lo carga con *Importar*.
- **Actualizar**: descarga el nuevo `.exe` y ábrelo; reemplaza la versión anterior y conserva tus búsquedas y resultados.
- **Desinstalar**: *Configuración de Windows → Aplicaciones → ProductFinderSV → Desinstalar*. Pregunta si también quieres borrar tus datos (búsquedas, resultados y la sesión de Facebook de la app, en `%LOCALAPPDATA%\productFindersv`). Si la entrada no aparece (versiones anteriores), abre una vez el `.exe` nuevo para que se registre.

## Publicar una versión (mantenedor)

El `.exe` (~92 MB) **no se sube al repositorio**: lo construye GitHub Actions y lo adjunta al Release.

1. Sube la versión en `package.json` (p. ej. `0.2.0`) y haz commit.
2. Crea y sube la etiqueta:
   ```bash
   git tag v0.2.0
   ```
   ```bash
   git push origin v0.2.0
   ```
3. El workflow [release.yml](.github/workflows/release.yml) ejecuta los tests, construye `ProductFinderSV.exe` y lo publica en Releases.

Para construirlo localmente:

```bash
npm run package
```

El resultado queda en `release/ProductFinderSV.exe`. Es un Node *Single Executable Application* con el servidor, el panel y Playwright embebidos ([apps/desktop](apps/desktop)). Al reemplazar el isotipo provisional por el oficial, regenera los iconos con `npm run icons`.

Modos del ejecutable (los usa Windows; no hace falta escribirlos a mano):

| Argumento | Uso |
|---|---|
| *(ninguno)* | Instala/actualiza, arranca el servicio y abre el panel |
| `--background` | Igual pero sin abrir el panel (inicio con Windows) |
| `--open productfindersv://resultados?watcher=3` | Abre una pantalla concreta (clic en un aviso) |
| `--server` | El servicio en sí (lo lanza el propio ejecutable) |
| `--uninstall` | Desinstalador (Configuración → Aplicaciones) |

Cada push a `main` y cada pull request pasan por [ci.yml](.github/workflows/ci.yml): typecheck, tests y build.

## Requisitos (desarrollo)
- Windows 10/11 con Microsoft Edge (ya viene instalado)
- Node.js 24+

```bash
npm install
```

## Fase 0 — prueba de viabilidad

1. **Iniciar sesión en Facebook** (una sola vez). Se abre una ventana de Edge; inicia sesión ahí manualmente:
   ```bash
   npm run fb:login
   ```
2. **Probar una búsqueda:**
   ```bash
   npm run spike -- --query "iphone 13" --min 100 --max 400 --days 7 --details 3
   ```

| Opción | Descripción |
|---|---|
| `--query` | Texto a buscar (obligatorio) |
| `--min` / `--max` | Rango de precio en USD |
| `--days` | Antigüedad máxima: `1`, `7` o `30` |
| `--location` | Slug/id de ciudad de Marketplace (sin él usa la ubicación de tu cuenta) |
| `--radius` | Radio en km |
| `--limit` | Máximo de resultados (default 20) |
| `--details` | Cuántas publicaciones abrir para leer la descripción (default 0) |
| `--mode` | `visible` (default), `offscreen` (ventana fuera de pantalla) o `headless` (sin ventana) |
| `--save-raw` | Guardar las respuestas crudas de Facebook para depurar el parser |

Los datos locales (perfil del navegador, base de datos, resultados de depuración) se guardan en `%LOCALAPPDATA%\productFindersv\`.

## Uso diario

```bash
npm run build
```

```bash
npm run start
```

Abre **http://localhost:8787**: ahí se conecta Facebook, se crean búsquedas, se ven los resultados y se ajusta el bot. El servidor solo escucha en `127.0.0.1` (no es accesible desde otros equipos de la red).

Pantallas del panel:
- **Bienvenida** (solo la primera vez) — aviso de riesgos que se acepta una vez.
- **Inicio** — estado del bot y de la sesión, pasos para empezar, contadores, mejores ofertas nuevas y actividad reciente.
- **Resultados** — tarjetas con foto, precio, puntuación e insignias (nuevo, precio ideal, bajó de precio, descripción sin revisar); filtros por búsqueda, estado, precio y orden; detalle con descripción e historial de precio.
- **Búsquedas** — crear, editar, activar/pausar, "Probar ahora", eliminar, exportar e importar.
- **Actividad** — registro de cada corrida.
- **Ajustes** — sesión de Facebook, interruptor del bot, modo del navegador, notificaciones, límites de frecuencia, manejo de errores e inicio con Windows.

El panel se actualiza en vivo (Server-Sent Events): avisa cuando una búsqueda termina con resultados nuevos o si Facebook pide verificación.

### Desarrollo del panel

Con el servidor corriendo (`npm run dev` recarga el backend al editar), en otra terminal:

```bash
npm run dev:web
```

Abre http://localhost:5173 (Vite con recarga instantánea; reenvía `/api` al puerto 8787).

## Fase 1 — API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/status` | Sesión de Facebook, cola del navegador, conteos |
| POST | `/api/session/connect` | Abre la ventana de login de Facebook |
| GET / POST | `/api/watchers` | Listar / crear búsquedas |
| GET | `/api/watchers/export` | Búsquedas en JSON para compartir (solo criterios) |
| POST | `/api/watchers/import` | Crear búsquedas desde ese JSON (todas o ninguna) |
| GET / PATCH / DELETE | `/api/watchers/:id` | Ver / editar (parcial) / borrar |
| POST | `/api/watchers/:id/run` | Ejecutar ya (`?wait=true` espera el resumen) |
| GET | `/api/matches` | Resultados: `watcherId`, `status`, `minPrice`, `maxPrice`, `sort=score\|newest\|price`, `includeDuplicates`, `limit`, `offset` |
| PATCH | `/api/matches/:id` | `{ "status": "seen" \| "favorite" \| "dismissed" }` |
| GET | `/api/listings/:id/price-history` | Historial de precio |
| GET | `/api/runs` | Registro de corridas |
| GET / PATCH | `/api/settings` | Ajustes del bot (ver tabla abajo) |
| POST | `/api/scheduler/resume` | Quitar la pausa automática tras una verificación de Facebook |
| GET / PUT | `/api/system/autostart` | Inicio con Windows `{ "enabled": true }` (solo en el ejecutable) |
| POST | `/api/system/shutdown` | Cerrar el servicio |
| GET | `/api/events` | Eventos en vivo (SSE): `run:started`, `run:finished`, `session:changed` |

Cómo filtra una búsqueda:
- **Keywords** se comparan normalizadas (sin acentos ni mayúsculas, `128GB` = `128 gb`, `iphone13` = `iphone 13`) y como palabras completas (`13` no coincide con `130`).
- Si cumple por **título**, se muestra de inmediato; si hay keywords excluidas y `searchDescription` está activo, la descripción se revisa después (hasta `maxDetails` por corrida) y el resultado se quita si la descripción lo descarta.
- **Republicaciones** (mismo vendedor, título y precio) se ocultan como duplicados.
- **Puntuación** 0–100: precio respecto al ideal, keywords deseables y qué tan reciente es.

## Fase 2 — corridas automáticas

Al arrancar el servidor, el bot revisa cada 15 s si alguna búsqueda activa debe correr. Cada búsqueda reparte sus `runsPerDay` dentro de su horario (`windowStart`–`windowEnd`, admite cruzar medianoche); una búsqueda nueva corre en 1–3 min si está en horario. Las corridas son siempre de una en una.

Ajustes globales (editables con `PATCH /api/settings`, y desde el panel en la Fase 3):

| Ajuste | Default | Qué hace |
|---|---|---|
| `schedulerEnabled` | `true` | Interruptor general del bot |
| `browserMode` | `offscreen` | Ventana de Edge al buscar: `visible`, `offscreen` (fuera de pantalla) o `headless` (sin ventana). El login siempre es visible |
| `maxRunsPerHour` | 12 | Tope de corridas por hora entre todas las búsquedas |
| `minIntervalMinutes` | 30 | Separación mínima entre corridas de una misma búsqueda |
| `jitterPercent` | 20 | Variación aleatoria del intervalo (±%) |
| `minGapSeconds` | 90 | Pausa mínima entre dos corridas cualesquiera |
| `checkpointPauseHours` | 8 | Pausa total si Facebook pide verificación de seguridad |
| `errorBackoffMinutes` / `maxBackoffMinutes` | 15 / 240 | Espera tras errores (se duplica con cada error seguido) |
| `maxResultsPerRun` | 60 | Publicaciones a leer por corrida |
| `notifyMode` | `all` | Avisos de Windows de las corridas automáticas: `all` (nuevos y bajadas de precio), `ideal` (solo precio ideal) u `off` |

`GET /api/status` indica si el bot está bloqueado y por qué (`blockedReason`): `disabled`, `logged_out`, `paused`, `rate_limit`, `cooldown` o `busy`. "Ejecutar ahora" ignora horario y límites porque es una acción explícita del usuario.

## Tests

```bash
npm test
```

Si hay PowerShell instalado (`powershell.exe` en Windows, o `pwsh`), los tests también revisan la sintaxis de los scripts de PowerShell que generan la bandeja, los avisos y el instalador; sin PowerShell ese test se omite.
