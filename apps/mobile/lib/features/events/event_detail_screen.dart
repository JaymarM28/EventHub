import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import 'event_models.dart';
import 'events_repository.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: FutureBuilder<EventModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: AppColors.accent));
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('No se pudo cargar el evento', style: TextStyle(color: AppColors.inkSoft)));
          }
          final event = snapshot.data!;
          final dateFormat = DateFormat('EEEE d MMMM yyyy', 'es');
          final timeFormat = DateFormat('HH:mm', 'es');

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                backgroundColor: AppColors.background,
                surfaceTintColor: Colors.transparent,
                elevation: 0,
                expandedHeight: 96,
                flexibleSpace: FlexibleSpaceBar(
                  titlePadding: const EdgeInsets.only(left: 56, bottom: 16, right: 16),
                  title: Hero(
                    tag: 'event-${event.id}',
                    child: Material(
                      color: Colors.transparent,
                      child: Text(
                        event.title,
                        style: Theme.of(context).textTheme.titleLarge,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    _InfoRow(icon: Icons.place_outlined, text: event.venue),
                    const SizedBox(height: 8),
                    _InfoRow(
                      icon: Icons.event_outlined,
                      text: '${_capitalize(dateFormat.format(event.startsAt))} · ${timeFormat.format(event.startsAt)} h',
                    ),
                    if (event.description != null) ...[
                      const SizedBox(height: 20),
                      Text(event.description!, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: AppColors.inkSoft)),
                    ],
                    const SizedBox(height: 28),
                    Text('Zonas', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 12),
                    ...event.zones.map((zone) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ZoneTile(zone: zone),
                        )),
                    // El flujo de compra (checkout, bottom sheet de selección
                    // de zona con spring momentum) se agrega en el paso 9b —
                    // ver DESIGN_SYSTEM.md §12.
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

String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.accent),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyLarge)),
      ],
    );
  }
}

class _ZoneTile extends StatelessWidget {
  const _ZoneTile({required this.zone});
  final ZoneModel zone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(zone.name, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 2),
                Text('${zone.capacity} cupos', style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
          Text(
            '\$${zone.price.toStringAsFixed(0)}',
            style: const TextStyle(color: AppColors.accent, fontSize: 19, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
