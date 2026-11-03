import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/domain/models/project.dart';

class GetProjectsUseCase {
  final ProjectsRepository _projectsRepository;

  GetProjectsUseCase(ProjectsRepository projectsRepository)
    : _projectsRepository = projectsRepository;

  Future<List<Project>> execute() async {
    try {
      return await _projectsRepository.fetchMany();
    } catch (e) {
      debugPrint('Erro ao buscar projetos: $e');
      return [];
    }
  }
}
