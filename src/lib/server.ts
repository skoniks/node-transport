import { EventEmitter } from 'node:events';
import { unlink, unlinkSync } from 'node:fs';
import { Server, Socket } from 'node:net';
import { Callback, Handler, ServerOptions } from './types';
import { payload, ppath, uuid } from './utils';

export declare interface TransportServer {
  on(event: 'ready', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'client', listener: (client: Socket) => void): this;
  once(event: 'ready', listener: () => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'client', listener: (client: Socket) => void): this;
  emit(event: 'ready'): boolean;
  emit(event: 'close'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'client', client: Socket): boolean;
}

export class TransportServer extends EventEmitter {
  private server: Server;
  private clients: Set<Socket>;
  private handlers: Record<string, Handler>;
  private callbacks: Record<string, Callback>;
  private options: ServerOptions;
  private path: string;
  constructor(options: Partial<ServerOptions> = {}) {
    super();
    process.on('exit', this.clean);
    this.clients = new Set();
    this.handlers = {};
    this.callbacks = {};
    this.options = {
      name: options.name || 'ipc',
      timeout: options.timeout || 0,
    };
    this.path = ppath(this.options.name);
    this.server = new Server()
      .on('connection', (client) => {
        this.emit('client', client);
        this.clients.add(client);
        let buffer = '';
        client
          .on('data', (chunk) => {
            buffer += chunk.toString();
            buffer.match(/(.*?)\n/g)?.forEach((value) => {
              buffer = buffer.substring(value.length);
              const { id, event, error, data } = payload.decode(value);
              if (id && this.callbacks[id]) {
                if (error) this.callbacks[id].reject(new Error(error));
                else this.callbacks[id].resolve(data);
                delete this.callbacks[id];
              } else if (event && this.handlers[event])
                new Promise((resolve, reject) => {
                  Promise.resolve(
                    this.handlers[event](data, { resolve, reject }),
                  )
                    .then((result) => result !== undefined && resolve(result))
                    .catch(reject);
                })
                  .then((data) => client.write(payload.encode({ id, data })))
                  .catch(({ message: error = 'Unknown error' }) =>
                    client.write(payload.encode({ id, error, data: null })),
                  );
            });
          })
          .on('close', () => {
            this.clients.delete(client.end());
            buffer = '';
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
      this.once('close', reject);
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
  public handle<T>(event: string, handler: Handler<T>): this {
    this.handlers[event] = handler;
    return this;
  }
  public dispatch<T>(
    client: Socket,
    event: string,
    data: any,
    timeout = this.options.timeout,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = uuid();
      const clear = () => delete this.callbacks[id];
      const error = () => reject(new Error('Dispatch timed out'));
      if (timeout >= 0) this.callbacks[id] = { resolve, reject };
      if (timeout > 0) setTimeout(() => (clear(), error()), timeout);
      if (timeout < 0) resolve(undefined as T);
      client.write(payload.encode({ id, event, data }));
    });
  }
}
