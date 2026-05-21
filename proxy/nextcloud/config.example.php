<?php
/**
 * Configuration du proxy Grist Form — Nextcloud / PHP
 * Renommez ce fichier en config.php et renseignez vos valeurs.
 */
return [
    'GRIST_URL'       => 'https://grist.gristup.fr',
    'GRIST_API_KEY'   => 'votre-clé-api-grist',
    'ALLOWED_ORIGINS' => '*.github.io,*.gristup.fr',
    'RATE_LIMIT_MAX'  => 30,       // max soumissions par IP
    'RATE_LIMIT_WINDOW' => 60,     // fenêtre en secondes
];
