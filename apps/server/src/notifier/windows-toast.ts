import { APP_USER_MODEL_ID } from '../desktop/install-scripts.js';
import { psString, runPowerShell } from '../desktop/powershell.js';
import type { Notice, Notifier } from './notification.js';

// Caracteres que XML 1.0 no admite (Facebook a veces los incluye en títulos).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
const xml = (s: string) => s.replace(INVALID_XML, '').replace(/[<>&"']/g, (c) => ESCAPES[c]!);

/** XML del aviso: clic en el aviso o en "Ver resultados" abre el enlace. */
export function toastXml(notice: Notice, link: string): string {
  const texts = [notice.title, ...notice.lines]
    .slice(0, 3)
    .map((t) => `<text>${xml(t)}</text>`)
    .join('');
  const href = xml(link);
  return (
    `<toast activationType="protocol" launch="${href}">` +
    `<visual><binding template="ToastGeneric">${texts}</binding></visual>` +
    `<actions><action content="Ver resultados" activationType="protocol" arguments="${href}"/></actions>` +
    `</toast>`
  );
}

/**
 * Registra la identidad con la que Windows muestra los avisos ("ProductFinderSV" y su icono)
 * en HKCU\Software\Classes\AppUserModelId —válido en Windows 10/11 para apps sin paquete y
 * sin acceso directo especial— y muestra el aviso.
 */
export function toastScript(toast: string, iconPath: string | null): string {
  return `
$ErrorActionPreference = 'Stop'
$key = 'HKCU:\\Software\\Classes\\AppUserModelId\\${APP_USER_MODEL_ID}'
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
Set-ItemProperty -Path $key -Name DisplayName -Value 'ProductFinderSV'
${iconPath ? `Set-ItemProperty -Path $key -Name IconUri -Value ${psString(iconPath)}` : ''}
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml(${psString(toast)})
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${APP_USER_MODEL_ID}').Show($toast)
`;
}

export interface WindowsNotifierOptions {
  /** Convierte una ruta del panel en el enlace que abre el aviso. */
  link: (route: string) => string;
  /** PNG para el aviso; sin él Windows usa un icono genérico. */
  iconPath: string | null;
}

/** Avisos nativos de Windows 10/11 mediante PowerShell (sin dependencias nativas). */
export function createWindowsNotifier(opts: WindowsNotifierOptions): Notifier {
  return {
    async notify(notice) {
      await runPowerShell(toastScript(toastXml(notice, opts.link(notice.route)), opts.iconPath));
    },
  };
}
