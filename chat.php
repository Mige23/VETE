<?php
declare(strict_types=1);

require_once __DIR__ . '/_security.php';
require_once __DIR__ . '/_knowledge.php';
require_once __DIR__ . '/_gemini.php';

pg_require_method('POST');
pg_require_same_origin();
$session = pg_validate_session();
$input = pg_request_json();

if (!empty($input['website'])) {
    pg_fail('request_rejected', 'No pudimos procesar la solicitud.', 400);
}

$message = trim((string) ($input['message'] ?? ''));
$maxLength = pg_env_int('CHAT_MAX_MESSAGE_LENGTH', 2000, 200, 4000);
$messageLength = mb_strlen($message, 'UTF-8');
if ($message === '' || $messageLength > $maxLength) {
    pg_fail('invalid_message', 'Escribí un mensaje de hasta ' . $maxLength . ' caracteres.', 422);
}

pg_enforce_rate_limits((string) $session['sid']);

pg_security_headers();
header('Content-Type: text/event-stream; charset=utf-8');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');
header_remove('Content-Encoding');
@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', '0');
@set_time_limit(90);
ignore_user_abort(false);

while (ob_get_level() > 0) {
    @ob_end_flush();
}

pg_sse_event('ready', ['requestId' => bin2hex(random_bytes(6))]);

if (pg_is_emergency($message)) {
    pg_sse_event('meta', ['emergency' => true]);
    pg_sse_event('delta', [
        'text' => "Esto puede ser una urgencia. No esperes una respuesta por chat: contactá ahora mismo a una guardia veterinaria 24/7 o trasladá a tu animal a la clínica más cercana.\n\nMientras te comunicás, mantenelo en un lugar seguro y tranquilo. No le des medicación humana, comida ni provoques el vómito salvo indicación directa de un profesional.",
    ]);
    pg_sse_event('done', ['finishReason' => 'EMERGENCY_PROTOCOL']);
    exit;
}

$contents = [];
$history = $input['history'] ?? [];
$historyCharacters = 0;
if (is_array($history)) {
    $history = array_slice($history, -8);
    foreach ($history as $turn) {
        if (!is_array($turn)) {
            continue;
        }

        $role = ($turn['role'] ?? '') === 'model' ? 'model' : 'user';
        $text = trim((string) ($turn['text'] ?? ''));
        if ($text === '') {
            continue;
        }

        $text = mb_substr($text, 0, 1500, 'UTF-8');
        $historyCharacters += mb_strlen($text, 'UTF-8');
        if ($historyCharacters > 8000) {
            break;
        }
        $contents[] = ['role' => $role, 'parts' => [['text' => $text]]];
    }
}

$contents[] = ['role' => 'user', 'parts' => [['text' => $message]]];
pg_stream_gemini($contents, pg_system_instruction());
