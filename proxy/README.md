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
| `ALLOWED_ORIGINS` | Origins autorisées (virgule) | `*.github.io,*.getgrist.com` |
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

## Sécurité

- **Rate limiting** par IP (configurable)
- **Vérification d'origin** (CORS strict)
- **Clé API jamais exposée** au client (stockée comme secret Cloudflare)
- Pas de lecture des données — écriture uniquement (`POST /records`)

## Intégration avec le Form Builder

1. Déployez ce worker sur Cloudflare
2. Dans le Form Builder (mode Édition), ouvrez la section **🌐 Partage public**
3. Collez l'URL du worker et l'ID du document
4. Sauvegardez, puis cliquez **Partager** — le lien public sera généré automatiquement
