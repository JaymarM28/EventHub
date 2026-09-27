import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import 'access_repository.dart';
import 'scan_result.dart';

/// Escaneo de acceso (paso 9c). Sigue DESIGN_SYSTEM.md §12: feedback
/// inmediato al detectar un código (vibración + color de borde, en el
/// mismo frame), sin esperar la respuesta síncrona de access-service —
/// nunca dejar el escáner "congelado" mientras se espera la red.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _busy = false;
  ScanResult? _result;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy || capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null) return;

    final accessRepository = context.read<AccessRepository>();
    HapticFeedback.mediumImpact();
    setState(() {
      _busy = true;
      _result = null;
    });
    await _controller.stop();

    final result = await accessRepository.scan(code);
    if (!mounted) return;
    if (result.status == ScanStatus.valid) {
      HapticFeedback.heavyImpact();
    }
    setState(() => _result = result);
  }

  Future<void> _scanNext() async {
    setState(() {
      _busy = false;
      _result = null;
    });
    await _controller.start();
  }

  Color _borderColor() {
    if (_result == null) return _busy ? AppColors.inkSoft : Colors.white;
    switch (_result!.status) {
      case ScanStatus.valid:
        return AppColors.success;
      case ScanStatus.alreadyUsed:
        return AppColors.warning;
      case ScanStatus.invalid:
      case ScanStatus.error:
        return AppColors.error;
      case ScanStatus.degraded:
        return AppColors.inkSoft;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: _borderColor(), width: 4),
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topLeft,
              child: IconButton(
                icon: const Icon(Icons.close_rounded, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ),
          if (_result != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                child: _ResultPanel(result: _result!, onScanNext: _scanNext),
              ),
            )
          else if (_busy)
            const Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                child: Padding(
                  padding: EdgeInsets.only(bottom: 32),
                  child: SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ResultPanel extends StatelessWidget {
  const _ResultPanel({required this.result, required this.onScanNext});

  final ScanResult result;
  final VoidCallback onScanNext;

  @override
  Widget build(BuildContext context) {
    final (color, icon, title) = switch (result.status) {
      ScanStatus.valid => (
        AppColors.success,
        Icons.check_circle_rounded,
        'Boleto válido',
      ),
      ScanStatus.alreadyUsed => (
        AppColors.warning,
        Icons.error_rounded,
        'Ya utilizado',
      ),
      ScanStatus.invalid => (
        AppColors.error,
        Icons.cancel_rounded,
        'Boleto inválido',
      ),
      ScanStatus.degraded => (
        AppColors.inkSoft,
        Icons.wifi_off_rounded,
        'No se pudo verificar',
      ),
      ScanStatus.error => (
        AppColors.error,
        Icons.cancel_rounded,
        'Error de conexión',
      ),
    };

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ],
          ),
          if (result.message != null) ...[
            const SizedBox(height: 8),
            Text(
              result.message!,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: onScanNext,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accent,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text('Escanear siguiente'),
          ),
        ],
      ),
    );
  }
}
