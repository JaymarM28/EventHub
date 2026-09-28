import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/skeleton.dart';
import '../checkout/checkout_sheet.dart';
import '../tickets/ticket_screen.dart';
import 'event_list_screen.dart' show categoryIcon;
import 'event_models.dart';
import 'favorite_button.dart';
import 'events_repository.dart';
import 'venue_seat_map.dart';

class EventDetailScreen extends StatefulWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  State<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends State<EventDetailScreen> {
  late Future<EventModel> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<EventsRepository>().findOne(widget.eventId);
  }

  Future<void> _onZoneTap(
    BuildContext context,
    EventModel event,
    ZoneModel zone,
  ) async {
    if (context.read<AuthState>().status != AuthStatus.authenticated) {
      context.push('/login');
      return;
    }
    final tickets = await showCheckoutSheet(context, event: event, zone: zone);
    if (tickets != null && context.mounted) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              TicketScreen(tickets: tickets, event: event, zone: zone),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: FutureBuilder<EventModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const _EventDetailSkeleton();
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(
              child: Text(
                'No se pudo cargar el evento',
                style: TextStyle(color: AppColors.inkSoft),
              ),
            );
          }
          final event = snapshot.data!;
          final dateFormat = DateFormat('EEEE d MMMM yyyy', 'es');
          final timeFormat = DateFormat('HH:mm', 'es');
          final cheapestPrice = event.zones.isEmpty
              ? null
              : event.zones.map((z) => z.price).reduce((a, b) => a < b ? a : b);

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                backgroundColor: AppColors.background,
                surfaceTintColor: Colors.transparent,
                elevation: 0,
                expandedHeight: 240,
                stretch: true,
                actions: [
                  Padding(
                    padding: const EdgeInsets.only(right: 12, top: 4),
                    child: FavoriteButton(eventId: event.id, dark: true),
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Hero(
                    tag: 'event-${event.id}',
                    child: Container(
                      decoration: const BoxDecoration(
                        gradient: AppGradients.accent,
                      ),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (event.coverImageUrl != null)
                            Image.network(
                              event.coverImageUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) =>
                                  const SizedBox(),
                            )
                          else
                            Opacity(
                              opacity: 0.18,
                              child: Icon(
                                categoryIcon(event.category),
                                size: 180,
                                color: Colors.white,
                              ),
                            ),
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.transparent,
                                    AppColors.background.withValues(
                                      alpha: 0.55,
                                    ),
                                  ],
                                  stops: const [0.4, 1.0],
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            left: 20,
                            right: 20,
                            bottom: 16,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.25),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    (event.category ?? EventCategory.otro).label
                                        .toUpperCase(),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.6,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  event.title,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        color: Colors.white,
                                        fontSize: 22,
                                      ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _InfoRow(
                            icon: Icons.place_outlined,
                            text: event.city != null
                                ? '${event.venue}, ${event.city}'
                                : event.venue,
                          ),
                          const SizedBox(height: 12),
                          _InfoRow(
                            icon: Icons.event_outlined,
                            text:
                                '${_capitalize(dateFormat.format(event.startsAt))} · ${timeFormat.format(event.startsAt)} h',
                          ),
                          if (cheapestPrice != null) ...[
                            const SizedBox(height: 12),
                            _InfoRow(
                              icon: Icons.sell_outlined,
                              text:
                                  'Desde \$${cheapestPrice.toStringAsFixed(0)}',
                              accentText: true,
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (event.description != null) ...[
                      const SizedBox(height: 24),
                      Text(
                        'Acerca del evento',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        event.description!,
                        style: Theme.of(context).textTheme.bodyLarge
                            ?.copyWith(color: AppColors.inkSoft, height: 1.5),
                      ),
                    ],
                    if (event.galleryImageUrls.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      Text(
                        'Galería',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 10),
                      _EventGallery(imageUrls: event.galleryImageUrls),
                    ],
                    if (event.latitude != null && event.longitude != null) ...[
                      const SizedBox(height: 24),
                      Text(
                        'Ubicación',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 10),
                      _EventMap(
                        latitude: event.latitude!,
                        longitude: event.longitude!,
                        label: event.venue,
                        address: event.address,
                      ),
                    ],
                    const SizedBox(height: 28),
                    Text(
                      'Zonas',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 12),
                    if (event.venueMap != null) ...[
                      Text(
                        'Tocá una sección del mapa para elegir dónde sentarte',
                        style: Theme.of(context).textTheme.bodyMedium
                            ?.copyWith(color: AppColors.inkSoft),
                      ),
                      const SizedBox(height: 10),
                      VenueSeatMap(
                        venueMap: event.venueMap!,
                        zones: event.zones,
                        onConfirmBuy: (zone) => _onZoneTap(context, event, zone),
                      ),
                      const SizedBox(height: 16),
                    ],
                    ...event.zones.map(
                      (zone) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ZoneTile(
                          zone: zone,
                          onTap: () => _onZoneTap(context, event, zone),
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EventDetailSkeleton extends StatelessWidget {
  const _EventDetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Skeleton(width: double.infinity, height: 180, borderRadius: 22),
            SizedBox(height: 20),
            Skeleton(width: double.infinity, height: 100, borderRadius: 18),
            SizedBox(height: 24),
            Skeleton(width: 140, height: 20),
            SizedBox(height: 10),
            Skeleton(width: double.infinity, height: 60, borderRadius: 16),
            SizedBox(height: 10),
            Skeleton(width: double.infinity, height: 60, borderRadius: 16),
          ],
        ),
      ),
    );
  }
}

