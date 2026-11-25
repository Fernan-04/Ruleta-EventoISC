# Ruleta de Becas · Final Local ISC UTP

Ruleta para proyectar el sorteo de las **25 becas** de la Final Local de Impact Startup Competition.
HTML + CSS + JavaScript puro: funciona abriendo `index.html` con doble clic, sin servidor, sin instalar nada y sin internet (con internet carga las fuentes Poppins y JetBrains Mono).

## Cómo usarla

1. Abre `index.html` en Chrome o Edge.
2. En **Participantes**, pega la columna *Nombre completo* del Google Sheet (un nombre por línea). Los repetidos se cuentan una sola vez.
3. Pulsa **⛶ Pantalla completa** (o la tecla `F`) para proyectar.
4. Gira, confirma con **Siguiente beca →** o descarta con **No está presente · volver a sortear** (se vuelve a sortear la misma beca).
5. Al final, **Copiar ganadores para Excel** y pega en la hoja *Ganadores becas*.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Girar |
| `Enter` | Siguiente beca |
| `A` | No está presente |
| `F` | Pantalla completa |
| `M` | Silenciar |

## Qué hace

- 25 becas en orden fijo: 10 completas y 15 medias (`data/prizes.js`). Al pasar a las medias aparece una pantalla de aviso.
- Nunca repite ganadores; quien no está presente queda descartado.
- Sorteo sin sesgo (`crypto.getRandomValues`) y la flecha siempre se detiene sobre el ganador.
- Se guarda todo en el navegador (`localStorage`): si se recarga la página no se pierde nada, incluido el último ganador sin confirmar.
- Sonidos con Web Audio (sin archivos) y respeto de `prefers-reduced-motion`.

## Antes del evento

- [ ] Pegar la lista real de inscritos.
- [ ] Hacer 2–3 giros de prueba y luego **Reiniciar sorteo**.
- [ ] Probar en el proyector (pantalla completa, tamaño de letra, sonido).

## Estructura

```
index.html        página
styles.css        estilos (tokens de color en :root)
app.js            lógica de la ruleta
data/prizes.js    lista de las 25 becas
assets/           logos
```
