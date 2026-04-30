import { start } from './features/jornada/app';

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
