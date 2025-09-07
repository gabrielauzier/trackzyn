import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/single_child_widget.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/domain/use_cases/add_project_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_project_details_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';

List<SingleChildWidget> get projectsUseCasesProviders {
  return [
    RepositoryProvider<AddProjectUseCase>(
      create:
          (context) => AddProjectUseCase(
            projectsRepository: context.read<ProjectsRepository>(),
          ),
    ),
    RepositoryProvider<GetProjectsUseCase>(
      create:
          (context) => GetProjectsUseCase(context.read<ProjectsRepository>()),
    ),
    RepositoryProvider<GetProjectDetailsUseCase>(
      create:
          (context) =>
              GetProjectDetailsUseCase(context.read<ProjectsRepository>()),
    ),
  ];
}
