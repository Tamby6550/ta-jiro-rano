# TA·JIRO·RANO — Gestion des factures JIRAMA (sous-compteurs)

Application web de **répartition transparente des factures JIRAMA** (électricité & eau)
entre plusieurs foyers partageant un compteur principal. Stack **« tout Supabase »** :
aucun serveur backend custom, hébergement frontend gratuit sur Vercel.

- **Frontend** : Angular 19 (standalone + signals)
- **Backend** : Supabase (Auth, PostgREST, RPC Postgres, Storage, RLS)
- **Calcul** : fonctions RPC Postgres (atomiques, source de vérité des montants)
- **PDF / graphiques** : générés côté client (jsPDF, Chart.js)

> Pensée dès le départ **multi-propriétaires** (`property_id` partout) et prête pour l'OCR (`ocr_raw`).

---

## 1. Architecture en bref

```
Angular (Vercel)  ──anon key──►  Supabase
  • Auth (Google + e-mail)        • PostgREST (CRUD auto, filtré par RLS)
  • appels RPC                    • RPC: compute_invoice_allocations / get_invoice_allocations
  • upload Storage (compressé)    • Storage (meter-photos, invoice-photos) + RLS
                                  • RLS sur TOUTES les tables
```

La seule logique « backend métier » — le moteur de répartition — vit dans une fonction
RPC Postgres. Résultat : **une seule surface de déploiement, zéro coût serveur**.

### Le moteur de calcul

**Électricité** (redistribution proportionnelle des pertes réseau) :
```
consommation_i  = nouvel_index_i − ancien_index_i
somme_sous      = Σ consommation_i
principal       = nouvel_index_principal − ancien_index_principal
perte           = principal − somme_sous
pourcentage_i   = consommation_i / somme_sous
ajustée_i       = consommation_i + perte × pourcentage_i      (Σ ajustée = principal)
montant_i       = montant_total × (ajustée_i / principal)
```
**Eau** (prorata occupants) : `montant_i = montant_total × occupants_i / Σ occupants_i`.

**Arrondi** : montants en **Ariary entiers** ; le reste d'arrondi (±1–2 Ar) est absorbé
par **une seule maison** afin que **Σ(montants) = montant_total exactement**. Vérifié par
`supabase/tests/test_calculs.sql`.

---

## 2. Structure du repo

```
src/                     application Angular
  app/core/              services (supabase, auth, data, pdf), store, modèles, i18n, format
  app/shared/            pipes de format, graphe à barres
  app/features/          écrans : auth, layout(shell), dashboard, readings,
                         invoices(+detail), recap, houses, tenant
supabase/
  migrations/            0001 schéma · 0002 RLS · 0003 grants · 0004 RPC · 0005 storage · 0006 seed
  tests/test_calculs.sql tests du moteur (assertions Σ = total)
  config.toml            config Supabase CLI (local)
scripts/set-env.js       injecte SUPABASE_URL/ANON_KEY au build (Vercel)
.github/workflows/       keep-alive.yml (anti-pause)
design_reference/        export Claude Design (source de vérité UI) + screenshots
```

---

## 3. Développement local

