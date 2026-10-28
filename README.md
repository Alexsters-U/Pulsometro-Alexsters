# Pulsometro Alexsters

Editor de overlays para OBS y API de frecuencia cardiaca preparada para un VPS.
La web y la API comparten dominio. La app Android en Kotlin conecta la banda por BLE
y envia BPM por HTTPS; la compatibilidad del KYOTO se valida con el dispositivo real.

## Tecnologias

- React + TypeScript + Vite para el editor y el overlay transparente.
- Node.js para servir la SPA, recibir mediciones y emitir eventos SSE.
- Zod para validar el contrato compartido entre frontend y backend.
- Archivo JSON para los disenos, sin base de datos. BPM solo en memoria.
- Docker Compose para ejecutar un unico servicio con volumen persistente.

## Ejecutar localmente

Requiere Node.js 22.14 o superior. El contenedor usa Node.js 24.

```bash
npm ci
npm run setup
npm run build
npm start
```

En Windows PowerShell puedes usar `npm.cmd` si la politica bloquea `npm.ps1`.
Abre `http://127.0.0.1:3000` e ingresa con el valor `ADMIN_TOKEN` de `.env`.
`setup` genera tres claves aleatorias y nunca reemplaza un `.env` existente.
La aplicacion no arranca si faltan las claves o si son iguales.

Para desarrollo con recarga automatica:

```bash
npm run dev
```

Editor en `http://127.0.0.1:5173`; API en `http://127.0.0.1:3000`.
Vite redirige `/api` al backend. El simulador solo afecta a la previsualizacion.

## Pulse Studio

El editor incluye temas claro y oscuro con preferencia guardada por navegador,
seleccion visual de temas, historial para deshacer y rehacer, fondos de prueba,
zoom y lienzo ampliado. El simulador ofrece escenarios por BPM y un historial
de las ultimas 40 variaciones observadas; no es un electrocardiograma.

La biblioteca contiene cuatro plantillas y hasta 24 disenos propios guardados
en este navegador. Los archivos JSON permiten exportarlos e importarlos entre
equipos. Solo **Guardar diseno** publica el diseno activo hacia OBS.
La vista **Conexiones** muestra el destino del emisor, la URL de lectura oculta
y una comprobacion real de disponibilidad del servidor.

## Preparar produccion

La guia principal es [Despliegue en VPS con Nginx](docs/deployment.md).
La configuracion del servidor se genera en `.env.production`, separada de `.env`:

```bash
npm run setup:production -- --origin https://pulsestudio.alexsters.works
npm run check:publication
npm run build
npm run check:deploy
docker compose --env-file .env.production up -d --build --wait
```

El dominio sigue siendo provisional y debe apuntar al VPS con HTTPS configurado.
El backend queda privado en loopback; Nginx publica el sitio. El workflow de GitHub
valida la web y la imagen Docker, pero no realiza despliegues ni usa claves SSH.

## Usar con OBS

Entra al editor, cambia el diseno y pulsa **Guardar diseno**.
Copia la URL de OBS desde el editor y pegala en una fuente de navegador.
Un lienzo de fuente de 600 x 240 deja espacio para el brillo y la vibracion.
El enlace incluye una clave de lectura; no permite enviar BPM ni editar disenos.
Los cambios guardados se propagan a OBS sin recargarlo ni compartir localStorage.
Si no llegan lecturas durante 10 segundos, el overlay muestra `--`.

## Temas y movimiento

El selector contiene cuatro temas: Minecraft, Hardcore, Neon y Cristal, cada uno
con su asset generado y su tipografia. El antiguo tema Limpio migra a Minecraft
sin perder rangos personalizados. Las fuentes locales VT323 y Rajdhani
incluyen sus licencias OFL en `public/assets/fonts`.

El corazon se expande y contrae una vez por ciclo a la frecuencia de los BPM:
60 BPM = 1000 ms por ciclo; 120 BPM = 500 ms. Web Animations ajusta la velocidad
sin reiniciar la fase de la animacion con cada lectura. Este ritmo es una
representacion del BPM, no una sincronizacion con cada impulso real del sensor.
La vibracion de los numeros se regula aparte y ya no mueve todo el overlay.
Sin senal o con movimiento reducido, se detienen las animaciones continuas.
El simulador permite desactivar Automatico y elegir BPM con el deslizador.

## Totem de Minecraft

El tema Minecraft usa los sprites de las fases base, elevada y acelerada.
Hardcore usa el corazon con borde oscuro. Ambos admiten el efecto del totem.
A partir de 140 BPM muestra un amuleto de Natanael, con pelaje gris, ojos claros y
un colgante con la N, basado en el sprite Popcat y en una foto del gato. Al cruzar
desde menos de 140, abre la boca durante el pop, rebota con particulas y reproduce
el sonido original de uso del totem. Al terminar, vuelve a cerrar la boca.
No se dispara al abrir o reconectar un overlay que ya recibe 140 BPM o mas.
Para repetirlo hay que bajar a 135 BPM o menos y cruzar nuevamente 140, dejando
al menos 10 segundos entre efectos. La opcion Corazon tambien oculta el totem.

En el editor puedes desactivar el efecto o el audio, ajustar el volumen y pulsar
**Probar Natanael**. La previsualizacion no emite sonidos automaticamente.
En OBS activa **Controlar audio mediante OBS** en la fuente de navegador para
administrarlo desde el mezclador. Si el navegador bloquea la reproduccion automatica,
usa **Interactuar** y haz clic una vez dentro de la fuente; el proximo cruce tendra audio.
El efecto respeta la preferencia de movimiento reducido.

El sprite es generado; el audio pertenece a los recursos de Minecraft (Mojang/Microsoft).
Origen, hash de verificacion, paleta de Natanael y prompts de ambos estados estan
en `docs/totem-assets.json`. Las dos versiones antiguas del totem se retiraron.

Si conservas un diseno de la version local anterior, el editor ofrece
**Importar diseno local** en ese mismo navegador. Revisalo y guardalo en el servidor.
El almacenamiento local anterior no se borra.

## Pruebas

```bash
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

Si tienes Edge instalado, puedes usarlo sin descargar Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:ui
```

Las pruebas usan datos temporales y credenciales de prueba, independientes de `.env`.

Para comprobar el contenedor de produccion y Nginx localmente con Docker:

```bash
docker build -t pulse-studio:local-check .
npm run test:container
```

La prueba crea un stack temporal en puertos de loopback libres, comprueba SSE y
persistencia, y elimina solo sus contenedores/volumenes. No verifica el VPS ni TLS.

## Documentacion

- [Despliegue en VPS](docs/deployment.md)
- [Contrato del emisor Android](docs/mobile-api.md)

La app nativa es el proyecto hermano independiente `Alexsters Pulse Android`.
Este repositorio contiene solo la web/backend; no incluye el SDK ni el codigo Kotlin.
La web no se conecta a Bluetooth: la recepcion BLE pertenece a la app Android.
