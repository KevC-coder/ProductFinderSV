import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KeyRound, Send, Unlink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import type { TelegramState } from '../lib/types';
import { ChoiceList, NOTIFY_CHOICES } from './ChoiceList';
import { useToast } from './Toasts';
import { Button, ConfirmDialog, Dot, ErrorNote, Field, Input, Spinner } from './ui';

const COMMANDS = ['/estado', '/pausar', '/reanudar', '/ayuda'];

/** Enlace con aspecto de botón primario (lima con texto negro). */
const LINK_BUTTON =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-lime px-4 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-lime-hover';

/**
 * Campo para pegar el token. Es un texto con los caracteres ocultos y no un campo de
 * contraseña: así Edge no ofrece guardarlo en su gestor (que se sincroniza fuera de la PC).
 */
function TokenForm({
  onSaved,
  autoFocus,
  submitLabel = 'Guardar token',
}: {
  onSaved: (s: TelegramState) => void;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const [token, setToken] = useState('');
  const save = useMutation({
    mutationFn: api.setTelegramToken,
    onSuccess: (s) => {
      setToken('');
      onSaved(s);
    },
  });
  return (
    <>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) save.mutate(token);
        }}
      >
        <Field label="Token del bot" className="flex-1">
          {(id) => (
            <Input
              id={id}
              type="text"
              autoFocus={autoFocus}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              data-form-type="other"
              aria-invalid={!!save.error}
              className="[-webkit-text-security:disc]"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AA…"
            />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={!token.trim()} loading={save.isPending}>
          {submitLabel}
        </Button>
      </form>
      {save.error && <ErrorNote>{save.error.message}</ErrorNote>}
    </>
  );
}

/**
 * Ajustes → Telegram. Tres pasos: pegar el token del bot creado con @BotFather, vincular el
 * chat con un enlace de un solo uso y elegir qué avisar. Todo se guarda al momento (no usa
 * el botón "Guardar" de la página).
 */
