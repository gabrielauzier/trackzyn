import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/single_child_widget.dart';
import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/use_cases/add_activity_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_task_activity_group_usecase.dart';

List<SingleChildWidget> get activitiesUseCasesProviders {
  return [
    RepositoryProvider<AddActivityUseCase>(
      create:
          (context) => AddActivityUseCase(
            context.read<ActivitiesRepository>(),
            context.read<TasksRepository>(),
          ),
    ),
    RepositoryProvider<GetActivitiesUseCase>(
      create:
          (context) =>
              GetActivitiesUseCase(context.read<ActivitiesRepository>()),
    ),
    RepositoryProvider<GetTaskActivityGroupUseCase>(
      create:
          (context) =>
              GetTaskActivityGroupUseCase(context.read<ActivitiesRepository>()),
    ),
  ];
}
