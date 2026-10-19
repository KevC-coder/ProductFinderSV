import { randomBytes } from 'node:crypto';
import type { Store } from '../db/store.js';
import type { NotifyMode, SessionState } from '../domain/types.js';
import { pickRunNews } from '../notifier/notification.js';
import type { RunSummary } from '../runner/run-watcher.js';
import {
  createTelegramApi,
  TelegramError,
  TOKEN_PATTERN,
  type InlineButton,
  type TelegramApi,
  type TelegramMessage,
  type TelegramUpdate,
} from './api.js';
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
  /** Telegram dejó de aceptar el token (revocado en @BotFather): hay que pegar el nuevo. */
  tokenRejected: boolean;
  /** Problema actual con Telegram, para mostrarlo en Ajustes. */
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
/** Long polling: Telegram mantiene la petición abierta hasta este tiempo esperando mensajes. */
const POLL_TIMEOUT_S = 50;

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

function chatName(chat: TelegramMessage['chat']): string {
  const person = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  return chat.title ?? (person || (chat.username ? `@${chat.username}` : 'tu chat'));
}

/** Errores de envío que dicen que el chat vinculado ya no sirve (bloqueado, borrado, grupo cambiado…). */
const CHAT_GONE = /chat not found|bot was blocked|bot was kicked|not a member|user is deactivated|upgraded to a supergroup/i;

