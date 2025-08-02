import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'package:trackzyn/ui/record/record_view.dart';
import 'package:trackzyn/ui/resources/theme_manager.dart';

class AppWidget extends StatefulWidget {
  const AppWidget({super.key});

  @override
  State<AppWidget> createState() => _AppWidgetState();
}

class _AppWidgetState extends State<AppWidget> {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Trackzyn',
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en', 'US'),
        Locale('pt', 'BR'),
        Locale('es', 'ES'),
      ],
      theme: buildTheme(),
      home: RecordView(),
    );
  }
}
