# Petsgates

Landing premium para una veterinaria con chatbot Gemini integrado.

- Web: HTML, CSS y JavaScript sin build ni npm.
- Chat: frontend en `chat.js` y `chat.css`.
- Backend: PHP 8.3+ dentro de `api/`.
- Turnos: calendario configurable en `lib/manifest.js`; filtra fechas y horas pasadas, días cerrados y bloqueos cargados en `blockedDates` / `blockedSlots`.
- IA: Gemini API mediante streaming SSE.
- Privacidad: historial únicamente en memoria del navegador; no se guardan conversaciones.

Para instalar el chatbot en Hostinger, seguí [DEPLOY_CHATBOT.md](DEPLOY_CHATBOT.md).

La agenda incluida es del frontend. Para disponibilidad compartida en tiempo real entre pacientes, hay que conectar `blockedSlots` con el sistema de turnos o una base de datos.

Vista previa del frontend: `http://127.0.0.1:8765/`.
