# Civic Property Intelligence (CPI) — Product & Build Specification

> Canonical spec for the GCC hackathon project (category 2 — AI for Good).
> Instruction language: French. Product UI language: English. Agent prompts: English, versioned in `src/mastra/prompts/`.
> Workers: read the section(s) relevant to your assigned phase, plus sections 1–3 (product, stack, data model) and 8–9 (quality bar, prohibitions) which apply to everyone.

---

## 1. Le produit

**Le problème.** Le risque immobilier est distribué de façon asymétrique. Avant qu'un capital ne s'engage sur un bien — une collectivité qui préempte, un bailleur social qui acquiert, un fonds qui finance, une coopérative de primo-accédants qui achète — une partie de ces acteurs (les gros, les initiés) dispose d'armées d'analystes et d'accès aux bonnes bases ; les autres (habitants, collectifs, petites structures publiques) découvrent le risque **après** la signature : la zone inondable, le bail résiduel dérisoire, le propriétaire réel offshore en litige, le sol pollué d'une ancienne friche, le voisinage en tension. L'information existe pourtant, éparpillée dans des dizaines de **registres publics ouverts** — mais personne n'a le temps de la croiser bien à chaque fois.

**Le pitch (une phrase).** Un agent d'intelligence en sources ouvertes (OSINT) appliqué à l'immobilier — à l'**actif et à son contexte public, jamais aux personnes** — qui enquête sur un bien *avant* qu'un capital ne s'engage, pour révéler les risques cachés que le vendeur, l'agent immobilier ou l'annonce ne disent pas forcément.

**La solution.** À partir d'une **adresse, d'un identifiant de parcelle/titre ou d'une annonce immobilière**, Civic Property Intelligence interroge automatiquement les registres publics ouverts et produit un verdict de risque **clair, gradé et sourcé** sur tout ce qui n'est pas dans la brochure : risque d'inondation, qualité du quartier, nuisances, pollution, historique du bien, contraintes d'urbanisme, pente du terrain, servitudes et charges (registre de titres, quand une source publique existe), travaux passés, propriété réelle via registres publics, risques naturels, prix historiques et **signaux faibles**. Sous le capot, une **équipe d'agents** extrait des signaux de risque **sourcés** sur six couches (building, unit, block, people, land, market), les regroupe en motifs de risque, compose une **disclosure en langage clair** compréhensible par un non-expert, puis **continue de surveiller** le bien à mesure que de nouvelles données publiques tombent. L'agent **décide** (sévérité, verdict composite, escalade, allocation de l'attention de l'expert) ; l'expert humain valide chaque motif, tranche chaque cas escaladé, et **reste seul à décider d'engager le capital**. L'objectif : **savoir ce qu'on achète — ou ce qu'on finance — vraiment, avant de signer.**

**Deux portes d'entrée, un seul moteur.** *(a)* Une **recherche par bien unique** (feature F0) : on colle une adresse / parcelle / annonce, on obtient le dossier sourcé complet — c'est la porte civique, celle du primo-accédant, du collectif d'habitants ou de la petite commune qui n'a pas les moyens de commander la due diligence que le gros capital, lui, commande déjà. *(b)* Un **mur de portefeuille** à l'échelle (feature F1) pour screener des centaines de biens d'un coup — la vue de la foncière solidaire ou du bailleur. Un bien unique n'est qu'un portefeuille de un : même moteur, aucune logique dupliquée. C'est cette égalisation de l'asymétrie d'information qui porte l'argument « AI for Good ».

