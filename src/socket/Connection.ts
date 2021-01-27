/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable func-names */
import { Server, createServer } from 'http';
import { RedisClient } from 'redis';
import * as socketIo from 'socket.io';

import { verifySocker, SocketAuth } from '../middlewares/auth';

let socketOrder: SocketAuth;

export interface SocketQuery {
  type?: 'dash' | 'client' | 'app_print';
  storeId: string;
  clientTableId: string;
  clientClientId: string;
  clientOrderId: string | undefined;
}

interface ClientData {
  table: string;
  storeId: string;
  clientId: string;
  socketId: string;
}
interface TableLoginData {
  table: string;
  storeId: string;
  clientId: string;
}

interface OrderCreateData {
  table: string;
  storeId: string;
  orderId: string;
}

interface OrderAcceptData {
  table: string;
  storeId: string;
  clientId: string;
  orderId: string;
}

const connection = (server: Server, Redis: RedisClient): void => {
  const io = require('socket.io')({
    path: '/communication',
    cors: {
      origin: '*'
    }
  }) as socketIo.Server;

  console.log('Started monit listening!');

  io.attach(server)
    .use(verifySocker)
    .on('connection', (socket: SocketAuth) => {
      let monitInterval: any;

      const socketQuery = socket.handshake.query as SocketQuery;

      socket.join(`${socketQuery.storeId}:${socketQuery.type}`);
      socket.join(`${socketQuery.storeId}`);

      console.info(`Client entrou (${socketQuery.type}) [id=${socket.id}]`);

      if (socketQuery.clientClientId && socketQuery.type === 'client') {
        Redis.hmset(
          `Client:Login:${socketQuery.storeId}:${socketQuery.clientTableId}:${socketQuery.clientClientId}`,
          {
            data: JSON.stringify({
              storeId: socketQuery.storeId,
              table: socketQuery.clientTableId,
              clientId: socketQuery.clientClientId,
              socketId: socket.id
            }),
            date_limit: new Date().getTime()
          }
        );

        if (socketQuery.clientOrderId) {
          Redis.hgetall(
            `Client:OrdersAccept:client:${socketQuery.storeId}:${socketQuery.clientOrderId}`,
            (errGet, object: any) => {
              if (object === null) return;
              socket.emit('dash:order:accept', JSON.parse(object.data));
            }
          );
        }
      } else {
        Redis.keys(
          `Client:OrdersPendent:${socketQuery.type}:${socketQuery.storeId}:*`,
          (err, keys: string[]) => {
            keys.forEach(key => {
              Redis.hgetall(key, (errGet, object: any) => {
                socket.emit('client:order:create', JSON.parse(object.data));
              });
            });
          }
        );

        Redis.keys(
          `Dash:OrdersAccept:${socketQuery.type}:${socketQuery.storeId}:*`,
          (err, keys: string[]) => {
            keys.forEach(key => {
              Redis.hgetall(key, (errGet, object: any) => {
                socket.emit('dash:order:accept', JSON.parse(object.data));
              });
            });
          }
        );
      }

      socket.on('disconnect', () => {
        console.info(`Client saiu [id=${socket.id}]`);
      });

      socket.on('message', async function (message: string, timestamp = 1000) {
        console.log(message);
      });

      socket.on('client:table:login', async function (_, timestamp = 1000) {
        Redis.hmset(
          `Client:Login:${socketQuery.storeId}:${socketQuery.clientTableId}:${socketQuery.clientClientId}`,
          {
            data: JSON.stringify({
              storeId: socketQuery.storeId,
              table: socketQuery.clientTableId,
              clientId: socketQuery.clientClientId,
              socketId: socket.id
            }),
            date_limit: new Date().getTime()
          }
        );

        socket.to(`${socketQuery.storeId}:dash`).emit('client:table:login', {
          storeId: socketQuery.storeId,
          table: socketQuery.clientTableId,
          clientId: socketQuery.clientClientId
        });
      });

      socket.on(
        'client:order:create',
        async function ({ orderId }: OrderCreateData, timestamp = 1000) {
          const table = socketQuery.clientTableId;
          const clientId = socketQuery.clientClientId;
          const { storeId } = socketQuery;

          Redis.hmset(`Client:OrdersPendent:dash:${storeId}:${orderId}`, {
            data: JSON.stringify({
              table,
              storeId,
              orderId,
              clientId
            }),
            date_limit: new Date().getTime()
          });
          Redis.hmset(`Client:OrdersPendent:app_print:${storeId}:${orderId}`, {
            data: JSON.stringify({
              table,
              storeId,
              orderId,
              clientId
            }),
            date_limit: new Date().getTime()
          });

          socket.to(`${socketQuery.storeId}:dash`).emit('client:order:create', {
            table,
            storeId,
            orderId,
            clientId
          });

          socket
            .to(`${socketQuery.storeId}:app_print`)
            .emit('client:order:create', {
              table,
              storeId,
              orderId,
              clientId
            });
        }
      );

      socket.on(
        'client:line:login',
        async function (message: string, timestamp = 1000) {
          console.log(message);
          /**
           * Create Order
           * O cliente cria a order e é chegada aqui a notificação da mesma aviando que tal cliente criou a order.
           *
           * Após chegar a notificação é feito os disparos para:
           * 1. Dashboard - Adiciona Pessoa a fila
           */
        }
      );

      socket.on(
        'dash:order:accept',
        async function (
          { table, storeId, clientId, orderId }: OrderAcceptData,
          timestamp = 1000
        ) {
          console.log(`Client:Login:${storeId}:${table}:${clientId}`);
          const client = await new Promise<ClientData>(resolveAccept => {
            Redis.hgetall(
              `Client:Login:${storeId}:${table}:${clientId}`,
              (errGet, object: any) => {
                resolveAccept(JSON.parse(object.data));
              }
            );
          });

          Redis.del(`Client:OrdersPendent:dash:${storeId}:${orderId}`);

          Redis.hmset(
            `Client:OrdersAccept:client:${storeId}:${orderId}`,
            {
              data: JSON.stringify({
                table,
                storeId,
                orderId,
                clientId
              }),
              date_limit: new Date().getTime()
            },
            () => {
              socket.to(client.socketId).emit('dash:order:accept', {
                table,
                storeId,
                clientId,
                orderId
              });
            }
          );

          Redis.hmset(`Dash:OrdersAccept:app_print:${storeId}:${orderId}`, {
            data: JSON.stringify({
              table,
              storeId,
              orderId,
              clientId
            }),
            date_limit: new Date().getTime()
          });

          socket.to(`${socketQuery.storeId}:dash`).emit('dash:order:accept', {
            table,
            storeId,
            clientId,
            orderId
          });

          socket
            .to(`${socketQuery.storeId}:app_print`)
            .emit('dash:order:accept', {
              table,
              storeId,
              clientId,
              orderId
            });
        }
      );

      socket.on(
        'dash:order:finish',
        async function (message: string, timestamp = 1000) {
          console.log(message);
          /**
           * Create Order
           * O cliente cria a order e é chegada aqui a notificação da mesma aviando que tal cliente criou a order.
           *
           * Após chegar a notificação é feito os disparos para:
           * 1. Cliente - Notifica cliente para pagamento/finalizado
           * 2. APP Print - Se existir NF imprime a mesma
           */
        }
      );

      socket.on(
        'dash:line:added-table',
        async function (message: string, timestamp = 1000) {
          console.log(message);
          /**
           * Create Order
           * O cliente cria a order e é chegada aqui a notificação da mesma aviando que tal cliente criou a order.
           *
           * Após chegar a notificação é feito os disparos para:
           * 1. Cliente - Notifica Cliente que foi aceito e configura mesa
           */
        }
      );

      /**
       *
       *
       *
       *
       * Response Only
       */

      socket.on(
        'client:order:accept',
        async function (
          { storeId, orderId }: OrderCreateData,
          timestamp = 1000
        ) {
          Redis.del(`Client:OrdersAccept:client:${storeId}:${orderId}`);
        }
      );

      socket.on(
        'print:order:create',
        async function (
          { storeId, orderId }: OrderCreateData,
          timestamp = 1000
        ) {
          Redis.del(`Client:OrdersPendent:app_print:${storeId}:${orderId}`);
        }
      );

      socket.on(
        'print:order:accept',
        async function (
          { storeId, orderId }: OrderCreateData,
          timestamp = 1000
        ) {
          Redis.del(`Dash:OrdersAccept:app_print:${storeId}:${orderId}`);
        }
      );
    });
};

export default connection;
