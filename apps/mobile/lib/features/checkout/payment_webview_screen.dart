import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/theme/app_theme.dart';

enum PaymentOutcome { success, failure, pending, cancelled }

/// El Widget/Checkout Web de Wompi (Fase D, #20 — antes Mercado Pago) es
/// un flujo de REDIRECCIÓN — no hay SDK de tarjetas embebido, se abre la
/// URL de pago en un WebView y se detecta el regreso mirando a qué URL
/// navega (`/orders/checkout-return/<outcome>`, servida por
/// orders-service, ver OrdersController.checkoutReturn). El pago en sí
/// sigue siendo asíncrono: esto solo dice "el comprador terminó (o
/// abandonó) el checkout", no que el pago ya esté confirmado — eso llega
/// después por el webhook de eventos de Wompi.
class PaymentWebViewScreen extends StatefulWidget {
  const PaymentWebViewScreen({super.key, required this.checkoutUrl});

  final String checkoutUrl;

  @override
  State<PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends State<PaymentWebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
          onNavigationRequest: (request) {
            final outcome = _outcomeFromUrl(request.url);
            if (outcome != null) {
              Navigator.of(context).pop(outcome);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.checkoutUrl));
  }

  PaymentOutcome? _outcomeFromUrl(String url) {
    // OJO: `/orders/checkout-return/wompi` (el `redirect-url` real de
    // Wompi) también contiene el prefijo `/orders/checkout-return/` — si
    // se interceptara ahí, nunca dejaríamos que esa navegación llegue al
    // backend, que es quien decide de verdad entre success/failure/pending
    // (ver OrdersController.wompiCheckoutReturn) y hace un 302 a una de
    // las tres páginas de abajo. Por eso se matchea cada sufijo exacto,
    // nunca el prefijo solo.
    if (url.contains('/orders/checkout-return/success')) return PaymentOutcome.success;
    if (url.contains('/orders/checkout-return/failure')) return PaymentOutcome.failure;
    if (url.contains('/orders/checkout-return/pending')) return PaymentOutcome.pending;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Pagar'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(PaymentOutcome.cancelled),
        ),
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading)
            const Center(
              child: CircularProgressIndicator(color: AppColors.accent),
            ),
        ],
      ),
    );
  }
}
