import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './dialogs/ConfirmDialog';

/** Same sentence as NSAppleEventsUsageDescription in resources/osx/Info.plist. */
export const LOGIN_ITEM_ACCESS_PURPOSE =
  'OnlyKey uses this once to remove login items left by older versions, so the app starts once in the tray.';

const LOGIN_ITEM_ACCESS_MESSAGE = `macOS will ask OnlyKey to control System Events. Choose Allow. ${LOGIN_ITEM_ACCESS_PURPOSE}`;

export const LOGIN_ITEM_UI_READY = 'onlykey-login-item-ui-ready';

export type LoginItemAccessAnswer = true | 'later';

/** 'remaining': an older version's login item is still there. 'denied': it could not be checked. */
export type LoginItemLeftoverKind = 'remaining' | 'denied';
export type LoginItemLeftoverAnswer = 'open' | 'close';

export const LOGIN_ITEM_LEFTOVER_MESSAGES: Record<LoginItemLeftoverKind, string> = {
  remaining:
    'An older OnlyKey App is still set to open at login, so the app opens in a window when you log in. ' +
    'In Login Items, under Open at Login, select "OnlyKey App" and click the minus (–) button. ' +
    'Start at login keeps working: OnlyKey starts in the tray from its own entry.',
  denied:
    'OnlyKey could not check for a login item left by an older version, because it is not allowed to control System Events. ' +
    'If "OnlyKey App" is listed under Open at Login in Login Items, select it and click the minus (–) button. ' +
    'Start at login keeps working: OnlyKey starts in the tray from its own entry.',
};

declare global {
  interface Window {
    onlykeyAskLoginItemAccess?: () => Promise<LoginItemAccessAnswer>;
    onlykeyShowLoginItemLeftover?: (kind: LoginItemLeftoverKind) => Promise<LoginItemLeftoverAnswer>;
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
  leftoverResolve = null;
  publishLeftover(null);
}

let leftoverResolve: ((answer: LoginItemLeftoverAnswer) => void) | null = null;
let leftoverKind: LoginItemLeftoverKind | null = null;
const leftoverSubscribers = new Set<(kind: LoginItemLeftoverKind | null) => void>();

function publishLeftover(kind: LoginItemLeftoverKind | null) {
  leftoverKind = kind;
  leftoverSubscribers.forEach((notify) => notify(kind));
}

function showLoginItemLeftover(kind: LoginItemLeftoverKind): Promise<LoginItemLeftoverAnswer> {
  return new Promise((resolve) => {
    leftoverResolve?.('close');
    leftoverResolve = resolve;
    publishLeftover(kind === 'denied' ? 'denied' : 'remaining');
  });
}

function settleLoginItemLeftover(answer: LoginItemLeftoverAnswer) {
  const resolve = leftoverResolve;
  leftoverResolve = null;
  publishLeftover(null);
  resolve?.(answer);
}

/**
 * macOS asks the desktop shell for this answer before it talks to System Events.
 * The shell does not build UI; it calls window.onlykeyAskLoginItemAccess.
 */
const LoginItemAccessHost: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [leftover, setLeftover] = useState<LoginItemLeftoverKind | null>(null);

  useEffect(() => {
    window.onlykeyAskLoginItemAccess = askLoginItemAccess;
    window.onlykeyShowLoginItemLeftover = showLoginItemLeftover;
    const notify = (next: boolean) => setOpen(next);
    const notifyLeftover = (kind: LoginItemLeftoverKind | null) => setLeftover(kind);
    subscribers.add(notify);
    leftoverSubscribers.add(notifyLeftover);
    notify(pendingResolve != null);
    notifyLeftover(leftoverKind);
    window.dispatchEvent(new Event(LOGIN_ITEM_UI_READY));
    return () => {
      subscribers.delete(notify);
      leftoverSubscribers.delete(notifyLeftover);
    };
  }, []);

  const dialog = (
    <>
      <ConfirmDialog
        open={open}
        title="Allow System Events"
        message={LOGIN_ITEM_ACCESS_MESSAGE}
        confirmLabel="Continue"
        cancelLabel="Not now"
        onConfirm={() => settleLoginItemAccess(true)}
        onCancel={() => settleLoginItemAccess('later')}
      />
      <ConfirmDialog
        open={!open && leftover != null}
        title="Remove the older login item"
        message={leftover ? LOGIN_ITEM_LEFTOVER_MESSAGES[leftover] : ''}
        confirmLabel="Open Login Items"
        cancelLabel="Close"
        onConfirm={() => settleLoginItemLeftover('open')}
        onCancel={() => settleLoginItemLeftover('close')}
      />
    </>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(dialog, document.body);
  }
  return dialog;
};

export default LoginItemAccessHost;
