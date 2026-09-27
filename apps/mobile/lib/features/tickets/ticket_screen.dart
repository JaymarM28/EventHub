import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../events/event_models.dart';
import 'ticket_models.dart';
import 'tickets_repository.dart';

/// Pantalla de los boletos emitidos por una compra (Fase A: una orden
/// puede emitir varios, ver DESIGN.md). Con más de uno, se navega entre
/// ellos con un `PageView` horizontal — el swipe hacia abajo para cerrar
/// sigue DESIGN_SYSTEM.md §2-6 (tracking 1:1, velocity handoff,
/// SpringSimulation nunca Curves fijos) y convive con el paginado
/// horizontal porque son ejes perpendiculares, sin ambigüedad de gestos.
class TicketScreen extends StatefulWidget {
  const TicketScreen({
    super.key,
    required this.tickets,
    required this.event,
    required this.zone,
  });

  final List<TicketModel> tickets;
  final EventModel event;
  final ZoneModel zone;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final PageController _pageController = PageController();
  final List<TicketModel> _tickets = [];
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _tickets.addAll(widget.tickets);
  }

  /// Fase E: "asignar boletos de una compra grupal a amigos" — solo tiene
  /// sentido mostrar esto cuando la orden emitió más de un boleto.
  Future<void> _assignTicket(int index, String name) async {
    final repository = context.read<TicketsRepository>();
    final updated = await repository.assign(_tickets[index].id, name);
    if (!mounted) return;
    setState(() => _tickets[index] = updated);
  }

  /// Fase E: transferencia real — a diferencia de [_assignTicket], el
  /// boleto deja de ser mío, así que sale de `_tickets`. Si era el único
  /// que quedaba en este PageView, no hay nada más que mostrar acá.
  Future<void> _transferTicket(int index, String toEmail) async {
    final repository = context.read<TicketsRepository>();
    try {
      await repository.transfer(_tickets[index].id, toEmail);
    } on TransferTicketException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
      return;
    }
    if (!mounted) return;
    setState(() {
      _tickets.removeAt(index);
      if (_page >= _tickets.length && _page > 0) _page--;
    });
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('Boleto transferido a $toEmail')));
    if (_tickets.isEmpty && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  static const _dampedSpring = SpringDescription(
    mass: 1,
    stiffness: 246,
    damping: 25,
  );

  @override
  void dispose() {
    _controller.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _animateTo(double target, {double velocity = 0, VoidCallback? onDone}) {
    final simulation = SpringSimulation(
      _dampedSpring,
      _controller.value,
      target,
      velocity,
    );
    _controller.animateWith(simulation).whenComplete(() {
      if (onDone != null && mounted) onDone();
    });
  }

  void _onDragStart(DragStartDetails details) {
    _controller
        .stop(); // agarrable a mitad de animación — nunca ignorar el gesto
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
      _animateTo(
        screenHeight + 200,
        velocity: velocity,
        onDone: () {
          if (Navigator.of(context).canPop()) Navigator.of(context).pop();
        },
      );
    } else {
      _animateTo(0, velocity: velocity);
    }
  }

  double _project(double velocity, {double decelerationRate = 0.998}) {
    return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
  }

  @override
  Widget build(BuildContext context) {
    final multiple = _tickets.length > 1;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (multiple)
                  Padding(
                    padding: const EdgeInsets.only(left: 20),
                    child: Text(
                      '${_page + 1} de ${_tickets.length}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  )
                else
                  const SizedBox.shrink(),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
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
                  child: PageView.builder(
                    controller: _pageController,
                    physics: multiple
                        ? const PageScrollPhysics()
                        : const NeverScrollableScrollPhysics(),
                    onPageChanged: (page) => setState(() => _page = page),
                    itemCount: _tickets.length,
                    itemBuilder: (context, index) => Center(
                      child: _TicketCard(
                        ticket: _tickets[index],
                        event: widget.event,
                        zone: widget.zone,
                        onAssign: multiple
                            ? (name) => _assignTicket(index, name)
                            : null,
                        onTransfer: (email) => _transferTicket(index, email),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (multiple) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _tickets.length,
                  (i) => Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _page ? AppColors.accent : AppColors.border,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ],
        ),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({
    required this.ticket,
    required this.event,
    required this.zone,
    this.onAssign,
    required this.onTransfer,
  });

  final TicketModel ticket;
  final EventModel event;
  final ZoneModel zone;

  /// No nulo solo cuando la orden emitió más de un boleto (Fase E).
  final Future<void> Function(String name)? onAssign;
  final Future<void> Function(String toEmail) onTransfer;

  Future<void> _openAssignDialog(BuildContext context) async {
    final controller = TextEditingController(text: ticket.assignedToName ?? '');
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Asignar a un amigo'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'Nombre'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (name != null && name.isNotEmpty && onAssign != null) {
      await onAssign!(name);
    }
  }

  Future<void> _openTransferDialog(BuildContext context) async {
    final controller = TextEditingController();
    final email = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Transferir boleto'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'El destinatario debe tener cuenta en Event Hub. Esta acción no se puede deshacer.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                hintText: 'Email del destinatario',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Transferir'),
          ),
        ],
      ),
    );
    if (email != null && email.isNotEmpty) {
      await onTransfer(email);
    }
  }

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
          // Glow morado en vez de sombra negra — sobre un fondo casi negro
          // una sombra oscura no se ve; el glow de acento es el mismo
          // lenguaje "premium" que PressableButton.
          boxShadow: [
            BoxShadow(
              color: AppColors.accent.withValues(alpha: 0.18),
              blurRadius: 32,
              offset: const Offset(0, 12),
            ),
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
                  Text(
                    event.title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    event.venue,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _capitalize(dateFormat.format(event.startsAt)),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Text(
                        zone.name,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const Spacer(),
                      Text(
                        '\$${zone.price.toStringAsFixed(0)}',
                        style: const TextStyle(
                          color: AppColors.accent,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  if (onAssign != null) ...[
                    const SizedBox(height: 12),
                    GestureDetector(
                      onTap: () => _openAssignDialog(context),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.person_outline_rounded,
                            size: 16,
                            color: AppColors.inkSoft,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              ticket.assignedToName == null
                                  ? 'Asignar a un amigo'
                                  : 'Para: ${ticket.assignedToName}',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: ticket.assignedToName == null
                                        ? AppColors.inkSoft
                                        : AppColors.accent,
                                    fontWeight: ticket.assignedToName == null
                                        ? FontWeight.w400
                                        : FontWeight.w600,
                                  ),
                            ),
                          ),
                          const Icon(
                            Icons.edit_outlined,
                            size: 14,
                            color: AppColors.inkSoft,
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            CustomPaint(
              painter: _DashedLinePainter(),
              size: const Size(double.infinity, 1),
            ),
            Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                children: [
                  Opacity(
                    opacity: used ? 0.25 : 1,
                    child: QrImageView(
                      data: ticket.qrToken,
                      size: 200,
                      // Blanco y negro fijos, SIN importar el tema de la
                      // app — un molinete escaneando necesita el contraste
                      // estándar; con `AppColors.ink` (ahora claro, tras el
                      // rediseño oscuro) el QR habría quedado invisible.
                      backgroundColor: Colors.white,
                      eyeStyle: const QrEyeStyle(
                        eyeShape: QrEyeShape.square,
                        color: Colors.black,
                      ),
                      dataModuleStyle: const QrDataModuleStyle(
                        dataModuleShape: QrDataModuleShape.square,
                        color: Colors.black,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (used)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        'Ya utilizado',
                        style: TextStyle(
                          color: AppColors.inkSoft,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    )
                  else ...[
                    Text(
                      'Presenta este código en el acceso',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 12),
                    TextButton.icon(
                      onPressed: () => _openTransferDialog(context),
                      icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                      label: const Text('Transferir a otra persona'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _capitalize(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

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
