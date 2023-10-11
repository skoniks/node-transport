export type ServerOptions = { name: string };
export type ClientOptions = ServerOptions & {
  reconnect: boolean;
  reconnectDelay: number;
  reconnectAttempts: number;
};
export type Callback = (data: any) => void;
export type Listener<T> = (data: T, callback: Callback) => void;
export type Payload = { id?: string; event?: string; data: any };