export function TelegramSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [changingToken, setChangingToken] = useState(false);

  const query = useQuery({
    queryKey: ['telegram'],
    queryFn: api.telegram,
    // Mientras se espera que el usuario pulse "Iniciar" en Telegram, se consulta seguido.
    refetchInterval: (q) => (q.state.data?.linking ? 2000 : 30_000),
  });
  const saved = (s: TelegramState) => qc.setQueryData(['telegram'], s);

  const tokenSaved = (s: TelegramState) => {
    saved(s);
    setChangingToken(false);
    toast({
      tone: 'success',
      title: `Bot @${s.botUsername} listo`,
      body: s.linked ? 'Sigue vinculado con tu chat.' : 'Ahora vincula tu chat de Telegram.',
    });
  };
  const link = useMutation({ mutationFn: api.linkTelegram, onSuccess: saved });
  const mode = useMutation({
    mutationFn: api.setTelegramMode,
    onSuccess: saved,
    onError: (e) => toast({ tone: 'error', title: 'No se pudo guardar', body: e.message }),
  });
  const test = useMutation({
    mutationFn: api.testTelegram,
    onSuccess: () => toast({ tone: 'success', title: 'Mensaje de prueba enviado', body: 'Revisa tu Telegram.' }),
    onError: (e) => toast({ tone: 'error', title: 'No se pudo enviar el mensaje de prueba', body: e.message }),
  });
  const disconnect = useMutation({
    mutationFn: api.disconnectTelegram,
    onSuccess: (s) => {
      saved(s);
      setConfirmDisconnect(false);
      setChangingToken(false);
      toast({ tone: 'info', title: 'Telegram desvinculado' });
    },
  });

  // Aviso cuando el usuario termina de vincular desde Telegram.
  const s = query.data;
  const wasLinked = useRef<boolean | null>(null);
  useEffect(() => {
    if (!s) return;
    if (wasLinked.current === false && s.linked) {
      toast({ tone: 'success', title: 'Telegram vinculado', body: `Los avisos llegarán a ${s.chatName ?? 'tu chat'}.` });
    }
    wasLinked.current = s.linked;
  }, [s, toast]);

  if (query.isLoading) return <Spinner />;
  if (!s) return <ErrorNote>{query.error?.message ?? 'No se pudo leer la configuración de Telegram.'}</ErrorNote>;

  // Con el token revocado se pide el nuevo directamente; si es del mismo bot, se conserva el chat.
  const showTokenForm = s.configured && (changingToken || s.tokenRejected);

  return (
    <>
      {s.error && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
          {s.error}
        </div>
      )}

      {!s.configured ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted marker:font-mono marker:text-fg">
            <li>
              En Telegram, abre{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-semibold text-fg underline underline-offset-2">
                @BotFather
              </a>{' '}
              y envíale <code className="font-mono text-fg">/newbot</code>.
            </li>
            <li>Elige un nombre y un usuario para tu bot (el usuario termina en “bot”).</li>
            <li>Copia el token que te da y pégalo aquí.</li>
          </ol>
          <TokenForm onSaved={tokenSaved} />
        </>
      ) : showTokenForm ? (
        <>
          <p className="text-sm">
            Pega el token nuevo de <span className="font-semibold">@{s.botUsername}</span> (en @BotFather:{' '}
            <code className="font-mono">/token</code> o <code className="font-mono">/revoke</code>). Si es del mismo bot, tu chat
            sigue vinculado.
          </p>
          <TokenForm onSaved={tokenSaved} autoFocus submitLabel="Guardar token nuevo" />
          {!s.tokenRejected && (
            <Button size="sm" variant="ghost" onClick={() => setChangingToken(false)}>
              Cancelar
            </Button>
          )}
        </>
      ) : !s.linked ? (
        <>
          <p className="text-sm">
            Bot <span className="font-semibold">@{s.botUsername}</span> listo. Ahora vincula tu chat para recibir los avisos.
          </p>
          {!s.linking ? (
            <Button variant="primary" icon={<Send className="size-4" />} onClick={() => link.mutate()} loading={link.isPending}>
              Vincular mi Telegram
            </Button>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-bg p-4">
              <p className="text-sm">
                Abre este enlace en un chat privado de Telegram y pulsa <span className="font-semibold">Iniciar</span>:
              </p>
              <a href={s.linking.url} target="_blank" rel="noreferrer" className={LINK_BUTTON} autoFocus>
                Abrir en Telegram <ExternalLink className="size-4" />
              </a>
              <p className="text-xs text-muted">
                ¿Telegram está en tu celular? Búscalo como <span className="font-semibold text-fg">@{s.botUsername}</span> y envíale:{' '}
                <code className="font-mono text-fg select-all">/start {s.linking.code}</code>
              </p>
              <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted">
                <Spinner className="size-3.5" /> Esperando que pulses Iniciar (el enlace vence a las {formatTime(s.linking.expiresAt)})
              </p>
            </div>
          )}
          {link.error && <ErrorNote>{link.error.message}</ErrorNote>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => setChangingToken(true)}>
              Cambiar token
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)}>
              Usar otro bot
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="flex items-start gap-2 text-sm">
            <span className="mt-1.5">
              <Dot tone={s.error ? 'warning' : 'success'} />
            </span>
            <span>
              Vinculado con <span className="font-semibold">{s.chatName}</span> mediante @{s.botUsername}
            </span>
          </p>
          <ChoiceList
            name="telegramNotifyMode"
            legend="Avisarme por Telegram de"
            hint="Un mensaje por búsqueda automática, con foto y enlaces a Facebook. Además te avisa si Facebook pide una verificación o se cierra la sesión."
            options={NOTIFY_CHOICES}
            value={s.notifyMode}
            onChange={(v) => mode.mutate(v)}
          />
          <div>
            <p className="text-[13px] font-semibold">Desde ese chat puedes enviar</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {COMMANDS.map((c) => (
                <code key={c} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                  {c}
                </code>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Send className="size-4" />} onClick={() => test.mutate()} loading={test.isPending}>
              Enviar mensaje de prueba
            </Button>
            <Button variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => setChangingToken(true)}>
              Cambiar token
            </Button>
            <Button variant="ghost" icon={<Unlink className="size-4" />} onClick={() => setConfirmDisconnect(true)}>
              Desvincular
            </Button>
          </div>
        </>
      )}

      <p className="text-xs text-muted">
        Los avisos pasan por los servidores de Telegram (título, precio y enlace de las publicaciones). El token del bot se guarda
        solo en esta PC. Cada instalación necesita su propio bot.
      </p>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Desvincular Telegram"
        message={
          <>
            ProductFinderSV dejará de usar este bot y no enviará más avisos a Telegram. Para volver a usarlo tendrás que pegar el
            token y vincular tu chat otra vez.
            {disconnect.error && (
              <div className="mt-3">
                <ErrorNote>No se pudo desvincular: {disconnect.error.message}</ErrorNote>
              </div>
            )}
          </>
        }
        confirmLabel="Desvincular"
        loading={disconnect.isPending}
        onCancel={() => {
          setConfirmDisconnect(false);
          disconnect.reset();
        }}
        onConfirm={() => disconnect.mutate()}
      />
    </>
  );
}
