import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/single_child_widget.dart';

import 'package:trackzyn/domain/use_cases/add_activity_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_project_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_task_usecase.dart';
import 'package:trackzyn/domain/use_cases/export_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_task_activity_group_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_tasks_usecase.dart';
import 'package:trackzyn/ui/agenda/agenda_viewmodel.dart';
import 'package:trackzyn/ui/home/home_viewmodel.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';

List<SingleChildWidget> get viewModelsProviders {
  return [
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
    BlocProvider<HomeViewModel>(
      create: (context) => HomeViewModel(context.read<GetProjectsUseCase>()),
    ),
  ];
}
