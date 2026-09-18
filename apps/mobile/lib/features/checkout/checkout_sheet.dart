import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';
import '../events/event_models.dart';
import '../tickets/ticket_models.dart';
import '../tickets/tickets_repository.dart';
import 'orders_repository.dart';

enum _Status { idle, payingOrder, waitingTickets, error }

/// Tope de boletos por orden — debe coincidir con el `@Max(10)` de
/// CreateOrderDto en orders-service; UI y backend validan lo mismo por
/// separado a propósito (la UI nunca es la única barrera).
const _maxQuantityPerOrder = 10;

/// Sheet de confirmación de compra. Se cierra con `Navigator.pop(tickets)`
/// cuando la compra + emisión de TODOS los boletos termina bien (Fase A:
/// varios boletos por orden) — quien lo abrió (event_detail_screen)
/// decide qué hacer con el resultado. Esto evita depender del context del
/// sheet, que deja de existir una vez cerrado.
class CheckoutSheet extends StatefulWidget {
  const CheckoutSheet({super.key, required this.event, required this.zone});

  final EventModel event;
  final ZoneModel zone;

  @override
  State<CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<CheckoutSheet> {
  _Status _status = _Status.idle;
  String? _error;
  int _quantity = 1;

  int get _maxQuantity {
    final capacityCap = widget.zone.capacity.clamp(1, _maxQuantityPerOrder);
    return capacityCap;
  }

  Future<void> _buy() async {
    setState(() {
      _status = _Status.payingOrder;
      _error = null;
    });
    final ordersRepository = context.read<OrdersRepository>();
    final ticketsRepository = context.read<TicketsRepository>();
    try {
      final order = await ordersRepository.checkout(widget.zone.id, _quantity);
      if (!mounted) return;
      setState(() => _status = _Status.waitingTickets);
      final tickets = await ticketsRepository.pollForTickets(order.id, _quantity);
      if (!mounted) return;
      Navigator.of(context).pop(tickets);
    } on CheckoutException catch (e) {
      if (!mounted) return;
      setState(() {
        _status = _Status.error;
        _error = e.message;
      });
    } on TicketNotReadyException catch (e) {
      if (!mounted) return;
      setState(() {
        _status = _Status.error;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = _status == _Status.payingOrder || _status == _Status.waitingTickets;
    final total = widget.zone.price * _quantity;
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
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 20),
          Text(widget.zone.name, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(widget.event.title, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 20),
          Row(
            children: [
              Text('Cantidad', style: Theme.of(context).textTheme.bodyLarge),
              const Spacer(),
              _QuantityStepper(
                value: _quantity,
                max: _maxQuantity,
                onChanged: busy ? null : (v) => setState(() => _quantity = v),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text('Total', style: Theme.of(context).textTheme.bodyLarge),
              const Spacer(),
              Text(
                '\$${total.toStringAsFixed(0)}',
                style: const TextStyle(color: AppColors.accent, fontSize: 24, fontWeight: FontWeight.w700),
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
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
                ),
                const SizedBox(width: 12),
                Text(
                  _status == _Status.payingOrder
                      ? 'Procesando pago…'
                      : _quantity > 1
                          ? 'Emitiendo tus boletos…'
                          : 'Emitiendo tu boleto…',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: AppColors.error)),
          ],
          const SizedBox(height: 24),
          PressableButton(
            onPressed: busy ? null : _buy,
            loading: busy,
            child: Text(_status == _Status.error ? 'Reintentar' : 'Comprar'),
          ),
        ],
      ),
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({required this.value, required this.max, required this.onChanged});

  final int value;
  final int max;
  final void Function(int)? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _StepperButton(icon: Icons.remove_rounded, onTap: value > 1 && onChanged != null ? () => onChanged!(value - 1) : null),
        SizedBox(
          width: 32,
          child: Text('$value', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        ),
        _StepperButton(icon: Icons.add_rounded, onTap: value < max && onChanged != null ? () => onChanged!(value + 1) : null),
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
        child: Icon(icon, size: 18, color: enabled ? AppColors.accent : AppColors.inkSoft),
      ),
    );
  }
}

Future<List<TicketModel>?> showCheckoutSheet(
  BuildContext context, {
  required EventModel event,
  required ZoneModel zone,
}) {
  return showModalBottomSheet<List<TicketModel>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) => CheckoutSheet(event: event, zone: zone),
  );
}
