# Contrato del emisor movil

La app Kotlin del proyecto independiente `Alexsters Pulse Android` lee BLE mediante un servicio Android y envia solo mediciones
actuales. La web no hace de emisor y el PC no necesita Bluetooth.

## Enviar BPM

```http
POST /api/pulse
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "bpm": 97,
  "device": "KYOTO 2809_15CF",
  "measuredAt": "2026-10-20T12:00:00Z"
}
```

- `bpm`: entero entre 25 y 260; este limite valida datos, no clasifica salud.
- `device`: nombre del emisor/dispositivo, entre 1 y 80 caracteres.
- `measuredAt`: ISO 8601 con zona horaria, opcional. Si falta se usa la hora de recepcion.
- Se rechazan lecturas tan antiguas como `PULSE_STALE_MS`, o mas de 5 segundos futuras.
- Cuerpo maximo: 16 KB. Respuesta correcta: `200 {"ok":true}`.

```bash
curl https://pulso.example.com/api/pulse \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bpm":97,"device":"KYOTO 2809_15CF"}'
```

Codigos: `400` datos/JSON invalidos, `401` token incorrecto, `413` cuerpo demasiado
grande, `415` tipo de contenido incorrecto, `422` fecha fuera de la ventana admitida.

El APK debera usar HTTPS, mantener el token fuera de logs, serializar los envios y
usar reintentos con espera progresiva. Tras recuperar Internet debe enviar la ultima
lectura actual, no reproducir una cola historica sobre el overlay en vivo.
El servicio `connectedDevice`, la notificacion, la reconexion BLE y el control de
antiguedad estan implementados en ese proyecto. La continuidad con pantalla apagada
y la compatibilidad del KYOTO requieren la prueba fisica descrita en su README.

## Lectura y eventos

`GET /api/pulse?token=<OVERLAY_TOKEN>` devuelve `bpm`, `device`, `receivedAt`,
`status` (`idle`, `connected`, `stale`) y `staleAfterMs`.
En ausencia de lectura actual `bpm` es `null`.

`GET /api/events?token=<OVERLAY_TOKEN>` abre SSE, envia el estado inicial y emite:

- `pulse`: nueva lectura o cambio a sin senal.
- `design`: diseno completo al conectar y despues de cada guardado.

La clave de lectura no permite enviar ni editar. El editor usa una cookie de sesion
para los mismos recursos y para `PUT /api/design`.

`POST /api/session` con `Authorization: Bearer <ADMIN_TOKEN>` inicia la sesion del
editor. `GET /api/session` consulta la sesion y `DELETE /api/session` la cierra.
`GET /api/health` es publico y no contiene mediciones ni secretos.
