# Petsgates

Landing de una veterinaria enfocada en medicina cercana y preventiva.

- Web: HTML, CSS y JavaScript sin proceso de compilación.
- Turnos: calendario configurable en `manifest.js`; filtra fechas y horas pasadas, días cerrados y bloqueos cargados en `blockedDates` / `blockedSlots`.
- Vista previa: servidor estático con Node.js 18 o superior.

## Vista previa local

```bash
npm start
```

Luego abrí `http://127.0.0.1:8765/`.

La agenda incluida funciona en el navegador. Para disponibilidad compartida en tiempo real entre pacientes, hay que conectar `blockedSlots` con el sistema de turnos o una base de datos.
