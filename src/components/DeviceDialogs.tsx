import React from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';

const UDEV_DOCS_URL = 'https://docs.crp.to/appfaq.html#onlykey-app-on-linux';

const DeviceDialogs: React.FC = () => {
  const {
    isLocked,
    deviceType,
    pinError,
    showUdevDialog,
    dismissUdevDialog,
  } = useDeviceStore();
  const isDuo = deviceType === DeviceType.DUO;

  if (showUdevDialog) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-ok-gray max-w-lg w-full rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-xl font-bold">Linux USB Permissions</h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            OnlyKey could not access the device. On Linux you may need udev rules so your user can open the HID device without root.
          </p>
          <a
            href={UDEV_DOCS_URL}
            className="inline-block text-sm"
            target="_blank"
            rel="noreferrer"
          >
            View Linux setup instructions
          </a>
          <div className="flex justify-end">
            <button
              onClick={dismissUdevDialog}
              className="px-4 py-2 rounded-lg bg-ok-blue hover:bg-blue-600 font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pinError && isLocked && isDuo) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[65] max-w-md w-full mx-4">
        <div className="p-4 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm text-center">
          {pinError}
        </div>
      </div>
    );
  }

  return null;
};

export default DeviceDialogs;