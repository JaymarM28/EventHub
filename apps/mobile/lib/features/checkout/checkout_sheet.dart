import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/nav_return.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';
import '../events/event_models.dart';
import '../tickets/ticket_models.dart';
import '../tickets/ticket_screen.dart';
import '../tickets/tickets_repository.dart';
import 'orders_repository.dart';
import 'payment_webview_screen.dart';
import 'waitlist_repository.dart';

enum _Status { idle, creatingOrder, awaitingPayment, waitingTickets, error }

/// Tope de boletos por orden — debe coincidir con el `@Max(10)` de
/// CreateOrderDto en orders-service; UI y backend validan lo mismo por
/// separado a propósito (la UI nunca es la única barrera).
const _maxQuantityPerOrder = 10;

/// #24 (modelo de negocio) — SOLO para mostrar un estimado antes de
/// comprar; debe reflejar el mismo valor que `SERVICE_FEE_RATE` en
/// orders-service, pero el monto real cobrado lo calcula el backend
/// (`OrdersService.checkout`), nunca este valor. Mismo criterio que el
/// "Total" de acá abajo ya tenía antes de este cambio: es una vista previa,
/// no descuenta el código promocional tampoco (eso también se resuelve
/// recién en el backend).
const _serviceFeeRateEstimate = 0.10;

/// Sheet de confirmación de compra. Se cierra con `Navigator.pop(tickets)`
/// cuando la compra + emisión de TODOS los boletos termina bien (Fase A:
/// varios boletos por orden) — quien lo abrió (event_detail_screen)
/// decide qué hacer con el resultado. Esto evita depender del context del
/// sheet, que deja de existir una vez cerrado.
class CheckoutSheet extends StatefulWidget {
  const CheckoutSheet({super.key, required this.event, required this.zone, this.seatIds});

  final EventModel event;
  final ZoneModel zone;

  /// Fase 2 (asiento individual) — presente cuando el comprador ya eligió
  /// butacas puntuales en el mapa (SeatPickerScreen), no una cantidad
  /// contra el cupo de la zona. Con esto, la cantidad queda fija (no hay
  /// stepper) y el checkout manda `seatIds` en vez de `quantity`.
  final List<String>? seatIds;