### Pré-requis
Node 20+, [Supabase CLI](https://supabase.com/docs/guides/cli), Docker (pour `supabase start`).

### Étapes
```bash
npm install

# 1) Démarrer Supabase en local (Postgres + Auth + Storage + Studio)
supabase start
#    → applique automatiquement les migrations de supabase/migrations/

# 2) Configurer le frontend
cp .env.example .env
#    Les valeurs LOCALES par défaut sont déjà dans src/environments/environment.ts.
#    (URL http://127.0.0.1:54321 + anon key locale du CLI.)

# 3) Lancer l'app
npm start            # http://localhost:4200
```

À la première connexion (compte e-mail), cliquez **« Initialiser une propriété de
démonstration »** : cela crée votre propriété, 4 foyers et 6 mois de relevés cohérents
avec les maquettes (les index de Juin tombent exactement sur ceux du design).

### Tester le moteur de calcul
```bash
# après `supabase start` (ou `supabase db reset`)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/test_calculs.sql
# Attendu : "✅ Tous les tests de répartition PASSENT."
```

### Régénérer les types TypeScript depuis le schéma (optionnel)
```bash
npm run types:gen
```

---

## 4. Déploiement Supabase (prod)

1. **Créer le projet** Supabase (région la plus proche, ex. *South Asia / Singapore*).
2. **Lier et pousser le schéma** (migrations versionnées, pas de clic dans l'UI) :
   ```bash
   supabase link --project-ref <REF_DU_PROJET>
   supabase db push        # applique 0001 → 0006 (schéma, RLS, grants, RPC, storage, seed)
   ```
   Les **grants PostgREST explicites** (migration `0003`) sont indispensables pour les
   projets créés **après le 30 mai 2026** : sans eux, l'API REST n'expose pas les tables.
3. **Google OAuth** :
   - Google Cloud Console → *Identifiants* → créer un *ID client OAuth 2.0* (type *Web*).
   - **Redirect URI autorisés** :
     `https://<REF>.supabase.co/auth/v1/callback`
   - Supabase → *Authentication → Providers → Google* : coller *Client ID* / *Secret*, activer.
   - Supabase → *Authentication → URL Configuration* : *Site URL* = domaine Vercel de prod ;
     *Additional Redirect URLs* = `http://localhost:4200` **et** le domaine Vercel.
4. **Storage** : les buckets `meter-photos` / `invoice-photos` et leurs policies sont créés
   par la migration `0005` (rien à faire à la main).
5. **Connection pooling** : utiliser la chaîne *pooler* de Supabase dès que des accès
   concurrents apparaissent (Settings → Database → Connection pooling).

> 🔐 La **`service_role key` ne doit JAMAIS** être utilisée côté client ni committée. Le
> frontend n'utilise que l'**anon key** ; la sécurité repose entièrement sur la RLS.

---

## 5. Déploiement Vercel (frontend uniquement)

1. *Add New Project* → importer le repo Git. Vercel détecte Angular.
   Réglages confirmés par `vercel.json` (build `npm run build`, sortie `dist/ta-jiro-rano/browser`,
   rewrite SPA vers `index.html`).
2. **Variables d'environnement** (Project → Settings → Environment Variables) :

   | Nom | Valeur |
   |---|---|
   | `SUPABASE_URL` | `https://<REF>.supabase.co` |
   | `SUPABASE_ANON_KEY` | l'anon key (publique) |

   Le script `prebuild` (`scripts/set-env.js`) injecte ces valeurs dans le bundle au build.
3. Chaque `git push` sur `main` → **déploiement automatique** (CI/CD natif).

---

## 6. Anti-pause Supabase (CRITIQUE)

Le free tier met le projet **en pause après 7 jours d'inactivité**. L'usage étant mensuel,
une **GitHub Action** (`.github/workflows/keep-alive.yml`) ping l'API REST tous les 2 jours.

Déclarer dans **GitHub → Settings → Secrets and variables → Actions** :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

(La requête est légère et filtrée par RLS ; un 200/401/403 prouve que le projet est réveillé.)

---

## 7. Rôles & sécurité

- **Admin** (propriétaire) : CRUD complet, lance les calculs, génère les PDF.
- **Locataire** : lecture seule (v1 : toute la propriété, pour la transparence).
- RLS sur **toutes** les tables + sur les **buckets Storage** (filtre sur `property_id`).
- Le bouton *Admin / Locataire* en haut à droite permet à un admin de **prévisualiser** la
  vue locataire — c'est un confort d'affichage ; les droits réels restent imposés par la RLS.

---

## 8. Évolutions prévues (non bloquées)

OCR des index (`ocr_raw` déjà présent) · notifications (Edge Function + e-mail) · paiement en
ligne (webhook) · app mobile Ionic/Capacitor réutilisant Supabase · `audit_log` + triggers ·
IA de prévision de consommation. L'architecture (`property_id` partout, stratégie de calcul
*pluggable*, override manuel traçable) est prête pour ces extensions.
