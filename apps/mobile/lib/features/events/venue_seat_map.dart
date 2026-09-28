import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../checkout/seat_picker_screen.dart';
import '../tickets/tickets_repository.dart';
import 'event_models.dart';

/// Misma paleta fija por índice que el editor del admin panel (ver
/// SECTION_COLORS en VenueMapPreview.tsx) — no es la misma paleta exacta
/// (RGB values distintos por conveniencia de contraste en cada UI), pero
/// el CRITERIO es el mismo: color estable por posición, no por dato.
const _sectionColors = [
  AppColors.accent,
  AppColors.success,
  AppColors.warning,
  AppColors.error,
];

Color _colorFor(int index) => _sectionColors[index % _sectionColors.length];

/// Mapa visual del establecimiento — el comprador toca una sección
/// coloreada sobre el plano del venue (en vez de elegir de una lista de
/// texto) para seleccionar la zona correspondiente. Es la versión "mapa
/// 2D con look de plano real" (CustomPaint sobre la imagen subida), no un
/// motor 3D — así funcionan en la práctica los mapas de asientos de
/// plataformas reales (Ticketmaster, etc.).
///
/// Interacción (pedido explícito del usuario tras ver un mapa de venue
/// real, tipo Daviarena): zoom/pan con los dedos, resaltado inmediato al
/// mantener presionado, y una vista previa (nombre + precio) antes de
/// saltar al checkout — no una navegación directa al tocar.
class VenueSeatMap extends StatefulWidget {
  const VenueSeatMap({
    super.key,
    required this.event,
    required this.venueMap,
    required this.zones,
    required this.onConfirmBuy,
  });

  final EventModel event;
  final VenueMapModel venueMap;
  final List<ZoneModel> zones;

  /// Se llama recién cuando el comprador confirma en la vista previa, no
  /// al primer toque — ver el bottom sheet en `_showZonePreview`.
  final ValueChanged<ZoneModel> onConfirmBuy;

  @override
  State<VenueSeatMap> createState() => _VenueSeatMapState();
}

class _VenueSeatMapState extends State<VenueSeatMap> {
  String? _pressedSectionId;

  ZoneModel? _zoneForSection(String sectionId) {
    for (final zone in widget.zones) {
      if (zone.venueSectionId == sectionId) return zone;
    }
    return null;
  }

  VenueSectionModel? _sectionAt(Offset localPosition, Size size) {
    for (final section in widget.venueMap.sections) {
      if (_zoneForSection(section.id) == null) continue; // sin zona vendible — no clickeable
      if (_sectionPath(section, size).contains(localPosition)) return section;
    }
    return null;
  }

