// LAN key in client-config.json is DPAPI-encrypted: never plain on disk, old plain files migrate on read.
import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadClientConfig, saveClientConfig } from '../src/main/clientConfig';

let failed = 0;
const check = (ok: boolean, name: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
};

app.whenReady().then(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gchub-cfg-'));
  const file = path.join(dir, 'client-config.json');
  const secret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  try {
    saveClientConfig(file, { serverIp: '192.168.1.10', lanSecret: secret });
    const raw = fs.readFileSync(file, 'utf8');
    check(!raw.includes(secret) && !raw.includes('"lanSecret"'), 'kunci tidak tersimpan polos');
    check(loadClientConfig(file).lanSecret === secret, 'kunci terbaca lagi setelah disimpan');
    check(loadClientConfig(file).serverIp === '192.168.1.10', 'setelan lain tetap utuh');

    fs.writeFileSync(file, JSON.stringify({ serverIp: '10.0.0.1', lanSecret: secret }));
    check(loadClientConfig(file).lanSecret === secret, 'file lama polos tetap terbaca');
    check(!fs.readFileSync(file, 'utf8').includes(secret), 'file lama polos langsung dienkripsi');

    saveClientConfig(file, { serverIp: '10.0.0.1', lanSecret: '  ' });
    check(loadClientConfig(file).lanSecret === undefined, 'kunci kosong tidak disimpan');

    fs.writeFileSync(file, JSON.stringify({ serverIp: '10.0.0.1', lanSecretEnc: 'cnVzYWs=' }));
    check(loadClientConfig(file).lanSecret === undefined, 'kunci rusak dianggap belum diisi, tanpa crash');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} FAIL` : '\nSemua lulus');
  app.exit(failed ? 1 : 0);
});