  @override
  State<CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<CheckoutSheet> {
  _Status _status = _Status.idle;
  String? _error;
  // #11 (2026-09-30) — cuando el error es "zona agotada", se ofrece
  // anotarse a la lista de espera en vez de un simple "Reintentar" que
  // siempre va a fallar igual mientras la zona siga sin cupo.
  bool _soldOut = false;
  bool _joiningWaitlist = false;
  late int _quantity = widget.seatIds?.length ?? 1;
  final _discountCodeController = TextEditingController();

  @override
  void dispose() {
    _discountCodeController.dispose();
    super.dispose();
  }

  int get _maxQuantity {
    final capacityCap = widget.zone.capacity.clamp(1, _maxQuantityPerOrder);
    return capacityCap;
  }

  /// Fase D (#20): checkout ya no paga sincrónicamente — crea la orden y
  /// la URL de checkout de Wompi, y hay que abrir su WebView para que
  /// el comprador complete el pago ahí. Recién después de eso (y de que
  /// el webhook confirme el pago, de forma asíncrona) aparece el boleto.
  Future<void> _buy() async {
    setState(() {
      _status = _Status.creatingOrder;
      _error = null;
      _soldOut = false;
    });
    final ordersRepository = context.read<OrdersRepository>();
    final ticketsRepository = context.read<TicketsRepository>();
    try {
      final order = await ordersRepository.checkout(
        zoneId: widget.zone.id,
        quantity: widget.seatIds == null ? _quantity : null,
        seatIds: widget.seatIds,
        discountCode: _discountCodeController.text.trim(),
      );
      if (order.checkoutUrl == null) {
        throw CheckoutException('El servidor no devolvió un link de pago');
      }
      if (!mounted) return;

      setState(() => _status = _Status.awaitingPayment);
      final outcome = await Navigator.of(context).push<PaymentOutcome>(
        MaterialPageRoute(
          builder: (_) => PaymentWebViewScreen(checkoutUrl: order.checkoutUrl!),
        ),
      );
      if (!mounted) return;

      if (outcome == null ||
          outcome == PaymentOutcome.cancelled ||
          outcome == PaymentOutcome.failure) {
        setState(() {
          _status = _Status.error;
          _error = outcome == PaymentOutcome.failure
              ? 'El pago no se completó'
              : 'Cancelaste el pago';
        });
        return;
      }

      if (outcome == PaymentOutcome.pending) {
        // Métodos como PSE/transferencia no confirman al instante — a
        // diferencia de una tarjeta aprobada, acá NO hay boleto para
        // esperar todavía (recién lo emite el webhook cuando el banco
        // confirme, puede tardar minutos u horas). Pollear tickets acá
        // terminaría igual que el bug que reportó el usuario: un timeout
        // que suena a error aunque el pago vaya a confirmarse bien.
        if (!mounted) return;
        setState(() {
          _status = _Status.error;
          _error = 'Tu pago está en revisión. Te vamos a avisar cuando se confirme — revisá "Mis boletos" en un rato.';
        });
        return;
      }

      setState(() => _status = _Status.waitingTickets);
      // Más margen que antes (Fase A usaba 15s) — ahora hay un salto real
      // por Wompi + su webhook de eventos de por medio, no solo el consumo de
      // RabbitMQ interno.
      final tickets = await ticketsRepository.pollForTickets(
        order.id,
        _quantity,
        timeout: const Duration(seconds: 40),
      );
      if (!mounted) return;
      Navigator.of(context).pop(tickets);
    } on CheckoutException catch (e) {
      if (!mounted) return;
      setState(() {
        _status = _Status.error;
        _error = e.message;
        // Backend: "Zona agotada" / "Zona agotada (reservas activas en
        // curso)" (ReservationsService.reserve) — ambas significan "no hay
        // cupo ahora mismo", el único caso donde la lista de espera aplica.
        _soldOut = e.message.contains('agotada');
      });
    } on TicketNotReadyException catch (e) {
      if (!mounted) return;
      setState(() {
        _status = _Status.error;
        _error = e.toString();
      });
    }
  }

  /// #11 — anota al comprador y cierra el sheet (no hay nada más que hacer
  /// acá: el aviso de "se liberó un cupo" llega después, por notificación,
  /// cuando a alguien le toque el turno — ver WaitlistService en el backend).
  Future<void> _joinWaitlist() async {
    setState(() => _joiningWaitlist = true);
    try {
      await context.read<WaitlistRepository>().join(widget.zone.id);
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Te anotamos en la lista de espera — te avisamos si se libera un cupo'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _joiningWaitlist = false;
        _error = 'No se pudo anotar en la lista de espera — intentá de nuevo';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy =
        _status == _Status.creatingOrder ||
        _status == _Status.awaitingPayment ||
        _status == _Status.waitingTickets;
    final subtotal = widget.zone.price * _quantity;
    final serviceFeeEstimate = subtotal * _serviceFeeRateEstimate;
    final totalEstimate = subtotal + serviceFeeEstimate;
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            widget.zone.name,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 4),
          Text(
            widget.event.title,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Text(
                widget.seatIds != null ? 'Butacas seleccionadas' : 'Cantidad',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const Spacer(),
              if (widget.seatIds != null)
                Text('$_quantity', style: Theme.of(context).textTheme.titleLarge)
              else
                _QuantityStepper(
                  value: _quantity,
                  max: _maxQuantity,
                  onChanged: busy ? null : (v) => setState(() => _quantity = v),
                ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _discountCodeController,
            enabled: !busy,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              hintText: 'Código de descuento (opcional)',
              prefixIcon: Icon(Icons.sell_outlined, size: 20),
              isDense: true,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text('Subtotal', style: Theme.of(context).textTheme.bodyMedium),
              const Spacer(),
              Text(
                '\$${subtotal.toStringAsFixed(0)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                'Cargo por servicio',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppColors.inkSoft),
              ),
              const Spacer(),
              Text(
                '\$${serviceFeeEstimate.toStringAsFixed(0)}',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppColors.inkSoft),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text('Total', style: Theme.of(context).textTheme.bodyLarge),
              const Spacer(),
              Text(
                '\$${totalEstimate.toStringAsFixed(0)}',
                style: const TextStyle(
                  color: AppColors.accent,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          if (busy) ...[
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.accent,
                  ),
                ),
                const SizedBox(width: 12),
                Text(switch (_status) {
                  _Status.creatingOrder => 'Preparando el pago…',
                  _Status.awaitingPayment => 'Esperando el pago…',
                  _ =>
                    _quantity > 1
                        ? 'Emitiendo tus boletos…'
                        : 'Emitiendo tu boleto…',
                }, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: AppColors.error)),
          ],
          const SizedBox(height: 24),
          PressableButton(
            onPressed: busy || _joiningWaitlist
                ? null
                : (_soldOut ? _joinWaitlist : _buy),
            loading: busy || _joiningWaitlist,
            child: Text(
              _soldOut
                  ? 'Unirme a la lista de espera'
                  : (_status == _Status.error ? 'Reintentar' : 'Comprar'),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({
    required this.value,
    required this.max,
    required this.onChanged,
  });

  final int value;
  final int max;
  final void Function(int)? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _StepperButton(
          icon: Icons.remove_rounded,
          onTap: value > 1 && onChanged != null
              ? () => onChanged!(value - 1)
              : null,
        ),
        SizedBox(
          width: 32,
          child: Text(
            '$value',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ),
        _StepperButton(
          icon: Icons.add_rounded,
          onTap: value < max && onChanged != null
              ? () => onChanged!(value + 1)
              : null,
        ),
      ],
    );
  }
}

class _StepperButton extends StatelessWidget {
  const _StepperButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: enabled ? AppColors.accentSoft : AppColors.border,
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Icon(
          icon,
          size: 18,
          color: enabled ? AppColors.accent : AppColors.inkSoft,
        ),
      ),
    );
  }
}

Future<List<TicketModel>?> showCheckoutSheet(
  BuildContext context, {
  required EventModel event,
  required ZoneModel zone,
  List<String>? seatIds,
}) {
  return showModalBottomSheet<List<TicketModel>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) => CheckoutSheet(event: event, zone: zone, seatIds: seatIds),
  );
}

/// Flujo completo de "comprar esta zona/estas butacas": chequeo de sesión
/// → sheet de checkout → pantalla del boleto. Compartido entre
/// EventDetailScreen (zona, sin seatIds) y SeatPickerScreen (Fase 2,
/// butacas puntuales) para no duplicar el chequeo de login ni la
/// navegación al boleto emitido.
Future<void> buyZone(
  BuildContext context, {
  required EventModel event,
  required ZoneModel zone,
  List<String>? seatIds,
}) async {
  if (context.read<AuthState>().status != AuthStatus.authenticated) {
    final from = GoRouterState.of(context).uri.toString();
    context.push(withFromParam('/login', from));
    return;
  }
  final tickets = await showCheckoutSheet(context, event: event, zone: zone, seatIds: seatIds);
  if (tickets != null && context.mounted) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => TicketScreen(tickets: tickets, event: event, zone: zone)),
    );
  }
}
