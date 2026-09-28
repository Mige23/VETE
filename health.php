<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

pg_require_method('GET');
$configured = (string) pg_env('GEMINI_API_KEY', '') !== ''
    && strlen((string) pg_env('CHAT_SIGNING_SECRET', '')) >= 32;

pg_json_response([
    'ok' => true,
    'service' => 'petsgates-chat',
    'configured' => $configured,
    'model' => (string) pg_env('GEMINI_MODEL', 'gemini-3.5-flash'),
]);

