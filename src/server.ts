import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import 'dotenv/config';
import path from 'path';
import Redis from './lib/Redis';
import socker from './socket';

const app = express();
app.use(cors());

const http = new Server(app);

const portOfApplication = 3000;

socker(http, Redis);

app.get('/', (req: any, res: any) => {
  res.sendFile(path.resolve('./static/index.html'));
});

app.get('/store', (req: any, res: any) => {
  res.sendFile(path.resolve('./static/store.html'));
});

app.get('/print', (req: any, res: any) => {
  res.sendFile(path.resolve('./static/print.html'));
});

export default async (): Promise<void> => {
  http.listen(portOfApplication, () => {
    console.log(`listening on *:${portOfApplication}`);
  });
};
