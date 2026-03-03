declare module 'lz4-napi' {
  export function compress(input: Buffer): Promise<Buffer>;
  export function compressSync(input: Buffer): Buffer;
  export function compressFrame(input: Buffer): Promise<Buffer>;
  export function compressFrameSync(input: Buffer): Buffer;
  export function uncompress(input: Buffer): Promise<Buffer>;
  export function uncompressSync(input: Buffer): Buffer;
  export function decompressFrame(input: Buffer): Promise<Buffer>;
  export function decompressFrameSync(input: Buffer): Buffer;
}

declare module 'tar-stream' {
  import { Readable, Writable, PassThrough } from 'stream';

  interface PackEntry {
    name: string;
    size: number;
    type?: 'file' | 'directory';
    mode?: number;
    mtime?: Date;
  }

  interface Pack extends PassThrough {
    entry(header: PackEntry, callback?: (err: Error | null) => void): Writable;
    entry(header: PackEntry, data: string | Buffer, callback?: (err: Error | null) => void): void;
    finalize(): void;
  }

  interface ExtractEntry extends Readable {
    header: PackEntry & { type: string };
  }

  interface Extract extends Writable {
    on(event: 'entry', listener: (header: PackEntry & { type: string }, stream: ExtractEntry, next: () => void) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: never[]) => void): this;
  }

  export function pack(): Pack;
  export function extract(): Extract;
}

declare module 'bonjour-service' {
  import { EventEmitter } from 'events';

  interface BonjourService {
    name: string;
    type: string;
    host: string;
    port: number;
    addresses: string[];
    txt: Record<string, string>;
    fqdn: string;
  }

  interface Browser extends EventEmitter {
    on(event: 'up', listener: (service: BonjourService) => void): this;
    on(event: 'down', listener: (service: BonjourService) => void): this;
    stop(): void;
    services: BonjourService[];
  }

  interface PublishOptions {
    name: string;
    type: string;
    port: number;
    txt?: Record<string, string>;
  }

  interface BrowseOptions {
    type: string;
  }

  interface Advertisement {
    stop(callback?: () => void): void;
  }

  class Bonjour {
    constructor(opts?: Record<string, unknown>);
    publish(options: PublishOptions): Advertisement;
    find(options: BrowseOptions, onUp?: (service: BonjourService) => void): Browser;
    destroy(): void;
  }

  export default Bonjour;
  export { Bonjour, BonjourService, Browser, Advertisement };
}
