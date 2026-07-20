import { TransportInterface, DeviceFilter } from './Transport.interface';
import { MessageID, MESSAGE_HEADER, PACKET_SIZE } from '../device/types';

export class MockTransport implements TransportInterface {
  private connected = false;
  private receiveCallback: ((data: Uint8Array) => void) | null = null;
  private deviceType: 'classic' | 'duo' = 'classic';
  private isLocked = true;

  private disconnectCallback: (() => void) | null = null;

  async connect(filter: DeviceFilter): Promise<void> {
    this.connected = true;
    console.log('MockTransport: Connected to device', filter);
    
    // Simulate initial device response (Status/Version)
    setTimeout(() => {
      this.simulateResponse(this.deviceType === 'duo' ? 'INITIALIZED-Dv3.0.0-prod' : 'INITIALIZEDv2.1.0-prod');
    }, 100);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('MockTransport: Disconnected');
    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  async send(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error('Not connected');
    
    const msgId = data[MESSAGE_HEADER.length];
    console.log('MockTransport: Received command', MessageID[msgId], data);

    // Simulate responses based on command
    switch (msgId) {
      case MessageID.OKSETTIME:
        this.simulateResponse('OK');
        break;
      case MessageID.OKGETLABELS:
        this.simulateLabels();
        break;
      case MessageID.OKSETPIN:
        this.isLocked = false;
        this.simulateResponse('UNLOCKEDv3.0.0-prod');
        break;
      case MessageID.OKSETSLOT:
        this.simulateResponse('Success');
        break;
      default:
        this.simulateResponse('OK');
    }
  }

  onReceive(callback: (data: Uint8Array) => void): void {
    this.receiveCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  getConnectedDevice() {
    return { vendorId: 0x1d50, productId: this.deviceType === 'duo' ? 0x614c : 0x60fc };
  }

  private simulateResponse(text: string) {
    if (this.receiveCallback) {
      const data = new Uint8Array(PACKET_SIZE);
      for (let i = 0; i < text.length; i++) {
        data[i] = text.charCodeAt(i);
      }
      this.receiveCallback(data);
    }
  }

  private simulateLabels() {
    const labels = [
      '01|Gmail',
      '02|GitHub',
      '1a|Work VPN',
      '1b|Bank'
    ];
    
    labels.forEach((l, i) => {
      setTimeout(() => this.simulateResponse(l), i * 50);
    });
  }
}
