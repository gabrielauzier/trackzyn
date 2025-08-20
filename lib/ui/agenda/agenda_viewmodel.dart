import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/ui/agenda/agenda_state.dart';
import 'package:trackzyn/ui/utils/get_date_truncate.dart';

class AgendaViewModel extends Cubit<AgendaState> {
  AgendaViewModel(GetActivitiesUseCase getActivitiesUseCase)
    : _getActivitiesUseCase = getActivitiesUseCase,
      super(AgendaState.initial());

  final GetActivitiesUseCase _getActivitiesUseCase;

  Future<void> loadActivities({DateTime? selectedDay}) async {
    try {
      selectedDay ??= DateTime.now();

      final date = getDateTruncate(selectedDay);

      final activities = await _getActivitiesUseCase.execute(
        date: date,
        searchAll: true,
      );
      emit(state.copyWith(selectedDay: selectedDay, activities: activities));
    } catch (e) {
      // Handle error, e.g., show a snackbar or log the error
      debugPrint('Error loading activities: $e');
    }
  }
}
