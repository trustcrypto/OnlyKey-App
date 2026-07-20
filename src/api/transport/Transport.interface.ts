/**
 * Represents a generic interface for communicating with a hardware device.
 * This abstraction allows us to swap out transport layers (e.g., Chrome HID, WebHID, Node HID, Mock).
 */
export interface TransportInterface {
  /**
   * Connects to a device matching the filter.
   * @param filter - Vendor/Product ID filter.
   */
  connect(filter: DeviceFilter | DeviceFilter[]): Promise<void>;

  /**
   * Disconnects from the current device.
   */
  disconnect(): Promise<void>;

  /**
   * Sends a raw report to the device.
   * @param reportId - The HID report ID (usually 0).
   * @param data - The raw byte array to send.
   */
  send(reportId: number, data: Uint8Array): Promise<void>;

  /**
   * Sets up a callback for when data is received from the device.
   * @param callback - Function to handle incoming data.
   */
  onReceive(callback: (data: Uint8Array) => void): void;

  /**
   * Sets up a callback for when the device is disconnected.
   * @param callback - Function to handle disconnection.
   */
  onDisconnect(callback: () => void): void;

  /** Vendor/product of the connected HID device, if known. */
  getConnectedDevice?(): DeviceFilter | null;
}

export interface DeviceFilter {
  vendorId: number;
  productId: number;
}
