import '../../core/api_client.dart';
import 'event_models.dart';

class EventsRepository {
  EventsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<EventModel>> findAll() async {
    final response = await _apiClient.dio.get('/events');
    return (response.data as List<dynamic>)
        .map((e) => EventModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<EventModel> findOne(String id) async {
    final response = await _apiClient.dio.get('/events/$id');
    return EventModel.fromJson(response.data as Map<String, dynamic>);
  }
}
