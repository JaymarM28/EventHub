import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
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

/// Mapa visual del establecimiento — el comprador toca una sección
/// coloreada sobre el plano del venue (en vez de elegir de una lista de
/// texto) para seleccionar la zona correspondiente. Pedido explícito del
/// usuario ("manejo tipo 3D para seleccionar el asiento", ver el mapa de
/// referencia de un arena) — esto es la versión "mapa 2D con look de
/// plano real", no un motor 3D: así es como funcionan en la práctica los
/// mapas de asientos de plataformas reales (Ticketmaster, etc.), y evita
/// meter un motor de renderizado 3D para un catálogo de zonas, no de
/// asientos individuales (ver DESIGN.md, fase G).
class VenueSeatMap extends StatelessWidget {
  const VenueSeatMap({
    super.key,
    required this.venueMap,
    required this.zones,
    required this.selectedZoneId,
    required this.onSectionTap,
  });

  final VenueMapModel venueMap;
  final List<ZoneModel> zones;
  final String? selectedZoneId;
  final ValueChanged<String> onSectionTap;

  ZoneModel? _zoneForSection(String sectionId) {
    for (final zone in zones) {
      if (zone.venueSectionId == sectionId) return zone;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(venueMap.mapImageUrl, fit: BoxFit.cover),
            LayoutBuilder(
              builder: (context, constraints) {
                return GestureDetector(
                  onTapUp: (details) {
                    final size = Size(constraints.maxWidth, constraints.maxHeight);
                    for (final section in venueMap.sections) {
                      final zone = _zoneForSection(section.id);
                      if (zone == null) continue; // sección sin zona vendible — no clickeable
                      final path = _sectionPath(section, size);
                      if (path.contains(details.localPosition)) {
                        onSectionTap(zone.id);
                        return;
                      }
                    }
                  },
                  child: CustomPaint(
                    painter: _SeatMapPainter(
                      venueMap: venueMap,
                      zones: zones,
                      selectedZoneId: selectedZoneId,
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
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
  _SeatMapPainter({required this.venueMap, required this.zones, required this.selectedZoneId});

  final VenueMapModel venueMap;
  final List<ZoneModel> zones;
  final String? selectedZoneId;

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
      final color = _sectionColors[i % _sectionColors.length];
      final path = _sectionPath(section, size);
      final isSelected = zone != null && zone.id == selectedZoneId;
      final isSellable = zone != null;

      final fillPaint = Paint()
        ..color = color.withValues(alpha: isSelected ? 0.7 : (isSellable ? 0.35 : 0.12))
        ..style = PaintingStyle.fill;
      canvas.drawPath(path, fillPaint);

      final strokePaint = Paint()
        ..color = isSelected ? Colors.white : color
        ..style = PaintingStyle.stroke
        ..strokeWidth = isSelected ? 2.5 : 1.2;
      canvas.drawPath(path, strokePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _SeatMapPainter oldDelegate) =>
      oldDelegate.selectedZoneId != selectedZoneId || oldDelegate.venueMap != venueMap;
}
