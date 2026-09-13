import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/theme/app_theme.dart';
import '../events/event_models.dart';
import 'ticket_models.dart';

/// Pantalla del boleto emitido. El swipe hacia abajo para cerrar sigue
/// DESIGN_SYSTEM.md §2-6: tracking 1:1 con el dedo, velocity handoff al
/// soltar, proyección de momentum para decidir si cierra o vuelve a su
/// lugar, y SpringSimulation (nunca Curves fijos) para que se pueda
/// agarrar a mitad de una animación en curso.
class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.ticket, required this.event, required this.zone});

  final TicketModel ticket;
  final EventModel event;
  final ZoneModel zone;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController.unbounded(vsync: this, value: 0);

  static const _dampedSpring = SpringDescription(mass: 1, stiffness: 246, damping: 25);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _animateTo(double target, {double velocity = 0, VoidCallback? onDone}) {
    final simulation = SpringSimulation(_dampedSpring, _controller.value, target, velocity);
    _controller.animateWith(simulation).whenComplete(() {
      if (onDone != null && mounted) onDone();
    });
  }

  void _onDragStart(DragStartDetails details) {
    _controller.stop(); // agarrable a mitad de animación — nunca ignorar el gesto
  }

  void _onDragUpdate(DragUpdateDetails details) {
    final next = _controller.value + details.delta.dy;
    // Rubber-band suave si intenta arrastrar hacia arriba más allá del reposo.
    _controller.value = next < 0 ? next * 0.35 : next;
  }

  void _onDragEnd(DragEndDetails details) {
    final screenHeight = MediaQuery.of(context).size.height;
    final velocity = details.velocity.pixelsPerSecond.dy;
    final projected = _controller.value + _project(velocity);
    final shouldDismiss = projected > screenHeight * 0.3;

    if (shouldDismiss) {
      _animateTo(screenHeight + 200, velocity: velocity, onDone: () {
        if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      });
    } else {
      _animateTo(0, velocity: velocity);
    }
  }

  double _project(double velocity, {double decelerationRate = 0.998}) {
    return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            Expanded(
              child: GestureDetector(
                onVerticalDragStart: _onDragStart,
                onVerticalDragUpdate: _onDragUpdate,
                onVerticalDragEnd: _onDragEnd,
                child: AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) => Transform.translate(
                    offset: Offset(0, _controller.value),
                    child: child,
                  ),
                  child: Center(child: _TicketCard(ticket: widget.ticket, event: widget.event, zone: widget.zone)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.event, required this.zone});

  final TicketModel ticket;
  final EventModel event;
  final ZoneModel zone;

  @override
  Widget build(BuildContext context) {
    final used = ticket.scannedAt != null;
    final dateFormat = DateFormat('EEEE d MMMM yyyy, HH:mm', 'es');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 24, offset: const Offset(0, 12)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(event.title, style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 6),
                  Text(event.venue, style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 2),
                  Text(_capitalize(dateFormat.format(event.startsAt)), style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Text(zone.name, style: Theme.of(context).textTheme.titleLarge),
                      const Spacer(),
                      Text(
                        '\$${zone.price.toStringAsFixed(0)}',
                        style: const TextStyle(color: AppColors.accent, fontSize: 18, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            CustomPaint(painter: _DashedLinePainter(), size: const Size(double.infinity, 1)),
            Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                children: [
                  Opacity(
                    opacity: used ? 0.25 : 1,
                    child: QrImageView(
                      data: ticket.qrToken,
                      size: 200,
                      backgroundColor: Colors.white,
                      eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: AppColors.ink),
                      dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: AppColors.ink),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (used)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(20)),
                      child: const Text('Ya utilizado', style: TextStyle(color: AppColors.inkSoft, fontWeight: FontWeight.w600)),
                    )
                  else
                    Text('Presenta este código en el acceso', style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

class _DashedLinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.border
      ..strokeWidth = 1;
    const dashWidth = 6.0;
    const dashSpace = 5.0;
    double x = 0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, 0), Offset(x + dashWidth, 0), paint);
      x += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
