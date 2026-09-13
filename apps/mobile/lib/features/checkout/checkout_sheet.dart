import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';
import '../events/event_models.dart';
import '../tickets/ticket_models.dart';
import '../tickets/tickets_repository.dart';
import 'orders_repository.dart';

enum _Status { idle, payingOrder, waitingTicket, error }

/// Sheet de confirmación de compra. Se cierra con `Navigator.pop(ticket)`
/// cuando la compra + emisión del boleto termina bien — quien lo abrió
/// (event_detail_screen) decide qué hacer con el resultado (navegar al
/// boleto). Esto evita depender del context del sheet, que deja de existir
/// una vez cerrado.
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

  Future<void> _buy() async {
    setState(() {
      _status = _Status.payingOrder;
      _error = null;
    });
    final ordersRepository = context.read<OrdersRepository>();
    final ticketsRepository = context.read<TicketsRepository>();
    try {
      final order = await ordersRepository.checkout(widget.zone.id);
      if (!mounted) return;
      setState(() => _status = _Status.waitingTicket);
      final ticket = await ticketsRepository.pollForTicket(order.id);
      if (!mounted) return;
      Navigator.of(context).pop(ticket);
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
    final busy = _status == _Status.payingOrder || _status == _Status.waitingTicket;
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
              Text('Total', style: Theme.of(context).textTheme.bodyLarge),
              const Spacer(),
              Text(
                '\$${widget.zone.price.toStringAsFixed(0)}',
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
                  _status == _Status.payingOrder ? 'Procesando pago…' : 'Emitiendo tu boleto…',
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

Future<TicketModel?> showCheckoutSheet(BuildContext context, {required EventModel event, required ZoneModel zone}) {
  return showModalBottomSheet<TicketModel>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) => CheckoutSheet(event: event, zone: zone),
  );
}
