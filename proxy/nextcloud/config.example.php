<?php
/**
 * Configuration du proxy Grist Form — Nextcloud / PHP
 * Renommez ce fichier en config.php et renseignez vos valeurs.
 */
return [
    'GRIST_URL'       => 'https://docs.getgrist.com',
    'GRIST_API_KEY'   => 'votre-clé-api-grist',

    // Obligatoire : la ou les origines autorisées à soumettre, séparées par
    // des virgules. Laissée vide, le proxy refuse toutes les requêtes — il n'y
    // a pas de défaut « * », qui ferait de ce proxy un relais ouvert vers
    // votre document Grist. Motifs acceptés : une origine exacte
    // (https://mon-site.fr), un suffixe (*.github.io, *.forge-pages.grandlyon.com),
    // ou « * » pour tout
    // accepter, à n'écrire qu'en connaissance de cause.
    'ALLOWED_ORIGINS' => 'https://votre-site.fr',
    'RATE_LIMIT_MAX'  => 30,       // max soumissions par IP
    'RATE_LIMIT_WINDOW' => 60,     // fenêtre en secondes
];
