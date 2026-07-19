#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Lance les 3 vérifications du dépôt (validateur de données, tests de fumée,
// scanner anti-XSS) en une seule commande — évite 3 invocations séparées.
// Sort avec le code du premier échec (mais lance quand même tout, pour avoir
// le rapport complet en un coup d'œil).
//
// Usage :  node tools/check-all.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  ['Validation des données', 'tools/validate-questions.mjs'],
  ['Tests de fumée', 'tools/smoke-test.mjs'],
  ['Scanner anti-XSS', 'tools/check-escaping.mjs'],
];

let failed = 0;
for (const [label, script] of CHECKS) {
  console.log(`\n── ${label} (${script}) ${'─'.repeat(Math.max(0, 50 - label.length - script.length))}`);
  const res = spawnSync(process.execPath, [join(ROOT, script)], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

console.log('');
if (failed) {
  console.log(`✗ ${failed}/${CHECKS.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log(`✓ Les ${CHECKS.length} vérifications passent.`);
