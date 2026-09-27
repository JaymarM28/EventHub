class ZoneModel {
  ZoneModel({
    required this.id,
    required this.name,
    required this.price,
    required this.capacity,
  });

  final String id;
  final String name;
  final double price;
  final int capacity;

  factory ZoneModel.fromJson(Map<String, dynamic> json) {
    return ZoneModel(
      id: json['id'] as String,
      name: json['name'] as String,
      // El backend serializa Decimal de Prisma como string ("50.00").
      price: double.parse(json['price'].toString()),
      capacity: json['capacity'] as int,
    );
  }
}

/// Debe mantenerse en sync con el enum EventCategory de
/// events-service/prisma/schema.prisma.
enum EventCategory { musica, deportes, teatro, conferencia, festival, otro }

extension EventCategoryLabel on EventCategory {
  String get label => switch (this) {
    EventCategory.musica => 'Música',
    EventCategory.deportes => 'Deportes',
    EventCategory.teatro => 'Teatro',
    EventCategory.conferencia => 'Conferencia',
    EventCategory.festival => 'Festival',
    EventCategory.otro => 'Otro',
  };

  /// Valor tal como lo espera el backend (mayúsculas, sin acentos).
  String get apiValue => name.toUpperCase();
}

EventCategory? _parseCategory(String? raw) {
  if (raw == null) return null;
  final matches = EventCategory.values.where((c) => c.apiValue == raw);
  return matches.isEmpty ? null : matches.first;
}

class EventModel {
  EventModel({
    required this.id,
    required this.title,
    required this.description,
    required this.venue,
    required this.city,
    required this.category,
    required this.startsAt,
    required this.zones,
    this.coverImageUrl,
    this.galleryImageUrls = const [],
    this.latitude,
    this.longitude,
    this.address,
  });

  final String id;
  final String title;
  final String? description;
  final String venue;

  /// Nullable — eventos creados antes de Fase C (#19) no tienen esto.
  final String? city;
  final EventCategory? category;
  final DateTime startsAt;
  final List<ZoneModel> zones;

  /// Fase F (#41) — ambos nullable/vacíos por el mismo motivo que
  /// city/category: eventos existentes no tienen imagen.
  final String? coverImageUrl;
  final List<String> galleryImageUrls;

  /// Fase C (#18) — geocodificadas del lado del backend a partir de
  /// venue+city (ver GeocodingService en events-service), nunca tipeadas
  /// a mano. Ambas nullable: geocoding es best-effort, puede no encontrar
  /// la dirección.
  final double? latitude;
  final double? longitude;

  /// Dirección completa del geocoder (más precisa que "venue, city"
  /// tipeado por el organizador) — nullable, mismo criterio que lat/lng.
  final String? address;

  factory EventModel.fromJson(Map<String, dynamic> json) {
    return EventModel(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      venue: json['venue'] as String,
      city: json['city'] as String?,
      category: _parseCategory(json['category'] as String?),
      startsAt: DateTime.parse(json['startsAt'] as String),
      zones: (json['zones'] as List<dynamic>)
          .map((z) => ZoneModel.fromJson(z as Map<String, dynamic>))
          .toList(),
      coverImageUrl: json['coverImageUrl'] as String?,
      galleryImageUrls:
          (json['galleryImageUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      address: json['address'] as String?,
    );
  }
}
