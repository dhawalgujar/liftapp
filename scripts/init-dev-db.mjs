import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'backend','package.json'));
const Database=require('better-sqlite3');
const args=process.argv.slice(2);
const sourceArg=args[0]==='--source'&&args.length===2?args[1]:null;
if(!sourceArg) {
  console.error('Usage: npm run dev:init-db -- --source /absolute/path/to/live/data/lift.db');
  process.exit(1);
}
const sourcePath=path.resolve(sourceArg);
const baseline=path.join(root,'.dev','backups','baseline.db');
const development=path.join(root,'.dev','data','lift.db');
if(!fs.existsSync(sourcePath)||[baseline,development].some(p=>fs.existsSync(p))) {
  console.error('Source must exist and development/baseline databases must not already exist. Existing databases are never overwritten.');
  process.exit(1);
}
fs.mkdirSync(path.dirname(baseline),{recursive:true});
fs.mkdirSync(path.dirname(development),{recursive:true});
let source,snapshot;
try {
  source=new Database(sourcePath,{readonly:true,fileMustExist:true});
  await source.backup(baseline); // Includes committed WAL content, unlike a plain file copy.
  source.close();source=null;
  snapshot=new Database(baseline,{readonly:true,fileMustExist:true});
  await snapshot.backup(development);
  console.log('Created a consistent baseline backup and separate development database. Source data was opened read-only.');
} finally {source?.close();snapshot?.close();}
