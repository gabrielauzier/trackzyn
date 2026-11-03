import type { LucideIcon } from 'lucide-react'
import {
  Archive, Bell, BookOpen, Box, Briefcase, Building2, Calendar, Camera,
  ChartBar, CircleHelp, Cloud, Code, Coffee, Compass, Cpu, Database,
  FileText, Flag, Folder, Gift, Globe, GraduationCap, Hammer, Heart, House,
  Image, Inbox, Layers, Leaf, Lightbulb, Lock, Mail, Map, MessageSquare,
  Music, Package, Palette, PenTool, Plane, Rocket, Server, Settings, Shield,
  ShoppingBag, Smartphone, Sparkles, Star, Target, Terminal, Users, Wrench,
  Zap,
} from 'lucide-react'

export interface IconEntry {
  name: string // Lucide icon name (what gets stored in the DB)
  label: string // Searchable label, also used as the tooltip
  icon: LucideIcon
}

/**
 * The curated icon set offered by the IconPicker. Stored by name so the DB
 * never depends on a component reference; add entries freely, but never
 * rename an existing `name` — rows that saved it would fall back to "?".
 */
export const ICON_REGISTRY: IconEntry[] = [
  // Work & organisation
  { name: 'briefcase', label: 'Briefcase / Work', icon: Briefcase },
  { name: 'building-2', label: 'Company / Office', icon: Building2 },
  { name: 'users', label: 'Team / People', icon: Users },
  { name: 'target', label: 'Goal / Target', icon: Target },
  { name: 'flag', label: 'Milestone / Flag', icon: Flag },
  { name: 'calendar', label: 'Calendar / Schedule', icon: Calendar },
  { name: 'inbox', label: 'Inbox', icon: Inbox },
  { name: 'mail', label: 'Mail', icon: Mail },
  { name: 'message-square', label: 'Chat / Messages', icon: MessageSquare },
  { name: 'bell', label: 'Notifications', icon: Bell },
  // Content
  { name: 'file-text', label: 'Document', icon: FileText },
  { name: 'folder', label: 'Folder', icon: Folder },
  { name: 'archive', label: 'Archive', icon: Archive },
  { name: 'book-open', label: 'Docs / Reading', icon: BookOpen },
  { name: 'image', label: 'Image / Media', icon: Image },
  { name: 'camera', label: 'Camera / Photo', icon: Camera },
  { name: 'music', label: 'Music / Audio', icon: Music },
  { name: 'pen-tool', label: 'Design / Pen', icon: PenTool },
  { name: 'palette', label: 'Palette / Brand', icon: Palette },
  // Tech
  { name: 'code', label: 'Code', icon: Code },
  { name: 'terminal', label: 'Terminal / CLI', icon: Terminal },
  { name: 'server', label: 'Server', icon: Server },
  { name: 'database', label: 'Database', icon: Database },
  { name: 'cloud', label: 'Cloud', icon: Cloud },
  { name: 'cpu', label: 'Hardware / CPU', icon: Cpu },
  { name: 'smartphone', label: 'Mobile', icon: Smartphone },
  { name: 'layers', label: 'Layers / Stack', icon: Layers },
  { name: 'box', label: 'Box / Module', icon: Box },
  { name: 'package', label: 'Package / Release', icon: Package },
  { name: 'settings', label: 'Settings', icon: Settings },
  { name: 'wrench', label: 'Tools / Maintenance', icon: Wrench },
  { name: 'hammer', label: 'Build', icon: Hammer },
  { name: 'shield', label: 'Security', icon: Shield },
  { name: 'lock', label: 'Private / Lock', icon: Lock },
  { name: 'chart-bar', label: 'Analytics / Chart', icon: ChartBar },
  // Misc
  { name: 'house', label: 'Home', icon: House },
  { name: 'globe', label: 'Global / Web', icon: Globe },
  { name: 'map', label: 'Map', icon: Map },
  { name: 'compass', label: 'Explore', icon: Compass },
  { name: 'plane', label: 'Travel', icon: Plane },
  { name: 'rocket', label: 'Launch / Rocket', icon: Rocket },
  { name: 'zap', label: 'Lightning / Fast', icon: Zap },
  { name: 'lightbulb', label: 'Idea', icon: Lightbulb },
  { name: 'sparkles', label: 'Special / AI', icon: Sparkles },
  { name: 'star', label: 'Favorite / Star', icon: Star },
  { name: 'heart', label: 'Heart / Health', icon: Heart },
  { name: 'gift', label: 'Gift', icon: Gift },
  { name: 'shopping-bag', label: 'Shop', icon: ShoppingBag },
  { name: 'graduation-cap', label: 'Education', icon: GraduationCap },
  { name: 'coffee', label: 'Coffee / Break', icon: Coffee },
  { name: 'leaf', label: 'Nature / Green', icon: Leaf },
  { name: 'circle-help', label: 'Other / Unknown', icon: CircleHelp },
]

// O(1) lookup map: icon-name → LucideIcon component
export const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_REGISTRY.map((entry) => [entry.name, entry.icon])
)

// Check if a string is an emoji (an icon value may also be a single emoji)
export function isEmoji(str: string): boolean {
  // Emoji strings are typically 1-2 characters with high code points
  return str.length <= 2 && /\p{Emoji}/u.test(str)
}
