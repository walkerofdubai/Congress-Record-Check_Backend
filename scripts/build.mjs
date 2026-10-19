import {build} from 'esbuild-wasm';
await build({entryPoints:['src/worker.mjs'],bundle:true,outfile:'.build/worker.js',format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'info'});
