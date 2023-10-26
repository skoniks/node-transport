import cluster from 'node:cluster';
import { TransportClient, TransportServer } from '.';
import { timeout } from './lib/utils';

console.log(process.pid);

async function bootstrap() {
  // const server = new TransportServer();
  // server
  //   .handle<{ foo: string }>('test1', (data) => {
  //     console.log('test1: %o', data);
  //     return 'test1';
  //   })
  //   .handle<string | null>('test2', async (data) => {
  //     console.log('test2: %o', data);
  //     if (!data) throw new Error('No data');
  //     return 'test2';
  //   })
  //   .handle<number | null>('test3', async (data, { resolve, reject }) => {
  //     console.log('test3: %o', data);
  //     if (!data) reject(new Error('No data'));
  //     resolve('test3');
  //   })
  //   .handle<number>('test4', (data, { resolve }) => {
  //     console.log('test4: %o', data);
  //     setTimeout(() => resolve('test4'), data);
  //   });
  // await server.listen();
  // //
  // const client = new TransportClient();
  // await client.connect();
  // await client
  //   .dispatch<string>('test1', { foo: 'bar1' })
  //   .then((data) => console.log('test1 result: %o', data));
  // await client
  //   .dispatch<string>('test2', 'bar2')
  //   .then((data) => console.log('test2 result: %o', data))
  //   .catch((error) => console.log('test2 error: %o', error.message));
  // await client
  //   .dispatch<string>('test3', 0)
  //   .then((data) => console.log('test3 result: %o', data))
  //   .catch((error) => console.log('test3 error: %o', error.message));
  // await client
  //   .dispatch<string>('test4', 1000, 100)
  //   .then((data) => console.log('test4 result: %o', data))
  //   .catch((error) => console.log('test4 error: %o', error.message));
  // await client
  //   .dispatch<string>('test4', 50, 100)
  //   .then((data) => console.log('test4 result: %o', data))
  //   .catch((error) => console.log('test4 error: %o', error.message));

  if (cluster.isPrimary) {
    let count = 0;
    const server = new TransportServer();
    server.on('ready', () => console.log('ready server'));
    server.on('close', () => console.log('close server'));
    server.on('error', (error) => console.error(error));
    server.on('client', (client) => {
      console.log('new client');
      server.dispatch(client, 'hello', 'world');
    });
    server.handle<{ foo: string }>('test', (data) => {
      console.log('server', data); // { foo: 'bar' }
      return { count: ++count };
    });
    server.handle<{ foo: string }>('test2', (data, { resolve, reject }) => {
      console.log('server', data);
      if (count > 2) reject(new Error('too many'));
      resolve({ count: ++count });
    });
    await server.listen();
    // await server.close();
    //
    for (let i = 0; i < 4; i++) cluster.fork();
    //
    await timeout(5000);
    await server.close();
  } else {
    const client = new TransportClient();
    client.on('ready', () => console.log('ready client'));
    client.on('close', () => console.log('close client'));
    client.on('error', (error) => console.error(error));
    client.handle<string>('hello', (data) => {
      console.log('hello', data); // 'world'
    });
    await client.connect();
    await client
      .dispatch<{ count: number }>('test', { foo: 'bar' })
      .then((data) => console.log('client', data)); // { count: 1..4 }
    client.once('close', () => process.exit(1));
  }
}

process.on('SIGINT', () => process.exit(2));
process.on('SIGQUIT', () => process.exit(2));
process.on('SIGTERM', () => process.exit(2));
// process.on('uncaughtException', () => process.exit(99));

bootstrap();
