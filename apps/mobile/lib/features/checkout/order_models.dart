class OrderModel {
  OrderModel({required this.id, required this.zoneId, required this.status, required this.amount});

  final String id;
  final String zoneId;
  final String status;
  final double amount;

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: json['id'] as String,
      zoneId: json['zoneId'] as String,
      status: json['status'] as String,
      // El backend serializa Decimal de Prisma como string, igual que
      // zone.price (ver event_models.dart).
      amount: double.parse(json['amount'].toString()),
    );
  }
}
