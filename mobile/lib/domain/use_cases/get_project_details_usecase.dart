import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/domain/models/project.dart';

class GetProjectDetailsUseCase {
  final ProjectsRepository _projectsRepository;

  GetProjectDetailsUseCase(ProjectsRepository tasksRepository)
    : _projectsRepository = tasksRepository;

  Future<Project?> execute(int projectId) async {
    try {
      return await _projectsRepository.getById(projectId);
    } catch (e) {
      debugPrint('Erro ao buscar detalhes do projeto: $e');
      return null;
    }
  }
}