/// Mapa embebido (DESIGN.md #18) con tiles de OpenStreetMap — sin API key
/// ni cuenta de facturación (ver GeocodingService en events-service para
/// la misma decisión del lado del backend). Es solo un preview: tocarlo
/// abre la app nativa de mapas del dispositivo para navegación real, este
/// widget nunca intenta ser un mapa interactivo completo.
class _EventMap extends StatelessWidget {
  const _EventMap({
    required this.latitude,
    required this.longitude,
    required this.label,
    this.address,
  });

  final double latitude;
  final double longitude;
  final String label;
  final String? address;

  /// Enlaces universales (https://) en vez de esquemas custom
  /// (`comgooglemaps://`, `waze://`) — funcionan siempre, con o sin la app
  /// instalada (si no está, el propio navegador/tienda de apps se encarga),
  /// así que no hace falta declarar `LSApplicationQueriesSchemes` en iOS ni
  /// más entradas de `<queries>` en Android para poder detectarlas.
  Future<void> _openWith(_MapApp app) async {
    final uri = switch (app) {
      _MapApp.googleMaps => Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=$latitude,$longitude',
      ),
      _MapApp.waze => Uri.parse(
        'https://waze.com/ul?ll=$latitude,$longitude&navigate=yes',
      ),
      _MapApp.appleMaps => Uri.parse(
        'https://maps.apple.com/?ll=$latitude,$longitude&q=${Uri.encodeComponent(label)}',
      ),
    };
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _showMapPicker(BuildContext context) async {
    final app = await showModalBottomSheet<_MapApp>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              'Abrir ubicación con',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            _MapAppTile(
              icon: Icons.map_rounded,
              label: 'Google Maps',
              onTap: () => Navigator.of(context).pop(_MapApp.googleMaps),
            ),
            const SizedBox(height: 10),
            _MapAppTile(
              icon: Icons.navigation_rounded,
              label: 'Waze',
              onTap: () => Navigator.of(context).pop(_MapApp.waze),
            ),
            const SizedBox(height: 10),
            _MapAppTile(
              icon: Icons.map_outlined,
              label: 'Apple Maps',
              onTap: () => Navigator.of(context).pop(_MapApp.appleMaps),
            ),
          ],
        ),
      ),
    );
    if (app != null) await _openWith(app);
  }

  @override
  Widget build(BuildContext context) {
    final point = LatLng(latitude, longitude);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (address != null) ...[
          _InfoRow(icon: Icons.place_outlined, text: address!),
          const SizedBox(height: 10),
        ],
        GestureDetector(
          onTap: () => _showMapPicker(context),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: SizedBox(
              height: 160,
              child: IgnorePointer(
                // El mapa es un preview no interactivo — el tap entero abre
                // Maps (ver onTap arriba), así que no hace falta (ni conviene)
                // que absorba gestos de pan/zoom dentro de un ScrollView.
                child: FlutterMap(
                  options: MapOptions(
                    initialCenter: point,
                    initialZoom: 15,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.none,
                    ),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.eventhub.mobile',
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: point,
                          width: 40,
                          height: 40,
                          child: const Icon(
                            Icons.location_on,
                            color: AppColors.accent,
                            size: 40,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

enum _MapApp { googleMaps, waze, appleMaps }

class _MapAppTile extends StatelessWidget {
  const _MapAppTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.accent, size: 20),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: AppColors.inkSoft,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _EventGallery extends StatelessWidget {
  const _EventGallery({required this.imageUrls});
  final List<String> imageUrls;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 140,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: imageUrls.length,
        separatorBuilder: (context, index) => const SizedBox(width: 10),
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.network(
            imageUrls[i],
            width: 200,
            height: 140,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => Container(
              width: 200,
              height: 140,
              decoration: const BoxDecoration(gradient: AppGradients.accent),
            ),
          ),
        ),
      ),
    );
  }
}

String _capitalize(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.text,
    this.accentText = false,
  });
  final IconData icon;
  final String text;
  final bool accentText;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.accent),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: accentText
                ? const TextStyle(
                    color: AppColors.accentBright,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  )
                : Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      ],
    );
  }
}

class _ZoneTile extends StatelessWidget {
  const _ZoneTile({required this.zone, required this.onTap});
  final ZoneModel zone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 40,
              decoration: BoxDecoration(
                gradient: AppGradients.accent,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    zone.name,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${zone.capacity} cupos',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            Text(
              '\$${zone.price.toStringAsFixed(0)}',
              style: const TextStyle(
                color: AppColors.accentBright,
                fontSize: 19,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              width: 30,
              height: 30,
              decoration: const BoxDecoration(
                gradient: AppGradients.accent,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.arrow_forward_rounded,
                color: Colors.white,
                size: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
