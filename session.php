<?php
declare(strict_types=1);

require_once __DIR__ . '/_security.php';

pg_require_method('POST');
pg_require_same_origin();

$sessionRate = pg_rate_limit('session|' . pg_client_fingerprint(), 30, 3600);
if (!$sessionRate['allowed']) {
    pg_fail('rate_limited', 'Demasiados intentos. Esperá unos minutos.', 429, ['retryAfter' => $sessionRate['retryAfter']]);
}

$session = pg_create_session();
pg_json_response([
    'ok' => true,
    'csrf' => $session['csrf'],
    'expiresIn' => $session['expiresIn'],
]);

