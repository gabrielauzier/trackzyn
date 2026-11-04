import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/page-header'
import { useWorkspace } from '@/contexts/workspace-context'

/** `/agenda`: the logged-in user's own sessions of the week. */
export default function AgendaPage() {
  const { t } = useTranslation()
  const { current } = useWorkspace()
  return <PageHeader section={current?.name ?? ''} title={t('nav.agenda')} />
}
