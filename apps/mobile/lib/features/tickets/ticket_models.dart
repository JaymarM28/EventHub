class TicketModel {
  TicketModel({
    required this.id,
    required this.zoneId,
    required this.orderId,
    required this.qrToken,
    required this.scannedAt,
  });

  final String id;
  final String zoneId;
  final String orderId;
  final String qrToken;
  final DateTime? scannedAt;

  factory TicketModel.fromJson(Map<String, dynamic> json) {
    return TicketModel(
      id: json['id'] as String,
      zoneId: json['zoneId'] as String,
      orderId: json['orderId'] as String,
      qrToken: json['qrToken'] as String,
      scannedAt: json['scannedAt'] == null ? null : DateTime.parse(json['scannedAt'] as String),
    );
  }
}
