/**
 * Cliente mínimo de la Bot API de Telegram (solo lo que usa ProductFinderSV), sobre fetch.
 * El token va en la URL de cada llamada: nunca se registra la URL ni el token.
 */

export class TelegramError extends Error {
  constructor(
    /** error_code de Telegram (401 token inválido, 403 bloqueado, 409 conflicto, 429 límite) o 0 = sin conexión. */
    readonly code: number,
    message: string,
    /** Segundos que Telegram pide esperar (429). */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  /** Segundos Unix. */
  date: number;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface InlineButton {
  text: string;
  url: string;
}

interface SendOptions {
  chat_id: string;
  parse_mode?: 'HTML';
  reply_markup?: { inline_keyboard: InlineButton[][] };
}

export interface TelegramApi {
  getMe(): Promise<{ id: number; username: string; first_name: string }>;
  getUpdates(
    params: { offset?: number; timeout?: number; allowed_updates?: string[] },
    signal?: AbortSignal,
  ): Promise<TelegramUpdate[]>;
  sendMessage(params: SendOptions & { text: string; link_preview_options?: { is_disabled: boolean } }): Promise<unknown>;
  sendPhoto(params: SendOptions & { photo: string; caption?: string }): Promise<unknown>;
  setMyCommands(params: { commands: { command: string; description: string }[] }): Promise<unknown>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Formato de los tokens de @BotFather: "<id numérico>:<secreto>". */
export const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

export function createTelegramApi(token: string, fetchImpl: FetchLike = fetch): TelegramApi {
  const call = async <T>(method: string, body: object, signal?: AbortSignal): Promise<T> => {
    let res: Response;
    try {
      res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(20_000),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      // El mensaje original de fetch puede incluir la URL (con el token): no se reutiliza.
      throw new TelegramError(0, 'No se pudo conectar con Telegram');
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    } | null;
    if (!data?.ok) {
      throw new TelegramError(
        data?.error_code ?? res.status,
        data?.description ?? `Telegram respondió ${res.status}`,
        data?.parameters?.retry_after,
      );
    }
    return data.result as T;
  };

  return {
    getMe: () => call('getMe', {}),
    getUpdates: (params, signal) => call('getUpdates', params, signal),
    sendMessage: (params) => call('sendMessage', params),
    sendPhoto: (params) => call('sendPhoto', params),
    setMyCommands: (params) => call('setMyCommands', params),
  };
}
