import 'package:flutter/material.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/domain/models/project.dart';

class AddProjectUseCase {
  final ProjectsRepository _projectsRepository;

  AddProjectUseCase({required ProjectsRepository projectsRepository})
    : _projectsRepository = projectsRepository;

  Future<int?> execute(Project project) async {
    try {
      return await _projectsRepository.add(project);
    } catch (e) {
      debugPrint('Erro ao adicionar projeto: $e');
      return null;
    }
  }
}
