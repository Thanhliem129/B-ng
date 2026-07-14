import { config } from './config.ts';
import { loadContent } from './content.ts';
import { Db } from './db.ts';
import { createTransport } from './push.ts';
import { Engine } from './engine.ts';
import { Scheduler } from './scheduler.ts';
import { createApi } from './api.ts';

console.log('🐾 Bông server — Phase 0 (zero-LLM, content-driven)');

const content = loadContent(config.contentDir);
console.log(
  `📚 Content: ${content.templates.length} template, ${content.arcs.length} arc, ` +
  `${content.replyRules.length} reply rule, ${content.cast.neighbors.length} hàng xóm`,
);

const db = new Db(config.dbPath);
const transport = createTransport(config.fcmServiceAccount);
const engine = new Engine(db, content, transport);
const scheduler = new Scheduler(db, engine);

scheduler.start();

const server = createApi(db, engine, scheduler);
server.listen(config.port, () => {
  console.log(`🌐 API: http://localhost:${config.port}  (debug endpoints: ${config.debug ? 'BẬT' : 'tắt'})`);
});

process.on('SIGINT', () => {
  scheduler.stop();
  server.close();
  process.exit(0);
});
