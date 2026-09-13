class ZoneModel {
  ZoneModel({required this.id, required this.name, required this.price, required this.capacity});

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

class EventModel {
  EventModel({
    required this.id,
    required this.title,
    required this.description,
    required this.venue,
    required this.startsAt,
    required this.zones,
  });

  final String id;
  final String title;
  final String? description;
  final String venue;
  final DateTime startsAt;
  final List<ZoneModel> zones;

  factory EventModel.fromJson(Map<String, dynamic> json) {
    return EventModel(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      venue: json['venue'] as String,
      startsAt: DateTime.parse(json['startsAt'] as String),
      zones: (json['zones'] as List<dynamic>)
          .map((z) => ZoneModel.fromJson(z as Map<String, dynamic>))
          .toList(),
    );
  }
}
