// Assemble index.html: page.html + file rows + GitHub's render of README.md.
import { readFile, writeFile } from 'node:fs/promises';
const icon = (n) => `<span class="oi" style="--i:url(https://cdn.jsdelivr.net/npm/@primer/octicons@19.15.0/build/svg/${n}.svg)"></span>`;
const msg = 'Initial skills: replicate-ui, run-round, handover, cite-precedent';
const files = [['skills', true], ['.gitignore'], ['LICENSE'], ['README.md'], ['package-lock.json'], ['package.json']];
const rows = files.map(([name, dir]) =>
  `<div class="row"><span class="name"><span class="${dir ? 'dir' : 'doc-i'}">${icon(dir ? 'file-directory-fill-16' : 'file-16')}</span>${name}</span><span class="msg">${msg}</span><span class="when">1 minute ago</span></div>`).join('\n');
const page = await readFile(new URL('page.html', import.meta.url), 'utf8');
const readme = await readFile(new URL('readme.fragment.html', import.meta.url), 'utf8');
await writeFile(new URL('index.html', import.meta.url), page.replace('<!--ROWS-->', rows).replace('<!--README-->', readme));
