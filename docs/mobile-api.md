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
  "measuredAt": "2026-10-20T12:00:00Z",
  "battery": 64
}
```

- `bpm`: entero entre 25 y 260; este limite valida datos, no clasifica salud.
- `device`: nombre del emisor/dispositivo, entre 1 y 80 caracteres.
- `measuredAt`: ISO 8601 con zona horaria, opcional. Si falta se usa la hora de recepcion.
- `battery`: entero 0 a 100, opcional. Porcentaje del Battery Service (180F) de la banda.
  Si una lectura lo omite, el servidor conserva el ultimo valor de la misma banda.
- Se rechazan lecturas tan antiguas como `PULSE_STALE_MS`, o mas de 5 segundos futuras.
- Cuerpo maximo: 16 KB. Respuesta correcta:

```json
{ "ok": true, "viewers": { "overlays": 1, "obs": 1, "live": 1, "streaming": true, "editors": 0 } }
```

`viewers` indica quien lee el canal en ese momento: `overlays` cuenta todas las fuentes
abiertas con la clave de lectura, `obs` las que corren dentro de OBS, `live` las que OBS
informo como activas en programa y `streaming` si OBS dice estar transmitiendo (`null`
si no lo sabe). OBS solo avisa los cambios de escena, asi que `live` vale 0 hasta el
primer cambio despues de abrir la fuente. `streaming` requiere que la fuente de navegador
tenga el permiso de pagina "Acceso de lectura al estado de OBS" (Read access to OBS status information).

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

## Vincular la app con un QR

El editor (sesion de administrador) crea un codigo de un solo uso que caduca en 2 minutos:

```http
POST /api/pairing          -> 200 {"code":"...","link":"https://dominio/pair#code=...","expiresAt":"..."}
DELETE /api/pairing        -> 200 {"ok":true}   (cancela el codigo vigente)
```

El QR contiene `link`. El codigo va en el fragmento (`#code=`), que el navegador no envia
al servidor ni queda en logs de proxy. La app lo canjea sin otra credencial:

```http
POST /api/pair
Content-Type: application/json

{ "code": "...", "device": "Xiaomi 14T" }
```

- `200 {"origin":"https://dominio","ingestToken":"..."}`: la app comprueba que `origin`
  coincide con el dominio del QR antes de guardar la clave.
- `401`: codigo invalido, usado o caducado. `429`: mas de 20 intentos fallidos por minuto.
- Solo hay un codigo vigente; generar otro o canjearlo invalida el anterior. El editor
  recibe el evento SSE `pairing` (`completed` con el nombre del dispositivo o `cancelled`).

Si el telefono abre el QR con su camara, `/pair` muestra un boton que abre la app con
`alexsters-pulse://pair?origin=...&code=...`. La app siempre pide confirmar el dominio.

## Lectura y eventos

`GET /api/pulse?token=<OVERLAY_TOKEN>` devuelve `bpm`, `device`, `receivedAt`,
`status` (`idle`, `connected`, `stale`) y `staleAfterMs`.
En ausencia de lectura actual `bpm` es `null`.

`GET /api/events?token=<OVERLAY_TOKEN>` abre SSE, envia el estado inicial y emite:

- `hello`: identificador de esta conexion, usado por `POST /api/presence`.
- `pulse`: nueva lectura o cambio a sin senal; incluye `battery` si se conoce.
- `design`: diseno completo al conectar y despues de cada guardado.
- `viewers` y `pairing`: solo para el editor autenticado.

`GET /api/events?token=<OVERLAY_TOKEN>&client=obs` lo usa el overlay cuando detecta
`window.obsstudio`. Despues informa el estado que OBS le comunica:

```http
POST /api/presence?token=<OVERLAY_TOKEN>
Content-Type: application/json

{ "id": "<id de hello>", "active": true, "visible": true, "streaming": null }
```

La clave de lectura no permite enviar ni editar. El editor usa una cookie de sesion
para los mismos recursos y para `PUT /api/design`.

`POST /api/session` con `Authorization: Bearer <ADMIN_TOKEN>` inicia la sesion del
editor. `GET /api/session` consulta la sesion y `DELETE /api/session` la cierra.
`GET /api/health` es publico y no contiene mediciones ni secretos.
