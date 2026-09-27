class TicketModel {
  TicketModel({
    required this.id,
    required this.zoneId,
    required this.orderId,
    required this.qrToken,
    required this.scannedAt,
    required this.eventId,
    required this.zoneName,
    required this.zonePrice,
    required this.assignedToName,
  });

  final String id;
  final String zoneId;
  final String orderId;
  final String qrToken;
  final DateTime? scannedAt;

  /// Enriquecido por tickets-service desde su copia local de EventZone
  /// (ver TicketsService.findByUser) — null solo si la zona nunca se
  /// sincronizó, algo que no debería pasar en la práctica.
  final String? eventId;
  final String? zoneName;
  final double? zonePrice;

  /// Fase E: "para quién es" este boleto dentro de una compra grupal —
  /// solo informativo, no cambia el dueño real (ver TicketsService.assignTo).
  final String? assignedToName;

  factory TicketModel.fromJson(Map<String, dynamic> json) {
    return TicketModel(
      id: json['id'] as String,
      zoneId: json['zoneId'] as String,
      orderId: json['orderId'] as String,
      qrToken: json['qrToken'] as String,
      scannedAt: json['scannedAt'] == null
          ? null
          : DateTime.parse(json['scannedAt'] as String),
      eventId: json['eventId'] as String?,
      zoneName: json['zoneName'] as String?,
      // El backend serializa Decimal de Prisma como string.
      zonePrice: json['zonePrice'] == null
          ? null
          : double.parse(json['zonePrice'].toString()),
      assignedToName: json['assignedToName'] as String?,
    );
  }

  TicketModel copyWith({String? assignedToName}) {
    return TicketModel(
      id: id,
      zoneId: zoneId,
      orderId: orderId,
      qrToken: qrToken,
      scannedAt: scannedAt,
      eventId: eventId,
      zoneName: zoneName,
      zonePrice: zonePrice,
      assignedToName: assignedToName ?? this.assignedToName,
    );
  }
}
