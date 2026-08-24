import { pgTable, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { job } from './app'

export type SkillPriority = 'mandatory' | 'preferred' | 'optional'

export interface SkillMatrixItem {
  id: string
  skill: string
  priority: SkillPriority
  rationale?: string
}

export interface SkillMatrixClassification {
  id: string
  name: string
  skills: SkillMatrixItem[]
}

export interface SkillMatrixPayload {
  classifications: SkillMatrixClassification[]
}

/** One working matrix per job plus the last approved baseline for change detection. */
export const jobSkillMatrix = pgTable('job_skill_matrix', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  matrix: jsonb('matrix').$type<SkillMatrixPayload>().notNull(),
  approvedMatrix: jsonb('approved_matrix').$type<SkillMatrixPayload>(),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('job_skill_matrix_job_idx').on(t.jobId),
  index('job_skill_matrix_org_idx').on(t.organizationId),
]))