**Le principe cardinal (non négociable, à refléter dans le code) : *evidence beats assertion* — aucune affirmation sans preuve traçable.**
- L'agent **décide réellement** : il détermine la sévérité de chaque signal (green/amber/red), calcule un verdict de risque composite par bien, décide quoi escalader, et **alloue l'attention rare de l'expert** vers les cas les plus risqués. Ce ne sont pas des réponses de chat : ce sont des décisions opérationnelles. Mais…
- L'agent **n'émet JAMAIS un signal de risque sans `sourceRef`** (dataset + identifiant/URL de l'enregistrement + horodatage de récupération) **et sans `confidence`**. Un constat non sourçable est rejeté et journalisé comme extraction échouée. « Pas de preuve, pas de constat » est codé en dur, pas laissé au prompt.
- L'agent **ne prend JAMAIS la décision d'engagement du capital** (go/no-go d'achat/financement). Il produit un **verdict de risque** gradé et sourcé ; la décision d'engager reste humaine. Il n'existe aucun champ de sortie « recommend commit / buy ».
- **Règle d'intégrité de la preuve, codée en dur :** dès qu'un signal de sévérité élevée repose sur **une seule source**, OU que **deux sources se contredisent** sur un fait matériel, le verdict composite est **forcé à `red / escalated`** avec la raison `insufficient_or_conflicting_evidence` (ou `high_severity_single_source`), quelle que soit la sortie du LLM. L'agent ne tranche jamais seul un conflit de preuve matériel.
- **Garde-fou d'équité, codé en dur (anti-redlining) :** le risque se mesure sur des **faits relatifs à l'actif et à son contexte physique, légal, financier et environnemental**, JAMAIS sur les **caractéristiques protégées des personnes qui y vivent** (composition démographique, origine, religion, etc.). Toute variable dérivée d'un proxy de caractéristique protégée est **bloquée** avant d'entrer dans un verdict, et le cas est marqué `fairness_guardrail_triggered`.
- Chaque action (agent ou humaine) génère un **événement d'audit horodaté, immuable, avec justification et instantané de la source**. Le journal d'audit est aussi un **registre de provenance** : n'importe quel verdict se retrace jusqu'à l'enregistrement public exact.

**Persona utilisateur :** « Nadia », responsable due diligence dans une structure d'intérêt public (institution de financement du développement local / foncière solidaire) qui vérifie les sites pour que les acteurs qui engagent le capital n'héritent pas d'un passif caché. Experte, pressée, sceptique vis-à-vis de l'IA autonome. L'interface doit lui donner à chaque instant : ce que l'agent a trouvé, **où** il l'a trouvé (la source cliquable), avec quelle **confiance**, et ce qui attend **sa** décision.

---

## 2. Stack technique imposée
- **Langage :** TypeScript strict (`strict: true`), partout.
- **Framework agentique :** **Mastra** (@mastra/core, dernière version stable). **IMPORTANT : avant d'écrire la moindre ligne de code Mastra, récupère la documentation officielle à jour** — fetch `https://mastra.ai/llms.txt` puis les pages pertinentes (agents, workflows, suspend/resume, storage, model router, agent networks). Ne code jamais de mémoire, vérifie chaque signature dans la doc récupérée.
  - **Agents Mastra** pour les tâches ouvertes de raisonnement (enquête d'une couche de risque, composition d'un dossier, adjudication d'un verdict).
  - **Workflows Mastra** (graph-based) pour le processus déterministe de campagne, avec `suspend()`/`resume()` pour les gates d'approbation humaine.
- **LLM :** OpenAI via le model router de Mastra (provider `openai`, format `openai/<model>` — vérifier dans la doc). Prévoir `OPENAI_API_KEY`. Tous les prompts d'agents en anglais, versionnés dans `src/mastra/prompts/`, jamais inline dans la logique.
- **Connecteurs de données ouvertes :** une couche `src/connectors/` propre. **Un connecteur = un client typé mince au-dessus d'une seule source ouverte** (Land Registry, EPC, Environment Agency, police.uk, planning.data.gov.uk, Companies House…). Chaque connecteur expose la même forme de résultat normalisée (voir `RiskSignal`) et déclare sa `licence`. Objectif explicite : **forkabilité**.
- **Frontend :** Next.js (App Router) + React + Tailwind CSS + **Framer Motion** + **Lucide React** + **Recharts**.
- **Storage :** le storage intégré de Mastra (LibSQL/SQLite) pour l'état des workflows, et SQLite (via Drizzle ORM ou better-sqlite3) pour le modèle métier. Pas de base externe : le projet doit tourner en local avec `npm install && npm run dev`.
- **Validation :** Zod sur toutes les frontières (inputs API, outputs LLM structurés, réponses des connecteurs, seeds).
- **Monorepo simple :** une seule app Next.js avec Mastra intégré (`src/mastra/` backend agentique, `src/connectors/` sources, `src/app/` front). Pas de sur-ingénierie multi-packages.

> **Décision d'orchestration (adaptation au repo existant) :** le repo de départ est un template hexagonal avec better-auth + Prisma/Neon. On suit la spec : retirer better-auth et Postgres/Neon (user mocké « Nadia »), passer le modèle métier sur SQLite local, adopter la structure `src/mastra/` + `src/connectors/` + `src/app/`. Conserver l'outillage (ESLint, Prettier, Vitest, Playwright, pino, conventions). **Lire `node_modules/next/dist/docs/` avant tout code Next.js (voir AGENTS.md — version avec breaking changes).**

---

## 3. Modèle de données (schéma métier)

Implémenter ces entités avec Zod + tables SQLite. Les enums de statut sont la colonne vertébrale du human-in-the-loop : à respecter à la lettre. Le triptyque **RiskFramework → RiskDimension → RiskSignalDefinition** est le référentiel validé par l'expert (le « playbook »).

```
RiskFramework { id, name ("Civic Property Risk v1"), version, effectiveDate, dimensions: RiskDimension[] }

RiskDimension {
  id, code ("BUILDING" | "UNIT" | "BLOCK" | "PEOPLE" | "LAND" | "MARKET"),
  title, description, signals: RiskSignalDefinition[]
}
  // BUILDING: permits, works, energy, defects
  // UNIT: floor exposure, noise, resale history
  // BLOCK: school, public incident, complaint
  // PEOPLE: ownership & control, public dispute, adverse news, lawsuits
  // LAND: soil, water/flood, slope, pollution
  // MARKET: price anomaly, liquidity, rent stress

RiskSignalDefinition {
  id, dimensionCode,
  code ("LAND-FLOOD" | "LAND-SOIL" | "LAND-POLLUTION" | "BUILDING-PERMIT" | "BUILDING-ENERGY"
      | "PEOPLE-OWNER" | "MARKET-ANOMALY" | "BLOCK-INCIDENT" | ...),
  title, description,
  source: { dataset, endpoint, licence },   // quelle source ouverte répond à ce signal + sa licence (ex. "OGL v3.0")
  method,                                    // comment le signal est calculé/vérifié (déterministe quand c'est possible)
  severityRubric                             // ce qui fait green / amber / red — les seuils définis par l'expert
}

Property {
  id, uprn?, address, postcode, localAuthority, lat, lng,
  propertyType ("residential" | "mixed_use" | "commercial" | "land"),
  tenure ("freehold" | "leasehold" | "unknown"),
  value, intendedUse, capitalType ("public" | "private" | "community"),
  status: "unscanned" | "out_of_scope" | "scanning" | "signals_extracted"
        | "in_cluster" | "assessed" | "verdict_pending_review"
        | "cleared" | "flagged" | "escalated" | "closed",
  extractedSignals: RiskSignal[]
}

RiskSignal {              // un constat sourcé, pour un signal, sur un bien
  id, propertyId, signalCode, dimensionCode,
  finding,                // énoncé lisible de ce qui a été trouvé
  sourceRef: { dataset, recordId, url, retrievedAt },   // OBLIGATOIRE — aucun signal sans source
  severity: "green" | "amber" | "red",
  confidence,             // 0-1
  rationale               // pourquoi cette sévérité, en citant l'enregistrement
}

RiskCluster {
  id, name, description,
  propertyIds: string[],
  pattern,                // la signature de risque partagée (ex. "LAND-FLOOD:red + BUILDING-ENERGY:red")
  groupingRationale,      // explication lisible du regroupement (produite par l'agent)
  proposedAssessment,     // le dossier de risque type de la grappe
  proposedDisclosure,     // la disclosure en langage clair
  status: "draft" | "pending_review" | "approved" | "published" | "completed",
  reviewedBy, reviewedAt  // null tant que non validé — RIEN n'est publié tant que null
}

Adjudication {
  id, propertyId, clusterId,
  status: "queued" | "assessing" | "monitoring" | "evidence_received"
        | "adjudicated" | "resolved" | "escalated",
  compositeVerdict: "green" | "amber" | "red" | null,
  verdictRationale,       // OBLIGATOIRE dès qu'un verdict existe — cite les signaux
  latestEvidence,
  escalationReason: "insufficient_or_conflicting_evidence" | "high_severity_single_source"
                  | "material_new_adverse_evidence" | "fairness_guardrail_triggered" | null,
  assessedAt, lastActivityAt
}

AuditEvent {
  id, timestamp, actor ("agent" | "user:nadia"), action, entityType, entityId,
  rationale, payloadSnapshot   // append-only, jamais de UPDATE ni DELETE sur cette table
}
```

---

## 4. Backend agentique (Mastra)

### 4.1 L'équipe d'agents
Trois **rôles** (investigate → compose → adjudicate) ; le rôle d'investigation est instancié comme une **équipe de 6 spécialistes de couche**. Tous les spécialistes partagent le **même contrat de sortie** (`RiskSignal[]` sourcés).

**A. Les 6 investigateurs spécialistes.** Input : un `Property` + les `RiskSignalDefinition` de sa dimension + accès aux connecteurs. Output structuré (Zod) : `RiskSignal[]`, chacun avec `finding`, `sourceRef`, `severity`, `confidence`, `rationale`. Prompt commun : « cite l'enregistrement exact qui justifie chaque constat ; si une source est muette ou ambiguë, dis-le avec une confiance basse ; **n'affirme jamais un risque que tu ne peux pas sourcer** ».
1. **`building-inspector`** — permis & urbanisme (planning.data.gov.uk), énergie (EPC open data), travaux/mises en demeure, défauts & contraintes (bâtiments classés / Historic England).
2. **`unit-profiler`** — exposition/étage, bruit (Defra strategic noise maps), historique de revente & rotation (Land Registry Price Paid).
3. **`block-scanner`** — écoles (DfE Get Information About Schools / Ofsted), incidents publics & criminalité (police.uk), oppositions/plaintes locales.
4. **`people-investigator`** — propriété & contrôle (Companies House ; Land Registry **CCOD** et **OCOD**), litiges/insolvabilité, presse défavorable. **Le joyau transparence civique.**
5. **`land-surveyor`** — sol/subsidence/radon (British Geological Survey), eau/inondation (Environment Agency flood zones + API temps réel), pente/glissement, pollution/terrains contaminés.
6. **`market-analyst`** — anomalie de prix vs secteur (Land Registry), liquidité/fréquence des transactions, tension locative (ONS).

**B. `assessment-composer`** — Input : un `RiskCluster` + le référentiel. Output : (1) le **dossier de risque type** de la grappe et (2) la **disclosure en langage clair** compréhensible par un non-expert, chaque risque **avec sa source**. L'agent adapte la **forme**, jamais les **faits** : il compose strictement à partir des `RiskSignal` sourcés, il n'invente aucun fait.

**C. `verdict-adjudicator`** — Input : les `RiskSignal` d'un bien + la dernière preuve entrante. Output structuré : `compositeVerdict` green/amber/red + `verdictRationale` + `escalationReason` si red. **Règles codées en dur dans le workflow (pas dans le prompt)** :
- **Intégrité de la preuve :** signal de sévérité élevée sur **source unique**, OU **deux sources en conflit** sur un fait matériel → verdict **forcé à `red`**, `escalationReason = insufficient_or_conflicting_evidence` (ou `high_severity_single_source`), quelle que soit la sortie du LLM.
- **Équité / anti-redlining :** tout signal dérivé d'un proxy de caractéristique protégée est **exclu du verdict** et le cas est marqué `fairness_guardrail_triggered`. Codé, pas promptté.

### 4.2 Le workflow de campagne (cœur du projet)
Un workflow Mastra `civic-risk-scan` :
```
scanPortfolio (parallel batches)      → les 6 spécialistes enquêtent chaque bien, statuts unscanned → signals_extracted / out_of_scope
clusterByRiskPattern                  → clustering DÉTERMINISTE (même signature de sévérités par dimension
                                        + même localAuthority + même propertyType), génère groupingRationale
composeAssessments (per cluster)      → dossier + disclosure par grappe, statut grappe → pending_review
⏸ SUSPEND: awaitAssessmentReview      → reprise uniquement sur resume() déclenché par « Approve assessment ».
                                        Refus possible avec commentaire → retour en draft avec les notes.
publishCluster                        → adjudications créées (queued → assessing → monitoring), timestamps, audit events.
                                        RIEN ne se publie si reviewedAt est null.
[simulateur externe injecte des mises à jour open-data dans le temps]
adjudicateEvidence (event-driven)     → verdict composite + règles codées en dur
⏸ SUSPEND: awaitHumanAdjudication     → chaque bien escaladé (red) se suspend jusqu'à décision de l'expert
closeOut                              → agrégats, métriques d'impact civique finales
```
Chaque étape écrit ses `AuditEvent`. Le clustering est **déterministe** (group-by sur les clés) — pas d'embeddings.

### 4.3 Le simulateur de flux de preuves
Un module `evidence-feed-simulator` qui, une fois une grappe publiée, injecte des **mises à jour open-data** à intervalles configurables (accéléré en mode démo). En démo : **pré-générées dans les seeds et rejouées** (déterministe, pas d'appel LLM en boucle). Distribution : ~60 % corroborent (green), ~25 % signal mineur nouveau (amber), ~15 % preuve défavorable matérielle (red → escalade). Types : stats criminalité mensuelles, alerte inondation temps réel, nouvelle demande d'urbanisme, dépôt d'insolvabilité du propriétaire, presse défavorable.

---

## 5. Fonctionnalités frontend (avec critères d'acceptation)

### F0 — Single-property lookup (la porte d'entrée civique)
Champ de recherche unique en tête d'app : adresse / UPRN / title number / postcode / URL d'annonce (l'annonce sert seulement à résoudre l'adresse). Le même moteur enquête ce bien seul et renvoie le **dossier sourcé complet** : chaque risque, sa sévérité, sa **source cliquable**, sa confiance, le verdict composite, et une section « what the listing doesn't mention ».
✓ De l'adresse brute au dossier sourcé en un seul écran. ✓ Chaque constat cliquable jusqu'à l'enregistrement public. ✓ Un bien unique = un portefeuille de un : réutilise `scanPortfolio` sur une liste de 1, zéro logique dupliquée.

### F1 — Portfolio wall (« le mur »)
Grille dense de ~2 800 vignettes virtualisée (react-window ou équivalent). Filtres statut / dimension / sévérité / autorité locale / capitalType. Bandeau : référentiel (« Civic Property Risk v1 — 6 dimensions »), fraîcheur des données, compteur « capital under review: £X ». Compteurs live : scannés / signaux extraits / hors périmètre.
✓ 2 800 items sans jank. ✓ Vignettes changent d'état visuellement pendant le scan.

### F2 — La condensation (l'animation signature)
Au clic « Cluster by risk pattern », animation Framer Motion orchestrée : les vignettes `signals_extracted` se colorent selon leur sévérité dominante, migrent et se regroupent en 9 cartes de grappes. Durée ~3-4 s, easing soigné, layout animations (`layoutId`).
✓ C'est LE plan de la vidéo. Bouton « replay » caché (raccourci clavier) pour les prises.

### F3 — Cluster sheet & review gate
Vue détaillée : biens, `groupingRationale`, assessment en **evidence view** (chaque constat à côté de sa source citée, lien cliquable), disclosure en langage clair, bandeau « ⏸ The agent is waiting for your review ». Boutons : Approve / Request changes (avec commentaire). Après validation : nom du relecteur + horodatage affichés en permanence.
✓ AUCUN moyen de publier une grappe non validée. ✓ Evidence view lisible par un non-expert, sources cliquables.

### F4 — Adjudication war room
Tableau temps réel : colonnes par statut, badges green/amber/red, animation d'arrivée des preuves. File « Escalated to analyst » distincte : preuve entrante, verdict composite, rationale (avec sources), actions expert (**Confirm risk / Request more evidence / Mark resolved**).
✓ Les red n'offrent JAMAIS de bouton de résolution automatique.

### F5 — Impact banner permanent
Header, métriques live : biens évalués X/2 800, temps d'analyste économisé (baseline ~6-8 h de due diligence manuelle par site), capital protégé/screené (£), % de cas escaladés (~10-15 % = argument d'allocation), risques cachés révélés absents des annonces (N), sources citées (N).
✓ Mise à jour temps réel pendant la simulation.

### F6 — Journal d'audit / provenance
Vue chronologique filtrable des `AuditEvent` : acteur, action, justification, **source**. Bouton « Export (PDF) » (stub visuel acceptable).
✓ Chaque décision de F3/F4 se retrouve dans le journal, avec sa source.

### F7 — Mode démo scénarisé
Panneau `/director` (non lié dans la nav) : lancer le scan, déclencher la condensation, accélérer/pauser le simulateur, reset complet.

---

## 6. Design system — sobre & crédible (instrument de registre public)
Référence : croisement d'un **outil de recherche cadastrale officiel** et d'un **tableau de bord d'investigation**.
- **Palette :** fond `#FAFAF8` ; surfaces `#FFFFFF` ; bordures `#E5E5E0` ; primaire bleu-marine `#1B2A4A` ; états : vert `#1E8E5A`, ambre `#C77D1E`, rouge `#C0392B` (la couleur porte du SENS — sévérité — jamais de la décoration) ; texte `#1A1A1A` / secondaire `#6B6B66`.
- **Typographie :** IBM Plex Sans (titres + UI), IBM Plex Mono (chiffres, identifiants, `sourceRef`, horodatages, coordonnées).
- **Composants :** cards coins 4-6 px, ombres très légères, tableaux denses mais aérés, badges rectangulaires discrets, icônes Lucide fines monochromes. Liens de source visuellement identifiables et omniprésents.
- **Interdits :** emojis dans l'UI, dégradés décoratifs, illustrations cartoon, dark mode, plus de 4 couleurs signifiantes à l'écran.
- **Animations :** uniquement fonctionnelles — condensation (F2), arrivée des preuves (F4), compteurs (F5). Durées courtes hors F2.
- **Langue UI : anglais.** Contenu data : anglais britannique, format de ses sources.
- **Footer permanent :** « Data: HM Land Registry, EPC (MHCLG), Environment Agency, police.uk, Companies House, planning.data.gov.uk — Open Government Licence v3.0 ».

---

## 7. Données de démo — vraies données ouvertes UK + échelle synthétique

| Couche | Source ouverte principale |
|---|---|
| market / resale | **HM Land Registry Price Paid Data** (`landregistry.data.gov.uk`) |
| building / energy | **EPC** (`epc.opendatacommunities.org`, MHCLG) |
| building / permits | **Planning Data Platform** (`planning.data.gov.uk`) |
| land / water | **Environment Agency** — Flood Map for Planning + Real-Time Flood-Monitoring API (`environment.data.gov.uk`) |
| land / pollution | Registres publics de terrains contaminés |
| land / soil | **British Geological Survey** (couches ouvertes ; sinon *data gap*) |
| block / incident | **police.uk** street-level crime (`data.police.uk`) |
| block / school | **DfE Get Information About Schools** / Ofsted |
| people / ownership | **Companies House** (API gratuite) + Land Registry **CCOD** & **OCOD** |
| unit / noise | **Defra** strategic noise mapping |
| market / rent | **ONS** private rental & house price index |

**Pipeline de seed :**
1. Script `scripts/fetch-open-data.ts` (TypeScript ; un script Python d'appoint acceptable pour un téléchargement récalcitrant) : sélectionne **~50 biens/adresses réels** répartis sur quelques autorités locales à intérêt risque (côtier/inondable, ex-industriel/pollué, argiles gonflantes/subsidence, marché à forte rotation), interroge **réellement** les sources ouvertes, **met en cache** dans `data/properties/` (JSON). Le cache rend la démo déterministe et jouable hors-ligne.
2. Ces ~50 biens réels passent **RÉELLEMENT** dans les 6 investigateurs pendant la démo — les risques détectés sont authentiques.
3. Le script **enrichit chaque bien réel de métadonnées de scénario simulées** (`intendedUse`, `capitalType`, `value`) — assumé et documenté.
4. **~2 750 biens synthétiques** pour l'effet de masse : adresses fictives, résultats pré-calculés, distributions réalistes sur les mêmes autorités locales (inondation ~30 % en zones côtières, opacité de propriété ~10 %, énergie F/G ~15 %). **Aucune distribution synthétique n'encode de proxy démographique.**
5. Documenter la frontière réel/simulé dans le README.
- **Référentiel `Civic Property Risk v1`** : 6 dimensions et leurs signaux, chacun avec `source` + `severityRubric` crédibles, en anglais clair.
- **Mises à jour de flux pré-écrites** : ~40 variantes en anglais (corroborate / amber / red).

---

## 8. Exigences de qualité « entreprise »
- TypeScript strict, zéro `any` non justifié. ESLint + Prettier.
- Toute sortie LLM parsée via Zod avec retry (1 retentative avec l'erreur de parsing renvoyée au modèle) puis fallback gracieux + `AuditEvent` d'échec. L'UI affiche les échecs proprement.
- Table `AuditEvent` append-only au niveau du code d'accès.
- **Discipline des connecteurs :** licence + rate limits respectés, données publiques uniquement, cache, erreurs normalisées en `RiskSignal` de faible confiance (jamais d'exception silencieuse).
- Tests (Vitest) sur les invariants critiques uniquement : (1) grappe non revue non publiable ; (2) intégrité de la preuve force le red ; (3) clustering déterministe ; (4) garde-fou d'équité bloque les proxys protégés ; (5) aucun `RiskSignal` sans `sourceRef` persisté ou émis.
- README complet : pitch, architecture (Mermaid), setup, mode démo, frontière réel/simulé, licences & attribution (OGL), section « Ethics & fairness », section « Fork it for another country » (ex. DVF/Géorisques pour la France), limites connues.
- `.env.example` documenté. Aucun secret en dur.

## 9. Interdits
- Aucune sortie « recommend buy / commit ». L'agent révèle le risque sourcé ; l'humain engage.
- Pas d'auto-résolution des cas red, même en option, même cachée.
- Jamais de facteur de risque fondé sur des caractéristiques protégées. Pas de redlining.
- Pas de surveillance de personnes : uniquement des actifs et leur contexte public, registres publics, pas de scraping derrière authentification.
- Pas de sur-ingénierie : pas de microservices, pas de queue externe, pas d'auth multi-utilisateurs (user mocké « Nadia »).
- Ne jamais présenter les parties simulées comme réelles.

## 10. Ordre de build (phases d'orchestration)
0. **Documentation** : doc Mastra (llms.txt + agents/workflows/suspend-resume/storage/model-router) + docs Next.js locales.
1. **Socle** : scaffolding adapté + SQLite + schéma + `src/connectors/` + fetch open-data + seeds (50 réels + 2 750 synthétiques + référentiel).
2. **Moteur** : 6 investigateurs sur les 50 biens réels + `scanPortfolio` + `clusterByRiskPattern` déterministe. Vérif console avant UI.
3. **Gates** : workflow complet suspend/resume + `AuditEvent` + `assessment-composer` + les deux règles codées en dur.
4. **UI Acte 1 & 2** : portfolio wall virtualisé + condensation.
5. **UI Acte 3** : cluster sheet + review gate + evidence view.
6. **UI Acte 4** : simulateur + `verdict-adjudicator` + war room + impact banner.
7. **Finitions** : journal d'audit, `/director`, polish, README, tests des invariants.
