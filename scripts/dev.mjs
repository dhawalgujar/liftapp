import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const database=path.join(root,'.dev','data','lift.db');
if(!existsSync(database)) {
  console.error('Development database missing. Run npm run dev:init-db -- --source /absolute/path/to/your/data/lift.db first.');
  process.exit(1);
}
const child=spawn(process.execPath,['server.js'],{
  cwd:path.join(root,'backend'),stdio:'inherit',
  env:{...process.env,DB_PATH:database,SKIP_SEED_SYNC:'1',PORT:process.env.PORT||'7701',HOST:process.env.HOST||'127.0.0.1'}
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?0:1);});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
