package dev.eventhub.mobile

import io.flutter.embedding.android.FlutterFragmentActivity

// local_auth (Face ID/Touch ID, DESIGN.md #32) exige FlutterFragmentActivity
// en vez de FlutterActivity en Android — el prompt biométrico nativo se
// muestra como un DialogFragment, que necesita un FragmentActivity de host.
class MainActivity : FlutterFragmentActivity()
