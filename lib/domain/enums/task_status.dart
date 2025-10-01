class TaskStatus {
  static const String notStarted = 'not_started';
  static const String inProgress = 'in_progress';
  static const String inReview = 'in_review';
  static const String completed = 'completed';

  static String presenter(String status) {
    switch (status) {
      case TaskStatus.notStarted:
        return 'Not Started';
      case TaskStatus.inProgress:
        return 'In Progress';
      case TaskStatus.inReview:
        return 'In Review';
      case TaskStatus.completed:
        return 'Completed';
      default:
        return 'Unknown';
    }
  }
}
