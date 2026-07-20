declare namespace chrome.hid {
  interface DeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }

  interface Device {
    deviceId: number;
    vendorId: number;
    productId: number;
    productName: string;
    serialNumber: string;
    collections: {
      usagePage: number;
      usage: number;
      reportIds: number[];
    }[];
    maxInputReportSize: number;
    maxOutputReportSize: number;
    maxFeatureReportSize: number;
    reportDescriptor: ArrayBuffer;
  }

  interface Connection {
    connectionId: number;
  }

  interface GetDevicesOptions {
    filters?: DeviceFilter[];
  }

  function getDevices(options: GetDevicesOptions, callback: (devices: Device[]) => void): void;
  function connect(deviceId: number, callback: (connection: Connection) => void): void;
  function disconnect(connectionId: number, callback?: () => void): void;
  function receive(connectionId: number, callback: (reportId: number, data: ArrayBuffer) => void): void;
  function send(connectionId: number, reportId: number, data: ArrayBuffer, callback?: () => void): void;
  function receiveFeatureReport(connectionId: number, reportId: number, callback: (data: ArrayBuffer) => void): void;
  function sendFeatureReport(connectionId: number, reportId: number, data: ArrayBuffer, callback?: () => void): void;
}
