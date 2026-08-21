type ChromeHid = { hid?: { getDevices?: unknown } };

export function getHidStatus(): { available: boolean; hint: string } {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeHid }).chrome;
  const available = !!chromeApi?.hid?.getDevices;

  if (available) {
    return { available: true, hint: 'HID API ready — polling for your device.' };
  }

  const onLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return {
    available: false,
    hint: onLocalhost
      ? 'HID unavailable on localhost. Close this window and run: npm start'
      : 'HID API unavailable. Run the app with: npm start',
  };
}
