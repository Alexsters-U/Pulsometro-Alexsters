# Despliegue en VPS con Nginx

Esta guia prepara un despliegue nuevo de la web/backend. La APK es el proyecto
hermano independiente `Alexsters Pulse Android`: no se sube a este repositorio
ni al contenedor. No hay despliegue remoto automatico ni credenciales SSH guardadas.

## 1. Publicar solo el codigo

En el equipo local:

```bash
npm run check:publication
npm run build
npm test
npm audit --omit=dev --audit-level=high
```

`.gitignore` conserva fuera de Git las claves, `.env.production`, datos, referencias
privadas, SDKs, APKs, dependencias, compilaciones, capturas y backups. No borra nada
del disco. Si un secreto ya se hubiera publicado, ignorarlo no limpia el historial:
hay que retirarlo y rotarlo. Los assets publicos, licencias de fuentes y lockfile
si deben incluirse. Revisa derechos de distribucion de recursos de terceros antes
de hacer publico el repositorio; el audio del totem no es un asset original.

La comprobacion detecta exclusiones, archivos ignorados ya versionados y coincidencias
con las tres credenciales locales conocidas. No sustituye un escaner de secretos ni
una revision del historial. El workflow de GitHub valida codigo, UI y Docker; no despliega.

## 2. Preparar VPS y dominio

- VPS Linux con Docker Engine y Compose. Nginx ya esta instalado en el host.
- Publica un registro A del subdominio hacia la IPv4 del VPS. Usa AAAA solo si
  la IPv6 realmente llega al mismo servidor.
- Dominio provisional: `pulsestudio.alexsters.works`. Confirma el definitivo antes
  de generar la configuracion y el certificado.
- Nginx conserva los puertos publicos 80/443. El backend se publica unicamente
  en `127.0.0.1:3010`; no abras 3010 ni 3000 a Internet.
- Clona el repositorio web en una carpeta dedicada, por ejemplo `/opt/pulse-studio`.
  No copies `.env`, `data`, `node_modules` ni la carpeta de Android desde tu equipo.

No reemplaces la configuracion de los demas proyectos del VPS.

## 3. Generar claves en el VPS

Desde la carpeta de la web, si hay Node.js 22.14 o superior:

```bash
npm run setup:production -- --origin https://pulsestudio.alexsters.works
chmod 600 .env.production
```

