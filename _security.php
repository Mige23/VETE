<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

const PG_SESSION_COOKIE = 'pg_chat_session';

function pg_signing_secret(): string
{
    $secret = (string) pg_env('CHAT_SIGNING_SECRET', '');
    if (strlen($secret) < 32) {
        pg_fail('server_not_configured', 'Petsy todavía no está conectada con Gemini.', 503);
    }
    return $secret;
}

function pg_user_agent_hash(): string
{
    return substr(hash('sha256', (string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown')), 0, 16);
}

function pg_create_session(): array
{
    $issuedAt = time();
    $expiresAt = $issuedAt + 3600;
    $payload = [
        'sid' => bin2hex(random_bytes(16)),
        'iat' => $issuedAt,
        'exp' => $expiresAt,
        'ua' => pg_user_agent_hash(),
    ];

    $encoded = pg_b64url_encode((string) json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signature = pg_b64url_encode(hash_hmac('sha256', $encoded, pg_signing_secret(), true));
    $token = $encoded . '.' . $signature;
    $csrf = hash_hmac('sha256', 'csrf|' . $payload['sid'] . '|' . $expiresAt, pg_signing_secret());

    setcookie(PG_SESSION_COOKIE, $token, [
        'expires' => $expiresAt,
        'path' => '/',
        'secure' => pg_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);

    return ['csrf' => $csrf, 'expiresIn' => 3600];
}

function pg_validate_session(): array
{
    $token = (string) ($_COOKIE[PG_SESSION_COOKIE] ?? '');
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) {
        pg_fail('session_required', 'La sesión del chat venció. Volvé a intentarlo.', 401);
    }

    [$encoded, $providedSignature] = $parts;
    $expectedSignature = pg_b64url_encode(hash_hmac('sha256', $encoded, pg_signing_secret(), true));
    if (!hash_equals($expectedSignature, $providedSignature)) {
        pg_fail('invalid_session', 'La sesión del chat no es válida.', 401);
    }

    $json = pg_b64url_decode($encoded);
    $payload = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($payload)
        || !isset($payload['sid'], $payload['exp'], $payload['ua'])
        || !is_string($payload['sid'])
        || !is_int($payload['exp'])
        || $payload['exp'] < time()
        || !hash_equals((string) $payload['ua'], pg_user_agent_hash())) {
        pg_fail('expired_session', 'La sesión del chat venció. Volvé a intentarlo.', 401);
    }

    $providedCsrf = (string) ($_SERVER['HTTP_X_PETSGATES_CSRF'] ?? '');
    $expectedCsrf = hash_hmac('sha256', 'csrf|' . $payload['sid'] . '|' . $payload['exp'], pg_signing_secret());
    if ($providedCsrf === '' || !hash_equals($expectedCsrf, $providedCsrf)) {
        pg_fail('invalid_csrf', 'No pudimos validar la solicitud.', 403);
    }

    return $payload;
}

function pg_rate_limit(string $bucket, int $limit, int $windowSeconds): array
{
    $directory = (string) pg_env('CHAT_RATE_DIR', sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'petsgates-chat-rate');
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        pg_fail('rate_limit_unavailable', 'Petsy no está disponible temporalmente.', 503);
    }

    $key = hash_hmac('sha256', $bucket, pg_signing_secret());
    $file = $directory . DIRECTORY_SEPARATOR . $key . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        pg_fail('rate_limit_unavailable', 'Petsy no está disponible temporalmente.', 503);
    }

    $raw = stream_get_contents($handle);
    $timestamps = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($timestamps)) {
        $timestamps = [];
    }

    $now = time();
    $cutoff = $now - $windowSeconds;
    $timestamps = array_values(array_filter($timestamps, static fn ($value): bool => is_int($value) && $value > $cutoff));
    $allowed = count($timestamps) < $limit;
    $retryAfter = 0;

    if ($allowed) {
        $timestamps[] = $now;
    } elseif (isset($timestamps[0])) {
        $retryAfter = max(1, $timestamps[0] + $windowSeconds - $now);
    }

    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, (string) json_encode($timestamps));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return ['allowed' => $allowed, 'retryAfter' => $retryAfter, 'remaining' => max(0, $limit - count($timestamps))];
}

function pg_enforce_rate_limits(string $sessionId): void
{
    $fingerprint = pg_client_fingerprint();
    $burstLimit = pg_env_int('CHAT_RATE_LIMIT_5M', 8, 2, 60);
    $dailyLimit = pg_env_int('CHAT_RATE_LIMIT_DAY', 40, 5, 500);

    $burst = pg_rate_limit('burst|' . $fingerprint . '|' . $sessionId, $burstLimit, 300);
    if (!$burst['allowed']) {
        pg_fail('rate_limited', 'Llegaste al límite momentáneo. Esperá un poco antes de volver a escribir.', 429, ['retryAfter' => $burst['retryAfter']]);
    }

    $daily = pg_rate_limit('day|' . $fingerprint, $dailyLimit, 86400);
    if (!$daily['allowed']) {
        pg_fail('daily_limit', 'Petsy alcanzó el límite de uso por hoy. Podés contactarnos por teléfono o WhatsApp.', 429, ['retryAfter' => $daily['retryAfter']]);
    }
}

function pg_is_emergency(string $message): bool
{
    $normalized = mb_strtolower($message, 'UTF-8');
    return preg_match('/\b(no respira|dificultad para respirar|se ahoga|convulsi[oó]n|convulsiona|sangrado abundante|hemorragia|atropellad[oa]|envenenad[oa]|intoxicaci[oó]n|veneno|inconsciente|desmayad[oa]|abdomen hinchado|no puede orinar|parto complicado|golpe de calor|enc[ií]as blancas|enc[ií]as azules)\b/u', $normalized) === 1;
}
