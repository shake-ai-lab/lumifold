// アプリに入る第三者のライブラリのライセンス文を集めて THIRD_PARTY_LICENSES.txt を作る(配布物に同梱する)。
// 対象: npm は package-lock の本番依存(型定義だけのパッケージは除く)、Rust は本体にリンクされるクレート(Windows 向け、proc-macro とビルド時の依存は除く)。
// 同じ文面のライセンスは 1 回だけ載せ、使っているパッケージを並べる。依存を足したら作り直す。
// 使い方: node tools/third-party-licenses.mjs   (cargo が要る。crates のソースは ~/.cargo/registry にあるものを読む)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LICENSE_FILE = /^(LICEN[CS]E|COPYING|COPYRIGHT|NOTICE)([-._].*)?$/i;
const licenseTexts = (dir) => {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => LICENSE_FILE.test(n) && fs.statSync(path.join(dir, n)).isFile()).sort(); } catch {}
  return names.map((n) => fs.readFileSync(path.join(dir, n), 'utf8').replace(/\r\n/g, '\n').trim());
};

// ライセンスのファイルを同梱していないパッケージは、宣言どおりのライセンスの定型文に作者を入れて載せる
const WARRANTY = 'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';
const TEMPLATES = {
  MIT: (who) => `MIT License\n\nCopyright (c) ${who}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\n${WARRANTY}`,
  ISC: (who) => `ISC License\n\nCopyright (c) ${who}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
  'BSD-3-Clause': (who) => `BSD 3-Clause License\n\nCopyright (c) ${who}\n\nRedistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
  'MPL-2.0': () => 'This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.',
};
const fallbackText = (license, authors) => {
  const make = TEMPLATES[license];
  const who = authors.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean).map((a) => a.replace(/\s*<[^>]*>/, '')).join(', ') || 'the authors';
  return make ? [`(No license file is bundled with this package; the declared ${license} license is reproduced.)\n\n${make(who)}`] : [];
};

const entries = []; // { name, version, license, source, texts }

// ---------------------------------------------------------------- npm
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const [key, info] of Object.entries(lock.packages)) {
  if (!key || info.dev) continue;
  const name = key.replace(/^.*node_modules\//, '');
  if (name.startsWith('@types/') || name === 'undici-types') continue; // 型定義だけで、配布物には入らない
  const pkg = JSON.parse(fs.readFileSync(path.join(key, 'package.json'), 'utf8'));
  const license = info.license ?? pkg.license ?? '?';
  const texts = licenseTexts(key);
  entries.push({ name, version: info.version, license, source: `https://www.npmjs.com/package/${name}`, texts: texts.length ? texts : fallbackText(license, [pkg.author ?? ''].flat()) });
}

// ---------------------------------------------------------------- Rust
const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--offline', '--filter-platform', 'x86_64-pc-windows-msvc'], { cwd: 'src-tauri', encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const packages = new Map(meta.packages.map((p) => [p.id, p]));
const isProcMacro = (p) => p.targets.some((t) => t.kind.includes('proc-macro'));
const linked = new Set();
for (const stack = [meta.resolve.root]; stack.length;) {
  const id = stack.pop();
  if (linked.has(id)) continue;
  linked.add(id);
  if (isProcMacro(packages.get(id))) continue;
  for (const dep of nodes.get(id).deps) if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg); // 通常の依存だけ(build / dev は除く)
}
for (const id of linked) {
  const p = packages.get(id);
  if (id === meta.resolve.root || isProcMacro(p)) continue;
  const license = p.license ?? '?';
  const texts = licenseTexts(path.dirname(p.manifest_path));
  entries.push({ name: p.name, version: p.version, license, source: `https://crates.io/crates/${p.name}/${p.version}`, texts: texts.length ? texts : fallbackText(license, p.authors ?? []) });
}

// ---------------------------------------------------------------- 書き出し
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const missing = entries.filter((e) => !e.texts.length);
const byText = new Map();
for (const e of entries) {
  const key = e.texts.join('\n\n----\n\n');
  if (!key) continue;
  if (!byText.has(key)) byText.set(key, []);
  byText.get(key).push(e);
}
const line = '='.repeat(78);
const out = [
  'Third-party software licenses',
  '',
  'This application includes the following third-party software. Each is used under its own license, reproduced below.',
  'Packages licensed under the MPL-2.0 are used unmodified; their source code is available at the URLs listed.',
  '',
  `${entries.length} packages (npm and Rust crates).`,
  '',
];
for (const [text, users] of byText) {
  out.push(line);
  for (const e of users) out.push(`${e.name} ${e.version}  (${e.license})  ${e.source}`);
  out.push(line, '', text, '', '');
}
if (missing.length) {
  out.push(line, 'Packages without a bundled license file (license as declared in their manifest):', line);
  for (const e of missing) out.push(`${e.name} ${e.version}  (${e.license})  ${e.source}`);
  out.push('');
}
fs.writeFileSync('THIRD_PARTY_LICENSES.txt', out.join('\n'));
console.log(`THIRD_PARTY_LICENSES.txt: ${entries.length} packages, ${byText.size} distinct license texts, ${missing.length} without any license text`);
for (const e of missing) console.log(`  no license text: ${e.name} ${e.version} (${e.license})`);
