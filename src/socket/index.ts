import { Server } from 'http';
import { RedisClient } from 'redis';

import Connection from './Connection';

const socker = (server: Server, Redis: RedisClient): void => {
  Connection(server, Redis);
};

export default socker;
