# Casas · Árbitro

Aplicación web local para arbitrar partidas humano–humano, humano–bot o bot–bot. Requiere **Node.js 22 o posterior**. No necesita dependencias para ejecutarse; las pruebas usan Jest como dependencia de desarrollo.

```powershell
npm start
```

Abrí **http://localhost:3150**. En Windows, si PowerShell bloquea `npm.ps1`, usá `npm.cmd start`. Para detener el servidor: `Ctrl+C`. El puerto predeterminado es **3150**; podés cambiarlo con la variable de entorno `PORT` antes de iniciar el servidor.

## Jugar

Elegí Humano o Bot para cada jugador e iniciá la partida. A empieza en (0,0); B en (9,9). El tablero previo al inicio es una vista ilustrativa; cada nueva partida genera sus cinco casas.

- **Humano:** seleccioná una ficha en el tablero o en su botón, luego un destino iluminado o una flecha. También podés usar las flechas del teclado. Prepará todas las fichas y confirmá el turno. Podés corregir la propuesta antes de confirmar.
- **Bot:** ingresá la URL completa del endpoint, por ejemplo `http://localhost:3000/move`. Si ingresás solamente el origen, se agrega `/move`. Los bots juegan automáticamente; podés pausar, avanzar un turno o cambiar el ritmo.
- La bitácora registra movimientos, conquistas, nuevas fichas y fallos. El resultado aparece al finalizar.
- El tablero ajusta su tamaño a la altura disponible. La bitácora se abre con su botón para mantener visible la arena.
- Una rueda de tres sectores presenta cada tirada y se detiene en el valor enviado por el árbitro. Durante la animación no se pueden mover fichas ni adelantar bots. Se respeta la preferencia de movimiento reducido del sistema.
- Hay efectos de sonido al elegir movimientos, girar la rueda, conquistar y finalizar. El botón «Sonido» permite silenciarlos y recuerda la preferencia. Se generan localmente con Web Audio, activado después de una interacción del usuario, siguiendo las [recomendaciones de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

## Conectar el bot de ejemplo

En otra terminal:

```powershell
cd C:\Users\cguar\repos\upc\bot-casas-ejemplo
npm run dev
```

En el árbitro elegí Bot y usá `http://localhost:3000/move`. Ambos jugadores pueden usar el mismo endpoint. El árbitro hace las solicitudes desde su servidor, por lo que no requiere CORS en el bot.

Contrato de `POST /move`:

```json
{ "jugador": "A", "dado": 2, "tablero": ["matriz de 10 × 10 casillas"] }
```

En la matriz real, cada casilla es `""`, `"N"` (casa neutral) o un ID como `"A1"` o `"B2"`. Respuesta esperada: `{"A1":"N","A2":"O"}`. Direcciones: N, S, E, O. Debe incluir exactamente todas las fichas propias. El bot de ejemplo solo mueve su primera ficha; al obtener más fichas, necesita ampliar su estrategia o sus jugadas serán inválidas.

## Decisiones del árbitro

- Dado uniforme de 1 a 3, una vez por turno. Todas las fichas se mueven simultáneamente la distancia exacta, en una única dirección ortogonal. Se permite atravesar fichas e intercambiar posiciones propias; se rechazan destinos compartidos o sobre rivales.
- Cinco casas: dos pares simétricos por rotación y una quinta equidistante de ambas esquinas usando distancia Manhattan toroidal. Esto equilibra las distancias iniciales; no garantiza igualdad estratégica.
- Solo se conquista al llegar al destino. La nueva ficha se incorpora al inicio del siguiente turno propio. Si la posición original está ocupada, se busca por amplitud la casilla libre más cercana, explorando N, E, S, O y respetando los bordes conectados. Las casas neutrales se reservan para conquistarlas con movimientos.
- Termina al conquistar todas las casas o completar 50 turnos individuales, según las reglas adjuntas. Gana quien conquistó más; puede haber empate.
- Un fallo consume el turno sin mover ninguna ficha; tres fallos consecutivos del mismo jugador implican derrota técnica. Una jugada válida reinicia su contador. Un bot tiene 5 segundos para responder; errores HTTP, JSON inválido y movimientos inválidos cuentan como fallos. Los humanos no tienen límite temporal y la interfaz permite corregir propuestas inválidas.
- El servidor es la autoridad sobre dados, posiciones y validación. Las partidas se mantienen en memoria; reiniciar el servidor o recargar la interfaz requiere iniciar una nueva. El servidor escucha únicamente en la computadora local y permite bots HTTP/HTTPS locales o remotos. No está preparado como servicio público multiusuario.

## Verificación y archivos

```powershell
npm install
npm test
```

Las pruebas se ejecutan con Jest y cubren el motor y la integración HTTP con un bot local de prueba. No requieren iniciar el árbitro ni un bot externo. Los servidores de prueba utilizan puertos libres y se cierran al finalizar, incluso si falla una aserción.

- `npm run test:watch`: vuelve a ejecutar las pruebas al guardar cambios.
- `npm run test:coverage`: genera el informe de cobertura en `coverage/`.

La configuración usa módulos ES nativos, sin transformaciones, según la [documentación de Jest para ESM](https://jestjs.io/docs/ecmascript-modules). Node puede mostrar un aviso por `--experimental-vm-modules`; no indica un fallo de las pruebas.

`engine.js`: reglas y contrato de bots. `server.js`: servidor HTTP y solicitudes a bots. `public/`: interfaz. `test/`: pruebas del motor e integración HTTP. `npm run dev` reinicia el servidor cuando se modifica el código.
