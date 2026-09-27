import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../events/event_models.dart';
import '../events/events_repository.dart';
import 'ticket_models.dart';
import 'ticket_screen.dart';
import 'tickets_repository.dart';

/// Todos los boletos de UNA orden (Fase A puede ser más de uno) — al
/// tocarla se abre el mismo TicketScreen con PageView que ya usa el flujo
/// de checkout, en vez de reinventar la presentación acá.
class _Purchase {
  _Purchase({required this.zone, required this.tickets});
  final ZoneModel zone;
  final List<TicketModel> tickets;
}

/// Todas las compras de UN evento, agrupadas — un usuario puede comprar
/// varias zonas del mismo evento en compras separadas (ej. una entrada
/// Palco Oro un día, Palco Plata otro), y verlas como tarjetas sueltas sin
/// relación entre sí se sintió desordenado en la práctica (visto en vivo).
class _EventGroup {
  _EventGroup({required this.event, required this.purchases});
  final EventModel event;
  final List<_Purchase> purchases;
}

/// Antes de esta pantalla, un boleto solo se podía ver en el momento de
/// comprarlo (cerrabas TicketScreen y no había forma de volver a verlo,
/// aunque GET /tickets/mine ya lo tenía guardado) — fundacional para
/// transferencia/asignación de boletos (DESIGN.md Fase E).
class MyTicketsScreen extends StatefulWidget {
  const MyTicketsScreen({super.key});

  @override
  State<MyTicketsScreen> createState() => _MyTicketsScreenState();
}

class _MyTicketsScreenState extends State<MyTicketsScreen> {
  late Future<List<_EventGroup>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  Future<List<_EventGroup>> _load() async {
    final ticketsRepository = context.read<TicketsRepository>();
    final eventsRepository = context.read<EventsRepository>();

    final tickets = await ticketsRepository.findMine();
    final eventCache = <String, EventModel>{};
    final purchasesByOrder = <String, _Purchase>{};
    // orderId "de primera vez visto" por evento — preserva el orden en que
    // llegan los tickets (más reciente primero, ya ordenados por el backend).
    final orderIdsByEvent = <String, List<String>>{};

    for (final ticket in tickets) {
      final eventId = ticket.eventId;
      if (eventId == null) continue; // zona no sincronizada — no debería pasar

      var event = eventCache[eventId];
      if (event == null) {
        event = await eventsRepository.findOne(eventId);
        eventCache[eventId] = event;
      }

      final existing = purchasesByOrder[ticket.orderId];
      if (existing != null) {
        existing.tickets.add(ticket);
        continue;
      }

      final zone = event.zones.firstWhere(
        (z) => z.id == ticket.zoneId,
        orElse: () => ZoneModel(
          id: ticket.zoneId,
          name: ticket.zoneName ?? 'Zona',
          price: ticket.zonePrice ?? 0,
          capacity: 0,
        ),
      );
      purchasesByOrder[ticket.orderId] = _Purchase(
        zone: zone,
        tickets: [ticket],
      );
      orderIdsByEvent.putIfAbsent(eventId, () => []).add(ticket.orderId);
    }

    return orderIdsByEvent.entries
        .map(
          (entry) => _EventGroup(
            event: eventCache[entry.key]!,
            purchases: entry.value
                .map((orderId) => purchasesByOrder[orderId]!)
                .toList(),
          ),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text('Mis boletos'),
          bottom: const TabBar(
            indicatorColor: AppColors.accent,
            labelColor: AppColors.ink,
            unselectedLabelColor: AppColors.inkSoft,
            tabs: [
              Tab(text: 'Activos'),
              Tab(text: 'Históricos'),
            ],
          ),
        ),
        body: FutureBuilder<List<_EventGroup>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.accent),
              );
            }
            if (snapshot.hasError) {
              return _ErrorState(onRetry: _refresh);
            }
            final groups = snapshot.data ?? [];
            final now = DateTime.now();
            // Activos = evento todavía no pasó (mismo criterio que oculta
            // eventos vencidos en el listado principal, ver
            // event_list_screen.dart) — un boleto de un evento que ya
            // ocurrió es historial, no algo para "usar" en la puerta.
            final active =
                groups.where((g) => g.event.startsAt.isAfter(now)).toList()
                  ..sort(
                    (a, b) => a.event.startsAt.compareTo(b.event.startsAt),
                  );
            final past =
                groups.where((g) => !g.event.startsAt.isAfter(now)).toList()
                  ..sort(
                    (a, b) => b.event.startsAt.compareTo(a.event.startsAt),
                  );

            return TabBarView(
              children: [
                _TicketsList(
                  groups: active,
                  onRefresh: _refresh,
                  emptyMessage: 'No tenés boletos de próximos eventos',
                ),
                _TicketsList(
                  groups: past,
                  onRefresh: _refresh,
                  emptyMessage: 'Todavía no tenés boletos de eventos pasados',
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TicketsList extends StatelessWidget {
  const _TicketsList({
    required this.groups,
    required this.onRefresh,
    required this.emptyMessage,
  });

  final List<_EventGroup> groups;
  final Future<void> Function() onRefresh;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.accent,
      onRefresh: onRefresh,
      child: groups.isEmpty
          ? LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: SizedBox(
                  height: constraints.maxHeight,
                  child: Center(
                    child: Text(
                      emptyMessage,
                      style: const TextStyle(color: AppColors.inkSoft),
                    ),
                  ),
                ),
              ),
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: groups.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, i) => _EventGroupCard(group: groups[i]),
            ),
    );
  }
}

class _EventGroupCard extends StatelessWidget {
  const _EventGroupCard({required this.group});

  final _EventGroup group;

  @override
  Widget build(BuildContext context) {
    final event = group.event;
    final dateFormat = DateFormat('d MMM yyyy, HH:mm', 'es');

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            event.title,
            style: Theme.of(context).textTheme.titleLarge,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            event.venue,
            style: Theme.of(context).textTheme.bodyMedium,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            dateFormat.format(event.startsAt),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 12),
          ...group.purchases.map(
            (purchase) => _PurchaseRow(event: event, purchase: purchase),
          ),
        ],
      ),
    );
  }
}

class _PurchaseRow extends StatelessWidget {
  const _PurchaseRow({required this.event, required this.purchase});

  final EventModel event;
  final _Purchase purchase;

  @override
  Widget build(BuildContext context) {
    final count = purchase.tickets.length;
    final allUsed = purchase.tickets.every((t) => t.scannedAt != null);

    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => TicketScreen(
            tickets: purchase.tickets,
            event: event,
            zone: purchase.zone,
          ),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                purchase.zone.name,
                style: const TextStyle(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            ),
            if (count > 1) ...[
              const SizedBox(width: 8),
              Text(
                '× $count',
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
            const Spacer(),
            if (allUsed)
              const Padding(
                padding: EdgeInsets.only(right: 8),
                child: Text(
                  'Usado',
                  style: TextStyle(color: AppColors.inkSoft, fontSize: 12),
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

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'No se pudieron cargar tus boletos',
            style: TextStyle(color: AppColors.inkSoft),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: onRetry, child: const Text('Reintentar')),
        ],
      ),
    );
  }
}
