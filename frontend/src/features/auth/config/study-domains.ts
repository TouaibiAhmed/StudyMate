export type StudyDomain = {
  label: string
  fields: string[]
}

export const studyDomains: StudyDomain[] = [
  { label: 'Computer Science & IT', fields: ['AI', 'Data Science', 'Software Engineering', 'Cybersecurity', 'Networks'] },
  { label: 'Engineering', fields: ['Electrical', 'Mechanical', 'Civil', 'Industrial'] },
  { label: 'Business', fields: ['Finance', 'Marketing', 'Management', 'Economics'] },
  { label: 'Health & Medicine', fields: ['Medicine', 'Biology', 'Pharmacy'] },
  { label: 'Humanities & Social Sciences', fields: ['Psychology', 'History', 'Sociology'] },
  { label: 'Other', fields: [] },
]

export const academicLevels = ["Bachelor's", "Master's", 'Engineering', 'PhD', 'Other']

