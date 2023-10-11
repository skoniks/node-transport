import cluster from 'node:cluster';
import { TransportClient, TransportServer } from '.';
import { timeout } from './lib/utils';

console.log(process.pid);

async function bootstrap() {
  if (cluster.isPrimary) {
    let count = 0;
    const server = new TransportServer();
    server.on('ready', () => console.log('ready server'));
    server.on('close', () => console.log('close server'));
    server.on('error', (error) => console.error(error));
    server.on('client', (client) => {
      console.log('new client');
      server.send(client, 'hello', 'world', -1);
    });
    server.on<{ foo: string }>('test', (data, callback) => {
      console.log('server', data); // { foo: 'bar' }
      callback({ count: ++count });
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
    client.on<string>('hello', (data) => {
      console.log('hello', data); // 'world'
    });
    await client.connect();
    await client
      .send<{ count: number }>('test', { foo: 'bar' })
      .then((data) => console.log('client', data)); // { count: 1..4 }
    client.once('close', () => process.exit(1));
  }
}

process.on('SIGINT', () => {
  process.exit(2);
});
process.on('uncaughtException', () => {
  process.exit(99);
});
bootstrap();
