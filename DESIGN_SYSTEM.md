# Design System: Event Hub (Flutter)

Basado en el skill `apple-design` (WWDC *Designing Fluid Interfaces* + *Principles
of Great Design*), traducido a Flutter. Referencia para el paso 9 del roadmap
(app Flutter: 9a auth/eventos, 9b checkout, 9c escaneo QR) en `DESIGN.md`.

El hilo conductor es el mismo: **una interfaz se siente viva cuando el movimiento
empieza desde el valor actual en pantalla, hereda la velocidad del gesto del
usuario, proyecta el momentum hacia adelante, y puede agarrarse y revertirse en
cualquier instante.** En Flutter, esto se logra con `SpringSimulation` en vez de
`Curves` fijos para cualquier cosa que el usuario pueda tocar/arrastrar.

## 1. Respuesta — matar la latencia

- Usa `GestureDetector.onTapDown` / `InkWell` con `splashFactory` para dar
  feedback visual instantáneo al presionar, no en `onTap` (que espera al
  release).
- El botón "Comprar" en checkout (9b) debe mostrar el estado presionado en el
  frame del touch-down, no después de la llamada a la API.
- Para el drag de un bottom sheet (detalle de zona/precio), actualiza la
  posición 1:1 con `onPanUpdate` — nunca animes solo al soltar.

```dart
GestureDetector(
  onTapDown: (_) => setState(() => _pressed = true),
  onTapUp: (_) => setState(() => _pressed = false),
  onTapCancel: () => setState(() => _pressed = false),
  onTap: _handlePurchase,
  child: AnimatedScale(
    scale: _pressed ? 0.97 : 1.0,
    duration: const Duration(milliseconds: 100),
    child: PurchaseButton(),
  ),
)
```

## 2. Manipulación directa — tracking 1:1

Para el bottom sheet de detalle de evento/zona o el modal del boleto con QR:
usa `onPanUpdate` para mover el widget exactamente con el dedo, respetando el
offset de dónde se agarró (no saltar al centro del widget al iniciar el drag).

```dart
onPanStart: (details) {
  _grabOffset = details.localPosition.dy;
},
onPanUpdate: (details) {
  setState(() => _sheetOffset += details.delta.dy);
},
```

## 3. Interrumpibilidad — el principio más importante

Cada animación de un sheet, modal o card debe poder agarrarse a mitad de
camino y revertirse sin esperar a que termine. **No uses `AnimationController`
con `Curves` fijos para nada que el usuario pueda tocar** — usa
`SpringSimulation` de `package:flutter/physics.dart`, que anima siempre desde
el valor actual (nunca salta al valor objetivo).

```dart
void _animateSheetTo(double target, {double velocity = 0}) {
  final simulation = SpringSimulation(
    const SpringDescription(mass: 1, stiffness: 300, damping: 30), // ver tabla §4
    _controller.value,   // desde el valor de presentación actual, no el target lógico
    target,
    velocity,            // velocidad del gesto al soltar (§5)
  );
  _controller.animateWith(simulation);
}
```

Si el usuario agarra el sheet mientras está animando, cancela la simulación
(`_controller.stop()`) y arranca el nuevo drag desde `_controller.value` — nunca
desde el valor objetivo.

## 4. Comportamiento sobre animación — springs

Flutter no expone directamente "damping ratio" + "response" como Apple —
traduce a `mass`/`stiffness`/`damping` de `SpringDescription`. Fórmula práctica
(aproximada, suficiente para UI):

```
stiffness = (2π / response)² × mass
damping   = 2 × dampingRatio × √(stiffness × mass)
```

**Defaults recomendados para Event Hub:**

| Interacción | Damping ratio | Response | mass/stiffness/damping aprox. |
| --- | --- | --- | --- |
| Cards de eventos, transiciones de pantalla | `1.0` (crítico, sin rebote) | `0.35` | `mass:1, stiffness:322, damping:36` |
| Bottom sheet (detalle de zona, boleto) | `0.8` | `0.3` | `mass:1, stiffness:438, damping:33` |
| Drag de boleto con momentum (flick para descartar) | `0.8` | `0.4` | `mass:1, stiffness:246, damping:25` |

Regla: `damping 1.0` por defecto en todo. Solo agrega rebote (`0.8`) cuando el
propio gesto tenía momentum (un flick, un soltar con velocidad) — nunca en algo
que solo aparece (splash de compra exitosa, por ejemplo).

## 5. Velocity handoff

Al soltar un drag (`onPanEnd`), pasa `details.velocity.pixelsPerSecond` como
velocidad inicial de la `SpringSimulation` — así la transición de "arrastrando"
a "animando" no tiene costura visible. Crítico para: cerrar el modal del
boleto con un swipe, o el bottom sheet de selección de zona.

## 6. Proyección de momentum

Para decidir si un swipe hacia abajo cierra el modal del boleto o vuelve a su
posición, no uses solo la posición de soltar — proyecta hacia dónde iba el
gesto:

```dart
double project(double velocity, {double decelerationRate = 0.998}) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

final projected = currentOffset + project(velocity.pixelsPerSecond.dy);
final shouldDismiss = projected > dismissThreshold;
```

Esto es lo mismo que un flick en un carrusel o bottom sheet real (ver Vaul,
Embla como referencia del comportamiento esperado).

## 7. Consistencia espacial

