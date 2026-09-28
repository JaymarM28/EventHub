import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import 'order_models.dart';

class CheckoutException implements Exception {
  CheckoutException(this.message);
  final String message;
  @override
  String toString() => message;
}

class OrdersRepository {
  OrdersRepository(this._apiClient);

  final ApiClient _apiClient;

  /// Fase 2 (asiento individual): `quantity` y `seatIds` son mutuamente
  /// excluyentes, igual que en el backend (CreateOrderDto) — exactamente
  /// uno de los dos debe venir. Con `seatIds`, se compran ESAS butacas
  /// puntuales; con `quantity`, N boletos "por cupo" de la zona (como
  /// siempre funcionó).
  Future<OrderModel> checkout({
    required String zoneId,
    int? quantity,
    List<String>? seatIds,
    String? discountCode,
  }) async {
    assert(
      (quantity == null) != (seatIds == null),
      'checkout necesita exactamente uno de quantity o seatIds',
    );
    try {
      final response = await _apiClient.dio.post(
        '/orders/checkout',
        data: {
          'zoneId': zoneId,
          if (quantity != null) 'quantity': quantity,
          if (seatIds != null) 'seatIds': seatIds,
          if (discountCode != null && discountCode.isNotEmpty)
            'discountCode': discountCode,
        },
      );
      return OrderModel.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw CheckoutException(_extractMessage(e));
    }
  }

  String _extractMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
    return 'No se pudo conectar con el servidor';
  }
}
