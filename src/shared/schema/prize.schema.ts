import { z } from 'zod'

export const prizeSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageAssetId: z.string().optional(),
  /** Probability [0,1] that landing a prize slot for this prize actually wins it. */
  winChance: z.number().min(0).max(1).default(1),
  /** Optional finite stock; undefined = unlimited. */
  stock: z.number().int().nonnegative().optional(),
  note: z.string().optional()
})
export type Prize = z.infer<typeof prizeSchema>
