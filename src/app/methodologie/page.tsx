import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sources & méthodologie — TerraVista",
};

interface SourceEntry {
  name: string;
  usage: string;
  frequency: string;
  limitation: string;
  url: string;
}

const SOURCES: SourceEntry[] = [
  {
    name: "IGN Géoplateforme — Base Adresse Nationale (BAN)",
    usage: "Géocodage de l'adresse saisie (point d'entrée obligatoire).",
    frequency: "Continue (données d'adressage mises à jour en flux).",
    limitation:
      "La précision dépend du type de résultat (numéro, rue, lieu-dit, commune) — un score de confiance est affiché.",
    url: "https://data.geopf.fr/geocodage/search/",
  },
  {
    name: "Géorisques (BRGM / ministère de la Transition écologique)",
    usage:
      "Risques naturels (inondation, argiles, séisme, radon, cavités), technologiques, sites et sols pollués, arrêtés CatNat.",
    frequency:
      "Variable selon le sous-jeu de données ; les arrêtés CatNat sont mis à jour au fil de leur publication au Journal Officiel.",
    limitation:
      "Certains sous-jeux ne couvrent pas les mêmes échelles géographiques pour Paris, Lyon et Marseille : le potentiel argile détaillé (endpoint /rga) est souvent vide et nous utilisons donc le niveau qualitatif de la synthèse ; sismicité et radon sont publiés par arrondissement, tandis que CatNat et les zones inondables (AZI) ne le sont qu'à l'échelle de la ville entière — TerraVista interroge automatiquement les deux échelles et retient celle qui répond.",
    url: "https://www.georisques.gouv.fr/doc-api",
  },
  {
    name: "Cerema — API Données Foncières (DVF open data)",
    usage:
      "Transactions immobilières des 5 dernières années autour de l'adresse (médiane €/m², carte des transactions).",
    frequency: "Mise à jour semestrielle par la DGFiP, republiée en continu par le Cerema.",
    limitation:
      "Ne couvre pas Mayotte ni les départements d'Alsace-Moselle (droit local). Les transactions comprennent parfois des ventes atypiques (terrains nus, lots groupés, ventes en bloc) qui peuvent faire varier fortement un prix au m² isolé — la médiane sur l'échantillon local atténue cet effet mais ne l'élimine pas totalement. Endpoint parfois lent (quelques secondes).",
    url: "https://apidf-preprod.cerema.fr/swagger/",
  },
  {
    name: "Atmo Data (fédération des AASQA)",
    usage: "Indice ATMO quotidien de qualité de l'air (échelle 0 à 7).",
    frequency: "Quotidienne.",
    limitation:
      "Certaines communes rurales, hors du maillage des stations de mesure locales, ne sont pas couvertes par l'indice communal — signalé explicitement plutôt que de deviner une valeur. Les mesures fines par polluant (Geod'air) nécessitent une inscription préalable et ne sont pas intégrées à ce jour.",
    url: "https://www.atmo-france.org",
  },
  {
    name: "SSMSI (ministère de l'Intérieur) — délinquance enregistrée",
    usage:
      "Statistiques annuelles communales de délinquance, en taux pour 1000 habitants avec tendance.",
    frequency: "Deux fois par an (janvier et juillet).",
    limitation:
      "Ce sont des chiffres communaux annuels, jamais une carte du crime rue par rue. Les communes ayant enregistré moins de 5 faits sur 3 années successives ne sont pas diffusées, pour éviter des taux statistiquement peu fiables ou individualisants — ce n'est pas une absence de délinquance, seulement une absence de donnée exploitable. Fichier de 40 Mo mis à jour deux fois par an : TerraVista le pré-traite (`pnpm fetch-data`) plutôt que de l'interroger en direct à chaque requête.",
    url: "https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/",
  },
  {
    name: "ADEME — Diagnostics de performance énergétique (DPE)",
    usage:
      "Étiquette énergie/climat, année de construction, surface habitable du bâtiment le plus proche.",
    frequency: "Continue depuis juillet 2021 (nouvelle méthode de calcul).",
    limitation:
      "Anonymisation stricte imposée par la CNIL : aucun nom de propriétaire n'est exposé ni consulté. Un immeuble collectif peut avoir plusieurs DPE (un par logement) — TerraVista retient le plus récent trouvé à l'adresse exacte, ou à défaut celui du voisinage immédiat (signalé). Les DPE établis avant juillet 2021 (ancienne méthode « 3CL », remise en cause) ne sont pas interrogés.",
    url: "https://data.ademe.fr",
  },
];

