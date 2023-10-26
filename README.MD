# @sknx/transport

Node IPC transport compatible with cluster.

## Basic example

```typescript
if (cluster.isPrimary) {
  const server = new TransportServer();
  server.on('client', (client) => {
    console.log('server: new client');
    server.dispatch(client, 'hello', 'world');
  });
  server.handle('test', (data) => {
    console.log('server handle test: %o', data); // { foo: 'bar' }
    return ['any', 'data'];
  });
  await server.listen();
} else {
  const client = new TransportClient();
  client.handle('hello', (data) => {
    console.log('client handle hello: %o', data); // 'world'
  });
  await client.connect();
  client.dispatch('test', { foo: 'bar' }).then((data) => {
    console.log('client test result: %o', data); // ['any', 'data']
  });
}
```

### Server usage

```typescript
const server = new TransportServer({
  name: 'my-server',
  timeout: 1000,
});
await server.listen();
```

| Param     | Type   | Default    | Description                                                                                             |
| --------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| `name`    | string | parent pid | is used for communication between server and client                                                     |
| `timeout` | number | 0          | the timeout of dispatches, if `zero` then no timeout, if `negative` then not awaiting dispatch response |

```typescript
server
  .on('ready', () => console.log('server ready'))
  .on('close', () => console.log('server close'))
  .on('error', (error) => console.error(error))
  .on('client', (client) => console.log('new client'));
```

| Event    | Description                                                      |
| -------- | ---------------------------------------------------------------- |
| `ready`  | emitted when server is ready (before `server.listen()` resolved) |
| `close`  | emitted when server is closed                                    |
| `error`  | emitted when an error occurs                                     |
| `client` | emitted when new client is connected                             |

```typescript
// Server could be restarted
await server.close();
await server.listen();
```

```typescript
// Server broadcasting implementation
const clients = server.getClients();
clients.forEach((client) => server.dispatch(client, 'event', Date.now(), -1));
```

### Client usage

```typescript
const client = new TransportClient({
  name: 'ipc',
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  timeout: 1000,
});
await client.connect();
```

| Param               | Type   | Default    | Description                                                                                             |
| ------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| `name`              | string | parent pid | is used for communication between server and client                                                     |
| `reconnectAttempts` | number | 0          | max reconnection attempts, if `zero` then no reconnection, if `negative` then infinite reconnection     |
| `reconnectDelay`    | number | 1000       | delay between reconnection attempts in `ms`                                                             |
| `timeout`           | number | 0          | the timeout of dispatches, if `zero` then no timeout, if `negative` then not awaiting dispatch response |

```typescript
client
  .on('ready', () => console.log('client ready'))
  .on('close', () => console.log('client close'))
  .on('error', (error) => console.error(error));
```

| Event   | Description                                                       |
| ------- | ----------------------------------------------------------------- |
| `ready` | emitted when client is ready (before `client.connect()` resolved) |
| `close` | emitted when client is closed and reconnections exceeded          |
| `error` | emitted when an error occurs                                      |

### Client / Server communication

```typescript
const server = new TransportServer();
server
  .handle<{ foo: string }>('test1', (data) => {
    console.log('test1: %o', data);
    return 'test1';
  })
  .handle<string | null>('test2', async (data) => {
    console.log('test2: %o', data);
    if (!data) throw new Error('No data');
    return 'test2';
  })
  .handle<number | null>('test3', async (data, { resolve, reject }) => {
    console.log('test3: %o', data);
    if (!data) reject(new Error('No data'));
    resolve('test3');
  })
  .handle<number>('test4', (data, { resolve }) => {
    console.log('test4: %o', data);
    setTimeout(() => resolve('test4'), data);
  });
await server.listen();
//
const client = new TransportClient();
await client.connect();
const data = await client.dispatch<string>('test1', { foo: 'bar1' });
console.log('test1 result: %o', data);
await client
  .dispatch<string>('test2', 'bar2')
  .then((data) => console.log('test2 result: %o', data))
  .catch((error) => console.log('test2 error: %o', error.message));
await client
  .dispatch<string>('test3', 0)
  .then((data) => console.log('test3 result: %o', data))
  .catch((error) => console.log('test3 error: %o', error.message));
await client
  .dispatch<string>('test4', 1000, 100)
  .then((data) => console.log('test4 result: %o', data))
  .catch((error) => console.log('test4 error: %o', error.message));
await client
  .dispatch<string>('test4', 50, 100)
  .then((data) => console.log('test4 result: %o', data))
  .catch((error) => console.log('test4 error: %o', error.message));
```

```log
test1: { foo: 'bar1' }
test1 result: 'test1'
test2: 'bar2'
test2 result: 'test2'
test3: 0
test3 error: 'No data'
test4: 1000
test4 error: 'Dispatch timed out'
test4: 50
test4 result: 'test4'
```

_Only one handler can be set for each event, since the result of the handler execution is sent in the response_
