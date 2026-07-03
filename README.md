# TerraVista

**Un outil citoyen, gratuit et neutre pour comprendre l'environnement d'un bien immobilier avant de signer.**

Une adresse et un profil de vie en entrée ; en sortie, un rapport sourcé et pondéré — risques
naturels, prix du marché, qualité de l'air, sécurité, énergie — produit par une équipe d'agents
qui perçoit, planifie, collecte, croise et décide, avec traçabilité totale vers des données
publiques officielles françaises.

## Démarrage rapide

```bash
pnpm install
cp .env.example .env      # optionnel — tout fonctionne sans clé
pnpm fetch-data           # régénère l'index SSMSI local (committé, donc sautable)
pnpm dev                  # http://localhost:3000
```

Aucun service externe n'est requis pour faire tourner l'application : les 6 sources sont des API
ouvertes sans clé (sauf mention contraire ci-dessous), et le rapport se produit intégralement sans
LLM configuré — le score, les verdicts et les red flags sont calculés par du code déterministe. Un
LLM, s'il est configuré (`OPENAI_API_KEY` / `OPENAI_BASE_URL`, routées via le model router intégré
de Mastra — compatible avec n'importe quel endpoint OpenAI-compatible), ne ferait que reformuler
certains textes explicatifs — cette couche n'est pas branchée à ce jour, le rapport reste
100% fonctionnel sans elle.

Deux adresses de démonstration pré-vérifiées sont proposées directement sur l'écran de saisie
(bouton « Essayer une adresse de démonstration ») :

- **8 Rue de la Paix, Paris 2e** — appartement urbain, zone inondable documentée, argile fort.
- **Venelle de l'Église, Huelgoat (29)** — maison rurale ancienne, cavités souterraines, potentiel
  radon élevé, historique de catastrophes naturelles répété. Déclenche deux red flags croisés
  (vérification structurelle + arbitrage marché/risque).

## Architecture — la boucle agentique

```
Adresse + profil
      │
      ▼
┌─────────────┐   déterministe : pondère les 5 domaines selon le profil
│ Planificateur│   (famille, télétravail, sensibilité air, investissement, senior)
└──────┬──────┘   et le type de bien (maison / appartement)
       │
       ▼ (les 5 collecteurs tournent en parallèle, chaque section s'affiche
┌──────┴──────┐    dès qu'elle est prête — jamais un écran figé pendant 30s)
│  Collecteurs │
│  risques     │──▶ Géorisques (BRGM)
│  prix        │──▶ Cerema — API Données Foncières (DVF)
│  air         │──▶ Atmo Data
│  sécurité    │──▶ SSMSI (index local pré-calculé)
│  énergie     │──▶ ADEME DPE
└──────┬──────┘
       │  cascade : si inondation détectée, une recherche complémentaire
       │  (Atlas des Zones Inondables) se déclenche automatiquement
       ▼
┌─────────────┐   déterministe : croise les résultats pour des constats
│  Analyste   │   qu'aucune source seule ne donne, arbitre les contradictions
└──────┬──────┘   entre sources (ex. risque documenté vs. prix qui n'en tient pas compte)
       │
       ▼
┌─────────────┐   compose le rapport final : score pondéré, red flags
│  Conseiller │   priorisés, actions concrètes (questions, démarches officielles)
└──────┬──────┘
       ▼
  Rapport streamé (NDJSON) → écran de rapport progressif + export PDF
```

Chaque étape est un `step` d'un vrai **workflow Mastra** (`src/mastra/workflows/report-workflow.ts`),
et chaque source est un **tool Mastra** typé Zod (`src/mastra/tools/`). Le workflow émet ses
événements de progression via `writer.custom(...)` (mécanisme natif Mastra, vérifié de bout en
bout), que la route `/api/report/stream` traduit en NDJSON pour le client. Le même workflow tourne
en mode batch (`run.start(...)`, sans streaming) pour l'export PDF — une seule logique métier, deux
modes d'exécution.

**Choix d'architecture assumé** : Planificateur, Analyste et Conseiller sont du code déterministe,
pas des appels LLM. Le rapport doit être fiable et reproductible même sans clé API configurée ; un
modèle de langage n'aurait de valeur ajoutée que pour reformuler des textes, jamais pour produire un
chiffre ou un verdict. Ce choix est documenté plus en détail sur `/methodologie`.

## Sources

Six tools, chacun avec cache, retry avec backoff exponentiel, et un score de confiance sur la
donnée retournée. Le détail de chaque source (fréquence de mise à jour, limites connues) est sur la
page **Sources & méthodologie** (`/methodologie`) de l'application :

| Domaine | Source | Notes |
| --- | --- | --- |
| Géocodage | IGN Géoplateforme — Base Adresse Nationale | Point d'entrée obligatoire |
| Risques | Géorisques (BRGM) | Inondation, argiles, séisme, radon, cavités, sites pollués, CatNat, AZI |
| Prix | Cerema — API Données Foncières (DVF open data) | 5 dernières années ; ne couvre pas Mayotte / Alsace-Moselle |
| Air | Atmo Data (indice ATMO quotidien) | Geod'air (mesures fines par polluant) nécessite une inscription, non intégré |
| Sécurité | SSMSI (délinquance communale) | Index local pré-calculé (`pnpm fetch-data`) — le fichier source (~40 Mo) est trop lent à interroger en direct |
| Énergie | ADEME — DPE | Anonymisé (CNIL) ; le DPE le plus récent de l'adresse exacte, ou du voisinage immédiat à défaut |

## Stack technique

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Mastra (agents, tools,
workflows) · Zod · Tailwind CSS v4 · TanStack Query · MapLibre GL (fonds de carte IGN) ·
Framer Motion · @react-pdf/renderer · Vitest · Playwright.

## Scripts

```bash
pnpm dev              # serveur de développement
pnpm build            # build de production
pnpm test             # tests unitaires (Vitest)
pnpm test:e2e         # tests end-to-end (Playwright, réseau entièrement mocké)
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier --write
pnpm fetch-data       # régénère data/ssmsi/index.json.gz (committé — sautable en usage normal)
```

## Structure du projet

```
src/
  app/                 routes Next.js (écrans + routes API)
  mastra/
    tools/             6 tools Mastra (1 par source, cache + retry + confiance)
    agents/            Planificateur, Analyste, Conseiller (déterministes)
    workflows/         le workflow Mastra qui orchestre le tout
  components/screens/  UI de l'écran de saisie et du rapport
  components/pdf/      gabarit d'export PDF
  types/               schémas Zod partagés (adresse, profil, domaines, rapport, stream)
  lib/                 http (retry/backoff), cache (mémoire + disque), stats, géo
scripts/
  fetch-ssmsi.ts       pré-calcule l'index communal SSMSI (voir méthodologie)
tests/
  unit/                Vitest — tools, agents
  e2e/                 Playwright — parcours critique, réseau mocké
```

## Limites connues

Voir la page `/methodologie` pour le détail complet. En résumé : les données de prix (DVF) peuvent
inclure des ventes atypiques qui font varier une médiane locale ; l'API Cerema (DVF) répond parfois
en plusieurs secondes ; la qualité de l'air fine par polluant (Geod'air) n'est pas intégrée ; le
potentiel radon et l'aléa argile détaillé ne sont pas systématiquement diffusés par Géorisques pour
toutes les communes ; le suivi automatique d'une adresse dans le temps (bonus du brief) n'est pas
implémenté.
