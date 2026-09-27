import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import 'favorites_state.dart';

class FavoriteButton extends StatelessWidget {
  const FavoriteButton({super.key, required this.eventId, this.dark = false});

  final String eventId;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final favorites = context.watch<FavoritesState>();
    final isFavorite = favorites.isFavorite(eventId);
    return GestureDetector(
      onTap: () => context.read<FavoritesState>().toggle(eventId),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: dark
              ? Colors.black.withValues(alpha: 0.25)
              : AppColors.background.withValues(alpha: 0.6),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(
          isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          size: 17,
          color: isFavorite
              ? AppColors.error
              : (dark ? Colors.white : AppColors.inkSoft),
        ),
      ),
    );
  }
}
