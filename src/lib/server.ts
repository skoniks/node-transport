import { EventEmitter } from 'node:events';
import { unlink, unlinkSync } from 'node:fs';
import { Server, Socket } from 'node:net';
import { Callback, Listener, ServerOptions } from './types';
import { payload, ppath, uuid } from './utils';

export declare interface TransportServer {
  on<T>(event: string, listener: Listener<T>): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'client', listener: (client: Socket) => void): this;
  emit(event: string, data: any, callback: Callback): boolean;
  emit(event: 'ready'): boolean;
  emit(event: 'close'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'client', client: Socket): boolean;
}

export class TransportServer extends EventEmitter {
  private server: Server;
  private clients: Set<Socket>;
  private callbacks: Record<string, Callback>;
  private options: ServerOptions;
  private path: string;
  constructor(options: Partial<ServerOptions> = {}) {
    super();
    process.on('exit', this.clean);
    this.clients = new Set();
    this.callbacks = {};
    this.options = { name: options.name || 'ipc' };
    this.path = ppath(this.options.name);
    this.server = new Server()
      .on('connection', (client) => {
        this.emit('client', client);
        this.clients.add(client);
        client
          .on('data', (buffer) => {
            const { id, event, data } = payload.decode(buffer);
            if (id && this.callbacks[id])
              this.callbacks[id](data), delete this.callbacks[id];
            else if (event)
              this.emit(event, data, (data: any) =>
                client.write(payload.encode({ id, event, data })),
              );
          })
          .on('close', () => {
            this.clients.delete(client.end());
          });
      })
      .on('listening', () => {
        this.emit('ready');
      })
      .on('close', () => {
        this.emit('close');
      })
      .on('error', (error) => {
        this.emit('error', error);
        this.clean();
      });
  }
  public async listen(): Promise<this> {
    if (this.server.listening) return this;
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.path, resolve);
    });
    return this;
  }
  public async close(): Promise<this> {
    await new Promise((resolve) => {
      this.server.close(resolve);
      this.clients.forEach((client) => {
        this.clients.delete(client.end());
      });
    });
    await new Promise((resolve) => unlink(this.path, resolve));
    return this;
  }
  private clean(): this {
    try {
      this.server.close();
      this.clients.forEach((client) => {
        this.clients.delete(client.end());
      });
      while (this.server.listening) {}
      unlinkSync(this.path);
    } catch {}
    return this;
  }
  public getClients(): Set<Socket> {
    return this.clients;
  }
  public send<T>(
    client: Socket,
    event: string,
    data: any,
    timeout = 1000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = uuid();
      if (timeout !== -1) {
        this.callbacks[id] = resolve;
        const clean = () => delete this.callbacks[id];
        setTimeout(() => (clean(), reject()), timeout);
      }
      client.write(payload.encode({ id, event, data }));
    });
  }
}
