<?php
// PHP 7.4+, PDO SQLite. Database outside public_html.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond($status, $body) {
    http_response_code($status);
    echo json_encode($body);
    exit;
}
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['error' => 'method']);
}
if ($method === 'POST') {
    if (($_SERVER['HTTP_X_COURT_REQUEST'] ?? '') !== '1') respond(403, ['error' => 'origin']);
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') respond(403, ['error' => 'origin']);
    $body = json_decode(file_get_contents('php://input', false, null, 0, 256), true);
    $request = is_array($body) ? ($body['requestId'] ?? '') : '';
    if (!is_string($request) || !preg_match('/^[a-f0-9]{32}$/D', $request)) respond(400, ['error' => 'request']);
}
try {
    $directory = dirname(__DIR__, 2) . '/nosugarfin-private';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('storage');
    $db = new PDO('sqlite:' . $directory . '/court.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA busy_timeout=10000');
    $db->exec('CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE)');
    // One-time full reset explicitly requested by the site owner on 2026-11-04.
    // Keep this marker unchanged on subsequent uploads.
    $db->exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
    $db->exec('BEGIN IMMEDIATE');
    $resetName = 'court-full-reset-20261104-v1';
    $migration = $db->prepare('SELECT name FROM migrations WHERE name = ?');
    $migration->execute([$resetName]);
    if ($migration->fetchColumn() === false) {
        $db->exec('DELETE FROM cases');
        $db->exec("DELETE FROM sqlite_sequence WHERE name = 'cases'");
        $mark = $db->prepare('INSERT INTO migrations(name) VALUES (?)');
        $mark->execute([$resetName]);
    }
    $db->exec('COMMIT');
    if ($method === 'GET') respond(200, ['count' => (int) $db->query('SELECT COALESCE(MAX(id),0) FROM cases')->fetchColumn()]);
    // Atomic allocation; a retry with the same request ID reuses the number.
    $db->exec('BEGIN IMMEDIATE');
    $find = $db->prepare('SELECT id FROM cases WHERE request_id = ?');
    $find->execute([$request]);
    $number = $find->fetchColumn();
    if ($number === false) {
        $insert = $db->prepare('INSERT INTO cases(request_id) VALUES (?)');
        $insert->execute([$request]);
        $number = $db->lastInsertId();
    }
    $count = (int) $db->query('SELECT MAX(id) FROM cases')->fetchColumn();
    $db->exec('COMMIT');
    respond(200, ['number' => (int) $number, 'count' => $count]);
} catch (Throwable $error) {
    respond(503, ['error' => 'unavailable']);
}