<?php
/**
 * Grist Form Proxy - Nextcloud / PHP
 * Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
 *
 * Installation :
 *   1. Copiez ce fichier dans un dossier accessible de votre serveur Nextcloud/PHP
 *      (ex: /var/www/nextcloud/custom_apps/grist-proxy/grist-form-proxy.php)
 *   2. Créez un fichier config.php dans le même dossier (voir ci-dessous)
 *   3. Accédez via : https://votre-nextcloud.fr/custom_apps/grist-proxy/grist-form-proxy.php
 *
 * config.php :
 *   <?php
 *   return [
 *       'GRIST_URL'       => 'https://grist.gristup.fr',
 *       'GRIST_API_KEY'   => 'votre-clé-api',
 *       'ALLOWED_ORIGINS' => '*.github.io,*.gristup.fr',
 *       'RATE_LIMIT_MAX'  => 30,
 *       'RATE_LIMIT_WINDOW' => 60,  // secondes
 *   ];
 */

// Charger la config
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'config.php manquant. Créez-le à côté de ce fichier.']);
    exit;
}
$config = require $configFile;

$gristUrl   = rtrim($config['GRIST_URL'] ?? '', '/');
$apiKey     = $config['GRIST_API_KEY'] ?? '';
$allowedRaw = $config['ALLOWED_ORIGINS'] ?? '*';
$rateMax    = (int)($config['RATE_LIMIT_MAX'] ?? 30);
$rateWindow = (int)($config['RATE_LIMIT_WINDOW'] ?? 60);

// ─── CORS ─────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$patterns = array_filter(array_map('trim', explode(',', $allowedRaw)));

function originAllowed(string $origin, array $patterns): bool {
    foreach ($patterns as $p) {
        if ($p === '*') return true;
        if (str_starts_with($p, '*.') && str_ends_with($origin, substr($p, 1))) return true;
        if ($p === $origin) return true;
    }
    return false;
}

$allowed = originAllowed($origin, $patterns);

if ($allowed && $origin) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (!$allowed) { http_response_code(403); exit; }
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

if (!$allowed) {
    http_response_code(403);
    echo json_encode(['error' => 'Origin non autorisée.']);
    exit;
}

// ─── Rate limiting (fichier temporaire) ───────────────────
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$ip = explode(',', $ip)[0];
$rateLimitFile = sys_get_temp_dir() . '/grist_form_proxy_rate_' . md5($ip) . '.json';

$now = time();
$rateData = ['count' => 0, 'start' => $now];
if (file_exists($rateLimitFile)) {
    $rateData = json_decode(file_get_contents($rateLimitFile), true) ?: $rateData;
}
if ($now - ($rateData['start'] ?? 0) > $rateWindow) {
    $rateData = ['count' => 1, 'start' => $now];
} else {
    $rateData['count']++;
}
file_put_contents($rateLimitFile, json_encode($rateData));

if ($rateData['count'] > $rateMax) {
    http_response_code(429);
    echo json_encode(['error' => 'Trop de soumissions. Réessayez dans une minute.']);
    exit;
}

// ─── Validation ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée.']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Corps de requête invalide (JSON attendu).']);
    exit;
}

$docId   = $body['docId'] ?? null;
$tableId = $body['tableId'] ?? null;
$record  = $body['record'] ?? null;

if (!$docId || !$tableId || !$record || !is_array($record)) {
    http_response_code(400);
    echo json_encode(['error' => 'Paramètres manquants : docId, tableId, record requis.']);
    exit;
}

if (!$gristUrl || !$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).']);
    exit;
}

// ─── Écriture dans Grist ──────────────────────────────────
$url = "$gristUrl/api/docs/$docId/tables/$tableId/records";
$payload = json_encode(['records' => [['fields' => $record]]]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 25,
    CURLOPT_HTTPHEADER     => [
        "Authorization: Bearer $apiKey",
        'Content-Type: application/json',
    ],
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => "Erreur de connexion à Grist : $curlError"]);
    exit;
}

if ($httpCode >= 400) {
    $errData = json_decode($response, true) ?: [];
    http_response_code($httpCode);
    echo json_encode(['error' => $errData['error'] ?? "Grist API erreur $httpCode"]);
    exit;
}

$data = json_decode($response, true) ?: [];
echo json_encode([
    'success' => true,
    'id'      => $data['records'][0]['id'] ?? null,
]);
