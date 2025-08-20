import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';
import 'package:trackzyn/app/dependencies/providers/activities_usecases_providers.dart';
import 'package:trackzyn/app/dependencies/providers/projects_usecases_providers.dart';
import 'package:trackzyn/app/dependencies/providers/tasks_usecases_providers.dart';

import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/repositories/local/local_activities_repository.dart';
import 'package:trackzyn/data/repositories/local/local_projects_repository.dart';
import 'package:trackzyn/data/repositories/local/local_tasks_repository.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/data/services/csv_service.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/use_cases/add_activity_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_project_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_task_usecase.dart';
import 'package:trackzyn/domain/use_cases/export_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_task_activity_group_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_tasks_usecase.dart';
import 'package:trackzyn/ui/agenda/agenda_viewmodel.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';

List<SingleChildWidget> get servicesProviders {
  return [
    Provider<LocalDatabaseService>(create: (context) => LocalDatabaseService()),
    Provider<CsvService>(create: (context) => CsvService()),
    RepositoryProvider<ActivitiesRepository>(
      create:
          (context) => LocalActivitiesRepository(
            localDatabaseService: context.read<LocalDatabaseService>(),
          ),
    ),
    RepositoryProvider<TasksRepository>(
      create:
          (context) => LocalTasksRepository(
            localDatabaseService: context.read<LocalDatabaseService>(),
          ),
    ),
    RepositoryProvider<ProjectsRepository>(
      create:
          (context) => LocalProjectsRepository(
            localDatabaseService: context.read<LocalDatabaseService>(),
          ),
    ),
  ];
}

List<SingleChildWidget> get useCasesProviders {
  return [
    ...activitiesUseCasesProviders,
    ...projectsUseCasesProviders,
    ...tasksUseCasesProviders,
  ];
}

List<SingleChildWidget> get providersLocal {
  return [
    ...servicesProviders,
    ...useCasesProviders,
    BlocProvider<RecordCubit>(
      create:
          (context) => RecordCubit(
            context.read<AddActivityUseCase>(),
            context.read<GetActivitiesUseCase>(),
            context.read<AddProjectUseCase>(),
            context.read<GetProjectsUseCase>(),
            context.read<GetTasksUseCase>(),
            context.read<AddTaskUseCase>(),
            context.read<GetTaskActivityGroupUseCase>(),
            context.read<ExportActivitiesUseCase>(),
          ),
    ),
    BlocProvider<AgendaViewModel>(
      create:
          (context) => AgendaViewModel(context.read<GetActivitiesUseCase>()),
    ),
  ];
}
