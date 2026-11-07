import 'package:flutter_test/flutter_test.dart';
import 'package:trackzyn/domain/models/task.dart';

void main() {
  group('Task.fromMap: the schedule (D4)', () {
    test('reads an answer without the schedule fields as a task that is not scheduled', () {
      final task = Task.fromMap({'id': 1, 'name': 'Write the report'});

      expect(task.name, 'Write the report');
      expect(task.scheduledOn, isNull);
      expect(task.scheduledTime, isNull);
      expect(task.series, isNull);
    });

    test('reads null schedule fields as a task that is not scheduled', () {
      final task = Task.fromMap({
        'id': 1,
        'name': 'Write the report',
        'scheduled_on': null,
        'scheduled_time': null,
        'series': null,
      });

      expect(task.scheduledOn, isNull);
      expect(task.scheduledTime, isNull);
      expect(task.series, isNull);
    });

    test('reads the day, the time and the series with its rule and next day', () {
      final task = Task.fromMap({
        'id': 1,
        'name': 'Weekly review',
        'scheduled_on': '2026-11-13',
        'scheduled_time': '14:00',
        'series': {
          'id': '7f1c2a9e-0000-4000-8000-000000000001',
          'rule': {
            'freq': 'weekly',
            'interval': 2,
            'weekdays': [1, 3],
            'month_day': null,
            'until': null,
            'count': 5,
          },
          'next_on': '2026-11-16',
        },
      });

      expect(task.scheduledOn, '2026-11-13');
      expect(task.scheduledTime, '14:00');
      expect(
        task.series,
        const TaskSeries(
          id: '7f1c2a9e-0000-4000-8000-000000000001',
          freq: 'weekly',
          interval: 2,
          weekdays: [1, 3],
          count: 5,
          nextOn: '2026-11-16',
        ),
      );
    });

    test('reads a day without a time and a monthly series that has ended', () {
      final task = Task.fromMap({
        'id': 2,
        'name': 'Pay the rent',
        'scheduled_on': '2026-11-30',
        'scheduled_time': null,
        'series': {
          'id': 's2',
          'rule': {
            'freq': 'monthly',
            'interval': 1,
            'weekdays': null,
            'month_day': 31,
            'until': '2027-06-30',
            'count': null,
          },
          'next_on': null,
        },
      });

      expect(task.scheduledOn, '2026-11-30');
      expect(task.scheduledTime, isNull);
      expect(task.series!.freq, 'monthly');
      expect(task.series!.monthDay, 31);
      expect(task.series!.weekdays, isNull);
      expect(task.series!.until, '2027-06-30');
      expect(task.series!.nextOn, isNull);
    });
  });
}
