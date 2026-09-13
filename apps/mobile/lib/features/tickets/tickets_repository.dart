import '../../core/api_client.dart';
import 'ticket_models.dart';

/// La emisión del boleto es asíncrona (order.paid -> outbox -> RabbitMQ ->
/// tickets-service, ver DESIGN.md) — el checkout no devuelve el boleto, hay
/// que consultarlo por separado hasta que aparezca.
class TicketNotReadyException implements Exception {
  @override
  String toString() => 'El boleto está tardando más de lo esperado en emitirse';
}

class TicketsRepository {
  TicketsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<TicketModel>> findMine() async {
    final response = await _apiClient.dio.get('/tickets/mine');
    return (response.data as List<dynamic>)
        .map((t) => TicketModel.fromJson(t as Map<String, dynamic>))
        .toList();
  }

  /// Sondea `/tickets/mine` hasta encontrar el boleto de [orderId], con un
  /// intervalo corto — el consumidor de RabbitMQ suele procesar el evento
  /// en milisegundos, pero nunca hay que dejar la UI "congelada" sin
  /// feedback si tarda (DESIGN_SYSTEM.md §12, paso 9c usa la misma idea).
  Future<TicketModel> pollForTicket(
    String orderId, {
    Duration interval = const Duration(seconds: 1),
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final tickets = await findMine();
      for (final ticket in tickets) {
        if (ticket.orderId == orderId) return ticket;
      }
      await Future.delayed(interval);
    }
    throw TicketNotReadyException();
  }
}
