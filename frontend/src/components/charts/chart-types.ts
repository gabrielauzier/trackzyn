export interface ChartSeries {
  /** Field in each data row holding this series' value. */
  key: string
  /** Human label shown in the legend and the tooltip. */
  label: string
  /** Override the slot colour (e.g. to pin an entity to its colour). */
  color?: string
}

export type ValueFormatter = (value: number) => string
