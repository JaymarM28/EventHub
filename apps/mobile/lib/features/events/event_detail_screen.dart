import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
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
      body: FutureBuilder<EventModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text('No se pudo cargar el evento'));
          }
          final event = snapshot.data!;
          final dateFormat = DateFormat('EEEE d MMMM yyyy, HH:mm', 'es');

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                expandedHeight: 120,
                flexibleSpace: FlexibleSpaceBar(
                  title: Hero(
                    tag: 'event-${event.id}',
                    child: Material(
                      color: Colors.transparent,
                      child: Text(event.title, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    Text(event.venue, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 4),
                    Text(dateFormat.format(event.startsAt), style: Theme.of(context).textTheme.bodyLarge),
                    if (event.description != null) ...[
                      const SizedBox(height: 16),
                      Text(event.description!, style: Theme.of(context).textTheme.bodyMedium),
                    ],
                    const SizedBox(height: 24),
                    Text('Zonas', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 12),
                    ...event.zones.map((zone) => _ZoneTile(zone: zone)),
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

class _ZoneTile extends StatelessWidget {
  const _ZoneTile({required this.zone});
  final ZoneModel zone;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(zone.name),
        subtitle: Text('${zone.capacity} cupos'),
        trailing: Text(
          '\$${zone.price.toStringAsFixed(0)}',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ),
    );
  }
}