- Un evento que se abre desde su card en la lista (9a) debe cerrarse hacia la
  misma card — usa `Hero` widget para esa continuidad espacial, no un
  `PageRouteBuilder` genérico con fade.
- Un sheet que sale desde abajo se cierra hacia abajo. Nunca entra desde un
  lado y sale por otro.
- El modal del boleto con QR (9b/9c) debe originarse visualmente desde el
  botón "Ver boleto", no aparecer centrado sin relación con lo que lo abrió.

## 8. Rubber-banding en los límites

Para el bottom sheet o el drag del boleto, usa `BouncingScrollPhysics` en
listas nativas de Flutter (gratis), y para drags custom aplica resistencia
progresiva más allá del límite:

```dart
double rubberband(double overshoot, double dimension, {double k = 0.55}) {
  return (overshoot * dimension * k) / (dimension + k * overshoot.abs());
}
```

## 9. Materiales y profundidad

- App bar y bottom nav como capas translúcidas: `BackdropFilter` +
  `ImageFilter.blur(sigmaX: 20, sigmaY: 20)` sobre un `Container` con color
  semi-transparente — el contenido de la lista de eventos se desplaza debajo,
  no una barra opaca fija.
- El modal del boleto (superficie grande) debe leerse "más grueso" que un chip
  o badge pequeño: blur más fuerte + sombra más profunda.
- Nunca apiles dos superficies translúcidas claras una sobre otra — la
  legibilidad colapsa. Si el bottom sheet ya es translúcido, el texto adentro
  va sobre una capa sólida, no sobre otra capa de vidrio.

```dart
ClipRRect(
  borderRadius: BorderRadius.circular(24),
  child: BackdropFilter(
    filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
    child: Container(
      color: Colors.white.withOpacity(0.6),
      child: child,
    ),
  ),
)
```

## 10. Reduced motion y accesibilidad

Flutter expone esto vía `MediaQuery.of(context).disableAnimations` (refleja
la preferencia de accesibilidad del sistema operativo).

```dart
final reduceMotion = MediaQuery.of(context).disableAnimations;
if (reduceMotion) {
  // cross-fade corto en vez de spring/slide; sin overshoot
} else {
  _animateSheetTo(target, velocity: velocity);
}
```

Respeta también el tamaño de texto del sistema (`MediaQuery.textScaler`) —
espaciados en unidades relativas, no `px` fijos, para que un usuario con texto
grande no rompa el layout del listado de eventos o el checkout.

## 11. Tipografía

- **Tracking específico por tamaño:** título de evento (display, grande) con
  `letterSpacing: -0.5`; precio/detalle (cuerpo) con `letterSpacing: 0`.
- **Leading inverso al tamaño:** `height: 1.05` en títulos grandes, `height:
  1.5` en cuerpo de texto (descripción del evento, términos).
- Usa la fuente del sistema por defecto (`Theme.of(context).textTheme`, que en
  iOS se ve como San Francisco y en Android como Roboto) antes de cargar una
  fuente custom — ya trae tuning óptico y legibilidad resuelta.

```dart
Text(
  event.title,
  style: const TextStyle(
    fontSize: 32,
    height: 1.05,
    letterSpacing: -0.5,
    fontWeight: FontWeight.w600,
  ),
)
```

## 12. Aplicación a los flujos concretos de Event Hub (paso 9)

- **9a — Auth + listado/detalle de eventos:** cards con feedback en
  touch-down, transición `Hero` de card→detalle, sin springs de momentum (no
  hay gesto de arrastre aquí, solo taps).
- **9b — Checkout + boleto con QR:** el bottom sheet de selección de zona usa
  spring `damping 0.8` (drag con momentum). El botón "Comprar" da feedback
  instantáneo en touch-down; el modal del boleto tras el pago se abre con
  spring `damping 1.0` (aparece, no fue arrastrado) y se cierra con swipe
  (velocity handoff + proyección de momentum, §5-6).
- **9c — Escaneo QR:** feedback inmediato al detectar un código (vibración +
  color de borde, sincronizados en el mismo frame — regla de "armonía" del
  skill original), antes de esperar la respuesta síncrona de access-service.
  Mientras se espera la respuesta de red, mostrar estado de carga — nunca
  dejar el escáner "congelado" sin feedback (relacionado con el TODO 3 de
  `TODOS.md`: comportamiento ante timeout).

## Quick Reference (Flutter)

| Necesidad | Técnica | API de Flutter |
| --- | --- | --- |
| Spring por defecto (sin rebote) | Crítico, `damping 1.0` | `SpringSimulation` + `SpringDescription` |
| Spring con momentum | `damping ~0.8` | `SpringSimulation` con `velocity` de `onPanEnd` |
| Interrumpir limpio | Animar desde valor actual | `_controller.stop()` + `_controller.value` |
| Drag 1:1 | Tracking directo | `GestureDetector.onPanUpdate` |
| Feedback instantáneo | En touch-down | `onTapDown`, no `onTap` |
| Continuidad espacial | Origen = trigger | `Hero` widget |
| Límite suave | Resistencia progresiva | `BouncingScrollPhysics` / rubberband custom |
| Vidrio/translúcido | Capa flotante con blur | `BackdropFilter` + `ImageFilter.blur` |
| Reduced motion | Cross-fade, sin spring | `MediaQuery.disableAnimations` |
| Tipografía por tamaño | Tracking/leading variable | `TextStyle.letterSpacing` / `height` por escala |
