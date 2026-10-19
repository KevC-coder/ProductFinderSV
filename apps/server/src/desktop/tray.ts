import { psString, spawnPowerShell } from './powershell.js';

export interface TrayOptions {
  /** ProductFinderSV.exe instalado: abrir el panel es ejecutarlo de nuevo (modo lanzador). */
  exePath: string;
  port: number;
  /** Proceso del servicio; si muere, el icono se quita solo. */
  parentPid: number;
}

/**
 * Icono en la bandeja del sistema (área de notificación), hecho con WinForms desde PowerShell
 * para no distribuir binarios nativos. Habla con el servicio por la misma API local que el
 * panel: lee /api/status para el texto del icono y usa /api/settings, /api/system/autostart
 * y /api/system/shutdown.
 */
export function trayScript({ exePath, port, parentPid }: TrayOptions): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$exe = ${psString(exePath)}
$api = 'http://127.0.0.1:${port}/api'
$parentPid = ${parentPid}
$script:enabled = $true

function Invoke-Api([string]$method, [string]$path, [string]$body) {
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [System.Text.Encoding]::UTF8
  $wc.Proxy = $null
  if ($method -eq 'GET') { return ($wc.DownloadString($api + $path) | ConvertFrom-Json) }
  $wc.Headers['Content-Type'] = 'application/json'
  return $wc.UploadString($api + $path, $method, $body)
}

function Open-Panel([string]$route) {
  if ($route) { Start-Process -FilePath $exe -ArgumentList '--open', ('productfindersv://' + $route) }
  else { Start-Process -FilePath $exe }
}

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
$icon.Text = 'ProductFinderSV'

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Abrir ProductFinderSV')
$open.Font = New-Object System.Drawing.Font($menu.Font, [System.Drawing.FontStyle]::Bold)
$results = $menu.Items.Add('Ver resultados')
$toggle = $menu.Items.Add('Pausar búsquedas automáticas')
$autostart = New-Object System.Windows.Forms.ToolStripMenuItem('Iniciar con Windows')
[void]$menu.Items.Add($autostart)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$quit = $menu.Items.Add('Cerrar ProductFinderSV')
$icon.ContextMenuStrip = $menu

function Update-Status {
  # Cualquier error aquí (servicio arrancando, respuesta rara) solo deja el texto anterior.
  try {
    $s = Invoke-Api 'GET' '/status'
    $script:enabled = [bool]$s.schedulerEnabled
    if ($script:enabled) { $toggle.Text = 'Pausar búsquedas automáticas' } else { $toggle.Text = 'Reanudar búsquedas automáticas' }
    if (-not $script:enabled) { $state = 'En pausa' }
    elseif ($s.pausedUntil -and ([datetime]$s.pausedUntil) -gt (Get-Date)) { $state = 'En pausa por seguridad' }
    elseif ($s.sessionState -eq 'connected') { $state = 'Activo' }
    elseif ($s.sessionState -eq 'checkpoint') { $state = 'Facebook pide verificación' }
    else { $state = 'Conecta Facebook' }
    $text = 'ProductFinderSV · ' + $state
    if ($s.matches.new -gt 0) { $text += ' · ' + $s.matches.new + ' nuevos' }
    # Windows no admite más de 63 caracteres en el texto del icono.
    if ($text.Length -gt 63) { $text = $text.Substring(0, 63) }
    $icon.Text = $text
  } catch {}
}

$open.add_Click({ Open-Panel '' })
$results.add_Click({ Open-Panel 'resultados' })
$icon.add_MouseClick({
  param($sender, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Open-Panel '' }
})
$toggle.add_Click({
  try {
    $body = @{ schedulerEnabled = (-not $script:enabled) } | ConvertTo-Json -Compress
    [void](Invoke-Api 'PATCH' '/settings' $body)
  } catch {}
  Update-Status
})
# El estado del inicio con Windows se lee al abrir el menú (está en el registro, no en /status).
$menu.add_Opening({
  try {
    $autostart.Checked = [bool](Invoke-Api 'GET' '/system/autostart').enabled
    $autostart.Enabled = $true
  } catch { $autostart.Enabled = $false }
})
$autostart.add_Click({
  try {
    $body = @{ enabled = (-not $autostart.Checked) } | ConvertTo-Json -Compress
    $autostart.Checked = [bool]((Invoke-Api 'PUT' '/system/autostart' $body) | ConvertFrom-Json).enabled
  } catch {
    [void][System.Windows.Forms.MessageBox]::Show(
      'No se pudo cambiar el inicio con Windows. Puede que una directiva del equipo o el antivirus lo impidan.',
      'ProductFinderSV', 'OK', 'Warning')
  }
})
$quit.add_Click({
  $answer = [System.Windows.Forms.MessageBox]::Show(
    'Se detendrán las búsquedas automáticas hasta que vuelvas a abrir ProductFinderSV desde el escritorio o el menú Inicio (o hasta que inicies Windows, si está activado "Iniciar con Windows").',
    'Cerrar ProductFinderSV', 'OKCancel', 'Question')
  if ($answer -ne [System.Windows.Forms.DialogResult]::OK) { return }
  try { [void](Invoke-Api 'POST' '/system/shutdown' '') } catch {}
  $icon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

# Si el servicio termina (cierre, caída o reinicio del supervisor) el icono se quita solo en
# unos 2 s; así no quedan iconos repetidos cuando el servicio se reinicia.
$watch = New-Object System.Windows.Forms.Timer
$watch.Interval = 2000
$watch.add_Tick({
  if (-not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) {
    $icon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.add_Tick({ Update-Status })

$icon.Visible = $true
Update-Status
$watch.Start()
$timer.Start()
[System.Windows.Forms.Application]::Run()
$icon.Visible = $false
$icon.Dispose()
`;
}

/**
 * Muestra el icono mientras el servicio esté activo. Devuelve la función que se llama al
 * cerrar el servicio.
 *
 * El proceso del icono va desacoplado del servicio y no se mata desde aquí: si Windows lo
 * termina de golpe (al morir el servicio o con kill), el icono queda "fantasma" en la bandeja
 * hasta que el usuario pasa el ratón. En cambio, el propio script detecta que el servicio
 * terminó y quita el icono de forma ordenada.
 */
export function startTray(opts: Omit<TrayOptions, 'parentPid'>, onError: (err: Error) => void): () => void {
  let stopping = false;
  const child = spawnPowerShell(trayScript({ ...opts, parentPid: process.pid }), { detached: true });
  child.unref();
  child.on('error', onError);
  child.on('exit', (code) => {
    if (code && !stopping) onError(new Error(`el icono de la bandeja terminó con código ${code}`));
  });
  return () => {
    stopping = true;
  };
}
