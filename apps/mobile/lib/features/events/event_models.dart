import 'dart:ui' show Offset;

class ZoneModel {
  ZoneModel({
    required this.id,
    required this.name,
    required this.price,
    required this.capacity,
    this.venueSectionId,
  });

  final String id;
  final String name;
  final double price;
  final int capacity;

  /// Fase G (mapa de establecimiento) — nullable: la mayoría de las zonas
  /// no están vinculadas a un polígono del mapa todavía.
  final String? venueSectionId;

  factory ZoneModel.fromJson(Map<String, dynamic> json) {
    return ZoneModel(
      id: json['id'] as String,
      name: json['name'] as String,
      // El backend serializa Decimal de Prisma como string ("50.00").
      price: double.parse(json['price'].toString()),
      capacity: json['capacity'] as int,
      venueSectionId: json['venueSectionId'] as String?,
    );
  }
}

class VenueSectionModel {
  VenueSectionModel({required this.id, required this.name, required this.points});

  final String id;
  final String name;

  /// Puntos del polígono normalizados 0.0–1.0 (ver comentario en
  /// events-service/prisma/schema.prisma, modelo VenueSection).
  final List<Offset> points;

  factory VenueSectionModel.fromJson(Map<String, dynamic> json) {
    return VenueSectionModel(
      id: json['id'] as String,
      name: json['name'] as String,
      points: (json['points'] as List<dynamic>)
          .map((p) => Offset((p['x'] as num).toDouble(), (p['y'] as num).toDouble()))
          .toList(),
    );
  }
}

class VenueMapModel {
  VenueMapModel({required this.name, required this.mapImageUrl, required this.sections});

  final String name;
  final String mapImageUrl;
  final List<VenueSectionModel> sections;

  /// Devuelve null si el evento no tiene establecimiento del catálogo
  /// vinculado, o si ese establecimiento no tiene imagen de mapa cargada
  /// todavía — en ambos casos no hay nada que dibujar.
  static VenueMapModel? fromEventJson(Map<String, dynamic> json) {
    final venueRef = json['venueRef'] as Map<String, dynamic>?;
    final mapImageUrl = venueRef?['mapImageUrl'] as String?;
    if (venueRef == null || mapImageUrl == null) return null;
    return VenueMapModel(
      name: venueRef['name'] as String,
      mapImageUrl: mapImageUrl,
      sections: (venueRef['sections'] as List<dynamic>)
          .map((s) => VenueSectionModel.fromJson(s as Map<String, dynamic>))
          .toList(),
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
    this.venueMap,
  });

  final String id;
  final String title;
  final String? description;
  final String venue;

  /// Solo viene poblado cuando el evento tiene un establecimiento del
  /// catálogo CON imagen de mapa cargada — ver VenueMapModel.fromEventJson.
  /// Nunca viene en el listado de eventos (solo en el detalle, findOne),
  /// mismo criterio de "no sobre-pedir en listas" que el admin panel.
  final VenueMapModel? venueMap;

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
      venueMap: VenueMapModel.fromEventJson(json),
    );
  }
}
