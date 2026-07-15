// Shared label + colour vocabulary. Every status chip in the app reads from
// here so the meaning of a colour never drifts between screens.

export const QR_STATUS = {
  available: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  mapped: { label: 'Mapped', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  inactive: { label: 'Inactive', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  lost: { label: 'Lost', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  replaced: { label: 'Replaced', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
}

export const DEVICE_STATUS = {
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  maintenance: { label: 'Under Maintenance', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  faulty: { label: 'Faulty', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  in_storage: { label: 'In Storage', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  retired: { label: 'Retired', cls: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500' },
}

export const QUERY_STATUS = {
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  closed: { label: 'Closed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
}

export const PRIORITY = {
  low: { label: 'Low', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  high: { label: 'High', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
}

export const CONDITION = {
  excellent: { label: 'Excellent', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  good: { label: 'Good', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  fair: { label: 'Fair', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  poor: { label: 'Poor', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' },
  damaged: { label: 'Damaged', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
}

export const ROLE = {
  admin: { label: 'Admin', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' },
  user: { label: 'User', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  client: { label: 'Client', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' },
}

export const DEVICE_CATEGORIES = [
  'Laptop', 'Desktop', 'Monitor', 'Printer', 'Scanner', 'Server', 'Router',
  'Switch', 'Firewall', 'Projector', 'Mobile Phone', 'Tablet', 'UPS',
  'CCTV Camera', 'Air Conditioner', 'Machinery', 'Medical Equipment',
  'Furniture', 'Vehicle', 'Other',
]

// Colour ramp for charts — ordered for maximum adjacent contrast.
export const CHART_COLORS = [
  '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
]

export const lookup = (map, key, fallback = 'Unknown') =>
  map[key] || { label: key || fallback, cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' }
