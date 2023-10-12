import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { Callback, ClientOptions, Listener } from './types';
import { payload, ppath, uuid } from './utils';

export declare interface TransportClient {
  on<T>(event: string, listener: Listener<T>): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'ready', listener: () => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  emit(event: string, data: any, callback: Callback): boolean;
  emit(event: 'ready'): boolean;
  emit(event: 'close'): boolean;
  emit(event: 'error', error: Error): boolean;
}

export class TransportClient extends EventEmitter {
  private client: Socket;
  private attempts: number;
  private callbacks: Record<string, Callback>;
  private options: ClientOptions;
  private path: string;
  constructor(options: Partial<ClientOptions> = {}) {
    super();
    this.attempts = 0;
    this.callbacks = {};
    this.options = {
      name: options.name || 'ipc',
      reconnect: options.reconnect || false,
      reconnectDelay: options.reconnectDelay || 1000,
      reconnectAttempts: options.reconnectAttempts || 5,
    };
    this.path = ppath(this.options.name);
    this.client = new Socket()
      .on('data', (buffer) => {
        const { id, event, data } = payload.decode(buffer);
        if (id && this.callbacks[id])
          this.callbacks[id](data), delete this.callbacks[id];
        else if (event)
          this.emit(event, data, (data: any) =>
            this.client.write(payload.encode({ id, data })),
          );
      })
      .on('ready', () => {
        this.emit('ready');
      })
      .on('close', () => {
        const { reconnect, reconnectDelay, reconnectAttempts } = this.options;
        if (reconnect && ++this.attempts <= reconnectAttempts)
          setTimeout(() => this.client.connect(this.path), reconnectDelay);
        else this.emit('close');
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
  public send<T>(event: string, data: any, timeout = 1000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = uuid();
      if (timeout !== -1) {
        this.callbacks[id] = resolve;
        const clean = () => delete this.callbacks[id];
        setTimeout(() => (clean(), reject()), timeout);
      }
      this.client.write(payload.encode({ id, event, data }));
    });
  }
}
