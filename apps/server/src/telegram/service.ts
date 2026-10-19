import { randomBytes } from 'node:crypto';
import type { Store } from '../db/store.js';
import type { NotifyMode, SessionState } from '../domain/types.js';
import { pickRunNews } from '../notifier/notification.js';
import type { RunSummary } from '../runner/run-watcher.js';
import { createTelegramApi, TelegramError, TOKEN_PATTERN, type TelegramApi, type TelegramUpdate } from './api.js';
import { COMMANDS, HELP_TEXT, runMessage, sessionAlert, statusText, type StatusSnapshot } from './format.js';

/** Lo que el panel muestra de la integración (nunca incluye el token). */
export interface TelegramState {
  configured: boolean;
  botUsername: string | null;
  linked: boolean;
  chatName: string | null;
  notifyMode: NotifyMode;
  /** Vinculación en curso: enlace que el usuario abre en Telegram. */
  linking: { url: string; code: string; expiresAt: string } | null;
  /** Último problema de conexión con Telegram, para mostrarlo en Ajustes. */
  error: string | null;
}

export interface TelegramDeps {
  store: Store;
  /** Estado del bot para /estado. */
  getStatus: () => StatusSnapshot;
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
  /** Inyectable en tests. */
  createApi?: (token: string) => TelegramApi;
  now?: () => Date;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Error que el panel muestra tal cual (statusCode → código HTTP de la respuesta). */
export class TelegramSetupError extends Error {
  readonly expose = true;
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

const LINK_TTL_MS = 10 * 60_000;
/** Órdenes que llegaron con la PC apagada y son más viejas que esto se ignoran. */
const STALE_MS = 10 * 60_000;
/** Long polling: Telegram mantiene la petición abierta hasta este tiempo esperando mensajes. */
const POLL_TIMEOUT_S = 50;

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

function chatName(chat: NonNullable<TelegramUpdate['message']>['chat']): string {
  const person = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  return chat.title ?? (person || (chat.username ? `@${chat.username}` : 'tu chat'));
}

/**
 * Integración con Telegram: el usuario crea su propio bot con @BotFather, pega el token en
 * Ajustes y vincula su chat con un enlace de un solo uso. Desde entonces el bot le avisa de
 * resultados nuevos y problemas de la cuenta, y acepta /estado, /pausar y /reanudar solo
 * desde ese chat.
 *
 * Usa long polling (getUpdates): funciona sin abrir puertos ni exponer la PC a internet.
 */
export class TelegramService {
  private readonly createApi: (token: string) => TelegramApi;
  private readonly now: () => Date;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private api: TelegramApi | null = null;
  private poller: { abort: AbortController; done: Promise<void> } | null = null;
  private offset: number | undefined;
  private linking: TelegramState['linking'] = null;
  private error: string | null = null;
  /** Último aviso de sesión enviado, para no repetirlo en cada corrida. */
  private lastSessionAlert: SessionState | null = null;

  constructor(private readonly deps: TelegramDeps) {
    this.createApi = deps.createApi ?? ((token) => createTelegramApi(token));
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? defaultSleep;
  }

  private get settings() {
    return this.deps.store.settings;
  }

  state(): TelegramState {
    const s = this.settings.all();
    const linking = this.linking && Date.parse(this.linking.expiresAt) > this.now().getTime() ? this.linking : null;
    return {
      configured: !!s.telegramToken,
      botUsername: s.telegramBotUsername,
      linked: !!s.telegramChatId,
      chatName: s.telegramChatName,
      notifyMode: s.telegramNotifyMode,
      linking,
      error: this.error,
    };
  }

  /** Arranca la escucha si ya hay un bot configurado. */
  start(): void {
    const token = this.settings.get('telegramToken');
    if (!token) return;
    this.api = this.createApi(token);
    this.startPolling();
  }

  async stop(): Promise<void> {
    const p = this.poller;
    this.poller = null;
    if (p) {
      p.abort.abort();
      await p.done;
    }
  }

