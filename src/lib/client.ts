import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { Callback, ClientOptions, Handler } from './types';
import { payload, ppath, uuid } from './utils';

export declare interface TransportClient {
  on(event: 'ready', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'ready', listener: () => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  emit(event: 'ready'): boolean;
  emit(event: 'close'): boolean;
  emit(event: 'error', error: Error): boolean;
}

export class TransportClient extends EventEmitter {
  private client: Socket;
  private attempts: number;
  private handlers: Record<string, Handler>;
  private callbacks: Record<string, Callback>;
  private options: ClientOptions;
  private path: string;
  constructor(options: Partial<ClientOptions> = {}) {
    super();
    this.attempts = 0;
    this.handlers = {};
    this.callbacks = {};
    this.options = {
      name: options.name || 'ipc',
      reconnectAttempts: options.reconnectAttempts || 0,
      reconnectDelay: options.reconnectDelay || 1000,
      timeout: options.timeout || 0,
    };
    this.path = ppath(this.options.name);
    let buffer = '';
    this.client = new Socket()
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
              Promise.resolve(this.handlers[event](data, { resolve, reject }))
                .then((result) => result !== undefined && resolve(result))
                .catch(reject);
            })
              .then((data) => this.client.write(payload.encode({ id, data })))
              .catch(({ message: error = 'Unknown error' }) =>
                this.client.write(payload.encode({ id, error, data: null })),
              );
        });
      })
      .on('ready', () => {
        this.emit('ready');
      })
      .on('close', () => {
        let reconnect = false;
        const { reconnectDelay, reconnectAttempts } = this.options;
        if (reconnectAttempts < 0 && !this.attempts) reconnect = true;
        else if (reconnectAttempts > ++this.attempts) reconnect = true;
        if (reconnect)
          setTimeout(() => this.client.connect(this.path), reconnectDelay);
        else this.emit('close'), (buffer = '');
      })
      .on('error', (error) => {
        this.emit('error', error);
      });
  }
  public async connect(): Promise<this> {
    this.attempts = 0;
    if (!this.client.pending) return this;
    await new Promise<void>((resolve, reject) => {
      this.once('close', reject);
      this.client.connect(this.path, resolve);
    });
    return this;
  }
  public async close(): Promise<this> {
    this.attempts = this.options.reconnectAttempts;
    await new Promise<void>((resolve) => this.client.end(resolve));
    return this;
  }
  public handle<T>(event: string, handler: Handler<T>): this {
    this.handlers[event] = handler;
    return this;
  }
  public dispatch<T>(
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
      this.client.write(payload.encode({ id, event, data }));
    });
  }
}
