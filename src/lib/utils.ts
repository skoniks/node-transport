import cluster from 'node:cluster';
import crypto from 'node:crypto';
import path from 'node:path';
import { Payload } from './types';

export const uuid = () => crypto.randomUUID();
export const ppid = () => (cluster.isPrimary ? process.pid : process.ppid);
export const ppath = (name = `${ppid()}`) =>
  process.platform === 'win32'
    ? path.join('\\\\?\\pipe', `${name}`)
    : path.join('/tmp', `${name}.sock`);
export const timeout = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));
export const payload = {
  encode: (data: Payload) => JSON.stringify(data) + '\n',
  decode: (data: string) => JSON.parse(data) as Payload,
};
