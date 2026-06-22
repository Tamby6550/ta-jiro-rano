/**
 * Génère src/environments/environment.prod.ts à partir des variables
 * d'environnement (Vercel : Project → Settings → Environment Variables).
 *
 * Pourquoi : Angular compile les `environment.*.ts` dans le bundle. Plutôt
 * que de committer les valeurs, on les injecte au build depuis l'environnement.
 * L'anon key est PUBLIQUE par conception (protégée par RLS) — l'embarquer
 * dans le bundle est volontaire et sûr. La service_role n'apparaît jamais ici.
 *
 * Exécuté automatiquement par `prebuild` (cf. package.json).
 * En local : lit le fichier `.env` s'il existe.
 */
const fs = require('fs');
const path = require('path');

// Chargement .env local (best-effort, sans dépendance dotenv)
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_ANON_KEY || '';

if (!url || !anon) {
  console.warn('[set-env] ⚠️  SUPABASE_URL / SUPABASE_ANON_KEY manquants. Le build produira une app non connectée.');
}

const content = `// ⚠️  FICHIER GÉNÉRÉ — ne pas éditer à la main (cf. scripts/set-env.js)
export const environment = {
  production: true,
  supabaseUrl: '${url}',
  supabaseAnonKey: '${anon}',
};
`;

const out = path.resolve(__dirname, '..', 'src', 'environments', 'environment.prod.ts');
fs.writeFileSync(out, content);
console.log('[set-env] environment.prod.ts généré (' + (url ? 'connecté' : 'vide') + ').');