  /** Comprueba el token con Telegram y lo guarda. Cambiar de bot desvincula el chat anterior. */
  async setToken(rawToken: string): Promise<TelegramState> {
    const token = rawToken.trim();
    if (!TOKEN_PATTERN.test(token)) {
      throw new TelegramSetupError('Eso no parece un token de bot. Cópialo completo desde @BotFather (números, dos puntos y letras).');
    }
    const api = this.createApi(token);
    let me: { username: string };
    try {
      me = await api.getMe();
    } catch (err) {
      if (err instanceof TelegramError && err.code === 401) {
        throw new TelegramSetupError('Telegram no reconoce ese token. Cópialo de nuevo desde @BotFather.');
      }
      throw new TelegramSetupError('No se pudo conectar con Telegram. Revisa tu conexión a internet e inténtalo otra vez.', 502);
    }
    await this.stop();
    const sameBot = this.settings.get('telegramBotUsername') === me.username;
    this.settings.set({
      telegramToken: token,
      telegramBotUsername: me.username,
      ...(sameBot ? {} : { telegramChatId: null, telegramChatName: null }),
    });
    this.api = api;
    this.offset = undefined;
    this.linking = null;
    this.error = null;
    this.startPolling();
    this.deps.log.info({ bot: me.username }, 'bot de Telegram configurado');
    return this.state();
  }

  /** Genera el enlace de un solo uso para vincular el chat (t.me/<bot>?start=<código>). */
  startLinking(): NonNullable<TelegramState['linking']> {
    const username = this.settings.get('telegramBotUsername');
    if (!this.settings.get('telegramToken') || !username) {
      throw new TelegramSetupError('Primero guarda el token del bot.', 409);
    }
    // Solo letras, números, _ y - (lo que admite el parámetro start); difícil de adivinar.
    const code = randomBytes(12).toString('base64url');
    this.linking = {
      url: `https://t.me/${username}?start=${code}`,
      code,
      expiresAt: new Date(this.now().getTime() + LINK_TTL_MS).toISOString(),
    };
    return this.linking;
  }

  setNotifyMode(mode: NotifyMode): TelegramState {
    this.settings.set({ telegramNotifyMode: mode });
    return this.state();
  }

  async sendTest(): Promise<void> {
    await this.send(
      '<b>Mensaje de prueba de ProductFinderSV</b>\nSi lo ves, los avisos de Telegram funcionan.\n\n' + HELP_TEXT,
      { required: true },
    );
  }

  /** Olvida el bot y el chat. */
  async disconnect(): Promise<TelegramState> {
    await this.stop();
    this.settings.set({ telegramToken: null, telegramBotUsername: null, telegramChatId: null, telegramChatName: null });
    this.api = null;
    this.linking = null;
    this.error = null;
    return this.state();
  }

  // ---- Avisos ---------------------------------------------------------------------------

  /** Avisa de una corrida automática según el modo de Telegram. Devuelve los ids avisados. */
  async notifyRun(run: RunSummary): Promise<number[]> {
    if (!this.isLinked()) return [];
    const news = pickRunNews(this.deps.store, run, this.settings.get('telegramNotifyMode'));
    if (!news) return [];
    const msg = runMessage(news);
    const markup = { inline_keyboard: [[msg.button]] };
    const chatId = this.settings.get('telegramChatId')!;
    let sent = false;
    if (msg.photo) {
      // La foto la descarga Telegram desde Facebook; si falla, va el mismo texto sin foto.
      sent = await this.deliver(() =>
        this.api!.sendPhoto({ chat_id: chatId, photo: msg.photo!, caption: msg.text, parse_mode: 'HTML', reply_markup: markup }),
      ).catch(() => false);
    }
    if (!sent) await this.send(msg.text, { markup, required: true });
    const ids = [...news.fresh, ...news.drops].map((m) => m.id);
    this.deps.store.matches.markNotified(ids, this.now().toISOString());
    return ids;
  }

