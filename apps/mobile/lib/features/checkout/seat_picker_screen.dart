import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../events/event_models.dart';
import 'checkout_sheet.dart';

/// Tope de boletos por orden — mismo valor que `_maxQuantityPerOrder` en
/// checkout_sheet.dart (debe coincidir con el `@Max(10)` de
/// CreateOrderDto/CreateReservationDto en el backend).
const _maxSeatsPerOrder = 10;

/// Fase 2 (asiento individual): grilla de butacas de una zona — el
/// comprador elige asientos puntuales en vez de solo una cantidad. La
/// disponibilidad (qué butaca ya está vendida) ya viene resuelta por
/// tickets-service (ver VenueSeatMap._handleSectionTap), esta pantalla
/// solo la pinta y deja elegir.
class SeatPickerScreen extends StatefulWidget {
  const SeatPickerScreen({
    super.key,
    required this.event,
    required this.zone,
    required this.seats,
  });

  final EventModel event;
  final ZoneModel zone;
  final List<SeatModel> seats;

  @override
  State<SeatPickerScreen> createState() => _SeatPickerScreenState();
}

class _SeatPickerScreenState extends State<SeatPickerScreen> {
  final Set<String> _selected = {};

  Map<String, List<SeatModel>> get _byRow {
    final map = <String, List<SeatModel>>{};
    for (final seat in widget.seats) {
      map.putIfAbsent(seat.rowLabel, () => []).add(seat);
    }
    for (final row in map.values) {
      row.sort((a, b) => a.seatNumber.compareTo(b.seatNumber));
    }
    return map;
  }

  void _toggle(SeatModel seat) {
    if (seat.sold) return;
    setState(() {
      if (_selected.contains(seat.id)) {
        _selected.remove(seat.id);
      } else if (_selected.length < _maxSeatsPerOrder) {
        _selected.add(seat.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final rows = _byRow.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
    final total = widget.zone.price * _selected.length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text(widget.zone.name),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Row(
                children: [
                  _Legend(color: AppColors.accentSoft, label: 'Libre'),
                  const SizedBox(width: 16),
                  _Legend(color: AppColors.accent, label: 'Elegida'),
                  const SizedBox(width: 16),
                  _Legend(color: AppColors.border, label: 'Vendida'),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                children: [
                  for (final entry in rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 28,
                            child: Text(
                              entry.key,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: entry.value.map((seat) => _SeatBox(
                                seat: seat,
                                selected: _selected.contains(seat.id),
                                onTap: () => _toggle(seat),
                              )).toList(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Text(
                          _selected.isEmpty
                              ? 'Elegí hasta $_maxSeatsPerOrder butacas'
                              : '${_selected.length} butaca${_selected.length == 1 ? '' : 's'}',
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                        const Spacer(),
                        Text(
                          '\$${total.toStringAsFixed(0)}',
                          style: const TextStyle(
                            color: AppColors.accent,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _selected.isEmpty
                          ? null
                          : () => buyZone(
                                context,
                                event: widget.event,
                                zone: widget.zone,
                                seatIds: _selected.toList(),
                              ),
                      child: const Text('Comprar'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
        ),
        const SizedBox(width: 6),
        Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.inkSoft)),
      ],
    );
  }
}

class _SeatBox extends StatelessWidget {
  const _SeatBox({required this.seat, required this.selected, required this.onTap});

  final SeatModel seat;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = seat.sold
        ? AppColors.border
        : selected
            ? AppColors.accent
            : AppColors.accentSoft;
    return GestureDetector(
      onTap: seat.sold ? null : onTap,
      child: Container(
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
        child: Text(
          '${seat.seatNumber}',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: seat.sold ? AppColors.inkSoft : (selected ? Colors.white : AppColors.accent),
          ),
        ),
      ),
    );
  }
}
