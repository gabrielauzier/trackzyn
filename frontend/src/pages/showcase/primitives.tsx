import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Bell, ChevronDown, Copy, LogOut, Mail, Plus, Settings, Trash2, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Caption, ShowcaseSection, Specimen, SpecimenGrid } from './layout'
import { sampleRows } from './mock-data'

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  pending: 'secondary',
  overdue: 'destructive',
  draft: 'outline',
}

export function PrimitivesSection() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState(true)
  const [compact, setCompact] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  return (
    <ShowcaseSection id="primitives" title={t('showcase.primitives.title')} description={t('showcase.primitives.description')}>
      <SpecimenGrid>
        <Specimen name="Button" importFrom="@/components/ui/button" wide>
          <Caption>variant</Caption>
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive"><Trash2 /> Destructive</Button>
          </div>
          <Caption>size &amp; state</Caption>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add"><Plus /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Settings"><Settings /></Button>
            <Button disabled>Disabled</Button>
          </div>
        </Specimen>

        <Specimen name="Badge" importFrom="@/components/ui/badge">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="secondary"><Bell /> With icon</Badge>
          </div>
        </Specimen>

        <Specimen name="Avatar" importFrom="@/components/ui/avatar">
          <div className="flex items-center gap-4">
            <Avatar><AvatarFallback>AL</AvatarFallback></Avatar>
            <Avatar className="size-10"><AvatarFallback className="bg-primary/10 text-primary">GH</AvatarFallback></Avatar>
            <AvatarGroup>
              <Avatar><AvatarFallback>AB</AvatarFallback></Avatar>
              <Avatar><AvatarFallback>CD</AvatarFallback></Avatar>
              <Avatar><AvatarFallback>EF</AvatarFallback></Avatar>
              <AvatarGroupCount>+4</AvatarGroupCount>
            </AvatarGroup>
          </div>
        </Specimen>

        <Specimen name="Card" importFrom="@/components/ui/card">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Team plan</CardTitle>
              <CardDescription>Up to 10 members, shared workspaces.</CardDescription>
              <CardAction><Badge variant="secondary">Current</Badge></CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Upgrade</Button>
              <Button size="sm" variant="ghost">Compare plans</Button>
            </CardFooter>
          </Card>
        </Specimen>

        <Specimen name="Input · Label · Switch" importFrom="@/components/ui/input">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sc-email">Email</Label>
              <Input id="sc-email" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-disabled">Disabled</Label>
              <Input id="sc-disabled" disabled value="Read-only value" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-invalid">Invalid</Label>
              <Input id="sc-invalid" aria-invalid defaultValue="not-an-email" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sc-notifications">Email notifications</Label>
              <Switch id="sc-notifications" checked={notifications} onCheckedChange={setNotifications} />
            </div>
          </div>
        </Specimen>

        <Specimen name="Select" importFrom="@/components/ui/select">
          <Select defaultValue="editor">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a role" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Workspace role</SelectLabel>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Separator className="my-4" />
          <Caption>Separator</Caption>
          <div className="flex h-5 items-center gap-3 text-sm">
            <span>Docs</span>
            <Separator orientation="vertical" />
            <span>API</span>
            <Separator orientation="vertical" />
            <span>Changelog</span>
          </div>
        </Specimen>

        <Specimen name="Tabs" importFrom="@/components/ui/tabs">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">Overview content.</TabsContent>
            <TabsContent value="activity" className="pt-3 text-sm text-muted-foreground">Recent activity.</TabsContent>
            <TabsContent value="settings" className="pt-3 text-sm text-muted-foreground">Settings panel.</TabsContent>
          </Tabs>
        </Specimen>

        <Specimen name="Skeleton" importFrom="@/components/ui/skeleton">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-24 w-full" />
        </Specimen>

        <Specimen name="Dialog" importFrom="@/components/ui/dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite a teammate</DialogTitle>
                <DialogDescription>They will get access to this workspace as an editor.</DialogDescription>
              </DialogHeader>
              <Input placeholder="teammate@example.com" />
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <DialogClose asChild><Button onClick={() => toast.success('Invite sent')}>Send invite</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Specimen>

        <Specimen name="Dropdown menu" importFrom="@/components/ui/dropdown-menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Account <ChevronDown /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>My account</DropdownMenuLabel>
              <DropdownMenuItem><User /> Profile <DropdownMenuShortcut>⌘P</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem><Mail /> Messages</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={compact} onCheckedChange={(v) => setCompact(!!v)}>Compact mode</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)}>Show archived</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive"><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Specimen>

        <Specimen name="Popover · Tooltip" importFrom="@/components/ui/popover">
          <div className="flex flex-wrap gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Open popover</Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-sm">
                <p className="font-medium">Popover</p>
                <p className="mt-1 text-muted-foreground">Rich content anchored to a trigger. Closes on outside click.</p>
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Copy"><Copy /></Button>
              </TooltipTrigger>
              <TooltipContent>Copy to clipboard</TooltipContent>
            </Tooltip>
          </div>
        </Specimen>

        <Specimen name="Toast" importFrom="sonner">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast('Settings saved')}>Default</Button>
            <Button variant="outline" onClick={() => toast.success('File uploaded')}>Success</Button>
            <Button variant="outline" onClick={() => toast.error('Something went wrong')}>Error</Button>
            <Button
              variant="outline"
              onClick={() => toast('Item archived', { action: { label: 'Undo', onClick: () => toast('Restored') } })}
            >
              With action
            </Button>
          </div>
        </Specimen>

        <Specimen name="Command (combobox)" importFrom="@/components/ui/command">
          {/* cmdk scrolls its first item into view on mount, so the demo
              mounts inside a popover — the way a combobox uses it anyway. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                Run a command… <ChevronDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Type a command…" />
                <CommandList className="max-h-56">
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup heading="Suggestions">
                    <CommandItem onSelect={() => toast('New project')}><Plus /> New project</CommandItem>
                    <CommandItem onSelect={() => toast('Invite teammate')}><Mail /> Invite teammate</CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Settings">
                    <CommandItem onSelect={() => toast('Profile')}><User /> Profile</CommandItem>
                    <CommandItem onSelect={() => toast('Preferences')}><Settings /> Preferences</CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="mt-2 text-xs text-muted-foreground">The app-wide palette opens with ⌘K / Ctrl K.</p>
        </Specimen>

        <Specimen name="Table" importFrom="@/components/ui/table" wide>
          <Table>
            <TableCaption>Recent invoices (sample data).</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell>{row.customer}</TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[row.status]} className="capitalize">{row.status}</Badge></TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{row.date}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Specimen>
      </SpecimenGrid>
    </ShowcaseSection>
  )
}
