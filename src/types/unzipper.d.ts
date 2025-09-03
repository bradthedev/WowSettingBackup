declare module 'unzipper' {
  import { Transform } from 'stream';

  export interface ExtractOptions {
    path: string;
  }

  export interface FileEntry {
    path: string;
    type: string;
  }

  export interface Directory {
    files: FileEntry[];
  }

  export const Extract: {
    (options: ExtractOptions): Transform;
  };

  export const Open: {
    file(path: string): Promise<Directory>;
  };
}