  /** Avisa si Facebook pidió una verificación o se cerró la sesión (una vez por problema). */
  async notifySession(state: SessionState): Promise<void> {
    if (state === 'connected') {
      this.lastSessionAlert = null;
      return;
    }
    if (!this.isLinked() || state === this.lastSessionAlert) return;
    const text = sessionAlert(state);
    if (!text) return;
    this.lastSessionAlert = state;
    await this.send(text);
  }

  // ---- Mensajes recibidos ---------------------------------------------------------------

  /** Procesa un mensaje recibido (público para los tests). */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text) return;
    // Órdenes enviadas con la PC apagada: no ejecutar un /pausar de hace horas.
    if (this.now().getTime() - msg.date * 1000 > STALE_MS) return;

    const m = /^\/([a-z_]+)(?:@(\w+))?(?:\s+(\S+))?/i.exec(msg.text.trim());
    if (!m) {
      if (this.isLinkedChat(msg.chat.id)) await this.reply(msg.chat.id, `No entendí ese mensaje.\n\n${HELP_TEXT}`);
      return;
    }
    const [, rawCommand, mention, arg] = m;
    const command = rawCommand!.toLowerCase();
    // En grupos los comandos pueden ir dirigidos a otro bot (/estado@otrobot).
    if (mention && mention.toLowerCase() !== (this.settings.get('telegramBotUsername') ?? '').toLowerCase()) return;

    if (command === 'start' && arg && this.linking && arg === this.linking.code) {
      await this.link(msg);
      return;
    }
    // Todo lo demás solo desde el chat vinculado: el bot es privado.
    if (!this.isLinkedChat(msg.chat.id)) return;

    switch (command) {
      case 'estado':
        await this.reply(msg.chat.id, statusText(this.deps.getStatus(), this.now()));
        break;
      case 'pausar':
        this.settings.set({ schedulerEnabled: false });
        await this.reply(msg.chat.id, 'Búsquedas automáticas <b>pausadas</b>. Usa /reanudar para volver a activarlas.');
        break;
      case 'reanudar': {
        this.settings.set({ schedulerEnabled: true });
        const until = this.settings.get('pausedUntil');
        const safety = until && Date.parse(until) > this.now().getTime();
        await this.reply(
          msg.chat.id,
          safety
            ? 'Búsquedas automáticas activadas, pero el bot sigue <b>en pausa por seguridad</b> porque Facebook pidió una verificación. Resuélvela en la PC.'
            : 'Búsquedas automáticas <b>activadas</b>.',
        );
        break;
      }
      default:
        await this.reply(msg.chat.id, HELP_TEXT);
    }
  }

  // ---- Interno ----------------------------------------------------------------------------

  private isLinked(): boolean {
    return !!this.api && !!this.settings.get('telegramChatId');
  }

  private isLinkedChat(chatId: number): boolean {
    return this.settings.get('telegramChatId') === String(chatId);
  }

  private async link(msg: NonNullable<TelegramUpdate['message']>): Promise<void> {
    if (Date.parse(this.linking!.expiresAt) <= this.now().getTime()) {
      this.linking = null;
      await this.reply(msg.chat.id, 'Ese enlace ya venció. Genera otro desde Ajustes → Telegram en la PC.');
      return;
    }
    this.linking = null;
    this.lastSessionAlert = null;
    this.settings.set({ telegramChatId: String(msg.chat.id), telegramChatName: chatName(msg.chat) });
    this.deps.log.info({ chat: msg.chat.id }, 'chat de Telegram vinculado');
    await this.api!.setMyCommands({ commands: COMMANDS.map((c) => ({ ...c })) }).catch(() => {});
    await this.reply(msg.chat.id, `<b>Listo, quedó vinculado.</b>\n\n${HELP_TEXT}`);
  }

