import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { transformWithOxc } from 'vite';
const require = createRequire(import.meta.url);
// The static-render tests load JSX through data URLs. Compile its shared JSX
// dependency too, so imports resolve without introducing a browser or mocks.
export async function feedbackModuleUrl() {
 const source = await readFile(new URL('../src/components/Feedback.jsx', import.meta.url),'utf8');
 const {code} = await transformWithOxc(source,'Feedback.jsx',{jsx:{runtime:'automatic'}});
 const runnable = code.replaceAll('"react"',JSON.stringify(pathToFileURL(require.resolve('react')).href)).replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 return 'data:text/javascript;base64,'+Buffer.from(runnable).toString('base64');
}
