import type { LearningRecord, LearningRecordService } from '../contracts/learning-records'

const storageKey = 'studymate:learning-records'

export function readLearningRecords(): LearningRecord[] {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) as LearningRecord[] : []
  } catch {
    return []
  }
}

export function appendLearningRecord(record: LearningRecord) {
  const records = readLearningRecords()
  localStorage.setItem(storageKey, JSON.stringify([...records, record]))
}

export const mockLearningRecordService: LearningRecordService = {
  listRecords: readLearningRecords,
  addRecord: appendLearningRecord,
}
