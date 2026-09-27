import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'app_router.dart';
import 'core/api_client.dart';
import 'core/auth_state.dart';
import 'core/theme/app_theme.dart';
import 'core/token_storage.dart';
import 'features/access/access_repository.dart';
import 'features/auth/auth_repository.dart';
import 'features/checkout/orders_repository.dart';
import 'features/events/events_repository.dart';
import 'features/events/favorites_state.dart';
import 'features/tickets/tickets_repository.dart';

Future<void> main() async {
  // DateFormat con locale 'es' (nombres de mes/día en español) lanza
  // LocaleDataException si no se inicializan los datos de esa locale antes
  // de usarla — visto en vivo al renderizar la primera card de evento.
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');

  final tokenStorage = TokenStorage();

  // ApiClient necesita poder forzar un logout ante un refresh fallido, pero
  // AuthState (dueño de forceLogout) depende de AuthRepository, que a su
  // vez depende de ApiClient — ciclo clásico. `late` lo resuelve limpio: el
  // closure captura la VARIABLE `authState`, no su valor en este instante;
  // para cuando de verdad se invoque (un 401 real, después de main()), ya
  // está asignada.
  late final AuthState authState;
  final apiClient = ApiClient(
    tokenStorage,
    onSessionExpired: () => authState.forceLogout(),
  );
  final authRepository = AuthRepository(apiClient, tokenStorage);
  authState = AuthState(authRepository);
  final eventsRepository = EventsRepository(apiClient);
  final ordersRepository = OrdersRepository(apiClient);
  final ticketsRepository = TicketsRepository(apiClient);
  final accessRepository = AccessRepository(apiClient);
  final favoritesState = FavoritesState();
  final router = buildRouter(authState);

  authState.bootstrap();
  favoritesState.load();

  runApp(
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
}

class EventHubApp extends StatelessWidget {
  const EventHubApp({
    super.key,
    required this.authState,
    required this.eventsRepository,
    required this.ordersRepository,
    required this.ticketsRepository,
    required this.accessRepository,
    required this.favoritesState,
    required this.router,
  });

  final AuthState authState;
  final EventsRepository eventsRepository;
  final OrdersRepository ordersRepository;
  final TicketsRepository ticketsRepository;
  final AccessRepository accessRepository;
  final FavoritesState favoritesState;
  final GoRouter router;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authState),
        Provider.value(value: eventsRepository),
        Provider.value(value: ordersRepository),
        Provider.value(value: ticketsRepository),
        Provider.value(value: accessRepository),
        ChangeNotifierProvider.value(value: favoritesState),
      ],
      child: MaterialApp.router(
        title: 'Event Hub',
        theme: AppTheme.dark(),
        routerConfig: router,
        // Necesario para que CupertinoDatePicker (selector de fecha de
        // nacimiento estilo iPhone, register_screen.dart) muestre meses en
        // español en vez del inglés por defecto de Flutter.
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('es')],
        locale: const Locale('es'),
      ),
    );
  }
}
