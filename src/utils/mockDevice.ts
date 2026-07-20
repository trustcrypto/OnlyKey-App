/** Use MockTransport instead of HID — vitest (env) or `?mock=1` (browser). */
export function shouldUseMockDevice(): boolean {
  if (typeof window !== 'undefined') {
    const mock = new URLSearchParams(window.location.search).get('mock');
    if (mock === '0') return false;
    if (mock === '1') return true;
  }
  return import.meta.env.VITE_MOCK_DEVICE === 'true';
}