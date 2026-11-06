import type { StudyFeedback } from './sessions'

export type LearningRecord = {
  id: string
  sessionId: string
  topic: string
  answer: string
  feedback: StudyFeedback
  completedAt: string
}

export interface LearningRecordService {
  listRecords(): LearningRecord[]
  addRecord(record: LearningRecord): void
}
