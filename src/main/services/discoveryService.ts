import BonjourModule from 'bonjour-service';
import type { Browser, Advertisement, BonjourService } from 'bonjour-service';

// Handle both ESM default and CJS named export
const Bonjour = (BonjourModule as unknown as { Bonjour: typeof BonjourModule }).Bonjour ?? BonjourModule;
import { EventEmitter } from 'events';
import { SYNC_SERVICE_TYPE } from './syncProtocol';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';

export interface DiscoveredHost {
  id: string;
  name: string;
  address: string;
  port: number;
  wowVersion: string;
  backupTimestamp?: string;
}

export class DiscoveryService extends EventEmitter {
  private bonjour: InstanceType<typeof Bonjour> | null = null;
  private advertisement: Advertisement | null = null;
  private browser: Browser | null = null;
  private discoveredHosts: Map<string, DiscoveredHost> = new Map();

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  advertise(port: number, backupTimestamp?: string): void {
    this.stopAdvertising();
    this.bonjour = new Bonjour();

    const deviceId = this.config.get('deviceId');
    const deviceName = this.config.get('deviceName');
    const wowVersion = this.config.get('wowVersion');

    this.advertisement = this.bonjour.publish({
      name: `WoW Backup - ${deviceName}`,
      type: SYNC_SERVICE_TYPE,
      port,
      txt: {
        hostId: deviceId,
        hostName: deviceName,
        wowVersion,
        backupTimestamp: backupTimestamp ?? '',
      },
    });

    this.logger.info('mDNS advertising started', { port, deviceName });
  }

  stopAdvertising(): void {
    if (this.advertisement) {
      this.advertisement.stop(() => {});
      this.advertisement = null;
    }
    if (this.bonjour && !this.browser) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.logger.info('mDNS advertising stopped');
  }

  browse(): void {
    this.stopBrowsing();
    if (!this.bonjour) {
      this.bonjour = new Bonjour();
    }

    const browser = this.bonjour.find({ type: SYNC_SERVICE_TYPE });
    this.browser = browser;

    browser.on('up', (service: BonjourService) => {
      const hostId = service.txt?.hostId;
      if (!hostId || hostId === this.config.get('deviceId')) return;

      const host: DiscoveredHost = {
        id: hostId,
        name: service.txt?.hostName ?? service.name,
        address: service.addresses?.[0] ?? service.host,
        port: service.port,
        wowVersion: service.txt?.wowVersion ?? '',
        backupTimestamp: service.txt?.backupTimestamp,
      };

      this.discoveredHosts.set(hostId, host);
      this.emit('hostFound', host);
      this.logger.info('Host discovered', { hostId, name: host.name, address: host.address });
    });

    browser.on('down', (service: BonjourService) => {
      const hostId = service.txt?.hostId;
      if (hostId) {
        this.discoveredHosts.delete(hostId);
        this.emit('hostLost', hostId);
        this.logger.info('Host lost', { hostId });
      }
    });

    this.logger.info('mDNS browsing started');
  }

  stopBrowsing(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour && !this.advertisement) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.discoveredHosts.clear();
    this.logger.info('mDNS browsing stopped');
  }

  getDiscoveredHosts(): DiscoveredHost[] {
    return Array.from(this.discoveredHosts.values());
  }

  destroy(): void {
    this.stopAdvertising();
    this.stopBrowsing();
  }
}