/**
 * Integración con Telegram: el usuario crea su propio bot con @BotFather, pega el token en
 * Ajustes y vincula su chat privado con un enlace de un solo uso. Desde entonces el bot le
 * avisa de resultados nuevos y problemas de la cuenta, y acepta /estado, /pausar y /reanudar
 * solo desde ese chat.
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
  /** Problemas de la escucha (sin conexión, otra PC…): se limpian al volver a recibir. */
  private pollError: string | null = null;
  /** Problemas al enviar al chat (bloqueado, borrado…): se limpian al volver a enviar bien. */
  private deliveryError: string | null = null;
  private tokenRejected = false;
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
      tokenRejected: this.tokenRejected,
      error: this.tokenRejected
        ? 'Telegram ya no acepta el token del bot (¿lo revocaste en @BotFather?). Pega el token nuevo.'
        : (this.pollError ?? this.deliveryError),
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

  /**
   * Comprueba el token con Telegram y lo guarda. Un token nuevo del mismo bot (p. ej. tras
   * revocarlo) conserva el chat vinculado; otro bot obliga a vincular de nuevo.
   */
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
    this.pollError = null;
    this.deliveryError = null;
    this.tokenRejected = false;
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
    if (this.tokenRejected) throw new TelegramSetupError('Primero pega el token nuevo del bot.', 409);
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
    if (!this.isLinked()) throw new TelegramSetupError('Primero vincula tu chat de Telegram.', 409);
    await this.sendToLinked(
      '<b>Mensaje de prueba de ProductFinderSV</b>\nSi lo ves, los avisos de Telegram funcionan.\n\n' + HELP_TEXT,
    ).catch((err) => {
      throw new TelegramSetupError(userMessage(err), 502);
    });
  }

  /** Olvida el bot y el chat. */
  async disconnect(): Promise<TelegramState> {
    await this.stop();
    this.settings.set({ telegramToken: null, telegramBotUsername: null, telegramChatId: null, telegramChatName: null });
    this.api = null;
    this.linking = null;
    this.pollError = null;
    this.deliveryError = null;
    this.tokenRejected = false;
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
    let sent = false;
    if (msg.photo) {
      try {
        await this.deliver((api, chatId) =>
          api.sendPhoto({ chat_id: chatId, photo: msg.photo!, caption: msg.text, parse_mode: 'HTML', reply_markup: markup }),
        );
        sent = true;
      } catch (err) {
        // Solo si Telegram rechazó la foto (400: no la pudo descargar de Facebook) va el texto
        // sin foto. Ante un corte de red la foto pudo haber salido: reenviar duplicaría el aviso.
        if (!(err instanceof TelegramError && err.code === 400 && !CHAT_GONE.test(err.message))) throw err;
      }
    }
    if (!sent) await this.sendToLinked(msg.text, markup);
    const ids = [...news.fresh, ...news.drops].map((m) => m.id);
    this.deps.store.matches.markNotified(ids, this.now().toISOString());
    return ids;
  }

  /**
   * Avisa si Facebook pidió una verificación o se cerró la sesión, una vez por problema.
   * 'connected' (login o corrida correcta) reinicia el aviso para el próximo problema.
   */
  async notifySession(state: SessionState): Promise<void> {
    if (state === 'connected') {
      this.lastSessionAlert = null;
      return;
    }
    if (!this.isLinked() || state === this.lastSessionAlert) return;
    const text = sessionAlert(state);
    if (!text) return;
    await this.sendToLinked(text);
    // Solo después de enviarlo: si falló, se reintenta con la próxima corrida.
    this.lastSessionAlert = state;
  }

  // ---- Mensajes recibidos ---------------------------------------------------------------

  /**
   * Procesa un mensaje recibido. Con `backlog`, el mensaje llegó mientras ProductFinderSV
   * estaba apagado: no se ejecutan órdenes viejas (un /pausar de hace horas). Se decide así,
   * y no por la fecha del mensaje, porque el reloj de la PC puede estar mal.
   */
  async handleUpdate(update: TelegramUpdate, opts: { backlog?: boolean } = {}): Promise<void> {
    const msg = update.message;
    if (!msg?.text) return;

    const m = /^\/([a-z_]+)(?:@(\w+))?(?:\s+(\S+))?/i.exec(msg.text.trim());
    if (!m) {
      if (!opts.backlog && this.isLinkedChat(msg.chat.id)) await this.reply(msg.chat.id, `No entendí ese mensaje.\n\n${HELP_TEXT}`);
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

    if (opts.backlog) {
      if (command === 'pausar' || command === 'reanudar') {
        await this.reply(
          msg.chat.id,
          `Recibí /${command} mientras ProductFinderSV estaba apagado y no lo ejecuté. Envíalo otra vez si todavía lo quieres.`,
        );
      }
      return;
    }

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
    return !!this.api && !!this.settings.get('telegramChatId') && !this.tokenRejected;
  }

  private isLinkedChat(chatId: number): boolean {
    return this.settings.get('telegramChatId') === String(chatId);
  }

  private async link(msg: TelegramMessage): Promise<void> {
    if (Date.parse(this.linking!.expiresAt) <= this.now().getTime()) {
      this.linking = null;
      await this.reply(msg.chat.id, 'Ese enlace ya venció. Genera otro desde Ajustes → Telegram en la PC.');
      return;
    }
    // Solo chats privados: en un grupo cualquier miembro podría dar órdenes, y si Telegram
    // lo convierte en supergrupo cambia de id y los avisos dejarían de llegar.
    if (msg.chat.type !== 'private') {
      await this.reply(
        msg.chat.id,
        `Vincúlame desde un chat privado: abre @${this.settings.get('telegramBotUsername') ?? ''} y pulsa Iniciar con el enlace del panel.`,
      );
      return;
    }
    this.linking = null;
    const previous = this.settings.get('telegramChatId');
    const name = chatName(msg.chat);
    if (previous && previous !== String(msg.chat.id)) {
      // Que un cambio de chat nunca pase en silencio para quien recibía los avisos.
      await this.deliverTo(previous, `ProductFinderSV ahora envía los avisos a otro chat (${name}). Si no fuiste tú, vuelve a vincularlo desde Ajustes en la PC.`).catch(
        () => {},
      );
    }
    this.lastSessionAlert = null;
    this.deliveryError = null;
    this.settings.set({ telegramChatId: String(msg.chat.id), telegramChatName: name });
    this.deps.log.info({}, 'chat de Telegram vinculado');
    await this.api!.setMyCommands({ commands: COMMANDS.map((c) => ({ ...c })) }).catch(() => {});
    await this.reply(msg.chat.id, `<b>Listo, quedó vinculado.</b>\n\n${HELP_TEXT}`);
  }

  /** Respuesta a un mensaje recibido (los errores solo se registran). */
  private async reply(chatId: number, text: string): Promise<void> {
    await this.deliverTo(String(chatId), text).catch((err) => this.deps.log.warn({ err: describe(err) }, 'no se pudo responder en Telegram'));
  }

  /** Mensaje de texto al chat vinculado. Los errores se lanzan. */
  private async sendToLinked(text: string, markup?: { inline_keyboard: InlineButton[][] }): Promise<void> {
    await this.deliver((api, chatId) =>
      api.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(markup ? { reply_markup: markup } : {}),
      }),
    );
  }

  private async deliverTo(chatId: string, text: string): Promise<void> {
    const api = this.api;
    if (!api) return;
    await this.withRetry(() => api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }));
  }

  /** Envía al chat vinculado, anota en el estado los problemas del chat y los limpia al volver a funcionar. */
  private async deliver(fn: (api: TelegramApi, chatId: string) => Promise<unknown>): Promise<void> {
    const api = this.api;
    const chatId = this.settings.get('telegramChatId');
    if (!api || !chatId) throw new TelegramSetupError('Primero vincula tu chat de Telegram.', 409);
    try {
      await this.withRetry(() => fn(api, chatId));
      this.deliveryError = null;
    } catch (err) {
      if (err instanceof TelegramError && err.code === 401) this.tokenRejected = true;
      else if (err instanceof TelegramError && (err.code === 403 || CHAT_GONE.test(err.message))) this.deliveryError = userMessage(err);
      throw err;
    }
  }

  /** Respeta un 429 (espera lo que pida Telegram, como mucho 30 s, una vez). */
  private async withRetry(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof TelegramError && err.code === 429 && err.retryAfter)) throw err;
      await this.sleep(Math.min(err.retryAfter, 30) * 1000, new AbortController().signal);
      await fn();
    }
  }

  private startPolling(): void {
    const abort = new AbortController();
    const done = this.poll(abort.signal).catch((err) => this.deps.log.warn({ err: describe(err) }, 'Telegram dejó de escuchar'));
    this.poller = { abort, done };
  }

  private async poll(signal: AbortSignal): Promise<void> {
    let backoff = 5_000;
    // La primera lectura no espera (timeout 0): trae lo que se acumuló con la PC apagada.
    let backlog = true;
    while (!signal.aborted) {
      const api = this.api;
      if (!api) return;
      try {
        const timeout = backlog ? 0 : POLL_TIMEOUT_S;
        const updates = await api.getUpdates(
          { offset: this.offset, timeout, allowed_updates: ['message'] },
          AbortSignal.any([signal, AbortSignal.timeout((timeout + 15) * 1000)]),
        );
        backoff = 5_000;
        this.pollError = null;
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handleUpdate(u, { backlog }).catch((err) =>
            this.deps.log.warn({ err: describe(err) }, 'error al procesar un mensaje de Telegram'),
          );
        }
        backlog = false;
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof TelegramError && err.code === 401) {
          this.tokenRejected = true;
          return;
        }
        if (err instanceof TelegramError && err.code === 409) {
          // Otro programa (u otra PC con el mismo token) está leyendo los mensajes de este bot.
          this.pollError = 'Este bot también se está usando en otro programa u otra PC. Cada instalación necesita su propio bot.';
          await this.sleep(60_000, signal);
          continue;
        }
        this.pollError = 'Sin conexión con Telegram. Se reintentará solo.';
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
    if (err.code === 401) return 'Telegram ya no acepta el token del bot. Pega el token nuevo en Ajustes → Telegram.';
    if (err.code === 403) return 'El bot no puede escribirte: quizá lo bloqueaste o eliminaste el chat. Desbloquéalo o vuelve a vincularlo.';
    if (CHAT_GONE.test(err.message)) return 'Telegram ya no encuentra el chat vinculado. Vuelve a vincularlo desde Ajustes.';
    return `Telegram respondió: ${err.message}`;
  }
  return 'No se pudo enviar el mensaje.';
}
