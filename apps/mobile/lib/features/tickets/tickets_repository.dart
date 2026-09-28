import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../events/event_models.dart';
import 'ticket_models.dart';

/// La emisión del boleto es asíncrona (order.paid -> outbox -> RabbitMQ ->
/// tickets-service, ver DESIGN.md) — el checkout no devuelve el boleto, hay
/// que consultarlo por separado hasta que aparezca.
class TicketNotReadyException implements Exception {
  @override
  String toString() => 'El boleto está tardando más de lo esperado en emitirse';
}

/// El backend rechaza la transferencia con mensajes específicos (email sin
/// cuenta, boleto ya usado, no puedes transferirte a ti mismo) — se
/// propagan tal cual en vez de un error genérico.
class TransferTicketException implements Exception {
  TransferTicketException(this.message);
  final String message;

  @override
  String toString() => message;
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

  /// Fase 2 (asiento individual) — devuelve [] tanto si la zona no tiene
  /// butacas generadas como si tiene y están todas disponibles; el
  /// caller (SeatPickerScreen) decide qué hacer con una lista vacía.
  Future<List<SeatModel>> seatsForZone(String zoneId) async {
    final response = await _apiClient.dio.get('/tickets/zones/$zoneId/seats');
    return (response.data as List<dynamic>)
        .map((s) => SeatModel.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  /// Sondea `/tickets/mine` hasta encontrar los `expectedCount` boletos de
  /// [orderId] (Fase A: una orden puede emitir varios), con un intervalo
  /// corto — el consumidor de RabbitMQ suele procesar el evento en
  /// milisegundos, pero nunca hay que dejar la UI "congelada" sin feedback
  /// si tarda (DESIGN_SYSTEM.md §12, paso 9c usa la misma idea). Los
  /// `quantity` boletos de una orden se crean en la MISMA transacción de
  /// tickets-service, así que en la práctica aparecen todos juntos o
  /// ninguno — el loop es defensivo, no el caso esperado.
  Future<List<TicketModel>> pollForTickets(
    String orderId,
    int expectedCount, {
    Duration interval = const Duration(seconds: 1),
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final tickets = await findMine();
      final matching = tickets.where((t) => t.orderId == orderId).toList();
      if (matching.length >= expectedCount) return matching;
      await Future.delayed(interval);
    }
    throw TicketNotReadyException();
  }

  /// Fase E: etiqueta informativa ("para quién es" este boleto dentro de
  /// una compra grupal) — no cambia el dueño real, solo el nombre mostrado.
  Future<TicketModel> assign(String ticketId, String name) async {
    final response = await _apiClient.dio.patch(
      '/tickets/$ticketId/assign',
      data: {'name': name},
    );
    return TicketModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// Fase E: transferencia real de dueño — a diferencia de [assign], el
  /// boleto deja de aparecer en "Mis boletos" de quien lo transfiere.
  /// El backend responde 404 si el email no tiene cuenta y 400 si el
  /// boleto ya fue usado; ambos llegan tal cual vía DioException.
  Future<void> transfer(String ticketId, String toEmail) async {
    try {
      await _apiClient.dio.patch(
        '/tickets/$ticketId/transfer',
        data: {'toEmail': toEmail},
      );
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : 'No se pudo conectar con el servidor';
      throw TransferTicketException(message);
    }
  }
}
