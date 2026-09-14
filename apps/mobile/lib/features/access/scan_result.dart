enum ScanStatus { valid, alreadyUsed, invalid, degraded, error }

/// Espejo de `ScanOutcome` en access-service (scans.service.ts) — el
/// backend ya modela `DEGRADED` como un cuarto estado explícito distinto
/// de "válido"/"inválido" (ver TODOS.md #3), así que el cliente no debe
/// colapsarlo en un genérico "error".
class ScanResult {
  ScanResult({required this.status, this.message, this.scannedAt});

  final ScanStatus status;
  final String? message;
  final DateTime? scannedAt;

  factory ScanResult.fromJson(Map<String, dynamic> json) {
    switch (json['status'] as String?) {
      case 'VALID':
        return ScanResult(status: ScanStatus.valid);
      case 'ALREADY_USED':
        return ScanResult(
          status: ScanStatus.alreadyUsed,
          message: json['message'] as String?,
          scannedAt: json['scannedAt'] == null ? null : DateTime.parse(json['scannedAt'] as String),
        );
      case 'INVALID':
        return ScanResult(status: ScanStatus.invalid, message: json['message'] as String?);
      case 'DEGRADED':
        return ScanResult(status: ScanStatus.degraded, message: json['message'] as String?);
      default:
        return ScanResult.error('Respuesta inesperada del servidor');
    }
  }

  factory ScanResult.error([String? message]) =>
      ScanResult(status: ScanStatus.error, message: message ?? 'No se pudo conectar con el servidor');
}
