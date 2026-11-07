import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './dialogs/ConfirmDialog';

/** Same sentence as NSAppleEventsUsageDescription in resources/osx/Info.plist. */
export const LOGIN_ITEM_ACCESS_PURPOSE =
  'OnlyKey uses this once to remove login items left by older versions, so the app starts once in the tray.';

const LOGIN_ITEM_ACCESS_MESSAGE = `macOS will ask OnlyKey to control System Events. Choose Allow. ${LOGIN_ITEM_ACCESS_PURPOSE}`;

export const LOGIN_ITEM_UI_READY = 'onlykey-login-item-ui-ready';

export type LoginItemAccessAnswer = true | 'later';

declare global {
  interface Window {
    onlykeyAskLoginItemAccess?: () => Promise<LoginItemAccessAnswer>;
  }
}

/**
 * The document-start inject script cannot see this page's globals. The pending
 * request lives on the module so a remount still opens the note the shell asked for.
 */
let pendingResolve: ((answer: LoginItemAccessAnswer) => void) | null = null;
const subscribers = new Set<(open: boolean) => void>();

function publish(open: boolean) {
  subscribers.forEach((notify) => notify(open));
}

function askLoginItemAccess(): Promise<LoginItemAccessAnswer> {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    publish(true);
  });
}

function settleLoginItemAccess(answer: LoginItemAccessAnswer) {
  const resolve = pendingResolve;
  pendingResolve = null;
  publish(false);
  resolve?.(answer);
}

export function resetLoginItemAccessPrompt() {
  pendingResolve = null;
  publish(false);
}

/**
 * macOS asks the desktop shell for this answer before it talks to System Events.
 * The shell does not build UI; it calls window.onlykeyAskLoginItemAccess.
 */
const LoginItemAccessHost: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    window.onlykeyAskLoginItemAccess = askLoginItemAccess;
    const notify = (next: boolean) => setOpen(next);
    subscribers.add(notify);
    notify(pendingResolve != null);
    window.dispatchEvent(new Event(LOGIN_ITEM_UI_READY));
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      title="Allow System Events"
      message={LOGIN_ITEM_ACCESS_MESSAGE}
      confirmLabel="Continue"
      cancelLabel="Not now"
      onConfirm={() => settleLoginItemAccess(true)}
      onCancel={() => settleLoginItemAccess('later')}
    />
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(dialog, document.body);
  }
  return dialog;
};

export default LoginItemAccessHost;