  /// Fase 2 (asiento individual): si la zona tiene butacas generadas, el
  /// "preview" real es elegir asiento, no confirmar la zona entera — se
  /// salta la tarjeta de precio y se va directo al selector de butacas.
  /// Best-effort: si la consulta falla, se cae al flujo por zona de
  /// siempre en vez de bloquear la compra por un error de red.
  Future<void> _handleSectionTap(ZoneModel zone) async {
    var seats = const <SeatModel>[];
    try {
      seats = await context.read<TicketsRepository>().seatsForZone(zone.id);
    } catch (_) {
      // best-effort — ver docstring
    }
    if (!mounted) return;
    if (seats.isNotEmpty) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => SeatPickerScreen(event: widget.event, zone: zone, seats: seats)),
      );
      return;
    }
    _showZonePreview(zone);
  }

  void _showZonePreview(ZoneModel zone) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(zone.name, style: Theme.of(sheetContext).textTheme.headlineMedium),
                const SizedBox(height: 6),
                Text(
                  '\$${zone.price.toStringAsFixed(0)}',
                  style: Theme.of(sheetContext).textTheme.bodyLarge?.copyWith(color: AppColors.accentBright),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      widget.onConfirmBuy(zone);
                    },
                    child: const Text('Comprar boletos de esta zona'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: InteractiveViewer(
              minScale: 1,
              maxScale: 4,
              boundaryMargin: const EdgeInsets.all(40),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(widget.venueMap.mapImageUrl, fit: BoxFit.cover),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final size = Size(constraints.maxWidth, constraints.maxHeight);
                      return GestureDetector(
                        onTapDown: (details) {
                          final section = _sectionAt(details.localPosition, size);
                          if (section != null) setState(() => _pressedSectionId = section.id);
                        },
                        onTapCancel: () => setState(() => _pressedSectionId = null),
                        onTapUp: (details) {
                          final section = _sectionAt(details.localPosition, size);
                          setState(() => _pressedSectionId = null);
                          if (section == null) return;
                          final zone = _zoneForSection(section.id);
                          if (zone != null) _handleSectionTap(zone);
                        },
                        child: CustomPaint(
                          painter: _SeatMapPainter(
                            venueMap: widget.venueMap,
                            zones: widget.zones,
                            pressedSectionId: _pressedSectionId,
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _VenueSeatMapLegend(venueMap: widget.venueMap, zones: widget.zones),
      ],
    );
  }
}

Path _sectionPath(VenueSectionModel section, Size size) {
  final path = Path();
  for (var i = 0; i < section.points.length; i++) {
    final p = Offset(section.points[i].dx * size.width, section.points[i].dy * size.height);
    if (i == 0) {
      path.moveTo(p.dx, p.dy);
    } else {
      path.lineTo(p.dx, p.dy);
    }
  }
  path.close();
  return path;
}

class _SeatMapPainter extends CustomPainter {
  _SeatMapPainter({required this.venueMap, required this.zones, required this.pressedSectionId});

  final VenueMapModel venueMap;
  final List<ZoneModel> zones;
  final String? pressedSectionId;

  ZoneModel? _zoneForSection(String sectionId) {
    for (final zone in zones) {
      if (zone.venueSectionId == sectionId) return zone;
    }
    return null;
  }

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < venueMap.sections.length; i++) {
      final section = venueMap.sections[i];
      final zone = _zoneForSection(section.id);
      final color = _colorFor(i);
      final path = _sectionPath(section, size);
      final isPressed = section.id == pressedSectionId;
      final isSellable = zone != null;

      final fillPaint = Paint()
        ..color = color.withValues(alpha: isPressed ? 0.85 : (isSellable ? 0.35 : 0.12))
        ..style = PaintingStyle.fill;
      canvas.drawPath(path, fillPaint);

      final strokePaint = Paint()
        ..color = isPressed ? Colors.white : color
        ..style = PaintingStyle.stroke
        ..strokeWidth = isPressed ? 2.5 : 1.2;
      canvas.drawPath(path, strokePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _SeatMapPainter oldDelegate) =>
      oldDelegate.pressedSectionId != pressedSectionId || oldDelegate.venueMap != venueMap;
}

/// Qué color corresponde a qué zona/precio — sin esto, el color de una
/// sección es puramente decorativo y el comprador no sabe qué representa
/// cada una antes de tocarla.
class _VenueSeatMapLegend extends StatelessWidget {
  const _VenueSeatMapLegend({required this.venueMap, required this.zones});

  final VenueMapModel venueMap;
  final List<ZoneModel> zones;

  ZoneModel? _zoneForSection(String sectionId) {
    for (final zone in zones) {
      if (zone.venueSectionId == sectionId) return zone;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final entries = <Widget>[];
    for (var i = 0; i < venueMap.sections.length; i++) {
      final zone = _zoneForSection(venueMap.sections[i].id);
      if (zone == null) continue;
      entries.add(
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: _colorFor(i), shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              '${zone.name} · \$${zone.price.toStringAsFixed(0)}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.inkSoft),
            ),
          ],
        ),
      );
    }
    if (entries.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 16, runSpacing: 6, children: entries);
  }
}
