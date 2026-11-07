import React, { useEffect, useRef, useState } from 'react';
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
 * macOS asks the desktop shell for this answer before it talks to System Events.
 * The shell does not build UI; it calls window.onlykeyAskLoginItemAccess.
 */
const LoginItemAccessHost: React.FC = () => {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((answer: LoginItemAccessAnswer) => void) | null>(null);

  useEffect(() => {
    window.onlykeyAskLoginItemAccess = () =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setOpen(true);
      });
    window.dispatchEvent(new Event(LOGIN_ITEM_UI_READY));
    return () => {
      delete window.onlykeyAskLoginItemAccess;
      resolveRef.current = null;
    };
  }, []);

  const answer = (value: LoginItemAccessAnswer) => {
    setOpen(false);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  };

  return (
    <ConfirmDialog
      open={open}
      title="Allow System Events"
      message={LOGIN_ITEM_ACCESS_MESSAGE}
      confirmLabel="Continue"
      cancelLabel="Not now"
      onConfirm={() => answer(true)}
      onCancel={() => answer('later')}
    />
  );
};

export default LoginItemAccessHost;
