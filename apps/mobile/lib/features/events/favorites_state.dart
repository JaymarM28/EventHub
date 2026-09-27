import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Favoritos (DESIGN.md #39) — guardados solo en el dispositivo, sin
/// backend todavía. Se resuelve como una preferencia local del viewer, no
/// como un dato de negocio: no hace falta verlos desde otro dispositivo
/// para que la feature tenga valor.
class FavoritesState extends ChangeNotifier {
  static const _prefsKey = 'favorite_event_ids';

  final Set<String> _favoriteIds = {};
  bool _loaded = false;

  bool isFavorite(String eventId) => _favoriteIds.contains(eventId);

  Future<void> load() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    _favoriteIds.addAll(prefs.getStringList(_prefsKey) ?? []);
    _loaded = true;
    notifyListeners();
  }

  Future<void> toggle(String eventId) async {
    if (!_favoriteIds.add(eventId)) {
      _favoriteIds.remove(eventId);
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_prefsKey, _favoriteIds.toList());
  }
}
