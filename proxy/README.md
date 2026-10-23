# 🌐 Grist Form Proxy

Proxy permettant de recevoir les soumissions de formulaires publics et de les écrire dans un document Grist via l'API REST — **sans que le répondant ait besoin d'un compte Grist**.

## Plateformes disponibles

| Plateforme | Dossier | Gratuit ? | Latence |
|------------|---------|-----------|---------|
| **Cloudflare Workers** ⭐ | `proxy/` (worker.js) | ✅ 100k req/jour | Ultra rapide (edge) |
| **Vercel** | `proxy/vercel/` | ✅ 100 Go-h/mois | Rapide |
| **Netlify** | `proxy/netlify/` | ✅ 125k req/mois | Moyen |
| **Node.js / Docker** | `proxy/node/` | Selon VPS | Variable |
| **Deno Deploy** | `proxy/deno/` | ✅ 1M req/mois | Rapide (edge) |

> ⭐ **Recommandation** : Cloudflare Workers = le plus rapide et généreux en quota gratuit.

## Architecture

```
[Navigateur] → POST JSON → [Cloudflare Worker] → Grist REST API → [Document Grist]
```

## Déploiement

### Prérequis

- Un compte [Cloudflare](https://dash.cloudflare.com) (gratuit)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Une clé API Grist avec accès au document cible

### Étapes

```bash
# 1. Installer wrangler
npm install -g wrangler

# 2. Se connecter
wrangler login

# 3. Configurer les variables dans wrangler.toml
#    - GRIST_URL : URL de votre instance Grist
#    - ALLOWED_ORIGINS : origins autorisées

# 4. Ajouter le secret (clé API Grist)
wrangler secret put GRIST_API_KEY

# 5. Déployer
wrangler deploy
```

## Configuration

| Variable | Description | Exemple |
|----------|-------------|---------|
| `GRIST_URL` | URL de l'instance Grist (sans `/` final) | `https://docs.getgrist.com` |
| `GRIST_API_KEY` | Clé API Grist (secret) | `xxxxxxxxxxxxxxxx` |
| `ALLOWED_ORIGINS` | **Obligatoire.** Origines autorisées, séparées par des virgules | `https://mon-site.fr,*.github.io` |

GitLab Pages de la forge de la Métropole sert chaque projet sur un sous-domaine qui lui est
propre — `<projet>-<hash>.forge-pages.grandlyon.com` — imprévisible à l'avance. C'est pourquoi
la configuration d'exemple y autorise le suffixe `*.forge-pages.grandlyon.com` plutôt qu'une
origine exacte. Pour restreindre à un seul projet, remplacer par son domaine complet, lisible
dans Pages > Paramètres du projet.
| `RATE_LIMIT_MAX` | Max soumissions par IP par fenêtre | `30` |
| `RATE_LIMIT_WINDOW_MS` | Fenêtre de temps (ms) | `60000` |

## Utilisation côté client

Le formulaire public envoie une requête POST :

```javascript
fetch('https://grist-form-proxy.votre-compte.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    docId: 'sXk7fGdH4R5B...',      // ID du document Grist
    tableId: 'Reponses_Mon_formulaire', // Table de destination
    record: {                        // Données du formulaire
      nom: 'Dupont',
      Ville: 'Paris',
      Soumis_le: 1716312000
    }
  })
});
```

## Politique d'origines — commune aux six proxys

Les six implémentations (Cloudflare, Vercel, Netlify, Node.js, Deno, PHP) se
comportent à l'identique :

1. **`ALLOWED_ORIGINS` est obligatoire.** Absente ou vide, le proxy refuse
   toute requête avec un `500 Proxy non configuré (ALLOWED_ORIGINS manquant).`
   Il n'existe aucun défaut implicite : un défaut `*` ferait de ce proxy un
   relais ouvert vers votre document Grist, avec votre clé API.
2. **`*` reste possible**, mais doit être écrit explicitement.
3. **Le préflight `OPTIONS` répond toujours `204`** avec les en-têtes CORS,
   même pour une origine refusée. Il n'accorde rien par lui-même, et c'est lui
   qui permet au navigateur de lire la vraie réponse plutôt qu'une erreur
   réseau opaque.
4. **Toute réponse, refus compris, porte `Access-Control-Allow-Origin` et
   `Vary: Origin`.** Un refus d'origine devient donc lisible : le corps ne dit
   que « origine refusée », ce qui ne divulgue rien.
5. **Les messages d'erreur sont identiques mot pour mot** dans les six, pour
   que le bouton « Tester » du Form Builder les classe de la même façon.
6. Motifs acceptés, même algorithme partout : origine exacte
   (`https://mon-site.fr`), suffixe (`*.github.io`), ou `*`.

| Situation | Code | Message |
|---|---|---|
| `ALLOWED_ORIGINS` vide | 500 | `Proxy non configuré (ALLOWED_ORIGINS manquant).` |
| Origine hors liste | 403 | `Origin non autorisée.` |
| `GRIST_URL`/`GRIST_API_KEY` absent | 500 | `Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).` |
| Débit dépassé | 429 | `Trop de soumissions. Réessayez dans une minute.` |

## Sécurité

- **Rate limiting** par IP (configurable)
- **Vérification d'origine**, fermée par défaut (voir ci-dessus)
- **Clé API jamais exposée** au client (stockée comme secret de la plateforme)
- Pas de lecture des données — écriture uniquement (`POST /records`)

## Intégration avec le Form Builder

1. Déployez ce worker sur Cloudflare
2. Dans le Form Builder (mode Édition), ouvrez la section **🌐 Partage public**
3. Collez l'URL du worker et l'ID du document
4. Sauvegardez, puis cliquez **Partager** — le lien public sera généré automatiquement
