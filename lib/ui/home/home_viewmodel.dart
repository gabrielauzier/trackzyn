import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';
import 'package:trackzyn/ui/home/home_state.dart';

class HomeViewModel extends Cubit<HomeState> {
  HomeViewModel(GetProjectsUseCase getProjectsUseCase)
    : _getProjectsUseCase = getProjectsUseCase,
      super(HomeState());

  final GetProjectsUseCase _getProjectsUseCase;

  Future<void> loadProjects() async {
    final projects = await _getProjectsUseCase.execute();

    debugPrint('Loaded ${projects.length} projects');

    emit(state.copyWith(projects: projects));
  }
}
