import '../../core/api_client.dart';
import 'event_models.dart';

/// Fase C (#19) — todos los campos opcionales; sin ninguno, se comporta
/// como el listado simple de siempre. `maxPrice` filtra por "el evento
/// tiene alguna zona a ese precio o menos" (ver el mismo comentario del
/// lado del backend, FindEventsQueryDto).
class EventFilters {
  const EventFilters({
    this.city,
    this.category,
    this.fromDate,
    this.toDate,
    this.maxPrice,
  });

  final String? city;
  final EventCategory? category;
  final DateTime? fromDate;
  final DateTime? toDate;
  final double? maxPrice;

  bool get isEmpty =>
      city == null &&
      category == null &&
      fromDate == null &&
      toDate == null &&
      maxPrice == null;

  Map<String, dynamic> toQueryParams() {
    return {
      if (city != null && city!.isNotEmpty) 'city': city,
      if (category != null) 'category': category!.apiValue,
      if (fromDate != null) 'fromDate': fromDate!.toIso8601String(),
      if (toDate != null) 'toDate': toDate!.toIso8601String(),
      if (maxPrice != null) 'maxPrice': maxPrice,
    };
  }
}

class EventsRepository {
  EventsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<EventModel>> findAll({
    EventFilters filters = const EventFilters(),
  }) async {
    final response = await _apiClient.dio.get(
      '/events',
      queryParameters: filters.toQueryParams(),
    );
    return (response.data as List<dynamic>)
        .map((e) => EventModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<EventModel> findOne(String id) async {
    final response = await _apiClient.dio.get('/events/$id');
    return EventModel.fromJson(response.data as Map<String, dynamic>);
  }
}