export default function MethodologiePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-12 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-900">
          Sources &amp; méthodologie
        </h1>
        <p className="text-ink-muted">
          TerraVista est un outil citoyen, gratuit et neutre : chaque affirmation du rapport est
          reliée à une source publique officielle, avec un niveau de confiance explicite. Rien
          n&apos;est inventé — quand une donnée manque, le rapport le dit.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">La boucle agentique</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>
            <strong className="text-ink">Planificateur</strong> — pondère les 5 domaines (risques,
            prix, air, sécurité, énergie) selon votre profil de vie et le type de bien, de façon
            déterministe (aucun appel modèle, donc aucune dépendance à une clé API pour cette
            étape).
          </li>
          <li>
            <strong className="text-ink">Collecteurs</strong> — six tools Mastra typés (Zod), un par
            source, chacun avec cache, retry avec backoff exponentiel, et un score de confiance sur
            la donnée retournée.
          </li>
          <li>
            <strong className="text-ink">Cascade</strong> — si une exposition au risque
            d&apos;inondation est détectée, une recherche complémentaire est automatiquement
            relancée pour préciser la zone inondable (Atlas des Zones Inondables), sans action de
            votre part.
          </li>
          <li>
            <strong className="text-ink">Analyste</strong> — croise les résultats pour produire des
            constats qu&apos;aucune source seule ne donne (ex. argile fort + arrêté sécheresse +
            maison ancienne ⇒ risque de fissures), et signale explicitement quand le marché ne
            semble pas intégrer un risque documenté.
          </li>
          <li>
            <strong className="text-ink">Conseiller</strong> — compose le rapport final : score
            global pondéré, red flags priorisés, et actions concrètes (questions à poser, démarches
            officielles à lancer).
          </li>
        </ol>
        <p className="text-sm text-ink-muted">
          Le score global et les verdicts par domaine sont calculés par du code déterministe, pas
          par un modèle de langage — le rapport reste identique et fiable même sans clé LLM
          configurée. Un modèle de langage n&apos;est utilisé, quand configuré, que pour reformuler
          certains textes explicatifs, jamais pour produire un chiffre.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">Sources</h2>
        <div className="space-y-4">
          {SOURCES.map((s) => (
            <div
              key={s.name}
              className="rounded-2xl border border-primary-100 bg-surface p-5 shadow-sm"
            >
              <h3 className="text-base font-semibold text-ink">{s.name}</h3>
              <dl className="mt-2 space-y-1 text-sm text-ink-muted">
                <div>
                  <dt className="inline font-medium text-ink">Usage : </dt>
                  <dd className="inline">{s.usage}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Fréquence : </dt>
                  <dd className="inline">{s.frequency}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Limites : </dt>
                  <dd className="inline">{s.limitation}</dd>
                </div>
              </dl>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-primary-600 hover:underline"
              >
                {s.url}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">Confiance et résilience</h2>
        <p className="text-sm text-ink-muted">
          Chaque source retourne un statut (« ok », « partiel », « indisponible » ou « erreur ») et
          un niveau de confiance (élevé / moyen / faible). Si une source est indisponible, le
          rapport se produit quand même : la section correspondante affiche explicitement « donnée
          indisponible » plutôt qu&apos;une valeur inventée, et le domaine est exclu du calcul du
          score global (il n&apos;est ni favorisé ni pénalisé par son absence).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">Éthique et RGPD</h2>
        <p className="text-sm text-ink-muted">
          TerraVista ne traite que des données publiques concernant un bien et sa commune — jamais
          de données personnelles concernant des individus. Les statistiques de délinquance (SSMSI)
          sont des taux communaux annuels : elles ne géolocalisent aucun fait à une adresse précise,
          et TerraVista ne les présente jamais comme telles. Les diagnostics énergétiques (ADEME)
          sont anonymisés à la source par la CNIL — aucun nom de propriétaire n&apos;est exposé.
          Aucune donnée de recherche n&apos;est conservée au-delà du temps nécessaire au calcul du
          rapport.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">Limites connues</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-muted">
          <li>
            Les données de prix (DVF) peuvent inclure des ventes atypiques qui font varier une
            médiane locale.
          </li>
          <li>
            L&apos;API Cerema (DVF) répond parfois en plusieurs secondes ; la section prix peut
            arriver après les autres.
          </li>
          <li>
            La qualité de l&apos;air fine par polluant (Geod&apos;air) n&apos;est pas intégrée —
            seul l&apos;indice ATMO quotidien l&apos;est.
          </li>
          <li>
            Le potentiel radon et l&apos;aléa argile détaillé ne sont pas systématiquement diffusés
            par Géorisques pour toutes les communes.
          </li>
          <li>
            Le suivi automatique d&apos;une adresse dans le temps (nouveau permis, nouvel arrêté
            CatNat) n&apos;est pas encore implémenté.
          </li>
        </ul>
      </section>
    </main>
  );
}
