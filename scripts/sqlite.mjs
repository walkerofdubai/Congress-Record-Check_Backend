import {DatabaseSync} from 'node:sqlite';
export function openDatabase(file) {
  const sqlite=new DatabaseSync(file);sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const wrap=(sql,args=[])=>({
    bind(...values){return wrap(sql,values);},
    async first(){return sqlite.prepare(sql).get(...args)||null;},
    async all(){return {results:sqlite.prepare(sql).all(...args)};},
    async run(){const info=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:info.changes}};},
    _run(){return sqlite.prepare(sql).run(...args);}
  });
  return {prepare:sql=>wrap(sql),async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s._run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},exec:sql=>sqlite.exec(sql),close:()=>sqlite.close()};
}
