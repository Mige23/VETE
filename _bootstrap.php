<?php
declare(strict_types=1);

/**
 * Petsgates chatbot bootstrap.
 * Loads configuration without external dependencies and exposes safe response helpers.
 */

function pg_load_env_file(): array
{
    static $values = null;
    if (is_array($values)) {
        return $values;
    }

    $values = [];
    $candidates = [];
    $custom = getenv('PETSGATES_ENV_FILE');
    if (is_string($custom) && $custom !== '') {
        $candidates[] = $custom;
    }
    $candidates[] = __DIR__ . DIRECTORY_SEPARATOR . '.env';

    foreach ($candidates as $file) {
        if (!is_file($file) || !is_readable($file)) {
            continue;
        }

        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$name, $value] = array_map('trim', explode('=', $line, 2));
            if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $name)) {
                continue;
            }

            $length = strlen($value);
            if ($length >= 2) {
                $first = $value[0];
                $last = $value[$length - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }
            $values[$name] = $value;
        }
        break;
    }

    return $values;
}

function pg_env(string $name, ?string $default = null): ?string
{
    $serverValue = getenv($name);
    if (is_string($serverValue) && $serverValue !== '') {
        return $serverValue;
    }

    $fileValues = pg_load_env_file();
    return isset($fileValues[$name]) && $fileValues[$name] !== '' ? $fileValues[$name] : $default;
}

function pg_env_int(string $name, int $default, int $minimum, int $maximum): int
{
    $raw = pg_env($name);
    if ($raw === null || filter_var($raw, FILTER_VALIDATE_INT) === false) {
        return $default;
    }
    return max($minimum, min($maximum, (int) $raw));
}

function pg_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}

function pg_json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    pg_security_headers();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function pg_fail(string $code, string $message, int $status = 400, array $extra = []): never
{
    pg_json_response(array_merge([
        'ok' => false,
        'error' => $code,
        'message' => $message,
    ], $extra), $status);
}

function pg_request_json(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_contains($contentType, 'application/json')) {
        pg_fail('unsupported_media_type', 'La solicitud debe usar JSON.', 415);
    }

    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > 50000) {
        pg_fail('payload_too_large', 'La solicitud es demasiado grande.', 413);
    }

    try {
        $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        pg_fail('invalid_json', 'El contenido enviado no es válido.', 400);
    }

    if (!is_array($decoded)) {
        pg_fail('invalid_payload', 'El contenido enviado no es válido.', 400);
    }
    return $decoded;
}

function pg_require_method(string $method): void
{
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== strtoupper($method)) {
        header('Allow: ' . strtoupper($method));
        pg_fail('method_not_allowed', 'Método no permitido.', 405);
    }
}

function pg_current_origin(): string
{
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = preg_replace('/[^a-zA-Z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    return ($secure ? 'https://' : 'http://') . $host;
}

function pg_require_same_origin(): void
{
    $allowed = rtrim((string) pg_env('ALLOWED_ORIGIN', pg_current_origin()), '/');
    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');

    if ($origin !== '' && !hash_equals($allowed, $origin)) {
        pg_fail('origin_denied', 'Origen no autorizado.', 403);
    }

    if ($origin === '' && $referer !== '' && !str_starts_with($referer, $allowed . '/')) {
        pg_fail('origin_denied', 'Origen no autorizado.', 403);
    }
}

function pg_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function pg_b64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function pg_b64url_decode(string $value): string|false
{
    $padding = strlen($value) % 4;
    if ($padding > 0) {
        $value .= str_repeat('=', 4 - $padding);
    }
    return base64_decode(strtr($value, '-_', '+/'), true);
}

function pg_client_fingerprint(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $secret = (string) pg_env('CHAT_SIGNING_SECRET', '');
    return hash_hmac('sha256', $ip, $secret !== '' ? $secret : 'petsgates-unconfigured');
}

function pg_sse_event(string $event, array $payload): void
{
    echo 'event: ' . preg_replace('/[^a-z0-9_-]/i', '', $event) . "\n";
    echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
    if (ob_get_level() > 0) {
        @ob_flush();
    }
    flush();
}

