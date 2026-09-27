import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';
import '../../core/widgets/skeleton.dart';
import 'event_models.dart';
import 'events_repository.dart';
import 'favorite_button.dart';
import 'favorites_state.dart';

IconData categoryIcon(EventCategory? category) {
  return switch (category) {
    EventCategory.musica => Icons.music_note_rounded,
    EventCategory.deportes => Icons.sports_soccer_rounded,
    EventCategory.teatro => Icons.theater_comedy_rounded,
    EventCategory.conferencia => Icons.mic_rounded,
    EventCategory.festival => Icons.celebration_rounded,
    EventCategory.otro || null => Icons.event_rounded,
  };
}

class EventListScreen extends StatefulWidget {
  const EventListScreen({super.key});

  @override
  State<EventListScreen> createState() => _EventListScreenState();
}

class _EventListScreenState extends State<EventListScreen> {
  late Future<List<EventModel>> _future;
  EventFilters _filters = const EventFilters();
  String _search = '';
  bool _favoritesOnly = false;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _future = context.read<EventsRepository>().findAll();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = context.read<EventsRepository>().findAll(filters: _filters);
    });
    await _future;
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<EventFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _FilterSheet(initial: _filters),
    );
    if (result != null) {
      setState(() => _filters = result);
      await _refresh();
    }
  }

  /// Búsqueda por texto — a diferencia de ciudad/categoría/precio (que van
  /// al backend, ver EventFilters), esto filtra del lado del cliente sobre
  /// la lista ya cargada: no hace falta un viaje de red por cada letra
  /// tipeada, y la cantidad de eventos de este proyecto es chica.
  List<EventModel> _applySearch(List<EventModel> events) {
    if (_search.trim().isEmpty) return events;
    final query = _search.trim().toLowerCase();
    return events.where((e) {
      return e.title.toLowerCase().contains(query) ||
          e.venue.toLowerCase().contains(query) ||
          (e.city?.toLowerCase().contains(query) ?? false);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthState>();
    final isAuthenticated = authState.status == AuthStatus.authenticated;
    final favoritesState = context.watch<FavoritesState>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Eventos'),
        actions: [
          IconButton(
            icon: Icon(
              _favoritesOnly
                  ? Icons.favorite_rounded
                  : Icons.favorite_border_rounded,
              color: _favoritesOnly ? AppColors.error : null,
            ),
            tooltip: 'Mis favoritos',
            onPressed: () => setState(() => _favoritesOnly = !_favoritesOnly),
          ),
          if (authState.canScan)
            IconButton(
              icon: const Icon(Icons.qr_code_scanner_rounded),
              onPressed: () => context.push('/scan'),
            ),
          if (isAuthenticated)
            IconButton(
              icon: const Icon(Icons.person_outline_rounded),
              tooltip: 'Perfil',
              onPressed: () => context.push('/profile'),
            )
          else
            TextButton(
              onPressed: () => context.go('/login'),
              child: const Text('Ingresar'),
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => FocusScope.of(context).unfocus(),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        textInputAction: TextInputAction.search,
                        onChanged: (v) => setState(() => _search = v),
                        onSubmitted: (_) => FocusScope.of(context).unfocus(),
                        decoration: InputDecoration(
                          hintText: 'Buscar eventos, lugares...',
                          prefixIcon: const Icon(
                            Icons.search_rounded,
                            color: AppColors.inkSoft,
                            size: 22,
                          ),
                          suffixIcon: _search.isEmpty
                              ? null
                              : IconButton(
                                  icon: const Icon(
                                    Icons.close_rounded,
                                    color: AppColors.inkSoft,
                                    size: 20,
                                  ),
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() => _search = '');
                                    FocusScope.of(context).unfocus();
                                  },
                                ),
                          contentPadding: const EdgeInsets.symmetric(
                            vertical: 0,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    _FilterButton(
                      active: !_filters.isEmpty,
                      onTap: _openFilters,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: FutureBuilder<List<EventModel>>(
                  future: _future,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: 5,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 12),
                        itemBuilder: (context, i) => const EventCardSkeleton(),
                      );
                    }
                    if (snapshot.hasError) {
                      return _ErrorState(onRetry: _refresh);
                    }
                    // Un evento que ya pasó no se puede comprar — no tiene
                    // sentido mostrarlo en el listado principal de una app de
                    // boletería (a diferencia de "Mis boletos", que sí es un
                    // historial). `GET /events` no filtra por fecha (Fase C
                    // #19 lo soporta vía `fromDate` pero la UI no lo usa
                    // todavía), así que se filtra acá del lado del cliente.
                    final now = DateTime.now();
                    final all = (snapshot.data ?? [])
                        .where((e) => e.startsAt.isAfter(now))
                        .toList();
                    var events = _applySearch(all);
                    if (_favoritesOnly) {
                      events = events
                          .where((e) => favoritesState.isFavorite(e.id))
                          .toList();
                    }
                    final showFeatured =
                        _search.isEmpty &&
                        _filters.isEmpty &&
                        !_favoritesOnly &&
                        all.isNotEmpty;
                    final featured = [...all]
                      ..sort((a, b) => a.startsAt.compareTo(b.startsAt));

                    return RefreshIndicator(
                      color: AppColors.accent,
                      onRefresh: _refresh,
                      child: events.isEmpty
                          ? LayoutBuilder(
                              builder: (context, constraints) =>
                                  SingleChildScrollView(
                                    physics:
                                        const AlwaysScrollableScrollPhysics(),
                                    child: SizedBox(
                                      height: constraints.maxHeight,
                                      child: Center(
                                        child: Text(
                                          _favoritesOnly
                                              ? 'Todavía no marcaste eventos como favoritos'
                                              : _filters.isEmpty &&
                                                    _search.isEmpty
                                              ? 'No hay eventos todavía'
                                              : 'Ningún evento coincide con la búsqueda',
                                          style: const TextStyle(
                                            color: AppColors.inkSoft,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                            )
                          : CustomScrollView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              slivers: [
                                if (showFeatured) ...[
                                  const SliverPadding(
                                    padding: EdgeInsets.fromLTRB(16, 4, 16, 10),
                                    sliver: SliverToBoxAdapter(
                                      child: _SectionLabel('PRÓXIMOS'),
                                    ),
                                  ),
                                  SliverToBoxAdapter(
                                    child: _FeaturedCarousel(
                                      events: featured.take(5).toList(),
                                    ),
                                  ),
                                  const SliverPadding(
                                    padding: EdgeInsets.fromLTRB(
                                      16,
                                      20,
                                      16,
                                      10,
                                    ),
                                    sliver: SliverToBoxAdapter(
                                      child: _SectionLabel('TODOS LOS EVENTOS'),
                                    ),
                                  ),
                                ],
                                SliverPadding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    4,
                                    16,
                                    24,
                                  ),
                                  sliver: SliverList.separated(
                                    itemCount: events.length,
                                    separatorBuilder: (context, index) =>
                                        const SizedBox(height: 12),
                                    itemBuilder: (context, i) =>
                                        _EventCard(event: events[i]),
                                  ),
                                ),
                              ],
                            ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.active, required this.onTap});

  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: active ? AppGradients.accent : null,
          color: active ? null : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: active ? null : Border.all(color: AppColors.border),
        ),
        alignment: Alignment.center,
        child: Icon(
          active ? Icons.filter_alt_rounded : Icons.tune_rounded,
          color: active ? Colors.white : AppColors.inkSoft,
          size: 22,
        ),
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});
  final EventFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late final TextEditingController _cityController = TextEditingController(
    text: widget.initial.city ?? '',
  );
  late final TextEditingController _maxPriceController = TextEditingController(
    text: widget.initial.maxPrice?.toStringAsFixed(0) ?? '',
  );
  EventCategory? _category;

  @override
  void initState() {
    super.initState();
    _category = widget.initial.category;
  }

  @override
  void dispose() {
    _cityController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        padding: EdgeInsets.fromLTRB(
          24,
          12,
          24,
          24 + MediaQuery.of(context).viewInsets.bottom,
        ),
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
              'Filtrar eventos',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 24),
            _SheetSectionLabel('CIUDAD'),
            const SizedBox(height: 10),
            TextField(
              controller: _cityController,
              decoration: const InputDecoration(
                hintText: 'Ej. Bogotá',
                prefixIcon: Icon(Icons.place_outlined),
              ),
            ),
            const SizedBox(height: 22),
            _SheetSectionLabel('CATEGORÍA'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: EventCategory.values.map((c) {
                final selected = _category == c;
                return GestureDetector(
                  onTap: () => setState(() => _category = selected ? null : c),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      gradient: selected ? AppGradients.accent : null,
                      color: selected ? null : AppColors.background,
                      borderRadius: BorderRadius.circular(999),
                      border: selected
                          ? null
                          : Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          categoryIcon(c),
                          size: 16,
                          color: selected ? Colors.white : AppColors.inkSoft,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          c.label,
                          style: TextStyle(
                            color: selected ? Colors.white : AppColors.ink,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 22),
            _SheetSectionLabel('PRECIO MÁXIMO'),
            const SizedBox(height: 10),
            TextField(
              controller: _maxPriceController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: 'Opcional',
                prefixIcon: Icon(Icons.sell_outlined),
              ),
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: const BorderSide(color: AppColors.border),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    onPressed: () =>
                        Navigator.of(context).pop(const EventFilters()),
                    child: const Text('Limpiar'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: PressableButton(
                    onPressed: () {
                      final maxPrice = double.tryParse(
                        _maxPriceController.text.trim(),
                      );
                      Navigator.of(context).pop(
                        EventFilters(
                          city: _cityController.text.trim().isEmpty
                              ? null
                              : _cityController.text.trim(),
                          category: _category,
                          maxPrice: maxPrice,
                        ),
                      );
                    },
                    child: const Text('Aplicar filtros'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetSectionLabel extends StatelessWidget {
  const _SheetSectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.inkSoft,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.inkSoft,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
      ),
    );
  }
}

class _FeaturedCarousel extends StatelessWidget {
  const _FeaturedCarousel({required this.events});
  final List<EventModel> events;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      // Con portada, la tarjeta suma una miniatura de 64px arriba del texto
      // (ver _FeaturedCard) — más alta que la variante sin imagen, que solo
      // tiene la píldora de fecha ahí.
      height: 190,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: events.length,
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemBuilder: (context, i) => _FeaturedCard(event: events[i]),
      ),
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.event});
  final EventModel event;

  @override
  Widget build(BuildContext context) {
    final dateLabel = DateFormat(
      'd MMM',
      'es',
    ).format(event.startsAt).replaceAll('.', '');
    final cheapestPrice = event.zones.isEmpty
        ? null
        : event.zones.map((z) => z.price).reduce((a, b) => a < b ? a : b);

    final imageUrl = event.coverImageUrl;
    final datePill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        _capitalizeWord(dateLabel),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );

    return GestureDetector(
      onTap: () => context.push('/events/${event.id}'),
      child: Container(
        width: 240,
        padding: const EdgeInsets.all(16),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          // El gradiente de marca siempre es la base de la tarjeta — la
          // portada (si existe) va ENCUADRADA arriba, no de fondo completo,
          // para no perder el morado de identidad ni arriesgar que el texto
          // quede sobre una zona clara/oscura impredecible de la foto (ver
          // feedback del usuario: "no pega con el color morado de fondo").
          gradient: AppGradients.accent,
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: AppColors.accent.withValues(alpha: 0.28),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Stack(
          children: [
            if (imageUrl == null)
              Positioned(
                right: -10,
                top: -10,
                child: Opacity(
                  opacity: 0.18,
                  child: Icon(
                    categoryIcon(event.category),
                    size: 90,
                    color: Colors.white,
                  ),
                ),
              ),
            Positioned(
              top: 0,
              right: 0,
              child: FavoriteButton(eventId: event.id, dark: true),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                imageUrl == null
                    ? datePill
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: SizedBox(
                          height: 64,
                          width: double.infinity,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Image.network(
                                imageUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (context, error, stackTrace) =>
                                    const DecoratedBox(
                                      decoration: BoxDecoration(
                                        gradient: AppGradients.accent,
                                      ),
                                    ),
                              ),
                              Positioned(left: 6, bottom: 6, child: datePill),
                            ],
                          ),
                        ),
                      ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      event.city != null
                          ? '${event.venue}, ${event.city}'
                          : event.venue,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 13,
                      ),
                    ),
                    if (cheapestPrice != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Desde \$${cheapestPrice.toStringAsFixed(0)}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _capitalizeWord(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// Portada del evento si existe (`coverImageUrl`, DESIGN.md #41) con la
/// fecha superpuesta en una esquina; si no hay imagen, el badge de fecha en
/// gradiente de siempre — se mantiene el mismo tamaño (58x66) en ambos
/// casos para no romper el layout de la card.
class _EventThumbnail extends StatelessWidget {
  const _EventThumbnail({
    required this.event,
    required this.day,
    required this.month,
  });

  final EventModel event;
  final String day;
  final String month;

  @override
  Widget build(BuildContext context) {
    final imageUrl = event.coverImageUrl;
    if (imageUrl == null) {
      return Container(
        width: 58,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(
          gradient: AppGradients.accent,
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
        child: Column(
          children: [
            Text(
              month,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              day,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w700,
                height: 1.0,
              ),
            ),
          ],
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        width: 58,
        height: 66,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => const DecoratedBox(
                decoration: BoxDecoration(gradient: AppGradients.accent),
              ),
              loadingBuilder: (context, child, progress) => progress == null
                  ? child
                  : const DecoratedBox(
                      decoration: BoxDecoration(color: AppColors.surface),
                    ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 3),
                color: Colors.black.withValues(alpha: 0.5),
                alignment: Alignment.center,
                child: Text(
                  '$day $month',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final EventModel event;

  @override
  Widget build(BuildContext context) {
    final day = DateFormat('d', 'es').format(event.startsAt);
    final month = DateFormat(
      'MMM',
      'es',
    ).format(event.startsAt).replaceAll('.', '').toUpperCase();
    final time = DateFormat('HH:mm', 'es').format(event.startsAt);
    final cheapestPrice = event.zones.isEmpty
        ? null
        : event.zones.map((z) => z.price).reduce((a, b) => a < b ? a : b);

    return GestureDetector(
      onTap: () => context.push('/events/${event.id}'),
      child: Hero(
        tag: 'event-${event.id}',
        child: Material(
          type: MaterialType.transparency,
          child: Stack(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.accent.withValues(alpha: 0.08),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _EventThumbnail(event: event, day: day, month: month),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                categoryIcon(event.category),
                                size: 13,
                                color: AppColors.accent,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                (event.category ?? EventCategory.otro).label
                                    .toUpperCase(),
                                style: const TextStyle(
                                  color: AppColors.accent,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.6,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            event.title,
                            style: Theme.of(context).textTheme.titleLarge,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(
                                Icons.place_outlined,
                                size: 14,
                                color: AppColors.inkSoft,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  event.city != null
                                      ? '${event.venue}, ${event.city}'
                                      : event.venue,
                                  style: Theme.of(context).textTheme.bodyMedium,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Text(
                                '$time h',
                                style: Theme.of(context).textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w500),
                              ),
                              if (cheapestPrice != null) ...[
                                Text(
                                  '  ·  ',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                                Text(
                                  'Desde \$${cheapestPrice.toStringAsFixed(0)}',
                                  style: const TextStyle(
                                    color: AppColors.accentBright,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: AppColors.inkSoft,
                    ),
                  ],
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: FavoriteButton(eventId: event.id),
              ),
            ],
          ),
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
            'No se pudo cargar los eventos',
            style: TextStyle(color: AppColors.inkSoft),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: onRetry, child: const Text('Reintentar')),
        ],
      ),
    );
  }
}
