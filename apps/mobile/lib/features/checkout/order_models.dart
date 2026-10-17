class OrderModel {
  OrderModel({
    required this.id,
    required this.zoneId,
    required this.status,
    required this.amount,
    required this.checkoutUrl,
    this.discountAmount,
    this.serviceFeeAmount = 0,
  });

  final String id;
  final String zoneId;
  final String status;

  /// TOTAL cobrado — precio de zona (menos descuento, si hubo) + el cargo
  /// por servicio de la plataforma (`serviceFeeAmount`, ver orders-service
  /// OrdersService.checkout). El organizador nunca ve este cargo
  /// descontado de lo que publicó.
  final double amount;

  /// #23 — cuánto se descontó del subtotal por el código aplicado (si
  /// hubo uno). Null cuando no se usó ningún código.
  final double? discountAmount;

  /// #24 (modelo de negocio) — porción de `amount` que es cargo por
  /// servicio, mostrado como línea separada en el checkout para que el
  /// comprador vea exactamente qué está pagando.
  final double serviceFeeAmount;

  /// Fase D (#20): URL de checkout de Wompi a abrir en un
  /// WebView — null solo en respuestas viejas/otros endpoints que no
  /// pasan por checkout() (no debería pasar en la práctica).
  final String? checkoutUrl;

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: json['id'] as String,
      zoneId: json['zoneId'] as String,
      status: json['status'] as String,
      // El backend serializa Decimal de Prisma como string, igual que
      // zone.price (ver event_models.dart).
      amount: double.parse(json['amount'].toString()),
      checkoutUrl: json['checkoutUrl'] as String?,
      discountAmount: json['discountAmount'] == null
          ? null
          : double.parse(json['discountAmount'].toString()),
      serviceFeeAmount: json['serviceFeeAmount'] == null
          ? 0
          : double.parse(json['serviceFeeAmount'].toString()),
    );
  }
}
