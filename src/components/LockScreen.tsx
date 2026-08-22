import React, { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';

const LOCK_POLL_MS = 1500;

const LockScreen: React.FC = () => {
  const { deviceType, device, isLocked, isConnected, isBootloader, pinError, activeTab } =
    useDeviceStore();
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classicUnlockActive, setClassicUnlockActive] = useState(false);
  const pollInFlight = useRef(false);

  const isDuo = deviceType === DeviceType.DUO;

  // Classic unlock is entirely on-device (6-button keypad). Firmware ignores OKSETPIN
  // once initialized unless in config mode. Poll OKSETTIME so we notice UNLOCKED even
  // if the single unsolicited unlock HID report was missed. Keep polling while locked
  // in config mode — firmware does not print UNLOCKED on the PIN itself. DUO is polled
  // too: the config-mode PIN may be entered on the keypad instead of the app form.
  useEffect(() => {
    if (
      !isConnected ||
      !isLocked ||
      !device ||
      isBootloader ||
      deviceType === DeviceType.UNINITIALIZED ||
      deviceType === DeviceType.BOOTLOADER
    ) {
      setClassicUnlockActive(false);
      return;
    }

    let cancelled = false;
    if (!isDuo) setClassicUnlockActive(true);

    const tick = async () => {
      if (cancelled || pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        await device.refreshStatus();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Timeouts are expected while locked: firmware set_time is silent until PIN.
        if (msg !== 'Device disconnected' && !/timed out/i.test(msg)) {
          console.error('Lock status poll failed:', err);
        }
      } finally {
        pollInFlight.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, LOCK_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      setClassicUnlockActive(false);
    };
  }, [isConnected, isLocked, device, isDuo, deviceType, isBootloader]);

  if (
    !isConnected ||
    !isLocked ||
    activeTab === 'tools' ||
    deviceType === DeviceType.UNINITIALIZED ||
    deviceType === DeviceType.BOOTLOADER ||
    isBootloader
  ) {
    return null;
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device || !pin) return;

    setIsSubmitting(true);
    try {
      await device.sendPinDUO([pin], false);
      setPin('');
      // DUO unlock reply is UNLOCKED* on the same request; also probe in case it was missed.
      try {
        await device.refreshStatus();
      } catch {
        // ignore probe errors; statusChange from setPin may already have unlocked
      }
    } catch (err) {
      console.error('Unlock failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pinAttemptsExceeded = pinError?.includes('password attempts');
  const incorrectPin = pinError?.includes('Incorrect PIN') || pinError?.includes('INITIALIZED-D');

  return (
    <div
      data-testid="lock-screen"
      className="absolute inset-0 bg-ok-dark/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300"
    >
      <h2 className="text-2xl font-bold mb-2">
        {isDuo ? 'OnlyKey DUO Locked' : 'OnlyKey Locked'}
      </h2>

      {isDuo ? (
        <div className="w-full max-w-xs space-y-4">
          {pinAttemptsExceeded ? (
            <p className="text-red-400 text-sm">
              PIN attempts exceeded for this session. Unplug and replug your OnlyKey.
            </p>
          ) : incorrectPin ? (
            <p className="text-red-400 text-sm">Incorrect PIN. Please try again.</p>
          ) : (
            <p className="text-gray-400 text-sm mb-6">
              Please enter your PIN below to unlock your device.
            </p>
          )}
          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              disabled={isSubmitting || pinAttemptsExceeded}
              autoFocus
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] focus:border-ok-blue focus:ring-1 focus:ring-ok-blue outline-none transition-all placeholder:tracking-normal placeholder:text-sm"
            />
            <button
              type="submit"
              disabled={isSubmitting || !pin || pinAttemptsExceeded}
              className="w-full py-3 bg-ok-blue hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-ok-blue transition-colors rounded-xl font-bold"
            >
              {isSubmitting ? 'Unlocking...' : 'Unlock Device'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4 max-w-sm">
          <p className="text-gray-400 text-sm">
            Enter your PIN on the OnlyKey six-button keypad.
          </p>
          <div
            data-testid="classic-unlock-wait"
            className="inline-block px-4 py-2 bg-white/5 rounded-full text-xs text-gray-500 animate-pulse"
          >
            {classicUnlockActive ? 'Waiting for PIN on device…' : 'Ready for PIN on device…'}
          </div>
        </div>
      )}
    </div>
  );
};

export default LockScreen;
