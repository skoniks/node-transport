# @sknx/transport

Node IPC transport compatible with cluster.

## Server usage

```typescript
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
```

## Client usage

```typescript
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
// await client.close();
```
