import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/app_router.dart';
import 'package:mobile/core/api_client.dart';
import 'package:mobile/core/auth_state.dart';
import 'package:mobile/core/token_storage.dart';
import 'package:mobile/features/access/access_repository.dart';
import 'package:mobile/features/auth/auth_repository.dart';
import 'package:mobile/features/checkout/orders_repository.dart';
import 'package:mobile/features/events/events_repository.dart';
import 'package:mobile/features/events/favorites_state.dart';
import 'package:mobile/features/tickets/tickets_repository.dart';
import 'package:mobile/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// TokenStorage real usa flutter_secure_storage (canal de plataforma), que
/// en un widget test SIN binding nativo real no lanza excepción — se queda
/// esperando una respuesta que nunca llega. El interceptor de ApiClient lee
/// el token en CADA request, así que sin este fake el test se cuelga en
/// "loading" para siempre (visto en vivo: 3 pumps con delay y seguía en
/// CircularProgressIndicator).
class _FakeTokenStorage implements TokenStorage {
  String? _access;
  String? _refresh;

  @override
  Future<String?> get accessToken async => _access;

  @override
  Future<String?> get refreshToken async => _refresh;

  @override
  Future<void> save({
    required String accessToken,
    required String refreshToken,
  }) async {
    _access = accessToken;
    _refresh = refreshToken;
  }

  @override
  Future<void> clear() async {
    _access = null;
    _refresh = null;
  }
}

/// Responde con un evento de prueba a cualquier GET, sin tocar la red — un
/// widget test no debe dejar un socket/timer real pendiente (el binding
/// estricto de Flutter test lo detecta como fuga y falla el test aunque la
/// UI esté bien). Devuelve un evento REAL (no `[]`) para que el test
/// ejercite el render de _EventCard — un array vacío nunca hubiera
/// atrapado el LocaleDataException visto en vivo (DateFormat('es') sin
/// initializeDateFormatting).
class _FakeHttpClientAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final payload = jsonEncode([
      {
        'id': 'event-1',
        'title': 'Evento de prueba',
        'description': 'Descripción de prueba',
        'venue': 'Lugar de prueba',
        'startsAt': '2027-01-01T20:00:00.000Z',
        'zones': [
          {'id': 'zone-1', 'name': 'General', 'price': '50', 'capacity': 100},
        ],
      },
    ]);
    final bytes = Uint8List.fromList(utf8.encode(payload));
    return ResponseBody.fromBytes(
      bytes,
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('es');
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('arranca en /events y renderiza una card de evento real', (
    tester,
  ) async {
    final tokenStorage = _FakeTokenStorage();
    late final AuthState authState;
    final apiClient = ApiClient(
      tokenStorage,
      onSessionExpired: () => authState.forceLogout(),
    );
    apiClient.dio.httpClientAdapter = _FakeHttpClientAdapter();
    final authRepository = AuthRepository(apiClient, tokenStorage);
    authState = AuthState(authRepository);
    final eventsRepository = EventsRepository(apiClient);
    final ordersRepository = OrdersRepository(apiClient);
    final ticketsRepository = TicketsRepository(apiClient);
    final accessRepository = AccessRepository(apiClient);
    final favoritesState = FavoritesState();
    final router = buildRouter(authState);

    await tester.pumpWidget(
      EventHubApp(
        authState: authState,
        eventsRepository: eventsRepository,
        ordersRepository: ordersRepository,
        ticketsRepository: ticketsRepository,
        accessRepository: accessRepository,
        favoritesState: favoritesState,
        router: router,
      ),
    );
    // pumpAndSettle no sirve acá: mientras la carga está pendiente se
    // muestra un CircularProgressIndicator, cuya animación es indeterminada
    // y nunca "se asienta". Un pump con delay alcanza para resolver el
    // Future falso y repintar.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // El único evento de prueba aparece dos veces a propósito: una en el
    // carrusel "Próximos" (DESIGN.md #38) y otra en "Todos los eventos" —
    // no es una card duplicada por error, es la misma UI con dos vistas.
    expect(find.text('Eventos'), findsOneWidget);
    expect(find.text('Evento de prueba'), findsNWidgets(2));
    expect(find.text('Lugar de prueba'), findsNWidgets(2));
  });
}
