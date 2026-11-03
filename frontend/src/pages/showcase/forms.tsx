import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MonthPicker } from '@/components/ui/monthpicker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { MonthStepper } from '@/components/month-stepper'
import { useDateLocale } from '@/hooks/use-display-locale'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { localDateString } from '@/lib/date-utils'
import { Caption, ShowcaseSection, Specimen, SpecimenGrid } from './layout'

const projectSchema = z.object({
  name: z.string().min(3, 'At least 3 characters'),
  email: z.email('Enter a valid email'),
  visibility: z.enum(['private', 'team', 'public']),
  seats: z.number({ error: 'Enter a number' }).int().min(1, 'At least 1').max(50, 'At most 50'),
  notify: z.boolean(),
})
type ProjectForm = z.infer<typeof projectSchema>

function ProjectFormDemo() {
  const form = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: '', email: '', visibility: 'team', seats: 5, notify: true },
  })

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => toast.success('Valid form', { description: JSON.stringify(values) }))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project name</FormLabel>
                <FormControl><Input placeholder="Apollo" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner email</FormLabel>
                <FormControl><Input type="email" placeholder="owner@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="seats"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Seats</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormDescription>Between 1 and 50.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notify"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
              <div>
                <FormLabel>Notify members</FormLabel>
                <FormDescription>Send an email when the project is created.</FormDescription>
              </div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit">Create project</Button>
          <Button type="button" variant="ghost" onClick={() => form.reset()}>Reset</Button>
        </div>
      </form>
    </Form>
  )
}

export function FormsSection() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const today = localDateString()
  const [date, setDate] = useState(today)
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(new Date())
  const [range, setRange] = useState({ from: '', to: '' })
  const [month, setMonth] = useState<Date>(new Date())
  const [yearMonth, setYearMonth] = useState(today.slice(0, 7))

  return (
    <ShowcaseSection id="forms" title={t('showcase.forms.title')} description={t('showcase.forms.description')}>
      <SpecimenGrid>
        <Specimen name="Form (react-hook-form + zod)" importFrom="@/components/ui/form" wide>
          <ProjectFormDemo />
        </Specimen>
        <Specimen name="Calendar" importFrom="@/components/ui/calendar">
          <Calendar
            mode="single"
            selected={calendarDate}
            onSelect={setCalendarDate}
            locale={resolveDateFnsLocale(dateLocale)}
            className="mx-auto"
          />
        </Specimen>
        <Specimen name="Date inputs" importFrom="@/components/ui/date-picker-input">
          <div className="space-y-5">
            <div>
              <Caption>DatePickerInput</Caption>
              <DatePickerInput value={date} onChange={setDate} />
            </div>
            <div>
              <Caption>DateRangePicker</Caption>
              <DateRangePicker
                from={range.from}
                to={range.to}
                onChange={(from, to) => setRange({ from, to })}
                placeholder="Any time"
              />
            </div>
            <div>
              <Caption>MonthStepper</Caption>
              <MonthStepper value={yearMonth} onChange={setYearMonth} locale={dateLocale} prevLabel="Previous month" nextLabel="Next month" />
            </div>
            <div>
              <Caption>MonthPicker</Caption>
              <MonthPicker selectedMonth={month} onMonthSelect={setMonth} locale={resolveDateFnsLocale(dateLocale)} />
            </div>
          </div>
        </Specimen>
      </SpecimenGrid>
    </ShowcaseSection>
  )
}
