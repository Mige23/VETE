<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

function pg_extract_gemini_text(array $response): string
{
    $parts = $response['candidates'][0]['content']['parts'] ?? [];
    if (!is_array($parts)) {
        return '';
    }

    $text = '';
    foreach ($parts as $part) {
        if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
            $text .= $part['text'];
        }
    }
    return $text;
}

function pg_stream_gemini(array $contents, string $systemInstruction): void
{
    $apiKey = (string) pg_env('GEMINI_API_KEY', '');
    if ($apiKey === '') {
        pg_sse_event('error', [
            'code' => 'server_not_configured',
            'message' => 'Petsy todavía no está conectada con Gemini.',
        ]);
        return;
    }

    if (!function_exists('curl_init')) {
        pg_sse_event('error', [
            'code' => 'curl_unavailable',
            'message' => 'El servidor no tiene habilitada la conexión requerida.',
        ]);
        return;
    }

    $model = (string) pg_env('GEMINI_MODEL', 'gemini-3.5-flash');
    if (!preg_match('/^[a-zA-Z0-9._-]+$/', $model)) {
        $model = 'gemini-3.5-flash';
    }

    $payload = [
        'systemInstruction' => [
            'parts' => [['text' => $systemInstruction]],
        ],
        'contents' => $contents,
        'generationConfig' => [
            'maxOutputTokens' => pg_env_int('GEMINI_MAX_OUTPUT_TOKENS', 900, 256, 2048),
        ],
        'safetySettings' => [
            ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ['category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
        ],
    ];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        . rawurlencode($model)
        . ':streamGenerateContent?alt=sse';

    $buffer = '';
    $emitted = false;
    $upstreamError = null;
    $finishReason = null;

    $handle = curl_init($url);
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: text/event-stream',
            'x-goog-api-key: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 75,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$buffer, &$emitted, &$upstreamError, &$finishReason): int {
            if (connection_aborted()) {
                return 0;
            }

            $buffer .= str_replace("\r\n", "\n", $chunk);
            while (($separator = strpos($buffer, "\n\n")) !== false) {
                $eventBlock = substr($buffer, 0, $separator);
                $buffer = substr($buffer, $separator + 2);
                $dataLines = [];

                foreach (explode("\n", $eventBlock) as $line) {
                    if (str_starts_with($line, 'data:')) {
                        $dataLines[] = ltrim(substr($line, 5));
                    }
                }

                if ($dataLines === []) {
                    continue;
                }

                $decoded = json_decode(implode("\n", $dataLines), true);
                if (!is_array($decoded)) {
                    continue;
                }

                if (isset($decoded['error'])) {
                    $upstreamError = $decoded['error'];
                    continue;
                }

                $text = pg_extract_gemini_text($decoded);
                if ($text !== '') {
                    $emitted = true;
                    pg_sse_event('delta', ['text' => $text]);
                }

                $reason = $decoded['candidates'][0]['finishReason'] ?? null;
                if (is_string($reason) && $reason !== '') {
                    $finishReason = $reason;
                }
            }
            return strlen($chunk);
        },
    ]);

    if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
        curl_setopt($handle, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    }

    $result = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);

    if ($result === false && connection_aborted()) {
        return;
    }

    if ($status < 200 || $status >= 300 || $result === false || is_array($upstreamError)) {
        $code = 'upstream_error';
        $message = 'No pudimos obtener una respuesta. Intentá nuevamente en unos instantes.';

        if ($status === 429) {
            $code = 'gemini_rate_limited';
            $message = 'Petsy está recibiendo muchas consultas. Intentá nuevamente en un minuto.';
        } elseif ($status === 401 || $status === 403) {
            $code = 'gemini_auth_error';
            $message = 'Petsy necesita actualizar su conexión con Gemini.';
        } elseif ($status === 400) {
            $code = 'gemini_request_error';
            $message = 'No pudimos procesar esa consulta. Probá reformularla.';
        } elseif ($curlError !== '') {
            $code = 'connection_error';
        }

        if (!$emitted) {
            pg_sse_event('error', ['code' => $code, 'message' => $message]);
        }
        return;
    }

    if (!$emitted) {
        pg_sse_event('error', [
            'code' => 'empty_response',
            'message' => 'No pude generar una respuesta segura. Probá expresarlo de otra manera.',
        ]);
        return;
    }

    pg_sse_event('done', ['finishReason' => $finishReason ?: 'STOP']);
}