Si el host solo tiene Docker, el mismo generador puede ejecutarse sin instalar Node:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/project" -w /project node:24-alpine node scripts/setup.mjs --production --origin https://pulsestudio.alexsters.works
chmod 600 .env.production
```

Genera tres claves distintas y no las imprime. No reemplaza un archivo existente.
`ADMIN_TOKEN` abre el editor; `INGEST_TOKEN` se introduce en la app Kotlin;
`OVERLAY_TOKEN` protege la lectura de OBS. No compartas las claves entre roles.
La plantilla sin secretos es `.env.production.example`; `.env` sigue siendo local.

Verifica en privado `PUBLIC_ORIGIN`, `APP_PORT` y las tres claves. No pegues el
contenido de `.env.production` en un chat, issue, commit ni captura. Las variables
exportadas en la shell pueden prevalecer sobre el archivo de Compose; no mantengas
copias antiguas de estas variables exportadas al desplegar.

## 4. Construir y arrancar

```bash
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm --no-deps pulsometro node -e "import('./dist-server/server/config.js').then(m=>{m.loadConfig(process.env);console.log('Configuracion valida')})"
docker compose --env-file .env.production up -d --wait
docker compose --env-file .env.production ps
curl --fail http://127.0.0.1:3010/api/health
```

Espera `{"ok":true}`. Compose fuerza produccion y el puerto interno 3000.
El usuario del proceso no es root; el sistema de archivos es de solo lectura
salvo el volumen de datos y `/tmp`. Hay healthcheck, limite de memoria/procesos,
rotacion de logs y reinicio `unless-stopped`. Un estado unhealthy por si solo no
reinicia el contenedor; debe vigilarse en la operacion del VPS.

Si 3010 esta ocupado, cambia `APP_PORT` y el upstream de Nginx al mismo puerto
libre. No cambies el puerto interno 3000 del contenedor.
No ejecutes `docker compose config` sin `--quiet` al compartir salidas: muestra claves.

Con Node y dependencias de desarrollo instalados tambien puedes usar
`npm run build` y `npm run check:deploy`. Esa comprobacion solo valida el archivo
de configuracion, no DNS, TLS, firewall ni el acceso SSH.

## 5. Anadir el sitio a Nginx y activar HTTPS

Para un subdominio nuevo en Debian/Ubuntu, adapta el dominio y upstream de
`deploy/nginx-site.conf.example` y anadelo como un sitio nuevo:

```bash
sudo cp deploy/nginx-site.conf.example /etc/nginx/sites-available/pulsestudio
sudo ln -s /etc/nginx/sites-available/pulsestudio /etc/nginx/sites-enabled/pulsestudio
sudo nginx -t
sudo systemctl reload nginx
```

No repitas el enlace si ya existe. Este primer archivo escucha HTTP para permitir
emitir el certificado. Todavia no uses el editor, tokens ni OBS por HTTP.

Si Certbot no esta instalado, instala Certbot y su plugin de Nginx segun tu
distribucion. En Debian/Ubuntu se distribuyen como `certbot` y `python3-certbot-nginx`.
Con DNS y puertos 80/443 resueltos:

```bash
sudo certbot --nginx --redirect -d pulsestudio.alexsters.works
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
curl --fail https://pulsestudio.alexsters.works/api/health
```

Comprueba que el vhost HTTPS generado mantiene el proxy. Si ya hay un servidor
HTTPS dedicado a ese dominio, adapta solo `deploy/nginx.conf.example` dentro de
ese servidor; no dupliques `location /` ni reemplaces sus certificados.

El proxy deja pasar SSE sin buffering ni cache y admite conexiones largas.
El enlace OBS contiene un token: los ejemplos desactivan access logs completos y
limitan el error log a criticos para reducir su exposicion. No actives logs debug
ni registro de Authorization, cookies o query strings en otros proxies/paneles.

Si Nginx vive en Docker, `127.0.0.1` apunta a SU contenedor, no al host ni a la app.
Usa una red Docker compartida y upstream `pulsometro:3000` en lugar de estos ejemplos
para Nginx del host; no publiques el backend en `0.0.0.0` para resolverlo.

## 6. Validar el flujo real

1. Abre el editor por HTTPS e inicia sesion con la nueva clave de administrador.
2. Importa el diseno JSON local y pulsa Guardar diseno. El archivo local
   `data/design.json` no viaja por Git. La biblioteca del navegador se migra
   exportando/importando sus JSON; localStorage depende del dominio.
3. En la APK configura la URL HTTPS y el INGEST_TOKEN de este VPS. Inicia una sesion
   BLE y confirma que llegan lecturas actuales, tambien con pantalla apagada.
4. Copia la URL nueva de OBS desde el editor. Una URL localhost o con el token
   anterior no servira para este despliegue.
5. Comprueba audio, cambios de diseno, reconexion y que al detener la banda el BPM
   pasa a sin senal. La cookie de administracion debe ser Secure, HttpOnly y Strict.

La web usa una unica instancia: los eventos y BPM viven en memoria y el diseno
activo se guarda en JSON. No aumentes replicas sin cambiar esa arquitectura.
La APK y la banda siguen necesitando energia, Bluetooth, Internet y las condiciones
de segundo plano del telefono; un VPS 24/7 no garantiza esas condiciones.

## 7. Persistencia, backup y actualizacion

El volumen `pulse-data` conserva el diseno entre recreaciones. Conserva tambien
el nombre del proyecto Compose al actualizar: cambiarlo puede crear otro volumen.
Antes de actualizar guarda el diseno y las claves en un destino privado:

```bash
backup="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
chmod 700 backups "$backup"
docker compose --env-file .env.production cp pulsometro:/app/data/design.json "$backup/design.json"
cp .env.production "$backup/.env.production"
chmod 600 "$backup/design.json" "$backup/.env.production"
```

Guarda otra copia cifrada fuera del VPS y prueba su restauracion. Para actualizar,
despues de revisar los cambios del repositorio:

```bash
git pull --ff-only
docker compose --env-file .env.production up -d --build --wait
curl --fail https://pulsestudio.alexsters.works/api/health
```

No uses `docker compose down -v`: elimina los datos persistidos. Tras reiniciar,
el diseno se conserva, pero las sesiones del editor y el BPM en memoria no.
Para restaurar un diseno puedes importarlo por el editor y guardar de nuevo.
Cambiar INGEST_TOKEN exige actualizar la APK; cambiar OVERLAY_TOKEN exige renovar
el enlace en OBS.

## Estado de la preparacion

Compilar, pasar pruebas o construir Docker no confirma un despliegue real.
Siguen pendientes de verificar en el VPS: acceso remoto, DNS, TLS, configuracion
de Nginx, copias externas y prueba con telefono/OBS. No se incluyen claves SSH
ni se ejecuta un despliegue remoto desde este proyecto.