  private async reply(chatId: number, text: string): Promise<void> {
    await this.deliver(() =>
      this.api!.sendMessage({ chat_id: String(chatId), text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    ).catch((err) => this.deps.log.warn({ err: describe(err) }, 'no se pudo responder en Telegram'));
  }

  /** Envía al chat vinculado. Con required, los errores se lanzan (p. ej. para el mensaje de prueba). */
  private async send(text: string, opts: { markup?: { inline_keyboard: { text: string; url: string }[][] }; required?: boolean } = {}) {
    const chatId = this.settings.get('telegramChatId');
    if (!this.api || !chatId) {
      if (opts.required) throw new TelegramSetupError('Primero vincula tu chat de Telegram.', 409);
      return;
    }
    const api = this.api;
    const ok = this.deliver(() =>
      api.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(opts.markup ? { reply_markup: opts.markup } : {}),
      }),
    );
    if (opts.required) {
      await ok.catch((err) => {
        throw new TelegramSetupError(userMessage(err), 502);
      });
    } else {
      await ok.catch((err) => this.deps.log.warn({ err: describe(err) }, 'no se pudo enviar el aviso de Telegram'));
    }
  }

  /** Llama a Telegram respetando un 429 (espera lo que pida, una vez) y anota los errores. */
  private async deliver(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof TelegramError && err.code === 429 && err.retryAfter) {
        await this.sleep(Math.min(err.retryAfter, 30) * 1000, new AbortController().signal);
        await fn();
      } else {
        if (err instanceof TelegramError && err.code === 403) {
          this.error = 'El bot no puede escribirte: quizá lo bloqueaste en Telegram. Desbloquéalo o vuelve a vincularlo.';
        }
        throw err;
      }
    }
    return true;
  }

  private startPolling(): void {
    const abort = new AbortController();
    const done = this.poll(abort.signal).catch((err) => this.deps.log.warn({ err: describe(err) }, 'Telegram dejó de escuchar'));
    this.poller = { abort, done };
  }

  private async poll(signal: AbortSignal): Promise<void> {
    let backoff = 5_000;
    while (!signal.aborted) {
      const api = this.api;
      if (!api) return;
      try {
        const updates = await api.getUpdates(
          { offset: this.offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message'] },
          AbortSignal.any([signal, AbortSignal.timeout((POLL_TIMEOUT_S + 15) * 1000)]),
        );
        backoff = 5_000;
        this.error = null;
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handleUpdate(u).catch((err) => this.deps.log.warn({ err: describe(err) }, 'error al procesar un mensaje de Telegram'));
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof TelegramError && err.code === 401) {
          this.error = 'Telegram ya no acepta el token del bot (¿lo revocaste en @BotFather?). Pega el token nuevo en Ajustes.';
          return;
        }
        if (err instanceof TelegramError && err.code === 409) {
          // Otro programa (u otra PC con el mismo token) está leyendo los mensajes de este bot.
          this.error = 'Este bot también se está usando en otro programa u otra PC. Cada instalación necesita su propio bot.';
          await this.sleep(60_000, signal);
          continue;
        }
        this.error = 'Sin conexión con Telegram. Se reintentará solo.';
        await this.sleep(backoff, signal);
        backoff = Math.min(backoff * 2, 5 * 60_000);
      }
    }
  }
}

/** Para los registros: nunca el objeto de error completo (podría llevar la URL con el token). */
function describe(err: unknown): string {
  if (err instanceof TelegramError) return `${err.code} ${err.message}`;
  return err instanceof Error ? err.name : String(err);
}

function userMessage(err: unknown): string {
  if (err instanceof TelegramError) {
    if (err.code === 0) return 'No se pudo conectar con Telegram. Revisa tu conexión a internet.';
    if (err.code === 403) return 'El bot no puede escribirte: quizá lo bloqueaste en Telegram.';
    if (err.code === 400 && /chat not found/i.test(err.message)) return 'Telegram no encuentra el chat vinculado. Vuelve a vincularlo.';
    return `Telegram respondió: ${err.message}`;
  }
  return 'No se pudo enviar el mensaje.';
}
