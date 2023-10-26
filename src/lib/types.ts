export type ServerOptions = {
  name: string;
  timeout: number;
};
export type ClientOptions = ServerOptions & {
  reconnectAttempts: number;
  reconnectDelay: number;
};
export type Callback = {
  resolve: (data: any) => void;
  reject: (reason?: unknown) => void;
};
export type Handler<T = any> = (
  data: T,
  callback: Callback,
) => Promise<any> | any;
export type Payload = {
  id?: string;
  event?: string;
  error?: string;
  data: any;
};
