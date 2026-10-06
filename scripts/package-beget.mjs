import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// A new timestamped directory avoids replacing an existing private/config.php.
const target = resolve('release', 'beget-' + new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(target + '/private', { recursive: true })
await cp('dist', target + '/public_html', { recursive: true })
for (const file of ['app.php','validation.php','config.example.php']) await cp('server/' + file, target + '/private/' + file)
await cp('docs/mysql-schema.sql', target + '/mysql-schema.sql')
await cp('docs/migrate-categories.sql', target + '/migrate-categories.sql')
await cp('docs/BEGET.md', target + '/ИНСТРУКЦИЯ.md')
await writeFile('release/LATEST.txt', target + '\n')
const entry = await readFile(target + '/public_html/api/index.php', 'utf8')
if (!entry.includes('/private')) throw new Error('Missing PHP entry point')
console.log('Готовая папка для Beget: ' + target)
